/**
 * dsh-tool-group build: typecheck + bundle both halves.
 *
 * Client half: esbuild bundles `src/client/index.ts` as CommonJS with the
 * DSH page packages external (they resolve at runtime through the page's
 * module loader), wrapped in the loader-factory shape the web shell expects:
 *
 *   window.__ModuleLoader__.load({ id, factory: function (require) { ...; return module.exports } })
 *
 * Host half: plain ESM bundle (the profile loader imports it directly).
 */
import { build } from 'esbuild'
import { execSync } from 'node:child_process'

const EXTERNALS = ['react', 'react/jsx-runtime', '@deepseek-ai/*']

execSync('npx tsc --noEmit -p tsconfig.json', { stdio: 'inherit' })

await build({
  entryPoints: ['src/host/index.ts'],
  bundle: true,
  format: 'esm',
  platform: 'node',
  target: 'node18',
  outfile: 'lib/index.js',
  logLevel: 'info',
})

const LOADER_PREAMBLE = `window.__ModuleLoader__.load({
  id: 'dsh-tool-group',
  factory: function (require) {
    var module = { exports: {} };
    var exports = module.exports;
    Object.defineProperty(exports, Symbol.toStringTag, { value: 'Module' });
`
const LOADER_POSTAMBLE = `return module.exports;
  }
});
`

await build({
  entryPoints: ['src/client/index.ts'],
  bundle: true,
  format: 'cjs',
  platform: 'browser',
  target: 'es2022',
  outfile: 'lib/client.js',
  external: EXTERNALS,
  banner: { js: LOADER_PREAMBLE },
  footer: { js: LOADER_POSTAMBLE },
  logLevel: 'info',
})

// ESM mirror of the overlay only, for node-based behavioral tests.
await build({
  entryPoints: ['src/client/slots-core-overlay.ts'],
  bundle: true,
  format: 'esm',
  platform: 'node',
  target: 'node18',
  outfile: 'lib/client-overlay.mjs',
  logLevel: 'info',
})

// ESM mirror of the group logic only, for node-based unit tests.
await build({
  entryPoints: ['src/client/group.ts'],
  bundle: true,
  format: 'esm',
  platform: 'node',
  target: 'node18',
  outfile: 'lib/client-group.mjs',
  logLevel: 'info',
})

// ESM mirror of the running-tool row model, for node-based unit tests.
await build({
  entryPoints: ['src/client/tool-row.ts'],
  bundle: true,
  format: 'esm',
  platform: 'node',
  target: 'node18',
  outfile: 'lib/client-tool-row.mjs',
  logLevel: 'info',
})

// ESM mirror of the group view component (icons stubbed), for render tests.
await build({
  entryPoints: ['src/client/ToolCallGroupView.tsx'],
  bundle: true,
  format: 'esm',
  platform: 'node',
  target: 'node18',
  outfile: 'lib/client-component.mjs',
  external: ['react', 'react/jsx-runtime'],
  alias: { '@deepseek-ai/dsh-client-ui-primitives': './test/stubs/primitives.mjs' },
  logLevel: 'info',
})

// ESM mirror of the turn-fold logic, for node-based unit tests.
await build({
  entryPoints: ['src/client/turn-fold.ts'],
  bundle: true,
  format: 'esm',
  platform: 'node',
  target: 'node18',
  outfile: 'lib/client-turn-fold.mjs',
  external: ['react', 'react/jsx-runtime'],
  logLevel: 'info',
})

// ESM mirror of the assistant wrapper (icons stubbed), for render tests.
await build({
  entryPoints: ['src/client/AssistantNodeWrapper.tsx'],
  bundle: true,
  format: 'esm',
  platform: 'node',
  target: 'node18',
  outfile: 'lib/client-assistant.mjs',
  external: ['react', 'react/jsx-runtime'],
  alias: { '@deepseek-ai/dsh-client-ui-primitives': './test/stubs/primitives.mjs' },
  logLevel: 'info',
})

// ESM mirror of the user wrapper (primitives + attachment stubbed), for
// render tests.
await build({
  entryPoints: ['src/client/UserNodeWrapper.tsx'],
  bundle: true,
  format: 'esm',
  platform: 'node',
  target: 'node18',
  outfile: 'lib/client-user.mjs',
  external: ['react', 'react/jsx-runtime'],
  alias: {
    '@deepseek-ai/dsh-client-ui-primitives': './test/stubs/primitives.mjs',
    '@deepseek-ai/dsh-client-ui-attachment': './test/stubs/attachment.mjs',
  },
  logLevel: 'info',
})

// ESM mirror of the notice wrapper (primitives stubbed), for render tests.
await build({
  entryPoints: ['src/client/NoticeNodeWrapper.tsx'],
  bundle: true,
  format: 'esm',
  platform: 'node',
  target: 'node18',
  outfile: 'lib/client-notice.mjs',
  external: ['react', 'react/jsx-runtime'],
  alias: { '@deepseek-ai/dsh-client-ui-primitives': './test/stubs/primitives.mjs' },
  logLevel: 'info',
})

console.log('build ok: lib/index.js, lib/client.js, lib/client-overlay.mjs, lib/client-group.mjs, lib/client-tool-row.mjs, lib/client-component.mjs, lib/client-assistant.mjs, lib/client-user.mjs, lib/client-notice.mjs, lib/client-turn-fold.mjs')
