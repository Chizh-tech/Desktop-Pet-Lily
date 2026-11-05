const fs = require("node:fs");
const path = require("node:path");
const { DEFAULT_CONFIG } = require("../../shared/defaults");
const { migrateAnimationAssets } = require("../../shared/legacy-assets");

function isPlainObject(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function cloneConfigValue(value) {
  return JSON.parse(JSON.stringify(value));
}

// 内置形象从占位 SVG 换成 Lily 的 PNG（v0.1.3）。老配置里写死的 .svg 名字会指向不存在的文件，
// 这里在读取时改名，用户不需要手动重置配置。
function migrateLegacyDefaultAssets(config) {
  const packageId = config.currentPackageId || "default-pet";
  if (packageId !== "default-pet" || !isPlainObject(config.animations)) return config;

  return { ...config, animations: migrateAnimationAssets(config.animations) };
}

function mergeConfig(config) {
  const defaultConfig = cloneConfigValue(DEFAULT_CONFIG);
  const nextConfig = isPlainObject(config) ? cloneConfigValue(config) : {};

  const merged = {
    ...defaultConfig,
    ...nextConfig,
    display: {
      ...defaultConfig.display,
      ...(isPlainObject(nextConfig.display) ? nextConfig.display : {})
    },
    system: {
      ...defaultConfig.system,
      ...(isPlainObject(nextConfig.system) ? nextConfig.system : {})
    },
    interactions: {
      ...defaultConfig.interactions,
      ...(isPlainObject(nextConfig.interactions) ? nextConfig.interactions : {}),
      bubble: {
        ...defaultConfig.interactions.bubble,
        ...(isPlainObject(nextConfig.interactions && nextConfig.interactions.bubble) ? nextConfig.interactions.bubble : {})
      }
    }
  };

  return migrateLegacyDefaultAssets(merged);
}

function createConfigStore(userDataDir) {
  const configPath = path.join(userDataDir, "config.json");

  function ensureUserDataDir() {
    fs.mkdirSync(userDataDir, { recursive: true });
  }

  function load() {
    ensureUserDataDir();

    if (!fs.existsSync(configPath)) {
      return mergeConfig();
    }

    const contents = fs.readFileSync(configPath, "utf8");

    try {
      return mergeConfig(JSON.parse(contents));
    } catch (error) {
      if (error instanceof SyntaxError) {
        return mergeConfig();
      }

      throw error;
    }
  }

  function save(nextConfig) {
    ensureUserDataDir();
    const config = mergeConfig(nextConfig);
    const serialized = JSON.stringify(config, null, 2);
    fs.writeFileSync(configPath, serialized, "utf8");
    return JSON.parse(serialized);
  }

  return {
    configPath,
    load,
    save
  };
}

module.exports = { createConfigStore };
