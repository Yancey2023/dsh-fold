/**
 * Unit tests for the scroll-to-top auto-loader (attachAutoLoad):
 *
 *   scroll host resolution via the product's [data-conversation-scroll]
 *   contract; one shared pump per host (refcounted seats); loads while the
 *   user rests at the top CONTINUE (page after page) until hasMore clears or
 *   the user scrolls away — the pump recurses directly after each completed
 *   load; guards (at-top, hasMore, loadingOlder, in-flight); the official
 *   loadOlder action reached through the sessions scope; cleanup stops.
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
  return {
    closest(selector) {
      assert.equal(selector, '[data-conversation-scroll]')
      return host
    },
  }
}

function tick() {
  return new Promise((resolve) => setTimeout(resolve, 0))
}
function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms))
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
// Resting at the top: one page loads, then the pump recurses.  The re-attach
// with hasMore=false stops the chain (the recursion sees hasMore=false).
// ---------------------------------------------------------------------------
{
  resetCalls()
  const host = makeHost(0)
  attachAutoLoad(seat(host), 's1', true, false)
  host.fire()
  await tick() // pump 1 completes; pump recurses (hasMore still true)
  attachAutoLoad(seat(host), 's1', false, false) // re-attach: hasMore=false
  await tick() // the recursive pump 2 completes, checks hasMore -> false, stops
  assert.equal(loadCalls.length, 2, 'one page + recursive continuation, then stopped by hasMore=false')
}

// ---------------------------------------------------------------------------
// While the user keeps resting at the top and hasMore stays true, pages
// CONTINUE loading automatically (the fixed bug), until hasMore clears.
// ---------------------------------------------------------------------------
{
  resetCalls()
  const host = makeHost(0)
  attachAutoLoad(seat(host), 's2', true, false)
  host.fire()
  await tick() // page 1 done; recursion fires page 2
  attachAutoLoad(seat(host), 's2', true, false) // re-attach: still more history
  await tick() // page 2 done; recursion fires page 3
  attachAutoLoad(seat(host), 's2', false, false) // re-attach: no more
  await tick() // page 3 done; checks hasMore -> false, stops
  assert.equal(loadCalls.length, 3, 'continued loading while resting at the top')
}

// ---------------------------------------------------------------------------
// Scroll away before the load settles -> no continuation after it resolves.
// ---------------------------------------------------------------------------
{
  resetCalls()
  let resolveLoad
  let slowCalls = 0
  const slowSessions = {
    scope() {
      return {
        get() {
          return {
            loadOlder: () => {
              slowCalls += 1
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
  attachAutoLoad(seat(host), 's3', true, false)
  host.fire()
  host.scrollTop = 200 // user scrolls away while the load is in flight
  resolveLoad()
  await tick()
  // The pump completes, checks scrollTop > 4 -> no recursion.
  assert.equal(slowCalls, 1, 'no continuation after scrolling away during the load')
  setSessionsService(fakeSessions)
}

// ---------------------------------------------------------------------------
// Guards: not at top / no history / already loading -> no fire.
// ---------------------------------------------------------------------------
{
  resetCalls()
  const host = makeHost(150)
  attachAutoLoad(seat(host), 's4', true, false)
  host.fire()
  await tick()
  assert.equal(loadCalls.length, 0, 'not at top -> no fire')
}

{
  resetCalls()
  const host2 = makeHost(0)
  attachAutoLoad(seat(host2), 's5', false, false)
  host2.fire()
  await tick()
  assert.equal(loadCalls.length, 0, 'hasMore false -> no fire')
}

{
  resetCalls()
  const host3 = makeHost(0)
  attachAutoLoad(seat(host3), 's6', true, true)
  host3.fire()
  await tick()
  assert.equal(loadCalls.length, 0, 'loadingOlder true -> no fire')
}

// ---------------------------------------------------------------------------
// Dedupe: seats of the same conversation share ONE listener; state refreshes.
// ---------------------------------------------------------------------------
{
  resetCalls()
  const host = makeHost(0)
  const a = attachAutoLoad(seat(host), 's7', true, false)
  const b = attachAutoLoad(seat(host), 's7', true, false)
  assert.equal(host.listenerCount(), 1, 'one listener for many seats')
  host.fire()
  await tick()
  a()
  assert.equal(host.listenerCount(), 1, 'listener stays while another owner holds it')
  b()
  assert.equal(host.listenerCount(), 0, 'listener removed with the last owner')
  await tick()
  // The recursive pump from the fire fires but detached is set -> returns.
  // The load count is 1 (the initial pump) + 0 (recursion stopped by detached).
  assert.equal(loadCalls.length, 1, 'release stops the continuation (no extra pages)')
}

// ---------------------------------------------------------------------------
// No scroll host (closest returns null) -> no-op, no crash.
// ---------------------------------------------------------------------------
{
  const detach = attachAutoLoad({ closest() { return null } }, 's8', true, false)
  assert.equal(typeof detach, 'function')
  detach()
  const detach2 = attachAutoLoad(null, 's9', true, false)
  detach2()
}

// ---------------------------------------------------------------------------
// The loadOlder call goes through the session scope's conversation face.
// ---------------------------------------------------------------------------
{
  resetCalls()
  const host = makeHost(0)
  attachAutoLoad(seat(host), 'session-x', true, false)
  host.fire()
  await tick()
  attachAutoLoad(seat(host), 'session-x', false, false)
  await tick()
  assert.equal(loadCalls.length, 2, 'load + recursive continuation')
  assert.deepEqual(loadCalls, ['session-x', 'session-x'], 'sessionId reaches the scope')
}

console.log('auto-load.test: all assertions passed')
