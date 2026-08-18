/**
 * Render-level tests of AssistantNodeWrapper — the shadowing renderer for
 * the `assistant-step` cell.
 *
 *   transparent node inside a tool run  -> null (the group owns its Think rows)
 *   transparent node, standalone        -> delegates to the official entry
 *   text-bearing node                   -> delegates to the official entry
 */
import assert from 'node:assert/strict'
import React from 'react'
import { create, act } from 'react-test-renderer'
import { AssistantNodeWrapper, setGroupT, setSlotsService } from '../lib/client-assistant.mjs'

function toolNode(key, turn, root) {
  return { key, kind: 'tool-call', location: { kind: 'step', turn: { turn }, step: { step: 1 } }, data: { root } }
}
function assistantNode(key, turn, blocks, status = 'settled') {
  return { key, kind: 'assistant-step', location: { kind: 'step', turn: { turn }, step: { step: 1 } }, data: { blocks, status } }
}
function settled(name) {
  return { kind: 'tool-result', callId: `c-${name}`, call: { name, argsRaw: '{}' }, content: [], isError: false, subCalls: [] }
}
const think = (text) => ({ kind: 'reasoning', text })
const textBlock = (text) => ({ kind: 'text', text })

function makeSession(order, nodes) {
  const map = new Map(nodes.map((n) => [n.key, n]))
  return { chat: { order, nodes: { get: (k) => map.get(k) } } }
}

/** Flatten rendered JSON tree to text. */
function textOf(node) {
  if (node === null || node === undefined) return ''
  if (typeof node === 'string' || typeof node === 'number') return String(node)
  if (Array.isArray(node)) return node.map(textOf).join('')
  return textOf(node.children)
}

function makeProps(snapshot, nodeKey) {
  return {
    node: snapshot.chat.nodes.get(nodeKey),
    useSession: (sel) => sel(snapshot),
    openFile: () => {},
    loadImage: () => Promise.resolve(''),
    fileMentions: () => undefined,
    t: (key) => key,
  }
}

const GROUP_DICTS = { running: '正在运行', folded: '{count} 个块已被折叠' }
setGroupT((key, params) => {
  const template = GROUP_DICTS[key] ?? key
  return params ? template.replace(/\{(\w+)\}/g, (_m, n) => String(params[n] ?? '')) : template
})

// The live slots service: official assistant entry at priority 0, plus the
// plugin's own shadow entry at -100 (both must be visible via entries()).
// The official entry is React.memo-wrapped EXACTLY like the product's
// AssistantNodeView (memo returns an object, not a function) — delegation
// must accept it.
const officialAssistant = React.memo(({ node: n }) => {
  const kinds = ((n && n.data && n.data.blocks) || []).map((b) => b.kind).join(',')
  return `OFFICIAL_ASSISTANT[${kinds}]`
})
setSlotsService({
  entries(key) {
    assert.equal(key, 'conversation.chat.node')
    return [
      { options: { key: 'assistant-step', priority: -100 }, component: AssistantNodeWrapper },
      { options: { key: 'assistant-step', priority: 0 }, component: officialAssistant },
      { options: { key: 'tool-call', priority: 0 }, component: () => 'OFFICIAL_TREE' },
    ]
  },
})

// ---------------------------------------------------------------------------
// Transparent node inside a tool run -> hidden (group owns its Think rows).
// ---------------------------------------------------------------------------
{
  const snapshot = makeSession(
    ['a1', 't1', 'a2', 't2'],
    [assistantNode('a1', 1, [think('first')]), toolNode('t1', 1, settled('read')), assistantNode('a2', 1, [think('second')]), toolNode('t2', 1, settled('grep'))],
  )
  const root = create(React.createElement(AssistantNodeWrapper, makeProps(snapshot, 'a1')))
  assert.equal(root.toJSON(), null, 'grouped transparent assistant renders null')
  root.unmount()
  const root2 = create(React.createElement(AssistantNodeWrapper, makeProps(snapshot, 'a2')))
  assert.equal(root2.toJSON(), null, 'trailing transparent assistant renders null')
  root2.unmount()
}

// ---------------------------------------------------------------------------
// Transparent node, standalone -> folded into its own bar (think-only group).
// ---------------------------------------------------------------------------
{
  const snapshot = makeSession(['a1'], [assistantNode('a1', 1, [think('standalone')])])
  const root = create(React.createElement(AssistantNodeWrapper, makeProps(snapshot, 'a1')))
  const text = textOf(root.toJSON())
  assert.ok(text.includes('1 个块已被折叠'), 'standalone think row folds into a bar')
  assert.ok(!text.includes('standalone'), 'think text hidden while collapsed')
  // expand -> think row shown
  act(() => {
    root.toJSON().children[0].props.onClick()
  })
  assert.ok(textOf(root.toJSON()).includes('standalone'), 'think text shown when expanded')
  root.unmount()
}

// ---------------------------------------------------------------------------
// Think-only group: consecutive standalone think rows fold into ONE bar.
// ---------------------------------------------------------------------------
{
  const snapshot = makeSession(
    ['a1', 'a2'],
    [assistantNode('a1', 1, [think('first reasoning')]), assistantNode('a2', 1, [think('second reasoning')])],
  )
  const root = create(React.createElement(AssistantNodeWrapper, makeProps(snapshot, 'a1')))
  const text = textOf(root.toJSON())
  assert.ok(text.includes('2 个块已被折叠'), 'consecutive think rows merge into one bar')
  assert.ok(!text.includes('first reasoning'), 'think rows hidden while collapsed')
  act(() => {
    root.toJSON().children[0].props.onClick()
  })
  const expanded = textOf(root.toJSON())
  assert.ok(expanded.includes('first reasoning') && expanded.includes('second reasoning'), 'both think rows shown when expanded')
  // member seat renders null
  const member = create(React.createElement(AssistantNodeWrapper, makeProps(snapshot, 'a2')))
  assert.equal(member.toJSON(), null, 'non-leader think seat renders null')
  member.unmount()
  root.unmount()
}

// ---------------------------------------------------------------------------
// Text-bearing node (final answer) -> official rendering, never hidden, but
// its reasoning blocks are FOLDED (only text remains).
// ---------------------------------------------------------------------------
{
  const snapshot = makeSession(
    ['t1', 'a1'],
    [toolNode('t1', 1, settled('read')), assistantNode('a1', 1, [think('hmm'), textBlock('最终结果是 ABC。')])],
  )
  const root = create(React.createElement(AssistantNodeWrapper, makeProps(snapshot, 'a1')))
  assert.equal(root.toJSON(), 'OFFICIAL_ASSISTANT[text]', 'text-bearing assistant delegates with reasoning folded away')
  root.unmount()
}

// Streaming text-bearing node: reasoning folded, text kept.
{
  const snapshot = makeSession(
    ['a1'],
    [assistantNode('a1', 1, [think('thinking...'), textBlock('streaming text')], 'running')],
  )
  const root = create(React.createElement(AssistantNodeWrapper, makeProps(snapshot, 'a1')))
  assert.equal(root.toJSON(), 'OFFICIAL_ASSISTANT[text]', 'running mixed node also folds reasoning')
  root.unmount()
}

// ---------------------------------------------------------------------------
// Streaming: the running transparent node of the next step is hidden too.
// ---------------------------------------------------------------------------
{
  const snapshot = makeSession(
    ['t1', 'a2'],
    [toolNode('t1', 1, settled('read')), assistantNode('a2', 1, [think('streaming...')], 'running')],
  )
  const root = create(React.createElement(AssistantNodeWrapper, makeProps(snapshot, 'a2')))
  assert.equal(root.toJSON(), null, 'running transparent think row is hidden while its chain continues')
  root.unmount()
}

console.log('assistant.test: all assertions passed')
