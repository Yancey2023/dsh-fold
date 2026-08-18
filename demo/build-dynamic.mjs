/**
 * Assembles the dynamic Cordis client-half body for the live demo.
 *
 * The dynamic sandbox has no `require` (teaching trap), so the compiled
 * bundle's external `require("...")` calls are redirected to a local shim
 * that resolves the page modules through `globalThis.__DSH_MODULES__` (the
 * shell's module system; ui-slots and primitives are shell-own statics) and
 * the `React` closure symbol. The bundle is otherwise byte-identical to the
 * standalone `lib/client.js`.
 */
import { readFileSync, writeFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const root = dirname(dirname(fileURLToPath(import.meta.url)))
const bundle = readFileSync(join(root, 'lib/client.js'), 'utf8')

// The loader-factory wrapper is stripped; the esbuild BODY is reused (from
// the "use strict" directive to the final `return module.exports;`).
const strictMarker = '"use strict";'
const bodyStart = bundle.indexOf(strictMarker)
const end = bundle.lastIndexOf('return module.exports;')
if (bodyStart < 0 || end < 0) throw new Error('unexpected bundle shape')
let body = bundle.slice(bodyStart, end).trim()

// Redirect external requires to the local shim.
body = body.replace(/require\("([^"]+)"\)/g, '__dynRequire("$1")')

const wrapped = `const __dynRequire = (spec) => {
  if (spec === 'react' || spec === 'react/jsx-runtime') return React
  if (spec === '@deepseek-ai/dsh-client-ui-slots') return slotsMod
  if (spec === '@deepseek-ai/dsh-client-ui-primitives') return primMod
  throw new Error('dynamic demo: unhandled require ' + spec)
}
const slotsMod = await globalThis.__DSH_MODULES__.import('@deepseek-ai/dsh-client-ui-slots')
const primMod = await globalThis.__DSH_MODULES__.import('@deepseek-ai/dsh-client-ui-primitives')
var module = { exports: {} }
var exports = module.exports
Object.defineProperty(exports, Symbol.toStringTag, { value: 'Module' })
${body}
return module.exports
`

writeFileSync(join(root, 'demo/dynamic-client-body.js'), wrapped)
console.log('demo body written:', wrapped.length, 'bytes')
