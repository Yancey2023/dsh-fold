# dsh-tool-group

Fold **consecutive tool calls inside one assistant turn** in the DeepSeek
Harness (DSH) Web GUI into a single line — Codex-style — with a live
running-tool label, a running call count, and expand/collapse.

Implementation is **pure Slot / React**. No DOM patching, no `MutationObserver`,
no `display:none`, no `querySelector` games — the official product renderers
are reused for every expanded tool card.

![collapse states](docs/states.svg)

```
正在运行 bash                                        3   ▸     <- one tool running
                                                   12   ▸     <- all settled (left side empty)
                                                   4    ▾     <- expanded
                                                             (official tool cards, in order)
```

## Behaviour

- **Grouping rule**: `tool-call` nodes that are consecutive in the chat flow
  (`snapshot.chat.order`) and belong to the same turn form one group. Any
  other visible node — assistant text, user/steering message, command,
  compaction, … — ends the run, so groups never merge across assistant text
  or turn boundaries. Reasoning cannot split a run in the DSH data model: it
  is a block *inside* the assistant-step node, which is anchored before its
  step's tool calls.
- **While a call is running**: the collapsed line shows only the currently
  running tool (`正在运行 <tool>` / `Running <tool>`), the accumulated call
  count (completed + running), and a chevron. When the running call settles,
  the label switches to the next running call, or disappears entirely once
  every call has settled — **including error/cancelled/interrupted calls**
  (any `tool-result` form, `isError` or not).
- **Expanded**: the group bar stays on top (chevron down); below it every
  member renders through the **official `tool.call.toolview` dispatch** — the
  exact same slot path the product's `ToolCallTree` uses — so bash/read/grep/
  web/… cards, status, parameters, output, error, subcalls and nested calls
  all keep their native look. New calls arriving while expanded are appended
  live; the user's expanded state never resets (it lives in React state of
  the group leader seat, keyed by the stable first-call node key).
- **Count semantics**: top-level calls only; subcalls inside a block are not
  counted.

## DSH version

Developed and verified against **DSH `0.1.0-rc.7`** (`dsh --version`).
The runtime overlay is guarded by a method-text check and fails closed
(plugin stays inert) on a different version.

## Architecture / extension seam

```
ChatView (conversation.view)
  └─ ChatNodeSeat × N                       one seat per business node
       └─ renderSlot("conversation.chat.node", {node}, {entryKey: kind})
            └─ cell "tool-call":
                 product:  ToolCallTree  (priority 0)
                 ours:     ToolCallGroupView (priority -100  ← lowest wins)
                              ├─ collapsed bar (running label · count · chevron)
                              └─ expanded: ToolCallBranch × members
                                   └─ renderSlot("tool.call.toolview", {callId,
                                        toolName, block, cwd, openFile, inspect},
                                        {entryKey: toolName})
                                        ← official per-tool cards (bash, read, …)
```

1. **Seam**: the keyed Chat slot `conversation.chat.node`, cell `tool-call`,
   shadowed by priority (the slot core documents "register at a different
   priority to shadow it (lowest renders)"). The group is computed in React
   from the conversation snapshot (`useSession` → `snapshot.chat.order` +
   `snapshot.chat.nodes`), never from the DOM.
2. **Only the group leader renders**: each tool-call node has its own seat;
   the seat of the group's *first* member renders the group row, every other
   member seat returns `null` (zero-height flowItem), so there is exactly one
   row per group.
3. **One framework accommodation**: the slot core forbids a second entry
   from declaring `children` for an already-declared slot, and without that
   children table the shadowing entry receives no `renderSlot` binding for
   `tool.call.toolview`. `src/client/slots-core-overlay.ts` installs a
   **reversible overlay** on `SlotCore.prototype.register` /
   `.releaseEntry` (same module instance the shell uses — ui-slots is a
   shell-own static module) that treats an *identical* child spec as a
   shared co-declaration. The overlay is a THIN WRAPPER around the live
   methods (no method-text dependency), so it works against both the
   published package and the minified shipped web bundle; it restores the
   pristine methods on unload and never disturbs the product's
   declarations. This is the exact change of `docs/core-patch.md` (a
   source-level patch), delivered at runtime so the plugin works on
   unmodified DSH installs. Without this overlay the pure slot API
   **cannot** express "shadow a keyed renderer AND delegate to its child
   slot" — that is the single architecture limitation this plugin papered
   over, with the core change kept strictly separated.

## Install (web profile)

```bash
# from a local checkout (build first):
pnpm install
pnpm build

# option A — official plugin CLI:
dsh plugin --profile web add /absolute/path/to/dsh-tool-group

# option B — helper script (equivalent):
pnpm run install:dsh          # uses DSH_PROFILE (default: web)

# then restart the web app:
dsh --profile web
```

`dsh plugin … add` sees the package's `dsh.bundle.patch` declaration and
appends `dsh-tool-group` to the profile bundle stack; the client loader
picks up the `dsh.client.platform: "web"` manifest and serves
`exports["./client"]` to the page. The host row is a minimal anchor only.

For a GitHub install: `dsh plugin --profile web add github:you/dsh-tool-group`.

## Uninstall

```bash
dsh plugin --profile web remove dsh-tool-group
# or: pnpm run uninstall:dsh
# restart the web app — the official tool-call UI renders again immediately.
```

There is no residue: the slot entry, the overlay, the locale dictionaries
and the stylesheet are all removed with the plugin (each registration is
owned by the plugin fiber / ctx.effect).

## Build & test

```bash
pnpm install          # esbuild, typescript, @types/react, react, ui-slots (devDeps)
pnpm build            # tsc --noEmit + esbuild bundles (lib/)
pnpm test             # 5 suites: group · overlay (real ui-slots) · bundle smoke · component render · full slot pipeline
```

## Acceptance mapping

| Case | Result |
| --- | --- |
| 1 single tool running | `正在运行 bash  1 ▸` |
| 2 read✓ grep✓ bash running | `正在运行 bash  3 ▸` |
| 3 all settled | `3 ▸` — left side empty |
| 4 last failed | `2 ▸` — left side empty (error = ended) |
| 5 expand | bar + official cards, in order |
| 6 expand then new call | stays expanded, count grows, member appended |
| 7 assistant text | text untouched; groups never absorb it |
| 8 two chains split by text | two independent bars |
| 9 streaming | live count/running label via snapshot re-render (no polling) |
| 10 uninstall | official ToolCallTree wins the cell again automatically |

## Known limitations

- The expanded member rendering replicates the product's small `ToolCall`
  wrapper (call-row div + subcall recursion) because that wrapper is not
  exported; the actual cards are the official `tool.call.toolview` entries.
  The generic fallback for tools *without* a registered toolview is a
  compact theme-aware card (name/args/output/error) instead of the internal
  `GenericToolCard`.
- Group identity = first member's stable node key. If older history is
  loaded that prepends a tool call *before* the current leader, leadership
  moves to the new first node and that group's expanded state resets.
- The slot-core overlay relies on two structural invariants of this
  SlotCore version (register pushes the new entry into the parent record;
  releaseEntry tears down `entry.children`); if a future version breaks
  them, the wrapper fails closed (plugin inert, official UI unaffected).
- Expanding long chains re-mounts the official cards; hundreds of settled
  calls stay collapsed by default, so scrolling cost stays ~one row.

## Files

```
src/client/group.ts               pure grouping over the snapshot (unit-tested)
src/client/ToolCallGroupView.tsx  group row + official-member rendering
src/client/slots-core-overlay.ts  reversible SlotCore overlay (docs/core-patch.md)
src/client/styles.ts              theme-variable CSS
src/client/index.ts               plugin entry (registration)
src/host/index.ts                 minimal host anchor
cordis.patch.yml                  bundle patch layer (host row)
build.mjs                         tsc + esbuild
scripts/install-dsh.cjs           install/uninstall helper
test/                             group · overlay · bundle-smoke suites
docs/core-patch.md                the one core change, as a source patch
```

## License

MIT
