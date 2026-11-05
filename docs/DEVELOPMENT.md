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
→ agent-bridge 查配置里的状态表 + 截断文本
→ pet:agent-state IPC
→ pet.js → state-runtime.apply()
→ 写 data-lily-state / data-lily-anim + CSS 变量 + 气泡，超时回落到 fallback
```

约束：只绑 `127.0.0.1`；端口占用时顺延并写日志；未知 / 停用的状态直接拒绝；不采集正文。

**状态表在哪**：`src/shared/state-registry.js` 是默认值，落盘后以 `config.json` 的 `states` 为准。
加一个状态只需要在默认表里加一条（或在面板「状态」页新增），**不用改 CSS、不用改 bridge 白名单**。
只有需要新动效时，才在 `pet.css` 加一个 `@keyframes lily-state-<名字>`，并在
`STATE_ANIMATION_PRESETS` 登记。

状态字段：

| 字段 | 作用 |
|---|---|
| `label` / `bubble` | 面板显示名 / 默认气泡文案（空字符串 = 不弹） |
| `color` / `glow` | 发光颜色（`#rrggbb`）与强度（0–1，0 = 不发光） |
| `animation` | 动效预设 id，见 `STATE_ANIMATION_PRESETS` |
| `animationDurationMs` / `animationIterations` | 覆盖预设定时，`null` = 跟随预设 |
| `priority` | 0–100，越大越优先 |
| `ttlMs` | 自动回落毫秒数，0 = 一直保持 |
| `fallback` | 超时后回到哪个状态 |
| `interruptible` | `false` 时只能被更高优先级打断 |
| `alwaysApply` | `true` 时无视优先级（`idle` / `offline` 用来复位） |
| `group` | 互斥组，P1-06 用 |
| `enabled` | `false` 时拒绝外部推送，但保留在表里 |

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
