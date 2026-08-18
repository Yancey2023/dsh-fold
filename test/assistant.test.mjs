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
import { create } from 'react-test-renderer'
import { AssistantNodeWrapper, setSlotsService } from '../lib/client-assistant.mjs'

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

// The live slots service: official assistant entry at priority 0, plus the
// plugin's own shadow entry at -100 (both must be visible via entries()).
const officialAssistant = () => 'OFFICIAL_ASSISTANT'
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
// Transparent node, standalone (no tools around) -> official rendering.
// ---------------------------------------------------------------------------
{
  const snapshot = makeSession(['a1'], [assistantNode('a1', 1, [think('standalone')])])
  const root = create(React.createElement(AssistantNodeWrapper, makeProps(snapshot, 'a1')))
  assert.equal(root.toJSON(), 'OFFICIAL_ASSISTANT', 'standalone think row delegates to the official view')
  root.unmount()
}

// ---------------------------------------------------------------------------
// Text-bearing node (final answer) -> official rendering, never hidden.
// ---------------------------------------------------------------------------
{
  const snapshot = makeSession(
    ['t1', 'a1'],
    [toolNode('t1', 1, settled('read')), assistantNode('a1', 1, [think('hmm'), textBlock('最终结果是 ABC。')])],
  )
  const root = create(React.createElement(AssistantNodeWrapper, makeProps(snapshot, 'a1')))
  assert.equal(root.toJSON(), 'OFFICIAL_ASSISTANT', 'text-bearing assistant delegates to the official view')
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
