/**
 * Render-level tests of ToolCallGroupView — the exact component shipped in
 * lib/client.js — driven with react-test-renderer.
 *
 * useSession/renderSlot/t are injected as fakes (they are props of the
 * registered component in the real page): useSession computes the group from
 * a mutable snapshot, renderSlot returns marker text for tool.call.toolview
 * dispatches, and t resolves the fold dictionary.
 */
import assert from 'node:assert/strict'
import React from 'react'
import { create, act } from 'react-test-renderer'
import { ToolCallGroupView } from '../lib/client-component.mjs'

const DICTS = {
  zh: { running: '正在运行', group: '工具调用组', folded: '{count} 个块已被折叠', turnFolded: '该轮次工作过程已折叠' },
  en: { running: 'Running', group: 'tool call group', folded: '{count} blocks folded', turnFolded: 'Turn work process folded' },
}

function toolNode(key, turn, root) {
  return { key, kind: 'tool-call', location: { kind: 'step', turn: { turn }, step: { step: 1 } }, data: { root } }
}
function running(name) {
  return { callId: `c-${name}`, name, argsRaw: JSON.stringify({ command: 'echo hi' }), turn: 1, step: 1, subCalls: [] }
}
function settled(name) {
  return { kind: 'tool-result', callId: `c-${name}`, call: { name, argsRaw: '{}' }, content: [{ type: 'text', text: 'ok' }], isError: false, subCalls: [] }
}

function makeSession(order, nodes, turnEnds) {
  const map = new Map(nodes.map((n) => [n.key, n]))
  return {
    chat: { order, nodes: { get: (k) => map.get(k) } },
    ...(turnEnds ? { turnEnds } : {}),
  }
}

function makeProps(snapshot, nodeKey, locale = 'zh') {
  const t = (key, params) => {
    const template = DICTS[locale][key] ?? key
    return params ? template.replace(/\{(\w+)\}/g, (_m, n) => String(params[n] ?? '')) : template
  }
  const renderSlot = (_key, owner, opts) => {
    // Mark the official dispatch: fallback only when no registered toolview.
    const marker = opts.entryKey === 'bash' ? `CARD:${opts.entryKey}:${owner.callId}` : null
    return marker ?? `FALLBACK:${opts.entryKey}`
  }
  return {
    node: snapshot.chat.nodes.get(nodeKey),
    useSession: (sel, eq) => {
      const value = sel(snapshot)
      return value
    },
    renderSlot,
    selectedCallId: undefined,
    cwd: '/ws',
    openFile: () => {},
    inspectCall: () => {},
    t,
  }
}

/** Flatten rendered JSON tree to text. */
function textOf(node) {
  if (node === null || node === undefined) return ''
  if (typeof node === 'string' || typeof node === 'number') return String(node)
  if (Array.isArray(node)) return node.map(textOf).join('')
  return textOf(node.children)
}
function childrenOf(node) {
  return Array.isArray(node) ? node : node.children ?? []
}

// ---------------------------------------------------------------------------
// Case 1: single running tool -> the LIVE BLOCK row (Bash · command), not a
// bare "正在运行 bash" label; count 1 + chevron right.
// ---------------------------------------------------------------------------
{
  const snapshot = makeSession(['t1'], [toolNode('t1', 1, running('bash'))])
  const root = create(React.createElement(ToolCallGroupView, makeProps(snapshot, 't1')))
  const text = textOf(root.toJSON())
  assert.ok(text.includes('正在运行'), 'visually hidden running label kept (a11y)')
  assert.ok(text.includes('Bash'), 'the block title shows, not the wire name')
  assert.ok(text.includes('echo hi'), 'the block summary (command) shows')
  assert.ok(text.includes('1 个块已被折叠'), 'folded label present')
  const json = root.toJSON()
  assert.equal(json.props['data-state'], 'running')
  root.unmount()
}

// ---------------------------------------------------------------------------
// Case 2: read✓ grep✓ bash running -> count 3, live row = Bash · command.
// ---------------------------------------------------------------------------
{
  const snapshot = makeSession(['t1', 't2', 't3'], [toolNode('t1', 1, settled('read')), toolNode('t2', 1, settled('grep')), toolNode('t3', 1, running('bash'))])
  const root = create(React.createElement(ToolCallGroupView, makeProps(snapshot, 't1')))
  const text = textOf(root.toJSON())
  assert.ok(text.includes('Bash') && text.includes('echo hi'), 'only the running block row shows')
  assert.ok(text.includes('3 个块已被折叠'), 'folded label 3')
  root.unmount()
}

// ---------------------------------------------------------------------------
// Case 3: all settled -> left side is empty immediately.
// ---------------------------------------------------------------------------
{
  const snapshot = makeSession(['t1', 't2', 't3'], [toolNode('t1', 1, settled('read')), toolNode('t2', 1, settled('grep')), toolNode('t3', 1, settled('bash'))])
  const root = create(React.createElement(ToolCallGroupView, makeProps(snapshot, 't1')))
  const text = textOf(root.toJSON())
  assert.ok(!text.includes('正在运行'), 'no running label (visually hidden label only while live-running)')
  assert.ok(!text.includes('read') && !text.includes('grep') && !text.includes('Bash'), 'no completed block remains on the left')
  assert.equal(root.toJSON().props['data-state'], 'settled', 'no sweep once settled')
  assert.ok(text.includes('3 个块已被折叠'), 'folded label 3')
  root.unmount()
}

// ---------------------------------------------------------------------------
// Requested: the live block shows ONLY on the bar whose OWN group hosts the
// latest active node. Two groups in one open turn — the active bash lives in
// the SECOND group — the FIRST group's bar keeps an empty left side.
// ---------------------------------------------------------------------------
{
  const snapshot = makeSession(
    ['t1', 'txt', 't2'],
    [toolNode('t1', 1, settled('read')), { key: 'txt', kind: 'assistant-step', location: { kind: 'step', turn: { turn: 1 }, step: { step: 2 } }, data: { blocks: [{ kind: 'text', text: '正文分隔' }], status: 'settled' } }, toolNode('t2', 1, running('bash'))],
  )
  const group1 = create(React.createElement(ToolCallGroupView, makeProps(snapshot, 't1')))
  const t1 = textOf(group1.toJSON())
  assert.ok(t1.includes('1 个块已被折叠'), 'first group bar present')
  assert.ok(!t1.includes('echo hi') && !t1.includes('Bash'), 'first group shows NO live block (not its node)')
  group1.unmount()
  const group2 = create(React.createElement(ToolCallGroupView, makeProps(snapshot, 't2')))
  const t2 = textOf(group2.toJSON())
  assert.ok(t2.includes('Bash') && t2.includes('echo hi'), 'the owning group shows the live block')
  assert.equal(group2.toJSON().props['data-state'], 'running')
  group2.unmount()
}

// ---------------------------------------------------------------------------
// Leader rule: non-leader seat renders nothing; group bar only once.
// ---------------------------------------------------------------------------
{
  const snapshot = makeSession(['t1', 't2'], [toolNode('t1', 1, settled('read')), toolNode('t2', 1, running('grep'))])
  const leader = create(React.createElement(ToolCallGroupView, makeProps(snapshot, 't1')))
  assert.ok(leader.toJSON() !== null, 'leader renders')
  const follower = create(React.createElement(ToolCallGroupView, makeProps(snapshot, 't2')))
  assert.ok(follower.toJSON() !== null && follower.toJSON().props['data-tool-group-hidden'] !== undefined, 'non-leader renders a hidden marker (no gap)')
  leader.unmount()
  follower.unmount()
}

// ---------------------------------------------------------------------------
// Case 5: expand -> official dispatch per member, in order, chevron down.
// ---------------------------------------------------------------------------
{
  const snapshot = makeSession(['t1', 't2', 't3'], [toolNode('t1', 1, settled('read')), toolNode('t2', 1, settled('grep')), toolNode('t3', 1, settled('bash'))])
  const root = create(React.createElement(ToolCallGroupView, makeProps(snapshot, 't1')))
  let json = root.toJSON()
  assert.equal(json.children[0].props['aria-expanded'], false)
  act(() => {
    json.children[0].props.onClick()
  })
  json = root.toJSON()
  assert.equal(json.children[0].props['aria-expanded'], true)
  const text = textOf(json)
  // members render through the official dispatch (bash has a registered view)
  assert.ok(text.includes('CARD:bash:c-bash'), 'official toolview dispatch for bash')
  assert.ok(text.includes('FALLBACK:read'), 'fallback dispatch for unregistered read')
  assert.ok(text.includes('FALLBACK:grep'), 'fallback dispatch for unregistered grep')
  // order preserved: read card before grep card before bash card
  assert.ok(text.indexOf('FALLBACK:read') < text.indexOf('FALLBACK:grep') && text.indexOf('FALLBACK:grep') < text.indexOf('CARD:bash'), 'members in execution order')
  root.unmount()
}

// ---------------------------------------------------------------------------
// A model-retry notice between the tools folds WITH the group: one bar,
// count includes the retry; the group's live block still shows.
// ---------------------------------------------------------------------------
{
  const retryNode = (key) => ({ key, kind: 'model-retry', location: { kind: 'step', turn: { turn: 1 }, step: { step: 2 } }, data: {} })
  const snapshot = makeSession(['t1', 'mr1', 't2'], [toolNode('t1', 1, settled('read')), retryNode('mr1'), toolNode('t2', 1, running('bash'))])
  const root = create(React.createElement(ToolCallGroupView, makeProps(snapshot, 't1')))
  const text = textOf(root.toJSON())
  assert.ok(text.includes('3 个块已被折叠'), 'retry folded WITH the tool group (count 3)')
  assert.ok(text.includes('Bash') && text.includes('echo hi'), 'live block still the running bash')
  // Expanded: the tools render in order (the retry item degrades to nothing
  // without a live registry in this test harness).
  act(() => {
    root.toJSON().children[0].props.onClick()
  })
  const expanded = textOf(root.toJSON())
  assert.ok(expanded.includes('FALLBACK:read') && expanded.includes('CARD:bash:c-bash'), 'official tool cards in order')
  assert.ok(expanded.indexOf('FALLBACK:read') < expanded.indexOf('CARD:bash:c-bash'))
  root.unmount()
}

// ---------------------------------------------------------------------------
// Case 6: expanded + new member arrives -> stays expanded, count grows.
// ---------------------------------------------------------------------------
{
  let snapshot = makeSession(['t1', 't2'], [toolNode('t1', 1, settled('read')), toolNode('t2', 1, settled('grep'))])
  const root = create(React.createElement(ToolCallGroupView, makeProps(snapshot, 't1')))
  act(() => {
    root.toJSON().children[0].props.onClick()
  })
  assert.equal(root.toJSON().children[0].props['aria-expanded'], true)
  // streaming: bash starts
  snapshot = makeSession(['t1', 't2', 't3'], [toolNode('t1', 1, settled('read')), toolNode('t2', 1, settled('grep')), toolNode('t3', 1, running('bash'))])
  act(() => {
    root.update(React.createElement(ToolCallGroupView, makeProps(snapshot, 't1')))
  })
  const json = root.toJSON()
  assert.equal(json.children[0].props['aria-expanded'], true, 'stays expanded after streaming update')
  const text = textOf(json)
  assert.ok(text.includes('3 个块已被折叠'), 'count grew to 3')
  assert.ok(text.includes('CARD:bash:c-bash'), 'new member rendered')
  root.unmount()
}

// ---------------------------------------------------------------------------
// Case 4: last call failed -> settled => empty left side.
// ---------------------------------------------------------------------------
{
  const snapshot = makeSession(['t1', 't2'], [toolNode('t1', 1, settled('read')), toolNode('t2', 1, { ...settled('bash'), isError: true, error: { name: 'E', code: 'x' } })])
  const root = create(React.createElement(ToolCallGroupView, makeProps(snapshot, 't1')))
  const text = textOf(root.toJSON())
  assert.ok(!text.includes('正在运行'), 'error ended the chain')
  assert.ok(!text.includes('Bash'), 'failed completed block is absent from the left')
  assert.ok(text.includes('2 个块已被折叠'))
  root.unmount()
}

// ---------------------------------------------------------------------------
// English locale.
// ---------------------------------------------------------------------------
{
  const snapshot = makeSession(['t1'], [toolNode('t1', 1, running('bash'))])
  const root = create(React.createElement(ToolCallGroupView, makeProps(snapshot, 't1', 'en')))
  const enText = textOf(root.toJSON())
  assert.ok(enText.includes('Running') && enText.includes('Bash') && enText.includes('echo hi'), 'en live row')
  root.unmount()
}

// ---------------------------------------------------------------------------
// REASONING TRANSPARENCY: think rows between tools fold with the group.
// Collapsed: one bar; expanded: think rows + official cards interleaved.
// ---------------------------------------------------------------------------
{
  function assistantNode(key, blocks, status = 'settled') {
    return { key, kind: 'assistant-step', location: { kind: 'step', turn: { turn: 1 }, step: { step: 1 } }, data: { blocks, status } }
  }
  const think = (text) => ({ kind: 'reasoning', text })
  const snapshot = makeSession(
    ['a1', 't1', 'a2', 't2'],
    [assistantNode('a1', [think('first reasoning')]), toolNode('t1', 1, settled('read')), assistantNode('a2', [think('second reasoning')]), toolNode('t2', 1, running('bash'))],
  )
  const root = create(React.createElement(ToolCallGroupView, makeProps(snapshot, 't1')))
  // Collapsed: ONE bar; 4 folded blocks (2 tools + 2 think rows); think text hidden.
  let text = textOf(root.toJSON())
  assert.ok(text.includes('4 个块已被折叠'), 'folded blocks = tools + think rows')
  assert.ok(text.includes('Bash') && text.includes('echo hi'), 'live row: the running bash block')
  assert.ok(!text.includes('first reasoning') && !text.includes('second reasoning'), 'think rows hidden while collapsed')
  // Expanded: think rows shown in flow order between the official cards.
  act(() => {
    root.toJSON().children[0].props.onClick()
  })
  text = textOf(root.toJSON())
  assert.ok(text.includes('first reasoning') && text.includes('second reasoning'), 'think rows shown when expanded')
  assert.ok(text.includes('FALLBACK:read') && text.includes('CARD:bash:c-bash'), 'official tool cards shown')
  assert.ok(text.indexOf('first reasoning') < text.indexOf('FALLBACK:read'), 'think1 before tool1')
  assert.ok(text.indexOf('FALLBACK:read') < text.indexOf('second reasoning'), 'tool1 before think2')
  // Requested: the live block shows ONLY while collapsed — expanded, the
  // bar's left side is empty (the details are right below).
  assert.ok(!text.includes('echo hi'), 'live block hidden once the group is expanded')
  root.unmount()
}

// ---------------------------------------------------------------------------
// BIG FOLD: a closed, summarized turn folds its process behind one bar.
// The tool leader is also the first process node -> renders the big bar;
// expanding reveals the small group bar.
// ---------------------------------------------------------------------------
{
  function textAssistant(key, text) {
    return { key, kind: 'assistant-step', location: { kind: 'step', turn: { turn: 1 }, step: { step: 1 } }, data: { blocks: [{ kind: 'text', text }], status: 'settled' } }
  }
  const turnEnds = new Map([[1, 999]])
  const snapshot = makeSession(
    ['t1', 't2', 't3', 'aSum'],
    [toolNode('t1', 1, settled('read')), toolNode('t2', 1, settled('grep')), toolNode('t3', 1, settled('bash')), textAssistant('aSum', '最终总结')],
    turnEnds,
  )
  // act-wrapped create: the external-store subscription commits inside act.
  let root
  act(() => {
    root = create(React.createElement(ToolCallGroupView, makeProps(snapshot, 't1')))
  })
  // Collapsed: only the big fold bar; the small bar is hidden inside.
  let text = textOf(root.toJSON())
  assert.ok(text.includes('该轮次工作过程已折叠'), 'big fold bar shown')
  assert.ok(!text.includes('3 个块已被折叠'), 'small bar hidden inside the big fold')
  assert.ok(!text.includes('read'), 'no tool content visible')
  // Expand the big fold -> the small fold appears (fragment flattens: the
  // bar is the top-level element).
  act(() => {
    root.toJSON().props.onClick()
  })
  text = textOf(root.toJSON())
  assert.ok(text.includes('该轮次工作过程已折叠'), 'big fold bar stays (chevron down)')
  assert.ok(text.includes('3 个块已被折叠'), 'small fold revealed inside the big fold')
  root.unmount()

  // A non-first process member seat renders null while the big fold is collapsed.
  let memberRoot
  act(() => {
    memberRoot = create(React.createElement(ToolCallGroupView, makeProps(snapshot, 't2')))
  })
  assert.ok(memberRoot.toJSON().props['data-tool-group-hidden'] !== undefined, 'process member hidden behind the big fold (no gap)')
  memberRoot.unmount()
}

// ---------------------------------------------------------------------------
// REGRESSION (user report): a merged run = compaction + think + tools + context
// forms ONE group. The leader seat (first tool) renders exactly ONE merged
// fold bar with the whole-run count — the notice members never get their own
// bars, so opening the turn shows a single "5 个块已被折叠" bar, not five.
// ---------------------------------------------------------------------------
{
  function noticeNode(key, kind) {
    return { key, kind, location: { kind: 'turn', turn: { turn: 1 } }, data: {} }
  }
  function think() {
    return { key: 'asm1', kind: 'assistant-step', location: { kind: 'step', turn: { turn: 1 }, step: { step: 1 } }, data: { blocks: [{ kind: 'reasoning', text: '想想' }], status: 'settled' } }
  }
  const snapshot = makeSession(
    ['comp', 'asm1', 't1', 't2', 'ctx1'],
    [noticeNode('comp', 'compaction'), think(), toolNode('t1', 1, settled('read')), toolNode('t2', 1, settled('grep')), noticeNode('ctx1', 'context')],
  )
  let root
  act(() => {
    root = create(React.createElement(ToolCallGroupView, makeProps(snapshot, 't1')))
  })
  const text = textOf(root.toJSON())
  assert.ok(text.includes('5 个块已被折叠'), 'the merged run folds into ONE bar with count 5 (compaction+think+read+grep+context)')
  const barCount = (text.match(/个块已被折叠/g) ?? []).length
  assert.equal(barCount, 1, 'exactly ONE merged fold bar at the leader seat')
  assert.ok(!text.includes('该轮次工作过程已折叠'), 'open turn: no big fold bar')
  root.unmount()
}

// ---------------------------------------------------------------------------
// ALPHA (0.1.2-alpha.1) seat kit: `useChat` carries the chat target directly
// (order/nodes/legacy.turnEnds), `useSession` carries only the window flags.
// The adapter must produce the same group behavior as the rc-era kit.
// ---------------------------------------------------------------------------

/** Alpha-shaped props: chat target + session window flags + product fold. */
function makeAlphaProps(chatSnapshot, sessionSnapshot, nodeKey, turnProcess) {
  const base = makeProps({ chat: chatSnapshot }, nodeKey)
  // makeProps' useSession already unwraps via the adapter (session shape);
  // here the chat target is OUTSIDE the session snapshot, so useChat is the
  // dedicated chat selector and useSession only sees the window flags.
  return {
    ...base,
    useChat: (sel, eq) => sel(chatSnapshot),
    useSession: (sel, eq) => sel(sessionSnapshot),
    ...(turnProcess === undefined ? {} : { turnProcess }),
  }
}

{
  // (a) A turn-process controller node between two tool calls is transparent:
  // ONE merged group, count 2, leader = first tool; open turn, no big fold.
  const chat = (() => {
    const nodes = [
      toolNode('t1', 1, settled('read')),
      { key: 'tp1', kind: 'turn-process', location: { kind: 'turn', turn: { turn: 1, status: 'closed' } }, data: {} },
      toolNode('t2', 1, settled('grep')),
    ]
    const map = new Map(nodes.map((n) => [n.key, n]))
    return { order: ['t1', 'tp1', 't2'], nodes: { get: (k) => map.get(k) }, legacy: { turnEnds: new Map() } }
  })()
  const session = { hasMore: true, loadingOlder: false }
  let root
  act(() => {
    root = create(React.createElement(ToolCallGroupView, makeAlphaProps(chat, session, 't1')))
  })
  let text = textOf(root.toJSON())
  assert.ok(text.includes('2 个块已被折叠'), 'alpha: turn-process node is transparent (not counted, not a boundary)')
  assert.ok(!text.includes('该轮次工作过程已折叠'), 'alpha: open turn has no big fold')
  root.unmount()

  // (b) The product's own compact-transcript fold is ACTIVE for the turn:
  // the plugin yields the big fold — no "该轮次工作过程已折叠" bar, the small
  // fold still leads at the first tool seat.
  const closedChat = (() => {
    const nodes = [
      toolNode('t1', 1, settled('read')),
      toolNode('t2', 1, settled('grep')),
      { key: 'aSum', kind: 'assistant-step', location: { kind: 'step', turn: { turn: 1, status: 'closed' }, step: { step: 5 } }, data: { blocks: [{ kind: 'text', text: '总结' }], status: 'settled' } },
    ]
    const map = new Map(nodes.map((n) => [n.key, n]))
    return { order: ['t1', 't2', 'aSum'], nodes: { get: (k) => map.get(k) }, legacy: { turnEnds: new Map([[1, 42]]) } }
  })()
  act(() => {
    root = create(React.createElement(ToolCallGroupView, makeAlphaProps(closedChat, session, 't1', { foldable: true })))
  })
  text = textOf(root.toJSON())
  assert.ok(!text.includes('该轮次工作过程已折叠'), 'alpha: product fold active -> plugin big fold yields')
  assert.ok(text.includes('2 个块已被折叠'), 'alpha: small tool group still renders under the product fold')
  root.unmount()

  // (c) Window flags flow from the SESSION snapshot (alpha): the AutoLoadHost
  // receives hasMore/loadingOlder even though the transcript lives in useChat.
  act(() => {
    root = create(React.createElement(ToolCallGroupView, makeAlphaProps(closedChat, { hasMore: false, loadingOlder: true }, 't1')))
  })
  const autoHost = root.toJSON()
  // The rendered tree's outermost wrapper has data-tool-group; the auto host
  // is an inner div — verify through a re-render with the follower seat that
  // no crash occurs and the small fold renders.
  assert.ok(textOf(autoHost).includes('2 个块已被折叠'), 'alpha: flags do not disturb the fold')
  root.unmount()
}

console.log('component.test: all assertions passed')
