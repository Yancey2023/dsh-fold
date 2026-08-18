/**
 * Running-tool collapsed row model — a faithful replica of the product's
 * `toolRowModel` (dsh-client-ui-tool), so the folded bar can display the
 * actual block the way the product's own collapsed row would: [icon] Title ·
 * Summary. Pure snapshot reads, no DOM.
 *
 * Verified against the product bundle: VARIANT_TITLES / TOOL_VARIANTS /
 * TOOL_TITLES / SUMMARY_KEYS / pickString / deriveSummary / relativizeToCwd
 * / toolRowModel are reproduced here verbatim (figma literals, not
 * translatable copy); while a call runs, a `terminal` callView's
 * `description` (the agent-authored command description) overrides the
 * args-derived summary — the exact precedence the product's BashRow uses
 * (`terminal?.description ?? model.summary`).
 */

import type { ToolBlockLike } from './group'

/** Figma row titles per variant (design literals, not translatable copy). */
const VARIANT_TITLES: Record<string, string> = {
  search: 'Search',
  read: 'Read',
  bash: 'Bash',
  write: 'Write',
  edit: 'Edit',
  code: 'Code',
  others: 'Tool call',
}

/** Known tool name -> variant (the product's table, verbatim). */
const TOOL_VARIANTS: Record<string, string> = {
  bash: 'bash',
  pwsh: 'bash',
  read: 'read',
  web_fetch: 'read',
  web_search: 'search',
  grep: 'search',
  glob: 'search',
  write: 'write',
  edit: 'edit',
  run_code: 'code',
  cordis_package_inspect: 'read',
  cordis_runtime_inspect: 'read',
  cordis_run: 'others',
  cordis_stop: 'others',
  cordis_undefine: 'others',
}

/** Tool-owned titles that refine a generic row variant without replacing it. */
const TOOL_TITLES: Record<string, string> = {
  cordis_package_inspect: 'Inspect',
  cordis_runtime_inspect: 'Inspect',
  cordis_run: 'Run Cordis Plugin',
  cordis_stop: 'Stop Cordis Plugin',
  cordis_undefine: 'Remove Cordis Plugin',
  pwsh: 'Pwsh',
}

/** Summary key preference per variant (args-derived). */
const SUMMARY_KEYS: Record<string, string[]> = {
  bash: ['description', 'command'],
  read: ['path', 'file_path', 'url'],
  search: ['query', 'pattern', 'url'],
  write: ['path', 'file_path'],
  edit: ['path', 'file_path'],
  code: ['code'],
  others: [],
}

function classifyTool(toolName: string): string {
  return TOOL_VARIANTS[toolName] ?? 'others'
}

function parseArgs(argsRaw: string): unknown {
  try {
    return JSON.parse(argsRaw)
  } catch {
    return undefined
  }
}

function pickString(args: Record<string, unknown>, keys: readonly string[]): string | undefined {
  for (const key of keys) {
    const value = args[key]
    if (typeof value === 'string' && value !== '') return value
  }
  return undefined
}

function firstLine(text: string): string {
  const nl = text.indexOf('\n')
  return nl === -1 ? text : text.slice(0, nl)
}

function relativizeToCwd(text: string, cwd: string | undefined): string {
  if (cwd === undefined || cwd === '') return text
  const root = cwd.replace(/[/\\]+$/, '')
  if (text.startsWith(`${root}/`) || text.startsWith(`${root}\\`)) return text.slice(root.length + 1)
  return text
}

function deriveSummary(variant: string, argsRaw: string): string {
  const parsed = parseArgs(argsRaw)
  if (typeof parsed !== 'object' || parsed === null) return firstLine(argsRaw)
  const args = parsed as Record<string, unknown>
  const picked = pickString(args, SUMMARY_KEYS[variant] ?? [])
  if (picked !== undefined) return firstLine(picked)
  for (const value of Object.values(args)) {
    if (typeof value === 'string' && value !== '') return firstLine(value)
  }
  return firstLine(argsRaw)
}

export interface ToolRowModel {
  readonly title: string
  readonly summary: string
  readonly variant: string
}

/**
 * The collapsed row the product would render for a RUNNING tool call:
 * `[icon] Title · Summary`. Only the running lifecycle form is meaningful
 * here (the folded bar shows live content while a call works); the model
 * still accepts the settled form defensively.
 */
export function runningToolRow(toolName: string, block: ToolBlockLike, cwd?: string): ToolRowModel {
  const variant = classifyTool(toolName)
  const argsRaw = 'kind' in block ? block.call?.argsRaw ?? '' : block.argsRaw ?? ''
  const base = argsRaw === '' ? block.callId : relativizeToCwd(deriveSummary(variant, argsRaw), cwd)
  const toolTitle = TOOL_TITLES[toolName]
  let summary = variant === 'others' && toolName !== '' && toolTitle === undefined ? `${toolName} · ${base}` : base
  if (!('kind' in block)) {
    // A running terminal call's row shows the agent-authored command
    // description (the product's BashRow precedence).
    const callView = block.callView
    if (callView?.card === 'terminal' && typeof callView.description === 'string' && callView.description !== '') {
      summary = callView.description
    }
  }
  return { title: toolTitle ?? VARIANT_TITLES[variant] ?? 'Tool call', summary, variant }
}
