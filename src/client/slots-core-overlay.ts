/**
 * Minimal, reversible accommodation for the "shadow and delegate" pattern.
 *
 * Problem (verified against DSH 0.1.0-rc.7 sources AND the shipped web
 * bundle): the keyed Chat slot `conversation.chat.node` supports cell
 * shadowing by priority (lowest wins), but `SlotCore.register` forbids a
 * second entry from declaring `children` for a slot that is already declared
 * — and without that children table the shadowing entry receives no
 * `renderSlot` binding, so it cannot delegate rendering to the official
 * `tool.call.toolview` slot. Additionally, `releaseEntry` wipes a child
 * slot's spec AND every occupant when the declaring entry is disposed, so
 * naive re-declaration would break the product's tool views on unload.
 *
 * This overlay makes child-slot declarations SHARED when the incoming spec is
 * structurally identical to the live one, using THIN WRAPPERS around the
 * live methods (no re-emission, no method-text dependency — works against
 * both the minified browser bundle and the published package):
 *
 *   - register(): identical child specs are stripped from the children table
 *     handed to the original method (so its exclusive-declaration check
 *     passes), the original creates the entry (found by reference-diffing
 *     the parent record's entries list), and the co-declared keys are
 *     restored on the created entry's own children table (render
 *     authorization). The record's spec/epoch stay with the original
 *     declarer, so product `slots.inject` watchers are not disturbed.
 *   - releaseEntry(): a co-declaring entry's disposal only drops its own
 *     ownership (the co-declared keys are temporarily removed from the
 *     entry's children table so the original teardown skips them); the
 *     child slot is torn down exactly once, by its spec owner (an entry
 *     never tracked as a co-owner — the original declarer or a later
 *     normal declarer).
 *
 * If the entry cannot be located after register (a structural change in a
 * future SlotCore), the wrapper fails closed: the registration throws and
 * the plugin stays inert while the official UI keeps rendering.
 *
 * This is the exact change of `docs/core-patch.md` (a source-level patch for
 * the same two methods), delivered as a runtime overlay so the plugin works
 * on unmodified DSH installs. The overlay is restored on dispose.
 */

/** Structural equality for slot-spec shapes ({kind, scope, inject}). */
function sameSpec(left: unknown, right: unknown): boolean {
  if (left === right) return true
  if (typeof left !== 'object' || typeof right !== 'object' || left === null || right === null) return false
  const a = left as Record<string, unknown>
  const b = right as Record<string, unknown>
  const ka = Object.keys(a)
  const kb = Object.keys(b)
  if (ka.length !== kb.length) return false
  return ka.every((key) => a[key] === b[key])
}

export interface SlotCoreLike {
  prototype: {
    register: (...args: any[]) => unknown
    releaseEntry: (entry: unknown) => void
  }
}

type ChildSpec = { kind?: string; scope?: string; inject?: unknown }

type RegisterOptions = {
  name: string
  priority?: number
  key?: string
  id?: string
  children?: Record<string, ChildSpec>
}

type EntryLike = {
  options?: Record<string, unknown>
  children?: Record<string, ChildSpec>
  store?: unknown
}

/** A core instance surface: only what the wrappers touch. */
type CoreLike = {
  records: Map<string, Record<string, unknown>>
}

/**
 * Install the shared-declaration overlay on the live SlotCore prototype.
 * @param SlotCore - the `@deepseek-ai/dsh-client-ui-slots` module's SlotCore class.
 * @returns a disposer that restores the original methods.
 */
export function installSlotCoreOverlay(SlotCore: SlotCoreLike): () => void {
  const originalRegister = SlotCore.prototype.register
  const originalRelease = SlotCore.prototype.releaseEntry
  if (typeof originalRegister !== 'function' || typeof originalRelease !== 'function') {
    throw new Error('dsh-fold: SlotCore.register/releaseEntry are not functions; refusing to install the overlay (plugin stays inert)')
  }

  /** child slot key -> Set<entry> of co-owners (side table; records stay pristine). */
  const coOwners = new Map<string, Set<unknown>>()

  const wrappedRegister = function (this: CoreLike, options: RegisterOptions, component: unknown): () => void {
    let coSpecs: Record<string, ChildSpec> | null = null
    let forwarded = options
    if (options?.children) {
      for (const childKey of Object.keys(options.children)) {
        const childRec = this.records.get(childKey)
        if (childRec === undefined) continue
        const existing = childRec.spec as ChildSpec | undefined
        if (existing === undefined) continue
        if (!sameSpec(existing, options.children[childKey])) {
          // Non-identical: let the original raise its exclusive-declaration error.
          return originalRegister.call(this, options, component) as () => void
        }
        // Identical: strip for the original, restore on the created entry.
        if (coSpecs === null) coSpecs = {}
        coSpecs[childKey] = options.children[childKey]
      }
      if (coSpecs !== null) {
        const rest = { ...options.children }
        for (const key of Object.keys(coSpecs)) delete rest[key]
        forwarded = Object.keys(rest).length > 0 ? { ...options, children: rest } : { ...options, children: undefined }
      }
    }
    const rec = this.records.get(options.name)
    const before = rec?.entries
    const dispose = originalRegister.call(this, forwarded, component) as () => void
    if (coSpecs === null) return dispose
    // Locate the created entry: the original pushes exactly one new entry.
    const after = this.records.get(options.name)?.entries
    const created = Array.isArray(after)
      ? after.find((e: unknown) => !Array.isArray(before) || !(before as unknown[]).includes(e))
      : undefined
    if (created === undefined) {
      // Fail closed: undo and refuse (plugin fiber teardown disposes the half registration).
      dispose()
      throw new Error('dsh-fold: could not locate the entry created by SlotCore.register; refusing the shadow (official UI keeps rendering)')
    }
    const entry = created as EntryLike
    // Restore render authorization for the co-declared child slots.
    entry.children = { ...(entry.children ?? {}), ...coSpecs }
    for (const childKey of Object.keys(coSpecs)) {
      let owners = coOwners.get(childKey)
      if (owners === undefined) {
        owners = new Set()
        coOwners.set(childKey, owners)
      }
      owners.add(entry)
    }
    return dispose
  }

  const wrappedRelease = function (this: CoreLike, entry: EntryLike): void {
    if (!entry.children) {
      originalRelease.call(this, entry)
      return
    }
    // Drop this entry's co-ownership; only the SPEC OWNER tears the slot down.
    let stripped: Record<string, ChildSpec> | null = null
    for (const childKey of Object.keys(entry.children)) {
      const owners = coOwners.get(childKey)
      if (owners !== undefined && owners.has(entry)) {
        owners.delete(entry)
        if (owners.size === 0) coOwners.delete(childKey)
        if (stripped === null) stripped = { ...entry.children }
        delete stripped[childKey]
      }
    }
    if (stripped === null) {
      originalRelease.call(this, entry)
      return
    }
    const pristine = entry.children
    entry.children = Object.keys(stripped).length > 0 ? stripped : undefined
    try {
      originalRelease.call(this, entry)
    } finally {
      entry.children = pristine
    }
  }

  SlotCore.prototype.register = wrappedRegister as typeof originalRegister
  SlotCore.prototype.releaseEntry = wrappedRelease as typeof originalRelease

  return () => {
    if (SlotCore.prototype.register === wrappedRegister) SlotCore.prototype.register = originalRegister
    if (SlotCore.prototype.releaseEntry === wrappedRelease) SlotCore.prototype.releaseEntry = originalRelease
  }
}
