"use client";

import { useSyncExternalStore } from "react";
import { browserOutcome, browserOutcomesVersion, subscribeBrowserOutcomes } from "@/lib/browser/checkStore";

// Appended to a server check in an action card: whether the visitor's browser reached the same answer.
// Nothing until the browser has one (and nothing on the server render).
export function BrowserConfirm({ uid }: { uid: string }) {
  useSyncExternalStore(subscribeBrowserOutcomes, browserOutcomesVersion, () => 0);
  const outcome = browserOutcome(uid);
  if (!outcome) return null;
  if (outcome === "pass") return <span className="ac-browser"> · also in your browser</span>;
  if (outcome === "fail") return <span className="ac-browser is-bad"> · your browser disagrees</span>;
  return <span className="ac-browser is-unknown"> · not re-checked in your browser</span>;
}
