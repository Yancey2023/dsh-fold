/**
 * NoticeNodeWrapper — the shadowing renderer for the non-text notice cells
 * `compaction` (automatic context compression), `context` (context
 * injection), `manual-compaction` and `command` (user commands such as
 * `/permission`).
 *
 * Everything except plain text folds:
 *   - In a CLOSED, summarized turn the notice joins the turn-level big fold
 *     (hidden behind `该轮次工作过程已折叠` together with the tools/think
 *     rows; the first process seat owns the bar).
 *   - Otherwise it renders its own one-line folded bar (`1 个块已被折叠`)
 *     that expands into the OFFICIAL cell view, delegated from the live slot
 *     registry (`slots.entries`, the same path AssistantNodeWrapper uses) —
 *     for `command` the official CommandNodeView receives this seat's own
 *     `renderSlot` binding, so command-name keyed cards keep working.
 *
 * The registry lookup degrades fail-soft: if the official entry is ever
 * missing, the node renders nothing (marked, so its flowItem leaves no gap).
 */

import * as React from 'react'
import type { ChatNodeLike } from './group'
import { eqGroup, groupOf, isGroupLeader, isInlineNoticeNode, latestWorkNode } from './group'
import { GroupBar, GroupItems, TurnFoldBar } from './ToolCallGroupView'
import { AutoLoadHost } from './AutoLoadHost'
import { eqTurnProcess, isProcessNode, setTurnExpanded, turnProcessOf, useTurnExpanded } from './turn-fold'
import { officialNodeEntry, setConversationT } from './registry'
import type { TranslateLike } from './registry'
import { getGroupT } from './translate'
export { setSlotsService } from './registry'
export { setGroupT } from './translate'
// Re-exported for tests: the mirror bundles its own copy of the turn-fold
// store, so isolation resets must reach the SAME bundled module.
export { setTurnExpanded } from './turn-fold'

/** The notice cell kinds this wrapper owns. */
export const NOTICE_KINDS = new Set([
  'compaction',
  'context',
  'manual-compaction',
  'command',
  'model-retry',
  'turn-error',
  'turn-max-tokens',
  'unknown',
  'workflow-run',
])

export interface NoticeNodeWrapperProps {
  /** The node owned by this seat. */
  node: ChatNodeLike
  /** Framework session selector hook. */
  useSession: <S>(
    sel: (snapshot: {
      chat: { order: readonly string[]; nodes: { get(key: string): ChatNodeLike | undefined } }
      turnEnds?: ReadonlyMap<number, number>
      hasMore?: boolean
      loadingOlder?: boolean
    }) => S,
    eq?: (a: S, b: S) => boolean,
  ) => S
  /** Session id (big-fold state is keyed per session). */
  sessionId?: string
  /** Child-slot dispatch face (only the `command` seat declares children). */
  renderSlot?: (key: string, owner: unknown, opts: { entryKey: string; fallback?: React.ReactNode }) => React.ReactNode
  /** Everything else the renderer passed (delegated to the official view). */
  [key: string]: unknown
}

/** Renders nothing but marks the seat as folded so its flowItem is hidden
 * (no 16px column gap for hidden members). */
function FoldedSeat(): React.ReactElement {
  return React.createElement('div', { 'data-tool-group-hidden': '' })
}

export const NoticeNodeWrapper = React.memo(function NoticeNodeWrapper(props: NoticeNodeWrapperProps): React.ReactElement | null {
  const { node, useSession, sessionId } = props
  // ALL hooks unconditional (React rules; a path-dependent hook order
  // crashes with "Rendered fewer hooks than expected").
  const turnInfo = useSession((snapshot) => turnProcessOf(snapshot, node.key), eqTurnProcess)
  const inlineGroup = useSession((snapshot) => (isInlineNoticeNode(node) ? groupOf(snapshot.chat, node.key) : null), eqGroup)
  const live = useSession((snapshot) => latestWorkNode(snapshot.chat))
  const hasMore = useSession((snapshot) => snapshot.hasMore === true)
  const loadingOlder = useSession((snapshot) => snapshot.loadingOlder === true)
  const [expanded, setExpanded] = React.useState(false)
  const turnExpanded = useTurnExpanded(turnInfo === null ? undefined : `${sessionId ?? ''}:${turnInfo.turn}`)
  const toggle = React.useCallback(() => setExpanded((value) => !value), [])
  const onKeyDown = React.useCallback((event: React.KeyboardEvent) => {
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault()
      setExpanded((value) => !value)
    }
  }, [])
  const turnKey = turnInfo === null ? undefined : `${sessionId ?? ''}:${turnInfo.turn}`
  const turnToggle = React.useCallback(() => {
    if (turnKey === undefined) return
    setTurnExpanded(turnKey, !turnExpanded)
  }, [turnKey, turnExpanded])
  const turnKeyDown = React.useCallback(
    (event: React.KeyboardEvent) => {
      if (event.key === 'Enter' || event.key === ' ') {
        event.preventDefault()
        turnToggle()
      }
    },
    [turnToggle],
  )

  const t = getGroupT() ?? ((key: string, params?: Record<string, unknown>) => (params && 'count' in params ? String(params.count) : key))
  setConversationT(((typeof props.t === 'function' ? props.t : undefined) as TranslateLike | undefined) as TranslateLike | undefined)

  let output: React.ReactNode
  // Every non-text cell this wrapper owns folds WITH the adjacent work — no
  // standalone bars. A notice never splits a chain: a member seat renders
  // nothing (the leader's bar owns it), the leader of a notice/think-only
  // group renders the group bar itself. Fail-soft: only act on the kinds we
  // own, and a lone notice with no official view collapses to the hidden
  // marker instead of a dead bar.
  if (!NOTICE_KINDS.has(node.kind)) {
    output = React.createElement(FoldedSeat, null)
  } else if (inlineGroup === null || !isGroupLeader(inlineGroup, node.key)) {
    output = React.createElement(FoldedSeat, null)
  } else {
    const official = officialNodeEntry(node.kind)
    const loneMissingOfficial = inlineGroup.count === 1 && (official === undefined || official.component == null)
    if (loneMissingOfficial) {
      output = React.createElement(FoldedSeat, null)
    } else {
      const conversationT = (typeof props.t === 'function' ? props.t : undefined) as TranslateLike | undefined
      const groupSmall = React.createElement(
        'div',
        { className: 'dshToolGroup', 'data-tool-group': '', 'data-notice': '' } as unknown as React.HTMLAttributes<HTMLDivElement>,
        React.createElement(GroupBar, { group: inlineGroup, expanded, onToggle: toggle, onKeyDown, t, live }),
        expanded ? React.createElement(GroupItems, { group: inlineGroup, t, conversationT }) : null,
      )
      const first = node.key === turnInfo?.firstKey
      if (turnInfo !== null && isProcessNode(turnInfo, node.key)) {
        output = turnExpanded
          ? React.createElement(React.Fragment, null, first ? React.createElement(TurnFoldBar, { expanded: true, onToggle: turnToggle, onKeyDown: turnKeyDown, t }) : null, groupSmall)
          : first
            ? React.createElement(TurnFoldBar, { expanded: false, onToggle: turnToggle, onKeyDown: turnKeyDown, t })
            : React.createElement(FoldedSeat, null)
      } else {
        output = groupSmall
      }
    }
  }
  return React.createElement(AutoLoadHost, { sessionId, hasMore, loadingOlder }, output)
})
