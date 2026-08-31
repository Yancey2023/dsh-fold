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
  const status = node.data?.status;
  if (status !== void 0) return status === "running";
  return node.data?.final === void 0;
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
export {
  INLINE_NOTICE_KINDS,
  TURN_PROCESS_NODE_KIND,
  callName,
  eqGroup,
  eqGrouped,
  groupOf,
  isGroupLeader,
  isInlineNoticeNode,
  isLiveWorkNode,
  isRunningBlock,
  isTransparentAssistant,
  latestWorkNode,
  turnOf
};
