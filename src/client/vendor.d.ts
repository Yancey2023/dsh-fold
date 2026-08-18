/**
 * Minimal type declarations for the DSH packages this plugin imports.
 *
 * The REAL contracts live in the installed DSH (verified against
 * 0.1.0-rc.7; see README's "Seam and data model" section). These shims keep
 * the repo typecheckable without a full DSH checkout; the runtime contract
 * is enforced by the DSH page itself (fail-closed guards in
 * slots-core-overlay.ts).
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
  import type { FC, SVGProps } from 'react'
  export const IconChevronRightOutline14: FC<SVGProps<SVGSVGElement> & { size?: number }>
  export const IconChevronDownOutline14: FC<SVGProps<SVGSVGElement> & { size?: number }>
}
