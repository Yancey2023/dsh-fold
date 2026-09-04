/**
 * Render-level tests of NoticeNodeWrapper — the shadowing renderer for the
 * non-text notice cells (compaction / context / manual-compaction / command):
 *
 *   open turn        -> one-line folded bar (count 1), expand -> official view
 *   closed turn      -> joins the big fold (bar at first seat, hidden members)
 *   command          -> official CommandNodeView keeps its renderSlot binding
 *   fail-soft        -> missing official entry renders the hidden marker
 */
import assert from 'node:assert/strict'
import React from 'react'
import { create, act } from 'react-test-renderer'
import { NoticeNodeWrapper, setSlotsService, setGroupT, setTurnExpanded } from '../lib/client-notice.mjs'

function noticeNode(key, kind, turn) {
  return { key, kind, location: { kind: 'turn', turn: { turn } }, data: {} }
}
function toolNode(key, turn, root) {
  return { key, kind: 'tool-call', location: { kind: 'step', turn: { turn }, step: { step: 1 } }, data: { root } }
}
function settled(name) {
  return { kind: 'tool-result', callId: `c-${name}`, call: { name, argsRaw: '{}' }, content: [], isError: false }
}
function textAssistant(key, turn) {
  return { key, kind: 'assistant-step', location: { kind: 'step', turn: { turn }, step: { step: 1 } }, data: { blocks: [{ kind: 'text', text: '总结' }], status: 'settled' } }
}
function thinkAssistant(key, turn) {
  return { key, kind: 'assistant-step', location: { kind: 'step', turn: { turn }, step: { step: 1 } }, data: { blocks: [{ kind: 'reasoning', text: '想想' }], status: 'settled' } }
}
function makeSession(order, nodes, turnEnds) {
  const map = new Map(nodes.map((n) => [n.key, n]))
  return { chat: { order, nodes: { get: (k) => map.get(k) } }, ...(turnEnds ? { turnEnds } : {}) }
}

const DICTS = {
  running: '正在运行',
  folded: '{count} 个块已被折叠',
  turnFolded: '该轮次工作过程已折叠',
}
setGroupT((key, params) => {
  const template = DICTS[key] ?? key
  return params ? template.replace(/\{(\w+)\}/g, (_m, n) => String(params[n] ?? '')) : template
})
const t = (key, params) => {
  const template = DICTS[key] ?? key
  return params ? template.replace(/\{(\w+)\}/g, (_m, n) => String(params[n] ?? '')) : template
}

function makeProps(snapshot, nodeKey) {
  return {
    node: snapshot.chat.nodes.get(nodeKey),
    useSession: (sel) => sel(snapshot),
    renderSlot: (childKey, owner, opts) => `CMDVIEW:${childKey}:${opts.entryKey}`,
    t,
    openFile: () => {},
    inspectCall: () => {},
    forkAt: () => {},
  }
}

/** Flatten rendered JSON tree to text. */
function textOf(node) {
  if (node === null || node === undefined) return ''
  if (typeof node === 'string' || typeof node === 'number') return String(node)
  if (Array.isArray(node)) return node.map(textOf).join('')
  return textOf(node.children)
}

function findAll(node, pred, out = []) {
  if (node === null || node === undefined) return out
  if (Array.isArray(node)) {
    for (const child of node) findAll(child, pred, out)
    return out
  }
  if (typeof node === 'object' && pred(node)) out.push(node)
  findAll(node.children, pred, out)
  return out
}

const byClass = (name) => (node) => typeof node.props?.className === 'string' && node.props.className.split(' ').includes(name)

// The live slots service: official entries at priority 0 for the notice
// kinds (the official components are tiny marker renderers).
const officialCompaction = React.memo(({ node }) => `OFFICIAL_COMPACTION[${node.key}]`)
const officialContext = () => 'OFFICIAL_CONTEXT'
const officialCommand = React.memo(({ node, renderSlot }) => {
  const out = renderSlot ? renderSlot('conversation.chat.commandview', { node }, { entryKey: 'permission', fallback: 'CMD_FALLBACK' }) : '(no slot)'
  return `OFFICIAL_COMMAND[${node.key}]|${out}`
})
const officialModelRetry = React.memo(({ node }) => `OFFICIAL_MODEL_RETRY[${node.key}]`)
setSlotsService({
  entries(key) {
    assert.equal(key, 'conversation.chat.node')
    return [
      { options: { key: 'compaction', priority: 0 }, component: officialCompaction },
      { options: { key: 'context', priority: 0 }, component: officialContext },
      { options: { key: 'command', priority: 0 }, component: officialCommand },
      { options: { key: 'model-retry', priority: 0 }, component: officialModelRetry },
    ]
  },
})

// ---------------------------------------------------------------------------
// Open turn: compaction renders its own one-line folded bar; expanding shows
// the official compaction view.
// ---------------------------------------------------------------------------
{
  const snapshot = makeSession(['c1'], [noticeNode('c1', 'compaction', 1)])
  let root
  await act(async () => {
    root = create(React.createElement(NoticeNodeWrapper, makeProps(snapshot, 'c1')))
  })
  let json = root.toJSON()
  const bars = findAll(json, byClass('dshToolGroupRow'))
  assert.equal(bars.length, 1, 'one folded bar')
  const text = textOf(json)
  assert.ok(text.includes('1 个块已被折叠'), 'count label')
  assert.ok(!text.includes('OFFICIAL_COMPACTION'), 'official view hidden while collapsed')

  await act(async () => {
    bars[0].props.onClick()
  })
  json = root.toJSON()
  assert.ok(textOf(json).includes('OFFICIAL_COMPACTION[c1]'), 'official compaction view when expanded')
  assert.equal(findAll(json, byClass('dshToolGroupRow'))[0].props['aria-expanded'], true)
  root.unmount()
}

// ---------------------------------------------------------------------------
// Closed summarized turn: the compaction is a process node — the FIRST seat
// renders the big fold bar, other process seats render the hidden marker.
// ---------------------------------------------------------------------------
{
  const snapshot = makeSession(['c1', 'ctx1', 'aSum'], [noticeNode('c1', 'compaction', 1), noticeNode('ctx1', 'context', 1), textAssistant('aSum', 1)], new Map([[1, 999]]))
  let first
  await act(async () => {
    first = create(React.createElement(NoticeNodeWrapper, makeProps(snapshot, 'c1')))
  })
  let text = textOf(first.toJSON())
  assert.ok(text.includes('该轮次工作过程已折叠'), 'big fold bar at the first process seat')
  assert.ok(!text.includes('1 个块已被折叠'), 'small bar hidden inside the big fold')

  // Expand the big fold: the small fold reappears (its own collapsed bar).
  await act(async () => {
    first.toJSON().props.onClick()
  })
  text = textOf(first.toJSON())
  assert.ok(text.includes('该轮次工作过程已折叠'), 'big fold bar stays')
  assert.ok(text.includes('2 个块已被折叠'), 'small bar revealed inside the big fold (compaction + context merged into one group)' )
  assert.ok(!text.includes('OFFICIAL_COMPACTION'), 'small bar still collapsed')

  // Expand the small bar -> the official compaction view.
  await act(async () => {
    findAll(first.toJSON(), byClass('dshToolGroupRow'))[0].props.onClick()
  })
  text = textOf(first.toJSON())
  assert.ok(text.includes('OFFICIAL_COMPACTION[c1]'), 'official view shown')
  first.unmount()

  // Non-first process seat (context): hidden marker while the big fold is
  // collapsed.
  setTurnExpanded(':1', false)
  let member
  await act(async () => {
    member = create(React.createElement(NoticeNodeWrapper, makeProps(snapshot, 'ctx1')))
  })
  assert.ok(member.toJSON().props['data-tool-group-hidden'] !== undefined, 'process member hidden (no gap)')
  member.unmount()
}

// ---------------------------------------------------------------------------
// REGRESSION (user report): a merged run = compaction + think + tools + context
// in ONE group. When the big fold is EXPANDED, the small group bar must render
// ONLY at the group leader seat (the first tool). Notice process seats that
// are NOT the leader (compaction seat = firstKey, context seat = member) must
// NOT duplicate the "N 个块已被折叠" bar.
// ---------------------------------------------------------------------------
{
  const snapshot = makeSession(
    ['comp', 'asm1', 't1', 't2', 'ctx1', 'aSum'],
    [
      noticeNode('comp', 'compaction', 1),
      thinkAssistant('asm1', 1),
      toolNode('t1', 1, settled('read')),
      toolNode('t2', 1, settled('grep')),
      noticeNode('ctx1', 'context', 1),
      textAssistant('aSum', 1),
    ],
    new Map([[1, 999]]),
  )

  // Compaction seat: firstKey (renders the big bar) but NOT the group leader
  // (leader = first tool t1). Expanded big fold -> big bar WITHOUT any small
  // "N 个块已被折叠" duplication, and WITHOUT the [data-tool-group-hidden]
  // marker sitting NEXT TO the bar: the package CSS
  // `[data-chat-flow-key]:has([data-tool-group-hidden]){display:none}` would
  // then hide this whole flow item (big bar included) and the turn could
  // never be collapsed again — the reported regression.
  setTurnExpanded(':1', true)
  let comp
  await act(async () => {
    comp = create(React.createElement(NoticeNodeWrapper, makeProps(snapshot, 'comp')))
  })
  let text = textOf(comp.toJSON())
  assert.ok(text.includes('该轮次工作过程已折叠'), 'big fold bar at the first process seat')
  const compBars = findAll(comp.toJSON(), byClass('dshToolGroupRow'))
  assert.equal(compBars.length, 0, 'no small fold bar at the compaction seat (it is not the group leader)')
  const hiddenMarkers = findAll(comp.toJSON(), (n) => typeof n.props?.['data-tool-group-hidden'] !== 'undefined')
  assert.equal(hiddenMarkers.length, 0, 'no hidden marker next to the big fold bar (the bar stays clickable)')
  comp.unmount()

  // Context seat: process member, not the leader -> hidden marker, no bar.
  let ctx
  await act(async () => {
    ctx = create(React.createElement(NoticeNodeWrapper, makeProps(snapshot, 'ctx1')))
  })
  const ctxJson = ctx.toJSON()
  assert.ok(ctxJson.props['data-tool-group-hidden'] !== undefined, 'context member hidden (its bar belongs to the tool leader)')
  assert.equal(findAll(ctxJson, byClass('dshToolGroupRow')).length, 0, 'no duplicated bar at the context member seat')
  ctx.unmount()

  setTurnExpanded(':1', false)
}

// ---------------------------------------------------------------------------
// model-retry (已重试模型请求) NEVER folds: between tools its own seat
// renders the official retry view directly, in any context.
// ---------------------------------------------------------------------------
{
  const snapshot = makeSession(
    ['t1', 'mr1', 't2'],
    [toolNode('t1', 1, settled('read')), noticeNode('mr1', 'model-retry', 1), toolNode('t2', 1, settled('grep'))],
  )
  let root
  await act(async () => {
    root = create(React.createElement(NoticeNodeWrapper, makeProps(snapshot, 'mr1')))
  })
  const text = textOf(root.toJSON())
  assert.ok(text.includes('OFFICIAL_MODEL_RETRY[mr1]'), 'official retry view rendered unfolded')
  assert.ok(!text.includes('个块已被折叠'), 'no fold bar')
  assert.ok(!text.includes('data-tool-group-hidden'), 'no hidden marker in the unfolded seat')
  root.unmount()
}

// A standalone retry likewise renders the official view immediately — no
// group bar, nothing collapsed.
// ---------------------------------------------------------------------------
{
  const snapshot = makeSession(['mr1'], [noticeNode('mr1', 'model-retry', 1)])
  let root
  await act(async () => {
    root = create(React.createElement(NoticeNodeWrapper, makeProps(snapshot, 'mr1')))
  })
  assert.equal(findAll(root.toJSON(), byClass('dshToolGroupRow')).length, 0, 'no fold bar')
  assert.ok(textOf(root.toJSON()).includes('OFFICIAL_MODEL_RETRY[mr1]'), 'official retry view when expanded')
  root.unmount()
}

// ---------------------------------------------------------------------------
// Command cell: the official CommandNodeView keeps its renderSlot binding.
// ---------------------------------------------------------------------------
{
  const snapshot = makeSession(['cmd1'], [noticeNode('cmd1', 'command', 1)])
  let root
  await act(async () => {
    root = create(React.createElement(NoticeNodeWrapper, makeProps(snapshot, 'cmd1')))
  })
  await act(async () => {
    findAll(root.toJSON(), byClass('dshToolGroupRow'))[0].props.onClick()
  })
  const text = textOf(root.toJSON())
  assert.ok(text.includes('OFFICIAL_COMMAND[cmd1]'), 'official command view delegated')
  assert.ok(text.includes('CMD_FALLBACK'), 'the in-group renderSlot yields the official command fallback (GenericCommandCard path)')
  root.unmount()
}

// ---------------------------------------------------------------------------
// Context cell (open turn) delegates to the official context view.
// ---------------------------------------------------------------------------
{
  const snapshot = makeSession(['ctx1'], [noticeNode('ctx1', 'context', 1)])
  let root
  await act(async () => {
    root = create(React.createElement(NoticeNodeWrapper, makeProps(snapshot, 'ctx1')))
  })
  await act(async () => {
    findAll(root.toJSON(), byClass('dshToolGroupRow'))[0].props.onClick()
  })
  assert.ok(textOf(root.toJSON()).includes('OFFICIAL_CONTEXT'), 'official context view when expanded')
  root.unmount()
}

// ---------------------------------------------------------------------------
// Fail-soft: a notice kind without an official entry renders the hidden
// marker instead of crashing (the flow stays clean).
// ---------------------------------------------------------------------------
{
  const snapshot = makeSession(['m1'], [noticeNode('m1', 'manual-compaction', 1)])
  let root
  await act(async () => {
    root = create(React.createElement(NoticeNodeWrapper, makeProps(snapshot, 'm1')))
  })
  const json = root.toJSON()
  assert.ok(json.props['data-tool-group-hidden'] !== undefined, 'missing official entry -> hidden marker, no crash')
  root.unmount()
}

console.log('notice.test.mjs ok')
