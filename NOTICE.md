# NOTICE

## 上游项目

Lily 基于 **Desktop Pet** 二次开发：

- 项目：https://github.com/duzexu/desktop-pet
- 作者：tao（duzexu）
- 许可证：GPL-3.0
- 本项目保留原始 [`LICENSE`](LICENSE) 全文

按 GPL-3.0 要求，Lily 同样以 GPL-3.0 发布，任何分发都需附带完整源码。

## 本项目的修改

相对上游 `0.1.1`，当前已修改：

| 范围 | 修改 |
|---|---|
| 品牌 | 应用名、appId、窗口标题、托盘提示、关于页文案改为 Lily；`userData` 目录迁移到 `%APPDATA%/Lily`（含旧目录一次性复制） |
| 外链 | 更新检查与官方链接指向本仓库，不再指向上游 Releases |
| 新增 | `src/main/services/agent-bridge.js`：仅回环的 HTTP 状态入口，转发到宠物窗口 |
| 新增 | `src/main/services/user-data-migration.js`：旧数据目录迁移 |
| 新增 | `src/preload` 的 `onAgentState`、渲染层 `applyAgentState()` 与 `.state-*` 样式 |
| 新增 | `tools/lily-state.mjs`：状态上报 CLI |

## 素材说明

当前形象为上游自带的占位 SVG（`src/assets/default-pet/`），**不是最终形象**。
Lily 的正式形象上线前，请勿将本项目用于对外分发或商用展示。

## 分发提醒

- 本项目依赖 `ffmpeg-static`（GPL/LGPL 组件），打包时保持其许可证文件完整
- 不得移除本文件与 `LICENSE`
