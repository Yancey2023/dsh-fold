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
var React = __toESM(require("react"), 1);

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
  if (node === void 0 || node.kind !== TOOL_KIND) return null;
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
  let leaderKey;
  for (const key of keys) {
    const member = snapshot.nodes.get(key);
    if (member === void 0) continue;
    if (member.kind === TOOL_KIND) {
      if (leaderKey === void 0) leaderKey = key;
      items.push({ kind: "tool", key, node: member });
    } else {
      items.push({ kind: "think", key, node: member });
    }
  }
  if (leaderKey === void 0) return null;
  let running;
  let count = 0;
  for (const item of items) {
    if (item.kind !== "tool") continue;
    count += 1;
    const block = item.node.data?.root;
    if (running === void 0 && isRunningBlock(block)) running = block;
  }
  return { leaderKey, itemKeys: keys, items, count, running };
}
function isGroupLeader(group, nodeKey) {
  return group.leaderKey === nodeKey;
}
function isAssistantGrouped(snapshot, nodeKey) {
  const order = snapshot.order;
  const idx = order.indexOf(nodeKey);
  if (idx < 0) return false;
  const node = snapshot.nodes.get(nodeKey);
  if (node === void 0 || !isTransparentAssistant(node)) return false;
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
  for (let i = start; i <= end; i += 1) {
    const member = snapshot.nodes.get(order[i]);
    if (member !== void 0 && member.kind === TOOL_KIND) return true;
  }
  return false;
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
function eqGrouped(left, right) {
  if (left === null || right === null) return left === right;
  return left.grouped === right.grouped && left.node === right.node;
}

// src/client/AssistantNodeWrapper.tsx
var slotsService;
function setSlotsService(service) {
  slotsService = service;
}
function officialAssistantEntry() {
  const service = slotsService;
  if (service === void 0) return void 0;
  const all = service.entries("conversation.chat.node");
  return all.find((entry) => entry.options.key === "assistant-step" && (entry.options.priority ?? 0) === 0);
}
var AssistantNodeWrapper = React.memo(function AssistantNodeWrapper2(props) {
  const { node, useSession } = props;
  const probe = useSession(
    (snapshot) => isTransparentAssistant(node) ? { grouped: isAssistantGrouped(snapshot.chat, node.key), node } : null,
    eqGrouped
  );
  if (probe !== null && probe.grouped) return null;
  const official = officialAssistantEntry();
  if (official === void 0 || official.component == null) return null;
  return React.createElement(official.component, props);
});

// src/client/ToolCallGroupView.tsx
var React2 = __toESM(require("react"), 1);
var import_dsh_client_ui_primitives = require("@deepseek-ai/dsh-client-ui-primitives");
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
  const chevron = React2.createElement(expanded ? import_dsh_client_ui_primitives.IconChevronDownOutline14 : import_dsh_client_ui_primitives.IconChevronRightOutline14, {
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
  const items = React2.createElement(
    "div",
    { className: "dshToolGroupItems" },
    group.items.map((item) => {
      if (item.kind === "think") {
        return React2.createElement(ThinkItem, { key: item.key, item, t });
      }
      const root = item.node.data?.root;
      if (root === void 0) return null;
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
  return React2.createElement(
    "div",
    { className: "dshToolGroup", "data-tool-group": "", "data-state": runningName !== null ? "running" : "settled" },
    bar,
    expanded ? items : null
  );
});

// src/client/styles.ts
var CSS = `
.dshToolGroupRow{
  display:flex;align-items:center;gap:12px;min-width:0;height:24px;
  box-sizing:border-box;padding:0 8px;border-radius:6px;
  cursor:pointer;user-select:none;outline:none;
  font-size:14px;line-height:24px;
}
.dshToolGroupRow:hover,
.dshToolGroupRow:focus-visible{
  background:var(--dsw-alias-interactive-bg-hover);
}
.dshToolGroupLeft{
  display:flex;align-items:center;gap:6px;min-width:0;flex:1 1 auto;overflow:hidden;
}
.dshToolGroupRunning{
  color:var(--dsw-alias-state-business-primary);
  flex:none;white-space:nowrap;font-size:14px;line-height:24px;
}
.dshToolGroupName{
  color:var(--dsw-alias-label-secondary);
  white-space:nowrap;overflow:hidden;text-overflow:ellipsis;
  font-size:14px;line-height:24px;
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
  .dshToolGroupThink[data-state=running] .dshToolGroupThinkRow:after{animation:none}
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
  zh: { running: "\u6B63\u5728\u8FD0\u884C", group: "\u5DE5\u5177\u8C03\u7528\u7EC4" },
  en: { running: "Running", group: "tool call group" }
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
}
return module.exports;
  }
});

