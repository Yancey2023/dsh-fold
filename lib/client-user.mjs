// src/client/UserNodeWrapper.tsx
import * as React4 from "react";

// test/stubs/primitives.mjs
import React from "react";
function Icon({ size = 14, className }) {
  return React.createElement("svg", { width: size, height: size, className, "data-icon": "true" });
}
var IconChevronDownOutline14 = Icon;
var IconChevronUpOutline14 = Icon;
var IconCopyOutline16 = Icon;
var IconCheckOutline16 = Icon;
function MessageText({ text }) {
  return React.createElement("div", { "data-message-text": true }, text);
}
function JsonBlock({ label, payload }) {
  return React.createElement("div", { "data-json-block": true, "data-label": label }, JSON.stringify(payload));
}
function Tooltip({ label, children }) {
  return React.createElement("div", { "data-tooltip": label }, children);
}
function writeClipboard() {
  return Promise.resolve(true);
}

// test/stubs/attachment.mjs
import React2 from "react";
function ImageGallery({ images, align, labels }) {
  return React2.createElement(
    "div",
    { "data-image-gallery": true, "data-align": align, "data-image-label": labels ? labels.image : void 0, "data-count": images.length },
    images.map((image, index) => React2.createElement("span", { key: index, "data-attachment": true }))
  );
}

// src/client/translate.ts
var groupT;
function getGroupT() {
  return groupT;
}

// src/client/AutoLoadHost.tsx
import * as React3 from "react";

// src/client/auto-load.ts
var sessionsService;
var attachedHosts = /* @__PURE__ */ new Map();
var inFlight = /* @__PURE__ */ new Set();
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
    if (!existing.pumping && host.scrollTop <= TOP_THRESHOLD && existing.hasMore && !existing.loadingOlder) {
      void pump(existing, host);
    }
    return () => {
      release(host, existing);
    };
  }
  const entry = {
    sessionId,
    hasMore,
    loadingOlder,
    owners: 1,
    detached: false,
    onScroll: null,
    pumping: false
  };
  attachedHosts.set(host, entry);
  entry.onScroll = () => {
    if (host.scrollTop <= TOP_THRESHOLD) void pump(entry, host);
  };
  host.addEventListener("scroll", entry.onScroll, { passive: true });
  return () => {
    release(host, entry);
  };
  async function pump(current, target) {
    if (current.pumping || current.detached) return;
    if (target.scrollTop > TOP_THRESHOLD) return;
    if (!current.hasMore || current.loadingOlder) return;
    current.pumping = true;
    try {
      await fireLoadOlder(current.sessionId);
    } finally {
      current.pumping = false;
    }
    if (current.detached) return;
    if (target.scrollTop <= TOP_THRESHOLD && current.hasMore && !current.loadingOlder) {
      void pump(current, target);
    }
  }
  function release(target, current) {
    current.owners -= 1;
    if (current.owners > 0 || current.detached) return;
    current.detached = true;
    attachedHosts.delete(target);
    if (current.onScroll !== null) target.removeEventListener("scroll", current.onScroll);
  }
}

// src/client/AutoLoadHost.tsx
var AutoLoadHost = React3.memo(function AutoLoadHost2({ sessionId, hasMore, loadingOlder, children }) {
  const hostRef = React3.useRef(null);
  React3.useEffect(() => {
    const el = hostRef.current;
    if (el === null || sessionId === void 0) return;
    return attachAutoLoad(el, sessionId, hasMore, loadingOlder);
  }, [sessionId, hasMore, loadingOlder]);
  if (children === null || children === void 0) return null;
  if (sessionId === void 0) return children;
  return React3.createElement("div", { ref: hostRef, className: "dshAutoHost", "data-dsh-autoload": "" }, children);
});

// src/client/registry.ts
var conversationT;
function setConversationT(t) {
  conversationT = t;
}

// src/client/UserNodeWrapper.tsx
var NOOP_T = (key, params) => params !== void 0 && "count" in params ? String(params.count) : key;
function contentParts(content) {
  const texts = [];
  const images = [];
  const rest = [];
  for (const raw of content) {
    if (raw === null || typeof raw !== "object") {
      rest.push(raw);
      continue;
    }
    const block = raw;
    if (block.type === "text" && typeof block.text === "string") texts.push(block.text);
    else if (block.type === "image" && block.attachment !== void 0) images.push({ attachment: block.attachment });
    else rest.push(raw);
  }
  return { text: texts.join(""), images, rest };
}
var REF_TOKEN = /(^|\s)([/@][\w-]+)(?=\s|$)/g;
function projectUserText(text) {
  const parts = [];
  let cursor = 0;
  let match;
  REF_TOKEN.lastIndex = 0;
  while ((match = REF_TOKEN.exec(text)) !== null) {
    const tokenStart = match.index + (match[1]?.length ?? 0);
    const label = match[2] ?? "";
    if (tokenStart > cursor) {
      parts.push(React4.createElement(MessageText, { key: `t${cursor}`, text: text.slice(cursor, tokenStart) }));
    }
    parts.push(
      React4.createElement(
        "span",
        { key: `r${tokenStart}`, className: "dshUserRefChip", "data-ref-chip": label.startsWith("@") ? "subagent" : "skill" },
        label
      )
    );
    cursor = tokenStart + label.length;
  }
  if (parts.length === 0) return React4.createElement(MessageText, { text });
  if (cursor < text.length) parts.push(React4.createElement(MessageText, { key: `t${cursor}`, text: text.slice(cursor) }));
  return React4.createElement(React4.Fragment, null, parts);
}
function imageLabels(t) {
  return {
    image: t("image.label"),
    open: t("image.openOriginal"),
    openNamed: (label) => t("image.openOriginalLabel", { label }),
    loading: t("image.loading"),
    loadFailed: t("image.loadFailed"),
    lightbox: { dialog: t("image.preview"), close: t("image.closePreview") }
  };
}
function pad2(value) {
  return value < 10 ? `0${value}` : String(value);
}
function formatClock(time, t) {
  const d = new Date(time);
  const now = /* @__PURE__ */ new Date();
  const clock = `${pad2(d.getHours())}:${pad2(d.getMinutes())}`;
  if (d.getFullYear() === now.getFullYear() && d.getMonth() === now.getMonth() && d.getDate() === now.getDate()) return clock;
  const params = { y: d.getFullYear(), m: d.getMonth() + 1, d: d.getDate() };
  return `${d.getFullYear() === now.getFullYear() ? t("clock.md", params) : t("clock.ymd", params)} ${clock}`;
}
function CopyAction({ text, t }) {
  const [copied, setCopied] = React4.useState(false);
  const timer = React4.useRef(null);
  React4.useEffect(
    () => () => {
      if (timer.current !== null) clearTimeout(timer.current);
    },
    []
  );
  const onCopy = () => {
    if (copied) return;
    void writeClipboard(text).then((ok) => {
      if (!ok) return;
      setCopied(true);
      timer.current = setTimeout(() => setCopied(false), 1e3);
    });
  };
  return React4.createElement(
    Tooltip,
    { label: copied ? t("copied") : t("copy"), side: "bottom" },
    React4.createElement(
      "button",
      { type: "button", className: "dshUserAction", "aria-label": copied ? t("copied") : t("copy"), onClick: onCopy },
      copied ? React4.createElement(IconCheckOutline16, null) : React4.createElement(IconCopyOutline16, null)
    )
  );
}
var UserNodeWrapper = React4.memo(function UserNodeWrapper2(props) {
  const { node, loadImage, t, sessionId, useSession } = props;
  setConversationT(typeof t === "function" ? t : void 0);
  const [expanded, setExpanded] = React4.useState(false);
  const clampRef = React4.useRef(null);
  const [overflowing, setOverflowing] = React4.useState(false);
  React4.useEffect(() => {
    const el = clampRef.current;
    if (el === null) return;
    const update = () => setOverflowing(el.scrollHeight > el.clientHeight + 1);
    update();
    if (typeof ResizeObserver === "undefined") return;
    const observer = new ResizeObserver(update);
    observer.observe(el);
    return () => observer.disconnect();
  }, [expanded]);
  const toggle = React4.useCallback(() => setExpanded((value) => !value), []);
  const hasMore = typeof useSession === "function" ? useSession((snapshot) => snapshot.hasMore === true) : false;
  const loadingOlder = typeof useSession === "function" ? useSession((snapshot) => snapshot.loadingOlder === true) : false;
  const data = node.data ?? {};
  const rawContent = data.content;
  const content = Array.isArray(rawContent) ? rawContent : typeof rawContent === "string" ? [{ type: "text", text: rawContent }] : [];
  const { text, images, rest } = contentParts(content);
  const showBubble = text !== "" || rest.length > 0;
  const translate = t ?? NOOP_T;
  const toolT = getGroupT() ?? translate;
  const labels = imageLabels(translate);
  const showToggle = expanded || overflowing;
  const output = React4.createElement(
    "div",
    { className: "dshUserRow", "data-time-hover-root": "" },
    React4.createElement(
      "div",
      { className: "dshUserStack" },
      images.length > 0 ? React4.createElement(ImageGallery, {
        images,
        load: loadImage ?? (() => Promise.reject(new Error("image loader unavailable"))),
        align: "end",
        labels
      }) : null,
      showBubble ? React4.createElement(
        "div",
        { className: "dshUserBubble" },
        // The clamp lives on a PADDING-FREE inner box: browsers that cut
        // the clamp height short of the bottom padding (legacy line-clamp
        // behavior) can still never show a partial 4th line or eat the
        // bubble's bottom gap — max-height:72px is exactly 3 × 24px.
        React4.createElement(
          "div",
          { ref: clampRef, className: "dshUserBubbleClamp", "data-clamped": expanded ? void 0 : "" },
          text !== "" ? projectUserText(text) : null,
          ...rest.map(
            (block, index) => React4.createElement(JsonBlock, {
              key: `extra${index}`,
              label: translate("message.extraBlock"),
              payload: block,
              truncatedLabel: (total) => translate("json.truncated", { total })
            })
          )
        )
      ) : null,
      showBubble ? React4.createElement(
        "button",
        {
          type: "button",
          className: "dshUserFoldToggle",
          "data-shown": showToggle ? "" : void 0,
          "aria-expanded": expanded,
          // A native button: Enter/Space activate through onClick — no
          // manual onKeyDown (that would double-toggle).
          onClick: toggle
        },
        React4.createElement(expanded ? IconChevronUpOutline14 : IconChevronDownOutline14, { size: 14 }),
        toolT(expanded ? "collapse" : "expand")
      ) : null
    ),
    React4.createElement(
      "div",
      { className: "dshUserActions" },
      data.time !== void 0 ? React4.createElement("span", { key: "time", className: "dshUserTime" }, formatClock(data.time, translate)) : null,
      React4.createElement(CopyAction, { key: "copy", text, t: translate })
    )
  );
  return React4.createElement(AutoLoadHost, { sessionId, hasMore, loadingOlder }, output);
});
export {
  UserNodeWrapper
};
