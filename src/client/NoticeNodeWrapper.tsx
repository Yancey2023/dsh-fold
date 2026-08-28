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
import { groupOf, isGroupLeader, isInlineNoticeNode, latestWorkNode } from './group'
import { GroupBar, GroupItems, TurnFoldBar } from './ToolCallGroupView'
import type { ToolGroup } from './group'
import { AutoLoadHost } from './AutoLoadHost'
import { useSnapshotFace } from './snapshot-face'
import type { SelectorHook } from './snapshot-face'
import { isProcessNode, setTurnExpanded, turnProcessOf, useTurnExpanded } from './turn-fold'
import { compositeT, getChatT, officialNodeEntry, setConversationT } from './registry'
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
  /** Framework session selector hook (window flags; on rc also the chat). */
  useSession?: SelectorHook
  /** Chat-target selector hook (alpha 0.1.2+; absent on rc). */
  useChat?: SelectorHook
  /** Session id (big-fold state is keyed per session). */
  sessionId?: string
  /** Child-slot dispatch face (only the `command` seat declares children). */
  renderSlot?: (key: string, owner: unknown, opts: { entryKey: string; fallback?: React.ReactNode }) => React.ReactNode
  /** Alpha owner kit: the product's own turn-process controller. */
  turnProcess?: { foldable?: boolean }
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
  const { chat, hasMore, loadingOlder } = useSnapshotFace(props)
  // Alpha 0.1.2's own compact-transcript turn folding is active for this
  // turn: yield the big fold entirely to the product (no double bars); the
  // small inline folds stay ours.
  const productFoldActive = props.turnProcess?.foldable === true
  const turnInfo = React.useMemo(
    () => (productFoldActive ? null : turnProcessOf(chat, node.key)),
    [chat, node, productFoldActive],
  )
  const inlineGroup = React.useMemo(
    () => (isInlineNoticeNode(node) ? groupOf(chat, node.key) : null),
    [chat, node],
  )
  const live = React.useMemo(() => latestWorkNode(chat), [chat])
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
  const seatT = (typeof props.t === 'function' ? props.t : undefined) as TranslateLike | undefined
  setConversationT(compositeT(getChatT(), seatT))

  let output: React.ReactNode
  // Fail-soft: only act on the notice kinds this wrapper owns.
  if (!NOTICE_KINDS.has(node.kind)) {
    output = React.createElement(FoldedSeat, null)
  } else {
    // Check the turn-level big fold FIRST: a process node of a closed,
    // summarized turn must render the big fold bar (or be hidden behind it)
    // regardless of any inline group membership.
    if (turnInfo !== null && isProcessNode(turnInfo, node.key)) {
      const first = node.key === turnInfo.firstKey
      if (!turnExpanded) {
        output = first ? React.createElement(TurnFoldBar, { expanded: false, onToggle: turnToggle, onKeyDown: turnKeyDown, t }) : React.createElement(FoldedSeat, null)
      } else {
        // Big fold expanded: show the inline group's small fold at its OWN
        // leader seat only. Every other process member stays hidden — the
        // leader's bar already folds the whole run (tools + think rows +
        // notices), so rendering it again here would duplicate the fold
        // block once per compaction/context member.
        const leaderSeat = inlineGroup !== null && isGroupLeader(inlineGroup, node.key)
        // A lone notice whose only member has no official view collapses to
        // the hidden marker (buildGroupSmall's fail-soft); a marker must never
        // sit NEXT TO the big fold bar — the package CSS
        //   [data-chat-flow-key]:has([data-tool-group-hidden]){display:none}
        // would hide this ENTIRE flow item, bar included, and the turn could
        // never be collapsed again. The first process seat therefore renders
        // the bar alone (no marker); every other non-leader member keeps the
        // marker so its flow item stays gap-free.
        const groupSmall = leaderSeat ? buildGroupSmall() : first ? null : React.createElement(FoldedSeat, null)
        const small =
          first && groupSmall !== null && groupSmall.props !== undefined && (groupSmall.props as Record<string, unknown>)['data-tool-group-hidden'] !== undefined
            ? null
            : groupSmall
        output = React.createElement(
          React.Fragment,
          null,
          first ? React.createElement(TurnFoldBar, { expanded: true, onToggle: turnToggle, onKeyDown: turnKeyDown, t }) : null,
          small,
        )
      }
    } else if (inlineGroup === null || !isGroupLeader(inlineGroup, node.key)) {
      // Member of an inline group (or no group at all): hidden.
      output = React.createElement(FoldedSeat, null)
    } else {
      output = buildGroupSmall()
    }
  }
  return React.createElement(AutoLoadHost, { sessionId, hasMore, loadingOlder }, output)

  /** Build the per-group small fold (GroupBar + expanded items), shared by
   * the big-fold-expanded and the open-turn paths. */
  function buildGroupSmall(): React.ReactElement {
    const g = inlineGroup as ToolGroup
    const official = officialNodeEntry(node.kind)
    if (g.count === 1 && (official === undefined || official.component == null)) {
      // A lone notice with no official view: collapse to the hidden marker
      // instead of a dead bar.
      return React.createElement(FoldedSeat, null)
    }
    const conversationT = compositeT(getChatT(), seatT)
    return React.createElement(
      'div',
      { className: 'dshToolGroup', 'data-tool-group': '', 'data-notice': '' } as unknown as React.HTMLAttributes<HTMLDivElement>,
      React.createElement(GroupBar, { group: g, expanded, onToggle: toggle, onKeyDown, t, live }),
      expanded ? React.createElement(GroupItems, { group: g, t, conversationT }) : null,
    )
  }
})
