# 更新日志

Lily 的重要变更记录。格式参考 [Keep a Changelog](https://keepachangelog.com/zh-CN/1.1.0/)，版本号遵循[语义化版本](https://semver.org/lang/zh-CN/)。

> 0.1.1 及更早的条目属于上游 Desktop Pet，见[上游 CHANGELOG](https://github.com/duzexu/desktop-pet/blob/master/CHANGELOG.md)。

## [未发布]

## [0.1.5] - 2026-11-05

### 新增

- 状态注册表：14 个内置状态（离线 / 空闲 / 睡着 / 在听 / 思考 / 检索 / 干活 / 长任务 / 等你回话 / 等你批准 / 完成 / 出错 / 卡住 / 庆祝）全部搬进 `config.states`，颜色、发光、动效、文案、优先级、超时、回落目标都可改。
- 控制面板新增「状态」页：逐项编辑、即时预览（可以带着没保存的修改试效果）、新增自定义状态、删除自定义状态、一键恢复默认。
- `states:preview` / `states:meta` 两个 IPC 通道，面板不用把默认值硬编码在自己身上。
- 状态优先级仲裁：高优先级顶掉低优先级，`interruptible: false` 的状态只能被更高优先级打断。
- `alwaysApply` 标记：`idle` / `offline` 永远能复位，不会被卡在高优先级状态上。
- 状态别名：`waiting` → `waiting_user`、`done` → `success`、`failed` → `error`，老脚本不用改。

### 变更

- 状态视觉从「每个状态一条 CSS 规则」改成「数据驱动」：CSS 只定义 12 个关键帧，运行时写入 `data-lily-state` / `data-lily-anim` 与 `--lily-anim-*` / `--lily-state-glow`。
- 状态默认超时取自注册表，状态填 0 表示长驻，不再一律 5 秒回落。
- agent-bridge 的状态白名单改为读配置，新增状态不需要重启改代码。
- `npm run lily -- --health` 现在会返回完整注册表。

## [0.1.4] - 2026-11-05

### 新增

- 待机呼吸：4.2s 的轻微缩放 + 9.4s 的重心摇摆，Lily 不再是一张静止图片。
- 眨眼：叠加闭眼帧 92–118ms，间隔 2.6–6.4s，16% 概率连眨两下。
- `assets/idle-blink.png`：与 `idle.png` 同画布的闭眼帧（332×560）。
- `animations.blink` 配置槽：素材包提供闭眼帧就眨眼，没有就自动降级为不闪。

### 变更

- 精灵内部新增 `#pet-sprite-stage` 层，媒体元素改为绝对定位铺满；呼吸动画挂在这一层，避免和状态类的 `transform` 抢属性。
- 配置合并对 `animations` 改为深合并，老配置不会因为缺 `blink` 字段而永远眨不了眼。

## [0.1.3] - 2026-11-05

### 新增

- Lily 形象第一版上线：`idle`（双手叉腰）/ `click`（举臂欢呼）/ `drag`（悬空张开手），透明 PNG，替换原来的蓝色占位图形。
- `docs/lily-character-spec.md`：形象规范（比例、画布、配色、分层与表情参数表、状态映射），外加参考图集条目与版权边界。
- `src/shared/legacy-assets.js`：内置素材改名迁移（`assets/*.svg` → `.png`），老配置和老 manifest 读取时自动纠正。
- 内置包在启动时补齐新增素材（只补缺失文件，不覆盖用户改过的素材）。

### 变更

- 图片生成流程存档在规范文档第 12 节：img2img 保持一致 + 连通域泛洪抠背景。

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
