// src/client/turn-fold.ts
import * as React from "react";

// src/client/group.ts
var ASSISTANT_KIND = "assistant-step";
function turnOf(node) {
  const loc = node.location;
  if (loc === void 0) return void 0;
  if (loc.kind === "turn" || loc.kind === "step") return loc.turn?.turn;
  return void 0;
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

// src/client/turn-fold.ts
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
  "unknown",
  "workflow-run",
  // Alpha 0.1.2 projects a hidden turn-process controller per closed turn;
  // it belongs to the process span (its seat is the product's own, hidden in
  // normal mode, so this entry only matters for the span computation).
  "turn-process"
]);
function turnProcessOf(session, nodeKey) {
  const face = session.chat !== void 0 && Array.isArray(session.chat.order) ? session.chat : session;
  const node = face.nodes.get(nodeKey);
  if (node === void 0) return null;
  const turn = turnOf(node);
  if (turn === void 0) return null;
  const turnEnds = face.turnEnds ?? session.turnEnds;
  const closedByMap = turnEnds !== void 0 && turnEnds.has(turn);
  const closedByLocation = (node.location?.kind === "turn" || node.location?.kind === "step") && node.location.turn?.status === "closed";
  if (!closedByMap && !closedByLocation) return null;
  const turnNodes = [];
  for (const key of face.order) {
    const member = face.nodes.get(key);
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
export {
  FOLDABLE_KINDS,
  eqTurnProcess,
  isProcessNode,
  isTurnSummary,
  setTurnExpanded,
  turnProcessOf,
  useTurnExpanded
};
