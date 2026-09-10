/**
 * Minimal type declarations for the DSH packages this plugin imports.
 *
 * The REAL contracts live in the installed DSH (verified against the newest
 * npm channel releases: `alpha` → 0.1.5-alpha.2, `latest` → 0.1.5-rc.1,
 * `next` → 0.1.5-rc.2; see README's "Seam and data model" section). These
 * shims keep the repo typecheckable without a full
 * DSH checkout; the runtime contract is enforced by the DSH page itself
 * (fail-closed guards in slots-core-overlay.ts). The remaining per-channel
 * differences are handled in snapshot-face.ts (seat kit
 * normalization), registry.ts (namespace fallback) and UserNodeWrapper.tsx
 * (attachment / user-text kits), never here.
 */

declare module '@deepseek-ai/dsh-client-ui-slots' {
  export interface SlotSpec {
    kind: 'single' | 'list' | 'keyed' | 'chain'
    scope: 'root' | 'session-maybe' | 'session'
    inject?: unknown
  }
  export class SlotCore {
    records: Map<string, Record<string, unknown>>
    handleScopes: Map<unknown, { scope: string; count: number }>
    entries(key: string): readonly { options: { key?: string; priority?: number }; component: unknown }[]
    register(options: {
      name: string
      priority?: number
      key?: string
      id?: string
      order?: number
      label?: unknown
      children?: Record<string, SlotSpec>
      store?: unknown
      locale?: string
      registrant?: string
      select?: unknown
      inject?: unknown
    }, component: unknown): () => void
    releaseEntry(entry: unknown): void
    record(key: string): Record<string, unknown>
    markDirty(key: string, rec: Record<string, unknown>): void
    notifyDeclaration(rec: Record<string, unknown>): void
  }
}

declare module '@deepseek-ai/dsh-client-ui-primitives' {
  import type { FC, ReactNode, SVGProps } from 'react'
  export const IconChevronRightOutline14: FC<SVGProps<SVGSVGElement> & { size?: number }>
  export const IconChevronDownOutline14: FC<SVGProps<SVGSVGElement> & { size?: number }>
  export const IconChevronUpOutline14: FC<SVGProps<SVGSVGElement> & { size?: number }>
  export const IconThinkOutline14: FC<SVGProps<SVGSVGElement> & { size?: number }>
  export const IconCheckOutline16: FC<SVGProps<SVGSVGElement> & { size?: number }>
  export const IconCopyOutline16: FC<SVGProps<SVGSVGElement> & { size?: number }>
  export const IconApiOutline14: FC<SVGProps<SVGSVGElement> & { size?: number }>
  export const IconQuestionOutline14: FC<SVGProps<SVGSVGElement> & { size?: number }>
  /**
   * Display projection of reference forms in sent user text (the OFFICIAL
   * primitive, exported by every supported release).
   *
   * Signature: `(text, sessionLabels, slashNames?, slashKind?)` — the plugin
   * always calls the 4-arg form; older rc hosts ignore the trailing
   * arguments (every `/name`/`@name` token decorates), the 0.1.5 channel
   * gates `/name` tokens on `slashNames` exactly like the host product.
   */
  export function projectUserText(
    text: string,
    sessionLabels?: readonly string[],
    slashNames?: readonly string[],
    slashKind?: 'skill' | 'command',
  ): ReactNode
  /** Compact byte text (`312B`, `4.2KB`, …). */
  export function fileSizeText(bytes: number): string
  /**
   * Decorative file-type glyph for generic-file cards (0.1.5 add; replaces
   * the 0.1.3-era `DocumentFileIcon`, which 0.1.5 removed). The product's
   * own file card passes the file path so the glyph is classified from it.
   */
  export const FileTypeIcon: FC<{ path: string; className?: string; size?: number }>
  /** Final suffix of a file path without changing its case (0.1.5 add). */
  export function fileExtension(path: string): string
  export const DisclosureRow: FC<{
    icon?: ReactNode
    title?: ReactNode
    open?: boolean
    expandable?: boolean
    onToggle?: () => void
    expandOnRowClick?: boolean
    previewChevron?: boolean
    keepContentWhenOpen?: boolean
    collapsedContent?: ReactNode
    children?: ReactNode
    className?: string
    rowClassName?: string
    leadingClassName?: string
    chevronClassName?: string
    titleClassName?: string
  }>
  export const JsonBlock: FC<{
    label: string
    payload: unknown
    defaultOpen?: boolean
    truncatedLabel?: (total: number) => string
  }>
  export const Tooltip: FC<{
    label: string | (() => string)
    side?: 'right' | 'bottom' | 'top'
    delayMs?: number
    disabled?: boolean
    maxWidth?: number
    children?: ReactNode
  }>
  export function writeClipboard(text: string): Promise<boolean>
}

declare module '@deepseek-ai/dsh-client-ui-attachment' {
  import type { FC } from 'react'
  import type { ImageAttachmentRef } from '@deepseek-ai/dsh-attachment'
  export interface ImageLightboxLabels {
    dialog: string
    close: string
  }
  export interface MessageImageLabels {
    image: string
    open: string
    openNamed: (label: string) => string
    loading: string
    loadFailed: string
    lightbox: ImageLightboxLabels
  }
  export const ImageGallery: FC<{
    images: readonly { attachment: ImageAttachmentRef }[]
    load: (attachment: ImageAttachmentRef) => Promise<string>
    align: 'start' | 'end'
    labels: MessageImageLabels
  }>
}

declare module '@deepseek-ai/dsh-attachment' {
  /** Durable image reference (minimal structural mirror; passed through only). */
  export interface ImageAttachmentRef {
    id: string
    url?: string
    name?: string
  }
  /** Durable verbatim-file reference (passed through only). */
  export interface FileAttachmentRef {
    attachmentId: string
    name: string
    bytes: number
  }
}
