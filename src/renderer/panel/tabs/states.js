/**
 * States tab（P1-05 的配置界面，P1-07 的雏形）
 *
 * 页面完全由 config.states 驱动：每个状态一张卡片，改完保存即可生效。
 * 内置状态只能禁用，不能删除；自定义状态可以删。
 */

import { escapeHtml, checked, selected } from "../ui/utils.js";
import { renderHeader } from "../ui/header.js";
import { t } from "../../../shared/i18n.js";

const STATE_ID_PATTERN = /^[a-z][a-z0-9_]{0,31}$/;

const NEW_STATE_DEFAULTS = {
  label: "",
  bubble: "",
  color: "#cbd5e1",
  glow: 0.6,
  animation: "breathe",
  animationDurationMs: null,
  animationIterations: null,
  priority: 50,
  ttlMs: 5000,
  fallback: "idle",
  interruptible: true,
  group: "custom",
  enabled: true
};

function sortEntries(states) {
  return Object.entries(states || {}).sort((a, b) => {
    const priorityDiff = (Number(b[1].priority) || 0) - (Number(a[1].priority) || 0);
    return priorityDiff !== 0 ? priorityDiff : a[0].localeCompare(b[0]);
  });
}

function renderAnimationOptions(presets, current) {
  const options = presets.length
    ? presets
    : [{ id: current || "none", label: current || "none" }];
  return options.map((preset) => `
    <option value="${escapeHtml(preset.id)}" ${selected(current, preset.id)}>${escapeHtml(preset.label)}</option>
  `).join("");
}

function renderFallbackOptions(states, current) {
  return [`<option value="" ${selected(current, "")}>—</option>`]
    .concat(Object.keys(states).sort().map((id) => `
      <option value="${escapeHtml(id)}" ${selected(current, id)}>${escapeHtml(id)}</option>
    `))
    .join("");
}

function renderStateCard(id, meta, { states, presets, isBuiltin }) {
  const label = escapeHtml(meta.label || id);
  return `
    <section class="panel-section state-card" data-state-card="${escapeHtml(id)}">
      <div class="section-header">
        <h3>${label} <code class="state-card-id">${escapeHtml(id)}</code>${
          isBuiltin ? "" : ` <span class="state-card-tag">${escapeHtml(t("states.customTag"))}</span>`
        }</h3>
        <div class="header-actions state-card-actions">
          <label class="toggle compact-toggle">
            <span>${t("states.enabled")}</span>
            <input type="checkbox" data-field="enabled" ${checked(meta.enabled !== false)}>
          </label>
          <button type="button" data-action="states-preview" data-state-id="${escapeHtml(id)}">${t("states.preview")}</button>
          ${isBuiltin ? "" : `<button class="button-danger" type="button" data-action="states-delete" data-state-id="${escapeHtml(id)}">${t("states.delete")}</button>`}
        </div>
      </div>
      <div class="section-body state-card-body">
        <div class="grid-2">
          <label class="field">
            <span>${t("states.label")}</span>
            <input type="text" data-field="label" maxlength="32" value="${label}">
          </label>
          <label class="field">
            <span>${t("states.bubble")}</span>
            <input type="text" data-field="bubble" maxlength="80" placeholder="${t("states.noBubble")}" value="${escapeHtml(meta.bubble || "")}">
          </label>
          <label class="field">
            <span>${t("states.color")}</span>
            <input type="color" data-field="color" value="${escapeHtml(meta.color || "#cbd5e1")}">
          </label>
          <label class="field">
            <span>${t("states.glow")} <small>${Number(meta.glow ?? 0.6).toFixed(2)}</small></span>
            <input type="range" data-field="glow" min="0" max="1" step="0.05" value="${Number(meta.glow ?? 0.6)}">
          </label>
          <label class="field">
            <span>${t("states.animation")}</span>
            <select data-field="animation">${renderAnimationOptions(presets, meta.animation)}</select>
          </label>
          <label class="field">
            <span>${t("states.priority")}</span>
            <input type="number" data-field="priority" min="0" max="100" step="1" value="${Number(meta.priority) || 0}">
          </label>
          <label class="field">
            <span>${t("states.ttl")}</span>
            <input type="number" data-field="ttlMs" min="0" max="3600000" step="500" value="${Number(meta.ttlMs) || 0}">
          </label>
          <label class="field">
            <span>${t("states.fallback")}</span>
            <select data-field="fallback">${renderFallbackOptions(states, meta.fallback || "")}</select>
          </label>
        </div>
        <p class="muted state-hint">${t("states.ttlHint")}</p>
        <label class="toggle">
          <span>${t("states.interruptible")}</span>
          <input type="checkbox" data-field="interruptible" ${checked(meta.interruptible !== false)}>
        </label>
      </div>
    </section>
  `;
}

export function renderStates(panelState, config) {
  const states = config.states || {};
  const meta = panelState.statesMeta || {};
  const defaultIds = new Set(meta.defaultIds || []);
  const presets = Array.isArray(meta.presets) ? meta.presets : [];
  const entries = sortEntries(states);

  return `
    ${renderHeader(t("states.title"), t("states.description"))}
    <div class="form-actions states-toolbar">
      <button class="button-primary" type="button" data-action="states-save">${t("states.save")}</button>
      <button type="button" data-action="states-reset">${t("states.reset")}</button>
      <span class="muted">${t("states.count", { count: String(entries.length) })}</span>
    </div>
    <section class="panel-section">
      <div class="section-header"><h3>${t("states.add")}</h3></div>
      <div class="section-body states-add-row">
        <label class="field">
          <span>${t("states.id")}</span>
          <input type="text" id="states-new-id" maxlength="32" placeholder="deploy">
        </label>
        <label class="field">
          <span>${t("states.label")}</span>
          <input type="text" id="states-new-label" maxlength="32" placeholder="${t("states.newLabelPlaceholder")}">
        </label>
        <button type="button" data-action="states-add">${t("states.addButton")}</button>
      </div>
    </section>
    ${entries.map(([id, entry]) => renderStateCard(id, entry, {
      states,
      presets,
      isBuiltin: defaultIds.has(id)
    })).join("")}
  `;
}

export function readCardFields(card, base) {
  const field = (name) => card.querySelector(`[data-field="${name}"]`);
  const source = base || {};
  const labelInput = field("label");
  const bubbleInput = field("bubble");
  const colorInput = field("color");
  const glowInput = field("glow");
  const animationInput = field("animation");
  const priorityInput = field("priority");
  const ttlInput = field("ttlMs");
  const fallbackInput = field("fallback");
  const interruptibleInput = field("interruptible");
  const enabledInput = field("enabled");

  const animation = animationInput ? animationInput.value : source.animation;
  // 换了动效就让时长跟随新预设，否则沿用原值（可能是用户手改过的）。
  const animationChanged = animation !== source.animation;

  return {
    ...source,
    label: labelInput ? labelInput.value.trim() : source.label,
    bubble: bubbleInput ? bubbleInput.value.trim() : source.bubble,
    color: colorInput ? colorInput.value : source.color,
    glow: glowInput ? Number(glowInput.value) : source.glow,
    animation,
    animationDurationMs: animationChanged ? null : (source.animationDurationMs ?? null),
    animationIterations: animationChanged ? null : (source.animationIterations ?? null),
    priority: priorityInput ? Number(priorityInput.value) : source.priority,
    ttlMs: ttlInput ? Number(ttlInput.value) : source.ttlMs,
    fallback: fallbackInput ? fallbackInput.value : source.fallback,
    interruptible: interruptibleInput ? interruptibleInput.checked : source.interruptible,
    enabled: enabledInput ? enabledInput.checked : source.enabled
  };
}

export function collectStates(rootEl, config) {
  const states = {};
  const cards = rootEl.querySelectorAll("[data-state-card]");
  cards.forEach((card) => {
    const id = card.dataset.stateCard;
    if (!id) return;
    states[id] = readCardFields(card, (config.states && config.states[id]) || {});
  });
  return states;
}

export function createStateActionHandler({ rootEl, state, api, saveConfig, render, showBanner }) {
  return async function handleStatesAction(event) {
    const button = event.target.closest && event.target.closest("[data-action]");
    if (!button) return false;
    const action = button.dataset.action || "";
    if (!action.startsWith("states-")) return false;

    event.preventDefault();
    if (state.savingKey) return true;

    if (action === "states-save") {
      const states = collectStates(rootEl, state.config);
      await saveConfig({ ...state.config, states }, "states");
      return true;
    }

    if (action === "states-preview") {
      const id = button.dataset.stateId;
      const card = rootEl.querySelector(`[data-state-card="${id}"]`);
      const base = (state.config.states && state.config.states[id]) || {};
      const override = card ? readCardFields(card, base) : null;
      const result = api && api.states && api.states.preview
        ? await api.states.preview({
          state: id,
          text: override ? override.bubble : "",
          ttlMs: 3000,
          force: true,
          override
        })
        : { ok: false, error: "preview unavailable" };
      if (!result || result.ok === false) {
        showBanner(t("states.previewFailed", { reason: (result && result.error) || "unknown" }));
      }
      return true;
    }

    if (action === "states-add") {
      const idInput = rootEl.querySelector("#states-new-id");
      const labelInput = rootEl.querySelector("#states-new-label");
      const id = idInput ? idInput.value.trim().toLowerCase() : "";
      if (!STATE_ID_PATTERN.test(id)) {
        showBanner(t("states.invalidId"));
        return true;
      }
      if (state.config.states && state.config.states[id]) {
        showBanner(t("states.duplicateId", { id }));
        return true;
      }
      const label = labelInput && labelInput.value.trim() ? labelInput.value.trim() : id;
      state.config.states = {
        ...state.config.states,
        [id]: { ...NEW_STATE_DEFAULTS, label }
      };
      render();
      return true;
    }

    if (action === "states-delete") {
      const id = button.dataset.stateId;
      const defaultIds = new Set((state.statesMeta && state.statesMeta.defaultIds) || []);
      if (defaultIds.has(id)) {
        showBanner(t("states.cannotDeleteBuiltin"));
        return true;
      }
      const nextStates = { ...state.config.states };
      delete nextStates[id];
      await saveConfig({ ...state.config, states: nextStates }, "states");
      return true;
    }

    if (action === "states-reset") {
      await saveConfig({ ...state.config, states: {} }, "states");
      return true;
    }

    return false;
  };
}
