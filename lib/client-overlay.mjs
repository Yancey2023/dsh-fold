// src/client/slots-core-overlay.ts
function sameSpec(left, right) {
  if (left === right) return true;
  if (typeof left !== "object" || typeof right !== "object" || left === null || right === null) return false;
  const a = left;
  const b = right;
  const ka = Object.keys(a);
  const kb = Object.keys(b);
  if (ka.length !== kb.length) return false;
  return ka.every((key) => a[key] === b[key]);
}
function installSlotCoreOverlay(SlotCore) {
  const originalRegister = SlotCore.prototype.register;
  const originalRelease = SlotCore.prototype.releaseEntry;
  if (typeof originalRegister !== "function" || typeof originalRelease !== "function") {
    throw new Error("dsh-tool-group: SlotCore.register/releaseEntry are not functions; refusing to install the overlay (plugin stays inert)");
  }
  const coOwners = /* @__PURE__ */ new Map();
  const wrappedRegister = function(options, component) {
    let coSpecs = null;
    let forwarded = options;
    if (options?.children) {
      for (const childKey of Object.keys(options.children)) {
        const childRec = this.records.get(childKey);
        if (childRec === void 0) continue;
        const existing = childRec.spec;
        if (existing === void 0) continue;
        if (!sameSpec(existing, options.children[childKey])) {
          return originalRegister.call(this, options, component);
        }
        if (coSpecs === null) coSpecs = {};
        coSpecs[childKey] = options.children[childKey];
      }
      if (coSpecs !== null) {
        const rest = { ...options.children };
        for (const key of Object.keys(coSpecs)) delete rest[key];
        forwarded = Object.keys(rest).length > 0 ? { ...options, children: rest } : { ...options, children: void 0 };
      }
    }
    const rec = this.records.get(options.name);
    const before = rec?.entries;
    const dispose = originalRegister.call(this, forwarded, component);
    if (coSpecs === null) return dispose;
    const after = this.records.get(options.name)?.entries;
    const created = Array.isArray(after) ? after.find((e) => !Array.isArray(before) || !before.includes(e)) : void 0;
    if (created === void 0) {
      dispose();
      throw new Error("dsh-tool-group: could not locate the entry created by SlotCore.register; refusing the shadow (official UI keeps rendering)");
    }
    const entry = created;
    entry.children = { ...entry.children ?? {}, ...coSpecs };
    for (const childKey of Object.keys(coSpecs)) {
      let owners = coOwners.get(childKey);
      if (owners === void 0) {
        owners = /* @__PURE__ */ new Set();
        coOwners.set(childKey, owners);
      }
      owners.add(entry);
    }
    return dispose;
  };
  const wrappedRelease = function(entry) {
    if (!entry.children) {
      originalRelease.call(this, entry);
      return;
    }
    let stripped = null;
    for (const childKey of Object.keys(entry.children)) {
      const owners = coOwners.get(childKey);
      if (owners !== void 0 && owners.has(entry)) {
        owners.delete(entry);
        if (owners.size === 0) coOwners.delete(childKey);
        if (stripped === null) stripped = { ...entry.children };
        delete stripped[childKey];
      }
    }
    if (stripped === null) {
      originalRelease.call(this, entry);
      return;
    }
    const pristine = entry.children;
    entry.children = Object.keys(stripped).length > 0 ? stripped : void 0;
    try {
      originalRelease.call(this, entry);
    } finally {
      entry.children = pristine;
    }
  };
  SlotCore.prototype.register = wrappedRegister;
  SlotCore.prototype.releaseEntry = wrappedRelease;
  return () => {
    if (SlotCore.prototype.register === wrappedRegister) SlotCore.prototype.register = originalRegister;
    if (SlotCore.prototype.releaseEntry === wrappedRelease) SlotCore.prototype.releaseEntry = originalRelease;
  };
}
export {
  installSlotCoreOverlay
};
