/**
 * UserNodeWrapper — the shadowing renderer for `conversation.chat.node` cell
 * `user` (and `steering`, which shares the product's user view).
 *
 * Long user input is FOLDED to 3 lines with an expand/collapse toggle
 * ("展开" / "收起"). The bubble is REPLICATED with official primitives —
 * projectUserText, JsonBlock, the attachment/ImageGallery pieces, Tooltip,
 * writeClipboard and the icon set — instead of delegating to the official
 * UserMessageNodeView, because Chromium's `-webkit-line-clamp` does NOT clamp
 * content inside a nested flex container: the official row is `display:flex`,
 * so wrapping the delegated view in a clamped box leaves the full text
 * visible (verified empirically in headless Chromium). Clamping our OWN
 * bubble — plain block children plus inline ref chips — clamps exactly to 3
 * lines.
 *
 * Everything else mirrors the product's UserStyleBubble per release
 * (row/stack/bubble geometry, bubble colors, ref chips, time + copy actions,
 * attachment row): same CSS values, same keys in the live cell namespace.
 * The only additions are the `data-clamped` class on the bubble and the fold
 * toggle, which is hidden (CSS) unless the text actually overflows 3 lines.
 * Copy uses the official writeClipboard primitive.
 *
 * Release seams (sealed here, verified against 0.1.2-rc.1 AND 0.1.3-alpha.2):
 *
 *  - Text decoration uses the OFFICIAL `projectUserText` primitive. Its
 *    signature grew between releases — rc: `(text, sessionLabels)`, alpha:
 *    `(text, sessionLabels, slashNames, slashKind)` — so this wrapper always
 *    forwards `referenceLabels` / `skillNames` from the node data. On an rc
 *    host the extra arguments are ignored (every `/name` and `@name` token
 *    decorates, the rc product behavior); on an alpha host `/name` tokens
 *    decorate only when the step's `skill-invocation` injections loaded that
 *    skill (the alpha product behavior). Both releases render plain runs as
 *    inline spans, so the 3-line clamp keeps working.
 *  - Image rendering: rc seats receive only `renderMessageImages` — one call
 *    with the whole image list. Alpha seats additionally receive `loadImage`
 *    (`typeof loadImage === 'function'` is the alpha marker) and the product
 *    renders an attachment row with one call per image (`compact` when more
 *    than one) plus generic-file cards (`file` content blocks are a
 *    ​0.1.3-alpha.2 addition). DocumentFileIcon / fileSizeText exist only on
 *    alpha hosts; they are only touched on that path and guarded by typeof.
 */

import * as React from 'react'
import {
  DocumentFileIcon,
  fileSizeText,
  IconCheckOutline16,
  IconChevronDownOutline14,
  IconChevronUpOutline14,
  IconCopyOutline16,
  JsonBlock,
  projectUserText,
  Tooltip,
  writeClipboard,
} from '@deepseek-ai/dsh-client-ui-primitives'
import { ImageGallery } from '@deepseek-ai/dsh-client-ui-attachment'
import type { MessageImageLabels } from '@deepseek-ai/dsh-client-ui-attachment'
import type { ImageAttachmentRef } from '@deepseek-ai/dsh-attachment'
import { getGroupT } from './translate'
import { AutoLoadHost } from './AutoLoadHost'
import { compositeT, getChatT, setConversationT } from './registry'
import { useSnapshotFace } from './snapshot-face'
import type { SelectorHook } from './snapshot-face'

/** One image source the renderMessageImages owner accepts (attachment arm). */
export type MessageImageSourceLike =
  | { readonly attachment: ImageAttachmentRef }
  | { readonly preview: { readonly url: string; readonly name?: string; readonly width?: number; readonly height?: number } }

/** Generic-file attachment as delivered by the host session (alpha 0.1.3+). */
export type UserFileAttachmentLike = {
  readonly attachmentId: string
  readonly name: string
  readonly bytes: number
}

/** One parsed user attachment in product order (alpha 0.1.3 content shape). */
export type UserAttachmentLike =
  | { readonly type: 'image'; readonly image: { readonly attachment: ImageAttachmentRef } }
  | { readonly type: 'file'; readonly file: UserFileAttachmentLike }

/** The slot-backed image-gallery renderer owner (rc- and alpha-era kits). */
export type RenderMessageImages = (owner: {
  images: readonly MessageImageSourceLike[]
  align: string
  /** Alpha 0.1.3+ owner: force compact tiles when the row holds >1 attachment. */
  compact?: boolean
}) => React.ReactNode

export interface UserNodeWrapperProps {
  /** The user node owned by this seat. */
  node: {
    key: string
    data?: {
      content?: unknown
      time?: number
      /** Exact session labels cited by an adjacent recall (both releases). */
      referenceLabels?: readonly string[]
      /** Skill names the step's `skill-invocation` injections loaded (alpha). */
      skillNames?: readonly string[]
    }
  }
  /** Session-authorized image URL loader (alpha 0.1.3+ owner kit). */
  loadImage?: (attachment: ImageAttachmentRef) => Promise<string>
  /** Render the image gallery through the product's slot (both releases). */
  renderMessageImages?: RenderMessageImages
  /** Conversation-namespace translate (entry locale `conversation`). */
  t?: (key: string, params?: Record<string, unknown>) => string
  /** Session id (big-fold state is keyed per session; auto-load scope). */
  sessionId?: string
  /** Framework session selector hook (window flags; on rc also the chat). */
  useSession?: SelectorHook
  /** Chat-target selector hook (alpha 0.1.2+; absent on rc). */
  useChat?: SelectorHook
  /** Everything else the renderer passed (unused, but must be accepted). */
  [key: string]: unknown
}

type Translate = (key: string, params?: Record<string, unknown>) => string

const NOOP_T: Translate = (key, params) => (params !== undefined && 'count' in params ? String(params.count) : key)

/**
 * Parse a user content block list exactly like the release's contentParts:
 * rc collects text + images; alpha 0.1.3 collects text + attachments
 * (images AND generic files) + rest. The rc-style `images` list is derived
 * for the rc-era single-gallery call and the ImageGallery fallback.
 */
function contentParts(content: readonly unknown[]): {
  text: string
  attachments: UserAttachmentLike[]
  images: Array<{ attachment: ImageAttachmentRef }>
  rest: unknown[]
} {
  const texts: string[] = []
  const attachments: UserAttachmentLike[] = []
  const rest: unknown[] = []
  for (const raw of content) {
    if (raw === null || typeof raw !== 'object') {
      rest.push(raw)
      continue
    }
    const block = raw as { type?: string; text?: unknown; attachment?: unknown }
    if (block.type === 'text' && typeof block.text === 'string') texts.push(block.text)
    else if (block.type === 'image' && block.attachment !== undefined) attachments.push({ type: 'image', image: { attachment: block.attachment as ImageAttachmentRef } })
    else if (block.type === 'file' && block.attachment !== undefined) attachments.push({ type: 'file', file: block.attachment as UserFileAttachmentLike })
    else rest.push(raw)
  }
  const images = attachments.filter((a): a is { type: 'image'; image: { attachment: ImageAttachmentRef } } => a.type === 'image').map((a) => a.image)
  return { text: texts.join(''), attachments, images, rest }
}

/** Uppercased extension for the generic-file card meta (product derivation). */
function extensionOf(name: string): string {
  const dot = name.lastIndexOf('.')
  if (dot <= 0 || dot === name.length - 1) return ''
  return name.slice(dot + 1).toUpperCase().slice(0, 8)
}

/** Compact byte text; uses the official alpha primitive when present. */
function fileSizeTextLocal(bytes: number): string {
  if (bytes < 1024) return `${bytes}B`
  const kb = bytes / 1024
  if (kb < 1024) return `${kb < 10 ? kb.toFixed(1) : Math.round(kb)}KB`
  const mb = kb / 1024
  if (mb < 1024) return `${mb < 10 ? mb.toFixed(1) : Math.round(mb)}MB`
  const gb = mb / 1024
  return `${gb < 10 ? gb.toFixed(1) : Math.round(gb)}GB`
}

function fileSize(bytes: number): string {
  return typeof fileSizeText === 'function' ? fileSizeText(bytes) : fileSizeTextLocal(bytes)
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

/** One generic-file card (alpha attachment row). The official alpha-only
 * DocumentFileIcon / fileSizeText primitives are used when present; rc hosts
 * never take this path (no `file` blocks exist in rc session data). */
function FileCard({ file }: { file: UserFileAttachmentLike }): React.ReactElement {
  const meta = [extensionOf(file.name), fileSize(file.bytes)].filter(Boolean).join(' ')
  return React.createElement(
    'span',
    { className: 'dshUserFileCard', title: file.name },
    typeof DocumentFileIcon === 'function' ? React.createElement(DocumentFileIcon, { className: 'dshUserFileIcon' }) : null,
    React.createElement(
      'span',
      { className: 'dshUserFileContent' },
      React.createElement('span', { className: 'dshUserFileName' }, file.name),
      meta !== '' ? React.createElement('span', { className: 'dshUserFileMeta' }, meta) : null,
    ),
  )
}

/** The user seat: product bubble replica + 3-line clamp + fold toggle. */
export const UserNodeWrapper = React.memo(function UserNodeWrapper(props: UserNodeWrapperProps): React.ReactElement | null {
  const { node, loadImage, renderMessageImages, t, sessionId } = props
  const seatT = typeof t === 'function' ? t : undefined
  // The user seat binds the CONVERSATION namespace (product keys). On alpha
  // the cell dictionary moved to `chat` — the composite resolves chat-first
  // (clock/json/message keys) and conversation-second (image labels).
  const translate = compositeT(getChatT(), seatT)
  setConversationT(translate)
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
  const { hasMore, loadingOlder } = useSnapshotFace(props)

  const data = (node.data ?? {}) as { content?: unknown; time?: number; referenceLabels?: readonly string[]; skillNames?: readonly string[] }
  const rawContent = data.content
  const content = Array.isArray(rawContent) ? rawContent : typeof rawContent === 'string' ? [{ type: 'text', text: rawContent }] : []
  const { text, attachments, images, rest } = contentParts(content)
  // Alpha seats receive `loadImage` on their owner kit; rc seats do not. On
  // the rc-era path a `file` block (a 0.1.3 content shape the rc data model
  // cannot produce) still surfaces as a JsonBlock extra instead of dropping.
  const alphaKit = typeof loadImage === 'function'
  const extraRest = alphaKit ? rest : [...rest, ...attachments.filter((a): a is { type: 'file'; file: UserFileAttachmentLike } => a.type === 'file')]
  const showBubble = text !== '' || extraRest.length > 0
  const toolT = getGroupT() ?? translate
  const labels = imageLabels(translate)
  const showToggle = expanded || overflowing

  const renderAttachments = (): React.ReactNode => {
    if (attachments.length === 0) return null
    if (typeof renderMessageImages === 'function') {
      if (!alphaKit) {
        // rc-era owner: one gallery call with the whole image list.
        return renderMessageImages({ images, align: 'end' })
      }
      // alpha 0.1.3 owner: one call per image (compact when the attachment
      // row holds more than one), plus generic-file cards interleaved.
      const compact = attachments.length > 1
      return React.createElement(
        'div',
        { className: 'dshUserAttachmentRow', 'data-message-attachments': '' },
        attachments.map((attachment, index) =>
          attachment.type === 'image'
            ? React.createElement(React.Fragment, { key: `image:${index}` }, renderMessageImages({ images: [attachment.image], align: 'end', compact }))
            : React.createElement(FileCard, { key: `file:${index}`, file: attachment.file }),
        ),
      )
    }
    // No slot-backed gallery (older hosts / tests): direct ImageGallery.
    return React.createElement(ImageGallery, {
      images,
      load: loadImage ?? (() => Promise.reject(new Error('image loader unavailable'))),
      align: 'end',
      labels,
    })
  }

  const output = React.createElement(
    'div',
    { className: 'dshUserRow', 'data-time-hover-root': '' },
    React.createElement(
      'div',
      { className: 'dshUserStack' },
      renderAttachments(),
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
              text !== ''
                ? projectUserText(text, data.referenceLabels ?? [], data.skillNames ?? [], 'skill')
                : null,
              ...extraRest.map((block, index) =>
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