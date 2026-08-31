/**
 * AssistantNodeWrapper — the shadowing renderer for `conversation.chat.node`
 * cell `assistant-step`.
 *
 * Two cases:
 *   - TRANSPARENT node (blocks contain only reasoning / tool-call
 *     placeholders / empty text): ALWAYS folded. If its run contains tool
 *     calls it joins that group (renders null; the tool leader owns the bar).
 *     If the run is think-only, the FIRST transparent node leads its own
 *     folded bar ("N 个块已被折叠") that expands into the Think rows.
 *   - everything else (assistant TEXT, interrupted steps): renders the
 *     OFFICIAL AssistantNodeView. Because the keyed slot dispatch can only
 *     reach the cell winner, the official component is obtained from the
 *     live slot registry (`slots.entries(...)`, the public read of all
 *     registrations) and mounted with this seat's own composed kit — the
 *     same props the renderer would have passed to it unshadowed (node,
 *     useTurnData bound to this node's key, openFile, loadImage,
 *     fileMentions, t in the conversation namespace). React.memo components
 *     are objects, not functions — never shape-check the component.
 *
 * The registry lookup degrades fail-soft: if the official entry is ever
 * missing, text nodes render nothing rather than breaking the flow.
 */

import * as React from 'react'
import { groupOf, isGroupLeader, isTransparentAssistant, latestWorkNode } from './group'
import type { AssistantBlockLike } from './group'
import type { ChatNodeLike } from './group'
import { GroupBar, GroupItems, TurnFoldBar } from './ToolCallGroupView'
import { AutoLoadHost } from './AutoLoadHost'
import { useSnapshotFace } from './snapshot-face'
import type { SelectorHook } from './snapshot-face'
import { isProcessNode, isTurnSummary, setTurnExpanded, turnProcessOf, useTurnExpanded } from './turn-fold'
import { getGroupT } from './translate'
import { compositeT, getChatT, officialNodeEntry, setConversationT } from './registry'
import type { TranslateLike } from './registry'
export { setGroupT } from './translate'
export { setSlotsService } from './registry'

export interface AssistantNodeWrapperProps {
  /** The assistant-step node owned by this seat. */
  node: ChatNodeLike
  /** Framework session selector hook (window flags; on rc also the chat). */
  useSession?: SelectorHook
  /** Chat-target selector hook (alpha 0.1.2+; absent on rc). */
  useChat?: SelectorHook
  /** Session id (big-fold state is keyed per session). */
  sessionId?: string
  /** Alpha owner kit: the product's own turn-process controller. */
  turnProcess?: { foldable?: boolean }
  /** Everything else the renderer passed (delegated to the official view). */
  [key: string]: unknown
}

/** The product's AssistantNodeView entry (priority 0), when registered. */
function officialAssistantEntry(): { component: unknown } | undefined {
  return officialNodeEntry('assistant-step')
}

/** Official text rendering with reasoning blocks folded away. */
function renderOfficial(props: AssistantNodeWrapperProps): React.ReactElement | null {
  const { node } = props
  const official = officialAssistantEntry()
  // React.memo returns an OBJECT (not a function), so only reject absent
  // entries — never shape-check the component.
  if (official === undefined || official.component == null) return null
  const data = node.data as { blocks?: readonly AssistantBlockLike[] } | undefined
  const blocks = data?.blocks
  const filtered = Array.isArray(blocks) ? blocks.filter((b) => b.kind !== 'reasoning') : blocks
  // The official view's copy lives in the host's live cell namespace
  // (`chat` on alpha, `conversation` on rc) — hand it the composite instead
  // of this seat's own bound `t` so its keys actually translate.
  const forwardedBase = { ...props, t: compositeT(getChatT(), (typeof props.t === 'function' ? props.t : undefined) as TranslateLike | undefined) }
  const forwarded = filtered === blocks ? forwardedBase : { ...forwardedBase, node: { ...node, data: { ...data, blocks: filtered } } }
  return React.createElement(official.component as React.ComponentType<Record<string, unknown>>, forwarded as Record<string, unknown>)
}

/** Renders nothing but marks the seat as folded so its flowItem is hidden
 * (no 16px column gap for hidden members). */
function FoldedSeat(): React.ReactElement {
  return React.createElement('div', { 'data-tool-group-hidden': '' })
}

export const AssistantNodeWrapper = React.memo(function AssistantNodeWrapper(props: AssistantNodeWrapperProps): React.ReactElement | null {
  const { node, useSession, sessionId } = props
  const seatT = (typeof props.t === 'function' ? props.t : undefined) as TranslateLike | undefined
  // The assistant seat binds the CONVERSATION namespace; stash the composite
  // (chat-first on alpha, conversation otherwise) for group members that
  // render product text (the official model-retry row).
  setConversationT(compositeT(getChatT(), seatT))
  // ALL hooks unconditional (React rules; a path-dependent hook order
  // crashes with "Rendered fewer hooks than expected").
  const { chat, hasMore, loadingOlder } = useSnapshotFace(props)
  // Alpha 0.1.2's own compact-transcript turn folding is active for this
  // turn: yield the big fold entirely to the product (no double bars); the
  // small tool/think groups stay ours.
  const productFoldActive = props.turnProcess !== undefined
  const group = React.useMemo(() => (isTransparentAssistant(node) ? groupOf(chat, node.key) : null), [chat, node])
  const turnInfo = React.useMemo(
    () => (productFoldActive ? null : turnProcessOf(chat, node.key)),
    [chat, node, productFoldActive],
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

  // The composite conversation translate for group members that render
  // product text (the official model-retry row).
  const groupConversationT = compositeT(getChatT(), seatT)
  // The think-group (small fold) content for the leader seat.
  const thinkContent =
    group !== null && isGroupLeader(group, node.key)
      ? React.createElement(
          React.Fragment,
          null,
          React.createElement(GroupBar, { group, expanded, onToggle: toggle, onKeyDown, t, live }),
          expanded ? React.createElement(GroupItems, { group, t, conversationT: groupConversationT }) : null,
        )
      : null

  let output: React.ReactNode
  // The turn's final summary: official text, never folded.
  if (turnInfo !== null && isTurnSummary(turnInfo, node.key)) {
    output = renderOfficial(props)
  } else if (turnInfo !== null && isProcessNode(turnInfo, node.key)) {
    // A process node of a closed, summarized turn: hidden behind the big fold
    // (only the first seat renders the big fold bar).
    const first = node.key === turnInfo.firstKey
    if (!turnExpanded) {
      output = first ? React.createElement(TurnFoldBar, { expanded: false, onToggle: turnToggle, onKeyDown: turnKeyDown, t }) : React.createElement(FoldedSeat, null)
    } else {
      const content = group === null ? renderOfficial(props) : thinkContent
      if (content === null) {
        // Non-leader think member while the big fold is expanded: still nothing
        // to render — mark the seat so its flowItem leaves no gap.
        output = first ? React.createElement(TurnFoldBar, { expanded: true, onToggle: turnToggle, onKeyDown: turnKeyDown, t }) : React.createElement(FoldedSeat, null)
      } else {
        output = React.createElement(
          React.Fragment,
          null,
          first ? React.createElement(TurnFoldBar, { expanded: true, onToggle: turnToggle, onKeyDown: turnKeyDown, t }) : null,
          content,
        )
      }
    }
  } else if (group === null) {
    // No big fold: current behavior. Non-leader think seats fold to nothing
    // (marked so the flowItem is hidden instead of leaving a gap).
    output = renderOfficial(props)
  } else if (thinkContent === null) {
    output = React.createElement(FoldedSeat, null)
  } else {
    output = thinkContent
  }
  return React.createElement(AutoLoadHost, { sessionId, hasMore, loadingOlder }, output)
})
