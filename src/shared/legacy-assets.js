// 内置形象从占位 SVG 换成 Lily 的 PNG（v0.1.3）。老配置与老 manifest 里写死的 .svg 文件名
// 会指向已删除的文件，读取时统一改名，用户不需要重置配置。
// 只影响内置包 default-pet，用户自建素材包不受影响。

const LEGACY_DEFAULT_ASSET_RENAMES = Object.freeze({
  "assets/idle.svg": "assets/idle.png",
  "assets/click.svg": "assets/click.png",
  "assets/drag.svg": "assets/drag.png"
});

function isPlainObject(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function renameLegacyAsset(entry) {
  if (!isPlainObject(entry) || typeof entry.asset !== "string") return entry;
  const renamed = LEGACY_DEFAULT_ASSET_RENAMES[entry.asset];
  return renamed ? { ...entry, asset: renamed } : entry;
}

function migrateAnimationAssets(animations) {
  if (!isPlainObject(animations)) return animations;
  const next = { ...animations, default: renameLegacyAsset(animations.default) };
  if (Array.isArray(animations.clips)) {
    next.clips = animations.clips.map(renameLegacyAsset);
  }
  return next;
}

function hasLegacyAsset(animations) {
  if (!isPlainObject(animations)) return false;
  const entries = [animations.default, ...(Array.isArray(animations.clips) ? animations.clips : [])];
  return entries.some((entry) => isPlainObject(entry) && LEGACY_DEFAULT_ASSET_RENAMES[entry.asset] !== undefined);
}

module.exports = {
  LEGACY_DEFAULT_ASSET_RENAMES,
  migrateAnimationAssets,
  hasLegacyAsset,
  renameLegacyAsset
};
