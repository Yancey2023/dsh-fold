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
export {
  callName,
  eqGroup,
  groupOf,
  isGroupLeader,
  isRunningBlock
};
