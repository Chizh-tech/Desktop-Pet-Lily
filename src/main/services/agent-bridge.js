const http = require("node:http");
const { createLogger } = require("./logger");
const {
  DEFAULT_STATE_REGISTRY,
  getStateMeta,
  normalizeStateRegistry,
  resolveStateId
} = require("../../shared/state-registry");

const logger = createLogger("agent-bridge");

const DEFAULT_PORT = 17890;
const PORT_ATTEMPTS = 10;
const MAX_BODY_BYTES = 8192;
const MAX_TEXT_LENGTH = 160;
const MAX_DETAIL_LENGTH = 400;
const MAX_SOURCE_LENGTH = 60;
const DEFAULT_BUBBLE_MS = 5000;

// 状态白名单来自配置里的注册表，不再写死在代码里。
const AGENT_STATES = Object.keys(DEFAULT_STATE_REGISTRY);
const FALLBACK_REGISTRY = normalizeStateRegistry(DEFAULT_STATE_REGISTRY);

function isLoopback(address) {
  return address === "127.0.0.1" || address === "::1" || address === "::ffff:127.0.0.1";
}

function cleanText(value, maxLength) {
  if (typeof value !== "string") return "";
  return value.replace(/\s+/g, " ").trim().slice(0, maxLength);
}

function normalizePayload(body, registry = FALLBACK_REGISTRY) {
  if (!body || typeof body !== "object" || Array.isArray(body)) {
    return { error: "body must be a JSON object" };
  }

  const stateId = resolveStateId(registry, body.state);
  if (!stateId) {
    return { error: `state must be one of: ${Object.keys(registry).join(", ")}` };
  }

  const meta = getStateMeta(registry, stateId);
  if (meta && meta.enabled === false) {
    return { error: `state "${stateId}" is disabled in config.states` };
  }

  const requestedTtl = Number(body.ttlMs);
  // 没显式给 ttl 时，用注册表里的超时；注册表写 0 表示长驻状态，不清除。
  const defaultTtl = meta && Number.isFinite(meta.ttlMs) ? meta.ttlMs : DEFAULT_BUBBLE_MS;
  const ttlMs = Number.isFinite(requestedTtl) && requestedTtl > 0
    ? Math.min(Math.max(Math.round(requestedTtl), 500), 60 * 60 * 1000)
    : defaultTtl;

  return {
    payload: {
      state: stateId,
      text: cleanText(body.text, MAX_TEXT_LENGTH),
      detail: cleanText(body.detail, MAX_DETAIL_LENGTH),
      source: cleanText(body.source, MAX_SOURCE_LENGTH) || "external",
      ttlMs,
      at: Date.now()
    }
  };
}

function readBody(request) {
  return new Promise((resolve, reject) => {
    let size = 0;
    const chunks = [];
    request.on("data", (chunk) => {
      size += chunk.length;
      if (size > MAX_BODY_BYTES) {
        reject(new Error("body too large"));
        request.destroy();
        return;
      }
      chunks.push(chunk);
    });
    request.on("end", () => resolve(Buffer.concat(chunks).toString("utf8")));
    request.on("error", reject);
  });
}

function respond(response, statusCode, payload) {
  const body = JSON.stringify(payload);
  response.writeHead(statusCode, {
    "Content-Type": "application/json; charset=utf-8",
    "Content-Length": Buffer.byteLength(body),
    "Cache-Control": "no-store"
  });
  response.end(body);
}

/**
 * 本机 HTTP 入口：任何外部程序（hook、脚本、其他 Agent）都可以把状态推给 Lily。
 * 只监听 127.0.0.1，不接受跨机请求。
 */
function createAgentBridge({ getPetWindow, getStates, port = DEFAULT_PORT }) {
  let server = null;
  let boundPort = null;
  let lastPayload = null;

  // 状态表随配置变化，每次请求现取，面板改完立刻生效。
  function readRegistry() {
    try {
      const registry = typeof getStates === "function" ? normalizeStateRegistry(getStates()) : null;
      return registry && Object.keys(registry).length > 0 ? registry : FALLBACK_REGISTRY;
    } catch (error) {
      logger.warn("could not read state registry, using defaults", { error: error.message || error });
      return FALLBACK_REGISTRY;
    }
  }

  function deliver(payload) {
    const petWindow = typeof getPetWindow === "function" ? getPetWindow() : null;
    if (!petWindow || petWindow.isDestroyed()) return false;
    petWindow.webContents.send("pet:agent-state", payload);
    return true;
  }

  async function handle(request, response) {
    if (!isLoopback(request.socket.remoteAddress)) {
      respond(response, 403, { ok: false, error: "loopback only" });
      return;
    }

    const url = new URL(request.url, "http://127.0.0.1");

    if (request.method === "GET" && url.pathname === "/health") {
      const registry = readRegistry();
      respond(response, 200, {
        ok: true,
        port: boundPort,
        states: Object.keys(registry),
        registry,
        last: lastPayload
      });
      return;
    }

    if (request.method !== "POST" || url.pathname !== "/state") {
      respond(response, 404, { ok: false, error: "POST /state or GET /health" });
      return;
    }

    let raw = "";
    try {
      raw = await readBody(request);
    } catch (error) {
      respond(response, 413, { ok: false, error: error.message });
      return;
    }

    let body = {};
    if (raw.trim()) {
      try {
        body = JSON.parse(raw);
      } catch {
        respond(response, 400, { ok: false, error: "invalid JSON body" });
        return;
      }
    }

    const registry = readRegistry();
    const { payload, error } = normalizePayload(body, registry);
    if (error) {
      respond(response, 400, { ok: false, error });
      return;
    }

    lastPayload = payload;
    const delivered = deliver(payload);
    logger.info("agent state received", {
      state: payload.state,
      source: payload.source,
      textLength: payload.text.length,
      delivered
    });
    respond(response, 200, { ok: true, delivered, state: payload.state });
  }

  function listenOn(candidatePort, remainingAttempts) {
    return new Promise((resolve, reject) => {
      const candidate = http.createServer((request, response) => {
        handle(request, response).catch((error) => {
          logger.error("agent bridge request failed", error);
          if (!response.headersSent) respond(response, 500, { ok: false, error: "internal error" });
        });
      });

      candidate.once("error", (error) => {
        if (error.code === "EADDRINUSE" && remainingAttempts > 1) {
          logger.warn("agent bridge port busy, trying next", { port: candidatePort });
          resolve(listenOn(candidatePort + 1, remainingAttempts - 1));
          return;
        }
        reject(error);
      });

      candidate.listen(candidatePort, "127.0.0.1", () => {
        // port 0 时由系统分配，必须回读实际端口。
        boundPort = candidate.address().port;
        logger.info("agent bridge listening", { origin: `http://127.0.0.1:${boundPort}` });
        resolve(candidate);
      });
    });
  }

  return {
    async start() {
      if (server) return { origin: `http://127.0.0.1:${boundPort}` };
      server = await listenOn(port, PORT_ATTEMPTS);
      return { origin: `http://127.0.0.1:${boundPort}` };
    },
    get origin() {
      return boundPort ? `http://127.0.0.1:${boundPort}` : null;
    },
    push(payload) {
      return deliver(payload);
    },
    close() {
      if (!server) return Promise.resolve();
      const closing = server;
      server = null;
      boundPort = null;
      return new Promise((resolve) => closing.close(() => resolve()));
    }
  };
}

module.exports = {
  createAgentBridge,
  DEFAULT_AGENT_BRIDGE_PORT: DEFAULT_PORT,
  AGENT_STATES,
  normalizeAgentStatePayload: normalizePayload
};
