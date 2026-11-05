import { describe, expect, it } from "vitest";
import { createIdleLife, IDLE_LIFE_DEFAULTS } from "../../src/renderer/pet/idle-life";

function createFakeTimers() {
  let now = 0;
  let nextId = 0;
  const queue = new Map();

  return {
    setTimeout(fn, ms) {
      const id = ++nextId;
      queue.set(id, { fn, at: now + Math.max(0, Number(ms) || 0) });
      return id;
    },
    clearTimeout(id) {
      queue.delete(id);
    },
    advance(ms) {
      const target = now + ms;
      let guard = 0;
      while (guard < 10000) {
        let earliest = null;
        for (const [id, task] of queue) {
          if (task.at <= target && (!earliest || task.at < earliest.task.at)) {
            earliest = { id, task };
          }
        }
        if (!earliest) break;
        queue.delete(earliest.id);
        now = earliest.task.at;
        earliest.task.fn();
        guard += 1;
      }
      now = target;
    },
    pending() {
      return queue.size;
    }
  };
}

function createFakeOverlay() {
  const classes = new Set();
  const attributes = new Map();
  return {
    dataset: {},
    classList: {
      toggle(name, on) {
        if (on) classes.add(name);
        else classes.delete(name);
        return on;
      },
      contains(name) {
        return classes.has(name);
      }
    },
    set src(value) {
      attributes.set("src", value);
    },
    get src() {
      return attributes.get("src") || "";
    },
    setAttribute(name, value) {
      attributes.set(name, value);
    },
    getAttribute(name) {
      return attributes.has(name) ? attributes.get(name) : null;
    },
    hasAttribute(name) {
      return attributes.has(name);
    },
    removeAttribute(name) {
      attributes.delete(name);
    }
  };
}

function setup(overrides = {}) {
  const timers = createFakeTimers();
  const overlay = createFakeOverlay();
  const state = { current: "file:///idle.png", defaultAsset: "file:///idle.png" };
  const randomValues = overrides.randomValues ? [...overrides.randomValues] : [];
  let randomIndex = 0;

  const idleLife = createIdleLife({
    overlay,
    getDefaultAsset: () => state.defaultAsset,
    getCurrentAsset: () => state.current,
    logger: { debug() {}, warn() {}, info() {}, error() {} },
    random: () => {
      if (randomValues.length === 0) {
        return typeof overrides.random === "number" ? overrides.random : 0.5;
      }
      const value = randomValues[randomIndex % randomValues.length];
      randomIndex += 1;
      return value;
    },
    timers,
    options: overrides.options,
    canWander: overrides.canWander,
    onWander: overrides.onWander
  });

  return { timers, overlay, idleLife, state };
}

describe("idle life blinking", () => {
  it("keeps the overlay hidden until the first blink delay elapses", () => {
    const { timers, overlay, idleLife } = setup({ options: { firstDelayMs: 1000 } });

    idleLife.setBlinkAsset("file:///idle-blink.png");
    idleLife.start();

    expect(overlay.src).toBe("file:///idle-blink.png");
    expect(overlay.hasAttribute("hidden")).toBe(false);
    expect(overlay.classList.contains("is-visible")).toBe(false);

    timers.advance(999);
    expect(overlay.classList.contains("is-visible")).toBe(false);

    timers.advance(1);
    expect(overlay.classList.contains("is-visible")).toBe(true);
  });

  it("hides the overlay again after the blink duration and schedules the next blink", () => {
    const { timers, overlay, idleLife } = setup({
      randomValues: [0.5, 0.9],
      options: { firstDelayMs: 0, blinkMinMs: 100, blinkMaxMs: 100 }
    });

    idleLife.setBlinkAsset("file:///idle-blink.png");
    idleLife.start();
    timers.advance(0);
    expect(overlay.classList.contains("is-visible")).toBe(true);

    timers.advance(100);
    expect(overlay.classList.contains("is-visible")).toBe(false);
    expect(timers.pending()).toBe(1);
  });

  it("skips blinking while a non-default clip is on screen", () => {
    const { timers, overlay, idleLife, state } = setup({
      options: { firstDelayMs: 0 }
    });

    idleLife.setBlinkAsset("file:///idle-blink.png");
    state.current = "file:///click.png";
    idleLife.start();
    timers.advance(0);

    expect(overlay.classList.contains("is-visible")).toBe(false);
    // 仍然继续排下一轮，等回到默认帧就能眨
    expect(timers.pending()).toBe(1);
  });

  it("does nothing when the package has no blink frame", () => {
    const { timers, overlay, idleLife } = setup();
    idleLife.setBlinkAsset("");
    idleLife.start();
    timers.advance(60000);

    expect(overlay.classList.contains("is-visible")).toBe(false);
    expect(idleLife.blinkNow()).toBe(false);
  });

  it("blinks twice in a row when the random roll is below the double-blink chance", () => {
    const { timers, overlay, idleLife } = setup({
      // 第一轮 doubleBlinkChance 判定命中（0.05 < 0.16），之后正常
      randomValues: [0.5, 0.05, 0.5, 0.9, 0.9],
      options: {
        firstDelayMs: 0,
        blinkMinMs: 100,
        blinkMaxMs: 100,
        doubleBlinkChance: 0.16,
        doubleBlinkGapMs: 130
      }
    });

    idleLife.setBlinkAsset("file:///idle-blink.png");
    idleLife.start();

    timers.advance(0);
    expect(overlay.classList.contains("is-visible")).toBe(true);
    timers.advance(100);
    expect(overlay.classList.contains("is-visible")).toBe(false);

    // 间隔期之后是第二次闭眼
    timers.advance(130);
    expect(overlay.classList.contains("is-visible")).toBe(true);

    timers.advance(100);
    expect(overlay.classList.contains("is-visible")).toBe(false);
  });

  it("stops everything on stop()", () => {
    const { timers, overlay, idleLife } = setup({ options: { firstDelayMs: 0 } });
    idleLife.setBlinkAsset("file:///idle-blink.png");
    idleLife.start();
    timers.advance(0);
    expect(overlay.classList.contains("is-visible")).toBe(true);

    idleLife.stop();

    expect(overlay.classList.contains("is-visible")).toBe(false);
    expect(timers.pending()).toBe(0);
    timers.advance(60000);
    expect(overlay.classList.contains("is-visible")).toBe(false);
  });

  it("exposes sane default timing", () => {
    expect(IDLE_LIFE_DEFAULTS.gapMinMs).toBeLessThan(IDLE_LIFE_DEFAULTS.gapMaxMs);
    expect(IDLE_LIFE_DEFAULTS.blinkMaxMs).toBeLessThan(200);
    expect(IDLE_LIFE_DEFAULTS.gapMinMs).toBeGreaterThan(1500);
  });
});

describe("idle life wandering", () => {
  // 0.3 让三个随机判定同时成立：低于 wanderChance、判定为向左、时长取中间值。
  function setupWander(overrides = {}) {
    const wanders = [];
    const harness = setup({
      random: 0.3,
      canWander: () => true,
      onWander: (payload) => wanders.push(payload),
      ...overrides
    });
    return { ...harness, wanders };
  }

  it("walks once the first wander delay elapses", () => {
    const { timers, idleLife, wanders } = setupWander();
    idleLife.start();

    timers.advance(IDLE_LIFE_DEFAULTS.wanderFirstDelayMs - 1);
    expect(wanders).toHaveLength(0);

    timers.advance(1);
    expect(wanders).toHaveLength(1);
    expect(wanders[0].direction).toBe("left");
    expect(wanders[0].durationMs).toBeGreaterThanOrEqual(IDLE_LIFE_DEFAULTS.wanderDurationMinMs);
    expect(wanders[0].durationMs).toBeLessThanOrEqual(IDLE_LIFE_DEFAULTS.wanderDurationMaxMs);
    expect(wanders[0].speed).toBe(IDLE_LIFE_DEFAULTS.wanderSpeed);
  });

  it("keeps rescheduling while wandering is not allowed", () => {
    let allowed = false;
    const { timers, idleLife, wanders } = setupWander({ canWander: () => allowed });
    idleLife.start();

    timers.advance(IDLE_LIFE_DEFAULTS.wanderFirstDelayMs);
    expect(wanders).toHaveLength(0);

    // 被拒一次不能就此停摆，放开限制后应该能自己走起来。
    allowed = true;
    timers.advance(IDLE_LIFE_DEFAULTS.wanderGapMaxMs + 2000);
    expect(wanders).toHaveLength(1);
  });

  it("stops when disabled and resumes when re-enabled", () => {
    const { timers, idleLife, wanders } = setupWander();
    idleLife.start();

    idleLife.setWanderEnabled(false);
    timers.advance(IDLE_LIFE_DEFAULTS.wanderGapMaxMs * 2);
    expect(wanders).toHaveLength(0);

    idleLife.setWanderEnabled(true);
    timers.advance(IDLE_LIFE_DEFAULTS.wanderGapMaxMs + 2000);
    expect(wanders).toHaveLength(1);
  });

  it("respects the wander chance", () => {
    const { timers, idleLife, wanders } = setupWander({ options: { wanderChance: 0 } });
    idleLife.start();

    timers.advance(IDLE_LIFE_DEFAULTS.wanderGapMaxMs * 3);
    expect(wanders).toHaveLength(0);
  });

  it("does not wander after stop()", () => {
    const { timers, idleLife, wanders } = setupWander();
    idleLife.start();
    idleLife.stop();

    timers.advance(IDLE_LIFE_DEFAULTS.wanderGapMaxMs * 3);
    expect(wanders).toHaveLength(0);
    expect(timers.pending()).toBe(0);
  });

  it("does nothing when no wander handler is wired", () => {
    const harness = setup({ random: 0.3 });
    harness.idleLife.start();

    // 没有 onWander 就不该排踱步定时器，否则只是空转。
    harness.timers.advance(IDLE_LIFE_DEFAULTS.wanderFirstDelayMs);
    expect(harness.idleLife.wanderNow()).toBe(false);
  });

  it("wanders immediately on demand", () => {
    const { idleLife, wanders } = setupWander();
    idleLife.start();

    expect(idleLife.wanderNow({ direction: "left", durationMs: 1200 })).toBe(true);
    expect(wanders).toEqual([
      { direction: "left", durationMs: 1200, speed: IDLE_LIFE_DEFAULTS.wanderSpeed }
    ]);
  });

  it("exposes conservative wander defaults", () => {
    expect(IDLE_LIFE_DEFAULTS.wanderGapMinMs).toBeGreaterThan(60000);
    expect(IDLE_LIFE_DEFAULTS.wanderGapMinMs).toBeLessThan(IDLE_LIFE_DEFAULTS.wanderGapMaxMs);
    expect(IDLE_LIFE_DEFAULTS.wanderChance).toBeLessThan(1);
    expect(IDLE_LIFE_DEFAULTS.wanderDurationMaxMs).toBeLessThan(3000);
  });
});
