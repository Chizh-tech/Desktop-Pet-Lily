# 更新日志

Lily 的重要变更记录。格式参考 [Keep a Changelog](https://keepachangelog.com/zh-CN/1.1.0/)，版本号遵循[语义化版本](https://semver.org/lang/zh-CN/)。

> 0.1.1 及更早的条目属于上游 Desktop Pet，见[上游 CHANGELOG](https://github.com/duzexu/desktop-pet/blob/master/CHANGELOG.md)。

## [未发布]

## [0.1.2] - 2026-11-05

### 变更

- 品牌化：应用名 `Lily`、appId `com.chizh.lily`、打包产物 `Lily-windows-<版本>.exe`，窗口标题 / 托盘 / 关于页 / 更新检查仓库全部改为本项目。
- 用户数据目录 `desktop-pet` → `Lily`，首次启动自动迁移，旧目录保留不删除。
- 清掉上游残留：官网营销站（22MB）、GitHub Pages 工作流、赞助物料、上游 AGENTS/CHANGELOG、landing 相关脚本与测试。

### 新增

- 本机状态桥接 `agent-bridge`：`POST http://127.0.0.1:17890/state` → IPC → 宠物窗，仅回环、状态白名单、文本截断。
- 状态上报 CLI `tools/lily-state.mjs`（`npm run lily`、`npm run lily:demo`）。
- 宠物窗 5 种状态视觉（thinking / working / waiting / done / error），含 `prefers-reduced-motion` 降级。
- `README.md`、`NOTICE.md`、`LILY_ROADMAP.md`、`AGENTS.md`、`docs/DEVELOPMENT.md` 按 Lily 重写。

## 上游版本

- `0.1.1` — 2026-07-17
- 更早版本见[上游 CHANGELOG](https://github.com/duzexu/desktop-pet/blob/master/CHANGELOG.md)
