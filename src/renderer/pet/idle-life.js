/**
 * Idle life —— 让静止的立绘看起来"活着"。
 *
 * 两件事：
 * 1. 呼吸：交给 CSS（`.lily-breathing`），不改任何 JS 状态；
 * 2. 眨眼：每隔几秒把一张闭眼帧叠在精灵上 90–120ms，偶尔连眨两下。
 *
 * 眨眼只在"当前显示的正是默认帧"时发生。播放点击动画、拖拽、视频时
 * 当前素材不是默认帧，这里会自动跳过，不会把闭眼帧盖在别的姿势上。
 */

const IDLE_LIFE_DEFAULTS = {
  firstDelayMs: 1600,
  gapMinMs: 2600,
  gapMaxMs: 6400,
  blinkMinMs: 92,
  blinkMaxMs: 118,
  doubleBlinkChance: 0.16,
  doubleBlinkGapMs: 128
};

// 必须包一层再调用：浏览器里把 window.setTimeout 存进对象再 obj.setTimeout(...)
// 调用会丢 this，直接抛 "Illegal invocation"。
const DEFAULT_TIMERS = {
  setTimeout: (callback, ms) => globalThis.setTimeout(callback, ms),
  clearTimeout: (id) => globalThis.clearTimeout(id)
};

export function createIdleLife({
  overlay,
  getDefaultAsset,
  getCurrentAsset,
  logger = console,
  random = Math.random,
  timers = DEFAULT_TIMERS,
  options = {}
} = {}) {
  const settings = { ...IDLE_LIFE_DEFAULTS, ...options };

  let blinkAsset = "";
  let running = false;
  let scheduleTimer = null;
  let phaseTimer = null;

  function randomBetween(min, max) {
    const raw = Number(random());
    const unit = Number.isFinite(raw) ? Math.min(1, Math.max(0, raw)) : 0.5;
    return min + unit * (max - min);
  }

  function currentAsset() {
    return String((typeof getCurrentAsset === "function" && getCurrentAsset()) || "");
  }

  function defaultAsset() {
    return String((typeof getDefaultAsset === "function" && getDefaultAsset()) || "");
  }

  function canBlink() {
    if (!blinkAsset || !overlay) return false;
    const current = currentAsset();
    return Boolean(current) && current === defaultAsset();
  }

  function setOverlayVisible(visible) {
    if (!overlay) return;
    if (overlay.classList && typeof overlay.classList.toggle === "function") {
      overlay.classList.toggle("is-visible", Boolean(visible));
    }
    if (overlay.dataset) {
      overlay.dataset.visible = visible ? "1" : "0";
    }
  }

  function clearTimers() {
    if (scheduleTimer) {
      timers.clearTimeout(scheduleTimer);
      scheduleTimer = null;
    }
    if (phaseTimer) {
      timers.clearTimeout(phaseTimer);
      phaseTimer = null;
    }
  }

  function schedule(delay) {
    if (!running) return;
    scheduleTimer = timers.setTimeout(() => {
      scheduleTimer = null;
      tick();
    }, delay === undefined ? randomBetween(settings.gapMinMs, settings.gapMaxMs) : delay);
  }

  function blinkOnce(done) {
    if (!canBlink()) {
      done();
      return;
    }
    setOverlayVisible(true);
    phaseTimer = timers.setTimeout(() => {
      phaseTimer = null;
      setOverlayVisible(false);
      done();
    }, randomBetween(settings.blinkMinMs, settings.blinkMaxMs));
  }

  function tick() {
    if (!running) return;
    if (!canBlink()) {
      schedule();
      return;
    }
    blinkOnce(() => {
      if (!running) return;
      if (random() < settings.doubleBlinkChance) {
        phaseTimer = timers.setTimeout(() => {
          phaseTimer = null;
          blinkOnce(() => schedule());
        }, settings.doubleBlinkGapMs);
        return;
      }
      schedule();
    });
  }

  return {
    /** 设定闭眼帧地址；空字符串表示这个素材包不支持眨眼。 */
    setBlinkAsset(asset) {
      const next = typeof asset === "string" ? asset.trim() : "";
      if (next === blinkAsset) return;
      blinkAsset = next;
      if (overlay) {
        if (blinkAsset) {
          if (overlay.getAttribute("src") !== blinkAsset) {
            overlay.setAttribute("src", blinkAsset);
          }
          if (overlay.hasAttribute && overlay.hasAttribute("hidden")) {
            overlay.removeAttribute("hidden");
          }
        } else {
          setOverlayVisible(false);
          if (overlay.setAttribute) overlay.setAttribute("hidden", "");
        }
      }
      logger.debug("idle life blink asset set", { hasAsset: Boolean(blinkAsset) });
    },

    start() {
      if (running) return;
      running = true;
      setOverlayVisible(false);
      schedule(settings.firstDelayMs);
      logger.debug("idle life started", { firstDelayMs: settings.firstDelayMs });
    },

    stop() {
      running = false;
      clearTimers();
      setOverlayVisible(false);
    },

    /** 立刻眨一次（调试或交互反馈用）。 */
    blinkNow() {
      if (!canBlink()) return false;
      if (phaseTimer) {
        timers.clearTimeout(phaseTimer);
        phaseTimer = null;
      }
      if (scheduleTimer) {
        timers.clearTimeout(scheduleTimer);
        scheduleTimer = null;
      }
      blinkOnce(() => schedule());
      return true;
    },

    isBlinking() {
      return Boolean(overlay && overlay.classList && overlay.classList.contains("is-visible"));
    }
  };
}

export { IDLE_LIFE_DEFAULTS };
