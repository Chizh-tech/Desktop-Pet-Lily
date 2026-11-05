import { beforeEach, describe, expect, it, vi } from "vitest";
import registryModule from "../../src/shared/state-registry";
import { createStateRuntime, hexToRgba } from "../../src/renderer/pet/state-runtime";

const { normalizeStateRegistry } = registryModule;

function createFakeSprite() {
  const attributes = new Map();
  const properties = new Map();
  return {
    attributes,
    properties,
    setAttribute(name, value) {
      attributes.set(name, String(value));
    },
    removeAttribute(name) {
      attributes.delete(name);
    },
    getAttribute(name) {
      return attributes.has(name) ? attributes.get(name) : null;
    },
    style: {
      setProperty(name, value) {
        properties.set(name, String(value));
      },
      removeProperty(name) {
        properties.delete(name);
      },
      getPropertyValue(name) {
        return properties.has(name) ? properties.get(name) : "";
      }
    }
  };
}

function createHarness({ registry, reducedMotion = false } = {}) {
  const sprite = createFakeSprite();
  const messages = [];
  const logs = [];
  const expressions = [];
  const runtime = createStateRuntime({
    sprite,
    getRegistry: () => registry || normalizeStateRegistry({}),
    showMessage: (text, durationMs) => messages.push({ text, durationMs }),
    setExpression: (id) => expressions.push(id),
    logger: {
      info: (message, data) => logs.push({ level: "info", message, data }),
      warn: (message, data) => logs.push({ level: "warn", message, data }),
      debug: () => {}
    },
    isReducedMotion: () => reducedMotion
  });
  return { sprite, messages, logs, expressions, runtime };
}

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date("2026-11-05T10:00:00Z"));
});

describe("hexToRgba", () => {
  it("converts the registry colour format", () => {
    expect(hexToRgba("#60A5FA", 0.7)).toBe("rgba(96, 165, 250, 0.7)");
  });

  it("clamps alpha and rejects junk", () => {
    expect(hexToRgba("#000000", 5)).toBe("rgba(0, 0, 0, 1)");
    expect(hexToRgba("nope", 0.5)).toBeNull();
  });
});

describe("createStateRuntime visuals", () => {
  it("writes state id, animation and glow onto the sprite", () => {
    const { sprite, runtime } = createHarness();
    expect(runtime.apply({ state: "thinking" })).toBe(true);

    expect(sprite.getAttribute("data-lily-state")).toBe("thinking");
    expect(sprite.getAttribute("data-lily-anim")).toBe("bob");
    expect(sprite.style.getPropertyValue("--lily-anim-name")).toBe("lily-state-bob");
    expect(sprite.style.getPropertyValue("--lily-state-glow")).toContain("rgba(96, 165, 250");
  });

  it("keeps the sprite still when a state has no glow and no animation", () => {
    const { sprite, runtime } = createHarness();
    runtime.apply({ state: "offline" });
    expect(sprite.getAttribute("data-lily-state")).toBe("offline");
    expect(sprite.getAttribute("data-lily-anim")).toBeNull();
    expect(sprite.style.getPropertyValue("--lily-state-glow")).toBe("");
  });

  it("drops animation but keeps colour when reduced motion is on", () => {
    const { sprite, runtime } = createHarness({ reducedMotion: true });
    runtime.apply({ state: "working" });
    expect(sprite.getAttribute("data-lily-anim")).toBeNull();
    expect(sprite.style.getPropertyValue("--lily-state-glow")).toContain("rgba(52, 211, 153");
  });

  it("applies per-state duration overrides from config", () => {
    const registry = normalizeStateRegistry({ thinking: { animationDurationMs: 900, animationIterations: 3 } });
    const { sprite, runtime } = createHarness({ registry });
    runtime.apply({ state: "thinking" });
    expect(sprite.style.getPropertyValue("--lily-anim-duration")).toBe("900ms");
    expect(sprite.style.getPropertyValue("--lily-anim-iterations")).toBe("3");
  });

  it("asks for the state's expression frame and clears it afterwards", () => {
    const { expressions, runtime } = createHarness();
    runtime.apply({ state: "thinking" });
    expect(expressions.at(-1)).toBe("thinking");
    runtime.apply({ state: "success" });
    expect(expressions.at(-1)).toBe("laugh");
    runtime.clear();
    expect(expressions.at(-1)).toBe("");
  });

  it("sends an empty expression when the state has none", () => {
    const registry = normalizeStateRegistry({ thinking: { expression: "" } });
    const { expressions, runtime } = createHarness({ registry });
    runtime.apply({ state: "thinking" });
    expect(expressions.at(-1)).toBe("");
  });
});

describe("createStateRuntime arbitration", () => {
  it("ignores unknown states", () => {
    const { sprite, runtime } = createHarness();
    expect(runtime.apply({ state: "napping" })).toBe(false);
    expect(sprite.getAttribute("data-lily-state")).toBeNull();
  });

  it("ignores disabled states", () => {
    const registry = normalizeStateRegistry({ thinking: { enabled: false } });
    const { runtime } = createHarness({ registry });
    expect(runtime.apply({ state: "thinking" })).toBe(false);
  });

  it("blocks a lower priority state", () => {
    const { sprite, runtime } = createHarness();
    runtime.apply({ state: "working" });
    expect(runtime.apply({ state: "thinking" })).toBe(false);
    expect(sprite.getAttribute("data-lily-state")).toBe("working");
  });

  it("lets a higher priority state interrupt", () => {
    const { sprite, runtime } = createHarness();
    runtime.apply({ state: "working" });
    expect(runtime.apply({ state: "waiting_approval" })).toBe(true);
    expect(sprite.getAttribute("data-lily-state")).toBe("waiting_approval");
  });

  it("protects a non-interruptible state from a lower priority one", () => {
    const { runtime } = createHarness();
    runtime.apply({ state: "blocked" });
    expect(runtime.apply({ state: "success" })).toBe(false);
    expect(runtime.apply({ state: "error" })).toBe(true);
  });

  it("always lets idle reset whatever is showing", () => {
    const { sprite, runtime } = createHarness();
    runtime.apply({ state: "blocked" });
    expect(runtime.apply({ state: "idle" })).toBe(true);
    expect(sprite.getAttribute("data-lily-state")).toBe("idle");
  });
});

describe("createStateRuntime timing", () => {
  it("falls back to idle when the ttl runs out", () => {
    const { sprite, runtime } = createHarness();
    runtime.apply({ state: "working" });
    expect(runtime.getActive()).toMatchObject({ id: "working" });

    vi.advanceTimersByTime(7999);
    expect(sprite.getAttribute("data-lily-state")).toBe("working");

    vi.advanceTimersByTime(2);
    expect(sprite.getAttribute("data-lily-state")).toBe("idle");
    expect(runtime.getActive()).toMatchObject({ id: "idle" });
  });

  it("keeps long-running states until something else arrives", () => {
    const { sprite, runtime } = createHarness();
    runtime.apply({ state: "longtask" });
    vi.advanceTimersByTime(10 * 60 * 1000);
    expect(sprite.getAttribute("data-lily-state")).toBe("longtask");
  });

  it("honours an explicit ttl from the payload", () => {
    const { sprite, runtime } = createHarness();
    runtime.apply({ state: "waiting_user", ttlMs: 1500 });
    vi.advanceTimersByTime(1501);
    expect(sprite.getAttribute("data-lily-state")).toBe("idle");
  });

  it("clears everything on demand", () => {
    const { sprite, runtime } = createHarness();
    runtime.apply({ state: "working" });
    runtime.clear();
    expect(sprite.getAttribute("data-lily-state")).toBeNull();
    expect(sprite.getAttribute("data-lily-anim")).toBeNull();
    expect(runtime.getActive()).toBeNull();
  });
});

describe("createStateRuntime bubbles", () => {
  it("uses the payload text when provided", () => {
    const { messages, runtime } = createHarness();
    runtime.apply({ state: "working", text: "改第 3 个文件" });
    expect(messages.at(-1).text).toBe("改第 3 个文件");
  });

  it("falls back to the state's default line", () => {
    const { messages, runtime } = createHarness();
    runtime.apply({ state: "thinking" });
    expect(messages.at(-1).text).toBe("在想…");
  });

  it("stays quiet when a state has no line and no text", () => {
    const { messages, runtime } = createHarness();
    runtime.apply({ state: "idle" });
    expect(messages).toHaveLength(0);
  });

  it("does not repeat the same bubble twice in a row", () => {
    const { messages, runtime } = createHarness();
    runtime.apply({ state: "thinking" });
    runtime.apply({ state: "thinking" });
    expect(messages).toHaveLength(1);
  });
});

describe("createStateRuntime refresh", () => {
  it("repaints with the new registry values", () => {
    const registry = normalizeStateRegistry({});
    const { sprite, runtime } = createHarness({ registry });
    runtime.apply({ state: "thinking" });
    const before = sprite.style.getPropertyValue("--lily-state-glow");

    registry.thinking.color = "#FF0000";
    registry.thinking.glow = 1;
    runtime.refresh();

    expect(sprite.style.getPropertyValue("--lily-state-glow")).not.toBe(before);
    expect(sprite.style.getPropertyValue("--lily-state-glow")).toContain("rgba(255, 0, 0");
  });

  it("clears the state when it was removed from config", () => {
    const registry = normalizeStateRegistry({});
    const { sprite, runtime } = createHarness({ registry });
    runtime.apply({ state: "thinking" });
    delete registry.thinking;
    runtime.refresh();
    expect(sprite.getAttribute("data-lily-state")).toBeNull();
  });
});
