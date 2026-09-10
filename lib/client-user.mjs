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
function projectUserText(text, sessionLabels = [], slashNames = [], slashKind = "skill") {
  const re = /(^|\s)(\/[\w-]+(?=\s|$)|@[^\s]+)/gu;
  const parts = [];
  let cursor = 0;
  let match;
  while ((match = re.exec(text)) !== null) {
    const tokenStart = match.index + (match[1]?.length ?? 0);
    const label = match[2];
    const isSlash = label.startsWith("/");
    if (isSlash && !slashNames.includes(label.slice(1))) continue;
    if (tokenStart > cursor) parts.push(React.createElement("span", { key: `t${cursor}` }, text.slice(cursor, tokenStart)));
    const name = label.slice(1);
    const chipKind = isSlash ? slashKind : sessionLabels.includes(name) ? "session" : "file";
    parts.push(React.createElement("span", { key: `r${tokenStart}`, "data-ref-chip": chipKind }, isSlash ? label : name));
    cursor = tokenStart + label.length;
  }
  if (parts.length === 0) return React.createElement("span", null, text);
  if (cursor < text.length) parts.push(React.createElement("span", { key: `t${cursor}` }, text.slice(cursor)));
  return React.createElement(React.Fragment, null, parts);
}
function fileSizeText(bytes) {
  if (bytes < 1024) return `${bytes}B`;
  const kb = bytes / 1024;
  if (kb < 1024) return `${kb < 10 ? kb.toFixed(1) : Math.round(kb)}KB`;
  const mb = kb / 1024;
  if (mb < 1024) return `${mb < 10 ? mb.toFixed(1) : Math.round(mb)}MB`;
  const gb = mb / 1024;
  return `${gb < 10 ? gb.toFixed(1) : Math.round(gb)}GB`;
}
function FileTypeIcon({ path, className }) {
  return React.createElement("svg", { className, "data-file-type-icon": "true", "data-path": path });
}
function fileExtension(path) {
  const dot = path.lastIndexOf(".");
  if (dot <= 0 || dot === path.length - 1) return "";
  return path.slice(dot + 1).toLowerCase();
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
var CHECK_INTERVAL_MS = 100;
function tryUnref(timer) {
  if (typeof timer === "object" && timer !== null && "unref" in timer) {
    ;
    timer.unref?.();
  }
}
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
  const entry = {
    sessionId,
    hasMore,
    loadingOlder,
    owners: 1,
    detached: false,
    onScroll: null,
    pumping: false,
    pendingTimer: null
  };
  attachedHosts.set(host, entry);
  entry.onScroll = () => {
    if (host.scrollTop <= TOP_THRESHOLD) void pump(entry, host);
  };
  host.addEventListener("scroll", entry.onScroll, { passive: true });
  entry.pendingTimer = setInterval(() => {
    if (host.scrollTop <= TOP_THRESHOLD) void pump(entry, host);
  }, CHECK_INTERVAL_MS);
  tryUnref(entry.pendingTimer);
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
  }
  function release(target, current) {
    current.owners -= 1;
    if (current.owners > 0 || current.detached) return;
    current.detached = true;
    if (current.pendingTimer !== null) clearInterval(current.pendingTimer);
    current.pendingTimer = null;
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
var chatT;
function getChatT() {
  return chatT;
}
function compositeT(primary, secondary) {
  const first = primary ?? secondary;
  if (first === void 0) {
    return (key, params) => params !== void 0 && "count" in params ? String(params.count) : key;
  }
  const alternate = primary !== void 0 && secondary !== void 0 && primary !== secondary ? secondary : void 0;
  if (alternate === void 0) return first;
  return (key, params) => {
    const value = first(key, params);
    if (value !== key) return value;
    const alt = alternate(key, params);
    return alt !== key ? alt : value;
  };
}

// src/client/snapshot-face.ts
var EMPTY_ORDER = [];
var EMPTY_NODES = { get: (_key) => void 0 };
var EMPTY_CHAT = { order: EMPTY_ORDER, nodes: EMPTY_NODES };
var EMPTY_FACE = { chat: EMPTY_CHAT, hasMore: false, loadingOlder: false };
function isChatTarget(raw) {
  const value = raw;
  return value !== null && typeof value === "object" && Array.isArray(value.order) && value.nodes !== null && typeof value.nodes === "object" && typeof value.nodes.get === "function";
}
function chatFaceOf(raw) {
  if (!isChatTarget(raw)) return EMPTY_CHAT;
  const chat = raw;
  return { order: chat.order, nodes: chat.nodes, turnEnds: chat.legacy?.turnEnds };
}
function chatFaceEq(left, right) {
  if (left === right) return true;
  return left.order === right.order && left.nodes === right.nodes && left.turnEnds === right.turnEnds;
}
function windowFlagsOf(raw) {
  const session = raw;
  return {
    hasMore: session !== null && typeof session === "object" && session.hasMore === true,
    loadingOlder: session !== null && typeof session === "object" && session.loadingOlder === true
  };
}
function windowFlagsEq(left, right) {
  return left.hasMore === right.hasMore && left.loadingOlder === right.loadingOlder;
}
function useSnapshotFace(props) {
  const useChat = typeof props.useChat === "function" ? props.useChat : void 0;
  const useSession = typeof props.useSession === "function" ? props.useSession : void 0;
  const chat = useChat !== void 0 ? useChat((snapshot) => chatFaceOf(snapshot), chatFaceEq) : EMPTY_CHAT;
  const flags = useSession !== void 0 ? useSession((snapshot) => windowFlagsOf(snapshot), windowFlagsEq) : { hasMore: false, loadingOlder: false };
  return flags.hasMore || flags.loadingOlder || chat !== EMPTY_CHAT ? { chat, hasMore: flags.hasMore, loadingOlder: flags.loadingOlder } : EMPTY_FACE;
}

// src/client/UserNodeWrapper.tsx
function contentParts(content) {
  const texts = [];
  const attachments = [];
  const rest = [];
  for (const raw of content) {
    if (raw === null || typeof raw !== "object") {
      rest.push(raw);
      continue;
    }
    const block = raw;
    if (block.type === "text" && typeof block.text === "string") texts.push(block.text);
    else if (block.type === "image" && block.attachment !== void 0) attachments.push({ type: "image", image: { attachment: block.attachment } });
    else if (block.type === "file" && block.attachment !== void 0) attachments.push({ type: "file", file: block.attachment });
    else rest.push(raw);
  }
  const images = attachments.filter((a) => a.type === "image").map((a) => a.image);
  return { text: texts.join(""), attachments, images, rest };
}
function extensionOf(name) {
  if (typeof fileExtension === "function") return fileExtension(name).toUpperCase().slice(0, 8);
  const dot = name.lastIndexOf(".");
  if (dot <= 0 || dot === name.length - 1) return "";
  return name.slice(dot + 1).toUpperCase().slice(0, 8);
}
function fileSizeTextLocal(bytes) {
  if (bytes < 1024) return `${bytes}B`;
  const kb = bytes / 1024;
  if (kb < 1024) return `${kb < 10 ? kb.toFixed(1) : Math.round(kb)}KB`;
  const mb = kb / 1024;
  if (mb < 1024) return `${mb < 10 ? mb.toFixed(1) : Math.round(mb)}MB`;
  const gb = mb / 1024;
  return `${gb < 10 ? gb.toFixed(1) : Math.round(gb)}GB`;
}
function fileSize(bytes) {
  return typeof fileSizeText === "function" ? fileSizeText(bytes) : fileSizeTextLocal(bytes);
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
function FileCard({ file }) {
  const meta = [extensionOf(file.name), fileSize(file.bytes)].filter(Boolean).join(" ");
  return React4.createElement(
    "span",
    { className: "dshUserFileCard", title: file.name },
    typeof FileTypeIcon === "function" ? React4.createElement(FileTypeIcon, { path: file.name, className: "dshUserFileIcon" }) : null,
    React4.createElement(
      "span",
      { className: "dshUserFileContent" },
      React4.createElement("span", { className: "dshUserFileName" }, file.name),
      meta !== "" ? React4.createElement("span", { className: "dshUserFileMeta" }, meta) : null
    )
  );
}
var UserNodeWrapper = React4.memo(function UserNodeWrapper2(props) {
  const { node, loadImage, renderMessageImages, t, sessionId } = props;
  const seatT = typeof t === "function" ? t : void 0;
  const translate = compositeT(getChatT(), seatT);
  setConversationT(translate);
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
  const { hasMore, loadingOlder } = useSnapshotFace(props);
  const data = node.data ?? {};
  const rawContent = data.content;
  const content = Array.isArray(rawContent) ? rawContent : typeof rawContent === "string" ? [{ type: "text", text: rawContent }] : [];
  const { text, attachments, images, rest } = contentParts(content);
  const alphaKit = typeof loadImage === "function";
  const extraRest = alphaKit ? rest : [...rest, ...attachments.filter((a) => a.type === "file")];
  const showBubble = text !== "" || extraRest.length > 0;
  const toolT = getGroupT() ?? translate;
  const labels = imageLabels(translate);
  const showToggle = expanded || overflowing;
  const renderAttachments = () => {
    if (attachments.length === 0) return null;
    if (typeof renderMessageImages === "function") {
      if (!alphaKit) {
        return renderMessageImages({ images, align: "end" });
      }
      const compact = attachments.length > 1;
      return React4.createElement(
        "div",
        { className: "dshUserAttachmentRow", "data-message-attachments": "" },
        attachments.map(
          (attachment, index) => attachment.type === "image" ? React4.createElement(React4.Fragment, { key: `image:${index}` }, renderMessageImages({ images: [attachment.image], align: "end", compact })) : React4.createElement(FileCard, { key: `file:${index}`, file: attachment.file })
        )
      );
    }
    return React4.createElement(ImageGallery, {
      images,
      load: loadImage ?? (() => Promise.reject(new Error("image loader unavailable"))),
      align: "end",
      labels
    });
  };
  const output = React4.createElement(
    "div",
    { className: "dshUserRow", "data-time-hover-root": "" },
    React4.createElement(
      "div",
      { className: "dshUserStack" },
      renderAttachments(),
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
          text !== "" ? projectUserText(text, data.referenceLabels ?? [], data.skillNames ?? [], "skill") : null,
          ...extraRest.map(
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
