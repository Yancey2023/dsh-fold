/**
 * Unit tests for the running-tool row model (the product's toolRowModel
 * replica used by the folded bar's live content).
 */
import assert from 'node:assert/strict'
import { runningToolRow } from '../lib/client-tool-row.mjs'

function running(name, argsRaw, callView) {
  return { callId: `c-${name}`, name, argsRaw, callView }
}
function settled(name) {
  return { kind: 'tool-result', callId: `c-${name}`, call: { name, argsRaw: '{}' }, content: [], isError: false }
}

// ---------------------------------------------------------------------------
// bash: title "Bash"; a terminal callView description overrides the summary.
// ---------------------------------------------------------------------------
{
  const block = running('bash', JSON.stringify({ command: 'ls -la', workdir: '/w' }), { card: 'terminal', title: 'ls -la', description: '列出目录' })
  const row = runningToolRow('bash', block)
  assert.equal(row.title, 'Bash')
  assert.equal(row.summary, '列出目录', 'terminal callView description wins while running')
  assert.equal(row.variant, 'bash')
}

// ---------------------------------------------------------------------------
// bash without callView: args-derived summary (command first).
// ---------------------------------------------------------------------------
{
  const block = running('bash', JSON.stringify({ command: 'pwd' }))
  const row = runningToolRow('bash', block)
  assert.equal(row.title, 'Bash')
  assert.equal(row.summary, 'pwd')
}

// ---------------------------------------------------------------------------
// read: title "Read", summary is the workspace-relative path.
// ---------------------------------------------------------------------------
{
  const block = running('read', JSON.stringify({ path: '/w/app/src/index.ts' }))
  const row = runningToolRow('read', block, '/w/app')
  assert.equal(row.title, 'Read')
  assert.equal(row.summary, 'src/index.ts', 'workspace-rooted path relativized to cwd')
}

// ---------------------------------------------------------------------------
// search variant: grep/glob/web_search title "Search", summary = query.
// ---------------------------------------------------------------------------
{
  const row = runningToolRow('grep', running('grep', JSON.stringify({ pattern: 'fold' })))
  assert.equal(row.title, 'Search')
  assert.equal(row.summary, 'fold')
}

// ---------------------------------------------------------------------------
// ask_user_question: others variant -> "<toolName> · <question>".
// ---------------------------------------------------------------------------
{
  const block = running('ask_user_question', JSON.stringify({ question: '可以运行吗？', answers: [{ label: '是' }, { label: '否' }] }))
  const row = runningToolRow('ask_user_question', block)
  assert.equal(row.title, 'Tool call')
  assert.equal(row.summary, 'ask_user_question · 可以运行吗？')
}

// ---------------------------------------------------------------------------
// Unknown tool: "Tool call" + "<toolName> · <summary>".
// ---------------------------------------------------------------------------
{
  const row = runningToolRow('web_fetch', running('web_fetch', JSON.stringify({ url: 'https://x.dev' })))
  assert.equal(row.title, 'Read')
  assert.equal(row.summary, 'https://x.dev')
}

// ---------------------------------------------------------------------------
// Tool-owned titles refine the variant title.
// ---------------------------------------------------------------------------
{
  const row = runningToolRow('cordis_run', running('cordis_run', JSON.stringify({ plugin: 'x' })))
  assert.equal(row.title, 'Run Cordis Plugin')
}

// ---------------------------------------------------------------------------
// Empty args: summary falls back to the call id (product behavior).
// ---------------------------------------------------------------------------
{
  const row = runningToolRow('bash', running('bash', ''))
  assert.equal(row.summary, 'c-bash')
}

// ---------------------------------------------------------------------------
// Settled form is tolerated defensively.
// ---------------------------------------------------------------------------
{
  const row = runningToolRow('bash', settled('bash'))
  assert.equal(row.title, 'Bash')
  assert.equal(typeof row.summary, 'string')
}

console.log('tool-row.test: all assertions passed')
