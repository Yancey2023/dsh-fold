/**
 * Shared fold namespace translate.
 *
 * The plugin registers three `conversation.chat.node` seats with two
 * different locales: `tool-call` and `user`-adjacent rows bind the
 * fold namespace, but the `user` seat binds the CONVERSATION namespace
 * (it needs product keys like `image.label` / `copy` / `clock.md`). The
 * fold strings (running / folded / turnFolded / expand / collapse) are
 * therefore shared through this tiny module slot, set once by the plugin
 * entry and read by every seat.
 */

let groupT: ((key: string, params?: Record<string, unknown>) => string) | undefined

export function setGroupT(t: typeof groupT): void {
  groupT = t
}

export function getGroupT(): typeof groupT {
  return groupT
}
