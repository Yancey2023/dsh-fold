/**
 * Turn-level ("big") fold: after a turn closes WITH a final summary, every
 * work-process node of that turn (tool calls, Think rows, intermediate
 * assistant text) folds behind ONE bar reading "该轮次工作过程已折叠" /
 * "Turn work process folded". Only the final summary text stays visible.
 *
 * The small folds (tool groups / think groups) live INSIDE the big fold:
 * expanding the big fold reveals them again at their original positions.
 *
 * Pure computation over the snapshot (turn closure = `chat.turnEnds` has the
 * turn; summary = the LAST text-bearing assistant node of the turn) plus a
 * tiny module store for the per-turn expanded flag shared by every seat of
 * the turn.
 */

import * as React from 'react'
import { isTransparentAssistant, turnOf } from './group'
import type { ChatNodeLike, GroupSnapshotLike } from './group'

export interface TurnSessionLike {
  /** chat target (order + nodes). */
  readonly chat: GroupSnapshotLike
  /** Session-level: in-window completed turn number -> its turn/end event seq. */
  readonly turnEnds?: ReadonlyMap<number, number>
}

export interface TurnProcessInfo {
  readonly turn: number
  /** Key of the turn's final summary node (excluded from the fold). */
  readonly summaryKey: string | null
  /** Key of the FIRST process node — its seat renders the big fold bar. */
  readonly firstKey: string
  /** Keys of all process nodes (tool + assistant) in flow order. */
  readonly keys: readonly string[]
}

/** Non-predicate wrapper: `isTransparentAssistant` is a type guard, and a
 * guard in a negative control-flow position narrows to `never`. */
function isThinkOnly(node: ChatNodeLike): boolean {
  return isTransparentAssistant(node)
}

/**
 * Compute the big-fold context for the node with `nodeKey`, or null when the
 * turn is still open, has no summary, or has nothing to fold.
 */
export function turnProcessOf(session: TurnSessionLike, nodeKey: string): TurnProcessInfo | null {
  const node = session.chat.nodes.get(nodeKey)
  if (node === undefined) return null
  const turn = turnOf(node)
  if (turn === undefined) return null
  const turnEnds = session.turnEnds
  if (turnEnds === undefined || !turnEnds.has(turn)) return null

  // This turn's tool/assistant nodes in flow order.
  const turnNodes: ChatNodeLike[] = []
  for (const key of session.chat.order) {
    const member = session.chat.nodes.get(key)
    if (member === undefined || turnOf(member) !== turn) continue
    if (member.kind === 'tool-call' || member.kind === 'assistant-step') turnNodes.push(member)
  }

  // Summary: the LAST text-bearing assistant node of the turn.
  let summaryKey: string | null = null
  for (let i = turnNodes.length - 1; i >= 0; i -= 1) {
    const candidate = turnNodes[i]
    if (candidate.kind !== 'assistant-step') continue
    if (isThinkOnly(candidate)) continue
    summaryKey = candidate.key
    break
  }
  if (summaryKey === null) return null

  const keys = turnNodes.filter((member) => member.key !== summaryKey).map((member) => member.key)
  if (keys.length === 0) return null
  return { turn, summaryKey, firstKey: keys[0], keys }
}

/** Whether the node is part of the turn's folded process span. */
export function isProcessNode(info: TurnProcessInfo | null, nodeKey: string): boolean {
  return info !== null && info.keys.includes(nodeKey)
}

/** Whether the node is the turn's final summary (never folded). */
export function isTurnSummary(info: TurnProcessInfo | null, nodeKey: string): boolean {
  return info !== null && info.summaryKey === nodeKey
}

/** Reference-stable equality for useSession's eq parameter. */
export function eqTurnProcess(left: TurnProcessInfo | null, right: TurnProcessInfo | null): boolean {
  if (left === null || right === null) return left === right
  if (left.turn !== right.turn || left.summaryKey !== right.summaryKey || left.firstKey !== right.firstKey) return false
  if (left.keys.length !== right.keys.length) return false
  for (let i = 0; i < left.keys.length; i += 1) {
    if (left.keys[i] !== right.keys[i]) return false
  }
  return true
}

// ---------------------------------------------------------------------------
// Shared per-turn expanded flag (keyed by sessionId:turn so sessions don't
// leak state into each other).
// ---------------------------------------------------------------------------

const expandedTurns = new Map<string, boolean>()
const listeners = new Set<() => void>()

export function setTurnExpanded(key: string, expanded: boolean): void {
  if (expandedTurns.get(key) === expanded) return
  expandedTurns.set(key, expanded)
  for (const fn of [...listeners]) fn()
}

export function useTurnExpanded(key: string | undefined): boolean {
  return React.useSyncExternalStore(
    (callback) => {
      if (key === undefined) return () => {}
      const fn = () => callback()
      listeners.add(fn)
      return () => {
        listeners.delete(fn)
      }
    },
    () => (key === undefined ? false : (expandedTurns.get(key) ?? false)),
  )
}
