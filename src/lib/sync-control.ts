// On globalThis because route handlers and server actions can load separate
// copies of this module, and both must see the same running sync.
const state = globalThis as unknown as { runningSync?: AbortController };

/** Claims the single sync slot. null means a sync is already running. */
export function beginSync() {
  if (state.runningSync) return null;
  state.runningSync = new AbortController();
  return state.runningSync;
}

export function endSync() {
  state.runningSync = undefined;
}

export function requestStop() {
  state.runningSync?.abort();
}
