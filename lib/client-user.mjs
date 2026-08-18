// src/client/UserNodeWrapper.tsx
import * as React3 from "react";

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
      parts.push(React3.createElement(MessageText, { key: `t${cursor}`, text: text.slice(cursor, tokenStart) }));
    }
    parts.push(
      React3.createElement(
        "span",
        { key: `r${tokenStart}`, className: "dshUserRefChip", "data-ref-chip": label.startsWith("@") ? "subagent" : "skill" },
        label
      )
    );
    cursor = tokenStart + label.length;
  }
  if (parts.length === 0) return React3.createElement(MessageText, { text });
  if (cursor < text.length) parts.push(React3.createElement(MessageText, { key: `t${cursor}`, text: text.slice(cursor) }));
  return React3.createElement(React3.Fragment, null, parts);
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
  const [copied, setCopied] = React3.useState(false);
  const timer = React3.useRef(null);
  React3.useEffect(
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
  return React3.createElement(
    Tooltip,
    { label: copied ? t("copied") : t("copy"), side: "bottom" },
    React3.createElement(
      "button",
      { type: "button", className: "dshUserAction", "aria-label": copied ? t("copied") : t("copy"), onClick: onCopy },
      copied ? React3.createElement(IconCheckOutline16, null) : React3.createElement(IconCopyOutline16, null)
    )
  );
}
var UserNodeWrapper = React3.memo(function UserNodeWrapper2(props) {
  const { node, loadImage, t } = props;
  const [expanded, setExpanded] = React3.useState(false);
  const bubbleRef = React3.useRef(null);
  const [overflowing, setOverflowing] = React3.useState(false);
  React3.useEffect(() => {
    const el = bubbleRef.current;
    if (el === null) return;
    const update = () => setOverflowing(el.scrollHeight > el.clientHeight + 1);
    update();
    if (typeof ResizeObserver === "undefined") return;
    const observer = new ResizeObserver(update);
    observer.observe(el);
    return () => observer.disconnect();
  }, [expanded]);
  const toggle = React3.useCallback(() => setExpanded((value) => !value), []);
  const data = node.data ?? {};
  const rawContent = data.content;
  const content = Array.isArray(rawContent) ? rawContent : typeof rawContent === "string" ? [{ type: "text", text: rawContent }] : [];
  const { text, images, rest } = contentParts(content);
  const showBubble = text !== "" || rest.length > 0;
  const translate = t ?? NOOP_T;
  const toolT = getGroupT() ?? translate;
  const labels = imageLabels(translate);
  const showToggle = expanded || overflowing;
  return React3.createElement(
    "div",
    { className: "dshUserRow", "data-time-hover-root": "" },
    React3.createElement(
      "div",
      { className: "dshUserStack" },
      images.length > 0 ? React3.createElement(ImageGallery, {
        images,
        load: loadImage ?? (() => Promise.reject(new Error("image loader unavailable"))),
        align: "end",
        labels
      }) : null,
      showBubble ? React3.createElement(
        "div",
        { ref: bubbleRef, className: "dshUserBubble", "data-clamped": expanded ? void 0 : "" },
        text !== "" ? projectUserText(text) : null,
        ...rest.map(
          (block, index) => React3.createElement(JsonBlock, {
            key: `extra${index}`,
            label: translate("message.extraBlock"),
            payload: block,
            truncatedLabel: (total) => translate("json.truncated", { total })
          })
        )
      ) : null,
      showBubble ? React3.createElement(
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
        React3.createElement(expanded ? IconChevronUpOutline14 : IconChevronDownOutline14, { size: 14 }),
        toolT(expanded ? "collapse" : "expand")
      ) : null
    ),
    React3.createElement(
      "div",
      { className: "dshUserActions" },
      data.time !== void 0 ? React3.createElement("span", { key: "time", className: "dshUserTime" }, formatClock(data.time, translate)) : null,
      React3.createElement(CopyAction, { key: "copy", text, t: translate })
    )
  );
});
export {
  UserNodeWrapper
};
