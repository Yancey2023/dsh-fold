// src/client/AssistantNodeWrapper.tsx
import * as React from "react";

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
function continuesRun(node, anchor) {
  if (!sameTurn(node, anchor)) return false;
  return node.kind === TOOL_KIND || isTransparentAssistant(node);
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
  if (official === void 0 || typeof official.component !== "function") return null;
  return React.createElement(official.component, props);
});
export {
  AssistantNodeWrapper,
  setSlotsService
};
