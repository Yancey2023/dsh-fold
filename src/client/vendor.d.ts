/**
 * Minimal type declarations for the DSH packages this plugin imports.
 *
 * The REAL contracts live in the installed DSH (verified against 0.1.1-rc.2
 * AND 0.1.2-alpha.4; see README's "Seam and data model" section). These
 * shims keep the repo typecheckable without a full DSH checkout; the runtime
 * contract is enforced by the DSH page itself (fail-closed guards in
 * slots-core-overlay.ts). The snapshot/seam differences between the two
 * releases are handled in snapshot-face.ts (seat kit normalization) and
 * registry.ts (namespace fallback), never here.
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
  export const MessageText: FC<{ text: string }>
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
}
