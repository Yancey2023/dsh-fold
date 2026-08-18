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
import { callName, eqGroup, groupOf, isGroupLeader, isRunningBlock, isTransparentAssistant, latestActiveNode } from './group'
import type { ChatNodeLike, GroupItem, ToolBlockLike, ToolGroup } from './group'
import { runningToolRow } from './tool-row'
import { AutoLoadHost } from './AutoLoadHost'
import { eqTurnProcess, isProcessNode, isTurnSummary, setTurnExpanded, turnProcessOf, useTurnExpanded } from './turn-fold'

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
  /** Child-slot dispatch face (declared via this entry's children table). */
  renderSlot: RenderSlot
  /** Selected call id (details panel highlight). */
  selectedCallId?: string
  /** Session workspace root. */
  cwd?: string
  openFile: (path: string) => void
  inspectCall: (callId: string) => void
  /** Namespace-bound translate (`locale: 'tool-group'`). */
  t: (key: string, params?: Record<string, unknown>) => string
  /** Session id (big-fold state is keyed per session). */
  sessionId?: string
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
  const running = item.node.data?.status === 'running'
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
   * The conversation's LATEST active node (running tool or streaming Think),
   * shown on the bar's left ONLY while collapsed — it reflects what the
   * current conversation is doing right now. undefined while idle.
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
  if (think) {
    const blocks = node.data?.blocks ?? []
    const reasoning = blocks.filter((block) => block.kind === 'reasoning' && (block.text ?? '').trim() !== '')
    const text = reasoning.length > 0 ? reasoning[reasoning.length - 1].text ?? '' : ''
    icon = React.createElement(IconThinkOutline14, { size: 14 })
    title = 'Think'
    summary = latestLine(text)
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
    React.createElement('span', { className: 'dshToolGroupVisuallyHidden' }, t('running')),
    React.createElement('span', { className: 'dshToolGroupLiveIcon' }, icon),
    React.createElement('span', { className: 'dshToolGroupLiveTitle' }, title),
    React.createElement('span', { className: 'dshToolGroupLiveSep', 'aria-hidden': true }),
    React.createElement('span', { className: 'dshToolGroupLiveSummary' }, summary),
  )
})

/** The one-line folded bar: [live block? (collapsed only)] [N 个块已被折叠] [chevron]. */
export const GroupBar = React.memo(function GroupBar({ group, expanded, onToggle, onKeyDown, t, cwd, live }: GroupBarProps): React.ReactElement {
  // Requested: the live block shows ONLY while the group is collapsed; when
  // expanded the details are right below, so the bar's left side goes empty.
  const liveShown = live !== undefined && !expanded
  const liveNode = liveShown ? React.createElement(LiveRow, { node: live, cwd, t }) : null
  // The sweep marks the bar whose OWN group hosts the active node (other bars
  // show the same status statically); it also stops when expanded.
  const ownsLive = live !== undefined && group.itemKeys.includes(live.key)
  const running = !expanded && ownsLive
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
      'data-state': running ? 'running' : 'settled',
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
}

/** Expanded contents: think rows and official tool cards in execution order. */
export const GroupItems = React.memo(function GroupItems(props: GroupItemsProps): React.ReactElement {
  const { group, t, renderSlot, selectedCallId, cwd, openFile, inspectCall } = props
  return React.createElement(
    'div',
    { className: 'dshToolGroupItems' },
    group.items.map((item) => {
      if (item.kind === 'think') {
        return React.createElement(ThinkItem, { key: item.key, item, t })
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
  const group = useSession((snapshot) => groupOf(snapshot.chat, node.key), eqGroup)
  const turnInfo = useSession((snapshot) => turnProcessOf(snapshot, node.key), eqTurnProcess)
  const live = useSession((snapshot) => latestActiveNode(snapshot.chat))
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

  let output: React.ReactNode
  if (group === null || !isGroupLeader(group, node.key)) {
    // Non-leader / non-group seat: folded to nothing (mark so the flowItem
    // is hidden instead of leaving a gap).
    output = React.createElement(FoldedSeat, null)
  } else {
    const small = React.createElement(
      'div',
      { className: 'dshToolGroup', 'data-tool-group': '', 'data-state': live !== undefined && group.itemKeys.includes(live.key) && !expanded ? 'running' : 'settled' } as unknown as React.HTMLAttributes<HTMLDivElement>,
      React.createElement(GroupBar, { group, expanded, onToggle: toggle, onKeyDown, t, cwd, live }),
      expanded ? React.createElement(GroupItems, { group, t, renderSlot, selectedCallId, cwd, openFile, inspectCall }) : null,
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
