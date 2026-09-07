/**
 * Unified conversation-snapshot face across the supported DSH channels.
 *
 * Supported releases (npm `latest`/`next` → 0.1.2-rc.1, npm `alpha` →
 * 0.1.3-alpha.2) share ONE chat-node seat kit: the renderer's standard
 * session kit hands every `conversation.chat.node` cell TWO selector hooks
 * (the product's own turn-tail cell consumes `useChat` from its props on
 * both channels, so it is always provided):
 *
 *  - `useChat` returns the Chat target snapshot directly
 *    (`{order, nodes, locations, navigation, timeline, legacy}`), where the
 *    turn-closure map lives at `chat.legacy.turnEnds`;
 *  - `useSession` returns the SESSION-level snapshot
 *    (`{hasMore, loadingOlder, ...}`) with the window flags.
 *
 * This module normalizes the chat target onto one stable `SnapshotFace`
 * ({chat, hasMore, loadingOlder}), so the fold computations (group / turn /
 * live) stay channel-agnostic. The only remaining per-channel difference —
 * the alpha-only `loadImage` owner kit and 0.1.3 file-attachment content —
 * is handled in the user wrapper, not here.
 *
 * Reference stability: every face member is compared by reference through
 * the selector `eq` parameter, so the derived values stay memoizable with
 * `useMemo` (no group/turn recomputation on unrelated snapshot changes).
 */

import type { ChatNodeLike } from './group'

export interface TurnEndsMap {
  /** In-window completed turn number -> its turn/end event seq. */
  readonly turnEnds?: ReadonlyMap<number, number>
}

export interface ChatFace {
  readonly order: readonly string[]
  readonly nodes: { get(key: string): ChatNodeLike | undefined }
  /** Completed-turn map (from `chat.legacy.turnEnds` on both channels). */
  readonly turnEnds?: ReadonlyMap<number, number>
}

export interface SnapshotFace {
  readonly chat: ChatFace
  readonly hasMore: boolean
  readonly loadingOlder: boolean
}

/** Selector-hook shape both framework kits share (`(sel, eq?) => value`). */
export type SelectorHook = <S>(sel: (snapshot: unknown) => S, eq?: (a: S, b: S) => boolean) => S

const EMPTY_ORDER: readonly string[] = []
const EMPTY_NODES = { get: (_key: string): ChatNodeLike | undefined => undefined }
const EMPTY_CHAT: ChatFace = { order: EMPTY_ORDER, nodes: EMPTY_NODES }
const EMPTY_FACE: SnapshotFace = { chat: EMPTY_CHAT, hasMore: false, loadingOlder: false }

function isChatTarget(raw: unknown): raw is { order: readonly string[]; nodes: { get(key: string): ChatNodeLike | undefined } } {
  const value = raw as { order?: unknown; nodes?: unknown } | null | undefined
  return value !== null && typeof value === 'object'
    && Array.isArray(value.order)
    && value.nodes !== null && typeof value.nodes === 'object'
    && typeof (value.nodes as { get?: unknown }).get === 'function'
}

/**
 * Normalize ONE raw snapshot into the chat face. Accepts the Chat target
 * (`useChat`'s value — every supported channel) or a bare `{order, nodes}`
 * object (defensive / tests). The turn-closure map is read from
 * `chat.legacy.turnEnds`, the field both channels define on the Chat target.
 */
export function chatFaceOf(raw: unknown): ChatFace {
  if (!isChatTarget(raw)) return EMPTY_CHAT
  const chat = raw as { order: readonly string[]; nodes: { get(key: string): ChatNodeLike | undefined } } & TurnEndsMap & {
    legacy?: TurnEndsMap
  }
  return { order: chat.order, nodes: chat.nodes, turnEnds: chat.legacy?.turnEnds }
}

/** Reference-stable equality for the chat face (identity of each member). */
export function chatFaceEq(left: ChatFace, right: ChatFace): boolean {
  if (left === right) return true
  return left.order === right.order && left.nodes === right.nodes && left.turnEnds === right.turnEnds
}

/** Window flags from the SESSION-level snapshot (`hasMore` / `loadingOlder`). */
export function windowFlagsOf(raw: unknown): { hasMore: boolean; loadingOlder: boolean } {
  const session = raw as { hasMore?: unknown; loadingOlder?: unknown } | null | undefined
  return {
    hasMore: session !== null && typeof session === 'object' && session.hasMore === true,
    loadingOlder: session !== null && typeof session === 'object' && session.loadingOlder === true,
  }
}

function windowFlagsEq(left: { hasMore: boolean; loadingOlder: boolean }, right: { hasMore: boolean; loadingOlder: boolean }): boolean {
  return left.hasMore === right.hasMore && left.loadingOlder === right.loadingOlder
}

/**
 * The per-seat snapshot face. The chat transcript always comes through
 * `useChat` (both supported channels provide it on the cell kit); the window
 * flags always come from `useSession`. Both selectors are optional so render
 * tests can omit them; a missing chat selector yields the empty face (all
 * folds disabled) instead of crashing.
 *
 * Hook discipline: exactly TWO selector calls happen — the chat call and the
 * flags call — regardless of the host channel, with a stable hook order.
 */
export function useSnapshotFace(props: { useChat?: unknown; useSession?: unknown }): SnapshotFace {
  const useChat = typeof props.useChat === 'function' ? (props.useChat as SelectorHook) : undefined
  const useSession = typeof props.useSession === 'function' ? (props.useSession as SelectorHook) : undefined
  const chat = useChat !== undefined
    ? useChat((snapshot: unknown) => chatFaceOf(snapshot), chatFaceEq)
    : EMPTY_CHAT
  const flags = useSession !== undefined
    ? useSession((snapshot: unknown) => windowFlagsOf(snapshot), windowFlagsEq)
    : { hasMore: false, loadingOlder: false }
  return flags.hasMore || flags.loadingOlder || chat !== EMPTY_CHAT
    ? { chat, hasMore: flags.hasMore, loadingOlder: flags.loadingOlder }
    : EMPTY_FACE
}