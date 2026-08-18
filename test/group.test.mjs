/**
 * Unit tests for the group computation (pure logic over the snapshot shape).
 * Maps the acceptance cases to snapshot states, including the reasoning
 * transparency rule.
 */
import assert from 'node:assert/strict'
import { groupOf, isGroupLeader, isRunningBlock, callName, eqGroup, isTransparentAssistant, latestActiveNode } from '../lib/client-group.mjs'

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
  assert.equal(g.count, 4, 'folded-block count = tools + think rows')
  assert.equal(callName(g.running), 'grep')
  assert.deepEqual([...g.itemKeys], ['a1', 't1', 'a2', 't2'], 'think rows folded into the run')
  assert.deepEqual(
    g.items.map((i) => i.kind),
    ['think', 'tool', 'think', 'tool'],
    'items interleaved in flow order',
  )
  assert.ok(isGroupLeader(g, 't1'), 'leader is the first TOOL')
  assert.ok(isTransparentAssistant(s.nodes.get('a1')), 'reasoning-only node is transparent')
  assert.equal(isGroupLeader(groupOf(s, 'a1'), 'a1'), false, 'non-leader think seat is not the leader')
  assert.equal(isGroupLeader(groupOf(s, 'a2'), 'a2'), false, 'non-leader think seat is not the leader')
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
  assert.equal(g.count, 3, 'running think row does not split the chain (folded blocks count)')
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
  assert.equal(gMore.count, 4)
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
// THINK-ONLY GROUPS: transparent assistants with no adjacent tools fold into
// their own bar, led by the first transparent node.
// ---------------------------------------------------------------------------
{
  const s = snapshot(['a1'], [assistantNode('a1', 1, [think('standalone reasoning')])])
  const g = groupOf(s, 'a1')
  assert.ok(g && isGroupLeader(g, 'a1'), 'standalone think row leads its own group')
  assert.equal(g.count, 1)
  assert.equal(g.running, undefined)
  assert.deepEqual(g.items.map((i) => i.kind), ['think'])
}

{
  const s = snapshot(
    ['a1', 'a2'],
    [assistantNode('a1', 1, [think('first')]), assistantNode('a2', 1, [think('second')])],
  )
  const g = groupOf(s, 'a1')
  assert.ok(g && isGroupLeader(g, 'a1'), 'consecutive think rows merge into one group')
  assert.equal(g.count, 2)
  assert.deepEqual([...g.itemKeys], ['a1', 'a2'])
}

// Text still bounds think-only groups: [think] | text | [think] -> two bars.
{
  const s = snapshot(
    ['a1', 'txt', 'a2'],
    [assistantNode('a1', 1, [think('first')]), assistantNode('txt', 1, [textBlock('正文')]), assistantNode('a2', 1, [think('second')])],
  )
  const g1 = groupOf(s, 'a1')
  const g2 = groupOf(s, 'a2')
  assert.deepEqual([...g1.itemKeys], ['a1'])
  assert.deepEqual([...g2.itemKeys], ['a2'])
}

// ---------------------------------------------------------------------------
// runningItem: the folded bar's live content.
// ---------------------------------------------------------------------------

// A running tool wins over any still-running think row (the think node stays
// 'running' while its call executes; the working call is what the bar shows).
{
  const s = snapshot(
    ['a1', 't1', 't2'],
    [
      assistantNode('a1', 1, [think('reasoning while t1 runs')], 'running'),
      toolNode('t1', 1, settled('read')),
      toolNode('t2', 1, running('bash')),
    ],
  )
  const g = groupOf(s, 'a1')
  assert.ok(g, 'group exists')
  assert.equal(g.runningItem?.kind, 'tool', 'running tool beats the still-running think')
  assert.equal(g.runningItem?.key, 't2', 'first running tool in flow order')
}

// Only a streaming think (no tool yet): the bar shows the NEWEST think row.
{
  const s = snapshot(
    ['a1', 'a2'],
    [assistantNode('a1', 1, [think('older reasoning')], 'settled'), assistantNode('a2', 1, [think('streaming now')], 'running')],
  )
  const g = groupOf(s, 'a1')
  assert.ok(g, 'group exists')
  assert.equal(g.runningItem?.kind, 'think')
  assert.equal(g.runningItem?.key, 'a2', 'newest streaming think row wins')
}

// All settled / no streaming: no live content.
{
  const s = snapshot(
    ['a1', 't1'],
    [assistantNode('a1', 1, [think('done')]), toolNode('t1', 1, settled('read'))],
  )
  const g = groupOf(s, 'a1')
  assert.ok(g, 'group exists')
  assert.equal(g.runningItem, undefined)
  assert.equal(g.running, undefined)
}

// Think-only group while streaming: runningItem is the think itself.
{
  const s = snapshot(['a1'], [assistantNode('a1', 1, [think('streaming line')], 'running')])
  const g = groupOf(s, 'a1')
  assert.ok(g, 'group exists')
  assert.equal(g.runningItem?.kind, 'think')
  assert.equal(g.running, undefined, 'no tool block running')
}

// ---------------------------------------------------------------------------
// latestActiveNode: the conversation's NEWEST active node (running tool or
// streaming Think) — the folded bar's live content reflects current state.
// ---------------------------------------------------------------------------

// Newest running tool wins over an earlier running tool.
{
  const s = snapshot(['t1', 't2'], [toolNode('t1', 1, running('read')), toolNode('t2', 1, running('bash'))])
  const node = latestActiveNode(s)
  assert.ok(node, 'an active node exists')
  assert.equal(node.key, 't2', 'the LATEST running tool wins')
}

// A streaming Think row becomes the latest once the tool settled.
{
  const s = snapshot(
    ['t1', 'a2'],
    [toolNode('t1', 1, settled('read')), assistantNode('a2', 1, [think('reasoning again')], 'running')],
  )
  const node = latestActiveNode(s)
  assert.equal(node?.key, 'a2', 'streaming think is the latest activity')
}

// While a tool executes, the running tool is the latest (not its preceding think).
{
  const s = snapshot(
    ['a1', 't1'],
    [assistantNode('a1', 1, [think('thinking then calling')], 'running'), toolNode('t1', 1, running('bash'))],
  )
  const node = latestActiveNode(s)
  assert.equal(node?.key, 't1', 'the working call is the latest activity')
}

// Idle conversation: nothing active -> undefined (bar left side empty).
{
  const s = snapshot(
    ['a1', 't1'],
    [assistantNode('a1', 1, [think('done')]), toolNode('t1', 1, settled('read'))],
  )
  assert.equal(latestActiveNode(s), undefined, 'idle -> no live content')
}

// User/summary text between groups does not count as activity.
{
  const s = snapshot(
    ['u1', 't1', 'aSum'],
    [userNode('u1', 1), toolNode('t1', 1, settled('read')), assistantNode('aSum', 1, [textBlock('总结')])],
  )
  assert.equal(latestActiveNode(s), undefined)
}

console.log('group.test: all assertions passed')
