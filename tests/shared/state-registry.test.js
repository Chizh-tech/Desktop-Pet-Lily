import { describe, expect, it } from "vitest";
import registryModule from "../../src/shared/state-registry";

const {
  DEFAULT_STATE_REGISTRY,
  STATE_ANIMATION_IDS,
  STATE_ANIMATION_PRESETS,
  getStateMeta,
  isStateEnabled,
  listStates,
  normalizeStateRegistry,
  pickDominantState,
  resolveStateId,
  shouldApplyState
} = registryModule;

const DEFAULT_IDS = [
  "offline",
  "idle",
  "sleeping",
  "listening",
  "thinking",
  "searching",
  "working",
  "longtask",
  "waiting_user",
  "waiting_approval",
  "success",
  "error",
  "blocked",
  "celebrating"
];

describe("default state registry", () => {
  it("ships the 14 states from the roadmap", () => {
    expect(Object.keys(DEFAULT_STATE_REGISTRY).sort()).toEqual([...DEFAULT_IDS].sort());
  });

  it("gives every state a complete, sane shape", () => {
    const registry = normalizeStateRegistry({});
    for (const id of DEFAULT_IDS) {
      const meta = registry[id];
      expect(meta.label.length).toBeGreaterThan(0);
      expect(meta.color).toMatch(/^#[0-9a-f]{6}$/);
      expect(meta.priority).toBeGreaterThanOrEqual(0);
      expect(meta.priority).toBeLessThanOrEqual(100);
      expect(STATE_ANIMATION_IDS).toContain(meta.animation);
      expect(typeof meta.interruptible).toBe("boolean");
      expect(typeof meta.enabled).toBe("boolean");
    }
  });

  it("keeps a keyframe name for every animation preset except none", () => {
    for (const [id, preset] of Object.entries(STATE_ANIMATION_PRESETS)) {
      if (id === "none") {
        expect(preset.keyframes).toBeNull();
      } else {
        expect(preset.keyframes).toBe(`lily-state-${id}`);
      }
    }
  });
});

describe("normalizeStateRegistry", () => {
  it("fills missing fields from the default table", () => {
    const registry = normalizeStateRegistry({ thinking: { color: "#123456" } });
    expect(registry.thinking.color).toBe("#123456");
    expect(registry.thinking.label).toBe(DEFAULT_STATE_REGISTRY.thinking.label);
    expect(registry.thinking.priority).toBe(40);
    expect(registry.thinking.animation).toBe("bob");
  });

  it("accepts brand new states", () => {
    const registry = normalizeStateRegistry({
      shipping: { label: "发版", color: "#FF00AA", animation: "cheer", priority: 88, ttlMs: 1500 }
    });
    expect(registry.shipping.label).toBe("发版");
    expect(registry.shipping.priority).toBe(88);
    expect(registry.shipping.ttlMs).toBe(1500);
    expect(registry.shipping.group).toBe("custom");
    expect(registry.shipping.fallback).toBe("idle");
  });

  it("rejects malformed values instead of trusting them", () => {
    const registry = normalizeStateRegistry({
      thinking: {
        color: "blue",
        priority: 999,
        ttlMs: -5,
        animation: "explode",
        glow: 4,
        group: "nope"
      }
    });
    expect(registry.thinking.color).toBe(DEFAULT_STATE_REGISTRY.thinking.color.toLowerCase());
    expect(registry.thinking.priority).toBe(100);
    expect(registry.thinking.ttlMs).toBe(0);
    expect(registry.thinking.animation).toBe("bob");
    expect(registry.thinking.glow).toBe(1);
    expect(registry.thinking.group).toBe("agent");
  });

  it("drops ids that cannot be used as DOM attributes", () => {
    const registry = normalizeStateRegistry({ "Bad Id!": { label: "x" } });
    expect(registry["bad id!"]).toBeUndefined();
    expect(Object.keys(registry)).toHaveLength(DEFAULT_IDS.length);
  });

  it("lets a null entry remove a state", () => {
    const registry = normalizeStateRegistry({ longtask: null });
    expect(registry.longtask).toBeUndefined();
    expect(Object.keys(registry)).toHaveLength(DEFAULT_IDS.length - 1);
  });

  it("repairs a fallback that points at a removed state", () => {
    const registry = normalizeStateRegistry({ idle: null });
    expect(registry.idle).toBeUndefined();
    for (const meta of Object.values(registry)) {
      if (meta.fallback) expect(registry[meta.fallback]).toBeDefined();
    }
  });
});

describe("state lookup", () => {
  const registry = normalizeStateRegistry({});

  it("resolves the legacy names from v0.1.x", () => {
    expect(resolveStateId(registry, "waiting")).toBe("waiting_user");
    expect(resolveStateId(registry, "done")).toBe("success");
    expect(resolveStateId(registry, "failed")).toBe("error");
    expect(resolveStateId(registry, "THINKING")).toBe("thinking");
  });

  it("returns null for unknown or malformed ids", () => {
    expect(resolveStateId(registry, "napping")).toBeNull();
    expect(resolveStateId(registry, "constructor")).toBeNull();
    expect(resolveStateId(registry, "")).toBeNull();
    expect(resolveStateId(registry, null)).toBeNull();
  });

  it("reports disabled states without hiding them from the registry", () => {
    const disabled = normalizeStateRegistry({ thinking: { enabled: false } });
    expect(getStateMeta(disabled, "thinking")).toBeTruthy();
    expect(isStateEnabled(disabled, "thinking")).toBe(false);
    expect(isStateEnabled(disabled, "working")).toBe(true);
  });

  it("lists states by priority, highest first", () => {
    const ordered = listStates(registry);
    expect(ordered[0].id).toBe("celebrating");
    expect(ordered[ordered.length - 1].id).toBe("idle");
  });
});

describe("shouldApplyState", () => {
  const registry = normalizeStateRegistry({});

  const active = (id) => {
    const meta = registry[id];
    return { id, priority: meta.priority, interruptible: meta.interruptible };
  };

  it("always allows the first state", () => {
    expect(shouldApplyState(registry, null, registry.thinking)).toBe(true);
  });

  it("lets a higher priority state take over", () => {
    expect(shouldApplyState(registry, active("working"), registry.waiting_user)).toBe(true);
  });

  it("blocks a lower priority state", () => {
    expect(shouldApplyState(registry, active("working"), registry.thinking)).toBe(false);
  });

  it("refreshes the state that is already showing", () => {
    expect(shouldApplyState(registry, active("working"), registry.working)).toBe(true);
  });

  it("protects a non-interruptible state from equal or lower priority", () => {
    // blocked = 85 / 不可打断，success = 70 顶不掉
    expect(shouldApplyState(registry, active("blocked"), registry.success)).toBe(false);
    expect(shouldApplyState(registry, active("blocked"), registry.error)).toBe(true);
  });

  it("always lets idle reset the pet, whatever is showing", () => {
    expect(shouldApplyState(registry, active("blocked"), registry.idle)).toBe(true);
    expect(shouldApplyState(registry, active("celebrating"), registry.idle)).toBe(true);
    expect(shouldApplyState(registry, active("error"), registry.offline)).toBe(true);
  });

  it("fills animation timing from the preset", () => {
    const meta = registry.thinking;
    expect(meta.animationDurationMs).toBe(2400);
    expect(meta.animationIterations).toBe("infinite");
    expect(meta.animationEasing).toBe("ease-in-out");
    expect(registry.success.animationIterations).toBe(1);
  });
});

describe("pickDominantState", () => {
  const registry = normalizeStateRegistry({});

  it("picks the most urgent source", () => {
    const meta = pickDominantState(registry, ["thinking", "waiting_approval", "working"]);
    expect(meta.label).toBe(DEFAULT_STATE_REGISTRY.waiting_approval.label);
  });

  it("ignores unknown and disabled states", () => {
    const disabled = normalizeStateRegistry({ error: { enabled: false } });
    const meta = pickDominantState(disabled, ["error", "nope", "working"]);
    expect(meta.label).toBe(DEFAULT_STATE_REGISTRY.working.label);
  });

  it("returns null when nothing is usable", () => {
    expect(pickDominantState(registry, [])).toBeNull();
    expect(pickDominantState(registry, ["nope"])).toBeNull();
  });
});
