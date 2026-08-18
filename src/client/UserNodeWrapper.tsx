/**
 * UserNodeWrapper — the shadowing renderer for `conversation.chat.node` cell
 * `user`.
 *
 * Long user input is FOLDED to 3 lines with an expand/collapse toggle
 * ("展开" / "收起"). The bubble is REPLICATED with official primitives —
 * MessageText, JsonBlock, ImageGallery, Tooltip, writeClipboard and the icon
 * set — instead of delegating to the official UserMessageNodeView, because
 * Chromium's `-webkit-line-clamp` does NOT clamp content inside a nested flex
 * container: the official row is `display:flex`, so wrapping the delegated
 * view in a clamped box leaves the full text visible (verified empirically in
 * headless Chromium). Clamping our OWN bubble — plain block children
 * (MessageText divs) plus inline ref chips — clamps exactly to 3 lines.
 *
 * Everything else mirrors the product's UserStyleBubble pixel-for-pixel
 * (row/stack/bubble geometry, bubble colors, ref chips, time + copy actions,
 * image gallery): same CSS values, same keys in the conversation namespace.
 * The only additions are the `data-clamped` class on the bubble and the
 * fold toggle, which is hidden (CSS) unless the text actually overflows 3
 * lines. Copy uses the official writeClipboard primitive.
 */

import * as React from 'react'
import {
  IconCheckOutline16,
  IconChevronDownOutline14,
  IconChevronUpOutline14,
  IconCopyOutline16,
  JsonBlock,
  MessageText,
  Tooltip,
  writeClipboard,
} from '@deepseek-ai/dsh-client-ui-primitives'
import { ImageGallery } from '@deepseek-ai/dsh-client-ui-attachment'
import type { MessageImageLabels } from '@deepseek-ai/dsh-client-ui-attachment'
import type { ImageAttachmentRef } from '@deepseek-ai/dsh-attachment'
import { getGroupT } from './translate'
import { AutoLoadHost } from './AutoLoadHost'
import { setConversationT } from './registry'

export interface UserNodeWrapperProps {
  /** The user node owned by this seat. */
  node: {
    key: string
    data?: { content?: unknown; time?: number }
  }
  /** Session-authorized image URL loader (owner kit). */
  loadImage?: (attachment: ImageAttachmentRef) => Promise<string>
  /** Conversation-namespace translate (entry locale `conversation`). */
  t?: (key: string, params?: Record<string, unknown>) => string
  /** Session id (big-fold state is keyed per session; auto-load scope). */
  sessionId?: string
  /** Framework session selector hook. */
  useSession: <S>(sel: (snapshot: { hasMore?: boolean; loadingOlder?: boolean }) => S, eq?: (a: S, b: S) => boolean) => S
  /** Everything else the renderer passed (unused, but must be accepted). */
  [key: string]: unknown
}

type Translate = (key: string, params?: Record<string, unknown>) => string

const NOOP_T: Translate = (key, params) => (params !== undefined && 'count' in params ? String(params.count) : key)

/** Parse a user content block list exactly like the product's contentParts. */
function contentParts(content: readonly unknown[]): {
  text: string
  images: Array<{ attachment: ImageAttachmentRef }>
  rest: unknown[]
} {
  const texts: string[] = []
  const images: Array<{ attachment: ImageAttachmentRef }> = []
  const rest: unknown[] = []
  for (const raw of content) {
    if (raw === null || typeof raw !== 'object') {
      rest.push(raw)
      continue
    }
    const block = raw as { type?: string; text?: unknown; attachment?: unknown }
    if (block.type === 'text' && typeof block.text === 'string') texts.push(block.text)
    else if (block.type === 'image' && block.attachment !== undefined) images.push({ attachment: block.attachment as ImageAttachmentRef })
    else rest.push(raw)
  }
  return { text: texts.join(''), images, rest }
}

/** Plain-text `/name` / `@name` tokens decorate like the product's
 * projectUserText (the sent text IS the reference — presentation only). */
const REF_TOKEN = /(^|\s)([/@][\w-]+)(?=\s|$)/g

function projectUserText(text: string): React.ReactNode {
  const parts: React.ReactNode[] = []
  let cursor = 0
  let match: RegExpExecArray | null
  REF_TOKEN.lastIndex = 0
  while ((match = REF_TOKEN.exec(text)) !== null) {
    const tokenStart = match.index + (match[1]?.length ?? 0)
    const label = match[2] ?? ''
    if (tokenStart > cursor) {
      parts.push(React.createElement(MessageText, { key: `t${cursor}`, text: text.slice(cursor, tokenStart) }))
    }
    parts.push(
      React.createElement(
        'span',
        { key: `r${tokenStart}`, className: 'dshUserRefChip', 'data-ref-chip': label.startsWith('@') ? 'subagent' : 'skill' },
        label,
      ),
    )
    cursor = tokenStart + label.length
  }
  if (parts.length === 0) return React.createElement(MessageText, { text })
  if (cursor < text.length) parts.push(React.createElement(MessageText, { key: `t${cursor}`, text: text.slice(cursor) }))
  return React.createElement(React.Fragment, null, parts)
}

/** Image labels resolved from the conversation namespace (product contract). */
function imageLabels(t: Translate): MessageImageLabels {
  return {
    image: t('image.label'),
    open: t('image.openOriginal'),
    openNamed: (label) => t('image.openOriginalLabel', { label }),
    loading: t('image.loading'),
    loadFailed: t('image.loadFailed'),
    lightbox: { dialog: t('image.preview'), close: t('image.closePreview') },
  }
}

function pad2(value: number): string {
  return value < 10 ? `0${value}` : String(value)
}

/** Message clock: HH:MM, prefixed with a date for non-today messages. */
function formatClock(time: number, t: Translate): string {
  const d = new Date(time)
  const now = new Date()
  const clock = `${pad2(d.getHours())}:${pad2(d.getMinutes())}`
  if (d.getFullYear() === now.getFullYear() && d.getMonth() === now.getMonth() && d.getDate() === now.getDate()) return clock
  const params = { y: d.getFullYear(), m: d.getMonth() + 1, d: d.getDate() }
  return `${d.getFullYear() === now.getFullYear() ? t('clock.md', params) : t('clock.ymd', params)} ${clock}`
}

/** The product's copy button (Tooltip + writeClipboard + check feedback). */
function CopyAction({ text, t }: { text: string; t: Translate }): React.ReactElement {
  const [copied, setCopied] = React.useState(false)
  const timer = React.useRef<number | null>(null)
  React.useEffect(
    () => () => {
      if (timer.current !== null) clearTimeout(timer.current)
    },
    [],
  )
  const onCopy = () => {
    if (copied) return
    void writeClipboard(text).then((ok) => {
      if (!ok) return
      setCopied(true)
      timer.current = setTimeout(() => setCopied(false), 1000)
    })
  }
  return React.createElement(
    Tooltip,
    { label: copied ? t('copied') : t('copy'), side: 'bottom' },
    React.createElement(
      'button',
      { type: 'button', className: 'dshUserAction', 'aria-label': copied ? t('copied') : t('copy'), onClick: onCopy },
      copied ? React.createElement(IconCheckOutline16, null) : React.createElement(IconCopyOutline16, null),
    ),
  )
}

/** The user seat: product bubble replica + 3-line clamp + fold toggle. */
export const UserNodeWrapper = React.memo(function UserNodeWrapper(props: UserNodeWrapperProps): React.ReactElement | null {
  const { node, loadImage, t, sessionId, useSession } = props
  // The user seat binds the CONVERSATION namespace (product keys).
  setConversationT(typeof t === 'function' ? t : undefined)
  // ALL hooks unconditional (React rules; a path-dependent hook order
  // crashes with "Rendered fewer hooks than expected").
  const [expanded, setExpanded] = React.useState(false)
  const clampRef = React.useRef<HTMLDivElement | null>(null)
  const [overflowing, setOverflowing] = React.useState(false)
  React.useEffect(() => {
    const el = clampRef.current
    if (el === null) return
    // scrollHeight > clientHeight while the clamp is applied means the text
    // exceeds 3 lines (verified in Chromium: clamped clientHeight is exactly
    // 3 lines; scrollHeight reports the full content).
    const update = () => setOverflowing(el.scrollHeight > el.clientHeight + 1)
    update()
    if (typeof ResizeObserver === 'undefined') return
    const observer = new ResizeObserver(update)
    observer.observe(el)
    return () => observer.disconnect()
  }, [expanded])
  const toggle = React.useCallback(() => setExpanded((value) => !value), [])
  const hasMore = typeof useSession === 'function' ? useSession((snapshot) => snapshot.hasMore === true) : false
  const loadingOlder = typeof useSession === 'function' ? useSession((snapshot) => snapshot.loadingOlder === true) : false

  const data = (node.data ?? {}) as { content?: unknown; time?: number }
  const rawContent = data.content
  const content = Array.isArray(rawContent) ? rawContent : typeof rawContent === 'string' ? [{ type: 'text', text: rawContent }] : []
  const { text, images, rest } = contentParts(content)
  const showBubble = text !== '' || rest.length > 0
  const translate = t ?? NOOP_T
  const toolT = getGroupT() ?? translate
  const labels = imageLabels(translate)
  const showToggle = expanded || overflowing

  const output = React.createElement(
    'div',
    { className: 'dshUserRow', 'data-time-hover-root': '' },
    React.createElement(
      'div',
      { className: 'dshUserStack' },
      images.length > 0
        ? React.createElement(ImageGallery, {
            images,
            load: loadImage ?? (() => Promise.reject(new Error('image loader unavailable'))),
            align: 'end',
            labels,
          })
        : null,
      showBubble
        ? React.createElement(
            'div',
            { className: 'dshUserBubble' },
            // The clamp lives on a PADDING-FREE inner box: browsers that cut
            // the clamp height short of the bottom padding (legacy line-clamp
            // behavior) can still never show a partial 4th line or eat the
            // bubble's bottom gap — max-height:72px is exactly 3 × 24px.
            React.createElement(
              'div',
              { ref: clampRef, className: 'dshUserBubbleClamp', 'data-clamped': expanded ? undefined : '' },
              text !== '' ? projectUserText(text) : null,
              ...rest.map((block, index) =>
                React.createElement(JsonBlock, {
                  key: `extra${index}`,
                  label: translate('message.extraBlock'),
                  payload: block,
                  truncatedLabel: (total: number) => translate('json.truncated', { total }),
                }),
              ),
            ),
          )
        : null,
      showBubble
        ? React.createElement(
            'button',
            {
              type: 'button',
              className: 'dshUserFoldToggle',
              'data-shown': showToggle ? '' : undefined,
              'aria-expanded': expanded,
              // A native button: Enter/Space activate through onClick — no
              // manual onKeyDown (that would double-toggle).
              onClick: toggle,
            },
            React.createElement(expanded ? IconChevronUpOutline14 : IconChevronDownOutline14, { size: 14 }),
            toolT(expanded ? 'collapse' : 'expand'),
          )
        : null,
    ),
    React.createElement(
      'div',
      { className: 'dshUserActions' },
      data.time !== undefined ? React.createElement('span', { key: 'time', className: 'dshUserTime' }, formatClock(data.time, translate)) : null,
      React.createElement(CopyAction, { key: 'copy', text, t: translate }),
    ),
  )
  return React.createElement(AutoLoadHost, { sessionId, hasMore, loadingOlder }, output)
})
