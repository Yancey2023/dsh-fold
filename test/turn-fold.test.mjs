/**
 * Unit tests for the turn-level ("big") fold computation.
 */
import assert from 'node:assert/strict'
import { turnProcessOf, isProcessNode, isTurnSummary, eqTurnProcess } from '../lib/client-turn-fold.mjs'

function toolNode(key, turn, root) {
  return { key, kind: 'tool-call', location: { kind: 'step', turn: { turn }, step: { step: 1 } }, data: { root } }
}
function assistantNode(key, turn, blocks, status = 'settled') {
  return { key, kind: 'assistant-step', location: { kind: 'step', turn: { turn }, step: { step: 1 } }, data: { blocks, status } }
}
function running(name) {
  return { callId: `c-${name}`, name, argsRaw: '{}', turn: 1, step: 1 }
}
function settled(name) {
  return { kind: 'tool-result', callId: `c-${name}`, call: { name, argsRaw: '{}' }, content: [], isError: false }
}
const think = (text) => ({ kind: 'reasoning', text })
const textBlock = (text) => ({ kind: 'text', text })

function snapshot(order, nodes, turnEnds) {
  return {
    chat: { order, nodes: new Map(nodes.map((n) => [n.key, n])) },
    ...(turnEnds ? { turnEnds } : {}),
  }
}

// ---------------------------------------------------------------------------
// Turn still open (no turn/end) -> no big fold.
// ---------------------------------------------------------------------------
{
  const s = snapshot(['t1', 'aSum'], [toolNode('t1', 1, settled('read')), assistantNode('aSum', 1, [textBlock('总结')])], new Map())
  assert.equal(turnProcessOf(s, 't1'), null, 'open turn has no big fold')
}

// ---------------------------------------------------------------------------
// Closed turn with summary: tools + think + intermediate text = process span.
// ---------------------------------------------------------------------------
{
  const s = snapshot(
    ['aTh1', 't1', 't2', 'aMid', 't3', 'aSum'],
    [
      assistantNode('aTh1', 1, [think('reasoning 1')]),
      toolNode('t1', 1, settled('read')),
      toolNode('t2', 1, settled('grep')),
      assistantNode('aMid', 1, [textBlock('中间过程')]),
      toolNode('t3', 1, running('bash')),
      assistantNode('aSum', 1, [textBlock('最终总结')]),
    ],
    new Map([[1, 999]]),
  )
  const info = turnProcessOf(s, 't1')
  assert.ok(info, 'closed summarized turn folds')
  assert.equal(info.turn, 1)
  assert.equal(info.summaryKey, 'aSum', 'summary = last text-bearing assistant')
  assert.equal(info.firstKey, 'aTh1', 'first process node leads the big fold')
  assert.deepEqual([...info.keys], ['aTh1', 't1', 't2', 'aMid', 't3'], 'process = everything except the summary')
  assert.equal(isProcessNode(info, 't1'), true)
  assert.equal(isProcessNode(info, 'aSum'), false, 'summary is not part of the fold')
  assert.equal(isTurnSummary(info, 'aSum'), true)
  assert.equal(isTurnSummary(info, 't1'), false)
}

// ---------------------------------------------------------------------------
// Closed turn WITHOUT a text summary (ends think-only) -> no big fold.
// ---------------------------------------------------------------------------
{
  const s = snapshot(
    ['t1', 'aTh'],
    [toolNode('t1', 1, settled('read')), assistantNode('aTh', 1, [think('only thinking')])],
    new Map([[1, 999]]),
  )
  assert.equal(turnProcessOf(s, 't1'), null, 'no summary -> no big fold')
}

// ---------------------------------------------------------------------------
// Closed turn with ONLY a summary -> nothing to fold.
// ---------------------------------------------------------------------------
{
  const s = snapshot(['aSum'], [assistantNode('aSum', 1, [textBlock('只有总结')])], new Map([[1, 999]]))
  assert.equal(turnProcessOf(s, 'aSum'), null, 'nothing to fold')
}

// ---------------------------------------------------------------------------
// Notice kinds join the big fold: compaction / context / command nodes are
// process nodes; the summary stays the last text-bearing assistant node.
// ---------------------------------------------------------------------------
{
  const notice = (key, kind) => ({ key, kind, location: { kind: 'turn', turn: { turn: 1 } }, data: {} })
  const s = snapshot(
    ['c1', 'u1', 'aTh', 't1', 'ctx1', 'cmd1', 'aSum'],
    [
      notice('c1', 'compaction'),
      notice('u1', 'user'),
      assistantNode('aTh', 1, [think('reasoning')]),
      toolNode('t1', 1, settled('read')),
      notice('ctx1', 'context'),
      notice('cmd1', 'command'),
      assistantNode('aSum', 1, [textBlock('最终总结')]),
    ],
    new Map([[1, 999]]),
  )
  const info = turnProcessOf(s, 'c1')
  assert.ok(info, 'closed summarized turn folds')
  assert.equal(info.summaryKey, 'aSum')
  assert.equal(info.firstKey, 'c1', 'compaction leads the fold when first')
  assert.deepEqual([...info.keys], ['c1', 'aTh', 't1', 'ctx1', 'cmd1'], 'compaction/context/command are process nodes; user is not')
  assert.equal(isProcessNode(info, 'u1'), false, 'user node stays visible')
  assert.equal(isProcessNode(info, 'ctx1'), true)
  assert.equal(isProcessNode(info, 'cmd1'), true)
}

// A closed turn with only a compaction notice (no assistant summary) does
// not big-fold (nothing to summarize against) — the notice keeps its small
// bar instead.
{
  const s = snapshot(['c1'], [{ key: 'c1', kind: 'compaction', location: { kind: 'turn', turn: { turn: 2 } }, data: {} }], new Map([[2, 999]]))
  assert.equal(turnProcessOf(s, 'c1'), null, 'no summary -> no big fold')
}

console.log('turn-fold.test: all assertions passed')
