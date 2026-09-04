/**
 * Pure group computation over the DSH conversation snapshot.
 *
 * The chat view renders one `ChatConversationViewNode` per business node; the
 * tool-call nodes carry `kind: 'tool-call'` and `data.root: ToolCallBlock`
 * (running: `{callId, name, argsRaw, ...}` — settled: `{kind: 'tool-result',
 * call: {name, ...}, isError, error?, content, ...}`).
 *
 * Grouping rule (no DOM involved — pure snapshot reads):
 *   consecutive `tool-call` nodes in `snapshot.chat.order` belonging to the
 *   SAME turn form one group. Assistant-step nodes whose blocks contain ONLY
 *   reasoning (and tool-call placeholders — the product renders those as
 *   nothing) are TRANSPARENT to the run: they neither split chains nor count
 *   as members, but they are folded WITH the group (hidden while collapsed,
 *   re-shown between the calls when expanded). Any other visible node —
 *   assistant TEXT, user/steering message, command, compaction, … — ends the
 *   run, so groups never merge across text or turn boundaries.
 *
 * Why reasoning is transparent: in the DSH data model every step that
 * produces a tool call also streams a reasoning block, and the assistant-step
 * node carries it as a visible Think row anchored between the surrounding
 * tool calls. Treating it as a boundary would isolate every tool call into
 * its own group (consecutive bars, counts never accumulating).
 *
 * Structural types mirror the runtime contracts; the runtime package is never
 * imported here so this module stays unit-testable in plain Node.
 */

export interface AssistantBlockLike {
  readonly kind: 'text' | 'reasoning' | 'image' | 'tool-call' | 'other'
  readonly text?: string
  readonly block?: unknown
}

export interface ChatNodeLike {
  readonly key: string
  readonly kind: string
  readonly location?: {
    readonly kind: 'turn' | 'step' | 'unresolved'
    readonly turn?: {
      readonly turn: number
      /** Resolved turn boundary (alpha 0.1.2 exposes `closed`; absent on rc). */
      readonly status?: 'open' | 'closed' | 'unknown'
    }
  }
  readonly data?: {
    readonly root?: ToolBlockLike
    /** Assistant payload: blocks are the step's content (text/reasoning/tool-call/...). */
    readonly blocks?: readonly AssistantBlockLike[]
    /** Lifecycle signal (alpha 0.1.2; absent on rc 0.1.1). */
    readonly status?: 'running' | 'settled' | 'interrupted'
    /** rc 0.1.1 streaming signal: the durable final node is absent while the step streams. */
    readonly final?: unknown
  }
}

/** Running lifecycle form: no `kind` member. */
export interface RunningToolBlock {
  readonly callId: string
  readonly name: string
  readonly argsRaw?: string
  readonly turn?: number
  readonly step?: number
  readonly time?: number
  /** Tool-authored call-side presentation (terminal card: title/description/cwd). */
  readonly callView?: {
    readonly card?: string
    readonly title?: string
    readonly description?: string
    readonly cwd?: string
  }
  readonly subCalls?: readonly ToolBlockLike[]
}

/** Settled lifecycle form: carries the final result. */
export interface SettledToolBlock {
  readonly kind: 'tool-result'
  readonly callId: string
  readonly seq?: number
  readonly time?: number
  readonly call?: { readonly name?: string | null; readonly argsRaw?: string | null } | null
  readonly callTime?: number | null
  readonly content?: unknown
  readonly isError?: boolean
  readonly error?: unknown
  readonly meta?: unknown
  readonly subCalls?: readonly ToolBlockLike[]
}

export type ToolBlockLike = RunningToolBlock | SettledToolBlock

export interface GroupSnapshotLike {
  readonly order: readonly string[]
  readonly nodes: { get(key: string): ChatNodeLike | undefined }
}

/** One folded item of a group: a top-level tool call, a transparent think
 * row, or an inline notice (any non-text cell — model-retry, context
 * injection, compaction, command, …) folded in with the adjacent work. */
export type GroupItem =
  | { readonly kind: 'tool'; readonly key: string; readonly node: ChatNodeLike }
  | { readonly kind: 'think'; readonly key: string; readonly node: ChatNodeLike }
  | { readonly kind: 'notice'; readonly cell: string; readonly key: string; readonly node: ChatNodeLike }

export interface ToolGroup {
  /** Key of the first TOOL member; only that seat renders the group row. */
  readonly leaderKey: string
  /** All folded item keys in flow order (tools + transparent think rows). */
  readonly itemKeys: readonly string[]
  /** All folded items in flow order. */
  readonly items: readonly GroupItem[]
  /** Top-level tool call count (subcalls inside a block are NOT counted). */
  readonly count: number
  /** The first still-running tool block, or undefined once every call settled. */
  readonly running: ToolBlockLike | undefined
  /**
   * The folded item whose live content the collapsed bar shows: the first
   * still-running TOOL if any (a working call), otherwise the LAST still-
   * streaming THINK row (reasoning currently being produced). undefined when
   * nothing is working/streaming. The product keeps the preceding think node
   * in `running` state while its tool call executes, so tools take priority.
   */
  readonly runningItem: GroupItem | undefined
}

const TOOL_KIND = 'tool-call'
const ASSISTANT_KIND = 'assistant-step'

/**
 * Alpha 0.1.2's turn-process CONTROLLER node: the product projects one per
 * closed turn (its compact-transcript disclosure bar). It is a hidden
 * controller, never a rendered member — it must neither split a tool run nor
 * count as a folded block, and it must not become a group leader.
 */
export const TURN_PROCESS_NODE_KIND = 'turn-process'

export function turnOf(node: ChatNodeLike): number | undefined {
  const loc = node.location
  if (loc === undefined) return undefined
  if (loc.kind === 'turn' || loc.kind === 'step') return loc.turn?.turn
  return undefined
}

/** Same-turn test that never merges unresolved locations. */
function sameTurn(left: ChatNodeLike, right: ChatNodeLike): boolean {
  const tl = turnOf(left)
  if (tl === undefined) return false
  return tl === turnOf(right)
}

/** Every non-text cell that folds WITH the adjacent work instead of a
 * separate bar (never splits a chain): context injection, compaction, manual
 * compaction, commands, unknown surfaces, workflow runs. Deliberately NOT
 * here — diagnostics the user must always see, which render unfolded and act
 * as run boundaries: `turn-error` (本轮运行失败), `turn-max-tokens`
 * (达到输出上限) and `model-retry` (已重试模型请求). */
export const INLINE_NOTICE_KINDS = new Set([
  'context',
  'compaction',
  'manual-compaction',
  'command',
  'unknown',
  'workflow-run',
])

/** Whether the node is an inline notice kind. */
export function isInlineNoticeNode(node: ChatNodeLike | undefined): boolean {
  return node !== undefined && INLINE_NOTICE_KINDS.has(node.kind)
}

/**
 * Whether an assistant node is group-transparent: its blocks contain only
 * reasoning (foldable Think rows) and tool-call placeholders / empty text —
 * i.e. no user-visible TEXT or other content. Any non-empty text block (or
 * image/unknown content) makes the node a hard boundary.
 */
export function isTransparentAssistant(node: ChatNodeLike | undefined): node is ChatNodeLike {
  if (node === undefined || node.kind !== ASSISTANT_KIND) return false
  const blocks = node.data?.blocks ?? []
  return blocks.every((block) => {
    if (block.kind === 'reasoning' || block.kind === 'tool-call') return true
    if (block.kind === 'text') return (block.text ?? '').trim() === ''
    return false
  })
}

/** True when the block is the still-running lifecycle form. */
export function isRunningBlock(block: ToolBlockLike | undefined): block is RunningToolBlock {
  return block !== undefined && !('kind' in block)
}

/**
 * The conversation's LATEST LIVE WORK node — what the folded bar's left side
 * reflects as the AI conversation's current running state. The NEWEST node in
 * the flow decides:
 *  - a running tool call or streaming Think row is shown;
 *  - a settled work node, or ANY other node (assistant text, user/steering,
 *    notice, turn tail), clears the bar. In particular, the final tool result
 *    must clear immediately instead of leaving the completed tool visible
 *    until the next model chunk arrives.
 */
export function latestWorkNode(snapshot: GroupSnapshotLike): ChatNodeLike | undefined {
  const order = snapshot.order
  for (let i = order.length - 1; i >= 0; i -= 1) {
    const node = snapshot.nodes.get(order[i])
    if (node === undefined) continue
    if (node.kind === TOOL_KIND || isTransparentAssistant(node)) {
      return isLiveWorkNode(node) ? node : undefined
    }
    return undefined
  }
  return undefined
}

/** Whether a work node is still running/streaming (as opposed to settled):
 * a tool call without a result, or an assistant step in `running` state.
 * rc 0.1.1 has no `status` field — a step streams while its durable `final`
 * node is still absent, so that state counts as running too. */
export function isLiveWorkNode(node: ChatNodeLike | undefined): boolean {
  if (node === undefined) return false
  if (node.kind === TOOL_KIND) return isRunningBlock(node.data?.root)
  const status = node.data?.status
  if (status !== undefined) return status === 'running'
  return node.data?.final === undefined
}

/** Wire tool name from either lifecycle form. */
export function callName(block: ToolBlockLike): string {
  return 'kind' in block ? block.call?.name ?? '' : block.name
}

/** A node continues the current run (same turn): a tool call, a transparent
 * think row, a turn-process controller (alpha: transparent, never splits),
 * or any inline notice — folded in with the adjacent work, never splitting a
 * chain into separate bars. */
function continuesRun(node: ChatNodeLike, anchor: ChatNodeLike): boolean {
  if (!sameTurn(node, anchor)) return false
  return node.kind === TOOL_KIND || node.kind === TURN_PROCESS_NODE_KIND
    || isTransparentAssistant(node) || isInlineNoticeNode(node)
}

/**
 * Compute the group containing the node with `nodeKey`, or null when the node
 * is absent / not part of a foldable run. Works for BOTH tool-call seats and
 * transparent assistant (think) seats: a run that contains at least one tool
 * call is led by its first tool; a think-only run is led by its first
 * transparent assistant. The result is a pure function of the snapshot;
 * callers memoize for render stability.
 */
export function groupOf(snapshot: GroupSnapshotLike, nodeKey: string): ToolGroup | null {
  const order = snapshot.order
  const idx = order.indexOf(nodeKey)
  if (idx < 0) return null
  const node = snapshot.nodes.get(nodeKey)
  if (node === undefined || (node.kind !== TOOL_KIND && !isTransparentAssistant(node) && !isInlineNoticeNode(node))) return null
  let start = idx
  while (start > 0) {
    const prev = snapshot.nodes.get(order[start - 1])
    if (prev === undefined || !continuesRun(prev, node)) break
    start -= 1
  }
  let end = idx
  while (end < order.length - 1) {
    const next = snapshot.nodes.get(order[end + 1])
    if (next === undefined || !continuesRun(next, node)) break
    end += 1
  }
  const keys = order.slice(start, end + 1)
  const items: GroupItem[] = []
  let firstToolKey: string | undefined
  for (const key of keys) {
    const member = snapshot.nodes.get(key)
    if (member === undefined) continue
    // The turn-process controller (alpha) is flow-transparent: it extends the
    // run but renders nothing and never counts as a folded block.
    if (member.kind === TURN_PROCESS_NODE_KIND) continue
    const transparent: boolean = isTransparentAssistant(member)
    if (member.kind === TOOL_KIND) {
      if (firstToolKey === undefined) firstToolKey = key
      items.push({ kind: 'tool', key, node: member })
    } else if (transparent) {
      items.push({ kind: 'think', key, node: member })
    } else if (isInlineNoticeNode(member)) {
      items.push({ kind: 'notice', cell: member.kind, key, node: member })
    }
  }
  // Leader: the first TOOL when the run has tools (its seat owns the bar),
  // otherwise the first real member — never the turn-process controller.
  let leaderKey = firstToolKey
  if (leaderKey === undefined) {
    for (const key of keys) {
      const member = snapshot.nodes.get(key)
      if (member !== undefined && member.kind !== TURN_PROCESS_NODE_KIND) {
        leaderKey = key
        break
      }
    }
  }
  if (leaderKey === undefined) return null
  let running: ToolBlockLike | undefined
  let runningToolItem: GroupItem | undefined
  let runningThinkItem: GroupItem | undefined
  for (const item of items) {
    if (item.kind !== 'tool') {
      // Think rows stream while their assistant step is running.
      if (runningThinkItem === undefined && isLiveWorkNode(item.node)) runningThinkItem = item
      continue
    }
    const block = item.node.data?.root
    if (running === undefined && isRunningBlock(block)) running = block
    if (runningToolItem === undefined && isRunningBlock(block)) runningToolItem = item
  }
  // The bar's live content: a working call first (its node stays 'running'
  // while the call executes), otherwise the newest streaming think row.
  const runningItem = runningToolItem ?? runningThinkItem
  // Count of FOLDED BLOCKS: tool rows + think rows (the bar reports
  // "{count} 个块已被折叠").
  return { leaderKey, itemKeys: keys, items, count: items.length, running, runningItem }
}

/** Whether this seat is the group leader (the only one that renders). */
export function isGroupLeader(group: ToolGroup, nodeKey: string): boolean {
  return group.leaderKey === nodeKey
}

/** Reference-stable equality for useSession's eq parameter. */
export function eqGroup(left: ToolGroup | null, right: ToolGroup | null): boolean {
  if (left === null || right === null) return left === right
  if (left.leaderKey !== right.leaderKey || left.running !== right.running) return false
  if (left.itemKeys.length !== right.itemKeys.length || left.items.length !== right.items.length) return false
  for (let i = 0; i < left.itemKeys.length; i += 1) {
    if (left.itemKeys[i] !== right.itemKeys[i]) return false
  }
  for (let i = 0; i < left.items.length; i += 1) {
    if (left.items[i].node !== right.items[i].node) return false
  }
  return true
}

/** Reference-stable equality for the assistant wrapper's grouping probe. */
export function eqGrouped(left: { grouped: boolean; node: ChatNodeLike | undefined } | null, right: { grouped: boolean; node: ChatNodeLike | undefined } | null): boolean {
  if (left === null || right === null) return left === right
  return left.grouped === right.grouped && left.node === right.node
}
