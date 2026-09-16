window.__ModuleLoader__.load({
  id: 'dsh-fold',
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
var TURN_PROCESS_NODE_KIND = "turn-process";
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
var INLINE_NOTICE_KINDS = /* @__PURE__ */ new Set([
  "context",
  "compaction",
  "manual-compaction",
  "command",
  "unknown",
  "workflow-run"
]);
function isInlineNoticeNode(node) {
  return node !== void 0 && INLINE_NOTICE_KINDS.has(node.kind);
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
function latestWorkNode(snapshot) {
  const order = snapshot.order;
  for (let i = order.length - 1; i >= 0; i -= 1) {
    const node = snapshot.nodes.get(order[i]);
    if (node === void 0) continue;
    if (node.kind === TOOL_KIND || isTransparentAssistant(node)) {
      return isLiveWorkNode(node) ? node : void 0;
    }
    return void 0;
  }
  return void 0;
}
function isLiveWorkNode(node) {
  if (node === void 0) return false;
  if (node.kind === TOOL_KIND) return isRunningBlock(node.data?.root);
  return node.data?.status === "running";
}
function callName(block) {
  return "kind" in block ? block.call?.name ?? "" : block.name;
}
function continuesRun(node, anchor) {
  if (!sameTurn(node, anchor)) return false;
  return node.kind === TOOL_KIND || node.kind === TURN_PROCESS_NODE_KIND || isTransparentAssistant(node) || isInlineNoticeNode(node);
}
function groupOf(snapshot, nodeKey) {
  const order = snapshot.order;
  const idx = order.indexOf(nodeKey);
  if (idx < 0) return null;
  const node = snapshot.nodes.get(nodeKey);
  if (node === void 0 || node.kind !== TOOL_KIND && !isTransparentAssistant(node) && !isInlineNoticeNode(node)) return null;
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
    if (member.kind === TURN_PROCESS_NODE_KIND) continue;
    const transparent = isTransparentAssistant(member);
    if (member.kind === TOOL_KIND) {
      if (firstToolKey === void 0) firstToolKey = key;
      items.push({ kind: "tool", key, node: member });
    } else if (transparent) {
      items.push({ kind: "think", key, node: member });
    } else if (isInlineNoticeNode(member)) {
      items.push({ kind: "notice", cell: member.kind, key, node: member });
    }
  }
  let leaderKey = firstToolKey;
  if (leaderKey === void 0) {
    for (const key of keys) {
      const member = snapshot.nodes.get(key);
      if (member !== void 0 && member.kind !== TURN_PROCESS_NODE_KIND) {
        leaderKey = key;
        break;
      }
    }
  }
  if (leaderKey === void 0) return null;
  let running;
  let runningToolItem;
  let runningThinkItem;
  for (const item of items) {
    if (item.kind !== "tool") {
      if (runningThinkItem === void 0 && isLiveWorkNode(item.node)) runningThinkItem = item;
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

// src/client/AutoLoadHost.tsx
var React = __toESM(require("react"), 1);

// src/client/auto-load.ts
var sessionsService;
var attachedHosts = /* @__PURE__ */ new Map();
var inFlight = /* @__PURE__ */ new Set();
function setSessionsService(service) {
  sessionsService = service;
}
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
var AutoLoadHost = React.memo(function AutoLoadHost2({ sessionId, hasMore, loadingOlder, children }) {
  const hostRef = React.useRef(null);
  React.useEffect(() => {
    const el = hostRef.current;
    if (el === null || sessionId === void 0) return;
    return attachAutoLoad(el, sessionId, hasMore, loadingOlder);
  }, [sessionId, hasMore, loadingOlder]);
  if (children === null || children === void 0) return null;
  if (sessionId === void 0) return children;
  return React.createElement("div", { ref: hostRef, className: "dshAutoHost", "data-dsh-autoload": "" }, children);
});

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
var conversationT;
function setConversationT(t) {
  conversationT = t;
}
function getConversationT() {
  return conversationT;
}
var chatT;
function setChatT(t) {
  chatT = t;
}
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
  loadImage,
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
      loadImage,
      cwd,
      inspect: () => {
        inspectCall(block.callId);
      }
    }),
    [block, name2, openFile, loadImage, cwd, inspectCall]
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
        loadImage,
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
  const running = isLiveWorkNode(item.node);
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
var LiveRow = React2.memo(function LiveRow2({ node, cwd, t }) {
  let icon;
  let title;
  let summary;
  const think = isTransparentAssistant(node);
  const running = isLiveWorkNode(node);
  if (think) {
    const blocks = node.data?.blocks ?? [];
    const reasoning = blocks.filter((block) => block.kind === "reasoning" && (block.text ?? "").trim() !== "");
    const text = reasoning.length > 0 ? reasoning[reasoning.length - 1].text ?? "" : "";
    icon = React2.createElement(import_dsh_client_ui_primitives.IconThinkOutline14, { size: 14 });
    title = "Think";
    summary = running ? latestLine(text) : firstLine2(text);
  } else {
    const block = node.data?.root;
    const name2 = block === void 0 ? "" : callName(block);
    const row = runningToolRow(name2, block ?? { callId: node.key, name: name2 }, cwd);
    icon = React2.createElement(name2 === "ask_user_question" ? import_dsh_client_ui_primitives.IconQuestionOutline14 : import_dsh_client_ui_primitives.IconApiOutline14, { size: 14 });
    title = row.title;
    summary = row.summary;
  }
  return React2.createElement(
    React2.Fragment,
    null,
    running ? React2.createElement("span", { className: "dshToolGroupVisuallyHidden" }, t("running")) : null,
    React2.createElement("span", { className: "dshToolGroupLiveIcon" }, icon),
    React2.createElement("span", { className: "dshToolGroupLiveTitle" }, title),
    React2.createElement("span", { className: "dshToolGroupLiveSep", "aria-hidden": true }),
    React2.createElement("span", { className: "dshToolGroupLiveSummary" }, summary)
  );
});
var GroupBar = React2.memo(function GroupBar2({ group, expanded, onToggle, onKeyDown, t, cwd, live }) {
  const liveShown = live !== void 0 && !expanded && group.itemKeys.includes(live.key);
  const liveRunning = liveShown && isLiveWorkNode(live);
  const liveNode = liveShown ? React2.createElement(LiveRow, { node: live, cwd, t }) : null;
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
      "data-state": liveRunning ? "running" : "settled"
    },
    React2.createElement("div", { className: "dshToolGroupLeft" }, liveNode),
    React2.createElement(
      "div",
      { className: "dshToolGroupRight" },
      React2.createElement("span", { className: "dshToolGroupCount" }, t("folded", { count: group.count })),
      chevron
    )
  );
});
var DelegatedNoticeItem = React2.memo(function DelegatedNoticeItem2({ item, conversationT: conversationT2 }) {
  const t = conversationT2 ?? getConversationT();
  if (t === void 0) return null;
  if (item.cell === "workflow-run") {
    const data = item.node.data ?? {};
    return React2.createElement(
      "div",
      { className: "dshWorkflowRunItem" },
      React2.createElement("span", { className: "dshWorkflowRunTitle" }, data.name ?? "workflow"),
      data.status !== void 0 ? React2.createElement("span", { className: "dshWorkflowRunStatus" }, String(data.status)) : null
    );
  }
  const official = officialNodeEntry(item.cell);
  if (official === void 0 || official.component == null) return null;
  if (item.cell === "command") {
    const renderSlot = (_key, _owner, opts) => opts?.fallback ?? null;
    return React2.createElement(official.component, { node: item.node, t, renderSlot });
  }
  return React2.createElement(official.component, { node: item.node, t });
});
var GroupItems = React2.memo(function GroupItems2(props) {
  const { group, t, renderSlot, selectedCallId, cwd, openFile, loadImage, inspectCall, conversationT: conversationT2 } = props;
  return React2.createElement(
    "div",
    { className: "dshToolGroupItems" },
    group.items.map((item) => {
      if (item.kind === "think") {
        return React2.createElement(ThinkItem, { key: item.key, item, t });
      }
      if (item.kind === "notice") {
        return React2.createElement(DelegatedNoticeItem, { key: item.key, item, conversationT: conversationT2 });
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
        loadImage,
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
  const { node, useSession, renderSlot, selectedCallId, cwd, openFile, loadImage, inspectCall, t, sessionId } = props;
  const { chat, hasMore, loadingOlder } = useSnapshotFace(props);
  const group = React2.useMemo(() => groupOf(chat, node.key), [chat, node]);
  const live = React2.useMemo(() => latestWorkNode(chat), [chat]);
  const conversationT2 = getConversationT();
  const [expanded, setExpanded] = React2.useState(false);
  const toggle = React2.useCallback(() => setExpanded((value) => !value), []);
  const onKeyDown = React2.useCallback((event) => {
    if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      setExpanded((value) => !value);
    }
  }, []);
  let output;
  if (group === null || !isGroupLeader(group, node.key)) {
    output = React2.createElement(FoldedSeat, null);
  } else {
    output = React2.createElement(
      "div",
      { className: "dshToolGroup", "data-tool-group": "", "data-state": live !== void 0 && !expanded && group.itemKeys.includes(live.key) && isLiveWorkNode(live) ? "running" : "settled" },
      React2.createElement(GroupBar, { group, expanded, onToggle: toggle, onKeyDown, t, cwd, live }),
      expanded ? React2.createElement(GroupItems, { group, t, renderSlot, selectedCallId, cwd, openFile, loadImage, inspectCall, conversationT: conversationT2 }) : null
    );
  }
  return React2.createElement(AutoLoadHost, { sessionId, hasMore, loadingOlder }, output);
});

// src/client/translate.ts
var groupT;
function setGroupT(t) {
  groupT = t;
}
function getGroupT() {
  return groupT;
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
  const forwardedBase = { ...props, t: compositeT(getChatT(), typeof props.t === "function" ? props.t : void 0) };
  const forwarded = filtered === blocks ? forwardedBase : { ...forwardedBase, node: { ...node, data: { ...data, blocks: filtered } } };
  return React3.createElement(official.component, forwarded);
}
function FoldedSeat2() {
  return React3.createElement("div", { "data-tool-group-hidden": "" });
}
var AssistantNodeWrapper = React3.memo(function AssistantNodeWrapper2(props) {
  const { node, useSession, sessionId } = props;
  const seatT = typeof props.t === "function" ? props.t : void 0;
  setConversationT(compositeT(getChatT(), seatT));
  const { chat, hasMore, loadingOlder } = useSnapshotFace(props);
  const group = React3.useMemo(() => isTransparentAssistant(node) ? groupOf(chat, node.key) : null, [chat, node]);
  const live = React3.useMemo(() => latestWorkNode(chat), [chat]);
  const [expanded, setExpanded] = React3.useState(false);
  const toggle = React3.useCallback(() => setExpanded((value) => !value), []);
  const onKeyDown = React3.useCallback((event) => {
    if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      setExpanded((value) => !value);
    }
  }, []);
  const t = getGroupT() ?? ((key, params) => params && "count" in params ? String(params.count) : key);
  const groupConversationT = compositeT(getChatT(), seatT);
  const thinkContent = group !== null && isGroupLeader(group, node.key) ? React3.createElement(
    React3.Fragment,
    null,
    React3.createElement(GroupBar, { group, expanded, onToggle: toggle, onKeyDown, t, live }),
    expanded ? React3.createElement(GroupItems, { group, t, conversationT: groupConversationT }) : null
  ) : null;
  let output;
  if (group === null) {
    output = renderOfficial(props);
  } else if (thinkContent === null) {
    output = React3.createElement(FoldedSeat2, null);
  } else {
    output = thinkContent;
  }
  return React3.createElement(AutoLoadHost, { sessionId, hasMore, loadingOlder }, output);
});

// src/client/UserNodeWrapper.tsx
var React4 = __toESM(require("react"), 1);
var import_dsh_client_ui_primitives2 = require("@deepseek-ai/dsh-client-ui-primitives");
var import_dsh_client_ui_attachment = require("@deepseek-ai/dsh-client-ui-attachment");
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
function extensionOf(name2) {
  if (typeof import_dsh_client_ui_primitives2.fileExtension === "function") return (0, import_dsh_client_ui_primitives2.fileExtension)(name2).toUpperCase().slice(0, 8);
  const dot = name2.lastIndexOf(".");
  if (dot <= 0 || dot === name2.length - 1) return "";
  return name2.slice(dot + 1).toUpperCase().slice(0, 8);
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
  return typeof import_dsh_client_ui_primitives2.fileSizeText === "function" ? (0, import_dsh_client_ui_primitives2.fileSizeText)(bytes) : fileSizeTextLocal(bytes);
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
function FileCard({ file }) {
  const meta = [extensionOf(file.name), fileSize(file.bytes)].filter(Boolean).join(" ");
  return React4.createElement(
    "span",
    { className: "dshUserFileCard", title: file.name },
    typeof import_dsh_client_ui_primitives2.FileTypeIcon === "function" ? React4.createElement(import_dsh_client_ui_primitives2.FileTypeIcon, { path: file.name, className: "dshUserFileIcon" }) : null,
    React4.createElement(
      "span",
      { className: "dshUserFileContent" },
      React4.createElement("span", { className: "dshUserFileName" }, file.name),
      meta !== "" ? React4.createElement("span", { className: "dshUserFileMeta" }, meta) : null
    )
  );
}
var UserNodeWrapper = React4.memo(function UserNodeWrapper2(props) {
  const { node, loadImage, renderMessageImages, openFile, openSkill, t, sessionId } = props;
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
  const references = typeof openFile === "function" ? {
    openFile,
    openSkill: typeof openSkill === "function" ? openSkill : () => {
    }
  } : void 0;
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
    return React4.createElement(import_dsh_client_ui_attachment.ImageGallery, {
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
          text !== "" ? (0, import_dsh_client_ui_primitives2.projectUserText)(text, data.referenceLabels ?? [], data.skillNames ?? [], "skill", references) : null,
          ...extraRest.map(
            (block, index) => React4.createElement(import_dsh_client_ui_primitives2.JsonBlock, {
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
  return React4.createElement(AutoLoadHost, { sessionId, hasMore, loadingOlder }, output);
});

// src/client/NoticeNodeWrapper.tsx
var React5 = __toESM(require("react"), 1);
var NOTICE_KINDS = /* @__PURE__ */ new Set([
  "compaction",
  "context",
  "manual-compaction",
  "command",
  "model-retry",
  "turn-error",
  "turn-max-tokens",
  "unknown",
  "workflow-run"
]);
var UNFOLDED_NOTICE_KINDS = /* @__PURE__ */ new Set(["turn-error", "turn-max-tokens", "model-retry"]);
function FoldedSeat3() {
  return React5.createElement("div", { "data-tool-group-hidden": "" });
}
var NoticeNodeWrapper = React5.memo(function NoticeNodeWrapper2(props) {
  const { node, useSession, sessionId } = props;
  const { chat, hasMore, loadingOlder } = useSnapshotFace(props);
  const inlineGroup = React5.useMemo(
    () => isInlineNoticeNode(node) ? groupOf(chat, node.key) : null,
    [chat, node]
  );
  const live = React5.useMemo(() => latestWorkNode(chat), [chat]);
  const [expanded, setExpanded] = React5.useState(false);
  const toggle = React5.useCallback(() => setExpanded((value) => !value), []);
  const onKeyDown = React5.useCallback((event) => {
    if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      setExpanded((value) => !value);
    }
  }, []);
  const t = getGroupT() ?? ((key, params) => params && "count" in params ? String(params.count) : key);
  const seatT = typeof props.t === "function" ? props.t : void 0;
  setConversationT(compositeT(getChatT(), seatT));
  let output;
  if (!NOTICE_KINDS.has(node.kind)) {
    output = React5.createElement(FoldedSeat3, null);
  } else if (UNFOLDED_NOTICE_KINDS.has(node.kind)) {
    const official = officialNodeEntry(node.kind);
    const conversationT2 = compositeT(getChatT(), seatT);
    output = official !== void 0 && official.component != null && conversationT2 !== void 0 ? React5.createElement(official.component, { node, t: conversationT2 }) : React5.createElement(FoldedSeat3, null);
  } else if (inlineGroup === null || !isGroupLeader(inlineGroup, node.key)) {
    output = React5.createElement(FoldedSeat3, null);
  } else {
    const g = inlineGroup;
    const official = officialNodeEntry(node.kind);
    if (g.count === 1 && (official === void 0 || official.component == null)) {
      output = React5.createElement(FoldedSeat3, null);
    } else {
      const conversationT2 = compositeT(getChatT(), seatT);
      output = React5.createElement(
        "div",
        { className: "dshToolGroup", "data-tool-group": "", "data-notice": "" },
        React5.createElement(GroupBar, { group: g, expanded, onToggle: toggle, onKeyDown, t, live }),
        expanded ? React5.createElement(GroupItems, { group: g, t, conversationT: conversationT2 }) : null
      );
    }
  }
  return React5.createElement(AutoLoadHost, { sessionId, hasMore, loadingOlder }, output);
});

// src/client/styles.ts
var CSS = `
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
.dshWorkflowRunItem{display:flex;align-items:center;gap:8px;font-size:14px;line-height:24px;color:var(--dsw-alias-label-secondary)}
.dshWorkflowRunStatus{color:var(--dsw-alias-label-tertiary)}
/* ------------------------------------------------------------------ */
/* User message: product UserStyleBubble replica + 3-line fold.        */
/* ------------------------------------------------------------------ */
.dshUserRow{flex-direction:column;align-items:flex-end;gap:6px;display:flex}
.dshUserStack{flex-direction:column;align-items:flex-end;gap:8px;min-width:0;max-width:min(525px,82%);display:flex}
.dshUserBubble{background:var(--dsw-specific-bubble);max-width:100%;color:var(--dsw-alias-label-primary);border-radius:22px;padding:10px 16px;font-size:16px;line-height:24px}
/* The clamp lives on a PADDING-FREE inner box so every browser renders
   exactly 3 lines and keeps the bubble's 10px bottom gap: max-height:72px
   is 3 \xD7 24px and clips any partial line a legacy line-clamp would show. */
.dshUserBubbleClamp[data-clamped]{
  display:-webkit-box;-webkit-box-orient:vertical;-webkit-line-clamp:3;
  overflow:hidden;max-height:72px;
}
/* Attachment row (0.1.3+ content shape, still current on 0.1.5): image
   tiles handled by the official gallery slot, generic-file cards by the
   replica below. */
.dshUserAttachmentRow{
  display:flex;flex-wrap:wrap;justify-content:flex-end;
  gap:8px;max-width:100%;
}
.dshUserFileCard{
  display:inline-flex;align-items:center;gap:10px;max-width:100%;
  border:1px solid var(--dsw-alias-border-l2);
  background:var(--dsw-alias-bg-base);border-radius:12px;padding:8px 12px;
}
.dshUserFileIcon{flex-shrink:0;color:var(--dsw-alias-label-tertiary)}
.dshUserFileContent{display:flex;flex-direction:column;min-width:0}
.dshUserFileName{
  color:var(--dsw-alias-label-primary);font-size:14px;line-height:20px;
  white-space:nowrap;overflow:hidden;text-overflow:ellipsis;
}
.dshUserFileMeta{
  color:var(--dsw-alias-label-tertiary);font-size:12px;line-height:16px;
  white-space:nowrap;overflow:hidden;text-overflow:ellipsis;
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
var STYLE_ID = "dsh-fold/styles";
function insertStyle(doc) {
  const existing = doc.querySelector(`style[data-plugin-css="${STYLE_ID}"]`);
  if (existing !== null) {
    return () => {
    };
  }
  const tag = doc.createElement("style");
  tag.setAttribute("data-plugin", "dsh-fold");
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
    throw new Error("dsh-fold: SlotCore.register/releaseEntry are not functions; refusing to install the overlay (plugin stays inert)");
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
      throw new Error("dsh-fold: could not locate the entry created by SlotCore.register; refusing the shadow (official UI keeps rendering)");
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
  zh: { running: "\u6B63\u5728\u8FD0\u884C", group: "\u5DE5\u5177\u8C03\u7528\u7EC4", folded: "{count} \u4E2A\u5757\u5DF2\u88AB\u6298\u53E0", expand: "\u5C55\u5F00", collapse: "\u6536\u8D77" },
  en: { running: "Running", group: "tool call group", folded: "{count} blocks folded", expand: "Expand", collapse: "Collapse" }
};
var name = "fold";
var inject = ["slots", "locale", "sessions"];
function apply(ctx) {
  const slots = ctx.get("slots");
  const locale = ctx.get("locale");
  if (slots === void 0 || locale === void 0 || typeof document === "undefined") return;
  const restoreOverlay = installSlotCoreOverlay(import_dsh_client_ui_slots.SlotCore);
  ctx.effect(() => restoreOverlay, "dsh-fold: slot-core overlay");
  setSlotsService(slots);
  setGroupT(locale.bind("fold"));
  setSessionsService(ctx.get("sessions"));
  if (locale !== void 0) {
    setChatT(locale.bind("chat"));
    setConversationT(compositeT(locale.bind("chat"), locale.bind("conversation")));
  }
  ctx.effect(() => locale.register("fold", DICTS), "dsh-fold: dictionaries");
  ctx.effect(() => insertStyle(document), "dsh-fold: styles");
  const registerShadows = () => {
    const disposers = [];
    const register = (options, component, label) => {
      disposers.push(ctx.effect(() => slots.register(options, component), label));
    };
    register({ name: "conversation.chat.node", key: "tool-call", priority: -100, locale: "fold", children: { "tool.call.toolview": { kind: "keyed", scope: "session" } } }, ToolCallGroupView, "dsh-fold: tool-call shadow");
    register({ name: "conversation.chat.node", key: "assistant-step", priority: -100, locale: "conversation" }, AssistantNodeWrapper, "dsh-fold: assistant-step shadow");
    for (const key of ["user", "steering"]) {
      register({ name: "conversation.chat.node", key, priority: -100, locale: "conversation" }, UserNodeWrapper, `dsh-fold: ${key} shadow`);
    }
    for (const key of ["compaction", "context", "manual-compaction", "command", "model-retry", "turn-error", "turn-max-tokens", "unknown", "workflow-run"]) {
      register({
        name: "conversation.chat.node",
        key,
        priority: -100,
        locale: "conversation",
        ...key === "command" ? { children: { "conversation.chat.commandview": { kind: "keyed", scope: "session" } } } : {}
      }, NoticeNodeWrapper, `dsh-fold: ${key} shadow`);
    }
    return () => {
      for (const dispose of disposers.reverse()) dispose();
    };
  };
  ctx.effect(() => slots.inject("conversation.chat.node", registerShadows), "dsh-fold: chat shadow lifecycle");
}
return module.exports;
  }
});

