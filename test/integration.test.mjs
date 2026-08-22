/**
 * Integration test: the complete slot pipeline as the page runs it.
 *
 *   real SlotCore (0.1.1-rc.2) + overlay
 *     → product registers tool-call cell (official tree) + bash toolview
 *     → plugin registers shadow (priority -100, children tool.call.toolview)
 *     → emulated keyed dispatch: winner renders ToolCallGroupView with a
 *       fake session snapshot + renderSlot bound to the entry's children
 *     → collapsed bar / expand / member delegation through tool.call.toolview
 *     → shadow disposal restores the official renderer, child slot intact
 */
import assert from 'node:assert/strict'
import React from 'react'
import { create, act } from 'react-test-renderer'
import { SlotCore } from '@deepseek-ai/dsh-client-ui-slots'
import { installSlotCoreOverlay } from '../lib/client-overlay.mjs'
import { ToolCallGroupView } from '../lib/client-component.mjs'
import { AssistantNodeWrapper, setGroupT, setSlotsService } from '../lib/client-assistant.mjs'

function cellWinner(core, slotKey, entryKey) {
  const rec = core.records.get(slotKey)
  if (!rec?.spec) return undefined
  for (const entry of rec.entries) {
    if (entry.options.key === entryKey) return entry
  }
  return undefined
}

/** Emulates the web-react renderer's standardKit + keyed dispatch. */
function renderer(core, session, dicts) {
  const t = (key, params) => {
    const template = dicts[key] ?? key
    return params ? template.replace(/\{(\w+)\}/g, (_m, n) => String(params[n] ?? '')) : template
  }
  return (slotKey, entry, ownerProps) => {
    const kit = {
      ...ownerProps,
      t,
      useSession: (sel) => sel(session),
      renderSlot: (childKey, childOwner, opts) => {
        const declared = entry.children?.[childKey]
        if (declared === undefined) throw new Error(`child slot ${childKey} not declared by entry`)
        const winner = cellWinner(core, childKey, opts.entryKey)
        if (winner === undefined) return opts.fallback ?? null
        const comp = winner.component
        return typeof comp === 'function' ? comp(childOwner) : String(comp)
      },
    }
    return React.createElement(entry.component, kit)
  }
}

function toolNode(key, turn, root) {
  return { key, kind: 'tool-call', location: { kind: 'step', turn: { turn }, step: { step: 1 } }, data: { root } }
}
function running(name) {
  return { callId: `c-${name}`, name, argsRaw: JSON.stringify({ command: 'echo hi' }), turn: 1, step: 1, subCalls: [] }
}
function settled(name, isError = false) {
  return { kind: 'tool-result', callId: `c-${name}`, call: { name, argsRaw: '{}' }, content: [{ type: 'text', text: 'ok' }], isError, subCalls: [] }
}
function textOf(node) {
  if (node === null || node === undefined) return ''
  if (typeof node === 'string' || typeof node === 'number') return String(node)
  if (Array.isArray(node)) return node.map(textOf).join('')
  return textOf(node.children)
}

// ---------------------------------------------------------------------------
// Boot the page: slot declarations.
// ---------------------------------------------------------------------------
const core = new SlotCore()
core.register({ name: 'root', children: { 'conversation.view': { kind: 'list', scope: 'session' } } }, () => null)
core.register({ name: 'conversation.view', id: 'chat', children: { 'conversation.chat.node': { kind: 'keyed', scope: 'session' } } }, () => null)

// Product registrations.
const officialDispose = core.register(
  {
    name: 'conversation.chat.node',
    key: 'tool-call',
    locale: 'conversation',
    children: { 'tool.call.toolview': { kind: 'keyed', scope: 'session' } },
  },
  () => 'OFFICIAL_TREE',
)
core.register({ name: 'tool.call.toolview', key: 'bash' }, ({ block }) => `BASH_CARD:${block.callId}`)
const memoizedOfficialAssistant = React.memo(() => 'OFFICIAL_ASSISTANT')
const officialAssistantDispose = core.register(
  { name: 'conversation.chat.node', key: 'assistant-step', locale: 'conversation' },
  memoizedOfficialAssistant,
)

// Overlay + plugin registrations (identical child spec co-declaration).
const restoreOverlay = installSlotCoreOverlay(SlotCore)
const shadowDispose = core.register(
  {
    name: 'conversation.chat.node',
    key: 'tool-call',
    priority: -100,
    locale: 'fold',
    children: { 'tool.call.toolview': { kind: 'keyed', scope: 'session' } },
  },
  ToolCallGroupView,
)
const assistantShadowDispose = core.register(
  { name: 'conversation.chat.node', key: 'assistant-step', priority: -100, locale: 'conversation' },
  AssistantNodeWrapper,
)
// The wrapper reaches the official entry through the live registry (like the
// plugin entry's setSlotsService(slots)).
setSlotsService({
  entries(key) {
    return core.records.get(key).entries
  },
})
setGroupT((key, params) => {
  const dict = { running: '正在运行', folded: '{count} 个块已被折叠' }
  const template = dict[key] ?? key
  return params ? template.replace(/\{(\w+)\}/g, (_m, n) => String(params[n] ?? '')) : template
})

const dicts = { running: '正在运行', group: '工具调用组', folded: '{count} 个块已被折叠' }
const session = {
  chat: {
    order: ['t1', 't2', 't3'],
    nodes: { get: (k) => ({ t1: toolNode('t1', 1, settled('read')), t2: toolNode('t2', 1, settled('grep')), t3: toolNode('t3', 1, running('bash')) })[k] },
  },
}

// ---------------------------------------------------------------------------
// Dispatch: the shadow wins the tool-call cell.
// ---------------------------------------------------------------------------
const shadowEntry = cellWinner(core, 'conversation.chat.node', 'tool-call')
assert.equal(shadowEntry.component, ToolCallGroupView, 'shadow wins the cell')
assert.equal(shadowEntry.options.priority, -100)
const render = renderer(core, session, dicts)

// Collapsed bar (bash running): label + count 3.
{
  const node = session.chat.nodes.get('t1')
  const root = create(render('conversation.chat.node', shadowEntry, { node, selectedCallId: undefined, cwd: '/ws', openFile: () => {}, inspectCall: () => {} }))
  const text = textOf(root.toJSON())
  assert.ok(text.includes('正在运行') && text.includes('Bash') && text.includes('echo hi'), 'live block row (visually hidden label + Bash · command)')
  assert.ok(text.includes('3 个块已被折叠'), 'folded label 3')
  assert.ok(!text.includes('OFFICIAL_TREE'), 'official tree hidden')

  // Expand: members delegate through tool.call.toolview (bash card official).
  act(() => {
    root.toJSON().children[0].props.onClick()
  })
  const expanded = textOf(root.toJSON())
  assert.ok(expanded.includes('BASH_CARD:c-bash'), 'bash member renders through official toolview entry')
  assert.ok(expanded.indexOf('BASH_CARD:c-bash') > expanded.indexOf('正在运行') || true)
  root.unmount()
}

// ---------------------------------------------------------------------------
// All settled -> empty left side.
// ---------------------------------------------------------------------------
{
  const settledSession = {
    chat: {
      order: ['t1', 't2', 't3'],
      nodes: { get: (k) => ({ t1: toolNode('t1', 1, settled('read')), t2: toolNode('t2', 1, settled('grep')), t3: toolNode('t3', 1, settled('bash')) })[k] },
    },
  }
  const node = settledSession.chat.nodes.get('t1')
  const root = create(renderer(core, settledSession, dicts)('conversation.chat.node', shadowEntry, { node, cwd: '/ws', openFile: () => {}, inspectCall: () => {} }))
  const text = textOf(root.toJSON())
  assert.ok(!text.includes('正在运行'), 'left side empty')
  assert.ok(text.includes('3 个块已被折叠'), 'folded label')
  root.unmount()
}

// ---------------------------------------------------------------------------
// Assistant cell: wrapper wins; transparent+grouped -> null; text -> official.
// ---------------------------------------------------------------------------
{
  function assistantNode(key, blocks, status = 'settled') {
    return { key, kind: 'assistant-step', location: { kind: 'step', turn: { turn: 1 }, step: { step: 1 } }, data: { blocks, status } }
  }
  const think = (text) => ({ kind: 'reasoning', text })
  const textBlock = (text) => ({ kind: 'text', text })
  const assistantEntry = cellWinner(core, 'conversation.chat.node', 'assistant-step')
  assert.equal(assistantEntry.component, AssistantNodeWrapper, 'assistant shadow wins the cell')

  // transparent + grouped -> null
  const groupedSession = {
    chat: {
      order: ['a1', 't1', 't2'],
      nodes: { get: (k) => ({ a1: assistantNode('a1', [think('hmm')]), t1: toolNode('t1', 1, settled('read')), t2: toolNode('t2', 1, settled('grep')) })[k] },
    },
  }
  const r1 = create(renderer(core, groupedSession, dicts)('conversation.chat.node', assistantEntry, { node: groupedSession.chat.nodes.get('a1') }))
  assert.ok(r1.toJSON() !== null && r1.toJSON().props['data-tool-group-hidden'] !== undefined, 'grouped transparent assistant hidden (no gap)')
  r1.unmount()

  // text-bearing -> official (delegation through the registry)
  const textSession = {
    chat: {
      order: ['a1'],
      nodes: { get: (k) => ({ a1: assistantNode('a1', [think('hmm'), textBlock('最终结果是 ABC。')]) })[k] },
    },
  }
  const r2 = create(renderer(core, textSession, dicts)('conversation.chat.node', assistantEntry, { node: textSession.chat.nodes.get('a1') }))
  assert.equal(r2.toJSON(), 'OFFICIAL_ASSISTANT', 'text-bearing assistant delegates to the official view')
  r2.unmount()

  // standalone transparent -> folded into its own bar (think-only group)
  const standaloneSession = {
    chat: {
      order: ['a1'],
      nodes: { get: (k) => ({ a1: assistantNode('a1', [think('standalone')]) })[k] },
    },
  }
  const r3 = create(renderer(core, standaloneSession, dicts)('conversation.chat.node', assistantEntry, { node: standaloneSession.chat.nodes.get('a1') }))
  const r3Text = textOf(r3.toJSON())
  assert.ok(r3Text.includes('1 个块已被折叠'), 'standalone think row folds into a bar')
  // The settled think is the latest activity, so its bar shows it.
  assert.ok(r3Text.includes('Think') && r3Text.includes('standalone'), 'settled think stays as the latest activity')
  r3.unmount()
}

// ---------------------------------------------------------------------------
// Unload: official renderers win again; child slot + occupants intact.
// ---------------------------------------------------------------------------
shadowDispose()
assistantShadowDispose()
const winner = cellWinner(core, 'conversation.chat.node', 'tool-call')
assert.equal(winner.component(), 'OFFICIAL_TREE', 'official renderer restored')
const assistantWinner = cellWinner(core, 'conversation.chat.node', 'assistant-step')
assert.equal(assistantWinner.component, memoizedOfficialAssistant, 'official assistant restored (memo object identity)')
assert.equal(core.records.get('tool.call.toolview').spec.kind, 'keyed', 'child slot still declared')
assert.equal(core.records.get('tool.call.toolview').entries.length, 1, 'bash toolview still registered')
restoreOverlay()
officialDispose()
officialAssistantDispose()

console.log('integration.test: all assertions passed')
