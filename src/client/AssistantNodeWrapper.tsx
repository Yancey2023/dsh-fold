/**
 * AssistantNodeWrapper — the shadowing renderer for `conversation.chat.node`
 * cell `assistant-step`.
 *
 * Two cases:
 *   - TRANSPARENT node (blocks contain only reasoning / tool-call
 *     placeholders / empty text) that is currently absorbed by a tool group:
 *     renders null — the group owns its Think rows (shown in-group when the
 *     chain is expanded, hidden while collapsed). This is what makes
 *     consecutive tool calls merge across reasoning instead of splitting
 *     into per-call bars.
 *   - everything else (assistant TEXT, standalone think rows, interrupted
 *     steps): renders the OFFICIAL AssistantNodeView. Because the keyed slot
 *     dispatch can only reach the cell winner, the official component is
 *     obtained from the live slot registry (`slots.entries(...)`, the public
 *     read of all registrations) and mounted with this seat's own composed
 *     kit — the same props the renderer would have passed to it unshadowed
 *     (node, useTurnData bound to this node's key, openFile, loadImage,
 *     fileMentions, t in the conversation namespace).
 *
 * The registry lookup degrades fail-soft: if the official entry is ever
 * missing, the wrapper renders nothing rather than breaking the flow.
 */

import * as React from 'react'
import { eqGrouped, isAssistantGrouped, isTransparentAssistant } from './group'
import type { ChatNodeLike } from './group'

export interface AssistantNodeWrapperProps {
  /** The assistant-step node owned by this seat. */
  node: ChatNodeLike
  /** Framework session selector hook. */
  useSession: <S>(sel: (snapshot: { chat: { order: readonly string[]; nodes: { get(key: string): ChatNodeLike | undefined } } }) => S, eq?: (a: S, b: S) => boolean) => S
  /** Everything else the renderer passed (delegated to the official view). */
  [key: string]: unknown
}

/** The live slots service (set by the plugin entry before registration). */
let slotsService:
  | {
      entries(key: string): Array<{ options: { key?: string; priority?: number }; component: unknown }>
    }
  | undefined

export function setSlotsService(service: typeof slotsService): void {
  slotsService = service
}

/** The product's AssistantNodeView entry (priority 0), when registered. */
function officialAssistantEntry():
  | { component: unknown }
  | undefined {
  const service = slotsService
  if (service === undefined) return undefined
  const all = service.entries('conversation.chat.node')
  return all.find((entry) => entry.options.key === 'assistant-step' && (entry.options.priority ?? 0) === 0)
}

export const AssistantNodeWrapper = React.memo(function AssistantNodeWrapper(props: AssistantNodeWrapperProps): React.ReactElement | null {
  const { node, useSession } = props
  const probe = useSession(
    (snapshot) => (isTransparentAssistant(node) ? { grouped: isAssistantGrouped(snapshot.chat, node.key), node } : null),
    eqGrouped,
  )

  if (probe !== null && probe.grouped) return null

  const official = officialAssistantEntry()
  if (official === undefined || typeof official.component !== 'function') return null
  // Delegate with this seat's full composed kit (same props the renderer
  // would pass to the official view when it wins the cell).
  return React.createElement(official.component as React.ComponentType<Record<string, unknown>>, props as Record<string, unknown>)
})
