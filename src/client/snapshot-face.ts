/**
 * Unified conversation-snapshot face across DSH releases.
 *
 * The chat-node seats of `conversation.chat.node` receive two framework
 * selector kits, and WHICH one carries the transcript data changed between
 * releases:
 *
 *  - DSH 0.1.2-alpha.1: `useChat` returns the Chat target snapshot directly
 *    (`{order, nodes, locations, navigation, timeline, legacy}`); `useSession`
 *    returns the SESSION-level snapshot (`{hasMore, loadingOlder, ...}`) that
 *    no longer carries the transcript.
 *  - DSH 0.1.1-rc.2: `useChat` does not exist on the seat; `useSession`
 *    carries the session snapshot whose `.chat` member IS the chat target
 *    (`{chat: {order, nodes, legacy}, turnEnds, hasMore, loadingOlder}`).
 *
 * This module normalizes both onto one stable `SnapshotFace` ({chat,
 * hasMore, loadingOlder}), so the fold computations (group / turn / live)
 * stay release-agnostic. The chat face folds the release's turn-closure
 * signal into one `turnEnds` map: `chat.legacy.turnEnds` (both releases),
 * then `chat.turnEnds`, then the legacy session-level `turnEnds`.
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
  /** Completed-turn map (release-normalized turn-closure signal). */
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
 * (alpha `useChat`), the session snapshot (rc-era `useSession` with the chat
 * at `.chat`), or a bare `{order, nodes}` object (defensive / tests).
 */
export function chatFaceOf(raw: unknown): ChatFace {
  const session = raw as { chat?: unknown; turnEnds?: ReadonlyMap<number, number> } | null | undefined
  const chat: unknown = session !== null && typeof session === 'object' && isChatTarget(session.chat) ? session.chat : raw
  if (!isChatTarget(chat)) return EMPTY_CHAT
  const chatValue = chat as { order: readonly string[]; nodes: { get(key: string): ChatNodeLike | undefined } } & TurnEndsMap & {
    legacy?: TurnEndsMap
  }
  const turnEnds =
    chatValue.legacy?.turnEnds
    ?? chatValue.turnEnds
    ?? (session !== null && typeof session === 'object' ? session.turnEnds : undefined)
  return { order: chatValue.order, nodes: chatValue.nodes, turnEnds }
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
 * The per-seat snapshot face. Reads the chat target through `useChat` when
 * the host provides it (alpha), else through `useSession`'s `.chat` member
 * (rc-era); the window flags always come from `useSession`. Both selectors
 * are optional so render tests can omit them; a missing chat selector yields
 * the empty face (all folds disabled) instead of crashing.
 *
 * Hook discipline: exactly TWO selector calls happen — the chat call and the
 * flags call — regardless of the host release (on rc-era both calls go to
 * `useSession`, which is the same store twice; on alpha the chat call goes
 * to `useChat` and the flags call to `useSession`). The choice of hook never
 * flips for a given host build, so hook order stays stable.
 */
export function useSnapshotFace(props: { useChat?: unknown; useSession?: unknown }): SnapshotFace {
  const useChat = typeof props.useChat === 'function' ? (props.useChat as SelectorHook) : undefined
  const useSession = typeof props.useSession === 'function' ? (props.useSession as SelectorHook) : undefined
  const chat = useChat !== undefined
    ? useChat((snapshot: unknown) => chatFaceOf(snapshot), chatFaceEq)
    : useSession !== undefined
      ? useSession((snapshot: unknown) => chatFaceOf(snapshot), chatFaceEq)
      : EMPTY_CHAT
  const flags = useSession !== undefined
    ? useSession((snapshot: unknown) => windowFlagsOf(snapshot), windowFlagsEq)
    : { hasMore: false, loadingOlder: false }
  return flags.hasMore || flags.loadingOlder || chat !== EMPTY_CHAT
    ? { chat, hasMore: flags.hasMore, loadingOlder: flags.loadingOlder }
    : EMPTY_FACE
}