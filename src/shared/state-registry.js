/**
 * Lily 状态注册表（P1-05）
 *
 * 状态不再写死在渲染层 CSS 里，而是作为一组可编辑的元数据存在 config.states。
 * 每条状态描述「长什么样、说什么、什么时候该被别的状态顶掉」：
 *
 *   label / bubble      面板显示名与默认气泡文案
 *   color / glow        发光颜色与强度（0 表示不发光）
 *   animation           动效预设 id（见 STATE_ANIMATION_PRESETS）
 *   priority            0–100，越大越优先；高优先级可以顶掉低优先级
 *   ttlMs               自动回落的毫秒数，0 表示一直保持到下一次状态
 *   fallback            回落目标，默认 idle
 *   interruptible       false 时，只有优先级更高（含相等）的状态能顶掉它
 *   group               互斥组，留给 P1-06 状态机
 *   enabled             false 时拒绝外部推送
 *
 * 用户配置只需要写想改的字段，其余从默认表补齐；把某个 id 设为 null 可以删掉它。
 */

const STATE_ANIMATION_PRESETS = {
  none: { label: "静止", keyframes: null, durationMs: 0, iterations: 1, easing: "linear" },
  breathe: { label: "呼吸", keyframes: "lily-state-breathe", durationMs: 4200, iterations: "infinite", easing: "ease-in-out" },
  bob: { label: "轻浮", keyframes: "lily-state-bob", durationMs: 2400, iterations: "infinite", easing: "ease-in-out" },
  bounce: { label: "跳动", keyframes: "lily-state-bounce", durationMs: 900, iterations: "infinite", easing: "ease-in-out" },
  pulse: { label: "脉动", keyframes: "lily-state-pulse", durationMs: 1800, iterations: "infinite", easing: "ease-in-out" },
  pop: { label: "弹一下", keyframes: "lily-state-pop", durationMs: 600, iterations: 1, easing: "ease-out" },
  shake: { label: "抖动", keyframes: "lily-state-shake", durationMs: 500, iterations: 2, easing: "ease-in-out" },
  float: { label: "慢漂", keyframes: "lily-state-float", durationMs: 5200, iterations: "infinite", easing: "ease-in-out" },
  sway: { label: "摇晃", keyframes: "lily-state-sway", durationMs: 3600, iterations: "infinite", easing: "ease-in-out" },
  droop: { label: "垂头", keyframes: "lily-state-droop", durationMs: 6000, iterations: "infinite", easing: "ease-in-out" },
  cheer: { label: "欢呼", keyframes: "lily-state-cheer", durationMs: 1200, iterations: "infinite", easing: "ease-in-out" },
  look: { label: "张望", keyframes: "lily-state-look", durationMs: 3200, iterations: "infinite", easing: "ease-in-out" }
};

const STATE_ANIMATION_IDS = Object.keys(STATE_ANIMATION_PRESETS);

const STATE_ALIASES = {
  // v0.1.x 的六个状态名，保留兼容，旧脚本不用改。
  waiting: "waiting_user",
  done: "success",
  complete: "success",
  succeeded: "success",
  failed: "error",
  sleep: "sleeping",
  search: "searching",
  approval: "waiting_approval",
  long_running: "longtask"
};

const STATE_GROUP_IDS = ["system", "agent", "self", "custom"];

const FALLBACK_META = {
  label: "",
  bubble: "",
  color: "#CBD5E1",
  glow: 0.6,
  animation: "breathe",
  animationDurationMs: null,
  animationIterations: null,
  animationEasing: "ease-in-out",
  priority: 0,
  ttlMs: 5000,
  fallback: "idle",
  interruptible: true,
  // alwaysApply 的状态不受优先级限制，用来「一键回到空闲」。
  alwaysApply: false,
  group: "custom",
  enabled: true
};

const DEFAULT_STATE_REGISTRY = {
  offline: {
    label: "离线",
    bubble: "",
    color: "#94A3B8",
    glow: 0,
    animation: "none",
    priority: 10,
    ttlMs: 0,
    fallback: "",
    interruptible: true,
    alwaysApply: true,
    group: "system"
  },
  idle: {
    label: "空闲",
    bubble: "",
    color: "#CBD5E1",
    glow: 0,
    animation: "breathe",
    priority: 0,
    ttlMs: 0,
    fallback: "",
    interruptible: true,
    alwaysApply: true,
    group: "system"
  },
  sleeping: {
    label: "睡着",
    bubble: "睡了…",
    color: "#818CF8",
    glow: 0.45,
    animation: "droop",
    priority: 5,
    ttlMs: 0,
    fallback: "idle",
    interruptible: true,
    group: "self"
  },
  listening: {
    label: "在听",
    bubble: "我在听",
    color: "#22D3EE",
    glow: 0.6,
    animation: "look",
    priority: 60,
    ttlMs: 8000,
    fallback: "idle",
    interruptible: true,
    group: "self"
  },
  thinking: {
    label: "思考",
    bubble: "在想…",
    color: "#60A5FA",
    glow: 0.7,
    animation: "bob",
    priority: 40,
    ttlMs: 6000,
    fallback: "idle",
    interruptible: true,
    group: "agent"
  },
  searching: {
    label: "检索",
    bubble: "找一下",
    color: "#2DD4BF",
    glow: 0.6,
    animation: "look",
    priority: 40,
    ttlMs: 6000,
    fallback: "idle",
    interruptible: true,
    group: "agent"
  },
  working: {
    label: "干活",
    bubble: "干活中",
    color: "#34D399",
    glow: 0.7,
    animation: "bounce",
    priority: 50,
    ttlMs: 8000,
    fallback: "idle",
    interruptible: true,
    group: "agent"
  },
  longtask: {
    label: "长任务",
    bubble: "我先跑着",
    color: "#10B981",
    glow: 0.5,
    animation: "float",
    priority: 45,
    ttlMs: 0,
    fallback: "idle",
    interruptible: true,
    group: "agent"
  },
  waiting_user: {
    label: "等你回话",
    bubble: "等你一句",
    color: "#FBBF24",
    glow: 0.75,
    animation: "pulse",
    priority: 80,
    ttlMs: 0,
    fallback: "idle",
    interruptible: false,
    group: "agent"
  },
  waiting_approval: {
    label: "等你批准",
    bubble: "需要你点一下",
    color: "#F97316",
    glow: 0.8,
    animation: "shake",
    priority: 90,
    ttlMs: 0,
    fallback: "idle",
    interruptible: false,
    group: "agent"
  },
  success: {
    label: "完成",
    bubble: "搞定",
    color: "#4ADE80",
    glow: 0.8,
    animation: "pop",
    priority: 70,
    ttlMs: 4000,
    fallback: "idle",
    interruptible: true,
    group: "agent"
  },
  error: {
    label: "出错",
    bubble: "出问题了",
    color: "#F87171",
    glow: 0.8,
    animation: "shake",
    priority: 95,
    ttlMs: 6000,
    fallback: "idle",
    interruptible: false,
    group: "agent"
  },
  blocked: {
    label: "卡住",
    bubble: "缺个东西",
    color: "#A78BFA",
    glow: 0.6,
    animation: "sway",
    priority: 85,
    ttlMs: 0,
    fallback: "idle",
    interruptible: false,
    group: "agent"
  },
  celebrating: {
    label: "庆祝",
    bubble: "耶！",
    color: "#FCD34D",
    glow: 0.9,
    animation: "cheer",
    priority: 100,
    ttlMs: 5000,
    fallback: "idle",
    interruptible: true,
    group: "self"
  }
};

const STATE_ID_PATTERN = /^[a-z][a-z0-9_]{0,31}$/;
const HEX_COLOR_PATTERN = /^#[0-9a-fA-F]{6}$/;
const DEFAULT_TTL_MS = 5000;
const MAX_TTL_MS = 60 * 60 * 1000;

function isPlainObject(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function isValidStateId(value) {
  return typeof value === "string" && STATE_ID_PATTERN.test(value);
}

function clampNumber(value, min, max, fallbackValue) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return fallbackValue;
  return Math.min(Math.max(numeric, min), max);
}

function normalizeColor(value, fallbackValue) {
  if (typeof value !== "string") return fallbackValue;
  const trimmed = value.trim();
  return HEX_COLOR_PATTERN.test(trimmed) ? trimmed.toLowerCase() : fallbackValue;
}

function normalizeText(value, maxLength, fallbackValue) {
  if (typeof value !== "string") return fallbackValue;
  return value.replace(/\s+/g, " ").trim().slice(0, maxLength);
}

function normalizeIterations(value, fallbackValue) {
  if (value === "infinite") return "infinite";
  if (value === null || value === undefined) return fallbackValue;
  const numeric = Math.round(Number(value));
  if (!Number.isFinite(numeric) || numeric < 1) return fallbackValue;
  return Math.min(numeric, 50);
}

function normalizeStateEntry(id, source, base) {
  const meta = isPlainObject(source) ? source : {};
  const animationId = STATE_ANIMATION_IDS.includes(meta.animation) ? meta.animation : base.animation;
  const preset = STATE_ANIMATION_PRESETS[animationId] || STATE_ANIMATION_PRESETS.none;
  const durationOverride = Number(meta.animationDurationMs);

  return {
    label: normalizeText(meta.label, 32, base.label || id),
    bubble: normalizeText(meta.bubble, 80, base.bubble),
    color: normalizeColor(meta.color, base.color),
    glow: clampNumber(meta.glow, 0, 1, base.glow),
    animation: animationId,
    // null 表示跟随预设；展开成数字后渲染层直接用，不必再查预设表。
    animationDurationMs: Number.isFinite(durationOverride) && durationOverride >= 100
      ? Math.min(Math.round(durationOverride), 60000)
      : preset.durationMs,
    animationIterations: normalizeIterations(meta.animationIterations, preset.iterations),
    animationEasing: preset.easing,
    priority: Math.round(clampNumber(meta.priority, 0, 100, base.priority)),
    ttlMs: Math.round(clampNumber(meta.ttlMs, 0, MAX_TTL_MS, base.ttlMs)),
    fallback: typeof meta.fallback === "string" ? meta.fallback.trim().toLowerCase() : base.fallback,
    interruptible: typeof meta.interruptible === "boolean" ? meta.interruptible : base.interruptible,
    alwaysApply: typeof meta.alwaysApply === "boolean" ? meta.alwaysApply : Boolean(base.alwaysApply),
    group: STATE_GROUP_IDS.includes(meta.group) ? meta.group : base.group,
    enabled: typeof meta.enabled === "boolean" ? meta.enabled : base.enabled
  };
}

/**
 * 把用户配置合并成完整注册表：默认表打底，用户只写想改的字段。
 * 传 null 表示删除这个状态。
 */
function normalizeStateRegistry(raw) {
  const source = isPlainObject(raw) ? raw : {};
  const registry = {};

  for (const [id, meta] of Object.entries(DEFAULT_STATE_REGISTRY)) {
    registry[id] = normalizeStateEntry(id, meta, normalizeStateEntry(id, {}, FALLBACK_META));
  }

  for (const [id, override] of Object.entries(source)) {
    if (!isValidStateId(id)) continue;
    if (override === null) {
      delete registry[id];
      continue;
    }
    if (!isPlainObject(override)) continue;
    const base = registry[id] || normalizeStateEntry(id, {}, FALLBACK_META);
    registry[id] = normalizeStateEntry(id, { ...base, ...override }, base);
  }

  // fallback 必须指向真实存在的状态，否则清除状态时会卡住。
  for (const [id, meta] of Object.entries(registry)) {
    if (meta.fallback === id) meta.fallback = "";
    if (meta.fallback && !registry[meta.fallback]) {
      meta.fallback = Object.prototype.hasOwnProperty.call(registry, "idle") ? "idle" : "";
    }
  }

  return registry;
}

/** 解析状态别名，返回注册表里真实存在的 id；不存在返回 null。 */
function resolveStateId(registry, value) {
  if (typeof value !== "string") return null;
  const raw = value.trim().toLowerCase();
  if (!raw) return null;
  const id = STATE_ALIASES[raw] || raw;
  if (!isValidStateId(id)) return null;
  return Object.prototype.hasOwnProperty.call(registry, id) ? id : null;
}

function getStateMeta(registry, value) {
  const id = resolveStateId(registry, value);
  return id ? registry[id] : null;
}

function isStateEnabled(registry, value) {
  const meta = getStateMeta(registry, value);
  return Boolean(meta && meta.enabled !== false);
}

/** 按优先级从高到低列出状态，同优先级按 id 排序，方便面板稳定渲染。 */
function listStates(registry) {
  return Object.entries(registry)
    .map(([id, meta]) => ({ id, ...meta }))
    .sort((a, b) => (b.priority - a.priority) || a.id.localeCompare(b.id));
}

/**
 * P1-05 的基础仲裁：只判断「新状态能不能顶掉正在显示的」。
 * P1-06 会在此基础上加互斥组、排队与打断规则。
 */
function shouldApplyState(registry, current, next) {
  if (!current) return true;
  const nextMeta = typeof next === "string" ? getStateMeta(registry, next) : next;
  if (!nextMeta) return false;
  if (current.id === nextMeta.id) return true;
  // idle / offline 这类「回到基准」的状态永远放行，否则状态会卡在高优先级上。
  if (nextMeta.alwaysApply) return true;
  if (current.interruptible === false) return nextMeta.priority > current.priority;
  return nextMeta.priority >= current.priority;
}

/** 多来源同时上报时挑一个最该被看见的（P2-07 会用到），同级先到先用。 */
function pickDominantState(registry, states) {
  if (!Array.isArray(states) || states.length === 0) return null;
  let best = null;
  for (const candidate of states) {
    const meta = getStateMeta(registry, candidate);
    if (!meta || meta.enabled === false) continue;
    if (!best || meta.priority > best.priority) {
      best = meta;
    }
  }
  return best;
}

function getDefaultTtlMs(meta) {
  if (!meta) return DEFAULT_TTL_MS;
  return meta.ttlMs > 0 ? meta.ttlMs : 0;
}

module.exports = {
  DEFAULT_STATE_REGISTRY,
  STATE_ALIASES,
  STATE_ANIMATION_IDS,
  STATE_ANIMATION_PRESETS,
  STATE_GROUP_IDS,
  DEFAULT_TTL_MS,
  MAX_TTL_MS,
  FALLBACK_META,
  getDefaultTtlMs,
  getStateMeta,
  isStateEnabled,
  isValidStateId,
  listStates,
  normalizeStateRegistry,
  pickDominantState,
  resolveStateId,
  shouldApplyState
};
