import type { Hex, PublicClient } from "viem";
import { ArtRegistry } from "@/generated/contracts";
import { eventsOf, type ScanResult } from "./chain";
import { parseTreeCids } from "./gallery";
import type { Proposal } from "./proposals";

export type Gallery = {
  root: Hex;
  enabled: boolean;
  addedBlock: bigint;
  revokedBlock: bigint | null;
  // Proposals whose actions add this root (root -> proposal is one-to-many, e.g. Acquisition 001 twice).
  proposalIds: bigint[];
  // The proposal the tree CID is taken from: the Executed one if any, else the latest.
  sourceProposalId: bigint | null;
  // null when the source description holds zero or several CIDs.
  cid: string | null;
  minted: { tokenId: bigint; cid: string; transactionHash: Hex }[];
};

// Galleries derived, not remembered: GalleryAdded / GalleryRevoked + live isGalleryEnabled,
// linked to proposals by decoding their calldata.
export async function getGalleries(client: PublicClient, scan: ScanResult, proposals: Proposal[]): Promise<Gallery[]> {
  const added = eventsOf(scan, ArtRegistry, "GalleryAdded");
  const revoked = eventsOf(scan, ArtRegistry, "GalleryRevoked");
  const minted = eventsOf(scan, ArtRegistry, "ArtworkMinted");

  const roots = [...new Map(added.map((l) => [l.args.root, l.blockNumber])).entries()];
  return Promise.all(
    roots.map(async ([root, addedBlock]) => {
      const enabled = await client.readContract({ ...ArtRegistry, functionName: "isGalleryEnabled", args: [root], blockNumber: scan.toBlock });
      const lastRevoke = revoked.filter((l) => l.args.root === root).at(-1);
      const linked = proposals.filter((p) => p.actions.some((a) => a.kind.kind === "add-gallery" && a.kind.root === root));
      const source = linked.find((p) => p.state === "Executed") ?? linked.at(-1) ?? null;
      const cids = source ? parseTreeCids(source.description) : [];
      return {
        root,
        enabled,
        addedBlock,
        revokedBlock: lastRevoke?.blockNumber ?? null,
        proposalIds: linked.map((p) => p.id),
        sourceProposalId: source?.id ?? null,
        cid: cids.length === 1 ? cids[0] : null,
        minted: minted
          .filter((l) => l.args.galleryRoot === root)
          .map((l) => ({ tokenId: l.args.tokenId, cid: l.args.cid, transactionHash: l.transactionHash })),
      };
    }),
  );
}
