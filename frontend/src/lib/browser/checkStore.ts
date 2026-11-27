// What the visitor's browser found for each action, shared between the Governance page's check band
// (which runs the checks) and the action cards (which confirm their own server-side verdict with it).
// Keyed by the card's uid (`${proposalId}-${actionIndex}`). Empty on the server and until a check ends.

export type BrowserOutcome = "pass" | "fail" | "unverifiable";

const results = new Map<string, BrowserOutcome>();
const listeners = new Set<() => void>();
let version = 0;

const emit = () => {
  version++;
  listeners.forEach((l) => l());
};

export function setBrowserOutcome(uid: string, outcome: BrowserOutcome) {
  results.set(uid, outcome);
  emit();
}

export function clearBrowserOutcomes() {
  results.clear();
  emit();
}

export function subscribeBrowserOutcomes(listener: () => void) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export const browserOutcomesVersion = () => version;
export const browserOutcome = (uid: string) => results.get(uid);
