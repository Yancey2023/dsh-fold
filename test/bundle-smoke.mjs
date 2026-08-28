/**
 * Bundle smoke test: executes lib/client.js inside a simulated page module
 * loader (the exact shape the web shell runs) with the REAL ui-slots module
 * and real react on the require table, then runs apply() against a fake ctx
 * and asserts the registration the page will see.
 */
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { createRequire } from 'node:module'

const requireFrom = createRequire(import.meta.url)
const realSlots = requireFrom('@deepseek-ai/dsh-client-ui-slots')
const realReact = requireFrom('react')

// Simulated page module table (statics + seeds).
const moduleTable = {
  react: realReact,
  'react/jsx-runtime': requireFrom('react/jsx-runtime'),
  '@deepseek-ai/dsh-client-ui-slots': realSlots,
  '@deepseek-ai/dsh-client-ui-primitives': {
    IconChevronRightOutline14: () => null,
    IconChevronDownOutline14: () => null,
    IconChevronUpOutline14: () => null,
    IconCheckOutline16: () => null,
    IconCopyOutline16: () => null,
    IconThinkOutline14: () => null,
    IconApiOutline14: () => null,
    IconQuestionOutline14: () => null,
    DisclosureRow: () => null,
    MessageText: () => null,
    JsonBlock: () => null,
    Tooltip: () => null,
    writeClipboard: () => Promise.resolve(true),
  },
  '@deepseek-ai/dsh-client-ui-attachment': { ImageGallery: () => null },
}

const source = readFileSync(new URL('../lib/client.js', import.meta.url), 'utf8')

let registeredPlugin = null
globalThis.window = {
  __ModuleLoader__: {
    load(entry) {
      assert.equal(entry.id, 'dsh-fold')
      const requireFn = (spec) => {
        if (!(spec in moduleTable)) throw new Error(`smoke: unexpected require("${spec}")`)
        return moduleTable[spec]
      }
      // The loader's materialize uses the factory's RETURN value as exports.
      registeredPlugin = entry.factory(requireFn)
    },
  },
}

// Execute the bundle (registers the factory).
await import(new URL('../lib/client.js', import.meta.url).href + '?smoke=' + Date.now())

assert.ok(registeredPlugin, 'bundle must register via __ModuleLoader__.load')
assert.equal(registeredPlugin.name, 'fold')
assert.deepEqual(registeredPlugin.inject, ['slots', 'locale', 'sessions'])
assert.equal(typeof registeredPlugin.apply, 'function')

// --- apply() against a fake ctx -------------------------------------------
const registrations = []
const localeRegistrations = []
let styleInserted = false
const fakeSlots = {
  register(options, component) {
    registrations.push({ options, component })
    return () => {}
  },
}
const fakeLocale = {
  register(ns, dicts) {
    localeRegistrations.push({ ns, dicts })
    return () => {}
  },
  bind(ns) {
    const dict = localeRegistrations.find((r) => r.ns === ns)?.dicts
    return (key, params) => {
      const template = (dict?.zh ?? {})[key] ?? key
      return params ? template.replace(/\{(\w+)\}/g, (_m, n) => String(params[n] ?? '')) : template
    }
  },
}
const fakeDocument = {
  querySelector() {
    return null
  },
  createElement() {
    return { setAttribute() {}, appendChild() {} }
  },
  head: { appendChild() {} },
}
let slotCorePatched = false
const realRegister = realSlots.SlotCore.prototype.register
const realRelease = realSlots.SlotCore.prototype.releaseEntry

globalThis.document = fakeDocument
registeredPlugin.apply({
  get(name) {
    if (name === 'slots') return fakeSlots
    if (name === 'locale') return fakeLocale
    return undefined
  },
  effect(cb) {
    const disposer = cb()
    if (typeof disposer === 'function') {
      // capture the style-tag disposer to assert cleanup
      styleInserted = true
    }
    return () => {}
  },
})

assert.equal(realSlots.SlotCore.prototype.register !== realRegister, true, 'overlay must replace register on the real SlotCore')
assert.equal(realSlots.SlotCore.prototype.releaseEntry !== realRelease, true, 'overlay must replace releaseEntry on the real SlotCore')

assert.equal(registrations.length, 13, 'thirteen shadows: tool-call + assistant-step + user + steering + 9 notice/diagnostic cells')
const toolEntry = registrations.find((r) => r.options.key === 'tool-call')
const assistantEntry = registrations.find((r) => r.options.key === 'assistant-step')
const userEntry = registrations.find((r) => r.options.key === 'user')
const steeringEntry = registrations.find((r) => r.options.key === 'steering')
assert.ok(toolEntry && assistantEntry && userEntry && steeringEntry, 'tool-call / assistant-step / user / steering registered')
const noticeKeys = ['compaction', 'context', 'manual-compaction', 'command', 'model-retry', 'turn-error', 'turn-max-tokens', 'unknown', 'workflow-run']
for (const key of noticeKeys) {
  assert.ok(registrations.some((r) => r.options.key === key), `${key} shadow registered`)
}

const { options, component } = toolEntry
assert.equal(options.name, 'conversation.chat.node')
assert.equal(options.key, 'tool-call')
assert.equal(options.priority, -100)
assert.deepEqual(options.children, { 'tool.call.toolview': { kind: 'keyed', scope: 'session' } })
assert.equal(options.locale, 'fold')
assert.ok(typeof component === 'function' || (typeof component === 'object' && component !== null), 'registered component is the memoized group view')

const aOptions = assistantEntry.options
assert.equal(aOptions.name, 'conversation.chat.node')
assert.equal(aOptions.key, 'assistant-step')
assert.equal(aOptions.priority, -100)
assert.equal(aOptions.locale, 'conversation')
assert.ok(assistantEntry.component !== undefined, 'assistant wrapper registered')

const uOptions = userEntry.options
assert.equal(uOptions.name, 'conversation.chat.node')
assert.equal(uOptions.key, 'user')
assert.equal(uOptions.priority, -100)
assert.equal(uOptions.locale, 'conversation')
assert.ok(userEntry.component !== undefined, 'user wrapper registered')

const commandEntry = registrations.find((r) => r.options.key === 'command')
assert.deepEqual(commandEntry.options.children, { 'conversation.chat.commandview': { kind: 'keyed', scope: 'session' } }, 'command shadow co-declares the commandview child slot')
const compactionEntry = registrations.find((r) => r.options.key === 'compaction')
assert.equal(compactionEntry.options.children, undefined, 'notice seats without children declare none')
assert.equal(compactionEntry.options.locale, 'conversation')

assert.equal(localeRegistrations.length, 1)
assert.equal(localeRegistrations[0].ns, 'fold')
assert.equal(localeRegistrations[0].dicts.zh.running, '正在运行')
assert.equal(localeRegistrations[0].dicts.en.running, 'Running')
assert.equal(localeRegistrations[0].dicts.zh.expand, '展开')
assert.equal(localeRegistrations[0].dicts.en.expand, 'Expand')

// Overlay restore path (what unload does).
realSlots.SlotCore.prototype.register = realRegister
realSlots.SlotCore.prototype.releaseEntry = realRelease

console.log('bundle-smoke: all assertions passed')
