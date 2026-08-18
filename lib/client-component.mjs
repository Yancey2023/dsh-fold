// src/client/ToolCallGroupView.tsx
import * as React2 from "react";

// test/stubs/primitives.mjs
import React from "react";
function Icon({ size = 14, className }) {
  return React.createElement("svg", { width: size, height: size, className, "data-icon": "true" });
}
var IconChevronRightOutline14 = Icon;
var IconChevronDownOutline14 = Icon;
var IconThinkOutline14 = Icon;
function DisclosureRow({ icon, title, open, expandable, onToggle, expandOnRowClick = false, collapsedContent, children, rowClassName, leadingClassName, titleClassName, chevronClassName }) {
  const row = React.createElement(
    "div",
    { className: rowClassName, "data-disclosure-row": true, "data-expandable": expandable && expandOnRowClick || void 0, onClick: expandable && expandOnRowClick ? onToggle : void 0 },
    React.createElement("span", { className: leadingClassName }, icon),
    React.createElement("span", { className: titleClassName }, title),
    collapsedContent
  );
  return React.createElement("div", { "data-open": open || void 0 }, row, open ? children : null);
}

// src/client/group.ts
var TOOL_KIND = "tool-call";
var ASSISTANT_KIND = "assistant-step";
function turnOf(node) {
  const loc = node.location;
  if (loc === void 0) return void 0;
  if (loc.kind === "turn" || loc.kind === "step") return loc.turn?.turn;
  return void 0;
}
function sameTurn(left, right) {
  const tl = turnOf(left);
  if (tl === void 0) return false;
  return tl === turnOf(right);
}
function isTransparentAssistant(node) {
  if (node === void 0 || node.kind !== ASSISTANT_KIND) return false;
  const blocks = node.data?.blocks ?? [];
  return blocks.every((block) => {
    if (block.kind === "reasoning" || block.kind === "tool-call") return true;
    if (block.kind === "text") return (block.text ?? "").trim() === "";
    return false;
  });
}
function isRunningBlock(block) {
  return block !== void 0 && !("kind" in block);
}
function callName(block) {
  return "kind" in block ? block.call?.name ?? "" : block.name;
}
function continuesRun(node, anchor) {
  if (!sameTurn(node, anchor)) return false;
  return node.kind === TOOL_KIND || isTransparentAssistant(node);
}
function groupOf(snapshot, nodeKey) {
  const order = snapshot.order;
  const idx = order.indexOf(nodeKey);
  if (idx < 0) return null;
  const node = snapshot.nodes.get(nodeKey);
  if (node === void 0 || node.kind !== TOOL_KIND && !isTransparentAssistant(node)) return null;
  let start = idx;
  while (start > 0) {
    const prev = snapshot.nodes.get(order[start - 1]);
    if (prev === void 0 || !continuesRun(prev, node)) break;
    start -= 1;
  }
  let end = idx;
  while (end < order.length - 1) {
    const next = snapshot.nodes.get(order[end + 1]);
    if (next === void 0 || !continuesRun(next, node)) break;
    end += 1;
  }
  const keys = order.slice(start, end + 1);
  const items = [];
  let firstToolKey;
  for (const key of keys) {
    const member = snapshot.nodes.get(key);
    if (member === void 0) continue;
    if (member.kind === TOOL_KIND) {
      if (firstToolKey === void 0) firstToolKey = key;
      items.push({ kind: "tool", key, node: member });
    } else {
      items.push({ kind: "think", key, node: member });
    }
  }
  const leaderKey = firstToolKey ?? keys[0];
  if (leaderKey === void 0) return null;
  let running;
  for (const item of items) {
    if (item.kind !== "tool") continue;
    const block = item.node.data?.root;
    if (running === void 0 && isRunningBlock(block)) running = block;
  }
  return { leaderKey, itemKeys: keys, items, count: items.length, running };
}
function isGroupLeader(group, nodeKey) {
  return group.leaderKey === nodeKey;
}
function eqGroup(left, right) {
  if (left === null || right === null) return left === right;
  if (left.leaderKey !== right.leaderKey || left.running !== right.running) return false;
  if (left.itemKeys.length !== right.itemKeys.length || left.items.length !== right.items.length) return false;
  for (let i = 0; i < left.itemKeys.length; i += 1) {
    if (left.itemKeys[i] !== right.itemKeys[i]) return false;
  }
  for (let i = 0; i < left.items.length; i += 1) {
    if (left.items[i].node !== right.items[i].node) return false;
  }
  return true;
}

// src/client/ToolCallGroupView.tsx
function FallbackToolCard({ toolName, block, t }) {
  const settled = "kind" in block;
  const error = settled && (block.isError === true || block.error !== void 0);
  let argsText = "";
  if (!settled) argsText = block.argsRaw ?? "";
  else if (block.call?.argsRaw) argsText = block.call.argsRaw;
  const output = settled ? flattenContent(block.content) : "";
  return React2.createElement(
    "div",
    { className: "dshToolGroupFallback" },
    React2.createElement("div", { className: "dshToolGroupFallbackTitle" }, `${toolName}${error ? " \u2715" : ""}`),
    argsText !== "" ? React2.createElement("pre", { className: "dshToolGroupFallbackArgs" }, argsText) : null,
    settled && output !== "" ? React2.createElement("pre", { className: "dshToolGroupFallbackOutput", "data-error": error || void 0 }, output) : null
  );
}
function flattenContent(content) {
  if (typeof content === "string") return content;
  if (Array.isArray(content)) {
    return content.map((part) => {
      if (part === null || typeof part !== "object") return "";
      const p = part;
      if (p.type === "text" && typeof p.text === "string") return p.text;
      return "";
    }).filter(Boolean).join("\n");
  }
  return "";
}
var ToolCallBranch = React2.memo(function ToolCallBranch2({
  renderSlot,
  block,
  selectedCallId,
  cwd,
  openFile,
  inspectCall,
  t
}) {
  const name = callName(block);
  const owner = React2.useMemo(
    () => ({
      callId: block.callId,
      toolName: name,
      block,
      openFile,
      cwd,
      inspect: () => {
        inspectCall(block.callId);
      }
    }),
    [block, name, openFile, cwd, inspectCall]
  );
  const children = block.subCalls !== void 0 && block.subCalls.length > 0 ? React2.createElement(
    "div",
    { className: "dshToolGroupSubCalls", "data-subcalls": true },
    block.subCalls.map(
      (child) => React2.createElement(ToolCallBranch2, {
        key: child.callId,
        renderSlot,
        block: child,
        selectedCallId,
        cwd,
        openFile,
        inspectCall,
        t
      })
    )
  ) : null;
  return React2.createElement(
    "div",
    {
      className: "dshToolGroupCallRow",
      "data-chat-anchor-key": `call:${block.callId}`,
      "data-chat-call-id": block.callId,
      "data-selected": selectedCallId === block.callId || void 0
    },
    renderSlot("tool.call.toolview", owner, {
      entryKey: name,
      fallback: React2.createElement(FallbackToolCard, { toolName: name, block, t })
    }),
    children
  );
});
function firstLine(text) {
  const newline = text.indexOf("\n");
  return newline === -1 ? text : text.slice(0, newline);
}
function latestLine(text) {
  const visible = text.trimEnd();
  const newline = visible.lastIndexOf("\n");
  return newline === -1 ? visible : visible.slice(newline + 1);
}
function InlineThink({ text, running, t }) {
  const [expanded, setExpanded] = React2.useState(false);
  const summary = running ? latestLine(text) : firstLine(text);
  return React2.createElement(
    "div",
    { className: "dshToolGroupThink", "data-variant": "think", "data-state": running ? "running" : "ok" },
    running ? React2.createElement("span", { className: "dshToolGroupVisuallyHidden" }, t("running")) : null,
    React2.createElement(DisclosureRow, {
      rowClassName: "dshToolGroupThinkRow",
      leadingClassName: "dshToolGroupThinkLeading",
      titleClassName: "dshToolGroupThinkTitle",
      chevronClassName: "dshToolGroupThinkChevron",
      icon: React2.createElement(IconThinkOutline14, { size: 14 }),
      title: "Think",
      open: expanded,
      expandable: true,
      expandOnRowClick: true,
      onToggle: () => {
        setExpanded((value) => !value);
      },
      collapsedContent: React2.createElement(
        React2.Fragment,
        null,
        React2.createElement("span", { className: "dshToolGroupThinkSeparator", "aria-hidden": true }),
        React2.createElement(
          "span",
          { className: "dshToolGroupThinkSummary", "data-follow-end": running || void 0 },
          summary
        )
      ),
      children: React2.createElement("div", { className: "dshToolGroupThinkBody" }, text)
    })
  );
}
function ThinkItem({ item, t }) {
  const blocks = item.node.data?.blocks ?? [];
  const reasoning = blocks.filter((block) => block.kind === "reasoning" && (block.text ?? "").trim() !== "");
  if (reasoning.length === 0) return null;
  const running = item.node.data?.status === "running";
  return React2.createElement(
    React2.Fragment,
    null,
    reasoning.map(
      (block, index) => React2.createElement(InlineThink, {
        key: `${item.key}:${index}`,
        text: block.text ?? "",
        running: running && index === reasoning.length - 1,
        t
      })
    )
  );
}
var GroupBar = React2.memo(function GroupBar2({ group, expanded, onToggle, onKeyDown, t }) {
  const runningName = isRunningBlock(group.running) ? group.running.name : null;
  const chevron = React2.createElement(expanded ? IconChevronDownOutline14 : IconChevronRightOutline14, {
    className: "dshToolGroupChevron"
  });
  return React2.createElement(
    "div",
    {
      className: "dshToolGroupRow",
      role: "button",
      tabIndex: 0,
      "aria-expanded": expanded,
      "aria-label": t("folded", { count: group.count }),
      onClick: onToggle,
      onKeyDown
    },
    React2.createElement(
      "div",
      { className: "dshToolGroupLeft" },
      runningName !== null ? [React2.createElement("span", { key: "running", className: "dshToolGroupRunning" }, t("running")), React2.createElement("span", { key: "name", className: "dshToolGroupName" }, runningName)] : null
    ),
    React2.createElement(
      "div",
      { className: "dshToolGroupRight" },
      React2.createElement("span", { className: "dshToolGroupCount" }, t("folded", { count: group.count })),
      chevron
    )
  );
});
var GroupItems = React2.memo(function GroupItems2(props) {
  const { group, t, renderSlot, selectedCallId, cwd, openFile, inspectCall } = props;
  return React2.createElement(
    "div",
    { className: "dshToolGroupItems" },
    group.items.map((item) => {
      if (item.kind === "think") {
        return React2.createElement(ThinkItem, { key: item.key, item, t });
      }
      const root = item.node.data?.root;
      if (root === void 0 || renderSlot === void 0 || openFile === void 0 || inspectCall === void 0) return null;
      return React2.createElement(ToolCallBranch, {
        key: item.key,
        renderSlot,
        block: root,
        selectedCallId,
        cwd,
        openFile,
        inspectCall,
        t
      });
    })
  );
});
var ToolCallGroupView = React2.memo(function ToolCallGroupView2(props) {
  const { node, useSession, renderSlot, selectedCallId, cwd, openFile, inspectCall, t } = props;
  const group = useSession((snapshot) => groupOf(snapshot.chat, node.key), eqGroup);
  const [expanded, setExpanded] = React2.useState(false);
  if (group === null || !isGroupLeader(group, node.key)) return null;
  const toggle = React2.useCallback(() => setExpanded((value) => !value), []);
  const onKeyDown = (event) => {
    if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      setExpanded((value) => !value);
    }
  };
  const runningName = isRunningBlock(group.running) ? group.running.name : null;
  return React2.createElement(
    "div",
    { className: "dshToolGroup", "data-tool-group": "", "data-state": runningName !== null ? "running" : "settled" },
    React2.createElement(GroupBar, { group, expanded, onToggle: toggle, onKeyDown, t }),
    expanded ? React2.createElement(GroupItems, { group, t, renderSlot, selectedCallId, cwd, openFile, inspectCall }) : null
  );
});
export {
  GroupBar,
  GroupItems,
  ToolCallGroupView
};
