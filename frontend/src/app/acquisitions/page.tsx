import type { Metadata } from "next";
import Link from "next/link";
import { AsOf, Hash } from "@/components/ui";
import { proposalTitle } from "@/lib/format";
import { getSnapshot } from "@/lib/server/snapshot";

export const metadata: Metadata = { title: "Acquisitions" };

export default async function AcquisitionsPage() {
  const snapshot = await getSnapshot();
  const titleOf = (id: bigint | null) => {
    const p = snapshot.proposals.find((x) => x.id === id);
    return p ? proposalTitle(p.description) : null;
  };

  return (
    <>
      <h1>Acquisitions</h1>
      <p className="lede">
        Each acquisition the shareholders approve adds a gallery to the ArtRegistry contract: a Merkle root of the
        artworks it brings in. Artworks are minted from it by proving membership in the tree. Open one to rebuild its tree
        in your browser and inspect every proof.
      </p>
      <AsOf snapshot={snapshot} />
      {snapshot.galleries.length === 0 && <p>No acquisitions yet.</p>}
      {snapshot.galleries.map((g) => (
        <article className="card" key={g.root}>
          <header>
            <span className="state">{g.enabled ? "● Enabled" : "⊘ Revoked"}</span>
            <h2>
              <Link href={`/acquisitions/${g.root}`}>{titleOf(g.sourceProposalId) ?? "Acquisition"}</Link>
            </h2>
          </header>
          <dl className="compact">
            <dt>Root</dt>
            <dd>
              <Hash>{g.root}</Hash>
            </dd>
            <dt>Tree</dt>
            <dd>{g.cid ? <Hash>ipfs://{g.cid}</Hash> : <span>no single CID in the proposal description</span>}</dd>
            <dt>Minted</dt>
            <dd>
              {g.minted.length === 0 ? "none" : g.minted.map((m) => `#${m.tokenId}`).join(", ")}
            </dd>
            <dt>Proposals</dt>
            <dd>
              {g.proposalIds.length} adding this root
              {g.proposalIds.length > 1 && " (same calldata proposed more than once)"}
            </dd>
          </dl>
        </article>
      ))}
    </>
  );
}
