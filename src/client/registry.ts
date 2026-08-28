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

/** Conversation-namespace translate (set by the plugin entry; the user-bubble
 * replica needs the product `image.*` labels, which live in the conversation
 * namespace on BOTH releases — and on rc they are the ONLY namespace). */
let conversationT: TranslateLike | undefined

export function setConversationT(t: TranslateLike | undefined): void {
  conversationT = t
}

export function getConversationT(): TranslateLike | undefined {
  return conversationT
}

/**
 * Chat-namespace translate (alpha 0.1.2 only). Alpha moved the chat-cell
 * dictionary keys (copy / clock.* / json.truncated / message.extraBlock, …)
 * out of `conversation` into the `chat` namespace; rc has no `chat` fallback.
 * Bound lazily by the plugin entry after probing which namespace is live.
 */
let chatT: TranslateLike | undefined

export function setChatT(t: TranslateLike | undefined): void {
  chatT = t
}

export function getChatT(): TranslateLike | undefined {
  return chatT
}

/**
 * Composite translate for plugin-owned renderers (the user bubble replica and
 * delegated official cell views): resolve from the live chat namespace first
 * (alpha), fall back to the conversation seat / image namespace, else the raw
 * key. `translate` returns the KEY verbatim when a dictionary entry is
 * missing, so a differing result means the key actually translated.
 */
export function compositeT(primary?: TranslateLike, secondary?: TranslateLike): TranslateLike {
  const first = primary ?? secondary
  if (first === undefined) {
    return (key, params) => (params !== undefined && 'count' in params ? String(params.count) : key)
  }
  const alternate = primary !== undefined && secondary !== undefined && primary !== secondary ? secondary : undefined
  if (alternate === undefined) return first
  return (key, params) => {
    const value = first(key, params)
    if (value !== key) return value
    const alt = alternate(key, params)
    return alt !== key ? alt : value
  }
}
