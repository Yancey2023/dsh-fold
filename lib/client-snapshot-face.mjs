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
  const session = raw;
  const chat = session !== null && typeof session === "object" && isChatTarget(session.chat) ? session.chat : raw;
  if (!isChatTarget(chat)) return EMPTY_CHAT;
  const chatValue = chat;
  const turnEnds = chatValue.legacy?.turnEnds ?? chatValue.turnEnds ?? (session !== null && typeof session === "object" ? session.turnEnds : void 0);
  return { order: chatValue.order, nodes: chatValue.nodes, turnEnds };
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
  const chat = useChat !== void 0 ? useChat((snapshot) => chatFaceOf(snapshot), chatFaceEq) : useSession !== void 0 ? useSession((snapshot) => chatFaceOf(snapshot), chatFaceEq) : EMPTY_CHAT;
  const flags = useSession !== void 0 ? useSession((snapshot) => windowFlagsOf(snapshot), windowFlagsEq) : { hasMore: false, loadingOlder: false };
  return flags.hasMore || flags.loadingOlder || chat !== EMPTY_CHAT ? { chat, hasMore: flags.hasMore, loadingOlder: flags.loadingOlder } : EMPTY_FACE;
}
export {
  chatFaceEq,
  chatFaceOf,
  useSnapshotFace,
  windowFlagsOf
};
