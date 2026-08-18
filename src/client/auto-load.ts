/**
 * Auto-load-older on scroll-to-top.
 *
 * When the user scrolls the conversation to the very top while older history
 * exists (`hasMore`), the session's official `loadOlder()` action fires
 * automatically — no button click needed (the product's 加载更早 button
 * keeps working as a manual fallback). And while the user KEEPS resting at
 * the top, pages continue loading one after another until `hasMore` clears
 * or the user scrolls away: the pump simply recurses after each completed
 * load while the conditions stay met.
 *
 * Implementation notes:
 *  - The scroll host is found through the product's OWN documented contract:
 *    the ChatView's `scrollerOf` helper resolves the scrollport with
 *    `closest('[data-conversation-scroll]')` (ConversationRoot's scrollBody),
 *    and this module uses the same selector. This is a read-only structural
 *    lookup (no DOM modification, no node guessing).
 *  - `loadOlder` is reached through the sessions service's session scope
 *    (`sessions.scope(sessionId).get('conversation')`) — the exact path the
 *    product's `scopedConversation` uses; the plugin declares `sessions` in
 *    its inject list.
 *  - One pump per scroll host: seats of the same conversation register the
 *    same host (refcounted); `pumping` + the snapshot `loadingOlder` flag
 *    serialize the loads, and the module-level `inFlight` set is a global
 *    safety net.
 */

export interface ElementLike {
  closest?(selector: string): ScrollHostLike | null
}

export interface ScrollHostLike {
  scrollTop: number
  addEventListener(type: string, listener: () => void, options?: { passive?: boolean }): void
  removeEventListener(type: string, listener: () => void): void
}

export interface SessionsServiceLike {
  scope(id: string): { get(name: string): unknown } | undefined
}

interface HostEntry {
  sessionId: string
  hasMore: boolean
  loadingOlder: boolean
  owners: number
  detached: boolean
  /** The shared scroll listener (set by the creating attach call). */
  onScroll: (() => void) | null
  /** One page pull is in flight for this host. */
  pumping: boolean
}

let sessionsService: SessionsServiceLike | undefined
const attachedHosts = new Map<ScrollHostLike, HostEntry>()
const inFlight = new Set<string>()

export function setSessionsService(service: SessionsServiceLike | undefined): void {
  sessionsService = service
}

/** The scrollport the conversation scrolls in (product's own scrollerOf contract). */
const SCROLL_HOST_SELECTOR = '[data-conversation-scroll]'
/** Near-top tolerance in px. */
const TOP_THRESHOLD = 4

async function fireLoadOlder(sessionId: string): Promise<void> {
  const sessions = sessionsService
  if (sessions === undefined) return
  if (inFlight.has(sessionId)) return
  const scope = sessions.scope(sessionId)
  const conversation = scope === undefined ? undefined : (scope.get('conversation') as { loadOlder?: () => Promise<void> } | undefined)
  if (conversation === undefined || typeof conversation.loadOlder !== 'function') return
  inFlight.add(sessionId)
  try {
    await conversation.loadOlder()
  } catch {
    // A failed older-page pull degrades silently; the manual button remains.
  } finally {
    inFlight.delete(sessionId)
  }
}

/**
 * Register the auto-load watcher for one conversation seat. Callers pass the
 * seat's own element (the scroll host is resolved from it), the session id
 * and the current snapshot flags; returns a disposer. Multiple seats of the
 * same conversation share one listener (refcounted). Re-registration with
 * fresh snapshot flags refreshes the shared state.
 */
export function attachAutoLoad(anchor: ElementLike | null, sessionId: string, hasMore: boolean, loadingOlder: boolean): () => void {
  const host = anchor === null || anchor === undefined || typeof anchor.closest !== 'function' ? null : (anchor.closest(SCROLL_HOST_SELECTOR) ?? null)
  if (host === null) return () => {}

  const existing = attachedHosts.get(host)
  if (existing !== undefined) {
    existing.sessionId = sessionId
    existing.hasMore = hasMore
    existing.loadingOlder = loadingOlder
    existing.owners += 1
    // A re-attach with fresh flags: the snapshot just updated (loadingOlder
    // flipped, hasMore changed). If still at the top with more history, pump.
    if (!existing.pumping && host.scrollTop <= TOP_THRESHOLD && existing.hasMore && !existing.loadingOlder) {
      void pump(existing, host)
    }
    return () => {
      release(host, existing)
    }
  }

  const entry: HostEntry = {
    sessionId,
    hasMore,
    loadingOlder,
    owners: 1,
    detached: false,
    onScroll: null,
    pumping: false,
  }
  attachedHosts.set(host, entry)

  entry.onScroll = () => {
    if (host.scrollTop <= TOP_THRESHOLD) void pump(entry, host)
  }
  host.addEventListener('scroll', entry.onScroll, { passive: true })

  return () => {
    release(host, entry)
  }

  async function pump(current: HostEntry, target: ScrollHostLike): Promise<void> {
    if (current.pumping || current.detached) return
    if (target.scrollTop > TOP_THRESHOLD) return
    if (!current.hasMore || current.loadingOlder) return
    current.pumping = true
    try {
      await fireLoadOlder(current.sessionId)
    } finally {
      current.pumping = false
    }
    if (current.detached) return
    // While the user rests at the top and more history exists, keep loading.
    // The pump recurses directly — the `pumping` guard and the snapshot
    // flags (refreshed on re-attach) prevent over-fetching.
    if (target.scrollTop <= TOP_THRESHOLD && current.hasMore && !current.loadingOlder) {
      void pump(current, target)
    }
  }

  function release(target: ScrollHostLike, current: HostEntry): void {
    current.owners -= 1
    if (current.owners > 0 || current.detached) return
    current.detached = true
    attachedHosts.delete(target)
    if (current.onScroll !== null) target.removeEventListener('scroll', current.onScroll)
  }
}