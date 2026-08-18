/**
 * Shared live-slot registry access.
 *
 * Every shadowing seat that DELEGATES to an official cell entry (the
 * assistant wrapper, the notice wrapper) reads the official component from
 * the live slot registry — `slots.entries('conversation.chat.node')`, the
 * public read of all registrations — because the keyed slot dispatch can
 * only reach the cell winner. The service is set once by the plugin entry
 * before registration.
 */

export interface NodeEntryLike {
  options: { key?: string; priority?: number }
  component: unknown
}

export interface SlotsServiceLike {
  entries(key: string): readonly NodeEntryLike[]
}

let slotsService: SlotsServiceLike | undefined

export function setSlotsService(service: SlotsServiceLike | undefined): void {
  slotsService = service
}

export function getSlotsService(): SlotsServiceLike | undefined {
  return slotsService
}

/** The product's entry for one `conversation.chat.node` cell (priority 0). */
export function officialNodeEntry(key: string): NodeEntryLike | undefined {
  const service = slotsService
  if (service === undefined) return undefined
  const all = service.entries('conversation.chat.node')
  return all.find((entry) => entry.options.key === key && (entry.options.priority ?? 0) === 0)
}

export type TranslateLike = (key: string, params?: Record<string, unknown>) => string

/** Conversation-namespace translate (set by the conversation-locale seats;
 * used to render group members that need product keys, e.g. the official
 * model-retry row). */
let conversationT: TranslateLike | undefined

export function setConversationT(t: TranslateLike | undefined): void {
  conversationT = t
}

export function getConversationT(): TranslateLike | undefined {
  return conversationT
}
