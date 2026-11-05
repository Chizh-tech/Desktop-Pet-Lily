/**
 * Lily 状态运行时（P1-05）
 *
 * 把「状态注册表」翻译成 DOM 上的视觉：发光颜色、动效、气泡、超时回落。
 * 依赖全部注入，方便在 node 里单测（项目没有 jsdom）。
 */

export const STATE_RUNTIME_DEFAULTS = {
  bubbleFallbackMs: 1800,
  bubbleMinMs: 1200,
  bubbleDedupMs: 1000,
  glowMinRadiusPx: 8,
  glowMaxRadiusPx: 22
};

const HEX_PATTERN = /^#([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i;

export function hexToRgba(hex, alpha) {
  const match = HEX_PATTERN.exec(String(hex || "").trim());
  if (!match) return null;
  const [, r, g, b] = match;
  const red = Number.parseInt(r, 16);
  const green = Number.parseInt(g, 16);
  const blue = Number.parseInt(b, 16);
  const safeAlpha = Number.isFinite(alpha) ? Math.min(Math.max(alpha, 0), 1) : 1;
  return `rgba(${red}, ${green}, ${blue}, ${Number(safeAlpha.toFixed(3))})`;
}

function normalizeId(value) {
  return typeof value === "string" ? value.trim().toLowerCase() : "";
}

export function createStateRuntime({
  sprite,
  getRegistry,
  showMessage,
  logger,
  isReducedMotion,
  timers
}) {
  const options = { ...STATE_RUNTIME_DEFAULTS };
  const schedule = timers && timers.setTimeout
    ? (fn, ms) => timers.setTimeout(fn, ms)
    : (fn, ms) => globalThis.setTimeout(fn, ms);
  const cancel = timers && timers.clearTimeout
    ? (id) => timers.clearTimeout(id)
    : (id) => globalThis.clearTimeout(id);

  let current = null;
  let timerId = null;
  let lastBubble = { text: "", at: 0 };

  function log(level, message, data) {
    if (!logger || typeof logger[level] !== "function") return;
    logger[level](message, data);
  }

  function readRegistry() {
    try {
      const registry = typeof getRegistry === "function" ? getRegistry() : null;
      return registry && typeof registry === "object" ? registry : {};
    } catch (error) {
      log("warn", "state registry unavailable", { error: error.message || error });
      return {};
    }
  }

  function resolveEntry(stateId, inlineMeta) {
    const id = normalizeId(stateId);
    if (!id) return null;
    if (inlineMeta && typeof inlineMeta === "object") {
      return { id, meta: inlineMeta };
    }
    const registry = readRegistry();
    const meta = registry[id];
    if (!meta || typeof meta !== "object") return null;
    return { id, meta };
  }

  function clearVisuals() {
    if (!sprite || typeof sprite.removeAttribute !== "function") return;
    sprite.removeAttribute("data-lily-state");
    sprite.removeAttribute("data-lily-anim");
    sprite.style.removeProperty("--lily-anim-name");
    sprite.style.removeProperty("--lily-anim-duration");
    sprite.style.removeProperty("--lily-anim-easing");
    sprite.style.removeProperty("--lily-anim-iterations");
    sprite.style.removeProperty("--lily-anim-easing");
    sprite.style.removeProperty("--lily-state-glow");
  }

  function applyVisuals(id, meta) {
    if (!sprite || typeof sprite.setAttribute !== "function") return;
    sprite.setAttribute("data-lily-state", id);

    const preset = meta.animation || "none";
    if (preset === "none" || isReducedMotionEnabled()) {
      sprite.removeAttribute("data-lily-anim");
      sprite.style.removeProperty("--lily-anim-name");
    } else {
      sprite.setAttribute("data-lily-anim", preset);
      sprite.style.setProperty("--lily-anim-name", `lily-state-${preset}`);
      const duration = Number(meta.animationDurationMs);
      if (Number.isFinite(duration) && duration > 0) {
        sprite.style.setProperty("--lily-anim-duration", `${Math.round(duration)}ms`);
      } else {
        sprite.style.removeProperty("--lily-anim-duration");
      }
      if (meta.animationIterations === "infinite" || Number.isFinite(Number(meta.animationIterations))) {
        sprite.style.setProperty("--lily-anim-iterations", String(meta.animationIterations));
      } else {
        sprite.style.removeProperty("--lily-anim-iterations");
      }
      if (meta.animationEasing) {
        sprite.style.setProperty("--lily-anim-easing", String(meta.animationEasing));
      } else {
        sprite.style.removeProperty("--lily-anim-easing");
      }
    }

    const glow = Number(meta.glow);
    const color = hexToRgba(meta.color, 0.75);
    if (color && Number.isFinite(glow) && glow > 0) {
      const radius = Math.round(
        STATE_RUNTIME_DEFAULTS.glowMinRadiusPx
        + (STATE_RUNTIME_DEFAULTS.glowMaxRadiusPx - STATE_RUNTIME_DEFAULTS.glowMinRadiusPx) * Math.min(glow, 1)
      );
      sprite.style.setProperty("--lily-state-glow", `drop-shadow(0 0 ${radius}px ${hexToRgba(meta.color, glow)})`);
    } else {
      sprite.style.removeProperty("--lily-state-glow");
    }
  }

  function isReducedMotionEnabled() {
    if (typeof isReducedMotion !== "function") return false;
    try {
      return Boolean(isReducedMotion());
    } catch {
      return false;
    }
  }

  function clearTimer() {
    if (timerId === null) return;
    cancel(timerId);
    timerId = null;
  }

  function say(text, ttlMs) {
    if (!text || typeof showMessage !== "function") return;
    const now = Date.now();
    if (text === lastBubble.text && now - lastBubble.at < STATE_RUNTIME_DEFAULTS.bubbleDedupMs) return;
    lastBubble = { text, at: now };
    const duration = ttlMs > 0
      ? Math.max(STATE_RUNTIME_DEFAULTS.bubbleMinMs, ttlMs)
      : STATE_RUNTIME_DEFAULTS.bubbleFallbackMs;
    showMessage(text, duration);
  }

  function show(id, meta, { ttlMs, text } = {}) {
    clearTimer();
    const resolvedTtl = Number.isFinite(Number(ttlMs)) && Number(ttlMs) >= 0
      ? Math.round(Number(ttlMs))
      : Number(meta.ttlMs) || 0;

    current = {
      id,
      label: meta.label,
      priority: Number(meta.priority) || 0,
      interruptible: meta.interruptible !== false,
      expiresAt: resolvedTtl > 0 ? Date.now() + resolvedTtl : 0
    };

    applyVisuals(id, meta);
    say(text || meta.bubble, resolvedTtl);

    if (resolvedTtl > 0) {
      timerId = schedule(() => {
        timerId = null;
        if (!current || current.id !== id) return;
        log("info", "state expired", { state: id, ttlMs: resolvedTtl });
        fallback(meta.fallback);
      }, resolvedTtl);
    }

    log("info", "state applied", { state: id, priority: current.priority, ttlMs: resolvedTtl });
    return true;
  }

  /** 超时后回落到 fallback；fallback 不存在就清空视觉，回到默认帧。 */
  function fallback(fallbackId) {
    const target = fallbackId ? resolveEntry(fallbackId) : null;
    if (target && target.meta.enabled !== false) {
      show(target.id, target.meta, { ttlMs: 0 });
      return;
    }
    clear("fallback");
  }

  /**
   * 接收一条状态事件。返回是否真的应用了（被优先级挡掉会返回 false）。
   */
  function apply(payload) {
    if (!payload || typeof payload !== "object") return false;
    const entry = resolveEntry(payload.state, payload.meta);
    if (!entry) {
      log("warn", "unknown state ignored", { state: payload.state });
      return false;
    }
    if (entry.meta.enabled === false) {
      log("info", "disabled state ignored", { state: entry.id });
      return false;
    }

    const active = current
      ? { id: current.id, priority: current.priority, interruptible: current.interruptible }
      : null;
    // alwaysApply（idle / offline）永远放行，否则会卡在高优先级状态上出不来；
    // 面板的「试一下」带 force，保证预览一定能看到。
    const forced = payload.force === true;
    if (!forced && active && active.id !== entry.id && entry.meta.alwaysApply !== true) {
      const allowed = active.interruptible
        ? entry.meta.priority >= active.priority
        : entry.meta.priority > active.priority;
      if (!allowed) {
        log("info", "state suppressed by priority", {
          incoming: entry.id,
          incomingPriority: entry.meta.priority,
          active: active.id,
          activePriority: active.priority
        });
        return false;
      }
    }

    return show(entry.id, entry.meta, {
      ttlMs: payload.ttlMs,
      text: typeof payload.text === "string" ? payload.text : ""
    });
  }

  function clear(reason = "manual") {
    clearTimer();
    const previous = current;
    current = null;
    clearVisuals();
    if (previous) log("info", "state cleared", { state: previous.id, reason });
  }

  /** 配置变化后按新注册表重画当前状态。 */
  function refresh() {
    if (!current) return false;
    const entry = resolveEntry(current.id);
    if (!entry || entry.meta.enabled === false) {
      clear("refresh");
      return false;
    }
    const remaining = current.expiresAt ? Math.max(current.expiresAt - Date.now(), 0) : 0;
    current.label = entry.meta.label;
    current.priority = Number(entry.meta.priority) || 0;
    current.interruptible = entry.meta.interruptible !== false;
    applyVisuals(entry.id, entry.meta);
    if (current.expiresAt && remaining > 0) {
      clearTimer();
      timerId = schedule(() => {
        timerId = null;
        if (!current || current.id !== entry.id) return;
        fallback(entry.meta.fallback);
      }, remaining);
    }
    return true;
  }

  function getActive() {
    return current ? { ...current } : null;
  }

  return { apply, clear, refresh, getActive };
}
