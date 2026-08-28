/**
 * Unit tests for the snapshot-face adapter — the release-agnostic seal
 * between the fold computations and the two DSH seat kits:
 *
 *  - 0.1.2-alpha.1: `useChat` returns the Chat target directly
 *    (`{order, nodes, legacy: {turnEnds}}`); `useSession` carries only the
 *    session window flags.
 *  - 0.1.1-rc.2: no `useChat`; `useSession` carries the session snapshot
 *    with the chat at `.chat` and `turnEnds` at the session level.
 *
 * The React hook itself is exercised through the render tests
 * (component.test.mjs / user.test.mjs); this file covers the pure
 * normalization helpers.
 */
import assert from 'node:assert/strict'
import { chatFaceOf, windowFlagsOf, chatFaceEq } from '../lib/client-snapshot-face.mjs'

function mapOf(nodes) {
  return { get: (k) => nodes[k] }
}

// ---------------------------------------------------------------------------
// chatFaceOf: alpha chat target with legacy.turnEnds.
// ---------------------------------------------------------------------------
{
  const chat = { order: ['a', 'b'], nodes: mapOf({ a: { key: 'a' } }), legacy: { turnEnds: new Map([[1, 7]]) } }
  const face = chatFaceOf(chat)
  assert.equal(face.order, chat.order, 'order passes through')
  assert.equal(face.nodes, chat.nodes, 'nodes passes through')
  assert.ok(face.turnEnds && face.turnEnds.has(1), 'alpha: legacy.turnEnds is the closure map')
}

// ---------------------------------------------------------------------------
// chatFaceOf: rc-era session snapshot (`.chat` member + session-level
// turnEnds).
// ---------------------------------------------------------------------------
{
  const chat = { order: ['a'], nodes: mapOf({ a: { key: 'a' } }) }
  const session = { chat, turnEnds: new Map([[2, 9]]), hasMore: true, loadingOlder: false }
  const face = chatFaceOf(session)
  assert.equal(face.order, chat.order, 'rc: unwraps .chat')
  assert.ok(face.turnEnds && face.turnEnds.has(2), 'rc: falls back to the session-level turnEnds')
}

// ---------------------------------------------------------------------------
// chatFaceOf: chat.turnEnds (defensive), bare {order, nodes}, and garbage.
// ---------------------------------------------------------------------------
{
  const chat = { order: ['a'], nodes: mapOf({}), turnEnds: new Map([[3, 1]]) }
  assert.ok(chatFaceOf(chat).turnEnds && chatFaceOf(chat).turnEnds.has(3), 'chat.turnEnds accepted')
  const bare = { order: ['a'], nodes: mapOf({}) }
  assert.deepEqual(chatFaceOf(bare).turnEnds, undefined, 'bare chat has no closure map')
  assert.equal(chatFaceOf(undefined).order.length, 0, 'garbage yields the empty face')
  assert.equal(chatFaceOf({ chat: undefined }).order.length, 0, 'session without chat yields the empty face')
  assert.equal(chatFaceOf({ chat: { order: ['x'], nodes: mapOf({}) } }).order[0], 'x', 'session.chat wins when present')
}

// ---------------------------------------------------------------------------
// Precedence: legacy.turnEnds > chat.turnEnds > session.turnEnds.
// ---------------------------------------------------------------------------
{
  const session = {
    chat: { order: [], nodes: mapOf({}), turnEnds: new Map([[1, 1]]), legacy: { turnEnds: new Map([[2, 2]]) } },
    turnEnds: new Map([[3, 3]]),
  }
  const face = chatFaceOf(session)
  assert.ok(face.turnEnds && face.turnEnds.has(2), 'legacy.turnEnds wins')
  assert.ok(!face.turnEnds.has(1) && !face.turnEnds.has(3), 'lower-precedence maps excluded')
}

// ---------------------------------------------------------------------------
// windowFlagsOf: session-level flags only.
// ---------------------------------------------------------------------------
{
  assert.deepEqual(windowFlagsOf({ hasMore: true, loadingOlder: true }), { hasMore: true, loadingOlder: true })
  assert.deepEqual(windowFlagsOf({ chat: { hasMore: true } }), { hasMore: false, loadingOlder: false }, 'chat-level flags are not window flags')
  assert.deepEqual(windowFlagsOf(undefined), { hasMore: false, loadingOlder: false })
}

// ---------------------------------------------------------------------------
// chatFaceEq: reference identity of the three members.
// ---------------------------------------------------------------------------
{
  const nodes = mapOf({})
  const order = ['a']
  const maps = [undefined, new Map()]
  for (const turnEnds of maps) {
    const a = { order, nodes, turnEnds }
    const b = { order, nodes, turnEnds }
    assert.ok(chatFaceEq(a, b) && chatFaceEq(a, a), 'same members -> equal')
  }
  assert.ok(!chatFaceEq({ order, nodes, turnEnds: undefined }, { order, nodes, turnEnds: new Map() }), 'map identity differs')
  assert.ok(!chatFaceEq({ order: [], nodes, turnEnds: undefined }, { order: ['a'], nodes, turnEnds: undefined }), 'order identity differs')
}

console.log('snapshot-face.test: all assertions passed')