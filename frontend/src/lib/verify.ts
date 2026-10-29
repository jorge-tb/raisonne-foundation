import type { Hex } from "viem";
import type { ActionKind } from "./actions";
import { computeRoot, fetchGallery, parseTreeCids } from "./gallery";

export type Verification =
  | { status: "match"; root: Hex; cid: string }
  | { status: "mismatch"; root: Hex; computed: Hex; cid: string }
  | { status: "unverifiable"; root: Hex; reason: string }
  | { status: "revokes-gallery"; root: Hex }
  | { status: "not-applicable" }
  | { status: "malformed"; error: string };

// Verdict for one action. `description` is the proposal's, where the tree CID lives.
export async function verifyAction(action: ActionKind, description: string, gateway?: string): Promise<Verification> {
  switch (action.kind) {
    case "not-applicable":
      return { status: "not-applicable" };
    case "malformed":
      return { status: "malformed", error: action.error };
    case "revoke-gallery":
      return { status: "revokes-gallery", root: action.root };
  }

  const { root } = action;
  const cids = parseTreeCids(description);
  if (cids.length === 0) return { status: "unverifiable", root, reason: "no ipfs:// CID in the description" };
  if (cids.length > 1) return { status: "unverifiable", root, reason: `${cids.length} CIDs in the description` };

  const [cid] = cids;
  const gallery = await fetchGallery(cid, gateway);
  if (!gallery.ok) return { status: "unverifiable", root, reason: `${gallery.reason}: ${gallery.detail}` };

  if (gallery.leaves.length < 2) return { status: "unverifiable", root, reason: "single-leaf gallery (Murky can't build it)" };
  const computed = computeRoot(gallery.leaves);
  return computed.toLowerCase() === root.toLowerCase()
    ? { status: "match", root, cid }
    : { status: "mismatch", root, computed, cid };
}
