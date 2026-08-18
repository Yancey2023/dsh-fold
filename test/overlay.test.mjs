/**
 * Behavioral test of the slots-core overlay against the REAL
 * `@deepseek-ai/dsh-client-ui-slots` package (0.1.0-rc.7) — in BOTH its
 * published (unminified) form and a minified bundle mirroring the shipped
 * web frontend (the live page's SlotCore is minified; the overlay must not
 * depend on method text).
 *
 * Simulates the product boot sequence: a parent declares the keyed Chat slot,
 * the product registers its `tool-call` entry with the `tool.call.toolview`
 * child declaration, a per-tool view registers into the child slot. Then the
 * plugin's shadow entry co-declares the child slot, wins the cell by lower
 * priority, delegates, and disposes cleanly — leaving the official entry and
 * the child slot fully intact.
 */
import assert from 'node:assert/strict'
import { buildSync } from 'esbuild'
import { createRequire } from 'node:module'
import { SlotCore as PublishedSlotCore } from '@deepseek-ai/dsh-client-ui-slots'
import { installSlotCoreOverlay } from '../lib/client-overlay.mjs'

const requireFrom = createRequire(import.meta.url)

/** Minified mirror of the shipped web bundle's SlotCore (same class semantics). */
function minifiedSlotCore() {
  const entry = requireFrom.resolve('@deepseek-ai/dsh-client-ui-slots/package.json').replace('/package.json', '/lib/index.js')
  const out = buildSync({
    entryPoints: [entry],
    bundle: true,
    format: 'cjs',
    platform: 'browser',
    minify: true,
    write: false,
  })
  const { writeFileSync } = requireFrom('node:fs')
  const filename = '/tmp/min-slots-core.cjs'
  writeFileSync(filename, out.outputFiles[0].text)
  const mod = requireFrom(filename)
  return mod.SlotCore
}

/** Minimal dispatcher emulating the web-react renderer's cell projection. */
function cellWinner(core, slotKey, entryKey) {
  const rec = core.records.get(slotKey)
  if (!rec?.spec) return undefined
  for (const entry of rec.entries) {
    if (entry.options.key === entryKey) return entry
  }
  return undefined
}

function boot(SlotCore) {
  const core = new SlotCore()
  // 'root' is pre-declared by the core; the shell declares the view ring...
  core.register({ name: 'root', children: { 'conversation.view': { kind: 'list', scope: 'session' } } }, () => null)
  // ...and the chat view entry declares the keyed Chat node slot.
  core.register({ name: 'conversation.view', id: 'chat', children: { 'conversation.chat.node': { kind: 'keyed', scope: 'session' } } }, () => null)
  return core
}

function runSuite(SlotCore, label) {
  const core = boot(SlotCore)
  const officialDispose = core.register(
    {
      name: 'conversation.chat.node',
      key: 'tool-call',
      locale: 'conversation',
      children: { 'tool.call.toolview': { kind: 'keyed', scope: 'session' } },
    },
    () => 'OFFICIAL_TREE',
  )
  core.register({ name: 'tool.call.toolview', key: 'bash' }, () => 'BASH_VIEW')

  assert.equal(cellWinner(core, 'conversation.chat.node', 'tool-call').component(), 'OFFICIAL_TREE')
  assert.equal(core.records.get('tool.call.toolview').entries.length, 1)

  // Baseline: without the overlay, the identical child declaration is rejected.
  assert.throws(
    () =>
      core.register(
        {
          name: 'conversation.chat.node',
          key: 'tool-call',
          priority: -100,
          locale: 'tool-group',
          children: { 'tool.call.toolview': { kind: 'keyed', scope: 'session' } },
        },
        () => 'GROUP_VIEW',
      ),
    /already declared/,
    `${label}: baseline duplicate child declaration must throw without the overlay`,
  )

  // With the overlay: co-declaration works and the shadow wins.
  const pristineRegister = SlotCore.prototype.register
  const pristineRelease = SlotCore.prototype.releaseEntry
  const restore = installSlotCoreOverlay(SlotCore)
  const shadowDispose = core.register(
    {
      name: 'conversation.chat.node',
      key: 'tool-call',
      priority: -100,
      locale: 'tool-group',
      children: { 'tool.call.toolview': { kind: 'keyed', scope: 'session' } },
    },
    () => 'GROUP_VIEW',
  )
  const winner = cellWinner(core, 'conversation.chat.node', 'tool-call')
  assert.equal(winner.component(), 'GROUP_VIEW', `${label}: shadow entry must win the cell`)
  assert.ok(winner.children['tool.call.toolview'], `${label}: shadow keeps render authorization`)
  assert.equal(core.records.get('tool.call.toolview').spec.kind, 'keyed', `${label}: child slot spec stays live`)
  assert.equal(core.records.get('tool.call.toolview').entries.length, 1, `${label}: child occupants untouched`)
  assert.equal(core.records.get('conversation.chat.node').entries.length, 2)

  // Shadow disposal: official entry + child slot fully intact.
  shadowDispose()
  assert.equal(cellWinner(core, 'conversation.chat.node', 'tool-call').component(), 'OFFICIAL_TREE', `${label}: official wins again after shadow disposal`)
  assert.equal(core.records.get('tool.call.toolview').spec.kind, 'keyed', `${label}: child slot still declared`)
  assert.equal(core.records.get('tool.call.toolview').entries.length, 1, `${label}: child occupants survive shadow disposal`)

  // Full teardown: the spec owner (the original declarer) wipes the slot once.
  const officialEntry = core.records.get('conversation.chat.node').entries.find((e) => e.options.key === 'tool-call' && (e.options.priority ?? 0) === 0)
  assert.ok(officialEntry)
  core.releaseEntry(officialEntry)
  assert.equal(core.records.get('tool.call.toolview').spec, undefined, `${label}: child slot torn down with the spec owner`)
  assert.equal(core.records.get('tool.call.toolview').entries.length, 0, `${label}: child occupants wiped with the spec owner`)

  // Overlay restore returns the pristine prototype methods.
  restore()
  assert.equal(SlotCore.prototype.register, pristineRegister, `${label}: register restored`)
  assert.equal(SlotCore.prototype.releaseEntry, pristineRelease, `${label}: releaseEntry restored`)

  // Re-install + restore twice (idempotence of the overlay itself).
  const restore2 = installSlotCoreOverlay(SlotCore)
  restore2()
  assert.equal(SlotCore.prototype.register, pristineRegister, `${label}: second restore restores too`)

  console.log(`overlay.test [${label}]: passed`)
}

runSuite(PublishedSlotCore, 'published (unminified)')
const Minified = minifiedSlotCore()
assert.equal(typeof Minified, 'function', 'minified SlotCore loads')
runSuite(Minified, 'minified (shipped-web shape)')

console.log('overlay.test: all assertions passed')
