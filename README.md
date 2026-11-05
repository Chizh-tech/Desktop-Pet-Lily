# Lily

住在 Windows 桌面上的元气少女。看得见你的 AI 在忙什么，陪你上课、提醒你做事、记得你说过的话，也会因为你照顾她而长大。

> 当前状态：`v0.1.1` · 开发中 · 形象仍是占位素材
> 详细计划见 [`LILY_ROADMAP.md`](LILY_ROADMAP.md)

---

## 已经能做什么

- **桌面驻留**：透明、无边框、置顶、可拖拽、可鼠标穿透、托盘常驻，不占主工作区
- **状态联动**：任何程序通过本机 HTTP 把状态推给 Lily，她会换表情光晕并说话
- **素材包**：`.petpack` 导入导出，可更换形象与互动规则
- **番茄钟**：内置计时逻辑（UI 待接）
- **控制面板**：素材、动画、互动规则、显示、系统设置，保存即时生效

## 快速开始

```bash
npm install
npm run dev
```

首次启动会看到宠物窗口 + 控制面板。右键宠物或点托盘图标可重新打开面板。

## 把状态推给 Lily

主进程只监听本机回环地址，端口 `17890`（被占用时自动顺延最多 10 个端口）。

```bash
# 单个状态
npm run lily -- thinking "在想…"
npm run lily -- working "改文件中" --ttl 8000
npm run lily -- waiting_user "等你回一句"
npm run lily -- idle

# 依次演示全部状态
npm run lily:demo

# 查看桥接服务状态与最近一条事件
npm run lily -- --health
```

HTTP 接口：

```http
POST http://127.0.0.1:17890/state
Content-Type: application/json

{ "state": "working", "text": "改文件中", "source": "vscode", "ttlMs": 8000 }

GET  http://127.0.0.1:17890/health
```

状态白名单：`idle` `thinking` `working` `waiting` `done` `error`。
文本会截断到 160 字符，`ttlMs` 到期后自动回到空闲。

## 设计原则

| 原则 | 说明 |
|---|---|
| 证据优先 | 只展示有事件依据的状态；拿不到就显示"未确认"，不猜 |
| 本机优先 | 只监听 `127.0.0.1`，不连云端，不上报遥测 |
| 仅元数据 | 默认不采集对话正文、工具参数与返回内容 |
| 只读观测 | Lily 不改变任何 AI 工具的权限或审批结果 |

## 项目结构

```text
src/
├─ main/                     # 主进程：窗口、托盘、IPC、本机桥接
│  └─ services/
│     ├─ agent-bridge.js     # 状态入口（HTTP → IPC）
│     └─ user-data-migration.js
├─ preload/                  # contextBridge 暴露的最小 API
├─ renderer/
│  ├─ pet/                   # 宠物窗口：渲染、规则引擎、动画
│  └─ panel/                 # 控制面板
└─ shared/                   # 配置默认值、schema、i18n
tools/lily-state.mjs         # 状态上报 CLI
```

## 开发

```bash
npm test          # 单元测试
npm run dev       # 开发模式
npm run pack      # 打包应用目录
npm run dist      # 生成安装包
```

## 许可证与来源

本项目基于 [duzexu/desktop-pet](https://github.com/duzexu/desktop-pet) 二次开发，遵循 **GPL-3.0**。
完整许可证见 [`LICENSE`](LICENSE)，来源与修改说明见 [`NOTICE.md`](NOTICE.md)。

分发给他人时，请一并提供本仓库源码。
