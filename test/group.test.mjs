/**
 * Unit tests for the group computation (pure logic over the snapshot shape).
 * Maps the acceptance cases to snapshot states, including the reasoning
 * transparency rule.
 */
import assert from 'node:assert/strict'
import { groupOf, isGroupLeader, isRunningBlock, callName, eqGroup, isTransparentAssistant, latestWorkNode, isLiveWorkNode } from '../lib/client-group.mjs'

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
// model-retry joins the group: a retry notice between tools does NOT split
// the chain — one group, count includes the retry, order preserved.
// ---------------------------------------------------------------------------
{
  const retry = (key) => ({ key, kind: 'model-retry', location: { kind: 'step', turn: { turn: 1 }, step: { step: 1 } }, data: {} })
  const s = snapshot(['t1', 'mr1', 't2', 'mr2', 't3'], [toolNode('t1', 1, settled('read')), retry('mr1'), toolNode('t2', 1, settled('grep')), retry('mr2'), toolNode('t3', 1, running('bash'))])
  const g = groupOf(s, 't1')
  assert.ok(g && isGroupLeader(g, 't1'), 'tool leader owns the merged group')
  assert.equal(g.count, 5, 'count includes the retry notices')
  assert.deepEqual(g.items.map((i) => i.kind), ['tool', 'notice', 'tool', 'notice', 'tool'], 'retries interleaved in order')
  assert.deepEqual(g.items.filter((i) => i.kind === 'notice').map((i) => i.cell), ['model-retry', 'model-retry'], 'retry items carry the cell key')
  assert.deepEqual([...g.itemKeys], ['t1', 'mr1', 't2', 'mr2', 't3'])
  assert.equal(g.runningItem?.kind, 'tool', 'live content still the running tool')
  assert.equal(g.runningItem?.key, 't3')
  const byT2 = groupOf(s, 't2')
  assert.ok(byT2 && byT2.leaderKey === 't1', 'no separate group for the later tool')
  const byMr = groupOf(s, 'mr1')
  assert.ok(byMr && byMr.leaderKey === 't1', 'retry member resolves to the same group')
  assert.equal(isGroupLeader(byMr, 'mr1'), false, 'retry is not the leader')
}

// context injection merges the same way: adjacent fold blocks become ONE.
{
  const ctx = (key) => ({ key, kind: 'context', location: { kind: 'turn', turn: { turn: 1 } }, data: {} })
  const s = snapshot(['t1', 'ctx1', 't2'], [toolNode('t1', 1, settled('read')), ctx('ctx1'), toolNode('t2', 1, running('bash'))])
  const g = groupOf(s, 't1')
  assert.ok(g && isGroupLeader(g, 't1'), 'tool leader owns the merged group')
  assert.equal(g.count, 3, 'context counts with the group')
  assert.deepEqual(g.items.map((i) => i.kind), ['tool', 'notice', 'tool'], 'context interlaced in order')
  assert.equal(g.items[1].cell, 'context', 'context item carries the cell key')
  const byCtx = groupOf(s, 'ctx1')
  assert.ok(byCtx && byCtx.leaderKey === 't1', 'context member resolves to the same group')
  assert.equal(isGroupLeader(byCtx, 'ctx1'), false, 'context is not the leader')
}

// EVERY non-text notice merges: compaction and a /permission command between
// tools fold into ONE bar with the tools, not separate bars.
{
  const note = (key, kind) => ({ key, kind, location: { kind: 'turn', turn: { turn: 1 } }, data: {} })
  const s = snapshot(
    ['t1', 'c1', 't2', 'cmd1', 't3'],
    [toolNode('t1', 1, settled('read')), note('c1', 'compaction'), toolNode('t2', 1, settled('grep')), note('cmd1', 'command'), toolNode('t3', 1, running('bash'))],
  )
  const g = groupOf(s, 't1')
  assert.ok(g && isGroupLeader(g, 't1'), 'tool leader owns the merged group')
  assert.equal(g.count, 5, 'compaction + command count with the group')
  assert.deepEqual(g.items.map((i) => i.kind), ['tool', 'notice', 'tool', 'notice', 'tool'])
  assert.deepEqual(g.items.filter((i) => i.kind === 'notice').map((i) => i.cell), ['compaction', 'command'], 'cell keys preserved')
}

// A standalone retry (no adjacent tools/thinks) leads its own group.
{
  const s = snapshot(['mr1'], [{ key: 'mr1', kind: 'model-retry', location: { kind: 'step', turn: { turn: 1 }, step: { step: 1 } }, data: {} }])
  const g = groupOf(s, 'mr1')
  assert.ok(g && isGroupLeader(g, 'mr1'), 'standalone retry leads its own group')
  assert.equal(g.count, 1)
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
// latestWorkNode: the conversation's NEWEST work block (a tool call or a
// Think row — running OR settled) — the folded bar's left side reflects the
// AI conversation's latest activity and keeps it after the block finishes.
// ---------------------------------------------------------------------------

// Newest tool wins over an earlier tool, regardless of state.
{
  const s = snapshot(['t1', 't2'], [toolNode('t1', 1, running('read')), toolNode('t2', 1, running('bash'))])
  const node = latestWorkNode(s)
  assert.ok(node, 'a work node exists')
  assert.equal(node.key, 't2', 'the LATEST tool wins')
}

// A (settled or streaming) Think row becomes the latest once the tool settled.
{
  const s = snapshot(
    ['t1', 'a2'],
    [toolNode('t1', 1, settled('read')), assistantNode('a2', 1, [think('reasoning again')], 'running')],
  )
  const node = latestWorkNode(s)
  assert.equal(node?.key, 'a2', 'think row is the latest activity')
}

// While a tool executes, the running tool is the latest (not its preceding think).
{
  const s = snapshot(
    ['a1', 't1'],
    [assistantNode('a1', 1, [think('thinking then calling')], 'running'), toolNode('t1', 1, running('bash'))],
  )
  const node = latestWorkNode(s)
  assert.equal(node?.key, 't1', 'the working call is the latest activity')
}

// ALL SETTLED (bash just finished): the latest work block STAYS displayed —
// a completed bash call is still the conversation's latest activity.
{
  const s = snapshot(
    ['a1', 't1', 't2'],
    [assistantNode('a1', 1, [think('done')]), toolNode('t1', 1, settled('read')), toolNode('t2', 1, settled('bash'))],
  )
  const node = latestWorkNode(s)
  assert.equal(node?.key, 't2', 'finished bash stays as the latest activity')
}

// Pure text (user + summary) with no tool/think work -> undefined.
{
  const s = snapshot(
    ['u1', 'aSum'],
    [userNode('u1', 1), assistantNode('aSum', 1, [textBlock('总结')])],
  )
  assert.equal(latestWorkNode(s), undefined, 'no tool/think work at all')
}

// NEW TEXT after the last tool: the latest state is the model writing, so
// the folded bar clears (a stale tool must not keep showing).
{
  const s = snapshot(
    ['t1', 'aSum'],
    [toolNode('t1', 1, settled('bash')), assistantNode('aSum', 1, [textBlock('新的正文出现')])],
  )
  assert.equal(latestWorkNode(s), undefined, 'new text clears the bar')
}

// A user message after the work clears it too.
{
  const s = snapshot(
    ['t1', 'u1'],
    [toolNode('t1', 1, settled('bash')), userNode('u1', 1)],
  )
  assert.equal(latestWorkNode(s), undefined, 'user message after work clears the bar')
}

// A streaming text node clears the bar while it streams.
{
  const s = snapshot(
    ['t1', 'aTxt'],
    [toolNode('t1', 1, settled('bash')), assistantNode('aTxt', 1, [textBlock('正在写正文...')], 'running')],
  )
  assert.equal(latestWorkNode(s), undefined, 'streaming text clears the bar')
}

// ---------------------------------------------------------------------------
// ALPHA (0.1.2): the turn-process controller node is flow-TRANSPARENT.
// It sits between work in every closed turn; it must neither split a run,
// nor count as a folded block, nor become the group leader.
// ---------------------------------------------------------------------------

// Two tool calls + a think row with the controller between them: ONE group.
{
  const s = snapshot(
    ['t1', 'tp', 't2', 'aTh'],
    [
      toolNode('t1', 1, settled('read')),
      { key: 'tp', kind: 'turn-process', location: { kind: 'turn', turn: { turn: 1, status: 'closed' } }, data: {} },
      toolNode('t2', 1, settled('grep')),
      assistantNode('aTh', 1, [think('reasoning')], 'settled'),
    ],
  )
  const g = groupOf(s, 't2')
  assert.ok(g, 'group still forms across the controller')
  assert.equal(g.count, 3, 'controller is not counted (read+grep+think)')
  assert.equal(g.leaderKey, 't1', 'leader is the first tool')
  assert.ok(g.items.every((it) => it.node.kind !== 'turn-process'), 'controller never becomes a folded item')
}

// A run that is ONLY the controller has no foldable member -> no group.
{
  const s = snapshot(
    ['tp'],
    [{ key: 'tp', kind: 'turn-process', location: { kind: 'turn', turn: { turn: 1, status: 'closed' } }, data: {} }],
  )
  assert.equal(groupOf(s, 'tp'), null, 'controller seat itself is never a group')
}

// ---------------------------------------------------------------------------
// RC (0.1.1): assistant data has NO `status`; a step streams while its
// durable `final` node is absent. isLiveWorkNode must treat that as running.
// ---------------------------------------------------------------------------

// rc-era streaming think: status undefined, final undefined -> live.
{
  const node = {
    key: 'a1',
    kind: 'assistant-step',
    location: { kind: 'step', turn: { turn: 1 }, step: { step: 1 } },
    data: { blocks: [think('streaming...')] },
  }
  assert.equal(isLiveWorkNode(node), true, 'no status + no final = streaming (rc)')
}

// rc-era settled think: final present -> not live.
{
  const node = {
    key: 'a1',
    kind: 'assistant-step',
    location: { kind: 'step', turn: { turn: 1 }, step: { step: 1 } },
    data: { blocks: [think('done')], final: {} },
  }
  assert.equal(isLiveWorkNode(node), false, 'final present = settled (rc)')
}

// rc-era streamING text: still clears the folded bar.
{
  const s = snapshot(
    ['t1', 'aTxt'],
    [
      toolNode('t1', 1, settled('bash')),
      { key: 'aTxt', kind: 'assistant-step', location: { kind: 'step', turn: { turn: 1 }, step: { step: 2 } }, data: { blocks: [textBlock('写正文...')] } },
    ],
  )
  assert.equal(latestWorkNode(s), undefined, 'rc streaming text clears the bar')
}

console.log('group.test: all assertions passed')
