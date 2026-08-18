// src/client/ToolCallGroupView.tsx
import * as React3 from "react";

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

// src/client/turn-fold.ts
import * as React2 from "react";
function isThinkOnly(node) {
  return isTransparentAssistant(node);
}
function turnProcessOf(session, nodeKey) {
  const node = session.chat.nodes.get(nodeKey);
  if (node === void 0) return null;
  const turn = turnOf(node);
  if (turn === void 0) return null;
  const turnEnds = session.turnEnds;
  if (turnEnds === void 0 || !turnEnds.has(turn)) return null;
  const turnNodes = [];
  for (const key of session.chat.order) {
    const member = session.chat.nodes.get(key);
    if (member === void 0 || turnOf(member) !== turn) continue;
    if (member.kind === "tool-call" || member.kind === "assistant-step") turnNodes.push(member);
  }
  let summaryKey = null;
  for (let i = turnNodes.length - 1; i >= 0; i -= 1) {
    const candidate = turnNodes[i];
    if (candidate.kind !== "assistant-step") continue;
    if (isThinkOnly(candidate)) continue;
    summaryKey = candidate.key;
    break;
  }
  if (summaryKey === null) return null;
  const keys = turnNodes.filter((member) => member.key !== summaryKey).map((member) => member.key);
  if (keys.length === 0) return null;
  return { turn, summaryKey, firstKey: keys[0], keys };
}
function isProcessNode(info, nodeKey) {
  return info !== null && info.keys.includes(nodeKey);
}
function eqTurnProcess(left, right) {
  if (left === null || right === null) return left === right;
  if (left.turn !== right.turn || left.summaryKey !== right.summaryKey || left.firstKey !== right.firstKey) return false;
  if (left.keys.length !== right.keys.length) return false;
  for (let i = 0; i < left.keys.length; i += 1) {
    if (left.keys[i] !== right.keys[i]) return false;
  }
  return true;
}
var expandedTurns = /* @__PURE__ */ new Map();
var listeners = /* @__PURE__ */ new Set();
function setTurnExpanded(key, expanded) {
  if (expandedTurns.get(key) === expanded) return;
  expandedTurns.set(key, expanded);
  for (const fn of [...listeners]) fn();
}
function useTurnExpanded(key) {
  return React2.useSyncExternalStore(
    (callback) => {
      if (key === void 0) return () => {
      };
      const fn = () => callback();
      listeners.add(fn);
      return () => {
        listeners.delete(fn);
      };
    },
    () => key === void 0 ? false : expandedTurns.get(key) ?? false
  );
}

// src/client/ToolCallGroupView.tsx
function FallbackToolCard({ toolName, block, t }) {
  const settled = "kind" in block;
  const error = settled && (block.isError === true || block.error !== void 0);
  let argsText = "";
  if (!settled) argsText = block.argsRaw ?? "";
  else if (block.call?.argsRaw) argsText = block.call.argsRaw;
  const output = settled ? flattenContent(block.content) : "";
  return React3.createElement(
    "div",
    { className: "dshToolGroupFallback" },
    React3.createElement("div", { className: "dshToolGroupFallbackTitle" }, `${toolName}${error ? " \u2715" : ""}`),
    argsText !== "" ? React3.createElement("pre", { className: "dshToolGroupFallbackArgs" }, argsText) : null,
    settled && output !== "" ? React3.createElement("pre", { className: "dshToolGroupFallbackOutput", "data-error": error || void 0 }, output) : null
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
var ToolCallBranch = React3.memo(function ToolCallBranch2({
  renderSlot,
  block,
  selectedCallId,
  cwd,
  openFile,
  inspectCall,
  t
}) {
  const name = callName(block);
  const owner = React3.useMemo(
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
  const children = block.subCalls !== void 0 && block.subCalls.length > 0 ? React3.createElement(
    "div",
    { className: "dshToolGroupSubCalls", "data-subcalls": true },
    block.subCalls.map(
      (child) => React3.createElement(ToolCallBranch2, {
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
  return React3.createElement(
    "div",
    {
      className: "dshToolGroupCallRow",
      "data-chat-anchor-key": `call:${block.callId}`,
      "data-chat-call-id": block.callId,
      "data-selected": selectedCallId === block.callId || void 0
    },
    renderSlot("tool.call.toolview", owner, {
      entryKey: name,
      fallback: React3.createElement(FallbackToolCard, { toolName: name, block, t })
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
  const [expanded, setExpanded] = React3.useState(false);
  const summary = running ? latestLine(text) : firstLine(text);
  return React3.createElement(
    "div",
    { className: "dshToolGroupThink", "data-variant": "think", "data-state": running ? "running" : "ok" },
    running ? React3.createElement("span", { className: "dshToolGroupVisuallyHidden" }, t("running")) : null,
    React3.createElement(DisclosureRow, {
      rowClassName: "dshToolGroupThinkRow",
      leadingClassName: "dshToolGroupThinkLeading",
      titleClassName: "dshToolGroupThinkTitle",
      chevronClassName: "dshToolGroupThinkChevron",
      icon: React3.createElement(IconThinkOutline14, { size: 14 }),
      title: "Think",
      open: expanded,
      expandable: true,
      expandOnRowClick: true,
      onToggle: () => {
        setExpanded((value) => !value);
      },
      collapsedContent: React3.createElement(
        React3.Fragment,
        null,
        React3.createElement("span", { className: "dshToolGroupThinkSeparator", "aria-hidden": true }),
        React3.createElement(
          "span",
          { className: "dshToolGroupThinkSummary", "data-follow-end": running || void 0 },
          summary
        )
      ),
      children: React3.createElement("div", { className: "dshToolGroupThinkBody" }, text)
    })
  );
}
function ThinkItem({ item, t }) {
  const blocks = item.node.data?.blocks ?? [];
  const reasoning = blocks.filter((block) => block.kind === "reasoning" && (block.text ?? "").trim() !== "");
  if (reasoning.length === 0) return null;
  const running = item.node.data?.status === "running";
  return React3.createElement(
    React3.Fragment,
    null,
    reasoning.map(
      (block, index) => React3.createElement(InlineThink, {
        key: `${item.key}:${index}`,
        text: block.text ?? "",
        running: running && index === reasoning.length - 1,
        t
      })
    )
  );
}
var TurnFoldBar = React3.memo(function TurnFoldBar2({ expanded, onToggle, onKeyDown, t }) {
  const chevron = React3.createElement(expanded ? IconChevronDownOutline14 : IconChevronRightOutline14, {
    className: "dshToolGroupChevron"
  });
  return React3.createElement(
    "div",
    {
      className: "dshTurnFoldRow",
      role: "button",
      tabIndex: 0,
      "aria-expanded": expanded,
      "aria-label": t("turnFolded"),
      onClick: onToggle,
      onKeyDown
    },
    React3.createElement("span", { className: "dshTurnFoldLabel" }, t("turnFolded")),
    chevron
  );
});
var GroupBar = React3.memo(function GroupBar2({ group, expanded, onToggle, onKeyDown, t }) {
  const runningName = isRunningBlock(group.running) ? group.running.name : null;
  const chevron = React3.createElement(expanded ? IconChevronDownOutline14 : IconChevronRightOutline14, {
    className: "dshToolGroupChevron"
  });
  return React3.createElement(
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
    React3.createElement(
      "div",
      { className: "dshToolGroupLeft" },
      runningName !== null ? [React3.createElement("span", { key: "running", className: "dshToolGroupRunning" }, t("running")), React3.createElement("span", { key: "name", className: "dshToolGroupName" }, runningName)] : null
    ),
    React3.createElement(
      "div",
      { className: "dshToolGroupRight" },
      React3.createElement("span", { className: "dshToolGroupCount" }, t("folded", { count: group.count })),
      chevron
    )
  );
});
var GroupItems = React3.memo(function GroupItems2(props) {
  const { group, t, renderSlot, selectedCallId, cwd, openFile, inspectCall } = props;
  return React3.createElement(
    "div",
    { className: "dshToolGroupItems" },
    group.items.map((item) => {
      if (item.kind === "think") {
        return React3.createElement(ThinkItem, { key: item.key, item, t });
      }
      const root = item.node.data?.root;
      if (root === void 0 || renderSlot === void 0 || openFile === void 0 || inspectCall === void 0) return null;
      return React3.createElement(ToolCallBranch, {
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
function FoldedSeat() {
  return React3.createElement("div", { "data-tool-group-hidden": "" });
}
var ToolCallGroupView = React3.memo(function ToolCallGroupView2(props) {
  const { node, useSession, renderSlot, selectedCallId, cwd, openFile, inspectCall, t, sessionId } = props;
  const group = useSession((snapshot) => groupOf(snapshot.chat, node.key), eqGroup);
  const turnInfo = useSession((snapshot) => turnProcessOf(snapshot, node.key), eqTurnProcess);
  const [expanded, setExpanded] = React3.useState(false);
  const turnExpanded = useTurnExpanded(turnInfo === null ? void 0 : `${sessionId ?? ""}:${turnInfo.turn}`);
  const toggle = React3.useCallback(() => setExpanded((value) => !value), []);
  const onKeyDown = React3.useCallback((event) => {
    if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      setExpanded((value) => !value);
    }
  }, []);
  const turnKey = turnInfo === null ? void 0 : `${sessionId ?? ""}:${turnInfo.turn}`;
  const turnToggle = React3.useCallback(() => {
    if (turnKey === void 0) return;
    setTurnExpanded(turnKey, !turnExpanded);
  }, [turnKey, turnExpanded]);
  const turnKeyDown = React3.useCallback(
    (event) => {
      if (event.key === "Enter" || event.key === " ") {
        event.preventDefault();
        turnToggle();
      }
    },
    [turnToggle]
  );
  if (group === null || !isGroupLeader(group, node.key)) {
    return React3.createElement(FoldedSeat, null);
  }
  const runningName = isRunningBlock(group.running) ? group.running.name : null;
  const small = React3.createElement(
    "div",
    { className: "dshToolGroup", "data-tool-group": "", "data-state": runningName !== null ? "running" : "settled" },
    React3.createElement(GroupBar, { group, expanded, onToggle: toggle, onKeyDown, t }),
    expanded ? React3.createElement(GroupItems, { group, t, renderSlot, selectedCallId, cwd, openFile, inspectCall }) : null
  );
  if (turnInfo !== null && isProcessNode(turnInfo, node.key)) {
    const first = node.key === turnInfo.firstKey;
    if (!turnExpanded) {
      return first ? React3.createElement(TurnFoldBar, { expanded: false, onToggle: turnToggle, onKeyDown: turnKeyDown, t }) : React3.createElement(FoldedSeat, null);
    }
    return React3.createElement(
      React3.Fragment,
      null,
      first ? React3.createElement(TurnFoldBar, { expanded: true, onToggle: turnToggle, onKeyDown: turnKeyDown, t }) : null,
      turnExpanded ? small : null
    );
  }
  return small;
});
export {
  GroupBar,
  GroupItems,
  ToolCallGroupView,
  TurnFoldBar
};
