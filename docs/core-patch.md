# Core patch (source level): shared child-slot declarations in `SlotCore`

DSH `0.1.1-rc.2` · package `@deepseek-ai/dsh-client-ui-slots` · file `lib/index.js`

## Why

The keyed slot `conversation.chat.node` supports cell shadowing by priority
(lowest wins), but the slot core enforces *exclusive* child-slot
declarations:

- `SlotCore.register` throws when a second entry declares `children` for an
  already-declared slot (`slot "<key>" is already declared`).
- `SlotCore.releaseEntry` tears down a declared child slot (spec AND every
  occupant) whenever the declaring entry is disposed.

A shadowing entry therefore cannot obtain a `renderSlot` binding for the
official `tool.call.toolview` slot, and naive re-declaration would break the
product's tool views on unload. This patch makes child-slot declarations
SHARED when the incoming spec is structurally identical to the live one, so
"shadow and delegate" renderers (like dsh-fold) become possible
without any other core change.

`dsh-fold` ships this exact change as a *reversible runtime overlay*
(`src/client/slots-core-overlay.ts`) so the plugin works on unmodified
installs. The overlay is a thin wrapper around the live methods (no
method-text dependency — the shipped web bundle is minified, so text
matching is impossible); it relies on two structural invariants of this
SlotCore version — `register` pushes the created entry into
`records.get(name).entries`, and `releaseEntry(entry)` tears down the
slots of `entry.children` — and fails closed (plugin inert, official UI
unaffected) if they break. If you prefer to patch the source (e.g. for a
custom build of the web frontend), apply the two deviations below.

## Deviation D1 — `SlotCore.register`

Replace the exclusive children check:

```js
if (options.children) for (const childKey of Object.keys(options.children)) {
    const childRec = this.records.get(childKey);
    if (childRec?.spec) throw new Error(`slot "${childKey}" is already declared (by ${childRec.declaredBy ?? "an unknown entry"})`);
}
```

with a shared check plus per-entry ownership bookkeeping:

```js
if (options.children) {
    for (const childKey of Object.keys(options.children)) {
        const childRec = this.records.get(childKey);
        if (childRec?.spec === void 0) continue;
        if (!sameSpec(childRec.spec, options.children[childKey])) {
            throw new Error(`slot "${childKey}" is already declared (by ${childRec.declaredBy ?? "an unknown entry"})`);
        }
        // Identical spec: co-declaration. The record's spec stays with the
        // original declarer; this entry keeps the child key in its own
        // children table for render authorization.
        const owners = childOwners.get(childRec);
        if (owners === void 0) { const set = new Set(); childOwners.set(childRec, set); owners = set; }
        owners.push(entry); // entry is created below — move this line after `const entry = {...}`
    }
}
```

(`sameSpec` compares `{kind, scope, inject?}` key-wise; `childOwners` is a
module-scope `WeakMap<Record, Set<entry>>`.) The `entry` creation and the
declaration loop below stay as-is, except that co-declared keys are skipped
in the declaration loop (spec/declaredBy/parent/declarationEpoch untouched),
so `slots.inject` watchers on the child slot are not disturbed.

## Deviation D2 — `SlotCore.releaseEntry`

Replace the unconditional child teardown:

```js
if (!entry.children) return;
for (const childKey of Object.keys(entry.children)) {
    const childRec = this.records.get(childKey);
    if (!childRec) continue;
    const doomed = childRec.entries;
    childRec.spec = void 0;
    ...
}
```

with a co-ownership drop first:

```js
if (!entry.children) return;
for (const childKey of Object.keys(entry.children)) {
    const childRec = this.records.get(childKey);
    if (!childRec) continue;
    const owners = childOwners.get(childRec);
    if (owners !== void 0 && owners.includes(entry)) {
        const rest = owners.filter((e) => e !== entry);
        if (rest.length > 0) { childOwners.set(childRec, rest); continue; }
        childOwners.delete(childRec);
        continue; // last co-owner: the spec's original declarer (untracked)
                  // still owns the slot and performs the teardown itself
    }
    const doomed = childRec.entries;
    ...original teardown...
}
```

Invariant relied on: an entry with children for key K that is not tracked in
`childOwners` is K's spec owner, so exactly one teardown happens, when the
owner (original declarer or a later normal declarer) disposes.

## Verification

The same behavior is exercised end-to-end against the real package by
`test/overlay.test.mjs` (`pnpm test`).
