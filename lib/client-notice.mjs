// src/client/NoticeNodeWrapper.tsx
import * as React5 from "react";

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
var INLINE_NOTICE_KINDS = /* @__PURE__ */ new Set([
  "model-retry",
  "context",
  "compaction",
  "manual-compaction",
  "command",
  "turn-error",
  "turn-max-tokens",
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
    if (node.kind === TOOL_KIND || isTransparentAssistant(node)) return node;
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
  return node.kind === TOOL_KIND || isTransparentAssistant(node) || isInlineNoticeNode(node);
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
import * as React4 from "react";

// test/stubs/primitives.mjs
import React from "react";
function Icon({ size = 14, className }) {
  return React.createElement("svg", { width: size, height: size, className, "data-icon": "true" });
}
var IconChevronRightOutline14 = Icon;
var IconChevronDownOutline14 = Icon;
var IconThinkOutline14 = Icon;
var IconApiOutline14 = Icon;
var IconQuestionOutline14 = Icon;
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
import * as React2 from "react";

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
var AutoLoadHost = React2.memo(function AutoLoadHost2({ sessionId, hasMore, loadingOlder, children }) {
  const hostRef = React2.useRef(null);
  React2.useEffect(() => {
    const el = hostRef.current;
    if (el === null || sessionId === void 0) return;
    return attachAutoLoad(el, sessionId, hasMore, loadingOlder);
  }, [sessionId, hasMore, loadingOlder]);
  if (children === null || children === void 0) return null;
  if (sessionId === void 0) return children;
  return React2.createElement("div", { ref: hostRef, className: "dshAutoHost", "data-dsh-autoload": "" }, children);
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

// src/client/turn-fold.ts
import * as React3 from "react";
function isThinkOnly(node) {
  return isTransparentAssistant(node);
}
var FOLDABLE_KINDS = /* @__PURE__ */ new Set([
  "tool-call",
  "assistant-step",
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
  return React3.useSyncExternalStore(
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
  return React4.createElement(
    "div",
    { className: "dshToolGroupFallback" },
    React4.createElement("div", { className: "dshToolGroupFallbackTitle" }, `${toolName}${error ? " \u2715" : ""}`),
    argsText !== "" ? React4.createElement("pre", { className: "dshToolGroupFallbackArgs" }, argsText) : null,
    settled && output !== "" ? React4.createElement("pre", { className: "dshToolGroupFallbackOutput", "data-error": error || void 0 }, output) : null
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
var ToolCallBranch = React4.memo(function ToolCallBranch2({
  renderSlot,
  block,
  selectedCallId,
  cwd,
  openFile,
  inspectCall,
  t
}) {
  const name = callName(block);
  const owner = React4.useMemo(
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
  const children = block.subCalls !== void 0 && block.subCalls.length > 0 ? React4.createElement(
    "div",
    { className: "dshToolGroupSubCalls", "data-subcalls": true },
    block.subCalls.map(
      (child) => React4.createElement(ToolCallBranch2, {
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
  return React4.createElement(
    "div",
    {
      className: "dshToolGroupCallRow",
      "data-chat-anchor-key": `call:${block.callId}`,
      "data-chat-call-id": block.callId,
      "data-selected": selectedCallId === block.callId || void 0
    },
    renderSlot("tool.call.toolview", owner, {
      entryKey: name,
      fallback: React4.createElement(FallbackToolCard, { toolName: name, block, t })
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
  const [expanded, setExpanded] = React4.useState(false);
  const summary = running ? latestLine(text) : firstLine2(text);
  return React4.createElement(
    "div",
    { className: "dshToolGroupThink", "data-variant": "think", "data-state": running ? "running" : "ok" },
    running ? React4.createElement("span", { className: "dshToolGroupVisuallyHidden" }, t("running")) : null,
    React4.createElement(DisclosureRow, {
      rowClassName: "dshToolGroupThinkRow",
      leadingClassName: "dshToolGroupThinkLeading",
      titleClassName: "dshToolGroupThinkTitle",
      chevronClassName: "dshToolGroupThinkChevron",
      icon: React4.createElement(IconThinkOutline14, { size: 14 }),
      title: "Think",
      open: expanded,
      expandable: true,
      expandOnRowClick: true,
      onToggle: () => {
        setExpanded((value) => !value);
      },
      collapsedContent: React4.createElement(
        React4.Fragment,
        null,
        React4.createElement("span", { className: "dshToolGroupThinkSeparator", "aria-hidden": true }),
        React4.createElement(
          "span",
          { className: "dshToolGroupThinkSummary", "data-follow-end": running || void 0 },
          summary
        )
      ),
      children: React4.createElement("div", { className: "dshToolGroupThinkBody" }, text)
    })
  );
}
function ThinkItem({ item, t }) {
  const blocks = item.node.data?.blocks ?? [];
  const reasoning = blocks.filter((block) => block.kind === "reasoning" && (block.text ?? "").trim() !== "");
  if (reasoning.length === 0) return null;
  const running = item.node.data?.status === "running";
  return React4.createElement(
    React4.Fragment,
    null,
    reasoning.map(
      (block, index) => React4.createElement(InlineThink, {
        key: `${item.key}:${index}`,
        text: block.text ?? "",
        running: running && index === reasoning.length - 1,
        t
      })
    )
  );
}
var TurnFoldBar = React4.memo(function TurnFoldBar2({ expanded, onToggle, onKeyDown, t }) {
  const chevron = React4.createElement(expanded ? IconChevronDownOutline14 : IconChevronRightOutline14, {
    className: "dshToolGroupChevron"
  });
  return React4.createElement(
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
    React4.createElement("span", { className: "dshTurnFoldLabel" }, t("turnFolded")),
    chevron
  );
});
var LiveRow = React4.memo(function LiveRow2({ node, cwd, t }) {
  let icon;
  let title;
  let summary;
  const think = isTransparentAssistant(node);
  const running = isLiveWorkNode(node);
  if (think) {
    const blocks = node.data?.blocks ?? [];
    const reasoning = blocks.filter((block) => block.kind === "reasoning" && (block.text ?? "").trim() !== "");
    const text = reasoning.length > 0 ? reasoning[reasoning.length - 1].text ?? "" : "";
    icon = React4.createElement(IconThinkOutline14, { size: 14 });
    title = "Think";
    summary = running ? latestLine(text) : firstLine2(text);
  } else {
    const block = node.data?.root;
    const name = block === void 0 ? "" : callName(block);
    const row = runningToolRow(name, block ?? { callId: node.key, name }, cwd);
    icon = React4.createElement(name === "ask_user_question" ? IconQuestionOutline14 : IconApiOutline14, { size: 14 });
    title = row.title;
    summary = row.summary;
  }
  return React4.createElement(
    React4.Fragment,
    null,
    running ? React4.createElement("span", { className: "dshToolGroupVisuallyHidden" }, t("running")) : null,
    React4.createElement("span", { className: "dshToolGroupLiveIcon" }, icon),
    React4.createElement("span", { className: "dshToolGroupLiveTitle" }, title),
    React4.createElement("span", { className: "dshToolGroupLiveSep", "aria-hidden": true }),
    React4.createElement("span", { className: "dshToolGroupLiveSummary" }, summary)
  );
});
var GroupBar = React4.memo(function GroupBar2({ group, expanded, onToggle, onKeyDown, t, cwd, live }) {
  const liveShown = live !== void 0 && !expanded && group.itemKeys.includes(live.key);
  const liveRunning = liveShown && isLiveWorkNode(live);
  const liveNode = liveShown ? React4.createElement(LiveRow, { node: live, cwd, t }) : null;
  const chevron = React4.createElement(expanded ? IconChevronDownOutline14 : IconChevronRightOutline14, {
    className: "dshToolGroupChevron"
  });
  return React4.createElement(
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
    React4.createElement("div", { className: "dshToolGroupLeft" }, liveNode),
    React4.createElement(
      "div",
      { className: "dshToolGroupRight" },
      React4.createElement("span", { className: "dshToolGroupCount" }, t("folded", { count: group.count })),
      chevron
    )
  );
});
var DelegatedNoticeItem = React4.memo(function DelegatedNoticeItem2({ item, conversationT: conversationT2 }) {
  const t = conversationT2 ?? getConversationT();
  if (t === void 0) return null;
  if (item.cell === "workflow-run") {
    const data = item.node.data ?? {};
    return React4.createElement(
      "div",
      { className: "dshWorkflowRunItem" },
      React4.createElement("span", { className: "dshWorkflowRunTitle" }, data.name ?? "workflow"),
      data.status !== void 0 ? React4.createElement("span", { className: "dshWorkflowRunStatus" }, String(data.status)) : null
    );
  }
  const official = officialNodeEntry(item.cell);
  if (official === void 0 || official.component == null) return null;
  if (item.cell === "command") {
    const renderSlot = (_key, _owner, opts) => opts?.fallback ?? null;
    return React4.createElement(official.component, { node: item.node, t, renderSlot });
  }
  return React4.createElement(official.component, { node: item.node, t });
});
var GroupItems = React4.memo(function GroupItems2(props) {
  const { group, t, renderSlot, selectedCallId, cwd, openFile, inspectCall, conversationT: conversationT2 } = props;
  return React4.createElement(
    "div",
    { className: "dshToolGroupItems" },
    group.items.map((item) => {
      if (item.kind === "think") {
        return React4.createElement(ThinkItem, { key: item.key, item, t });
      }
      if (item.kind === "notice") {
        return React4.createElement(DelegatedNoticeItem, { key: item.key, item, conversationT: conversationT2 });
      }
      const root = item.node.data?.root;
      if (root === void 0 || renderSlot === void 0 || openFile === void 0 || inspectCall === void 0) return null;
      return React4.createElement(ToolCallBranch, {
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
  return React4.createElement("div", { "data-tool-group-hidden": "" });
}
var ToolCallGroupView = React4.memo(function ToolCallGroupView2(props) {
  const { node, useSession, renderSlot, selectedCallId, cwd, openFile, inspectCall, t, sessionId } = props;
  const group = useSession((snapshot) => groupOf(snapshot.chat, node.key), eqGroup);
  const turnInfo = useSession((snapshot) => turnProcessOf(snapshot, node.key), eqTurnProcess);
  const live = useSession((snapshot) => latestWorkNode(snapshot.chat));
  const hasMore = useSession((snapshot) => snapshot.hasMore === true);
  const loadingOlder = useSession((snapshot) => snapshot.loadingOlder === true);
  const conversationT2 = getConversationT();
  const [expanded, setExpanded] = React4.useState(false);
  const turnExpanded = useTurnExpanded(turnInfo === null ? void 0 : `${sessionId ?? ""}:${turnInfo.turn}`);
  const toggle = React4.useCallback(() => setExpanded((value) => !value), []);
  const onKeyDown = React4.useCallback((event) => {
    if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      setExpanded((value) => !value);
    }
  }, []);
  const turnKey = turnInfo === null ? void 0 : `${sessionId ?? ""}:${turnInfo.turn}`;
  const turnToggle = React4.useCallback(() => {
    if (turnKey === void 0) return;
    setTurnExpanded(turnKey, !turnExpanded);
  }, [turnKey, turnExpanded]);
  const turnKeyDown = React4.useCallback(
    (event) => {
      if (event.key === "Enter" || event.key === " ") {
        event.preventDefault();
        turnToggle();
      }
    },
    [turnToggle]
  );
  let output;
  if (group === null || !isGroupLeader(group, node.key)) {
    output = React4.createElement(FoldedSeat, null);
  } else {
    const small = React4.createElement(
      "div",
      { className: "dshToolGroup", "data-tool-group": "", "data-state": live !== void 0 && !expanded && group.itemKeys.includes(live.key) && isLiveWorkNode(live) ? "running" : "settled" },
      React4.createElement(GroupBar, { group, expanded, onToggle: toggle, onKeyDown, t, cwd, live }),
      expanded ? React4.createElement(GroupItems, { group, t, renderSlot, selectedCallId, cwd, openFile, inspectCall, conversationT: conversationT2 }) : null
    );
    if (turnInfo !== null && isProcessNode(turnInfo, node.key)) {
      const first = node.key === turnInfo.firstKey;
      if (!turnExpanded) {
        output = first ? React4.createElement(TurnFoldBar, { expanded: false, onToggle: turnToggle, onKeyDown: turnKeyDown, t }) : React4.createElement(FoldedSeat, null);
      } else {
        output = React4.createElement(
          React4.Fragment,
          null,
          first ? React4.createElement(TurnFoldBar, { expanded: true, onToggle: turnToggle, onKeyDown: turnKeyDown, t }) : null,
          turnExpanded ? small : null
        );
      }
    } else {
      output = small;
    }
  }
  return React4.createElement(AutoLoadHost, { sessionId, hasMore, loadingOlder }, output);
});

// src/client/translate.ts
var groupT;
function setGroupT(t) {
  groupT = t;
}
function getGroupT() {
  return groupT;
}

// src/client/NoticeNodeWrapper.tsx
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
function FoldedSeat2() {
  return React5.createElement("div", { "data-tool-group-hidden": "" });
}
var NoticeNodeWrapper = React5.memo(function NoticeNodeWrapper2(props) {
  const { node, useSession, sessionId } = props;
  const turnInfo = useSession((snapshot) => turnProcessOf(snapshot, node.key), eqTurnProcess);
  const inlineGroup = useSession((snapshot) => isInlineNoticeNode(node) ? groupOf(snapshot.chat, node.key) : null, eqGroup);
  const live = useSession((snapshot) => latestWorkNode(snapshot.chat));
  const hasMore = useSession((snapshot) => snapshot.hasMore === true);
  const loadingOlder = useSession((snapshot) => snapshot.loadingOlder === true);
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
  setConversationT(typeof props.t === "function" ? props.t : void 0);
  let output;
  if (!NOTICE_KINDS.has(node.kind)) {
    output = React5.createElement(FoldedSeat2, null);
  } else {
    if (turnInfo !== null && isProcessNode(turnInfo, node.key)) {
      const first = node.key === turnInfo.firstKey;
      if (!turnExpanded) {
        output = first ? React5.createElement(TurnFoldBar, { expanded: false, onToggle: turnToggle, onKeyDown: turnKeyDown, t }) : React5.createElement(FoldedSeat2, null);
      } else {
        const leaderSeat = inlineGroup !== null && isGroupLeader(inlineGroup, node.key);
        const groupSmall = leaderSeat ? buildGroupSmall() : first ? null : React5.createElement(FoldedSeat2, null);
        const small = first && groupSmall !== null && groupSmall.props !== void 0 && groupSmall.props["data-tool-group-hidden"] !== void 0 ? null : groupSmall;
        output = React5.createElement(
          React5.Fragment,
          null,
          first ? React5.createElement(TurnFoldBar, { expanded: true, onToggle: turnToggle, onKeyDown: turnKeyDown, t }) : null,
          small
        );
      }
    } else if (inlineGroup === null || !isGroupLeader(inlineGroup, node.key)) {
      output = React5.createElement(FoldedSeat2, null);
    } else {
      output = buildGroupSmall();
    }
  }
  return React5.createElement(AutoLoadHost, { sessionId, hasMore, loadingOlder }, output);
  function buildGroupSmall() {
    const g = inlineGroup;
    const official = officialNodeEntry(node.kind);
    if (g.count === 1 && (official === void 0 || official.component == null)) {
      return React5.createElement(FoldedSeat2, null);
    }
    const conversationT2 = typeof props.t === "function" ? props.t : void 0;
    return React5.createElement(
      "div",
      { className: "dshToolGroup", "data-tool-group": "", "data-notice": "" },
      React5.createElement(GroupBar, { group: g, expanded, onToggle: toggle, onKeyDown, t, live }),
      expanded ? React5.createElement(GroupItems, { group: g, t, conversationT: conversationT2 }) : null
    );
  }
});
export {
  NOTICE_KINDS,
  NoticeNodeWrapper,
  setGroupT,
  setSlotsService,
  setTurnExpanded
};
