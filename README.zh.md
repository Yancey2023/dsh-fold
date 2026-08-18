# dsh-fold

把 DeepSeek Harness（DSH）Web GUI 中**同一个 assistant turn 内连续的工具调用**折叠成一行（Codex 风格）：实时显示"正在运行"的工具名、累计调用数，支持展开/折叠。**过长的用户输入折叠为 3 行**，带独立的 展开/收起 按钮。

实现**纯 Slot / React**：不碰 DOM、不用 MutationObserver、不用 display:none、不用 querySelector；展开后的每张工具卡片都复用官方 renderer（用户气泡则用官方 primitives 重建）。

## 行为

- **分组规则**：`snapshot.chat.order` 中连续且同 turn 的 `tool-call` 节点归为一组。只含 reasoning（Think 行）的 assistant-step 节点是**透明的**：不切断链条，但随组折叠（折叠时隐藏，展开时按原顺序插回调用之间）。模型重试提示（"已重试模型请求"）同样透明——不会把链条切成独立小条，而是并入它中断的工作组、计入组块数，展开时在对应位置显示。没有相邻工具的 Think 行会折成**自己的条**（纯 Think 组）；正文节点里的 reasoning 部分同样被折叠——**只有 text 保持可见**。只有真正的 assistant **正文**（以及 user/steering、command、compaction…）才切断链条——已用真实 288 调用会话验证：旧规则下每个 step 的 Think 行把链切成 150 组；透明化后同一流只按正文切成 85 组。（DSH 数据模型里每个产生工具调用的 step 都会流式输出 reasoning block，若把 reasoning 当边界，每个调用都会被隔离成独立一组。）
- **运行中**：折叠行只显示当前正在执行的工具（`正在运行 <工具名>`），右侧为累计数量（已完成+运行中）+ 箭头。当前调用结束后自动切换到下一个运行中的调用；全部结束（含 error/cancelled/interrupted——任何 `tool-result` 形态）后左侧留空。
- **展开后**：顶部保留组条（箭头朝下），下方按真实执行顺序渲染**官方 `tool.call.toolview` 分发**的成员卡片——与产品 `ToolCallTree` 完全同一条分发路径，bash/read/grep/web 等卡片、status/参数/输出/错误/subcall/嵌套调用全部保持原生。展开过程中新调用实时追加，不会自动折叠（展开状态保存在组长 seat 的 React state，key 为首个调用的稳定节点 key）。
- **轮次级大折叠**：一轮对话（一条用户消息 + 智能体整轮工作过程）在**结束并给出总结**后，除总结外的所有内容——工具调用、Think 行、中间正文——全部折进一个写着 `该轮次工作过程已折叠` 的大条。小折叠在大折叠**内部**：展开大折叠后小折叠在各自位置重现；总结正文始终可见。未结束的轮次或没有总结的轮次保持现状（仅小折叠）。
- **折叠条文案**：折叠条显示 `N 个块已被折叠`——N 为折叠块数（工具调用 + 随组折叠的 Think 行；block 内部的 subcall 不重复计数）。运行中左侧显示 `正在运行 <工具>`。
- **折叠条显示"当前对话最新状态"**：折叠条左侧显示当前对话**此时此刻正在做什么**——全局最新的活动块（不是组内标签）：流式 Think 行显示 `[Think] · <最新行>`；工作中的工具调用显示其真实行（terminal 调用为 `[icon] Bash · <命令描述>`，以及 `Read · <路径>`、`Search · <查询>`、`ask_user_question · <问题>`……即产品 `toolRowModel` 的逐字复刻）。调用执行中，正在跑的调用即"最新"；调用结束、模型再次思考时，Think 行接替显示；对话空闲时左侧留空。活动块**仅在折叠时**显示——展开后细节就在下方，折叠条左侧置空；真正承载该活动节点的折叠条额外带产品同款扫光动画。
- **非文本块全部折叠**：自动上下文压缩（`compaction`）、上下文注入（`context`）、手动压缩（`manual-compaction`）、用户命令如 `/permission`（`command`）、模型重试提示（`model-retry` ——"已重试模型请求"，**与它打断的周围工作合并成同一个折叠组**，展开时在对应位置重现重试行，并计入组块数）、轮次错误（`turn-error`）、max-tokens 提示（`turn-max-tokens`）、未知面（`unknown`）与 workflow 运行（`workflow-run`）都与其他工作块一样折叠——未结束轮次中各折成自己的 `1 个块已被折叠` 条（可展开，诊断仍可一键到达）；轮次以总结结束后并入轮次级大折叠。只有纯文本（用户/steering 消息、assistant 正文、总结及其复制/操作行）保持可见。
- **用户输入**：文本超过 3 行的用户消息被钳制到 3 行，气泡下方出现 `展开` 按钮（仅当文本确实溢出时显示，用 ResizeObserver 实测）。钳制发生在**无 padding 的内层盒**上（`max-height: 72px` = 恰好 3 × 24px 行高）：任何浏览器都精确渲染 3 行并保留气泡底部空隙——旧式 line-clamp 行为（会露出半行第 4 行并吃掉底部 padding）被 max-height 硬切掉（headless Chromium 实证）。气泡是对产品 `UserStyleBubble` 的忠实复刻，全部由**官方 primitives** 构建（`MessageText`、`/name` `@name` ref chip、`JsonBlock` 附加块、官方 `ImageGallery`、产品同款时间 + 复制按钮并用官方 `writeClipboard`）——是复刻而非委托，因为 Chromium 的 line-clamp 无法穿透嵌套 flex 容器（官方行是 `display:flex`，已用 headless Chromium 实证）。短消息原样渲染（clamp 无效果、按钮隐藏）。
- **滑到顶部自动加载更早（连续）**：滚动到对话最顶部且存在更早历史时自动拉取下一页（`loadOlder`），无需点击按钮；产品的"加载更早"按钮保留作手动兜底。只要用户**继续停在顶部**且 `hasMore` 仍为真，就会一页接一页自动加载，直到历史耗尽或用户滚离顶部（每次加载完成后用刷新后的快照重新武装）。滚动容器通过产品自身的 `scrollerOf` 契约（`[data-conversation-scroll]`）解析，动作走会话作用域的官方 `conversation.loadOlder()`；阈值、`hasMore`、`loadingOlder`、in-flight pump 等守卫防止重复或滚动中途误触发。这是插件唯一一处行为性 DOM 读取（被动 scroll 监听），不做任何修补或改样式。

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
             └─ cell "user":
                  产品: UserMessageNodeView (priority 0)
                  本插件: UserNodeWrapper     (priority -100)
                       └─ 官方 primitives 复刻的气泡 + 3 行钳制 + 展开/收起
             └─ cells "compaction"/"context"/"manual-compaction"/"command":
                  产品: CompactionItem / ContextInjectionRow / … (priority 0)
                  本插件: NoticeNodeWrapper    (priority -100)
                       └─ 一行折叠条；展开显示官方视图（command 保留其
                          commandview 子 slot）
```

1. **Seam**：keyed slot `conversation.chat.node` 的七个单元格，用 priority shadow（slot core 文档明确支持："register at a different priority to shadow it (lowest renders)"）：`tool-call` 单元格由 `ToolCallGroupView` 接管；`assistant-step` 单元格由 `AssistantNodeWrapper` 接管——reasoning-only 且位于工具链内的节点返回 null（Think 行随组折叠），其余（正文、独立思考、中断态）通过实时注册表（`slots.entries`）委托给官方 `AssistantNodeView`；`user` 单元格由 `UserNodeWrapper` 接管——超 3 行的输入钳到 3 行；`compaction`/`context`/`manual-compaction`/`command` 由 `NoticeNodeWrapper` 接管——非文本块折叠成自己的条。分组完全在 React 里用 `useSession` 读快照计算，不依赖 DOM。
2. **只有组长渲染**：每个 tool-call 节点各有一个 seat；组内第一个节点的 seat 渲染整组，其余 seat 返回 null（零高度），因此每组只出现一行。
3. **唯一一处框架适配**：slot core 禁止第二个条目为已声明的子 slot 重复声明 `children`，而没有该 children 表就拿不到 `tool.call.toolview` 的 `renderSlot` 绑定。`src/client/slots-core-overlay.ts` 在 `SlotCore.prototype.register`/`.releaseEntry` 上安装**可逆 overlay**（与 shell 同一模块实例；ui-slots 是 shell-own static module），把结构完全相同的子 spec 视为共享声明。overlay 是包在官方方法外的**薄包装**（不依赖方法文本），对发布包与压缩后的线上 web bundle 同样有效；卸载时恢复原始方法，产品声明不受任何扰动。这正是 `docs/core-patch.md`（源码级 patch）的内容，以运行时形式交付，因此插件可在未修改的 DSH 上工作。没有这个 overlay，纯 slot API **无法**表达"shadow 一个 keyed renderer 同时还要委托它的子 slot"——这是本插件唯一绕过的架构限制，且 core 改动与插件代码严格分离。

## 安装（web profile）

```bash
pnpm install && pnpm build
# 方式 A —— 官方插件 CLI：
dsh plugin --profile web add /绝对路径/dsh-fold
# 方式 B —— 辅助脚本（等价）：
pnpm run install:dsh            # DSH_PROFILE 默认 web
# 重启 web：
dsh --profile web
```

GitHub 安装：`dsh plugin --profile web add github:you/dsh-fold`。

## 卸载

```bash
dsh plugin --profile web remove dsh-fold
# 或：pnpm run uninstall:dsh
# 重启 web 后官方工具 UI 立即恢复。
```

无残留：slot 条目、overlay、locale 字典、样式表都随插件 fiber/ctx.effect 一并释放。

## 构建与测试

```bash
pnpm install && pnpm build   # tsc --noEmit + esbuild（lib/）
pnpm test                    # 13 套：分组 · tool-row · 自动加载 · 大折叠 · overlay（真实 ui-slots）· bundle 冒烟 · 组件 · assistant · user · notice · 完整 slot 管线
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
| 11 超长用户输入 | 气泡精确钳到 3 行，出现 `展开` 按钮 |
| 12 展开用户输入 | 全文可见，`收起` 按钮，复制/时间操作保留 |
| 13 短用户输入 | 原样渲染，无按钮 |
| 14 带图片/引用的用户消息 | 官方图库 + `/name` `@name` chip 保留 |
| 15 组内 bash 运行中 | 条内显示真实块行：`Bash · <描述/命令>` |
| 16 仅 Think 流式（尚无工具） | 条内显示 `Think · <最新行>` |
| 17 全部完成 | 折叠条左侧空白 |
| 18 压缩/注入/命令块 | 折叠为 `1 个块已被折叠`，轮次结束后并入大折叠 |
| 19 旧式 line-clamp 浏览器 | 仍是恰好 3 行 + 底部空隙（无 padding 钳制盒） |
| 20 滑到顶部且有更早历史 | 自动加载下一页（无需点击），每次滚顶只触发一次 |
| 21 中途/无历史/加载中 | 不自动加载 |

## 已知限制

- 展开态成员渲染复刻了产品内部未导出的 `ToolCall` 小外壳（call-row div + subcall 递归）；真正的卡片全部来自官方 `tool.call.toolview` 条目。没有注册 toolview 的工具使用一个紧凑的主题化兜底卡片（名称/参数/输出/错误），而非产品内部 `GenericToolCard`。
- 用户气泡同样是复刻（基于官方 primitives）而非委托：Chromium 的 `-webkit-line-clamp` 无法穿透官方行内的嵌套 flex 布局（已用 headless Chromium 实证），钳制必须落在我们自己的元素上。复刻保留了产品气泡、ref chip、图片、时间与复制操作；若未来 DSH 修改用户气泡外观，复刻 CSS 需同步跟进。
- 折叠条内的"真实块"是产品折叠行模型（`toolRowModel` + 运行中 Think 行）的复刻——标题/摘要与产品行一致，但由插件自行渲染；未来 DSH 若改动行模型的标题或摘要键，需同步 `tool-row.ts`。
- 诊断块（model-retry、turn-error、turn-max-tokens、unknown、workflow-run）同样折叠——按"非文本全折叠"规则，各自折成可展开的 `1 个块已被折叠` 条，失败信息一键可达。
- 组身份 = 首个成员的稳定节点 key。若加载更早历史导致新工具调用插到当前组长之前，组长会移交且该组展开状态重置。
- SlotCore overlay 依赖本版本的两个结构不变量（register 把新条目推入父 record 的 entries；releaseEntry 拆除 `entry.children`）；若未来版本破坏它们，包装器 fail-closed（插件惰性，官方 UI 不受影响）。
- 展开超长链条会重新挂载官方卡片；大量已结束调用默认保持折叠，滚动成本约等于一行。

## 目录

```
src/client/group.ts              纯分组逻辑（有单测）
src/client/turn-fold.ts          轮次级大折叠（有单测）
src/client/tool-row.ts           运行中工具行模型（产品 toolRowModel 复刻）
src/client/auto-load.ts          滑顶自动加载更早（sessions 作用域）
src/client/AutoLoadHost.tsx      座位 ref 锚点，接入自动加载器
src/client/ToolCallGroupView.tsx 组行（真实块内容）+ 官方成员渲染
src/client/AssistantNodeWrapper.tsx assistant-step 阴影（委托官方）
src/client/UserNodeWrapper.tsx   用户气泡复刻 + 3 行钳制 + 展开/收起
src/client/NoticeNodeWrapper.tsx compaction/context/manual-compaction/command 阴影
src/client/registry.ts           委托用的共享实时注册表访问
src/client/translate.ts          共享 fold 翻译槽
src/client/slots-core-overlay.ts 可逆 SlotCore overlay（对应 docs/core-patch.md）
src/client/styles.ts             主题变量 CSS
src/client/vendor.d.ts           DSH 页面包的最小 ambient 类型
src/client/index.ts              插件入口（注册）
src/host/index.ts                最小 host 锚点
cordis.patch.yml                 bundle patch 层（host 行）
build.mjs                        tsc + esbuild
scripts/install-dsh.cjs          安装/卸载脚本
test/                            分组 · tool-row · 自动加载 · 大折叠 · overlay · bundle 冒烟 · 渲染套件
docs/core-patch.md               唯一 core 改动（源码级 patch）
```

## License

MIT
