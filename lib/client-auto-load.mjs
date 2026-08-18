// src/client/auto-load.ts
var sessionsService;
var attachedHosts = /* @__PURE__ */ new Map();
var inFlight = /* @__PURE__ */ new Set();
function setSessionsService(service) {
  sessionsService = service;
}
var SCROLL_HOST_SELECTOR = "[data-conversation-scroll]";
var TOP_THRESHOLD = 4;
async function fireLoadOlder(sessionId) {
  const sessions = sessionsService;
  if (sessions === void 0) return;
  if (inFlight.has(sessionId)) return;
  const scope = sessions.scope(sessionId);
  const conversation = scope === void 0 ? void 0 : scope.get("conversation");
  if (conversation === void 0 || typeof conversation.loadOlder !== "function") return;
  inFlight.add(sessionId);
  try {
    await conversation.loadOlder();
  } catch {
  } finally {
    inFlight.delete(sessionId);
  }
}
function attachAutoLoad(anchor, sessionId, hasMore, loadingOlder) {
  const host = anchor === null || anchor === void 0 || typeof anchor.closest !== "function" ? null : anchor.closest(SCROLL_HOST_SELECTOR) ?? null;
  if (host === null) return () => {
  };
  const existing = attachedHosts.get(host);
  if (existing !== void 0) {
    existing.sessionId = sessionId;
    existing.hasMore = hasMore;
    existing.loadingOlder = loadingOlder;
    existing.owners += 1;
    return () => {
      release(host, existing);
    };
  }
  const entry = { sessionId, hasMore, loadingOlder, owners: 1, detached: false, onScroll: null };
  attachedHosts.set(host, entry);
  let atTop = false;
  entry.onScroll = () => {
    const nowAtTop = host.scrollTop <= TOP_THRESHOLD;
    const trigger = nowAtTop && !atTop && entry.hasMore && !entry.loadingOlder;
    atTop = nowAtTop;
    if (!trigger) return;
    void fireLoadOlder(entry.sessionId);
  };
  host.addEventListener("scroll", entry.onScroll, { passive: true });
  return () => {
    release(host, entry);
  };
  function release(target, current) {
    current.owners -= 1;
    if (current.owners > 0 || current.detached) return;
    current.detached = true;
    attachedHosts.delete(target);
    if (current.onScroll !== null) target.removeEventListener("scroll", current.onScroll);
  }
}
export {
  attachAutoLoad,
  setSessionsService
};
