import type { Metadata } from "next";
import Link from "next/link";
import { AsOf, Hash } from "@/components/ui";
import { proposalTitle } from "@/lib/format";
import { getSnapshot } from "@/lib/server/snapshot";

export const metadata: Metadata = { title: "Galleries" };

export default async function GalleriesPage() {
  const snapshot = await getSnapshot();
  const titleOf = (id: bigint | null) => {
    const p = snapshot.proposals.find((x) => x.id === id);
    return p ? proposalTitle(p.description) : null;
  };

  return (
    <>
      <h1>Galleries</h1>
      <p className="lede">
        A gallery is a Merkle root the fund approved by vote. Artworks are minted from it by proving membership in the
        tree. Open a gallery to rebuild its tree in your browser and inspect every proof.
      </p>
      <AsOf snapshot={snapshot} />
      {snapshot.galleries.length === 0 && <p>No galleries yet.</p>}
      {snapshot.galleries.map((g) => (
        <article className="card" key={g.root}>
          <header>
            <span className="state">{g.enabled ? "● Enabled" : "⊘ Revoked"}</span>
            <h2>
              <Link href={`/galleries/${g.root}`}>{titleOf(g.sourceProposalId) ?? "Gallery"}</Link>
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
