import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import bridgeModule from "../../src/main/services/agent-bridge";
import registryModule from "../../src/shared/state-registry";

const { createAgentBridge } = bridgeModule;
const { normalizeStateRegistry } = registryModule;

const states = normalizeStateRegistry({
  deploy: { label: "发版", color: "#FF00AA", animation: "cheer", priority: 88, ttlMs: 7000 }
});

const delivered = [];
const bridge = createAgentBridge({
  getPetWindow: () => ({
    isDestroyed: () => false,
    webContents: { send: (channel, payload) => delivered.push({ channel, payload }) }
  }),
  getStates: () => states,
  port: 0
});

let origin = "";

beforeAll(async () => {
  const result = await bridge.start();
  origin = result.origin;
});

afterAll(async () => {
  await bridge.close();
});

async function post(payload) {
  const response = await fetch(`${origin}/state`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload)
  });
  return { status: response.status, body: await response.json() };
}

describe("agent bridge", () => {
  it("reports the registry it will accept", async () => {
    const response = await fetch(`${origin}/health`);
    const body = await response.json();
    expect(body.ok).toBe(true);
    expect(body.states).toContain("thinking");
    expect(body.states).toContain("deploy");
    expect(body.registry.deploy.label).toBe("发版");
  });

  it("accepts a state from the registry", async () => {
    const { status, body } = await post({ state: "thinking" });
    expect(status).toBe(200);
    expect(body).toMatchObject({ ok: true, delivered: true, state: "thinking" });
    expect(delivered.at(-1).channel).toBe("pet:agent-state");
  });

  it("maps the legacy state names", async () => {
    const { body } = await post({ state: "waiting", text: "等你确认" });
    expect(body.state).toBe("waiting_user");
    expect(delivered.at(-1).payload.state).toBe("waiting_user");
  });

  it("accepts a custom state added in config", async () => {
    const { body } = await post({ state: "deploy" });
    expect(body.state).toBe("deploy");
  });

  it("uses the state ttl when the caller does not pass one", async () => {
    await post({ state: "deploy" });
    expect(delivered.at(-1).payload.ttlMs).toBe(7000);
  });

  it("keeps long-running states at ttl 0", async () => {
    await post({ state: "longtask" });
    expect(delivered.at(-1).payload.ttlMs).toBe(0);
  });

  it("rejects unknown states with the full list", async () => {
    const { status, body } = await post({ state: "napping" });
    expect(status).toBe(400);
    expect(body.ok).toBe(false);
    expect(body.error).toContain("waiting_approval");
  });

  it("rejects disabled states", async () => {
    const disabled = normalizeStateRegistry({ error: { enabled: false } });
    const localBridge = createAgentBridge({
      getPetWindow: () => null,
      getStates: () => disabled,
      port: 0
    });
    const { origin: localOrigin } = await localBridge.start();
    const response = await fetch(`${localOrigin}/state`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ state: "error" })
    });
    expect(response.status).toBe(400);
    await localBridge.close();
  });

  it("refuses malformed bodies", async () => {
    const { status } = await post(["thinking"]);
    expect(status).toBe(400);
  });

  it("does not deliver when the pet window is gone", async () => {
    const localBridge = createAgentBridge({
      getPetWindow: () => null,
      getStates: () => states,
      port: 0
    });
    const { origin: localOrigin } = await localBridge.start();
    const response = await fetch(`${localOrigin}/state`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ state: "idle" })
    });
    const body = await response.json();
    expect(body.delivered).toBe(false);
    await localBridge.close();
  });
});
