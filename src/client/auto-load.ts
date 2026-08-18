/**
 * Auto-load-older on scroll-to-top.
 *
 * A continuous check: while the user rests at the top and older history
 * exists (`hasMore`), the session's official `loadOlder()` action fires
 * automatically — no button click needed. A `setInterval` (every 100ms)
 * checks `scrollTop`, and the pump's guards (`pumping`, `hasMore`,
 * `loadingOlder`) prevent concurrent loads and over-fetching.
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
  /** Continuous check interval. */
  pendingTimer: ReturnType<typeof setInterval> | null
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
/** Continuous check interval (ms). */
const CHECK_INTERVAL_MS = 100

/** In Node.js (test runner) setInterval returns a Timeout object with an
 * `unref` method; in the browser it returns a plain number.  This helper
 * calls `unref` when available so the test runner isn't kept alive. */
function tryUnref(timer: ReturnType<typeof setInterval>): void {
  if (typeof timer === 'object' && timer !== null && 'unref' in (timer as object)) {
    ;(timer as { unref?(): void }).unref?.()
  }
}

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
    pendingTimer: null,
  }
  attachedHosts.set(host, entry)

  entry.onScroll = () => {
    if (host.scrollTop <= TOP_THRESHOLD) void pump(entry, host)
  }
  host.addEventListener('scroll', entry.onScroll, { passive: true })

  // Continuous check: while the user rests at the top or scrolls, the timer
  // fires the pump; the pump's guards prevent concurrent loads.
  entry.pendingTimer = setInterval(() => {
    if (host.scrollTop <= TOP_THRESHOLD) void pump(entry, host)
  }, CHECK_INTERVAL_MS)
  tryUnref(entry.pendingTimer)

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
  }

  function release(target: ScrollHostLike, current: HostEntry): void {
    current.owners -= 1
    if (current.owners > 0 || current.detached) return
    current.detached = true
    if (current.pendingTimer !== null) clearInterval(current.pendingTimer)
    current.pendingTimer = null
    attachedHosts.delete(target)
    if (current.onScroll !== null) target.removeEventListener('scroll', current.onScroll)
  }
}