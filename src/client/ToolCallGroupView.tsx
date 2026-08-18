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
  IconChevronDownOutline14,
  IconChevronRightOutline14,
  IconThinkOutline14,
} from '@deepseek-ai/dsh-client-ui-primitives'
import { callName, eqGroup, groupOf, isGroupLeader, isRunningBlock } from './group'
import type { ChatNodeLike, GroupItem, ToolBlockLike } from './group'

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
  useSession: <S>(sel: (snapshot: { chat: { order: readonly string[]; nodes: { get(key: string): ChatNodeLike | undefined } } }) => S, eq?: (a: S, b: S) => boolean) => S
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

/** The group row itself (collapsed bar + optional expanded items). */
export const ToolCallGroupView = React.memo(function ToolCallGroupView(props: ToolCallGroupViewProps): React.ReactElement | null {
  const { node, useSession, renderSlot, selectedCallId, cwd, openFile, inspectCall, t } = props
  const group = useSession((snapshot) => groupOf(snapshot.chat, node.key), eqGroup)
  const [expanded, setExpanded] = React.useState(false)

  if (group === null || !isGroupLeader(group, node.key)) return null

  const runningName = isRunningBlock(group.running) ? group.running.name : null
  const toggle = React.useCallback(() => setExpanded((value) => !value), [])
  const onKeyDown = (event: React.KeyboardEvent) => {
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault()
      setExpanded((value) => !value)
    }
  }

  const chevron = React.createElement(expanded ? IconChevronDownOutline14 : IconChevronRightOutline14, {
    className: 'dshToolGroupChevron',
  })
  const bar = React.createElement(
    'div',
    {
      className: 'dshToolGroupRow',
      role: 'button',
      tabIndex: 0,
      'aria-expanded': expanded,
      'aria-label': `${t('group')} ${group.count}`,
      onClick: toggle,
      onKeyDown,
    },
    React.createElement(
      'div',
      { className: 'dshToolGroupLeft' },
      runningName !== null
        ? [React.createElement('span', { key: 'running', className: 'dshToolGroupRunning' }, t('running')), React.createElement('span', { key: 'name', className: 'dshToolGroupName' }, runningName)]
        : null,
    ),
    React.createElement(
      'div',
      { className: 'dshToolGroupRight' },
      React.createElement('span', { className: 'dshToolGroupCount' }, String(group.count)),
      chevron,
    ),
  )

  const items = React.createElement(
    'div',
    { className: 'dshToolGroupItems' },
    group.items.map((item) => {
      if (item.kind === 'think') {
        return React.createElement(ThinkItem, { key: item.key, item, t })
      }
      const root = item.node.data?.root
      if (root === undefined) return null
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

  return React.createElement(
    'div',
    { className: 'dshToolGroup', 'data-tool-group': '', 'data-state': runningName !== null ? 'running' : 'settled' } as unknown as React.HTMLAttributes<HTMLDivElement>,
    bar,
    expanded ? items : null,
  )
})
