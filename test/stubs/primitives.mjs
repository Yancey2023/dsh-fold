// Stubs for node-based tests (the real primitives components are tiny; the
// components under test only need them to render).
import React from 'react'
function Icon({ size = 14, className }) {
  return React.createElement('svg', { width: size, height: size, className, 'data-icon': 'true' })
}
export const IconChevronRightOutline14 = Icon
export const IconChevronDownOutline14 = Icon
export const IconChevronUpOutline14 = Icon
export const IconThinkOutline14 = Icon
export const IconCopyOutline16 = Icon
export const IconCheckOutline16 = Icon
export const IconApiOutline14 = Icon
export const IconQuestionOutline14 = Icon

export function DisclosureRow({ icon, title, open, expandable, onToggle, expandOnRowClick = false, collapsedContent, children, rowClassName, leadingClassName, titleClassName, chevronClassName }) {
  const row = React.createElement(
    'div',
    { className: rowClassName, 'data-disclosure-row': true, 'data-expandable': expandable && expandOnRowClick || undefined, onClick: expandable && expandOnRowClick ? onToggle : undefined },
    React.createElement('span', { className: leadingClassName }, icon),
    React.createElement('span', { className: titleClassName }, title),
    collapsedContent,
  )
  return React.createElement('div', { 'data-open': open || undefined }, row, open ? children : null)
}

export function projectUserText(text, sessionLabels = [], slashNames = [], slashKind = 'skill') {
  const re = /(^|\s)(\/[\w-]+(?=\s|$)|@[^\s]+)/gu
  const parts = []
  let cursor = 0
  let match
  while ((match = re.exec(text)) !== null) {
    const tokenStart = match.index + (match[1]?.length ?? 0)
    const label = match[2]
    const isSlash = label.startsWith('/')
    if (isSlash && !slashNames.includes(label.slice(1))) continue
    if (tokenStart > cursor) parts.push(React.createElement('span', { key: `t${cursor}` }, text.slice(cursor, tokenStart)))
    const name = label.slice(1)
    const chipKind = isSlash ? slashKind : sessionLabels.includes(name) ? 'session' : 'file'
    parts.push(React.createElement('span', { key: `r${tokenStart}`, 'data-ref-chip': chipKind }, isSlash ? label : name))
    cursor = tokenStart + label.length
  }
  if (parts.length === 0) return React.createElement('span', null, text)
  if (cursor < text.length) parts.push(React.createElement('span', { key: `t${cursor}` }, text.slice(cursor)))
  return React.createElement(React.Fragment, null, parts)
}

export function fileSizeText(bytes) {
  if (bytes < 1024) return `${bytes}B`
  const kb = bytes / 1024
  if (kb < 1024) return `${kb < 10 ? kb.toFixed(1) : Math.round(kb)}KB`
  const mb = kb / 1024
  if (mb < 1024) return `${mb < 10 ? mb.toFixed(1) : Math.round(mb)}MB`
  const gb = mb / 1024
  return `${gb < 10 ? gb.toFixed(1) : Math.round(gb)}GB`
}

export function DocumentFileIcon({ className }) {
  return React.createElement('svg', { className, 'data-document-icon': 'true' })
}

export function JsonBlock({ label, payload }) {
  return React.createElement('div', { 'data-json-block': true, 'data-label': label }, JSON.stringify(payload))
}

export function Tooltip({ label, children }) {
  return React.createElement('div', { 'data-tooltip': label }, children)
}

export function writeClipboard() {
  return Promise.resolve(true)
}
