/**
 * Unit tests for the group computation (pure logic over the snapshot shape).
 * Maps the acceptance cases to snapshot states, including the reasoning
 * transparency rule.
 */
import assert from 'node:assert/strict'
import { groupOf, isGroupLeader, isRunningBlock, callName, eqGroup, isTransparentAssistant, isAssistantGrouped } from '../lib/client-group.mjs'

/** Build a snapshot node. */
function toolNode(key, turn, root) {
  return { key, kind: 'tool-call', location: { kind: 'step', turn: { turn }, step: { step: 1 } }, data: { root } }
}
function assistantNode(key, turn, blocks, status = 'settled') {
  return { key, kind: 'assistant-step', location: { kind: 'step', turn: { turn }, step: { step: 1 } }, data: { blocks, status } }
}
function userNode(key, turn) {
  return { key, kind: 'user', location: { kind: 'turn', turn: { turn } }, data: {} }
}
function running(name) {
  return { callId: `c-${name}`, name, argsRaw: '{}', turn: 1, step: 1 }
}
function settled(name, isError = false) {
  return { kind: 'tool-result', callId: `c-${name}`, call: { name, argsRaw: '{}' }, content: [{ type: 'text', text: 'ok' }], isError }
}
const think = (text) => ({ kind: 'reasoning', text })
const textBlock = (text) => ({ kind: 'text', text })

function snapshot(order, nodes) {
  return { order, nodes: new Map(nodes.map((n) => [n.key, n])) }
}

// ---------------------------------------------------------------------------
// Case 1: single tool running -> group of 1, running label present.
// ---------------------------------------------------------------------------
{
  const s = snapshot(['t1'], [toolNode('t1', 1, running('bash'))])
  const g = groupOf(s, 't1')
  assert.ok(g && isGroupLeader(g, 't1'))
  assert.equal(g.count, 1)
  assert.ok(isRunningBlock(g.running))
  assert.equal(callName(g.running), 'bash')
}

// ---------------------------------------------------------------------------
// Case 2: read + grep settled, bash running -> count 3, running label bash.
// ---------------------------------------------------------------------------
{
  const s = snapshot(
    ['t1', 't2', 't3'],
    [toolNode('t1', 1, settled('read')), toolNode('t2', 1, settled('grep')), toolNode('t3', 1, running('bash'))],
  )
  const g = groupOf(s, 't1')
  assert.ok(g && isGroupLeader(g, 't1'))
  assert.equal(g.count, 3)
  assert.equal(callName(g.running), 'bash')
}

// ---------------------------------------------------------------------------
// Case 3: all settled -> running undefined (empty left side).
// ---------------------------------------------------------------------------
{
  const s = snapshot(
    ['t1', 't2', 't3'],
    [toolNode('t1', 1, settled('read')), toolNode('t2', 1, settled('grep')), toolNode('t3', 1, settled('bash'))],
  )
  const g = groupOf(s, 't2')
  assert.equal(g.running, undefined)
  assert.equal(g.count, 3)
}

// ---------------------------------------------------------------------------
// Case 4: last call failed -> still settled (error ends the chain).
// ---------------------------------------------------------------------------
{
  const s = snapshot(['t1', 't2'], [toolNode('t1', 1, settled('read')), toolNode('t2', 1, settled('bash', true))])
  const g = groupOf(s, 't1')
  assert.equal(g.running, undefined)
  assert.equal(g.count, 2)
}

// ---------------------------------------------------------------------------
// REASONING TRANSPARENCY: think rows between calls do NOT split the chain.
// [think1, toolA, think2, toolB] -> one group of 2, think rows folded in.
// ---------------------------------------------------------------------------
{
  const s = snapshot(
    ['a1', 't1', 'a2', 't2'],
    [assistantNode('a1', 1, [think('first reasoning')]), toolNode('t1', 1, settled('read')), assistantNode('a2', 1, [think('second reasoning')]), toolNode('t2', 1, running('grep'))],
  )
  const g = groupOf(s, 't1')
  assert.equal(g.count, 2, 'tools merge across reasoning')
  assert.equal(callName(g.running), 'grep')
  assert.deepEqual([...g.itemKeys], ['a1', 't1', 'a2', 't2'], 'think rows folded into the run')
  assert.deepEqual(
    g.items.map((i) => i.kind),
    ['think', 'tool', 'think', 'tool'],
    'items interleaved in flow order',
  )
  assert.ok(isGroupLeader(g, 't1'), 'leader is the first TOOL')
  assert.ok(isTransparentAssistant(s.nodes.get('a1')), 'reasoning-only node is transparent')
  assert.equal(isAssistantGrouped(s, 'a1'), true, 'transparent node absorbed by the group')
  assert.equal(isAssistantGrouped(s, 'a2'), true)
}

// ---------------------------------------------------------------------------
// Streaming: a RUNNING reasoning node is transparent too (status running).
// ---------------------------------------------------------------------------
{
  const s = snapshot(
    ['t1', 'a2', 't2'],
    [toolNode('t1', 1, settled('read')), assistantNode('a2', 1, [think('streaming')], 'running'), toolNode('t2', 1, running('grep'))],
  )
  const g = groupOf(s, 't1')
  assert.equal(g.count, 2, 'running think row does not split the chain')
  assert.equal(callName(g.running), 'grep')
}

// ---------------------------------------------------------------------------
// Assistant TEXT splits chains (Case 7/8): read, grep | text A | bash, edit.
// ---------------------------------------------------------------------------
{
  const s = snapshot(
    ['t1', 't2', 'a1', 't3', 't4', 'a2'],
    [
      toolNode('t1', 1, settled('read')),
      toolNode('t2', 1, settled('grep')),
      assistantNode('a1', 1, [textBlock('最终结果是 ABC。')]),
      toolNode('t3', 1, settled('bash')),
      toolNode('t4', 1, settled('edit')),
      assistantNode('a2', 1, [textBlock('final text B')]),
    ],
  )
  const g1 = groupOf(s, 't1')
  const g2 = groupOf(s, 't3')
  assert.deepEqual([...g1.itemKeys], ['t1', 't2'], 'group 1 contains read+grep only')
  assert.deepEqual([...g2.itemKeys], ['t3', 't4'], 'group 2 contains bash+edit only')
  assert.ok(isGroupLeader(g1, 't1'))
  assert.ok(!isGroupLeader(g1, 't2'), 'non-leader seat is not the leader')
  assert.ok(isGroupLeader(g2, 't3'))
  assert.equal(isTransparentAssistant(s.nodes.get('a1')), false, 'text-bearing assistant is NOT transparent')
}

// ---------------------------------------------------------------------------
// Reasoning + text in one node: NOT transparent (text wins).
// ---------------------------------------------------------------------------
{
  const mixed = assistantNode('a1', 1, [think('hmm'), textBlock('answer')])
  assert.equal(isTransparentAssistant(mixed), false)
}

// ---------------------------------------------------------------------------
// Turn boundaries split runs even without an intervening node type change.
// ---------------------------------------------------------------------------
{
  const s = snapshot(
    ['t1', 't2', 't3'],
    [toolNode('t1', 1, settled('read')), toolNode('t2', 2, settled('grep')), toolNode('t3', 2, settled('bash'))],
  )
  const g1 = groupOf(s, 't1')
  const g2 = groupOf(s, 't2')
  assert.deepEqual([...g1.itemKeys], ['t1'])
  assert.deepEqual([...g2.itemKeys], ['t2', 't3'])
}

// ---------------------------------------------------------------------------
// Unresolved locations never merge with anything.
// ---------------------------------------------------------------------------
{
  const s = snapshot(
    ['u1', 'u2'],
    [
      { key: 'u1', kind: 'tool-call', location: { kind: 'unresolved' }, data: { root: running('x') } },
      { key: 'u2', kind: 'tool-call', location: { kind: 'unresolved' }, data: { root: running('y') } },
    ],
  )
  const g1 = groupOf(s, 'u1')
  const g2 = groupOf(s, 'u2')
  assert.deepEqual([...g1.itemKeys], ['u1'])
  assert.deepEqual([...g2.itemKeys], ['u2'])
}

// ---------------------------------------------------------------------------
// eqGroup: reference-stable equality (incl. appended member + think rows).
// ---------------------------------------------------------------------------
{
  const s = snapshot(['a1', 't1', 't2'], [assistantNode('a1', 1, [think('x')]), toolNode('t1', 1, settled('read')), toolNode('t2', 1, settled('grep'))])
  const g = groupOf(s, 't1')
  const gAgain = groupOf(s, 't1')
  assert.equal(eqGroup(g, gAgain), true)
  const mutated = snapshot(['a1', 't1', 't2', 't3'], [...s.nodes.values(), toolNode('t3', 1, running('bash'))])
  const gMore = groupOf(mutated, 't1')
  assert.equal(eqGroup(g, gMore), false, 'appended member changes the group')
  assert.equal(gMore.count, 3)
}

// ---------------------------------------------------------------------------
// Subcalls are NOT counted as members (top-level calls only).
// ---------------------------------------------------------------------------
{
  const withSub = toolNode('t1', 1, { ...running('bash'), subCalls: [{ callId: 's1', name: 'read', argsRaw: '{}' }] })
  const s = snapshot(['t1'], [withSub])
  const g = groupOf(s, 't1')
  assert.equal(g.count, 1, 'subcall does not add to the count')
}

// ---------------------------------------------------------------------------
// A transparent assistant NOT adjacent to tools is standalone (not grouped).
// ---------------------------------------------------------------------------
{
  const s = snapshot(['a1'], [assistantNode('a1', 1, [think('standalone reasoning')])])
  assert.equal(isAssistantGrouped(s, 'a1'), false, 'standalone think row is not absorbed')
}

console.log('group.test: all assertions passed')
