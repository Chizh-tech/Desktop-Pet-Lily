#!/usr/bin/env node
/**
 * 把工作状态推给 Lily 桌宠的最小客户端。
 *
 * 用法：
 *   node tools/lily-state.mjs thinking "正在读代码…"
 *   node tools/lily-state.mjs working "改文件" --ttl 8000
 *   node tools/lily-state.mjs idle
 *   node tools/lily-state.mjs --demo        # 依次演示全部状态
 *   node tools/lily-state.mjs --health      # 查看桥接服务状态
 *
 * 选项：
 *   --port <n>   端口，默认 17890
 *   --ttl <ms>   状态持续时间，默认 5000
 *   --source <s> 来源标记，默认 "cli"
 */

const DEFAULT_PORT = 17890;
const STATES = ["idle", "thinking", "working", "waiting", "done", "error"];

function parseArgs(argv) {
  const options = { port: DEFAULT_PORT, ttlMs: 5000, source: "cli", demo: false, health: false };
  const positional = [];

  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === "--demo") options.demo = true;
    else if (arg === "--health") options.health = true;
    else if (arg === "--port") options.port = Number(argv[++i]);
    else if (arg === "--ttl") options.ttlMs = Number(argv[++i]);
    else if (arg === "--source") options.source = String(argv[++i] || "cli");
    else positional.push(arg);
  }

  return { options, positional };
}

async function postState(baseUrl, payload) {
  const response = await fetch(`${baseUrl}/state`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload)
  });
  const body = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(`HTTP ${response.status}: ${body.error || "request failed"}`);
  }
  return body;
}

const DEMO_TEXT = {
  thinking: "在想…",
  working: "干活中",
  waiting: "等你确认",
  done: "搞定",
  error: "出错了"
};

async function main() {
  const { options, positional } = parseArgs(process.argv.slice(2));
  const baseUrl = `http://127.0.0.1:${options.port}`;

  if (options.health) {
    const response = await fetch(`${baseUrl}/health`);
    console.log(JSON.stringify(await response.json(), null, 2));
    return;
  }

  if (options.demo) {
    for (const state of STATES.filter((item) => item !== "idle")) {
      await postState(baseUrl, {
        state,
        text: DEMO_TEXT[state],
        source: "demo",
        ttlMs: 2500
      });
      console.log(`→ ${state}`);
      await new Promise((resolve) => setTimeout(resolve, 1800));
    }
    await postState(baseUrl, { state: "idle", source: "demo" });
    console.log("→ idle");
    return;
  }

  const state = (positional[0] || "").toLowerCase();
  if (!STATES.includes(state)) {
    console.error(`state 必须是以下之一：${STATES.join(", ")}`);
    process.exitCode = 1;
    return;
  }

  const text = positional.slice(1).join(" ");
  const result = await postState(baseUrl, {
    state,
    text,
    source: options.source,
    ttlMs: options.ttlMs
  });
  console.log(JSON.stringify(result));
}

main().catch((error) => {
  console.error(`无法连接 Lily 桌宠（${DEFAULT_PORT}）：${error.message}`);
  console.error("请先启动应用：npm run dev");
  process.exitCode = 1;
});
