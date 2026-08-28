/**
 * dsh-fold — CLIENT half (browser).
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
 *   4. Registers the `fold` locale dictionaries (running label).
 *   5. Injects the package stylesheet (data-plugin tagged, removed on
 *      dispose).
 *
 * All shadows are automatic: uninstalling this plugin restores the official
 * renderers with nothing else to do. No DOM patching, no observers, no
 * display:none games: every rendered tool card comes from the official
 * `tool.call.toolview` dispatch.
 */

import { SlotCore } from '@deepseek-ai/dsh-client-ui-slots'
import { AssistantNodeWrapper, setSlotsService } from './AssistantNodeWrapper'
import { setGroupT } from './translate'
import { setSessionsService } from './auto-load'
import { compositeT, setChatT, setConversationT } from './registry'
import { ToolCallGroupView } from './ToolCallGroupView'
import { UserNodeWrapper } from './UserNodeWrapper'
import { NoticeNodeWrapper } from './NoticeNodeWrapper'
import { insertStyle } from './styles'
import { installSlotCoreOverlay } from './slots-core-overlay'

/** Locale dictionaries for this package's namespace. */
const DICTS: Record<'zh' | 'en', Record<string, string>> = {
  zh: { running: '正在运行', group: '工具调用组', folded: '{count} 个块已被折叠', turnFolded: '该轮次工作过程已折叠', expand: '展开', collapse: '收起' },
  en: { running: 'Running', group: 'tool call group', folded: '{count} blocks folded', turnFolded: 'Turn work process folded', expand: 'Expand', collapse: 'Collapse' },
}

export const name = 'fold'
export const inject = ['slots', 'locale', 'sessions']

type LocaleFace = {
  register(ns: string, dicts: Record<string, Record<string, string>>): () => void
  bind(ns: string): (key: string, params?: Record<string, unknown>) => string
}

type SlotsService = {
  inject?: (key: string, callback: () => unknown) => unknown
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
  ctx.effect(() => restoreOverlay, 'dsh-fold: slot-core overlay')

  // 1b. The assistant wrapper reaches the official entry through the registry,
  //     and binds its own fold translate for think-only folded bars.
  setSlotsService(slots)
  setGroupT(locale.bind('fold'))
  // 1c. The sessions service powers scroll-to-top auto-load-older (the
  //     official loadOlder action is reached through the session scope).
  setSessionsService(ctx.get('sessions') as { scope(id: string): { get(name: string): unknown } | undefined } | undefined)
  // 1d. The conversation-namespace translate is the fallback for every
  //     official cell view that renders inside a folded group (model-retry,
  //     context injection, compaction, …), as is the chat namespace: alpha
  //     0.1.2 moved the chat-cell dictionary out of `conversation` into
  //     `chat`, rc keeps it in `conversation`. The probe detects which
  //     namespace actually translates a chat-cell key, and the delegate
  //     wrappers resolve through `compositeT` so both releases render
  //     properly. Dictionary registration precedes this plugin's apply in
  //     the boot graph, so the probe sees the host's dictionaries.
  if (locale !== undefined) {
    const chatProbeKey = 'message.extraBlock'
    const chatProbe = locale.bind('chat')(chatProbeKey)
    const chatT = chatProbe !== chatProbeKey ? locale.bind('chat') : undefined
    setChatT(chatT)
    // The stashed conversation translate doubles as the DEFAULT translate
    // for official cell views rendered inside folded groups; alpha's chat
    // namespace takes precedence there, conversation supplies the image
    // labels. Seat wrappers override the stash with their own composite.
    setConversationT(compositeT(chatT, locale.bind('conversation')))
  }

  // 2. Locale dictionaries.
  ctx.effect(() => locale.register('fold', DICTS), 'dsh-fold: dictionaries')

  // 3. Stylesheet.
  ctx.effect(() => insertStyle(document), 'dsh-fold: styles')

  const registerShadows = () => {
    const disposers: Array<() => void> = []
    const register = (options: Record<string, unknown>, component: unknown, label: string) => {
      disposers.push(ctx.effect(() => slots.register(options, component) as () => void, label))
    }
    register({ name: 'conversation.chat.node', key: 'tool-call', priority: -100, locale: 'fold', children: { 'tool.call.toolview': { kind: 'keyed', scope: 'session' } } }, ToolCallGroupView, 'dsh-fold: tool-call shadow')
    register({ name: 'conversation.chat.node', key: 'assistant-step', priority: -100, locale: 'conversation' }, AssistantNodeWrapper, 'dsh-fold: assistant-step shadow')
    // `steering` (mid-turn user messages) renders the product's user view
    // too; folding long steering messages is the same 3-line clamp.
    for (const key of ['user', 'steering']) {
      register({ name: 'conversation.chat.node', key, priority: -100, locale: 'conversation' }, UserNodeWrapper, `dsh-fold: ${key} shadow`)
    }
    for (const key of ['compaction', 'context', 'manual-compaction', 'command', 'model-retry', 'turn-error', 'turn-max-tokens', 'unknown', 'workflow-run']) {
      register({
        name: 'conversation.chat.node', key, priority: -100, locale: 'conversation',
        ...(key === 'command' ? { children: { 'conversation.chat.commandview': { kind: 'keyed', scope: 'session' } } } : {}),
      }, NoticeNodeWrapper, `dsh-fold: ${key} shadow`)
    }
    return () => { for (const dispose of disposers.reverse()) dispose() }
  }

  // `slots.inject` waits for declaration and owns the contribution lifecycle.
  // Older hosts/mocks without it only support immediate registration.
  if (typeof slots.inject === 'function') {
    ctx.effect(() => slots.inject?.('conversation.chat.node', registerShadows), 'dsh-fold: chat shadow lifecycle')
  } else {
    // Compatibility path for older hosts that predate slots.inject. Those
    // hosts supplied the chat slot before loading client plugins.
    ctx.effect(registerShadows, 'dsh-fold: chat shadows')
  }
}
