window.__ModuleLoader__.load({
  id: 'dsh-tool-group',
  factory: function (require) {
    var module = { exports: {} };
    var exports = module.exports;
    Object.defineProperty(exports, Symbol.toStringTag, { value: 'Module' });

"use strict";
var __create = Object.create;
var __defProp = Object.defineProperty;
var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __getProtoOf = Object.getPrototypeOf;
var __hasOwnProp = Object.prototype.hasOwnProperty;
var __export = (target, all) => {
  for (var name2 in all)
    __defProp(target, name2, { get: all[name2], enumerable: true });
};
var __copyProps = (to, from, except, desc) => {
  if (from && typeof from === "object" || typeof from === "function") {
    for (let key of __getOwnPropNames(from))
      if (!__hasOwnProp.call(to, key) && key !== except)
        __defProp(to, key, { get: () => from[key], enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable });
  }
  return to;
};
var __toESM = (mod, isNodeMode, target) => (target = mod != null ? __create(__getProtoOf(mod)) : {}, __copyProps(
  // If the importer is in node compatibility mode or this is not an ESM
  // file that has been converted to a CommonJS file using a Babel-
  // compatible transform (i.e. "__esModule" has not been set), then set
  // "default" to the CommonJS "module.exports" for node compatibility.
  isNodeMode || !mod || !mod.__esModule ? __defProp(target, "default", { value: mod, enumerable: true }) : target,
  mod
));
var __toCommonJS = (mod) => __copyProps(__defProp({}, "__esModule", { value: true }), mod);

// src/client/index.ts
var index_exports = {};
__export(index_exports, {
  apply: () => apply,
  inject: () => inject,
  name: () => name
});
module.exports = __toCommonJS(index_exports);
var import_dsh_client_ui_slots = require("@deepseek-ai/dsh-client-ui-slots");

// src/client/AssistantNodeWrapper.tsx
var React3 = __toESM(require("react"), 1);

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
  let runningToolItem;
  let runningThinkItem;
  for (const item of items) {
    if (item.kind !== "tool") {
      if (runningThinkItem === void 0 && item.node.data?.status === "running") runningThinkItem = item;
      continue;
    }
    const block = item.node.data?.root;
    if (running === void 0 && isRunningBlock(block)) running = block;
    if (runningToolItem === void 0 && isRunningBlock(block)) runningToolItem = item;
  }
  const runningItem = runningToolItem ?? runningThinkItem;
  return { leaderKey, itemKeys: keys, items, count: items.length, running, runningItem };
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
var React2 = __toESM(require("react"), 1);
var import_dsh_client_ui_primitives = require("@deepseek-ai/dsh-client-ui-primitives");

// src/client/tool-row.ts
var VARIANT_TITLES = {
  search: "Search",
  read: "Read",
  bash: "Bash",
  write: "Write",
  edit: "Edit",
  code: "Code",
  others: "Tool call"
};
var TOOL_VARIANTS = {
  bash: "bash",
  pwsh: "bash",
  read: "read",
  web_fetch: "read",
  web_search: "search",
  grep: "search",
  glob: "search",
  write: "write",
  edit: "edit",
  run_code: "code",
  cordis_package_inspect: "read",
  cordis_runtime_inspect: "read",
  cordis_run: "others",
  cordis_stop: "others",
  cordis_undefine: "others"
};
var TOOL_TITLES = {
  cordis_package_inspect: "Inspect",
  cordis_runtime_inspect: "Inspect",
  cordis_run: "Run Cordis Plugin",
  cordis_stop: "Stop Cordis Plugin",
  cordis_undefine: "Remove Cordis Plugin",
  pwsh: "Pwsh"
};
var SUMMARY_KEYS = {
  bash: ["description", "command"],
  read: ["path", "file_path", "url"],
  search: ["query", "pattern", "url"],
  write: ["path", "file_path"],
  edit: ["path", "file_path"],
  code: ["code"],
  others: []
};
function classifyTool(toolName) {
  return TOOL_VARIANTS[toolName] ?? "others";
}
function parseArgs(argsRaw) {
  try {
    return JSON.parse(argsRaw);
  } catch {
    return void 0;
  }
}
function pickString(args, keys) {
  for (const key of keys) {
    const value = args[key];
    if (typeof value === "string" && value !== "") return value;
  }
  return void 0;
}
function firstLine(text) {
  const nl = text.indexOf("\n");
  return nl === -1 ? text : text.slice(0, nl);
}
function relativizeToCwd(text, cwd) {
  if (cwd === void 0 || cwd === "") return text;
  const root = cwd.replace(/[/\\]+$/, "");
  if (text.startsWith(`${root}/`) || text.startsWith(`${root}\\`)) return text.slice(root.length + 1);
  return text;
}
function deriveSummary(variant, argsRaw) {
  const parsed = parseArgs(argsRaw);
  if (typeof parsed !== "object" || parsed === null) return firstLine(argsRaw);
  const args = parsed;
  const picked = pickString(args, SUMMARY_KEYS[variant] ?? []);
  if (picked !== void 0) return firstLine(picked);
  for (const value of Object.values(args)) {
    if (typeof value === "string" && value !== "") return firstLine(value);
  }
  return firstLine(argsRaw);
}
function runningToolRow(toolName, block, cwd) {
  const variant = classifyTool(toolName);
  const argsRaw = "kind" in block ? block.call?.argsRaw ?? "" : block.argsRaw ?? "";
  const base = argsRaw === "" ? block.callId : relativizeToCwd(deriveSummary(variant, argsRaw), cwd);
  const toolTitle = TOOL_TITLES[toolName];
  let summary = variant === "others" && toolName !== "" && toolTitle === void 0 ? `${toolName} \xB7 ${base}` : base;
  if (!("kind" in block)) {
    const callView = block.callView;
    if (callView?.card === "terminal" && typeof callView.description === "string" && callView.description !== "") {
      summary = callView.description;
    }
  }
  return { title: toolTitle ?? VARIANT_TITLES[variant] ?? "Tool call", summary, variant };
}

// src/client/turn-fold.ts
var React = __toESM(require("react"), 1);
function isThinkOnly(node) {
  return isTransparentAssistant(node);
}
var FOLDABLE_KINDS = /* @__PURE__ */ new Set(["tool-call", "assistant-step", "compaction", "context", "manual-compaction", "command"]);
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
    if (FOLDABLE_KINDS.has(member.kind)) turnNodes.push(member);
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
function isTurnSummary(info, nodeKey) {
  return info !== null && info.summaryKey === nodeKey;
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
  return React.useSyncExternalStore(
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
  const name2 = callName(block);
  const owner = React2.useMemo(
    () => ({
      callId: block.callId,
      toolName: name2,
      block,
      openFile,
      cwd,
      inspect: () => {
        inspectCall(block.callId);
      }
    }),
    [block, name2, openFile, cwd, inspectCall]
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
      entryKey: name2,
      fallback: React2.createElement(FallbackToolCard, { toolName: name2, block, t })
    }),
    children
  );
});
function firstLine2(text) {
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
  const summary = running ? latestLine(text) : firstLine2(text);
  return React2.createElement(
    "div",
    { className: "dshToolGroupThink", "data-variant": "think", "data-state": running ? "running" : "ok" },
    running ? React2.createElement("span", { className: "dshToolGroupVisuallyHidden" }, t("running")) : null,
    React2.createElement(import_dsh_client_ui_primitives.DisclosureRow, {
      rowClassName: "dshToolGroupThinkRow",
      leadingClassName: "dshToolGroupThinkLeading",
      titleClassName: "dshToolGroupThinkTitle",
      chevronClassName: "dshToolGroupThinkChevron",
      icon: React2.createElement(import_dsh_client_ui_primitives.IconThinkOutline14, { size: 14 }),
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
var TurnFoldBar = React2.memo(function TurnFoldBar2({ expanded, onToggle, onKeyDown, t }) {
  const chevron = React2.createElement(expanded ? import_dsh_client_ui_primitives.IconChevronDownOutline14 : import_dsh_client_ui_primitives.IconChevronRightOutline14, {
    className: "dshToolGroupChevron"
  });
  return React2.createElement(
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
    React2.createElement("span", { className: "dshTurnFoldLabel" }, t("turnFolded")),
    chevron
  );
});
var LiveRow = React2.memo(function LiveRow2({ item, cwd, t }) {
  let icon;
  let title;
  let summary;
  if (item.kind === "think") {
    const blocks = item.node.data?.blocks ?? [];
    const reasoning = blocks.filter((block) => block.kind === "reasoning" && (block.text ?? "").trim() !== "");
    const text = reasoning.length > 0 ? reasoning[reasoning.length - 1].text ?? "" : "";
    icon = React2.createElement(import_dsh_client_ui_primitives.IconThinkOutline14, { size: 14 });
    title = "Think";
    summary = latestLine(text);
  } else {
    const block = item.node.data?.root;
    const name2 = block === void 0 ? "" : callName(block);
    const row = runningToolRow(name2, block ?? { callId: item.key, name: name2 }, cwd);
    icon = React2.createElement(name2 === "ask_user_question" ? import_dsh_client_ui_primitives.IconQuestionOutline14 : import_dsh_client_ui_primitives.IconApiOutline14, { size: 14 });
    title = row.title;
    summary = row.summary;
  }
  return React2.createElement(
    React2.Fragment,
    null,
    React2.createElement("span", { className: "dshToolGroupVisuallyHidden" }, t("running")),
    React2.createElement("span", { className: "dshToolGroupLiveIcon" }, icon),
    React2.createElement("span", { className: "dshToolGroupLiveTitle" }, title),
    React2.createElement("span", { className: "dshToolGroupLiveSep", "aria-hidden": true }),
    React2.createElement("span", { className: "dshToolGroupLiveSummary" }, summary)
  );
});
var GroupBar = React2.memo(function GroupBar2({ group, expanded, onToggle, onKeyDown, t, cwd }) {
  const runningItem = group.runningItem;
  const live = runningItem === void 0 ? null : React2.createElement(LiveRow, { item: runningItem, cwd, t });
  const chevron = React2.createElement(expanded ? import_dsh_client_ui_primitives.IconChevronDownOutline14 : import_dsh_client_ui_primitives.IconChevronRightOutline14, {
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
      onKeyDown,
      "data-state": runningItem === void 0 ? "settled" : "running"
    },
    React2.createElement("div", { className: "dshToolGroupLeft" }, live),
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
function FoldedSeat() {
  return React2.createElement("div", { "data-tool-group-hidden": "" });
}
var ToolCallGroupView = React2.memo(function ToolCallGroupView2(props) {
  const { node, useSession, renderSlot, selectedCallId, cwd, openFile, inspectCall, t, sessionId } = props;
  const group = useSession((snapshot) => groupOf(snapshot.chat, node.key), eqGroup);
  const turnInfo = useSession((snapshot) => turnProcessOf(snapshot, node.key), eqTurnProcess);
  const [expanded, setExpanded] = React2.useState(false);
  const turnExpanded = useTurnExpanded(turnInfo === null ? void 0 : `${sessionId ?? ""}:${turnInfo.turn}`);
  const toggle = React2.useCallback(() => setExpanded((value) => !value), []);
  const onKeyDown = React2.useCallback((event) => {
    if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      setExpanded((value) => !value);
    }
  }, []);
  const turnKey = turnInfo === null ? void 0 : `${sessionId ?? ""}:${turnInfo.turn}`;
  const turnToggle = React2.useCallback(() => {
    if (turnKey === void 0) return;
    setTurnExpanded(turnKey, !turnExpanded);
  }, [turnKey, turnExpanded]);
  const turnKeyDown = React2.useCallback(
    (event) => {
      if (event.key === "Enter" || event.key === " ") {
        event.preventDefault();
        turnToggle();
      }
    },
    [turnToggle]
  );
  if (group === null || !isGroupLeader(group, node.key)) {
    return React2.createElement(FoldedSeat, null);
  }
  const small = React2.createElement(
    "div",
    { className: "dshToolGroup", "data-tool-group": "", "data-state": group.runningItem === void 0 ? "settled" : "running" },
    React2.createElement(GroupBar, { group, expanded, onToggle: toggle, onKeyDown, t, cwd }),
    expanded ? React2.createElement(GroupItems, { group, t, renderSlot, selectedCallId, cwd, openFile, inspectCall }) : null
  );
  if (turnInfo !== null && isProcessNode(turnInfo, node.key)) {
    const first = node.key === turnInfo.firstKey;
    if (!turnExpanded) {
      return first ? React2.createElement(TurnFoldBar, { expanded: false, onToggle: turnToggle, onKeyDown: turnKeyDown, t }) : React2.createElement(FoldedSeat, null);
    }
    return React2.createElement(
      React2.Fragment,
      null,
      first ? React2.createElement(TurnFoldBar, { expanded: true, onToggle: turnToggle, onKeyDown: turnKeyDown, t }) : null,
      turnExpanded ? small : null
    );
  }
  return small;
});

// src/client/translate.ts
var groupT;
function setGroupT(t) {
  groupT = t;
}
function getGroupT() {
  return groupT;
}

// src/client/registry.ts
var slotsService;
function setSlotsService(service) {
  slotsService = service;
}
function officialNodeEntry(key) {
  const service = slotsService;
  if (service === void 0) return void 0;
  const all = service.entries("conversation.chat.node");
  return all.find((entry) => entry.options.key === key && (entry.options.priority ?? 0) === 0);
}

// src/client/AssistantNodeWrapper.tsx
function officialAssistantEntry() {
  return officialNodeEntry("assistant-step");
}
function renderOfficial(props) {
  const { node } = props;
  const official = officialAssistantEntry();
  if (official === void 0 || official.component == null) return null;
  const data = node.data;
  const blocks = data?.blocks;
  const filtered = Array.isArray(blocks) ? blocks.filter((b) => b.kind !== "reasoning") : blocks;
  const forwarded = filtered === blocks ? props : { ...props, node: { ...node, data: { ...data, blocks: filtered } } };
  return React3.createElement(official.component, forwarded);
}
function FoldedSeat2() {
  return React3.createElement("div", { "data-tool-group-hidden": "" });
}
var AssistantNodeWrapper = React3.memo(function AssistantNodeWrapper2(props) {
  const { node, useSession, sessionId } = props;
  const group = useSession((snapshot) => isTransparentAssistant(node) ? groupOf(snapshot.chat, node.key) : null, eqGroup);
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
  const t = getGroupT() ?? ((key, params) => params && "count" in params ? String(params.count) : key);
  const thinkContent = group !== null && isGroupLeader(group, node.key) ? React3.createElement(
    React3.Fragment,
    null,
    React3.createElement(GroupBar, { group, expanded, onToggle: toggle, onKeyDown, t }),
    expanded ? React3.createElement(GroupItems, { group, t }) : null
  ) : null;
  if (turnInfo !== null && isTurnSummary(turnInfo, node.key)) {
    return renderOfficial(props);
  }
  if (turnInfo !== null && isProcessNode(turnInfo, node.key)) {
    const first = node.key === turnInfo.firstKey;
    if (!turnExpanded) {
      return first ? React3.createElement(TurnFoldBar, { expanded: false, onToggle: turnToggle, onKeyDown: turnKeyDown, t }) : React3.createElement(FoldedSeat2, null);
    }
    const content = group === null ? renderOfficial(props) : thinkContent;
    if (content === null) {
      return first ? React3.createElement(TurnFoldBar, { expanded: true, onToggle: turnToggle, onKeyDown: turnKeyDown, t }) : React3.createElement(FoldedSeat2, null);
    }
    return React3.createElement(
      React3.Fragment,
      null,
      first ? React3.createElement(TurnFoldBar, { expanded: true, onToggle: turnToggle, onKeyDown: turnKeyDown, t }) : null,
      content
    );
  }
  if (group === null) return renderOfficial(props);
  if (thinkContent === null) return React3.createElement(FoldedSeat2, null);
  return thinkContent;
});

// src/client/UserNodeWrapper.tsx
var React4 = __toESM(require("react"), 1);
var import_dsh_client_ui_primitives2 = require("@deepseek-ai/dsh-client-ui-primitives");
var import_dsh_client_ui_attachment = require("@deepseek-ai/dsh-client-ui-attachment");
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
      parts.push(React4.createElement(import_dsh_client_ui_primitives2.MessageText, { key: `t${cursor}`, text: text.slice(cursor, tokenStart) }));
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
  if (parts.length === 0) return React4.createElement(import_dsh_client_ui_primitives2.MessageText, { text });
  if (cursor < text.length) parts.push(React4.createElement(import_dsh_client_ui_primitives2.MessageText, { key: `t${cursor}`, text: text.slice(cursor) }));
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
    void (0, import_dsh_client_ui_primitives2.writeClipboard)(text).then((ok) => {
      if (!ok) return;
      setCopied(true);
      timer.current = setTimeout(() => setCopied(false), 1e3);
    });
  };
  return React4.createElement(
    import_dsh_client_ui_primitives2.Tooltip,
    { label: copied ? t("copied") : t("copy"), side: "bottom" },
    React4.createElement(
      "button",
      { type: "button", className: "dshUserAction", "aria-label": copied ? t("copied") : t("copy"), onClick: onCopy },
      copied ? React4.createElement(import_dsh_client_ui_primitives2.IconCheckOutline16, null) : React4.createElement(import_dsh_client_ui_primitives2.IconCopyOutline16, null)
    )
  );
}
var UserNodeWrapper = React4.memo(function UserNodeWrapper2(props) {
  const { node, loadImage, t } = props;
  const [expanded, setExpanded] = React4.useState(false);
  const bubbleRef = React4.useRef(null);
  const [overflowing, setOverflowing] = React4.useState(false);
  React4.useEffect(() => {
    const el = bubbleRef.current;
    if (el === null) return;
    const update = () => setOverflowing(el.scrollHeight > el.clientHeight + 1);
    update();
    if (typeof ResizeObserver === "undefined") return;
    const observer = new ResizeObserver(update);
    observer.observe(el);
    return () => observer.disconnect();
  }, [expanded]);
  const toggle = React4.useCallback(() => setExpanded((value) => !value), []);
  const data = node.data ?? {};
  const rawContent = data.content;
  const content = Array.isArray(rawContent) ? rawContent : typeof rawContent === "string" ? [{ type: "text", text: rawContent }] : [];
  const { text, images, rest } = contentParts(content);
  const showBubble = text !== "" || rest.length > 0;
  const translate = t ?? NOOP_T;
  const toolT = getGroupT() ?? translate;
  const labels = imageLabels(translate);
  const showToggle = expanded || overflowing;
  return React4.createElement(
    "div",
    { className: "dshUserRow", "data-time-hover-root": "" },
    React4.createElement(
      "div",
      { className: "dshUserStack" },
      images.length > 0 ? React4.createElement(import_dsh_client_ui_attachment.ImageGallery, {
        images,
        load: loadImage ?? (() => Promise.reject(new Error("image loader unavailable"))),
        align: "end",
        labels
      }) : null,
      showBubble ? React4.createElement(
        "div",
        { ref: bubbleRef, className: "dshUserBubble", "data-clamped": expanded ? void 0 : "" },
        text !== "" ? projectUserText(text) : null,
        ...rest.map(
          (block, index) => React4.createElement(import_dsh_client_ui_primitives2.JsonBlock, {
            key: `extra${index}`,
            label: translate("message.extraBlock"),
            payload: block,
            truncatedLabel: (total) => translate("json.truncated", { total })
          })
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
        React4.createElement(expanded ? import_dsh_client_ui_primitives2.IconChevronUpOutline14 : import_dsh_client_ui_primitives2.IconChevronDownOutline14, { size: 14 }),
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
});

// src/client/NoticeNodeWrapper.tsx
var React5 = __toESM(require("react"), 1);
var NOTICE_KINDS = /* @__PURE__ */ new Set(["compaction", "context", "manual-compaction", "command"]);
function singleGroup(node) {
  return { leaderKey: node.key, itemKeys: [node.key], items: [], count: 1, running: void 0, runningItem: void 0 };
}
function FoldedSeat3() {
  return React5.createElement("div", { "data-tool-group-hidden": "" });
}
var NoticeNodeWrapper = React5.memo(function NoticeNodeWrapper2(props) {
  const { node, useSession, sessionId } = props;
  const turnInfo = useSession((snapshot) => turnProcessOf(snapshot, node.key), eqTurnProcess);
  const [expanded, setExpanded] = React5.useState(false);
  const turnExpanded = useTurnExpanded(turnInfo === null ? void 0 : `${sessionId ?? ""}:${turnInfo.turn}`);
  const toggle = React5.useCallback(() => setExpanded((value) => !value), []);
  const onKeyDown = React5.useCallback((event) => {
    if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      setExpanded((value) => !value);
    }
  }, []);
  const turnKey = turnInfo === null ? void 0 : `${sessionId ?? ""}:${turnInfo.turn}`;
  const turnToggle = React5.useCallback(() => {
    if (turnKey === void 0) return;
    setTurnExpanded(turnKey, !turnExpanded);
  }, [turnKey, turnExpanded]);
  const turnKeyDown = React5.useCallback(
    (event) => {
      if (event.key === "Enter" || event.key === " ") {
        event.preventDefault();
        turnToggle();
      }
    },
    [turnToggle]
  );
  const t = getGroupT() ?? ((key, params) => params && "count" in params ? String(params.count) : key);
  if (!NOTICE_KINDS.has(node.kind)) return React5.createElement(FoldedSeat3, null);
  const official = officialNodeEntry(node.kind);
  const officialContent = official === void 0 || official.component == null ? null : React5.createElement(official.component, props);
  if (officialContent === null) return React5.createElement(FoldedSeat3, null);
  const group = singleGroup(node);
  const bar = React5.createElement(GroupBar, { group, expanded, onToggle: toggle, onKeyDown, t });
  if (turnInfo !== null && isTurnSummary(turnInfo, node.key)) {
    return officialContent;
  }
  if (turnInfo !== null && isProcessNode(turnInfo, node.key)) {
    const first = node.key === turnInfo.firstKey;
    if (!turnExpanded) {
      return first ? React5.createElement(TurnFoldBar, { expanded: false, onToggle: turnToggle, onKeyDown: turnKeyDown, t }) : React5.createElement(FoldedSeat3, null);
    }
    return React5.createElement(
      React5.Fragment,
      null,
      first ? React5.createElement(TurnFoldBar, { expanded: true, onToggle: turnToggle, onKeyDown: turnKeyDown, t }) : null,
      React5.createElement(
        "div",
        { className: "dshToolGroup", "data-tool-group": "", "data-notice": "" },
        bar,
        expanded ? React5.createElement("div", { className: "dshToolGroupItems" }, officialContent) : null
      )
    );
  }
  return React5.createElement(
    "div",
    { className: "dshToolGroup", "data-tool-group": "", "data-notice": "" },
    bar,
    expanded ? React5.createElement("div", { className: "dshToolGroupItems" }, officialContent) : null
  );
});

// src/client/styles.ts
var CSS = `
.dshTurnFoldRow{
  display:flex;align-items:center;justify-content:space-between;gap:12px;
  min-width:0;height:24px;box-sizing:border-box;padding:0 8px;border-radius:6px;
  cursor:pointer;user-select:none;outline:none;
  font-size:14px;line-height:24px;
  border:1px dashed var(--dsw-alias-border-l2);
}
.dshTurnFoldRow:hover,
.dshTurnFoldRow:focus-visible{
  background:var(--dsw-alias-interactive-bg-hover);
  border-color:var(--dsw-alias-border-l3);
}
.dshTurnFoldLabel{
  min-width:0;color:var(--dsw-alias-label-secondary);
  white-space:nowrap;overflow:hidden;text-overflow:ellipsis;
  font-size:14px;line-height:24px;
}
[data-chat-flow-key]:has([data-tool-group-hidden]){display:none}
.dshToolGroupRow{
  display:flex;align-items:center;gap:12px;min-width:0;height:24px;
  box-sizing:border-box;padding:0 8px;border-radius:6px;
  cursor:pointer;user-select:none;outline:none;
  font-size:14px;line-height:24px;position:relative;overflow:hidden;
}
.dshToolGroupRow:hover,
.dshToolGroupRow:focus-visible{
  background:var(--dsw-alias-interactive-bg-hover);
}
.dshToolGroupRow[data-state=running]:after{
  content:"";inset-block:0;pointer-events:none;width:300px;
  background:linear-gradient(90deg, transparent 0%, color-mix(in srgb, var(--dsw-alias-bg-base) 60%, transparent) 55%, transparent 100%);
  animation:2.6s ease-out infinite dshToolGroup-reasoning-sweep;
  position:absolute;left:0;
}
.dshToolGroupLeft{
  display:flex;align-items:center;gap:6px;min-width:0;flex:1 1 auto;overflow:hidden;
}
.dshToolGroupLiveIcon{color:var(--dsw-alias-label-secondary);flex:none;display:inline-flex}
.dshToolGroupLiveTitle{
  color:var(--dsw-alias-label-secondary);flex:none;
  white-space:nowrap;font-size:14px;line-height:24px;
}
.dshToolGroupLiveSep{
  background:var(--dsw-alias-label-caption);border-radius:1px;flex:none;
  width:2px;height:2px;margin:0 4px;
}
.dshToolGroupLiveSummary{
  min-width:0;color:var(--dsw-alias-label-tertiary);text-overflow:ellipsis;
  white-space:nowrap;flex:auto;font-size:14px;line-height:24px;overflow:hidden;
}
.dshToolGroupRight{
  display:flex;align-items:center;gap:6px;flex:none;
}
.dshToolGroupCount{
  color:var(--dsw-alias-label-tertiary);
  font-size:14px;line-height:24px;font-variant-numeric:tabular-nums;
}
.dshToolGroupChevron{
  color:var(--dsw-alias-label-secondary);display:inline-flex;flex:none;
}
.dshToolGroupItems{
  display:flex;flex-direction:column;gap:16px;margin-top:16px;
}
.dshToolGroupThink{flex-direction:column;display:flex}
.dshToolGroupThinkRow{position:relative;overflow:hidden}
.dshToolGroupThink[data-state=running] .dshToolGroupThinkRow:after{
  content:"";inset-block:0;
  background:linear-gradient(90deg, transparent 0%, color-mix(in srgb, var(--dsw-alias-bg-base) 60%, transparent) 55%, transparent 100%);
  pointer-events:none;width:300px;
  animation:2.6s ease-out infinite dshToolGroup-reasoning-sweep;
  position:absolute;left:0;
}
@keyframes dshToolGroup-reasoning-sweep{0%{left:-300px}90%,to{left:100%}}
.dshToolGroupThinkLeading{flex-shrink:0}
.dshToolGroupThinkChevron{color:var(--dsw-alias-label-secondary)}
.dshToolGroupThinkTitle{font-weight:400}
.dshToolGroupThinkSeparator{
  background:var(--dsw-alias-label-caption);border-radius:1px;flex:none;
  width:2px;height:2px;margin:0 8px;
}
.dshToolGroupThinkSummary{
  min-width:0;color:var(--dsw-alias-label-tertiary);text-overflow:ellipsis;
  white-space:nowrap;flex:auto;font-size:14px;line-height:24px;overflow:hidden;
}
.dshToolGroupThinkSummary[data-follow-end]{text-overflow:clip}
.dshToolGroupThinkBody{
  color:var(--dsw-alias-label-tertiary);white-space:pre-wrap;word-break:break-word;
  padding:4px 0 4px 22px;font-size:14px;line-height:24px;
}
.dshToolGroupVisuallyHidden{
  clip:rect(0 0 0 0);white-space:nowrap;width:1px;height:1px;
  position:absolute;overflow:hidden;
}
@media (prefers-reduced-motion:reduce){
  .dshToolGroupThink[data-state=running] .dshToolGroupThinkRow:after,
  .dshToolGroupRow[data-state=running]:after{animation:none}
}
.dshToolGroupCallRow{border-radius:6px}
.dshToolGroupSubCalls{
  border-left:1px solid var(--dsw-alias-border-l2);
  flex-direction:column;gap:4px;margin:4px 0 2px 22px;padding-left:8px;display:flex;
}
.dshToolGroupFallback{
  border:1px solid var(--dsw-alias-border-l1);
  background:var(--dsw-alias-bg-base);
  border-radius:6px;flex-direction:column;gap:4px;padding:8px 10px;display:flex;
}
.dshToolGroupFallbackTitle{
  color:var(--dsw-alias-label-primary);
  font-size:13px;font-weight:500;line-height:20px;
}
.dshToolGroupFallbackArgs{
  color:var(--dsw-alias-label-secondary);
  font-family:var(--ds-font-family-code);
  white-space:pre-wrap;word-break:break-word;
  font-size:12px;line-height:18px;margin:0;
}
.dshToolGroupFallbackOutput{
  color:var(--dsw-alias-label-secondary);
  font-family:var(--ds-font-family-code);
  white-space:pre-wrap;word-break:break-word;
  background:var(--dsw-alias-markdown-code-block);
  border-radius:8px;margin:0;padding:8px 10px;
  font-size:12px;line-height:18px;
}
.dshToolGroupFallbackOutput[data-error=true]{color:var(--dsw-alias-state-error-primary)}
/* ------------------------------------------------------------------ */
/* User message: product UserStyleBubble replica + 3-line fold.        */
/* ------------------------------------------------------------------ */
.dshUserRow{flex-direction:column;align-items:flex-end;gap:6px;display:flex}
.dshUserStack{flex-direction:column;align-items:flex-end;gap:8px;min-width:0;max-width:min(525px,82%);display:flex}
.dshUserBubble{background:var(--dsw-specific-bubble);max-width:100%;color:var(--dsw-alias-label-primary);border-radius:22px;padding:10px 16px;font-size:16px;line-height:24px}
.dshUserBubble[data-clamped]{
  display:-webkit-box;-webkit-box-orient:vertical;-webkit-line-clamp:3;
  overflow:hidden;
}
.dshUserRefChip{
  color:var(--dsw-alias-label-primary);white-space:nowrap;vertical-align:baseline;
  background:#6187d838;border-radius:6px;margin:0 2px;padding:0 8px;
  font-size:.85em;line-height:1.6;display:inline-block;
}
.dshUserFoldToggle{
  display:inline-flex;align-items:center;gap:4px;height:22px;padding:0 8px;
  color:var(--dsw-alias-label-tertiary);font-size:12px;line-height:22px;
  background:none;border:none;border-radius:6px;cursor:pointer;outline:none;
  font-family:inherit;user-select:none;
}
.dshUserFoldToggle:not([data-shown]){display:none}
.dshUserFoldToggle:hover,
.dshUserFoldToggle:focus-visible{
  color:var(--dsw-alias-label-secondary);background:var(--dsw-alias-interactive-bg-hover);
}
.dshUserActions{align-items:center;gap:10px;height:28px;display:flex}
.dshUserTime{color:var(--dsw-alias-label-tertiary);white-space:nowrap;padding-right:12px;font-size:14px;line-height:24px}
@media (hover:hover){
  [data-time-hover-root] .dshUserTime{opacity:0;transition:opacity 80ms}
  [data-time-hover-root]:hover .dshUserTime,
  [data-time-hover-root]:focus-within .dshUserTime{opacity:1}
}
.dshUserAction{
  width:28px;height:28px;color:var(--dsw-alias-label-tertiary);cursor:pointer;
  background:0 0;border:none;border-radius:28px;justify-content:center;
  align-items:center;padding:6px;display:inline-flex;
}
.dshUserAction:hover{
  background:var(--dsw-alias-interactive-bg-hover);color:var(--dsw-alias-label-secondary);
}
`;
var STYLE_ID = "dsh-tool-group/styles";
function insertStyle(doc) {
  const existing = doc.querySelector(`style[data-plugin-css="${STYLE_ID}"]`);
  if (existing !== null) {
    return () => {
    };
  }
  const tag = doc.createElement("style");
  tag.setAttribute("data-plugin", "dsh-tool-group");
  tag.setAttribute("data-plugin-css", STYLE_ID);
  tag.textContent = CSS;
  doc.head.appendChild(tag);
  let removed = false;
  return () => {
    if (removed) return;
    removed = true;
    tag.remove();
  };
}

// src/client/slots-core-overlay.ts
function sameSpec(left, right) {
  if (left === right) return true;
  if (typeof left !== "object" || typeof right !== "object" || left === null || right === null) return false;
  const a = left;
  const b = right;
  const ka = Object.keys(a);
  const kb = Object.keys(b);
  if (ka.length !== kb.length) return false;
  return ka.every((key) => a[key] === b[key]);
}
function installSlotCoreOverlay(SlotCore2) {
  const originalRegister = SlotCore2.prototype.register;
  const originalRelease = SlotCore2.prototype.releaseEntry;
  if (typeof originalRegister !== "function" || typeof originalRelease !== "function") {
    throw new Error("dsh-tool-group: SlotCore.register/releaseEntry are not functions; refusing to install the overlay (plugin stays inert)");
  }
  const coOwners = /* @__PURE__ */ new Map();
  const wrappedRegister = function(options, component) {
    let coSpecs = null;
    let forwarded = options;
    if (options?.children) {
      for (const childKey of Object.keys(options.children)) {
        const childRec = this.records.get(childKey);
        if (childRec === void 0) continue;
        const existing = childRec.spec;
        if (existing === void 0) continue;
        if (!sameSpec(existing, options.children[childKey])) {
          return originalRegister.call(this, options, component);
        }
        if (coSpecs === null) coSpecs = {};
        coSpecs[childKey] = options.children[childKey];
      }
      if (coSpecs !== null) {
        const rest = { ...options.children };
        for (const key of Object.keys(coSpecs)) delete rest[key];
        forwarded = Object.keys(rest).length > 0 ? { ...options, children: rest } : { ...options, children: void 0 };
      }
    }
    const rec = this.records.get(options.name);
    const before = rec?.entries;
    const dispose = originalRegister.call(this, forwarded, component);
    if (coSpecs === null) return dispose;
    const after = this.records.get(options.name)?.entries;
    const created = Array.isArray(after) ? after.find((e) => !Array.isArray(before) || !before.includes(e)) : void 0;
    if (created === void 0) {
      dispose();
      throw new Error("dsh-tool-group: could not locate the entry created by SlotCore.register; refusing the shadow (official UI keeps rendering)");
    }
    const entry = created;
    entry.children = { ...entry.children ?? {}, ...coSpecs };
    for (const childKey of Object.keys(coSpecs)) {
      let owners = coOwners.get(childKey);
      if (owners === void 0) {
        owners = /* @__PURE__ */ new Set();
        coOwners.set(childKey, owners);
      }
      owners.add(entry);
    }
    return dispose;
  };
  const wrappedRelease = function(entry) {
    if (!entry.children) {
      originalRelease.call(this, entry);
      return;
    }
    let stripped = null;
    for (const childKey of Object.keys(entry.children)) {
      const owners = coOwners.get(childKey);
      if (owners !== void 0 && owners.has(entry)) {
        owners.delete(entry);
        if (owners.size === 0) coOwners.delete(childKey);
        if (stripped === null) stripped = { ...entry.children };
        delete stripped[childKey];
      }
    }
    if (stripped === null) {
      originalRelease.call(this, entry);
      return;
    }
    const pristine = entry.children;
    entry.children = Object.keys(stripped).length > 0 ? stripped : void 0;
    try {
      originalRelease.call(this, entry);
    } finally {
      entry.children = pristine;
    }
  };
  SlotCore2.prototype.register = wrappedRegister;
  SlotCore2.prototype.releaseEntry = wrappedRelease;
  return () => {
    if (SlotCore2.prototype.register === wrappedRegister) SlotCore2.prototype.register = originalRegister;
    if (SlotCore2.prototype.releaseEntry === wrappedRelease) SlotCore2.prototype.releaseEntry = originalRelease;
  };
}

// src/client/index.ts
var DICTS = {
  zh: { running: "\u6B63\u5728\u8FD0\u884C", group: "\u5DE5\u5177\u8C03\u7528\u7EC4", folded: "{count} \u4E2A\u5757\u5DF2\u88AB\u6298\u53E0", turnFolded: "\u8BE5\u8F6E\u6B21\u5DE5\u4F5C\u8FC7\u7A0B\u5DF2\u6298\u53E0", expand: "\u5C55\u5F00", collapse: "\u6536\u8D77" },
  en: { running: "Running", group: "tool call group", folded: "{count} blocks folded", turnFolded: "Turn work process folded", expand: "Expand", collapse: "Collapse" }
};
var name = "tool-group";
var inject = ["slots", "locale"];
function apply(ctx) {
  const slots = ctx.get("slots");
  const locale = ctx.get("locale");
  if (slots === void 0 || locale === void 0 || typeof document === "undefined") return;
  const restoreOverlay = installSlotCoreOverlay(import_dsh_client_ui_slots.SlotCore);
  ctx.effect(() => restoreOverlay, "dsh-tool-group: slot-core overlay");
  setSlotsService(slots);
  setGroupT(locale.bind("tool-group"));
  ctx.effect(() => locale.register("tool-group", DICTS), "dsh-tool-group: dictionaries");
  ctx.effect(() => insertStyle(document), "dsh-tool-group: styles");
  ctx.effect(
    () => slots.register(
      {
        name: "conversation.chat.node",
        key: "tool-call",
        priority: -100,
        locale: "tool-group",
        children: {
          "tool.call.toolview": { kind: "keyed", scope: "session" }
        }
      },
      ToolCallGroupView
    ),
    "dsh-tool-group: tool-call shadow"
  );
  ctx.effect(
    () => slots.register(
      {
        name: "conversation.chat.node",
        key: "assistant-step",
        priority: -100,
        locale: "conversation"
      },
      AssistantNodeWrapper
    ),
    "dsh-tool-group: assistant-step shadow"
  );
  ctx.effect(
    () => slots.register(
      {
        name: "conversation.chat.node",
        key: "user",
        priority: -100,
        locale: "conversation"
      },
      UserNodeWrapper
    ),
    "dsh-tool-group: user shadow"
  );
  for (const key of ["compaction", "context", "manual-compaction", "command"]) {
    ctx.effect(
      () => slots.register(
        {
          name: "conversation.chat.node",
          key,
          priority: -100,
          locale: "conversation",
          ...key === "command" ? { children: { "conversation.chat.commandview": { kind: "keyed", scope: "session" } } } : {}
        },
        NoticeNodeWrapper
      ),
      `dsh-tool-group: ${key} shadow`
    );
  }
}
return module.exports;
  }
});

