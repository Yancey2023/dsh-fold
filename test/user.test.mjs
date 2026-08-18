/**
 * Render-level tests of UserNodeWrapper — the shadowing renderer for the
 * `user` cell (product bubble replica + 3-line clamp + expand/collapse).
 *
 *   short text          -> bubble clamped, toggle hidden (no overflow in tests)
 *   ref chips           -> /name and @name tokens decorated, text preserved
 *   images + extras     -> official ImageGallery props + JsonBlock extras
 *   toggle              -> expand removes the clamp, collapse restores it
 *   copy action         -> official writeClipboard path with check feedback
 *   time                -> product clock format, hidden when absent
 *   string content      -> defensive text-only handling
 */
import assert from 'node:assert/strict'
import React from 'react'
import { create, act } from 'react-test-renderer'
import { UserNodeWrapper } from '../lib/client-user.mjs'

function userNode(key, content, time) {
  return { key, kind: 'user', data: { content, ...(time !== undefined ? { time } : {}) } }
}
function textBlock(text) {
  return { type: 'text', text }
}
function imageBlock(attachment) {
  return { type: 'image', attachment }
}

const DICT = {
  'image.label': '图片',
  'image.openOriginal': '查看原图',
  'image.openOriginalLabel': '打开 {label}',
  'image.loading': '加载中',
  'image.loadFailed': '加载失败',
  'image.preview': '预览',
  'image.closePreview': '关闭预览',
  'message.extraBlock': '附加内容',
  'json.truncated': '已截断 {total}',
  copy: '复制',
  copied: '已复制',
  'clock.md': '{y}/{m}/{d}',
  'clock.ymd': '{y}-{m}-{d}',
  expand: '展开',
  collapse: '收起',
}
const makeT = () => (key, params) => {
  const template = DICT[key] ?? key
  return params ? template.replace(/\{(\w+)\}/g, (_m, n) => String(params[n] ?? '')) : template
}

function makeProps(node) {
  return {
    node,
    loadImage: async (attachment) => `url:${attachment.id}`,
    t: makeT(),
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

/** Collect every JSON node satisfying a predicate. */
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

// ---------------------------------------------------------------------------
// Short text: bubble clamped, toggle hidden (no overflow in the test env),
// time + copy actions present.
// ---------------------------------------------------------------------------
{
  const time = Date.now() - 7 * 864e5
  const expectedClock = (() => {
    const d = new Date(time)
    const pad2 = (v) => (v < 10 ? `0${v}` : String(v))
    return `${d.getFullYear()}/${d.getMonth() + 1}/${d.getDate()} ${pad2(d.getHours())}:${pad2(d.getMinutes())}`
  })()
  let root
  await act(async () => {
    root = create(React.createElement(UserNodeWrapper, makeProps(userNode('u1', [textBlock('hello')], time))))
  })
  const json = root.toJSON()
  const clamp = findAll(json, byClass('dshUserBubbleClamp'))
  const bubble = findAll(json, byClass('dshUserBubble'))
  const toggle = findAll(json, byClass('dshUserFoldToggle'))
  const timeSpan = findAll(json, byClass('dshUserTime'))
  const copy = findAll(json, byClass('dshUserAction'))
  const gallery = findAll(json, (node) => node.props?.['data-image-gallery'] !== undefined)

  assert.equal(bubble.length, 1, 'outer bubble keeps padding/background')
  assert.equal(clamp.length, 1, 'padding-free clamp box inside the bubble')
  assert.equal(clamp[0].props['data-clamped'], '', 'clamp box must be clamped by default')
  assert.equal(textOf(clamp[0]), 'hello')
  assert.equal(toggle.length, 1, 'toggle is always rendered for a text bubble')
  assert.equal(toggle[0].props['data-shown'], undefined, 'toggle hidden while not overflowing')
  assert.equal(toggle[0].props['aria-expanded'], false)
  assert.equal(textOf(toggle[0]), '展开')
  assert.equal(gallery.length, 0)
  assert.equal(timeSpan.length, 1)
  assert.equal(textOf(timeSpan[0]), expectedClock)
  assert.equal(copy.length, 1)
  assert.equal(copy[0].props['aria-label'], '复制')
  assert.equal(json.props['data-time-hover-root'], '')
  root.unmount()
}

// ---------------------------------------------------------------------------
// Ref chips: /name and @name tokens decorated; full text preserved in order.
// ---------------------------------------------------------------------------
{
  const input = 'please /read the file and @skill plan it'
  let root
  await act(async () => {
    root = create(React.createElement(UserNodeWrapper, makeProps(userNode('u2', [textBlock(input)], Date.now()))))
  })
  const json = root.toJSON()
  const clamp = findAll(json, byClass('dshUserBubbleClamp'))
  const chips = findAll(json, (node) => node.props?.['data-ref-chip'] !== undefined)

  assert.equal(clamp.length, 1)
  assert.equal(textOf(clamp[0]), input, 'chip decoration must preserve the full text')
  assert.equal(chips.length, 2)
  assert.equal(chips[0].props['data-ref-chip'], 'skill')
  assert.equal(textOf(chips[0]), '/read')
  assert.equal(chips[1].props['data-ref-chip'], 'subagent')
  assert.equal(textOf(chips[1]), '@skill')
  root.unmount()
}

// ---------------------------------------------------------------------------
// Images + extra blocks: official ImageGallery props and JsonBlock extras.
// ---------------------------------------------------------------------------
{
  let root
  await act(async () => {
    root = create(
      React.createElement(
        UserNodeWrapper,
        makeProps(userNode('u3', [textBlock('hi'), imageBlock({ id: 'a1' }), { type: 'custom', payload: { a: 1 } }], Date.now())),
      ),
    )
  })
  const json = root.toJSON()
  const gallery = findAll(json, (node) => node.props?.['data-image-gallery'] !== undefined)
  const extras = findAll(json, (node) => node.props?.['data-json-block'] !== undefined)

  assert.equal(gallery.length, 1)
  assert.equal(gallery[0].props['data-count'], 1)
  assert.equal(gallery[0].props['data-align'], 'end')
  assert.equal(gallery[0].props['data-image-label'], '图片')
  assert.equal(extras.length, 1)
  assert.equal(extras[0].props['data-label'], '附加内容')
  assert.deepEqual(JSON.parse(textOf(extras[0])), { type: 'custom', payload: { a: 1 } })
  root.unmount()
}

// ---------------------------------------------------------------------------
// Toggle: expand removes the clamp; collapse restores it.
// ---------------------------------------------------------------------------
{
  let root
  await act(async () => {
    root = create(React.createElement(UserNodeWrapper, makeProps(userNode('u4', [textBlock('long '.repeat(200))], Date.now()))))
  })
  let json = root.toJSON()
  const toggle = findAll(json, byClass('dshUserFoldToggle'))
  const clamp = findAll(json, byClass('dshUserBubbleClamp'))
  assert.equal(clamp[0].props['data-clamped'], '')
  assert.equal(textOf(toggle[0]), '展开')

  await act(async () => {
    toggle[0].props.onClick()
  })
  json = root.toJSON()
  const clampAfter = findAll(json, byClass('dshUserBubbleClamp'))
  const toggleAfter = findAll(json, byClass('dshUserFoldToggle'))
  assert.equal(clampAfter[0].props['data-clamped'], undefined, 'expanded bubble is not clamped')
  assert.equal(toggleAfter[0].props['aria-expanded'], true)
  assert.equal(textOf(toggleAfter[0]), '收起')

  await act(async () => {
    toggleAfter[0].props.onClick()
  })
  json = root.toJSON()
  const clampCollapsed = findAll(json, byClass('dshUserBubbleClamp'))
  assert.equal(clampCollapsed[0].props['data-clamped'], '', 'collapse restores the clamp')
  assert.equal(textOf(findAll(json, byClass('dshUserFoldToggle'))[0]), '展开')
  root.unmount()
}

// ---------------------------------------------------------------------------
// Copy action: click flips to the copied state (official writeClipboard path).
// ---------------------------------------------------------------------------
{
  let root
  await act(async () => {
    root = create(React.createElement(UserNodeWrapper, makeProps(userNode('u5', [textBlock('copy me')], Date.now()))))
  })
  const json = root.toJSON()
  const copy = findAll(json, byClass('dshUserAction'))
  assert.equal(copy[0].props['aria-label'], '复制')
  await act(async () => {
    copy[0].props.onClick()
  })
  const jsonAfter = root.toJSON()
  const copyAfter = findAll(jsonAfter, byClass('dshUserAction'))
  assert.equal(copyAfter[0].props['aria-label'], '已复制')
  root.unmount()
}

// ---------------------------------------------------------------------------
// No time: actions row renders the copy button only.
// ---------------------------------------------------------------------------
{
  let root
  await act(async () => {
    root = create(React.createElement(UserNodeWrapper, makeProps(userNode('u6', [textBlock('hi')]))))
  })
  const json = root.toJSON()
  assert.equal(findAll(json, byClass('dshUserTime')).length, 0)
  assert.equal(findAll(json, byClass('dshUserAction')).length, 1)
  root.unmount()
}

// ---------------------------------------------------------------------------
// Image-only message: no bubble, no toggle, gallery present.
// ---------------------------------------------------------------------------
{
  let root
  await act(async () => {
    root = create(React.createElement(UserNodeWrapper, makeProps(userNode('u7', [imageBlock({ id: 'x' })]))))
  })
  const json = root.toJSON()
  assert.equal(findAll(json, byClass('dshUserBubble')).length, 0, 'no bubble for image-only')
  assert.equal(findAll(json, byClass('dshUserFoldToggle')).length, 0)
  assert.equal(findAll(json, (node) => node.props?.['data-image-gallery'] !== undefined).length, 1)
  assert.equal(findAll(json, byClass('dshUserAction')).length, 1)
  root.unmount()
}

// ---------------------------------------------------------------------------
// Defensive: string content renders as text.
// ---------------------------------------------------------------------------
{
  let root
  await act(async () => {
    root = create(React.createElement(UserNodeWrapper, makeProps({ key: 'u8', kind: 'user', data: { content: 'plain string' } })))
  })
  const json = root.toJSON()
  const clamp = findAll(json, byClass('dshUserBubbleClamp'))
  assert.equal(clamp.length, 1)
  assert.equal(textOf(clamp[0]), 'plain string')
  root.unmount()
}

console.log('user.test.mjs ok')
