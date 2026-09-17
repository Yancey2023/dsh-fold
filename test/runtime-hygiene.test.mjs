/**
 * Runtime / dependency-hygiene regression tests — the "no second DSH core
 * runtime" guarantee:
 *
 *  1. The plugin source AND its built artifacts never touch the removed
 *     Session API (`session.events` / `agent.session.events`) — a regression
 *     to that surface would produce the exact
 *     "Cannot read properties of undefined (reading 'findLast')" turn crash.
 *  2. The published package declares NO runtime `dependencies` on the DSH
 *     core (`@deepseek-ai/dsh-session`, `dsh-agent`, `dsh-llm-retry`, …).
 *     Only the shell-owned client-ui packages are peers, so an npm/pnpm
 *     install can never drag a second, version-skewed DSH runtime next to
 *     the host's.
 *  3. The runtime import surface is exactly the declared peer set (scan of
 *     the built client bundle's externals).
 */
import assert from 'node:assert/strict'
import { readFileSync, readdirSync, statSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = resolve(fileURLToPath(new URL('..', import.meta.url)))

// ---------------------------------------------------------------------------
// 1. Static scan: no old Session API anywhere in src or the built lib.
// ---------------------------------------------------------------------------
const OLD_API_RE = /session\.events|\.findLast\(/
const scanned = []
function scanDir(dir, rel = '') {
  for (const name of readdirSync(dir)) {
    if (name === 'node_modules') continue
    const full = join(dir, name)
    const stats = statSync(full)
    if (stats.isDirectory()) {
      scanDir(full, join(rel, name))
    } else if (/\.(ts|tsx|mjs|js)$/.test(name)) {
      scanned.push({ file: join(rel, name), text: readFileSync(full, 'utf8') })
    }
  }
}
scanDir(join(ROOT, 'src'))
scanDir(join(ROOT, 'lib'))

const violations = scanned.filter(({ file, text }) => OLD_API_RE.test(text))
assert.deepEqual(
  violations.map((v) => v.file),
  [],
  `old session.events / .findLast( usage must not exist in src or lib (found in: ${violations.map((v) => v.file).join(', ')})`,
)

// ---------------------------------------------------------------------------
// 2. package.json: no core-runtime dependencies; peers limited to the
//    shell-owned client packages.
// ---------------------------------------------------------------------------
const manifest = JSON.parse(readFileSync(join(ROOT, 'package.json'), 'utf8'))

assert.deepEqual(
  manifest.dependencies ?? {},
  {},
  'dsh-fold must declare NO runtime dependencies (the host owns the runtime)',
)

const CORE_RUNTIME = /^@deepseek-ai\/dsh-(session|agent|llm|tools|goal|subagent|host|scope|storage|command|user-approval|api|message|code|skill|workspace|client-connection)(-|$)/i
const peers = Object.keys(manifest.peerDependencies ?? {})
const forbiddenPeers = peers.filter((name) => CORE_RUNTIME.test(name))
assert.deepEqual(forbiddenPeers, [], 'no core-runtime package may be a peer — the plugin must not bind to host internals')

// The npm channel versions the plugin must accept: the newest `alpha`
// (0.1.6-alpha.2), `latest` (0.1.5-rc.2) and `next` (0.1.5-rc.2) dist-tags,
// plus the previous channel heads (0.1.5-alpha.2, 0.1.6-alpha.1) the range
// still admits. Every shell-owned peer range must cover all of them.
const SUPPORTED_CHANNEL_VERSIONS = ['0.1.5-alpha.2', '0.1.5-rc.1', '0.1.5-rc.2', '0.1.6-alpha.1', '0.1.6-alpha.2']

// Minimal prerelease-aware semver comparison (numeric core, then dot-split
// prerelease identifiers: numeric < alphanumeric; a shorter list sorts
// before a longer one with the same prefix; a release sorts after any of
// its prereleases). No semver dependency in the dev tree — this is enough
// to decide the plugin's own `>=lo <hi` peer ranges.
function compareVersions(a, b) {
  const parse = (v) => {
    const [core, ...rest] = v.split('-')
    return { nums: core.split('.').map(Number), pre: rest.length > 0 ? rest.join('-').split('.') : [] }
  }
  const A = parse(a)
  const B = parse(b)
  for (let i = 0; i < 3; i += 1) {
    if ((A.nums[i] ?? 0) !== (B.nums[i] ?? 0)) return (A.nums[i] ?? 0) - (B.nums[i] ?? 0)
  }
  if (A.pre.length === 0 && B.pre.length === 0) return 0
  if (A.pre.length === 0) return 1
  if (B.pre.length === 0) return -1
  for (let i = 0; i < Math.max(A.pre.length, B.pre.length); i += 1) {
    const pa = A.pre[i]
    const pb = B.pre[i]
    if (pa === undefined) return -1
    if (pb === undefined) return 1
    if (pa === pb) continue
    const na = Number(pa)
    const nb = Number(pb)
    const aNum = Number.isInteger(na) && String(na) === pa
    const bNum = Number.isInteger(nb) && String(nb) === pb
    if (aNum && bNum) return na - nb
    if (aNum) return -1
    if (bNum) return 1
    return pa < pb ? -1 : 1
  }
  return 0
}

/**
 * Whether `version` satisfies the plugin's peer range shape: one or more
 * `>=lo <hi` legs joined by `||` (a channel spanning two release lines needs
 * the disjunction — npm semver excludes a prerelease from a range whose legs
 * only carry a different major.minor.patch tuple).
 */
function peerRangeSatisfies(version, range) {
  return range.split('||').some((leg) => {
    const m = /^\s*>=([^\s]+) <([^\s]+)\s*$/.exec(leg)
    if (m === null) throw new Error(`peer range "${range}" must use the plugin's ">=lo <hi" (optionally "||"-joined) shape`)
    return compareVersions(version, m[1]) >= 0 && compareVersions(version, m[2]) < 0
  })
}

const ALLOWED_PEERS = new Set([
  '@deepseek-ai/dsh-attachment',
  '@deepseek-ai/dsh-client-ui-attachment',
  '@deepseek-ai/dsh-client-ui-primitives',
  '@deepseek-ai/dsh-client-ui-slots',
  'react',
])
for (const name of peers) {
  assert.ok(ALLOWED_PEERS.has(name), `unexpected peer "${name}" — only the shell-owned client packages may be peers`)
  if (name.startsWith('@deepseek-ai/')) {
    const range = manifest.peerDependencies[name]
    for (const version of SUPPORTED_CHANNEL_VERSIONS) {
      assert.ok(peerRangeSatisfies(version, range), `peer ${name} range ${range} must cover npm channel version ${version} (alpha / latest / next)`)
    }
  }
}

// The dev-only Session dependency (used by test/session-api.test.mjs) must be
// a devDependency, never a shipped dependency.
const dev = manifest.devDependencies ?? {}
assert.ok(
  dev['@deepseek-ai/dsh-session'] !== undefined,
  '@deepseek-ai/dsh-session must be a devDependency for the new-API regression tests (never shipped)',
)

// ---------------------------------------------------------------------------
// 3. The built client bundle's runtime imports are exactly the declared
//    external set (nothing from the DSH core).
// ---------------------------------------------------------------------------
const clientSource = readFileSync(join(ROOT, 'lib', 'client.js'), 'utf8')
const importRe = /(?:require|import)\s*\(\s*["']([^"']+)["']\s*\)/g
const imported = new Set()
for (let m = importRe.exec(clientSource); m !== null; m = importRe.exec(clientSource)) imported.add(m[1])
// The loader preamble itself only references window; the runtime imports
// should be exactly the externals (react + @deepseek-ai/dsh-client-ui-slots
// + primitives + attachment).
const unexpected = [...imported].filter((spec) => !(spec === 'react' || spec === 'react/jsx-runtime' || /^@deepseek-ai\/dsh-client-ui-/.test(spec) || spec === '@deepseek-ai/dsh-attachment'))
assert.deepEqual(unexpected, [], `client bundle must import only the declared peers (got: ${unexpected.join(', ')})`)

// ---------------------------------------------------------------------------
// 4. Resolution identity report (informational): which physical file the
//    plugin's dev tree resolves @deepseek-ai/dsh-session to.
// ---------------------------------------------------------------------------
let sessionResolution = '(not resolvable from the plugin tree)'
try {
  sessionResolution = import.meta.resolve('@deepseek-ai/dsh-session')
} catch {
  /* dev tree without node_modules — informational only */
}
console.log(`runtime-hygiene: dev-tree @deepseek-ai/dsh-session resolves to ${sessionResolution}`)
console.log('runtime-hygiene: no old session.events / findLast anywhere; zero core-runtime dependencies')

console.log('runtime-hygiene.test: all assertions passed')