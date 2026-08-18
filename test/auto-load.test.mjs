/**
 * Unit tests for the scroll-to-top auto-loader (attachAutoLoad):
 *
 *   scroll host resolution via the product's [data-conversation-scroll]
 *   contract; one shared pump per host (refcounted seats); a continuous
 *   setInterval checks scrollTop and fires the pump while the user rests
 *   at the top and hasMore is true.
 */
import assert from 'node:assert/strict'
import { attachAutoLoad, setSessionsService } from '../lib/client-auto-load.mjs'

function makeHost(scrollTop = 0) {
  const listeners = new Set()
  return {
    scrollTop,
    addEventListener(type, fn) { assert.equal(type, 'scroll'); listeners.add(fn) },
    removeEventListener(type, fn) { assert.equal(type, 'scroll'); listeners.delete(fn) },
    fire() { for (const fn of [...listeners]) fn() },
    listenerCount() { return listeners.size },
  }
}
function seat(host) { return { closest(sel) { assert.equal(sel, '[data-conversation-scroll]'); return host } } }
function tick() { return new Promise(r => setTimeout(r, 0)) }
function sleep(ms) { return new Promise(r => setTimeout(r, ms)) }

const loadCalls = []
const fakeSessions = { scope(id) { return { get(n) { return n === 'conversation' ? { loadOlder: async () => { loadCalls.push(id) } } : undefined } } } }
setSessionsService(fakeSessions)
function resetCalls() { loadCalls.length = 0 }

// At top -> pump fires.  After the load, re-attach with hasMore=false.
// The continuous interval fires later but sees hasMore=false -> no pump.
{
  resetCalls()
  const host = makeHost(0)
  attachAutoLoad(seat(host), 's1', true, false)
  host.fire()
  await tick()
  attachAutoLoad(seat(host), 's1', false, false)
  await sleep(150) // let the interval fire (100ms) — it sees hasMore=false
  assert.equal(loadCalls.length, 1, 'one page, then hasMore=false stops')
}

// Re-attach with hasMore=true lets the interval fire the next pump.
{
  resetCalls()
  const host = makeHost(0)
  attachAutoLoad(seat(host), 's2', true, false)
  host.fire()
  await tick() // load1
  attachAutoLoad(seat(host), 's2', true, false) // still more history
  await sleep(150) // interval fires: pump 2
  attachAutoLoad(seat(host), 's2', false, false) // stop
  await sleep(150) // interval fires: sees hasMore=false
  assert.equal(loadCalls.length, 2, 'continued via interval, then stopped')
}

// Multiple continuations via interval.
{
  resetCalls()
  const host = makeHost(0)
  attachAutoLoad(seat(host), 's3', true, false)
  host.fire()
  await tick()
  attachAutoLoad(seat(host), 's3', true, false)
  await sleep(150) // interval: pump 2
  attachAutoLoad(seat(host), 's3', true, false)
  await sleep(100) // interval: pump 3 (fires at 200ms from entry creation)
  attachAutoLoad(seat(host), 's3', false, false) // stop BEFORE the 300ms interval
  await sleep(150) // interval: sees hasMore=false
  assert.equal(loadCalls.length, 3, 'three pages via interval chain')
}

// Scroll away during the load -> no continuation.
{
  resetCalls()
  let resolveLoad; let slowCalls = 0
  const slowSessions = { scope() { return { get() { return { loadOlder: () => { slowCalls += 1; return new Promise(r => { resolveLoad = r }) } } } } } }
  setSessionsService(slowSessions)
  const host = makeHost(0)
  attachAutoLoad(seat(host), 's4', true, false)
  host.fire()
  host.scrollTop = 200; resolveLoad()
  await tick()
  attachAutoLoad(seat(host), 's4', true, false)
  await sleep(150) // interval: scrollTop > 4 -> no pump
  assert.equal(slowCalls, 1, 'no continuation after scrolling away')
  setSessionsService(fakeSessions)
}

// Guards: not at top / no history / already loading.
{
  resetCalls()
  const host = makeHost(150); attachAutoLoad(seat(host), 's5', true, false); host.fire(); await sleep(150); assert.equal(loadCalls.length, 0, 'not at top')
  const host2 = makeHost(0); attachAutoLoad(seat(host2), 's6', false, false); host2.fire(); await sleep(150); assert.equal(loadCalls.length, 0, 'hasMore false')
  const host3 = makeHost(0); attachAutoLoad(seat(host3), 's7', true, true); host3.fire(); await sleep(150); assert.equal(loadCalls.length, 0, 'loadingOlder true')
}

// Dedupe: seats share one listener; release stops.
{
  resetCalls()
  const host = makeHost(0)
  const a = attachAutoLoad(seat(host), 's8', true, false)
  const b = attachAutoLoad(seat(host), 's8', true, false)
  assert.equal(host.listenerCount(), 1, 'one listener')
  host.fire(); await tick()
  a(); assert.equal(host.listenerCount(), 1)
  b(); assert.equal(host.listenerCount(), 0)
  // Release clears the interval; no more loads.
  await sleep(150)
  assert.equal(loadCalls.length, 1, 'release stops the interval')
}

// No scroll host -> no-op.
{
  const d = attachAutoLoad({ closest() { return null } }, 's9', true, false); d()
  const d2 = attachAutoLoad(null, 's10', true, false); d2()
}

// Session scope reaches loadOlder.
{
  resetCalls()
  const host = makeHost(0)
  attachAutoLoad(seat(host), 'x', true, false)
  host.fire(); await tick()
  attachAutoLoad(seat(host), 'x', false, false); await sleep(150)
  assert.equal(loadCalls.length, 1); assert.deepEqual(loadCalls, ['x'])
}

console.log('auto-load.test: all assertions passed')
