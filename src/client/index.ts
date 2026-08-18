/**
 * dsh-tool-group — CLIENT half (browser).
 *
 * Mounts tool-call chain folding into the Conversation UI through the
 * official slot system only:
 *
 *   1. Installs the reversible shared-declaration overlay on the live
 *      SlotCore (same module instance the shell uses — `ui-slots` is a
 *      shell-own static module, so this require is synchronous), enabling
 *      this entry to declare `tool.call.toolview` as a co-owned child slot.
 *   2. Registers `conversation.chat.node` cell `tool-call` at priority -100,
 *      shadowing the product's ToolCallTree (priority 0; lowest wins).
 *   3. Registers `conversation.chat.node` cell `assistant-step` at priority
 *      -100, shadowing the product's AssistantNodeView: reasoning-only
 *      assistant nodes that sit inside a tool run are folded with the group
 *      (hidden); everything else delegates to the official entry from the
 *      live registry.
 *   4. Registers the `tool-group` locale dictionaries (running label).
 *   5. Injects the package stylesheet (data-plugin tagged, removed on
 *      dispose).
 *
 * All shadows are automatic: uninstalling this plugin restores the official
 * renderers with nothing else to do. No DOM patching, no observers, no
 * display:none games: every rendered tool card comes from the official
 * `tool.call.toolview` dispatch.
 */

import { SlotCore } from '@deepseek-ai/dsh-client-ui-slots'
import { AssistantNodeWrapper, setGroupT, setSlotsService } from './AssistantNodeWrapper'
import { ToolCallGroupView } from './ToolCallGroupView'
import { insertStyle } from './styles'
import { installSlotCoreOverlay } from './slots-core-overlay'

/** Locale dictionaries for this package's namespace. */
const DICTS: Record<'zh' | 'en', Record<string, string>> = {
  zh: { running: '正在运行', group: '工具调用组', folded: '{count} 个块已被折叠' },
  en: { running: 'Running', group: 'tool call group', folded: '{count} blocks folded' },
}

export const name = 'tool-group'
export const inject = ['slots', 'locale']

type LocaleFace = {
  register(ns: string, dicts: Record<string, Record<string, string>>): () => void
  bind(ns: string): (key: string, params?: Record<string, unknown>) => string
}

type SlotsService = {
  inject(key: string, callback: () => unknown): unknown
  register(options: Record<string, unknown>, component: unknown): unknown
  entries(key: string): Array<{ options: { key?: string; priority?: number }; component: unknown }>
}

export function apply(ctx: {
  get(name: string): unknown
  effect(callback: () => unknown, label?: string): () => void
}): void {
  const slots = ctx.get('slots') as SlotsService | undefined
  const locale = ctx.get('locale') as LocaleFace | undefined
  if (slots === undefined || locale === undefined || typeof document === 'undefined') return

  // 1. Shared-declaration overlay (restored automatically on unload).
  const restoreOverlay = installSlotCoreOverlay(SlotCore)
  ctx.effect(() => restoreOverlay, 'dsh-tool-group: slot-core overlay')

  // 1b. The assistant wrapper reaches the official entry through the registry,
  //     and binds its own tool-group translate for think-only folded bars.
  setSlotsService(slots)
  setGroupT(locale.bind('tool-group'))

  // 2. Locale dictionaries.
  ctx.effect(() => locale.register('tool-group', DICTS), 'dsh-tool-group: dictionaries')

  // 3. Stylesheet.
  ctx.effect(() => insertStyle(document), 'dsh-tool-group: styles')

  // 4. Shadow the official tool-call renderer with the group view.
  ctx.effect(
    () =>
      slots.register(
        {
          name: 'conversation.chat.node',
          key: 'tool-call',
          priority: -100,
          locale: 'tool-group',
          children: {
            'tool.call.toolview': { kind: 'keyed', scope: 'session' },
          },
        },
        ToolCallGroupView,
      ) as () => void,
    'dsh-tool-group: tool-call shadow',
  )

  // 5. Shadow the assistant-step cell: reasoning-only nodes fold with the
  //    group; everything else delegates to the official AssistantNodeView
  //    (conversation locale seat, no children).
  ctx.effect(
    () =>
      slots.register(
        {
          name: 'conversation.chat.node',
          key: 'assistant-step',
          priority: -100,
          locale: 'conversation',
        },
        AssistantNodeWrapper,
      ) as () => void,
    'dsh-tool-group: assistant-step shadow',
  )
}
