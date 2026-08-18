// src/client/ToolCallGroupView.tsx
import * as React2 from "react";

// test/stubs/primitives.mjs
import React from "react";
function Icon({ size = 14, className }) {
  return React.createElement("svg", { width: size, height: size, className, "data-icon": "true" });
}
var IconChevronRightOutline14 = Icon;
var IconChevronDownOutline14 = Icon;

// src/client/group.ts
var TOOL_KIND = "tool-call";
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
function isRunningBlock(block) {
  return block !== void 0 && !("kind" in block);
}
function callName(block) {
  return "kind" in block ? block.call?.name ?? "" : block.name;
}
function groupOf(snapshot, nodeKey) {
  const order = snapshot.order;
  const idx = order.indexOf(nodeKey);
  if (idx < 0) return null;
  const node = snapshot.nodes.get(nodeKey);
  if (node === void 0 || node.kind !== TOOL_KIND) return null;
  let start = idx;
  while (start > 0) {
    const prev = snapshot.nodes.get(order[start - 1]);
    if (prev === void 0 || prev.kind !== TOOL_KIND || !sameTurn(prev, node)) break;
    start -= 1;
  }
  let end = idx;
  while (end < order.length - 1) {
    const next = snapshot.nodes.get(order[end + 1]);
    if (next === void 0 || next.kind !== TOOL_KIND || !sameTurn(next, node)) break;
    end += 1;
  }
  const keys = order.slice(start, end + 1);
  const members = [];
  for (const key of keys) {
    const member = snapshot.nodes.get(key);
    if (member !== void 0) members.push(member);
  }
  let running;
  for (const member of members) {
    const block = member.data?.root;
    if (isRunningBlock(block)) {
      running = block;
      break;
    }
  }
  return { leaderKey: keys[0], keys, members, turn: turnOf(node), running, count: keys.length };
}
function isGroupLeader(group, nodeKey) {
  return group.leaderKey === nodeKey;
}
function eqGroup(left, right) {
  if (left === null || right === null) return left === right;
  if (left.leaderKey !== right.leaderKey || left.running !== right.running) return false;
  if (left.keys.length !== right.keys.length || left.members.length !== right.members.length) return false;
  for (let i = 0; i < left.keys.length; i += 1) {
    if (left.keys[i] !== right.keys[i]) return false;
  }
  for (let i = 0; i < left.members.length; i += 1) {
    if (left.members[i] !== right.members[i]) return false;
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
      if (p.type === "image" || p.type === "file") return "";
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
var ToolCallGroupView = React2.memo(function ToolCallGroupView2(props) {
  const { node, useSession, renderSlot, selectedCallId, cwd, openFile, inspectCall, t } = props;
  const group = useSession((snapshot) => groupOf(snapshot.chat, node.key), eqGroup);
  const [expanded, setExpanded] = React2.useState(false);
  if (group === null || !isGroupLeader(group, node.key)) return null;
  const runningName = isRunningBlock(group.running) ? group.running.name : null;
  const toggle = React2.useCallback(() => setExpanded((value) => !value), []);
  const onKeyDown = (event) => {
    if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      setExpanded((value) => !value);
    }
  };
  const chevron = React2.createElement(expanded ? IconChevronDownOutline14 : IconChevronRightOutline14, {
    className: "dshToolGroupChevron"
  });
  const bar = React2.createElement(
    "div",
    {
      className: "dshToolGroupRow",
      role: "button",
      tabIndex: 0,
      "aria-expanded": expanded,
      "aria-label": `${t("group")} ${group.count}`,
      onClick: toggle,
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
      React2.createElement("span", { className: "dshToolGroupCount" }, String(group.count)),
      chevron
    )
  );
  const members = group.members.length > 0 ? React2.createElement(
    "div",
    { className: "dshToolGroupMembers" },
    group.members.map((member) => {
      const root = member.data?.root;
      if (root === void 0) return null;
      return React2.createElement(ToolCallBranch, {
        key: member.key,
        renderSlot,
        block: root,
        selectedCallId,
        cwd,
        openFile,
        inspectCall,
        t
      });
    })
  ) : null;
  return React2.createElement(
    "div",
    { className: "dshToolGroup", "data-tool-group": "", "data-state": runningName !== null ? "running" : "settled" },
    bar,
    expanded && members !== null ? members : null
  );
});
export {
  ToolCallGroupView
};
