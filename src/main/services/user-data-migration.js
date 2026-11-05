const fs = require("node:fs");
const path = require("node:path");

/**
 * 把旧版（Desktop Pet）的 userData 迁移到 Lily 目录。
 * 只在目标目录不存在时复制，绝不覆盖已有数据；失败不阻塞启动。
 */
function migrateUserData({ appDataDir, from = "desktop-pet", to = "Lily" }) {
  const source = path.join(appDataDir, from);
  const target = path.join(appDataDir, to);

  const result = { migrated: false, from: source, to: target, reason: "" };

  if (source === target) {
    result.reason = "same-path";
    return result;
  }
  if (!fs.existsSync(source)) {
    result.reason = "no-source";
    return result;
  }
  if (fs.existsSync(target)) {
    result.reason = "target-exists";
    return result;
  }

  try {
    fs.cpSync(source, target, { recursive: true, force: false, errorOnExist: false });
    // 留下标记，避免以后误以为迁移没发生又重复拷贝。
    fs.writeFileSync(
      path.join(target, ".migrated-from.json"),
      JSON.stringify({ from: source, at: new Date().toISOString() }, null, 2),
      "utf8"
    );
    result.migrated = true;
    result.reason = "copied";
    return result;
  } catch (error) {
    // 清理半成品目录，保证下次启动还能重试。
    try {
      fs.rmSync(target, { recursive: true, force: true });
    } catch {
      // 忽略清理失败
    }
    result.reason = `failed: ${error.message}`;
    return result;
  }
}

module.exports = { migrateUserData };
