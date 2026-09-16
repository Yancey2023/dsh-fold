/**
 * Unit tests for the snapshot-face adapter — the seal between the fold
 * computations and the chat-node seat kit shared by the supported channels
 * (npm `alpha` → 0.1.6-alpha.1, `latest` → 0.1.5-rc.1, `next` → 0.1.5-rc.2):
 *
 *  - `useChat` returns the Chat target directly
 *    (`{order, nodes, legacy: {turnEnds}}`);
 *  - `useSession` carries only the session window flags.
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
// chatFaceOf: chat target with legacy.turnEnds (the shape `useChat` returns
// on every supported channel).
// ---------------------------------------------------------------------------
{
  const chat = { order: ['a', 'b'], nodes: mapOf({ a: { key: 'a' } }), legacy: { turnEnds: new Map([[1, 7]]) } }
  const face = chatFaceOf(chat)
  assert.equal(face.order, chat.order, 'order passes through')
  assert.equal(face.nodes, chat.nodes, 'nodes passes through')
  assert.ok(face.turnEnds && face.turnEnds.has(1), 'legacy.turnEnds is the closure map')
}

// ---------------------------------------------------------------------------
// chatFaceOf: bare {order, nodes} (no closure map), and garbage.
// ---------------------------------------------------------------------------
{
  const bare = { order: ['a'], nodes: mapOf({}) }
  assert.deepEqual(chatFaceOf(bare).turnEnds, undefined, 'bare chat has no closure map')
  assert.equal(chatFaceOf(undefined).order.length, 0, 'garbage yields the empty face')
  assert.equal(chatFaceOf({ chat: undefined }).order.length, 0, 'non-chat snapshot yields the empty face')
  assert.equal(chatFaceOf({ order: 'x' }).order.length, 0, 'malformed order yields the empty face')
}

// ---------------------------------------------------------------------------
// chatFaceOf: the closure map comes ONLY from legacy.turnEnds (both channels
// define it on the Chat target; top-level turnEnds is not part of the
// contract and must not be picked up).
// ---------------------------------------------------------------------------
{
  const chat = { order: ['a'], nodes: mapOf({}), legacy: { turnEnds: new Map([[2, 2]]) }, turnEnds: new Map([[1, 1]]) }
  const face = chatFaceOf(chat)
  assert.ok(face.turnEnds && face.turnEnds.has(2), 'legacy.turnEnds is the closure map')
  assert.ok(!face.turnEnds.has(1), 'top-level turnEnds is ignored')
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