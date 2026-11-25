import type { Hex } from "viem";
import type { ActionKind, ContractName } from "./actions";
import { computeRoot, fetchGallery, parseTreeCids } from "./gallery";

export type Verification =
  | { status: "match"; root: Hex; cid: string; leaves: number }
  | { status: "mismatch"; root: Hex; computed: Hex; cid: string; leaves: number }
  | { status: "unverifiable"; root: Hex; reason: string }
  | { status: "revokes-gallery"; root: Hex }
  // Nothing to rebuild: the decoded call is the whole claim (treasury, protocol and unknown calls).
  | { status: "not-applicable" }
  | { status: "malformed"; contract: ContractName; error: string };

// Verdict for one action. `description` is the proposal's, where the tree CID lives.
export async function verifyAction(action: ActionKind, description: string, gateway?: string): Promise<Verification> {
  switch (action.kind) {
    case "add-gallery":
      break;
    case "malformed":
      return { status: "malformed", contract: action.contract, error: action.error };
    case "revoke-gallery":
      return { status: "revokes-gallery", root: action.root };
    default:
      return { status: "not-applicable" };
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
    ? { status: "match", root, cid, leaves: gallery.leaves.length }
    : { status: "mismatch", root, computed, cid, leaves: gallery.leaves.length };
}
