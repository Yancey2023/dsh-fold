/**
 * AssistantNodeWrapper — the shadowing renderer for `conversation.chat.node`
 * cell `assistant-step`.
 *
 * Two cases:
 *   - TRANSPARENT node (blocks contain only reasoning / tool-call
 *     placeholders / empty text): ALWAYS folded. If its run contains tool
 *     calls it joins that group (renders null; the tool leader owns the bar).
 *     If the run is think-only, the FIRST transparent node leads its own
 *     folded bar ("N 个块已被折叠") that expands into the Think rows.
 *   - everything else (assistant TEXT, interrupted steps): renders the
 *     OFFICIAL AssistantNodeView. Because the keyed slot dispatch can only
 *     reach the cell winner, the official component is obtained from the
 *     live slot registry (`slots.entries(...)`, the public read of all
 *     registrations) and mounted with this seat's own composed kit — the
 *     same props the renderer would have passed to it unshadowed (node,
 *     useTurnData bound to this node's key, openFile, loadImage,
 *     fileMentions, t in the conversation namespace). React.memo components
 *     are objects, not functions — never shape-check the component.
 *
 * The registry lookup degrades fail-soft: if the official entry is ever
 * missing, text nodes render nothing rather than breaking the flow.
 */

import * as React from 'react'
import { eqGroup, groupOf, isGroupLeader, isTransparentAssistant } from './group'
import type { AssistantBlockLike } from './group'
import type { ChatNodeLike } from './group'
import { GroupBar, GroupItems } from './ToolCallGroupView'

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

/** tool-group namespace translate for folded bars (set by the plugin entry). */
let groupT: ((key: string, params?: Record<string, unknown>) => string) | undefined

export function setSlotsService(service: typeof slotsService): void {
  slotsService = service
}

export function setGroupT(t: typeof groupT): void {
  groupT = t
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
  const group = useSession((snapshot) => (isTransparentAssistant(node) ? groupOf(snapshot.chat, node.key) : null), eqGroup)
  const [expanded, setExpanded] = React.useState(false)

  if (group === null) {
    // Text-bearing (or unknown) node: official rendering — with its
    // reasoning blocks FOLDED AWAY ("除了text都要被折叠": only text stays
    // visible; the Think part of a mixed node is hidden too).
    const official = officialAssistantEntry()
    // React.memo returns an OBJECT (not a function), so only reject absent
    // entries — never shape-check the component.
    if (official === undefined || official.component == null) return null
    const data = node.data as { blocks?: readonly AssistantBlockLike[] } | undefined
    const blocks = data?.blocks
    const filtered = Array.isArray(blocks) ? blocks.filter((b) => b.kind !== 'reasoning') : blocks
    const forwarded = filtered === blocks ? props : { ...props, node: { ...node, data: { ...data, blocks: filtered } } }
    return React.createElement(official.component as React.ComponentType<Record<string, unknown>>, forwarded as Record<string, unknown>)
  }

  if (!isGroupLeader(group, node.key)) return null

  const toggle = React.useCallback(() => setExpanded((value) => !value), [])
  const onKeyDown = (event: React.KeyboardEvent) => {
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault()
      setExpanded((value) => !value)
    }
  }
  const t = groupT ?? ((key: string, params?: Record<string, unknown>) => (params && 'count' in params ? String(params.count) : key))
  return React.createElement(
    'div',
    null,
    React.createElement(GroupBar, { group, expanded, onToggle: toggle, onKeyDown, t }),
    expanded ? React.createElement(GroupItems, { group, t }) : null,
  )
})
