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
      if (randomValues.length === 0) return 0.5;
      const value = randomValues[randomIndex % randomValues.length];
      randomIndex += 1;
      return value;
    },
    timers,
    options: overrides.options
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
