export function createUndoHistory(limit = 50) {
  let entries = [];
  let activeGroup = null;

  return {
    remember(value, dirty, group) {
      if (activeGroup === group) return;
      entries.push({ value: structuredClone(value), dirty });
      if (entries.length > limit) entries.shift();
      activeGroup = group;
    },
    endGroup(group) {
      if (!group || activeGroup === group) activeGroup = null;
    },
    undo() {
      const entry = entries.pop();
      activeGroup = null;
      return entry ? { value: structuredClone(entry.value), dirty: entry.dirty } : null;
    },
    clear() {
      entries = [];
      activeGroup = null;
    },
    get canUndo() {
      return entries.length > 0;
    },
  };
}
