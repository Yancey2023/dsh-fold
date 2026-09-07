#!/usr/bin/env node
/**
 * Release gate: verify the ACTUAL npm artifact (the `pnpm pack` tarball), not
 * just the working tree.
 *
 *   1. `pnpm pack` into a temp dir.
 *   2. Extract the tarball's lib/ into memory (tar listing + content scan).
 *   3. Assert:
 *        - no `node_modules` (in particular no nested `@deepseek-ai/*` DSH
 *          core runtime) inside the tarball;
 *        - the built lib contains zero old-Session-API usages
 *          (`session.events` / `.findLast(`);
 *        - the tarball's package.json declares no runtime `dependencies`
 *          and only the shell-owned client packages as peers.
 *   4. Print the resulting artifact file list for the record.
 *
 * Usage:  node scripts/verify-pack.mjs   (run from the package root)
 */
import { execSync } from 'node:child_process'
import { mkdtempSync, readFileSync, readdirSync, rmSync, statSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import assert from 'node:assert/strict'

const ROOT = resolve(fileURLToPath(new URL('..', import.meta.url)))
const OLD_API_RE = /session\.events|\.findLast\(/

// pnpm pack --pack-destination <dir> writes dsh-fold-<version>.tgz.
const temp = mkdtempSync(join(tmpdir(), 'dsh-fold-pack-'))
try {
  execSync('pnpm pack --pack-destination .', { cwd: ROOT, stdio: 'pipe' })
  // pnpm pack's --pack-destination resolves relative to cwd.
  const tgzs = readdirSync(ROOT).filter((n) => n.endsWith('.tgz'))
  assert.equal(tgzs.length, 1, `exactly one tarball in the repo root after pack (found: ${tgzs.join(', ')})`)
  const tarball = join(ROOT, tgzs[0])

  const listing = execSync(`tar -tzf "${tarball}"`, { encoding: 'utf8' })
    .split('\n')
    .map((line) => line.replace(/^\.\//, ''))
    .filter(Boolean)
  console.log(`packed artifact: ${tgzs[0]} — ${listing.length} entries`)
  for (const entry of listing) console.log(`  ${entry}`)

  // 1. No nested DSH runtime / node_modules in the artifact.
  const nodemodules = listing.filter((e) => e.includes('node_modules') || /@deepseek-ai\//.test(e))
  assert.deepEqual(
    nodemodules,
    [],
    `the published tarball must not carry a nested @deepseek-ai runtime or node_modules (found: ${nodemodules.join(', ')})`,
  )

  // 2. Extract lib/ and scan for the old Session API.
  const extraction = mkdtempSync(join(tmpdir(), 'dsh-fold-extract-'))
  try {
    execSync(`tar -xzf "${tarball}" -C "${extraction}"`, { stdio: 'pipe' })
    const pkgDir = join(extraction, 'package')
    const hits = []
    const walk = (dir) => {
      for (const name of readdirSync(dir)) {
        const full = join(dir, name)
        if (statSync(full).isDirectory()) walk(full)
        else if (/\.(mjs|js|cjs)$/.test(name)) {
          const text = readFileSync(full, 'utf8')
          if (OLD_API_RE.test(text)) hits.push(name)
        }
      }
    }
    walk(join(pkgDir, 'lib'))
    assert.deepEqual(hits, [], `packed lib must contain no session.events / findLast (found in: ${hits.join(', ')})`)

    // 3. Packed package.json: no runtime dependencies; peers only client-ui.
    const manifest = JSON.parse(readFileSync(join(pkgDir, 'package.json'), 'utf8'))
    assert.deepEqual(manifest.dependencies ?? {}, {}, 'packed package.json must declare no dependencies')
    const peers = Object.keys(manifest.peerDependencies ?? {})
    const allowed = new Set([
      '@deepseek-ai/dsh-attachment',
      '@deepseek-ai/dsh-client-ui-attachment',
      '@deepseek-ai/dsh-client-ui-primitives',
      '@deepseek-ai/dsh-client-ui-slots',
      'react',
    ])
    for (const p of peers) assert.ok(allowed.has(p), `packed package.json unexpected peer "${p}"`)
    console.log('verify-pack: OK — clean artifact, no core-runtime copy, no old Session API')
  } finally {
    rmSync(extraction, { recursive: true, force: true })
  }
} finally {
  for (const n of readdirSync(ROOT)) {
    if (n.endsWith('.tgz')) rmSync(join(ROOT, n), { force: true })
  }
  rmSync(temp, { recursive: true, force: true })
}