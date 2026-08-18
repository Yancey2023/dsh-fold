/**
 * Unit tests for the scroll-to-top auto-loader (attachAutoLoad):
 *
 *   scroll host resolution via the product's [data-conversation-scroll]
 *   contract; one shared listener per host (refcounted seats); fire once per
 *   scroll-to-top episode; guards (hasMore, loadingOlder, in-flight); the
 *   official loadOlder action reached through the sessions scope; cleanup.
 */
import assert from 'node:assert/strict'
import { attachAutoLoad, setSessionsService } from '../lib/client-auto-load.mjs'

/** Fake scroll host with listener bookkeeping. */
function makeHost(scrollTop = 0) {
  const listeners = new Set()
  return {
    scrollTop,
    addEventListener(type, fn) {
      assert.equal(type, 'scroll')
      listeners.add(fn)
    },
    removeEventListener(type, fn) {
      assert.equal(type, 'scroll')
      listeners.delete(fn)
    },
    fire() {
      for (const fn of [...listeners]) fn()
    },
    listenerCount() {
      return listeners.size
    },
  }
}

/** Fake seat element whose closest() resolves to the host. */
function seat(host) {
  return { closest(selector) {
    assert.equal(selector, '[data-conversation-scroll]')
    return host
  } }
}

// Fake sessions service: scope -> conversation with a counting loadOlder.
const loadCalls = []
const fakeSessions = {
  scope(id) {
    return {
      get(name) {
        if (name !== 'conversation') return undefined
        return { loadOlder: async () => { loadCalls.push(id) } }
      },
    }
  },
}
setSessionsService(fakeSessions)

function resetCalls() {
  loadCalls.length = 0
}

// ---------------------------------------------------------------------------
// At the top + hasMore -> auto-load fires once per episode.
// ---------------------------------------------------------------------------
{
  resetCalls()
  const host = makeHost(0)
  const detach = attachAutoLoad(seat(host), 's1', true, false)
  host.fire()
  host.fire()
  assert.equal(loadCalls.length, 1, 'fires once while resting at the top')
  // Let the first load settle (in-flight guard), then scroll away and back:
  // a new scroll-to-top episode fires again.
  await new Promise((resolve) => setTimeout(resolve, 0))
  host.scrollTop = 200
  host.fire()
  host.scrollTop = 0
  host.fire()
  assert.equal(loadCalls.length, 2, 'fires again after a new scroll-to-top episode')
  detach()
}

// ---------------------------------------------------------------------------
// Guards: not at top / no more history / already loading -> no fire.
// ---------------------------------------------------------------------------
{
  resetCalls()
  const host = makeHost(150)
  const detach = attachAutoLoad(seat(host), 's2', true, false)
  host.fire()
  assert.equal(loadCalls.length, 0, 'not at top -> no fire')
  detach()

  const host2 = makeHost(0)
  const detach2 = attachAutoLoad(seat(host2), 's3', false, false)
  host2.fire()
  assert.equal(loadCalls.length, 0, 'hasMore false -> no fire')
  detach2()

  const host3 = makeHost(0)
  const detach3 = attachAutoLoad(seat(host3), 's4', true, true)
  host3.fire()
  assert.equal(loadCalls.length, 0, 'loadingOlder true -> no fire')
  detach3()
}

// ---------------------------------------------------------------------------
// Dedupe: seats of the same conversation share ONE listener; state refreshes.
// ---------------------------------------------------------------------------
{
  resetCalls()
  const host = makeHost(0)
  const a = attachAutoLoad(seat(host), 's5', true, false)
  const b = attachAutoLoad(seat(host), 's5', true, false)
  assert.equal(host.listenerCount(), 1, 'one listener for many seats')
  host.fire()
  assert.equal(loadCalls.length, 1)
  a()
  assert.equal(host.listenerCount(), 1, 'listener stays while another owner holds it')
  b()
  assert.equal(host.listenerCount(), 0, 'listener removed with the last owner')
}

// ---------------------------------------------------------------------------
// No scroll host (closest returns null) -> no-op, no crash.
// ---------------------------------------------------------------------------
{
  const detach = attachAutoLoad({ closest() { return null } }, 's6', true, false)
  assert.equal(typeof detach, 'function')
  detach()
  const detach2 = attachAutoLoad(null, 's7', true, false)
  detach2()
}

// ---------------------------------------------------------------------------
// The loadOlder call goes through the session scope's conversation face.
// ---------------------------------------------------------------------------
{
  resetCalls()
  const host = makeHost(0)
  const detach = attachAutoLoad(seat(host), 'session-x', true, false)
  host.fire()
  assert.equal(loadCalls.length, 1)
  assert.deepEqual(loadCalls, ['session-x'], 'sessionId reaches the scope')
  detach()
}

// ---------------------------------------------------------------------------
// In-flight guard: a slow loadOlder suppresses a second fire.
// ---------------------------------------------------------------------------
{
  const slowCalls = []
  let resolveLoad
  const slowSessions = {
    scope() {
      return {
        get() {
          return {
            loadOlder: () => {
              slowCalls.push(1)
              return new Promise((resolve) => {
                resolveLoad = resolve
              })
            },
          }
        },
      }
    },
  }
  setSessionsService(slowSessions)
  const host = makeHost(0)
  const detach = attachAutoLoad(seat(host), 's8', true, false)
  host.fire()
  host.scrollTop = 300
  host.fire()
  host.scrollTop = 0
  host.fire()
  assert.equal(slowCalls.length, 1, 'slow load fires exactly once (in-flight suppresses the second episode)')
  resolveLoad()
  await new Promise((resolve) => setTimeout(resolve, 0))
  detach()
  setSessionsService(fakeSessions)
}

console.log('auto-load.test: all assertions passed')
