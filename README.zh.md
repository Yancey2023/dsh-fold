# dsh-tool-group

把 DeepSeek Harness（DSH）Web GUI 中**同一个 assistant turn 内连续的工具调用**折叠成一行（Codex 风格）：实时显示"正在运行"的工具名、累计调用数，支持展开/折叠。

实现**纯 Slot / React**：不碰 DOM、不用 MutationObserver、不用 display:none、不用 querySelector；展开后的每张工具卡片都复用官方 renderer。

## 行为

- **分组规则**：`snapshot.chat.order` 中连续且同 turn 的 `tool-call` 节点归为一组。只含 reasoning（Think 行）的 assistant-step 节点是**透明的**：不切断链条、不参与计数，但随组折叠（折叠时隐藏，展开时按原顺序插回调用之间）。只有真正的 assistant **正文**（以及 user/steering、command、compaction…）才切断链条——已用真实 288 调用会话验证：旧规则下每个 step 的 Think 行把链切成 150 组；透明化后同一流只按正文切成 85 组。（DSH 数据模型里每个产生工具调用的 step 都会流式输出 reasoning block，若把 reasoning 当边界，每个调用都会被隔离成独立一组。）
- **运行中**：折叠行只显示当前正在执行的工具（`正在运行 <工具名>`），右侧为累计数量（已完成+运行中）+ 箭头。当前调用结束后自动切换到下一个运行中的调用；全部结束（含 error/cancelled/interrupted——任何 `tool-result` 形态）后左侧留空。
- **展开后**：顶部保留组条（箭头朝下），下方按真实执行顺序渲染**官方 `tool.call.toolview` 分发**的成员卡片——与产品 `ToolCallTree` 完全同一条分发路径，bash/read/grep/web 等卡片、status/参数/输出/错误/subcall/嵌套调用全部保持原生。展开过程中新调用实时追加，不会自动折叠（展开状态保存在组长 seat 的 React state，key 为首个调用的稳定节点 key）。
- **计数**：只统计顶层调用；block 内部的 subcall 不重复计数。

## DSH 版本

针对 **DSH `0.1.0-rc.7`**（`dsh --version`）开发并验证。运行时 overlay 带有方法文本校验，版本不符时 fail-closed（插件保持惰性，官方 UI 照常渲染）。

## 架构 / extension seam

```
ChatView (conversation.view)
  └─ ChatNodeSeat × N
       └─ renderSlot("conversation.chat.node", {node}, {entryKey: kind})
            └─ cell "tool-call":
                 产品: ToolCallTree        (priority 0)
                 本插件: ToolCallGroupView (priority -100 ← 最低者渲染)
                      ├─ 折叠条（运行中工具 · 数量 · chevron）
                      └─ 展开：ToolCallBranch × 成员
                           └─ renderSlot("tool.call.toolview", {callId, toolName,
                                block, cwd, openFile, inspect}, {entryKey: toolName})
                               ← 官方 per-tool 卡片（bash、read、…）
```

1. **Seam**：keyed slot `conversation.chat.node` 的两个单元格，用 priority shadow（slot core 文档明确支持："register at a different priority to shadow it (lowest renders)"）：`tool-call` 单元格由 `ToolCallGroupView` 接管；`assistant-step` 单元格由 `AssistantNodeWrapper` 接管——reasoning-only 且位于工具链内的节点返回 null（Think 行随组折叠），其余（正文、独立思考、中断态）通过实时注册表（`slots.entries`）委托给官方 `AssistantNodeView`。分组完全在 React 里用 `useSession` 读快照计算，不依赖 DOM。
2. **只有组长渲染**：每个 tool-call 节点各有一个 seat；组内第一个节点的 seat 渲染整组，其余 seat 返回 null（零高度），因此每组只出现一行。
3. **唯一一处框架适配**：slot core 禁止第二个条目为已声明的子 slot 重复声明 `children`，而没有该 children 表就拿不到 `tool.call.toolview` 的 `renderSlot` 绑定。`src/client/slots-core-overlay.ts` 在 `SlotCore.prototype.register`/`.releaseEntry` 上安装**可逆 overlay**（与 shell 同一模块实例；ui-slots 是 shell-own static module），把结构完全相同的子 spec 视为共享声明。overlay 是包在官方方法外的**薄包装**（不依赖方法文本），对发布包与压缩后的线上 web bundle 同样有效；卸载时恢复原始方法，产品声明不受任何扰动。这正是 `docs/core-patch.md`（源码级 patch）的内容，以运行时形式交付，因此插件可在未修改的 DSH 上工作。没有这个 overlay，纯 slot API **无法**表达"shadow 一个 keyed renderer 同时还要委托它的子 slot"——这是本插件唯一绕过的架构限制，且 core 改动与插件代码严格分离。

## 安装（web profile）

```bash
pnpm install && pnpm build
# 方式 A —— 官方插件 CLI：
dsh plugin --profile web add /绝对路径/dsh-tool-group
# 方式 B —— 辅助脚本（等价）：
pnpm run install:dsh            # DSH_PROFILE 默认 web
# 重启 web：
dsh --profile web
```

GitHub 安装：`dsh plugin --profile web add github:you/dsh-tool-group`。

## 卸载

```bash
dsh plugin --profile web remove dsh-tool-group
# 或：pnpm run uninstall:dsh
# 重启 web 后官方工具 UI 立即恢复。
```

无残留：slot 条目、overlay、locale 字典、样式表都随插件 fiber/ctx.effect 一并释放。

## 构建与测试

```bash
pnpm install && pnpm build   # tsc --noEmit + esbuild（lib/）
pnpm test                    # 5 套：分组 · overlay（真实 ui-slots）· bundle 冒烟 · 组件渲染 · 完整 slot 管线
```

## 验收映射

| 用例 | 结果 |
| --- | --- |
| 1 单个工具运行中 | `正在运行 bash  1 ▸` |
| 2 read✓ grep✓ bash 运行中 | `正在运行 bash  3 ▸` |
| 3 全部完成 | `3 ▸`，左侧空白 |
| 4 最后一个失败 | `2 ▸`，左侧空白（error 即结束） |
| 5 展开 | 组条 + 官方卡片按序 |
| 6 展开后新调用 | 保持展开、计数增长、成员追加 |
| 7 assistant 正文 | 正文完全不受影响 |
| 8 两段链被正文分隔 | 两条独立组条 |
| 9 流式 | 计数/运行工具实时更新（快照驱动，无轮询） |
| 10 卸载 | 官方 ToolCallTree 自动重新赢得单元格 |

## 已知限制

- 展开态成员渲染复刻了产品内部未导出的 `ToolCall` 小外壳（call-row div + subcall 递归）；真正的卡片全部来自官方 `tool.call.toolview` 条目。没有注册 toolview 的工具使用一个紧凑的主题化兜底卡片（名称/参数/输出/错误），而非产品内部 `GenericToolCard`。
- 组身份 = 首个成员的稳定节点 key。若加载更早历史导致新工具调用插到当前组长之前，组长会移交且该组展开状态重置。
- SlotCore overlay 依赖本版本的两个结构不变量（register 把新条目推入父 record 的 entries；releaseEntry 拆除 `entry.children`）；若未来版本破坏它们，包装器 fail-closed（插件惰性，官方 UI 不受影响）。
- 展开超长链条会重新挂载官方卡片；大量已结束调用默认保持折叠，滚动成本约等于一行。

## 目录

```
src/client/group.ts              纯分组逻辑（有单测）
src/client/ToolCallGroupView.tsx 组行 + 官方成员渲染
src/client/slots-core-overlay.ts 可逆 SlotCore overlay（对应 docs/core-patch.md）
src/client/styles.ts             主题变量 CSS
src/client/index.ts              插件入口（注册）
src/host/index.ts                最小 host 锚点
cordis.patch.yml                 bundle patch 层（host 行）
build.mjs                        tsc + esbuild
scripts/install-dsh.cjs          安装/卸载脚本
test/                            分组 · overlay · bundle 冒烟
docs/core-patch.md               唯一 core 改动（源码级 patch）
```

## License

MIT
