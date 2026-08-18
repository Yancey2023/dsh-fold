/**
 * ToolCallGroupView — the shadowing renderer for `conversation.chat.node`
 * cell `tool-call`.
 *
 * One ChatNodeSeat mounts per tool-call node. Only the seat of the group's
 * FIRST member renders the group row; every other member seat returns null
 * (its flowItem div is empty — zero-height). The group is computed from the
 * conversation snapshot (`snapshot.chat.order` + `snapshot.chat.nodes`), so
 * streaming appends re-render the leader with the new count/running label
 * while non-leader seats stay untouched.
 *
 * Collapsed: one line — [running tool name (only while a call is in
 * progress)] [count] [chevron]. All members settled => empty left side.
 * Expanded: the official per-call UI (same `tool.call.toolview` dispatch the
 * product's ToolCallTree uses) for every member, in execution order.
 *
 * Expanded state lives in React state of the leader seat; the seat's React
 * key is the leader's stable node key, so streaming updates never collapse a
 * user-expanded group.
 */

import * as React from 'react'
import { IconChevronDownOutline14, IconChevronRightOutline14 } from '@deepseek-ai/dsh-client-ui-primitives'
import { callName, eqGroup, groupOf, isGroupLeader, isRunningBlock } from './group'
import type { ChatNodeLike, ToolBlockLike } from './group'
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
        if (p.type === 'image' || p.type === 'file') return ''
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

/** The group row itself (collapsed bar + optional expanded members). */
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

  const members =
    group.members.length > 0
      ? React.createElement(
          'div',
          { className: 'dshToolGroupMembers' },
          group.members.map((member) => {
            const root = member.data?.root
            if (root === undefined) return null
            return React.createElement(ToolCallBranch, {
              key: member.key,
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
      : null

  return React.createElement(
    'div',
    { className: 'dshToolGroup', 'data-tool-group': '', 'data-state': runningName !== null ? 'running' : 'settled' } as unknown as React.HTMLAttributes<HTMLDivElement>,
    bar,
    expanded && members !== null ? members : null,
  )
})
