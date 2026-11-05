# Lily 开发指南

本文档是 Lily 的开发者入口：本地开发、目录结构、运行模型和状态桥接。宠物包制作看 [用户手册](USER_GUIDE.md)，待办进度看 [路线图](../LILY_ROADMAP.md)。

Lily 基于 [duzexu/desktop-pet](https://github.com/duzexu/desktop-pet) 二次开发（GPL-3.0）。二次开发约定见 [NOTICE.md](../NOTICE.md)。

## 开发环境

Node.js 20+ 与 npm，克隆后安装依赖：

```bash
npm install
```

拉起 Electron：

```bash
npm run dev
```

> **环境坑**：若终端里存在 `ELECTRON_RUN_AS_NODE=1`（某些 Agent / IDE 的集成终端会注入），Electron 会以 Node 模式启动并报 `app.whenReady is not a function`。先 `unset ELECTRON_RUN_AS_NODE` 再运行。

## 常用命令

```bash
# 应用
npm run dev              # 启动开发环境
npm run build            # 构建 renderer
npm run pack             # 打包应用目录，不生成安装器
npm run dist             # 生成可分发安装器

# 状态桥接（Lily 专用）
npm run lily -- thinking "在想…"    # 推送一个状态
npm run lily -- --health           # 查桥接端口与状态
npm run lily:demo                  # 依次走完全部状态

# 测试
npm test                 # Vitest 单元测试
npm run test:watch       # watch 模式
npm run test:e2e         # Playwright E2E（含 Electron smoke）
npm run test:e2e:ci      # headless 环境，跳过 Electron smoke
```

> 若 `npm run dev` 报 `app.whenReady` 相关错误，先在终端里执行 `unset ELECTRON_RUN_AS_NODE`，再重新运行 `npm run dev`。

## 项目结构

```text
02_Lily/
├── src/
│   ├── main/                 # 主进程：窗口、托盘、IPC、本机服务
│   │   └── services/
│   │       ├── agent-bridge.js        # 状态入口：127.0.0.1 HTTP → IPC
│   │       └── user-data-migration.js # desktop-pet → Lily 用户数据迁移
│   ├── preload/              # contextBridge 暴露的受控 API
│   ├── renderer/
│   │   ├── pet/              # 宠物窗口：渲染、动画队列、规则运行时
│   │   └── panel/            # 控制面板：标签页、组件、事件处理
│   └── shared/               # schema、规则引擎、校验、i18n
├── tools/lily-state.mjs      # 状态上报 CLI（npm run lily）
├── tests/                    # Vitest 与 Playwright
├── docs/                     # 开发、用户、架构、发布文档
└── build/                    # 打包图标（图标待 P1 替换）
```

## Electron 运行模型

三个安全边界清晰的部分：

1. **Main Process**：窗口、托盘、IPC、文件、Petpack、全局鼠标、状态桥接。
2. **Preload Scripts**：用 `contextBridge` 暴露有限 API，renderer 不碰 Node.js。
3. **Renderer Processes**：`pet/` 渲染宠物，`panel/` 提供配置界面。

模块职责与扩展点见 [当前架构](architecture/current-architecture.md)，面板模块见 [Panel Architecture](panel-architecture.md)。

## 核心数据流

### 配置更新

```text
Panel 保存表单
→ config:save IPC
→ Main 持久化并广播 pet:runtime-updated
→ Pet renderer 重建动画与规则运行时
```

### Petpack 导入

```text
选择 .petpack
→ Main 校验、解压、原子安装
→ 切换当前素材包
→ Pet renderer 重新加载素材与规则
```

### 规则执行

```text
DOM / 全局鼠标 / timer 事件
→ pet.js 构建事件上下文
→ ruleRuntime.evaluateEvent() 匹配规则
→ UserTriggerManager.executeAction() 执行动画、消息、窗口动作
```

默认多条件匹配窗口 1000ms，需要更长窗口时在规则上显式设置 `conditionWindowMs`。

### 外部状态（Lily 新增）

```text
任意程序 / 脚本
→ POST http://127.0.0.1:17890/state   { state, text, ttlMs, source }
→ agent-bridge 校验白名单 + 截断文本
→ pet:agent-state IPC
→ pet.js applyAgentState() 加状态类 + 气泡，TTL 到期复位
```

约束：只绑 `127.0.0.1`；端口占用时顺延并写日志；状态走白名单，未知状态丢弃；不采集正文。

## 测试与构建

- 改共享逻辑或 renderer 行为 → `npm test`
- 改窗口启动、IPC 或完整交互 → `npm run test:e2e`
- 无法启动 Electron 的 CI → `npm run test:e2e:ci`
- 发布前 `npm run build`，再 `npm run pack` 或 `npm run dist`

已知环境性失败（与代码无关）：Windows symlink EPERM、ffmpeg 探测空输出、日志文件锁。

## 相关文档

- [当前架构（含动画队列）](architecture/current-architecture.md)
- [控制面板架构](panel-architecture.md)
- [状态型规则设计](stateful-rules-design.md)
- [事件总线历史设计](architecture/event-bus-design.md)
- [客户端需求文档（上游）](requirements/desktop-client-prd.md)
- [发布清单](release/client-release-checklist.md)
