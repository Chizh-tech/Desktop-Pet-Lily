/**
 * Idle life —— 让静止的立绘看起来"活着"。
 *
 * 三件事：
 * 1. 呼吸：交给 CSS（`.lily-breathing`），不改任何 JS 状态；
 * 2. 眨眼：每隔几秒把一张闭眼帧叠在精灵上 90–120ms，偶尔连眨两下；
 * 3. 踱步：隔几分钟朝左或朝右走一两步，窗口真的会移动。
 *
 * 眨眼只在"当前显示的正是默认帧"时发生。播放点击动画、拖拽、视频时
 * 当前素材不是默认帧，这里会自动跳过，不会把闭眼帧盖在别的姿势上。
 * 踱步更保守：是否允许由外部通过 canWander 判断（悬停、拖拽、非空闲
 * 状态都该拒绝），到点也只有一半概率真的走，免得变成机械的巡逻。
 */

const IDLE_LIFE_DEFAULTS = {
  firstDelayMs: 1600,
  gapMinMs: 2600,
  gapMaxMs: 6400,
  blinkMinMs: 92,
  blinkMaxMs: 118,
  doubleBlinkChance: 0.16,
  doubleBlinkGapMs: 128,
  // 踱步：低频、小幅。自己走开两步是可爱的，走多了就是打扰。
  wanderFirstDelayMs: 90000,
  wanderGapMinMs: 180000,
  wanderGapMaxMs: 480000,
  wanderChance: 0.5,
  wanderDurationMinMs: 900,
  wanderDurationMaxMs: 1500,
  wanderSpeed: 96
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
  options = {},
  canWander = null,
  onWander = null
} = {}) {
  const settings = { ...IDLE_LIFE_DEFAULTS, ...options };

  let blinkAsset = "";
  let running = false;
  let wanderEnabled = true;
  let scheduleTimer = null;
  let phaseTimer = null;
  let wanderTimer = null;

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

  function clearWanderTimer() {
    if (!wanderTimer) return;
    timers.clearTimeout(wanderTimer);
    wanderTimer = null;
  }

  function canWanderNow() {
    if (!wanderEnabled) return false;
    if (typeof onWander !== "function") return false;
    if (typeof canWander !== "function") return true;
    try {
      return Boolean(canWander());
    } catch (error) {
      logger.warn("idle life canWander threw", { error: String(error && error.message) });
      return false;
    }
  }

  function performWander(direction, durationMs) {
    try {
      onWander({ direction, durationMs, speed: settings.wanderSpeed });
      logger.debug("idle life wander", { direction, durationMs });
      return true;
    } catch (error) {
      logger.warn("idle life wander failed", { error: String(error && error.message) });
      return false;
    }
  }

  function scheduleWander(delay) {
    if (!running || !wanderEnabled || typeof onWander !== "function") return;
    // 已经排过一次就别重置：配置更新会反复调用 setWanderEnabled，
    // 每次都重排的话踱步会被无限推迟。
    if (wanderTimer) return;
    const wait = delay === undefined
      ? randomBetween(settings.wanderGapMinMs, settings.wanderGapMaxMs)
      : delay;
    wanderTimer = timers.setTimeout(() => {
      wanderTimer = null;
      wanderTick();
    }, Math.max(0, wait));
  }

  function wanderTick() {
    if (!running) return;
    // 不允许或这次不打算走，都要重新排下一轮，否则踱步会永久停摆。
    if (!canWanderNow() || random() >= settings.wanderChance) {
      scheduleWander();
      return;
    }
    const direction = random() < 0.5 ? "left" : "right";
    const durationMs = Math.round(randomBetween(settings.wanderDurationMinMs, settings.wanderDurationMaxMs));
    performWander(direction, durationMs);
    // 走完之后再等一个完整间隔，避免刚停下紧接着又起步。
    scheduleWander(durationMs + randomBetween(settings.wanderGapMinMs, settings.wanderGapMaxMs));
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
      scheduleWander(settings.wanderFirstDelayMs);
      logger.debug("idle life started", {
        firstDelayMs: settings.firstDelayMs,
        wanderFirstDelayMs: settings.wanderFirstDelayMs
      });
    },

    stop() {
      running = false;
      clearTimers();
      clearWanderTimer();
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
    },

    /** 打开或关闭踱步；关掉会立即取消已经排队的那一次。 */
    setWanderEnabled(enabled) {
      const next = Boolean(enabled);
      if (next === wanderEnabled) return;
      wanderEnabled = next;
      if (!wanderEnabled) {
        clearWanderTimer();
        return;
      }
      if (running) scheduleWander();
    },

    /** 立刻走两步，忽略概率与冷却（调试或交互反馈用）。 */
    wanderNow(payload = {}) {
      if (!running || typeof onWander !== "function") return false;
      const direction = payload.direction === "left" ? "left" : "right";
      const requested = Number(payload.durationMs);
      const durationMs = Number.isFinite(requested) && requested > 0
        ? Math.round(requested)
        : Math.round(randomBetween(settings.wanderDurationMinMs, settings.wanderDurationMaxMs));
      return performWander(direction, durationMs);
    }
  };
}

export { IDLE_LIFE_DEFAULTS };
