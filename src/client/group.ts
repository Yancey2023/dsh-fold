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
 *   SAME turn form one group. Any other visible node (assistant text,
 *   user/steering message, command, ...) or an unresolved/foreign turn ends
 *   the run, so groups never merge across assistant text or turn boundaries.
 *   Reasoning never splits a run in this data model: it is a block INSIDE the
 *   assistant-step node, and that node is anchored before its step's tool
 *   calls, so it can never appear between two tool-call nodes.
 *
 * Structural types mirror the runtime contracts; the runtime package is never
 * imported here so this module stays unit-testable in plain Node.
 */

export interface ChatNodeLike {
  readonly key: string
  readonly kind: string
  readonly location?: {
    readonly kind: 'turn' | 'step' | 'unresolved'
    readonly turn?: { readonly turn: number }
  }
  readonly data?: { readonly root?: ToolBlockLike }
}

/** Running lifecycle form: no `kind` member. */
export interface RunningToolBlock {
  readonly callId: string
  readonly name: string
  readonly argsRaw?: string
  readonly turn?: number
  readonly step?: number
  readonly time?: number
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

export interface ToolGroup {
  /** Key of the first member; only that seat renders the group row. */
  readonly leaderKey: string
  /** Member node keys in flow order (top-level calls only). */
  readonly keys: readonly string[]
  /** Member nodes in flow order. */
  readonly members: readonly ChatNodeLike[]
  /** Turn number shared by every member; undefined for unresolved locations. */
  readonly turn: number | undefined
  /** The first still-running block, or undefined once every call settled. */
  readonly running: ToolBlockLike | undefined
  /** Top-level call count (subcalls inside a block are NOT counted). */
  readonly count: number
}

const TOOL_KIND = 'tool-call'

function turnOf(node: ChatNodeLike): number | undefined {
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

/** True when the block is the still-running lifecycle form. */
export function isRunningBlock(block: ToolBlockLike | undefined): block is RunningToolBlock {
  return block !== undefined && !('kind' in block)
}

/** Wire tool name from either lifecycle form. */
export function callName(block: ToolBlockLike): string {
  return 'kind' in block ? block.call?.name ?? '' : block.name
}

/**
 * Compute the group containing the node with `nodeKey`, or null when the node
 * is absent / not a tool-call node. The result is a pure function of the
 * snapshot; callers memoize for render stability.
 */
export function groupOf(snapshot: GroupSnapshotLike, nodeKey: string): ToolGroup | null {
  const order = snapshot.order
  const idx = order.indexOf(nodeKey)
  if (idx < 0) return null
  const node = snapshot.nodes.get(nodeKey)
  if (node === undefined || node.kind !== TOOL_KIND) return null
  let start = idx
  while (start > 0) {
    const prev = snapshot.nodes.get(order[start - 1])
    if (prev === undefined || prev.kind !== TOOL_KIND || !sameTurn(prev, node)) break
    start -= 1
  }
  let end = idx
  while (end < order.length - 1) {
    const next = snapshot.nodes.get(order[end + 1])
    if (next === undefined || next.kind !== TOOL_KIND || !sameTurn(next, node)) break
    end += 1
  }
  const keys = order.slice(start, end + 1)
  const members: ChatNodeLike[] = []
  for (const key of keys) {
    const member = snapshot.nodes.get(key)
    if (member !== undefined) members.push(member)
  }
  let running: ToolBlockLike | undefined
  for (const member of members) {
    const block = member.data?.root
    if (isRunningBlock(block)) {
      running = block
      break
    }
  }
  return { leaderKey: keys[0], keys, members, turn: turnOf(node), running, count: keys.length }
}

/** Whether this seat is the group leader (the only one that renders). */
export function isGroupLeader(group: ToolGroup, nodeKey: string): boolean {
  return group.leaderKey === nodeKey
}

/** Reference-stable equality for useSession's eq parameter. */
export function eqGroup(left: ToolGroup | null, right: ToolGroup | null): boolean {
  if (left === null || right === null) return left === right
  if (left.leaderKey !== right.leaderKey || left.running !== right.running) return false
  if (left.keys.length !== right.keys.length || left.members.length !== right.members.length) return false
  for (let i = 0; i < left.keys.length; i += 1) {
    if (left.keys[i] !== right.keys[i]) return false
  }
  for (let i = 0; i < left.members.length; i += 1) {
    if (left.members[i] !== right.members[i]) return false
  }
  return true
}
