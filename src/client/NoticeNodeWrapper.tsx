/**
 * NoticeNodeWrapper — the shadowing renderer for the non-text notice cells
 * `compaction` (automatic context compression), `context` (context
 * injection), `manual-compaction` and `command` (user commands such as
 * `/permission`).
 *
 * Everything except plain text folds:
 *   - `model-retry` (已重试模型请求), `turn-error` (本轮运行失败) and
 *     `turn-max-tokens` (达到输出上限) NEVER fold: diagnostics the user must
 *     always see render the official cell view directly, unconditionally.
 *   - Every other notice renders its own one-line folded bar
 *     (`1 个块已被折叠`) — or joins the adjacent tool/think group — that
 *     expands into the OFFICIAL cell view, delegated from the live slot
 *     registry (`slots.entries`, the same path AssistantNodeWrapper uses) —
 *     for `command` the official CommandNodeView receives this seat's own
 *     `renderSlot` binding, so command-name keyed cards keep working.
 *
 * Turn-level ("big") folding is owned by the product on every supported
 * channel; this wrapper only handles the small per-run groups.
 *
 * The registry lookup degrades fail-soft: if the official entry is ever
 * missing, the node renders nothing (marked, so its flowItem leaves no gap).
 */

import * as React from 'react'
import type { ChatNodeLike } from './group'
import { groupOf, isGroupLeader, isInlineNoticeNode, latestWorkNode } from './group'
import { GroupBar, GroupItems } from './ToolCallGroupView'
import type { ToolGroup } from './group'
import { AutoLoadHost } from './AutoLoadHost'
import { useSnapshotFace } from './snapshot-face'
import type { SelectorHook } from './snapshot-face'
import { compositeT, getChatT, officialNodeEntry, setConversationT } from './registry'
import type { TranslateLike } from './registry'
import { getGroupT } from './translate'
export { setSlotsService } from './registry'
export { setGroupT } from './translate'

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

/** Notice kinds this wrapper owns but NEVER folds: the seat renders the
 * official cell view directly, unconditionally. Diagnostics the user must
 * always see — `turn-error` (本轮运行失败), `turn-max-tokens` (达到输出
 * 上限) and `model-retry` (已重试模型请求) — stay visible in open turns
 * and inside tool groups alike. */
export const UNFOLDED_NOTICE_KINDS = new Set(['turn-error', 'turn-max-tokens', 'model-retry'])

export interface NoticeNodeWrapperProps {
  /** The node owned by this seat. */
  node: ChatNodeLike
  /** Framework session selector hook (window flags). */
  useSession?: SelectorHook
  /** Chat-target selector hook (the transcript, on both supported channels). */
  useChat?: SelectorHook
  /** Session id (auto-load host keying). */
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
  const { chat, hasMore, loadingOlder } = useSnapshotFace(props)
  const inlineGroup = React.useMemo(
    () => (isInlineNoticeNode(node) ? groupOf(chat, node.key) : null),
    [chat, node],
  )
  const live = React.useMemo(() => latestWorkNode(chat), [chat])
  const [expanded, setExpanded] = React.useState(false)
  const toggle = React.useCallback(() => setExpanded((value) => !value), [])
  const onKeyDown = React.useCallback((event: React.KeyboardEvent) => {
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault()
      setExpanded((value) => !value)
    }
  }, [])

  const t = getGroupT() ?? ((key: string, params?: Record<string, unknown>) => (params && 'count' in params ? String(params.count) : key))
  const seatT = (typeof props.t === 'function' ? props.t : undefined) as TranslateLike | undefined
  setConversationT(compositeT(getChatT(), seatT))

  let output: React.ReactNode
  // Fail-soft: only act on the notice kinds this wrapper owns.
  if (!NOTICE_KINDS.has(node.kind)) {
    output = React.createElement(FoldedSeat, null)
  } else if (UNFOLDED_NOTICE_KINDS.has(node.kind)) {
    // Never folded: delegate straight to the official cell view (the same
    // delegation DelegatedNoticeItem uses), with the composite translate so
    // the chat-cell keys resolve on every supported channel.
    const official = officialNodeEntry(node.kind)
    const conversationT = compositeT(getChatT(), seatT)
    output = official !== undefined && official.component != null && conversationT !== undefined
      ? React.createElement(official.component as React.ComponentType<Record<string, unknown>>, { node, t: conversationT })
      : React.createElement(FoldedSeat, null)
  } else if (inlineGroup === null || !isGroupLeader(inlineGroup, node.key)) {
    // Member of an inline group (or no group at all): hidden.
    output = React.createElement(FoldedSeat, null)
  } else {
    const g = inlineGroup as ToolGroup
    const official = officialNodeEntry(node.kind)
    if (g.count === 1 && (official === undefined || official.component == null)) {
      // A lone notice with no official view: collapse to the hidden marker
      // instead of a dead bar.
      output = React.createElement(FoldedSeat, null)
    } else {
      const conversationT = compositeT(getChatT(), seatT)
      output = React.createElement(
        'div',
        { className: 'dshToolGroup', 'data-tool-group': '', 'data-notice': '' } as unknown as React.HTMLAttributes<HTMLDivElement>,
        React.createElement(GroupBar, { group: g, expanded, onToggle: toggle, onKeyDown, t, live }),
        expanded ? React.createElement(GroupItems, { group: g, t, conversationT }) : null,
      )
    }
  }
  return React.createElement(AutoLoadHost, { sessionId, hasMore, loadingOlder }, output)
})