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

export function MessageText({ text }) {
  return React.createElement('div', { 'data-message-text': true }, text)
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
