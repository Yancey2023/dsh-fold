/**
 * ToolCallGroupView — the shadowing renderer for `conversation.chat.node`
 * cell `tool-call`.
 *
 * One ChatNodeSeat mounts per tool-call node. Only the seat of the group's
 * FIRST TOOL member renders the group row; every other member seat returns
 * null (its flowItem div is empty — zero-height). The group is computed from
 * the conversation snapshot (`snapshot.chat.order` + `snapshot.chat.nodes`),
 * so streaming appends re-render the leader with the new count/running label
 * while non-leader seats stay untouched.
 *
 * The group folds tool calls AND the reasoning (Think) rows between them
 * (transparent assistant nodes): collapsed shows one line — [running tool
 * name (only while a call is in progress)] [count] [chevron]; all calls
 * settled => empty left side. Expanded shows the bar plus every folded item
 * in execution order: tool calls through the official `tool.call.toolview`
 * dispatch (the same path the product's ToolCallTree uses), think rows as
 * faithful replicas of the product's ReasoningRow (DisclosureRow +
 * ThinkOutline icon, product CSS).
 *
 * Expanded state lives in React state of the leader seat; the seat's React
 * key is the leader's stable node key, so streaming updates never collapse a
 * user-expanded group.
 */

import * as React from 'react'
import {
  DisclosureRow,
  IconApiOutline14,
  IconChevronDownOutline14,
  IconChevronRightOutline14,
  IconQuestionOutline14,
  IconThinkOutline14,
} from '@deepseek-ai/dsh-client-ui-primitives'
import { callName, groupOf, isGroupLeader, isLiveWorkNode, isRunningBlock, isTransparentAssistant, latestWorkNode } from './group'
import type { ChatNodeLike, GroupItem, ToolBlockLike, ToolGroup } from './group'
import { runningToolRow } from './tool-row'
import { AutoLoadHost } from './AutoLoadHost'
import { getConversationT, officialNodeEntry } from './registry'
import { useSnapshotFace } from './snapshot-face'
import type { SelectorHook } from './snapshot-face'
import { isProcessNode, isTurnSummary, setTurnExpanded, turnProcessOf, useTurnExpanded } from './turn-fold'

/** renderSlot face for the `tool.call.toolview` child slot. */
type RenderSlot = (
  key: 'tool.call.toolview',
  owner: ToolCallOwnerProps,
  opts: { entryKey: string; fallback?: React.ReactNode },
) => React.ReactNode

/** Official `tool.call.toolview` owner currency (mirrors the runtime contract). */
export interface ToolCallOwnerProps {
  callId: string
  toolName: string
  block: ToolBlockLike
  cwd?: string
  openFile: (path: string) => void
  inspect?: () => void
}

export interface ToolCallGroupViewProps {
  /** The tool-call node owned by this seat. */
  node: ChatNodeLike
  /** Framework session selector hook (window flags; on rc also the chat). */
  useSession?: SelectorHook
  /** Chat-target selector hook (alpha 0.1.2+; absent on rc). */
  useChat?: SelectorHook
  /** Child-slot dispatch face (declared via this entry's children table). */
  renderSlot: RenderSlot
  /** Selected call id (details panel highlight). */
  selectedCallId?: string
  /** Session workspace root. */
  cwd?: string
  openFile: (path: string) => void
  inspectCall: (callId: string) => void
  /** Namespace-bound translate (`locale: 'fold'`). */
  t: (key: string, params?: Record<string, unknown>) => string
  /** Session id (big-fold state is keyed per session). */
  sessionId?: string
  /** Alpha owner kit: the product's own turn-process controller. */
  turnProcess?: { foldable?: boolean }
}

/** Minimal fallback for tool names without a registered `tool.call.toolview` entry. */
function FallbackToolCard({ toolName, block, t }: { toolName: string; block: ToolBlockLike; t: ToolCallGroupViewProps['t'] }): React.ReactElement {
  const settled = 'kind' in block
  const error = settled && (block.isError === true || block.error !== undefined)
  let argsText = ''
  if (!settled) argsText = block.argsRaw ?? ''
  else if (block.call?.argsRaw) argsText = block.call.argsRaw
  const output = settled ? flattenContent(block.content) : ''
  return React.createElement(
    'div',
    { className: 'dshToolGroupFallback' },
    React.createElement('div', { className: 'dshToolGroupFallbackTitle' }, `${toolName}${error ? ' ✕' : ''}`),
    argsText !== '' ? React.createElement('pre', { className: 'dshToolGroupFallbackArgs' }, argsText) : null,
    settled && output !== '' ? React.createElement('pre', { className: 'dshToolGroupFallbackOutput', 'data-error': error || undefined }, output) : null,
  )
}

/** Flatten a tool result's content blocks to plain text. */
function flattenContent(content: unknown): string {
  if (typeof content === 'string') return content
  if (Array.isArray(content)) {
    return content
      .map((part) => {
        if (part === null || typeof part !== 'object') return ''
        const p = part as { type?: string; text?: unknown; content?: unknown }
        if (p.type === 'text' && typeof p.text === 'string') return p.text
        return ''
      })
      .filter(Boolean)
      .join('\n')
  }
  return ''
}

/**
 * Official member rendering: one root call + recursive subcalls through the
 * same keyed `tool.call.toolview` dispatch the product's ToolCallTree uses.
 */
const ToolCallBranch = React.memo(function ToolCallBranch({
  renderSlot,
  block,
  selectedCallId,
  cwd,
  openFile,
  inspectCall,
  t,
}: {
  renderSlot: RenderSlot
  block: ToolBlockLike
  selectedCallId?: string
  cwd?: string
  openFile: (path: string) => void
  inspectCall: (callId: string) => void
  t: ToolCallGroupViewProps['t']
}): React.ReactElement {
  const name = callName(block)
  const owner = React.useMemo<ToolCallOwnerProps>(
    () => ({
      callId: block.callId,
      toolName: name,
      block,
      openFile,
      cwd,
      inspect: () => {
        inspectCall(block.callId)
      },
    }),
    [block, name, openFile, cwd, inspectCall],
  )
  const children =
    block.subCalls !== undefined && block.subCalls.length > 0
      ? React.createElement(
          'div',
          { className: 'dshToolGroupSubCalls', 'data-subcalls': true },
          block.subCalls.map((child) =>
            React.createElement(ToolCallBranch, {
              key: child.callId,
              renderSlot,
              block: child,
              selectedCallId,
              cwd,
              openFile,
              inspectCall,
              t,
            }),
          ),
        )
      : null
  return React.createElement(
    'div',
    {
      className: 'dshToolGroupCallRow',
      'data-chat-anchor-key': `call:${block.callId}`,
      'data-chat-call-id': block.callId,
      'data-selected': selectedCallId === block.callId || undefined,
    },
    renderSlot('tool.call.toolview', owner, {
      entryKey: name,
      fallback: React.createElement(FallbackToolCard, { toolName: name, block, t }),
    }),
    children,
  )
})

/** First line of a text (product ReasoningRow behavior). */
function firstLine(text: string): string {
  const newline = text.indexOf('\n')
  return newline === -1 ? text : text.slice(0, newline)
}

/** Last visible line (product ReasoningRow behavior while streaming). */
function latestLine(text: string): string {
  const visible = text.trimEnd()
  const newline = visible.lastIndexOf('\n')
  return newline === -1 ? visible : visible.slice(newline + 1)
}

/**
 * Faithful replica of the product's ReasoningRow (Think disclosure): same
 * DisclosureRow composition, same icon, same summary behavior, product CSS.
 */
function InlineThink({ text, running, t }: { text: string; running: boolean; t: ToolCallGroupViewProps['t'] }): React.ReactElement {
  const [expanded, setExpanded] = React.useState(false)
  const summary = running ? latestLine(text) : firstLine(text)
  return React.createElement(
    'div',
    { className: 'dshToolGroupThink', 'data-variant': 'think', 'data-state': running ? 'running' : 'ok' },
    running ? React.createElement('span', { className: 'dshToolGroupVisuallyHidden' }, t('running')) : null,
    React.createElement(DisclosureRow, {
      rowClassName: 'dshToolGroupThinkRow',
      leadingClassName: 'dshToolGroupThinkLeading',
      titleClassName: 'dshToolGroupThinkTitle',
      chevronClassName: 'dshToolGroupThinkChevron',
      icon: React.createElement(IconThinkOutline14, { size: 14 }),
      title: 'Think',
      open: expanded,
      expandable: true,
      expandOnRowClick: true,
      onToggle: () => {
        setExpanded((value) => !value)
      },
      collapsedContent: React.createElement(
        React.Fragment,
        null,
        React.createElement('span', { className: 'dshToolGroupThinkSeparator', 'aria-hidden': true }),
        React.createElement(
          'span',
          { className: 'dshToolGroupThinkSummary', 'data-follow-end': running || undefined },
          summary,
        ),
      ),
      children: React.createElement('div', { className: 'dshToolGroupThinkBody' }, text),
    }),
  )
}

/** One folded think item: render every reasoning block of the assistant node. */
function ThinkItem({ item, t }: { item: GroupItem & { kind: 'think' }; t: ToolCallGroupViewProps['t'] }): React.ReactElement | null {
  const blocks = item.node.data?.blocks ?? []
  const reasoning = blocks.filter((block) => block.kind === 'reasoning' && (block.text ?? '').trim() !== '')
  if (reasoning.length === 0) return null
  const running = isLiveWorkNode(item.node)
  return React.createElement(
    React.Fragment,
    null,
    reasoning.map((block, index) =>
      React.createElement(InlineThink, {
        key: `${item.key}:${index}`,
        text: block.text ?? '',
        running: running && index === reasoning.length - 1,
        t,
      }),
    ),
  )
}

export interface TurnFoldBarProps {
  expanded: boolean
  onToggle: () => void
  onKeyDown: (event: React.KeyboardEvent) => void
  t: (key: string, params?: Record<string, unknown>) => string
}

/** The turn-level ("big") fold bar: "该轮次工作过程已折叠" + chevron. */
export const TurnFoldBar = React.memo(function TurnFoldBar({ expanded, onToggle, onKeyDown, t }: TurnFoldBarProps): React.ReactElement {
  const chevron = React.createElement(expanded ? IconChevronDownOutline14 : IconChevronRightOutline14, {
    className: 'dshToolGroupChevron',
  })
  return React.createElement(
    'div',
    {
      className: 'dshTurnFoldRow',
      role: 'button',
      tabIndex: 0,
      'aria-expanded': expanded,
      'aria-label': t('turnFolded'),
      onClick: onToggle,
      onKeyDown,
    },
    React.createElement('span', { className: 'dshTurnFoldLabel' }, t('turnFolded')),
    chevron,
  )
})

export interface GroupBarProps {
  group: ToolGroup
  expanded: boolean
  onToggle: () => void
  onKeyDown: (event: React.KeyboardEvent) => void
  t: (key: string, params?: Record<string, unknown>) => string
  /** Session workspace root (only the tool-call seat provides it). */
  cwd?: string
  /**
   * The conversation's LATEST active node (running tool or streaming Think);
   * the bar shows it on its left ONLY when this bar's OWN group hosts that
   * node, and only while collapsed — the other folded bars stay empty. The
   * bar therefore reflects the current conversation's latest state at the
   * one place that corresponds to it. undefined while idle.
   */
  live?: ChatNodeLike | undefined
}

/**
 * The live content of the folded bar: the product's collapsed row for the
 * conversation's latest active node — a streaming Think row
 * (`[icon] Think · <latest line>`) or a working tool call
 * (`[icon] <Title> · <summary>`), exactly as the product's own ReasoningRow /
 * ToolRow would render it collapsed. The visually hidden running label keeps
 * AT parity with the product rows.
 */
const LiveRow = React.memo(function LiveRow({ node, cwd, t }: { node: ChatNodeLike; cwd?: string; t: GroupBarProps['t'] }): React.ReactElement {
  let icon: React.ReactElement
  let title: string
  let summary: string
  // Boolean wrapper: `isTransparentAssistant` is a type guard, and a guard in
  // a negative position narrows the else branch to `never` — annotate the
  // alias as plain boolean so `node` keeps its type in both branches.
  const think: boolean = isTransparentAssistant(node)
  const running = isLiveWorkNode(node)
  if (think) {
    const blocks = node.data?.blocks ?? []
    const reasoning = blocks.filter((block) => block.kind === 'reasoning' && (block.text ?? '').trim() !== '')
    const text = reasoning.length > 0 ? reasoning[reasoning.length - 1].text ?? '' : ''
    icon = React.createElement(IconThinkOutline14, { size: 14 })
    title = 'Think'
    // Product ReasoningRow behavior: streaming shows the latest line, a
    // settled think its first (summary) line.
    summary = running ? latestLine(text) : firstLine(text)
  } else {
    const block = node.data?.root
    const name = block === undefined ? '' : callName(block)
    const row = runningToolRow(name, block ?? ({ callId: node.key, name } as ToolBlockLike), cwd)
    icon = React.createElement(name === 'ask_user_question' ? IconQuestionOutline14 : IconApiOutline14, { size: 14 })
    title = row.title
    summary = row.summary
  }
  return React.createElement(
    React.Fragment,
    null,
    running ? React.createElement('span', { className: 'dshToolGroupVisuallyHidden' }, t('running')) : null,
    React.createElement('span', { className: 'dshToolGroupLiveIcon' }, icon),
    React.createElement('span', { className: 'dshToolGroupLiveTitle' }, title),
    React.createElement('span', { className: 'dshToolGroupLiveSep', 'aria-hidden': true }),
    React.createElement('span', { className: 'dshToolGroupLiveSummary' }, summary),
  )
})

/** The one-line folded bar: [live block? (only its own bar, collapsed)] [N 个块已被折叠] [chevron]. */
export const GroupBar = React.memo(function GroupBar({ group, expanded, onToggle, onKeyDown, t, cwd, live }: GroupBarProps): React.ReactElement {
  // Requested:
  //  - the live block reflects the conversation's LATEST active node;
  //  - it shows ONLY on the bar whose OWN group hosts that node (not on
  //    every other folded bar — those keep an empty left side);
  //  - it shows ONLY while the group is collapsed (expanded, the details are
  //    right below, so the bar's left goes empty).
  const liveShown = live !== undefined && !expanded && group.itemKeys.includes(live.key)
  const liveRunning = liveShown && isLiveWorkNode(live)
  const liveNode = liveShown ? React.createElement(LiveRow, { node: live, cwd, t }) : null
  const chevron = React.createElement(expanded ? IconChevronDownOutline14 : IconChevronRightOutline14, {
    className: 'dshToolGroupChevron',
  })
  return React.createElement(
    'div',
    {
      className: 'dshToolGroupRow',
      role: 'button',
      tabIndex: 0,
      'aria-expanded': expanded,
      'aria-label': t('folded', { count: group.count }),
      onClick: onToggle,
      onKeyDown,
      'data-state': liveRunning ? 'running' : 'settled',
    },
    React.createElement('div', { className: 'dshToolGroupLeft' }, liveNode),
    React.createElement(
      'div',
      { className: 'dshToolGroupRight' },
      React.createElement('span', { className: 'dshToolGroupCount' }, t('folded', { count: group.count })),
      chevron,
    ),
  )
})

export interface GroupItemsProps {
  group: ToolGroup
  t: (key: string, params?: Record<string, unknown>) => string
  renderSlot?: RenderSlot
  selectedCallId?: string
  cwd?: string
  openFile?: (path: string) => void
  inspectCall?: (callId: string) => void
  /** Conversation-namespace translate (the official model-retry row needs it). */
  conversationT?: (key: string, params?: Record<string, unknown>) => string
}

/** One folded inline notice at its position inside the expanded group, via
 * the OFFICIAL cell view from the live registry — except the two cells whose
 * official renderers need the full seat kit:
 *  - `command`: the product's CommandNodeView always lands on the internal
 *    GenericCommandCard fallback (no commandview entry is registered), so we
 *    pass a renderSlot that yields that official fallback — full fidelity;
 *  - `workflow-run`: the official panel needs useSessions/sessionId/openSession,
 *    absent here — a compact status row instead. */
const DelegatedNoticeItem = React.memo(function DelegatedNoticeItem({ item, conversationT }: { item: GroupItem & { kind: 'notice' }; conversationT?: GroupItemsProps['conversationT'] }): React.ReactElement | null {
  const t = conversationT ?? getConversationT()
  if (t === undefined) return null
  if (item.cell === 'workflow-run') {
    const data = (item.node.data ?? {}) as { name?: string; status?: string }
    return React.createElement(
      'div',
      { className: 'dshWorkflowRunItem' },
      React.createElement('span', { className: 'dshWorkflowRunTitle' }, data.name ?? 'workflow'),
      data.status !== undefined ? React.createElement('span', { className: 'dshWorkflowRunStatus' }, String(data.status)) : null,
    )
  }
  const official = officialNodeEntry(item.cell)
  if (official === undefined || official.component == null) return null
  if (item.cell === 'command') {
    const renderSlot = (_key: string, _owner: unknown, opts: { fallback?: React.ReactNode } | undefined): React.ReactNode => opts?.fallback ?? null
    return React.createElement(official.component as React.ComponentType<Record<string, unknown>>, { node: item.node, t, renderSlot })
  }
  return React.createElement(official.component as React.ComponentType<Record<string, unknown>>, { node: item.node, t })
})

/** Expanded contents: think rows, model-retry notices and official tool cards in execution order. */
export const GroupItems = React.memo(function GroupItems(props: GroupItemsProps): React.ReactElement {
  const { group, t, renderSlot, selectedCallId, cwd, openFile, inspectCall, conversationT } = props
  return React.createElement(
    'div',
    { className: 'dshToolGroupItems' },
    group.items.map((item) => {
      if (item.kind === 'think') {
        return React.createElement(ThinkItem, { key: item.key, item, t })
      }
      if (item.kind === 'notice') {
        return React.createElement(DelegatedNoticeItem, { key: item.key, item, conversationT })
      }
      const root = item.node.data?.root
      if (root === undefined || renderSlot === undefined || openFile === undefined || inspectCall === undefined) return null
      return React.createElement(ToolCallBranch, {
        key: item.key,
        renderSlot,
        block: root,
        selectedCallId,
        cwd,
        openFile,
        inspectCall,
        t,
      })
    }),
  )
})

/** Renders nothing but marks the seat as folded so its flowItem is hidden
 * (no 16px column gap for hidden members). */
function FoldedSeat(): React.ReactElement {
  return React.createElement('div', { 'data-tool-group-hidden': '' })
}

/** The tool-call seat: only the group's first TOOL leader renders (bar + items). */
export const ToolCallGroupView = React.memo(function ToolCallGroupView(props: ToolCallGroupViewProps): React.ReactElement | null {
  const { node, useSession, renderSlot, selectedCallId, cwd, openFile, inspectCall, t, sessionId } = props
  // ALL hooks unconditional (React rules; a path-dependent hook order
  // crashes with "Rendered fewer hooks than expected").
  const { chat, hasMore, loadingOlder } = useSnapshotFace(props)
  // Alpha 0.1.2's own compact-transcript turn folding is active for this
  // turn: yield the big fold entirely to the product (no double bars); the
  // small tool/think groups stay ours.
  const productFoldActive = props.turnProcess?.foldable === true
  const group = React.useMemo(() => groupOf(chat, node.key), [chat, node])
  const turnInfo = React.useMemo(
    () => (productFoldActive ? null : turnProcessOf(chat, node.key)),
    [chat, node, productFoldActive],
  )
  const live = React.useMemo(() => latestWorkNode(chat), [chat])
  const conversationT = getConversationT()
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

  let output: React.ReactNode
  if (group === null || !isGroupLeader(group, node.key)) {
    // Non-leader / non-group seat: folded to nothing (mark so the flowItem
    // is hidden instead of leaving a gap).
    output = React.createElement(FoldedSeat, null)
  } else {
    const small = React.createElement(
      'div',
      { className: 'dshToolGroup', 'data-tool-group': '', 'data-state': live !== undefined && !expanded && group.itemKeys.includes(live.key) && isLiveWorkNode(live) ? 'running' : 'settled' } as unknown as React.HTMLAttributes<HTMLDivElement>,
      React.createElement(GroupBar, { group, expanded, onToggle: toggle, onKeyDown, t, cwd, live }),
      expanded ? React.createElement(GroupItems, { group, t, renderSlot, selectedCallId, cwd, openFile, inspectCall, conversationT }) : null,
    )

    if (turnInfo !== null && isProcessNode(turnInfo, node.key)) {
      const first = node.key === turnInfo.firstKey
      if (!turnExpanded) {
        output = first ? React.createElement(TurnFoldBar, { expanded: false, onToggle: turnToggle, onKeyDown: turnKeyDown, t }) : React.createElement(FoldedSeat, null)
      } else {
        output = React.createElement(
          React.Fragment,
          null,
          first ? React.createElement(TurnFoldBar, { expanded: true, onToggle: turnToggle, onKeyDown: turnKeyDown, t }) : null,
          turnExpanded ? small : null,
        )
      }
    } else {
      output = small
    }
  }
  return React.createElement(AutoLoadHost, { sessionId, hasMore, loadingOlder }, output)
})
