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
import { AssistantNodeWrapper, setSlotsService } from './AssistantNodeWrapper'
import { setGroupT } from './translate'
import { setSessionsService } from './auto-load'
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

export const name = 'tool-group'
export const inject = ['slots', 'locale', 'sessions']

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
  // 1c. The sessions service powers scroll-to-top auto-load-older (the
  //     official loadOlder action is reached through the session scope).
  setSessionsService(ctx.get('sessions') as { scope(id: string): { get(name: string): unknown } | undefined } | undefined)

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

  // 6. Shadow the user cell: long user input folds to 3 lines behind a
  //    展开/收起 toggle. Conversation locale (the replica needs product keys
  //    like image.label / copy / clock.md); the toggle labels come from the
  //    shared tool-group translate.
  ctx.effect(
    () =>
      slots.register(
        {
          name: 'conversation.chat.node',
          key: 'user',
          priority: -100,
          locale: 'conversation',
        },
        UserNodeWrapper,
      ) as () => void,
    'dsh-tool-group: user shadow',
  )

  // 7. Shadow the non-text cells — automatic compaction, context injection,
  //    manual compaction, user commands (/permission …), model-retry notices
  //    (已重试模型请求), turn errors / max-token notices, unknown surfaces and
  //    workflow runs: everything except plain text folds. `command`
  //    re-declares the commandview child slot (the overlay treats the
  //    identical spec as a shared co-declaration), so the official
  //    CommandNodeView keeps its keyed command cards when expanded.
  for (const key of ['compaction', 'context', 'manual-compaction', 'command', 'model-retry', 'turn-error', 'turn-max-tokens', 'unknown', 'workflow-run']) {
    ctx.effect(
      () =>
        slots.register(
          {
            name: 'conversation.chat.node',
            key,
            priority: -100,
            locale: 'conversation',
            ...(key === 'command' ? { children: { 'conversation.chat.commandview': { kind: 'keyed', scope: 'session' } } } : {}),
          },
          NoticeNodeWrapper,
        ) as () => void,
      `dsh-tool-group: ${key} shadow`,
    )
  }
}
