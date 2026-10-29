import type { Hex } from "viem";
import { leafHash, murkyRoot } from "./merkle";

export const DEFAULT_IPFS_GATEWAY = "https://maroon-mad-condor-340.mypinata.cloud/ipfs/";

export type GalleryLeaf = { tokenId: bigint; cid: string };

export type GalleryFetch =
  | { ok: true; leaves: GalleryLeaf[] }
  | { ok: false; reason: "gateway" | "malformed"; detail: string };

// Proposal descriptions are free text; nothing on chain enforces "Tree published at ipfs://<cid>".
// Returns every distinct CID so the caller can treat zero or several as Unverifiable.
export function parseTreeCids(description: string): string[] {
  const cids = [...description.matchAll(/ipfs:\/\/([A-Za-z0-9]+)/g)].map((m) => m[1]);
  return [...new Set(cids)];
}

export async function fetchGallery(cid: string, gateway = DEFAULT_IPFS_GATEWAY): Promise<GalleryFetch> {
  let body: unknown;
  try {
    const res = await fetch(new URL(cid, gateway), { signal: AbortSignal.timeout(15_000) });
    if (!res.ok) return { ok: false, reason: "gateway", detail: `HTTP ${res.status}` };
    body = await res.json().catch(() => undefined);
  } catch (error) {
    return { ok: false, reason: "gateway", detail: error instanceof Error ? error.message : String(error) };
  }
  return parseGallery(body);
}

// Gallery file: [{ "tokenId": 1, "cId": "bafk..." }, ...] in curator order.
export function parseGallery(body: unknown): GalleryFetch {
  if (!Array.isArray(body) || body.length === 0) return { ok: false, reason: "malformed", detail: "not a non-empty array" };
  const leaves: GalleryLeaf[] = [];
  for (const [i, entry] of body.entries()) {
    const { tokenId, cId } = (entry ?? {}) as Record<string, unknown>;
    if (!Number.isSafeInteger(tokenId) || (tokenId as number) < 0 || typeof cId !== "string" || cId === "")
      return { ok: false, reason: "malformed", detail: `entry ${i} is not { tokenId, cId }` };
    leaves.push({ tokenId: BigInt(tokenId as number), cid: cId });
  }
  return { ok: true, leaves };
}

// Root as Murky built it on chain (see merkle.ts). Throws for a single-leaf gallery, like Murky.
export function computeRoot(leaves: GalleryLeaf[]): Hex {
  return murkyRoot(leaves.map((l) => leafHash(l.tokenId, l.cid)));
}
