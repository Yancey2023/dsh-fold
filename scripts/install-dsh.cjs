#!/usr/bin/env node
/**
 * dsh-tool-group installer for the DSH web profile.
 *
 *   node scripts/install-dsh.cjs            install (pnpm add into the profile + reconcile bundles)
 *   node scripts/install-dsh.cjs uninstall  remove
 *
 * Mirrors the official `dsh plugin --profile web add <package>` flow: pnpm
 * resolves the package into the profile, and the profile boot composes the
 * bundle patch layer from package.json's `dsh.bundle.patch`.
 *
 * Usage with a local checkout:
 *   node scripts/install-dsh.cjs --local /absolute/path/to/dsh-tool-group
 */
import { execSync } from 'node:child_process'
import { existsSync } from 'node:fs'
import { homedir } from 'node:os'
import { join } from 'node:path'

const PROFILE = process.env.DSH_PROFILE ?? 'web'
const PROFILE_DIR = join(homedir(), '.dsh', 'profiles', PROFILE)
const PACKAGE = 'dsh-tool-group'

function run(cmd) {
  console.log('>', cmd)
  execSync(cmd, { stdio: 'inherit', cwd: PROFILE_DIR })
}

const uninstall = process.argv.includes('uninstall')
const localIdx = process.argv.indexOf('--local')
const localPath = localIdx >= 0 ? process.argv[localIdx + 1] : undefined

if (!existsSync(join(PROFILE_DIR, 'package.json'))) {
  console.error(`profile "${PROFILE}" not found at ${PROFILE_DIR} — run the profile once (dsh --profile ${PROFILE}) or fix DSH_PROFILE`)
  process.exit(1)
}

if (uninstall) {
  run(`pnpm remove ${PACKAGE}`)
  console.log(`uninstalled ${PACKAGE} from profile "${PROFILE}". Restart the web app; the official tool UI renders again.`)
} else {
  const spec = localPath ?? PACKAGE
  run(`pnpm add ${spec}`)
  console.log(`installed ${PACKAGE} into profile "${PROFILE}". Restart the web app (dsh --profile ${PROFILE}) to load the bundle.`)
}
