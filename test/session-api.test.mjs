/**
 * Regression tests against the CURRENT DSH Session API
 * (`@deepseek-ai/dsh-session@0.1.6-alpha.2`, the newest npm `alpha` release):
 *
 * Test 1  — the removed `session.events` property is ABSENT on the current
 *           Session; the fold pipeline runs entirely off the new API surface
 *           (`snapshotEvents` / `eventAt` / `seq`) and never crashes with
 *           "Cannot read properties of undefined (reading 'findLast')".
 * Test 2  — a normal completed turn (turn/start → user/message → assistant
 *           events → turn/end) flows through the new API and folds correctly.
 * Test 3  — an EMPTY session (no history) folds to nothing without crashing.
 * Test 4  — llm-retry semantics on the new API: no retry, one retry, several
 *           retries, then a new turn — the retry scan pattern the migration
 *           prescribes (`session.snapshotEvents().findLast(...)`), plus the
 *           fold-side guarantee that model-retry nodes never fold.
 *
 * These tests import the REAL dsh-session devDependency — the same module
 * version the host harness loads — so they fail loudly if the plugin ever
 * regresses onto the removed `session.events` surface.
 */
import assert from 'node:assert/strict'
import { Session, SessionId } from '@deepseek-ai/dsh-session'
import { chatFaceOf, chatFaceEq } from '../lib/client-snapshot-face.mjs'
import { groupOf, isGroupLeader, isTransparentAssistant } from '../lib/client-group.mjs'

// ---------------------------------------------------------------------------
// Test-only adapter: synthesize the client chat-face shape (order/nodes/
// turnEnds — the shape `useChat` returns on the current channel) FROM a real
// Session's event snapshot. This mirrors what the web shell does and keeps
// the fold computations honest against the new API's output.
// ---------------------------------------------------------------------------
function chatFaceFromSession(session, options = {}) {
  const nodes = new Map()
  const order = []
  const pendingTools = new Map()
  const turnEnds = new Map()
  for (const event of session.snapshotEvents()) {
    const d = event.data
    if (event.type === 'user/message') {
      order.push(`user:${event.seq}`)
      nodes.set(`user:${event.seq}`, { key: `user:${event.seq}`, kind: 'user', location: { kind: 'turn', turn: { turn: d.turn } }, data: {} })
    } else if (event.type === 'assistant/message') {
      order.push(`assistant:${event.seq}`)
      const blocks = (d.message?.content ?? []).map((part) => ({ kind: 'text', text: part.text ?? '' }))
      nodes.set(`assistant:${event.seq}`, {
        key: `assistant:${event.seq}`,
        kind: 'assistant-step',
        location: { kind: 'step', turn: { turn: d.turn }, step: { step: d.step } },
        data: { blocks, status: 'settled' },
      })
    } else if (event.type === 'assistant/attempt') {
      order.push(`think:${event.seq}`)
      const reasoning = (d.stream ?? []).filter((r) => r.chunk?.type === 'reasoning').map((r) => r.chunk.text ?? '')
      nodes.set(`think:${event.seq}`, {
        key: `think:${event.seq}`,
        kind: 'assistant-step',
        location: { kind: 'step', turn: { turn: d.turn }, step: { step: d.step } },
        data: { blocks: reasoning.length > 0 ? reasoning.map((text) => ({ kind: 'reasoning', text })) : [], status: 'settled' },
      })
    } else if (event.type === 'tool/call') {
      pendingTools.set(d.callId, event)
    } else if (event.type === 'tool/result') {
      const call = pendingTools.get(d.message?.source?.callId) ?? event
      pendingTools.delete(d.message?.source?.callId)
      order.push(`tool:${event.seq}`)
      nodes.set(`tool:${event.seq}`, {
        key: `tool:${event.seq}`,
        kind: 'tool-call',
        location: { kind: 'step', turn: { turn: d.turn }, step: { step: d.step } },
        data: { root: { kind: 'tool-result', callId: d.message?.source?.callId ?? call.data?.callId, call: { name: 'bash', argsRaw: call.data?.arguments ?? '{}' }, content: d.message?.content ?? [], isError: false, subCalls: [] } },
      })
    } else if (event.type === 'llm/retry') {
      order.push(`retry:${event.seq}`)
      nodes.set(`retry:${event.seq}`, { key: `retry:${event.seq}`, kind: 'model-retry', location: { kind: 'step', turn: { turn: d.turn }, step: { step: d.step } }, data: {} })
    } else if (event.type === 'turn/end') {
      turnEnds.set(d.turn, event.seq)
    }
  }
  if (options.withTurnEnds !== false && turnEnds.size > 0) {
    return { order, nodes, turnEnds }
  }
  return { order, nodes }
}

function runningBlock(name, callId = `c-${name}`) {
  return { callId, name, argsRaw: '{}', turn: 1, step: 1 }
}
function settledBlock(name, callId = `c-${name}`) {
  return { kind: 'tool-result', callId, call: { name, argsRaw: '{}' }, content: [], isError: false, subCalls: [] }
}
const think = (text) => ({ kind: 'reasoning', text })
const textBlock = (text) => ({ kind: 'text', text })

// ---------------------------------------------------------------------------
// Test 1 — the CURRENT Session has NO `.events`; the fold pipeline runs on
// the new API and never touches the removed surface.
// ---------------------------------------------------------------------------
{
  const s = Session.create(SessionId('session-api-test-1'))
  assert.equal(s.events, undefined, 'the removed session.events property is absent on the current Session')

  s.append('turn/start', { turn: 1 })
  s.append('assistant/attempt', {
    turn: 1,
    step: 1,
    stream: [{ type: 'chunk', time: Date.now(), chunk: { type: 'reasoning', text: '思考中' } }],
  })
  s.append('tool/call', { turn: 1, step: 1, callId: 'c-read', name: 'read', arguments: '{"file_path":"/x"}' })
  s.append('tool/result', {
    turn: 1,
    step: 1,
    message: { source: { kind: 'tool', callId: 'c-read' }, content: [{ type: 'tool-result', toolCallId: 'c-read', content: [{ type: 'text', text: 'ok' }] }], role: 'user', id: 'm-1' },
  }, { surfaceOp: 'append' })
  s.append('tool/call', { turn: 1, step: 1, callId: 'c-grep', name: 'grep', arguments: '{}' })
  s.append('tool/result', {
    turn: 1,
    step: 1,
    message: { source: { kind: 'tool', callId: 'c-grep' }, content: [{ type: 'tool-result', toolCallId: 'c-grep', content: [{ type: 'text', text: 'ok' }] }], role: 'user', id: 'm-2' },
  }, { surfaceOp: 'append' })
  s.append('assistant/message', {
    turn: 1,
    step: 2,
    message: { role: 'assistant', content: [{ type: 'text', text: '结果' }] },
    stream: [{ type: 'chunk', time: Date.now(), chunk: { type: 'text', text: '结果' } }],
  }, { surfaceOp: 'append' })
  s.append('turn/end', { turn: 1, reason: { kind: 'completed' } })

  // New-API reads only — the exact pattern the migration prescribes.
  const events = s.snapshotEvents()
  assert.equal(events.findLast((e) => e.type === 'turn/end')?.data.reason.kind, 'completed', 'snapshotEvents() replaces session.events for scans')
  assert.equal(events.length, s.seq, 'seq is the log length (contiguity contract)')
  assert.equal(s.eventAt(0)?.type, 'turn/start', 'eventAt(seq) replaces session.events[seq]')

  // Fold computation over a chat face derived from the NEW API -> correct
  // small fold, no findLast/undefined crash anywhere.
  const face = chatFaceFromSession(s)
  const toolKey = [...face.order].find((k) => k.startsWith('tool:'))
  const thinkKey = [...face.order].find((k) => k.startsWith('think:'))
  const group = groupOf(face, toolKey)
  assert.ok(group !== null, 'tool run folds')
  // think + read + grep = 3 folded blocks; the text summary is a boundary.
  assert.equal(group.count, 3, 'think + 2 tools fold into one group')
  assert.ok(isGroupLeader(group, toolKey), 'first tool leads the group')
  assert.equal(group.itemKeys.length, 3)
  assert.ok(isTransparentAssistant(face.nodes.get(thinkKey)), 'assistant/attempt think node is transparent')
  // The summary assistant node is NOT part of the group.
  const summaryKey = [...face.order].find((k) => k.startsWith('assistant:'))
  const groupAtSummary = groupOf(face, summaryKey)
  assert.equal(groupAtSummary, null, 'text assistant forms no group')
}

// ---------------------------------------------------------------------------
// Test 2 — a normal turn through the new API: turn/start → user/message →
// assistant events → turn/end, then a second turn. Folds respect the turn
// boundary.
// ---------------------------------------------------------------------------
{
  const s = Session.create(SessionId('session-api-test-2'))
  s.append('turn/start', { turn: 1 })
  s.append('user/message', {
    content: [{ type: 'text', text: '你好' }],
    source: { kind: 'user', rpcId: 'rpc-1', clientTimeZone: 'Asia/Shanghai' },
    role: 'user',
  }, { surfaceOp: 'append' })
  s.append('tool/call', { turn: 1, step: 1, callId: 'c-bash', name: 'bash', arguments: '{"command":"echo hi"}' })
  s.append('tool/result', {
    turn: 1,
    step: 1,
    message: { source: { kind: 'tool', callId: 'c-bash' }, content: [{ type: 'tool-result', toolCallId: 'c-bash', content: [{ type: 'text', text: 'hi' }] }], role: 'user', id: 'm-3' },
  }, { surfaceOp: 'append' })
  s.append('assistant/message', {
    turn: 1,
    step: 2,
    message: { role: 'assistant', content: [{ type: 'text', text: '完成' }] },
    stream: [{ type: 'chunk', time: Date.now(), chunk: { type: 'text', text: '完成' } }],
  }, { surfaceOp: 'append' })
  s.append('turn/end', { turn: 1, reason: { kind: 'completed' } })
  s.append('turn/start', { turn: 2 })
  s.append('assistant/message', {
    turn: 2,
    step: 1,
    message: { role: 'assistant', content: [{ type: 'text', text: '第二轮的回复' }] },
    stream: [{ type: 'chunk', time: Date.now(), chunk: { type: 'text', text: '第二轮的回复' } }],
  }, { surfaceOp: 'append' })
  s.append('turn/end', { turn: 2, reason: { kind: 'completed' } })

  const events = s.snapshotEvents()
  assert.equal(events.length, s.seq)
  assert.equal(events[1].type, 'user/message', 'user message after turn/start')
  assert.equal(events.findLast((e) => e.type === 'turn/end')?.data.turn, 2, 'two completed turns')

  const face = chatFaceFromSession(s)
  const toolKey = [...face.order].find((k) => k.startsWith('tool:'))
  const g = groupOf(face, toolKey)
  assert.ok(g !== null && g.count === 1, 'single tool folds alone')
  // Turn 2 assistant text belongs to no group and the chat face carries the
  // completed-turn map for both turns.
  assert.deepEqual([...face.turnEnds.keys()], [1, 2], 'turnEnds map from the new API events (turn/end seqs)')

  // snapshot-face adapter (the production normalization path) accepts a chat
  // target built from the new API events.
  const chatTarget = { order: face.order, nodes: face.nodes, legacy: { turnEnds: face.turnEnds } }
  const normalized = chatFaceOf(chatTarget)
  assert.equal(normalized.order, face.order)
  assert.ok(normalized.turnEnds.has(2), 'legacy.turnEnds normalized by chatFaceOf')
  assert.ok(chatFaceEq(normalized, normalized), 'reference-stable equality')
}

// ---------------------------------------------------------------------------
// Test 3 — empty session: no history -> no fold, no crash.
// ---------------------------------------------------------------------------
{
  const s = Session.create(SessionId('session-api-test-3'))
  assert.deepEqual(s.snapshotEvents(), [], 'fresh session has no events')
  assert.equal(s.seq, 0)
  const face = chatFaceFromSession(s)
  assert.equal(face.order.length, 0)
  assert.equal(chatFaceOf(undefined).order.length, 0, 'chat adapter is empty-safe')
  assert.equal(groupOf({ order: [], nodes: { get: () => undefined } }, 'anything'), null, 'empty face folds nothing')
  // A session with only turn/start (still open) also folds nothing.
  const open = Session.create(SessionId('session-api-test-3b'))
  open.append('turn/start', { turn: 1 })
  const openFace = chatFaceFromSession(open)
  assert.equal(openFace.order.length, 0, 'no surface nodes yet -> nothing to fold')
}

// ---------------------------------------------------------------------------
// Test 4 — retry semantics on the new API.
// ---------------------------------------------------------------------------
{
  const s = Session.create(SessionId('session-api-test-4'))

  // The retry-scan pattern the migration prescribes for host executors:
  //   const events = agent.session.snapshotEvents()
  //   const prior = events.findLast(predicate)
  const scan = (turn, step, provider, policyKey) =>
    s.snapshotEvents().findLast(
      (e) => e.type === 'llm/retry' && e.data.turn === turn && e.data.step === step && e.data.provider === provider && e.data.policyKey === policyKey,
    )

  // (a) No retry history yet.
  assert.equal(scan(1, 1, 'p', 'k1'), undefined, 'no retries -> no prior')

  // (b) One retry.
  s.append('turn/start', { turn: 1 })
  s.append('llm/retry', { retryId: 'r-1', turn: 1, step: 1, provider: 'p', mode: 'normal', policyKey: 'k1', retry: 1, maxRetries: 9, delayMs: 0, failure: { code: 'QUOTA', message: 'quota' } })
  assert.equal(scan(1, 1, 'p', 'k1')?.data.retry, 1, 'prior retry = 1')

  // (c) Several retries — the scan returns the NEWEST.
  s.append('llm/retry-started', { retryId: 'r-1', turn: 1, step: 1, retry: 1 })
  s.append('llm/retry', { retryId: 'r-1', turn: 1, step: 1, provider: 'p', mode: 'normal', policyKey: 'k1', retry: 2, maxRetries: 9, delayMs: 1000, failure: { code: 'QUOTA', message: 'quota' } })
  s.append('llm/retry', { retryId: 'r-1', turn: 1, step: 1, provider: 'p', mode: 'normal', policyKey: 'k1', retry: 3, maxRetries: 9, delayMs: 5000, failure: { code: 'QUOTA', message: 'quota' } })
  const prior = scan(1, 1, 'p', 'k1')
  assert.equal(prior.data.retry, 3, 'findLast over snapshotEvents() returns the newest retry')

  // (d) After retries, a new turn: an executor keyed by (turn, step, ...)
  // starts fresh for the new turn, and the old retries stay findable.
  s.append('turn/end', { turn: 1, reason: { kind: 'completed' } })
  s.append('turn/start', { turn: 2 })
  assert.equal(scan(2, 1, 'p', 'k1'), undefined, 'new turn has no retry history yet')
  assert.equal(scan(1, 1, 'p', 'k1')?.data.retry, 3, 'old turn retries remain in the log')

  // (e) Fold-side guarantee: model-retry nodes NEVER fold — they separate
  // tool runs into their own groups and the retry seat renders unfolded.
  const face = chatFaceFromSession(s)
  const retryKeys = [...face.order].filter((k) => k.startsWith('retry:'))
  assert.ok(retryKeys.length >= 3, 'retry notices materialize in the face')
  for (const key of retryKeys) {
    assert.equal(groupOf(face, key), null, 'the retry seat itself never forms a fold group')
  }
}

// ---------------------------------------------------------------------------
// Test 5 — array-index vs seq semantics: never assume a hand-built index
// equals a seq; always read positions through eventAt / half-open ranges.
// ---------------------------------------------------------------------------
{
  const s = Session.create(SessionId('session-api-test-5'))
  s.append('turn/start', { turn: 1 })
  s.append('user/message', {
    content: [{ type: 'text', text: 'x' }],
    source: { kind: 'user', rpcId: 'rpc-9', clientTimeZone: 'Asia/Shanghai' },
    role: 'user',
  }, { surfaceOp: 'append' })
  s.append('turn/end', { turn: 1, reason: { kind: 'completed' } })
  // The seq grid is contiguous (seq === index) by contract on the CURRENT
  // Session — but consumers must still read through the API, not by assuming
  // a raw array they partially own stays aligned.
  assert.equal(s.eventAt(2)?.type, 'turn/end')
  assert.equal(s.snapshotEvents(0, 2).length, 2, 'half-open [0, 2) excludes seq 2')
  assert.equal(s.snapshotEvents(1, 2)[0]?.type, 'user/message')
  assert.equal(s.seq, 3, 'seq = next append position = log length')
}

console.log('session-api.test: all assertions passed')