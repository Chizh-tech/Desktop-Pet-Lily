# AGENTS.md

本文件是给在本仓库工作的 AI 编码代理（Codex / Copilot / WorkBuddy 等）的约定。人类开发文档见 [docs/DEVELOPMENT.md](docs/DEVELOPMENT.md)。

## 项目定位

Lily 是一只住在 Windows 桌面上的元气少女桌宠：透明置顶窗口、可交互、能感知 AI 工作状态、有成长与记忆。基于 [duzexu/desktop-pet](https://github.com/duzexu/desktop-pet) 二次开发，遵循 **GPL-3.0**。

## 常用命令

```bash
npm run dev          # 启动 Electron
npm test             # Vitest 单元测试
npm run test:e2e     # Playwright E2E（含 Electron smoke）
npm run build        # Vite 构建 renderer
npm run pack         # 打包应用目录
npm run dist         # 生成安装器

npm run lily -- <state> "文本" --ttl 5000   # 推送状态给宠物
npm run lily -- --health                    # 查桥接
```

环境坑：若终端里 `ELECTRON_RUN_AS_NODE=1`，Electron 会以 Node 模式启动并报 `app.whenReady is not a function`，先 `unset ELECTRON_RUN_AS_NODE`。

## 架构概览

三进程 Electron 应用，安全边界清晰：

1. **Main**（`src/main/`）：`main.js` 引导；`windows.js` 宠物窗（320×320 透明无框置顶）与面板窗（960×680）；`ipc.js` IPC 注册表；`services/` 下 `config-store` / `asset-store` / `petpack` / `agent-bridge` / `user-data-migration`。
2. **Preload**（`src/preload/`）：`contextBridge` 暴露最小 API，renderer 不直接接触 Node.js。
3. **Renderer**（`src/renderer/`）：`pet/` 渲染宠物、动画队列、规则运行时、动作执行；`panel/` 控制面板多标签页。

共享层 `src/shared/`：配置 schema、默认值、规则引擎、校验、i18n（中英双语，新增文案必须两边都加）。

## 开发约定

- **证据优先**：界面只展示有事件依据的状态。拿不到细节就显示粗粒度或"未确认"，不臆测内容。这条不可为了效果好看而放宽。
- **本机优先**：任何监听只绑 `127.0.0.1`，不做云端上报、不加遥测。
- **仅元数据**：默认不采集对话正文、工具参数与返回内容。需要正文的功能必须默认关闭且本地存储。
- **只读观测**：Lily 不改动任何 AI 工具的权限、审批或执行结果。
- **状态走白名单**：新增状态先在 `src/main/services/agent-bridge.js` 白名单登记，再到 `pet.css` 给视觉，最后补 `tools/lily-state.mjs` 的 help。三者缺一不可。
- **文案双语**：`src/shared/i18n.js` 中英文案成对修改，不留单边。
- **配置迁移**：改 `userData` 目录或配置结构时写迁移，别让用户丢设置；迁移失败要能回滚。
- **日志**：在 IPC 边界、素材导入、规则匹配、状态迁移、动画播放、错误分支上加结构化 debug 日志，用现有 logger helper。

## 不要做的事

- 不要恢复已删除的上游营销站（`landing/`）、GitHub Pages 工作流、上游赞助物料。
- 不要把密钥、`cloudbase.txt`、个人课表原始数据提交进仓库。
- 不要为兼容旧本地数据加兼容层；项目还在早期，宁可写迁移或直接重置。
- 不要绕过 `agent-bridge` 让 renderer 直连外部服务。

## 产品进度

功能清单与阶段划分在 [LILY_ROADMAP.md](LILY_ROADMAP.md)，开工前先看它，完成后勾选并更新「决策记录」。
