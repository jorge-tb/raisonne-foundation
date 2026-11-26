import type { Metadata } from "next";
import { AcquisitionLedger, type LedgerEntry, type LedgerWork } from "@/components/AcquisitionLedger";
import { AsOf } from "@/components/ui";
import { formatTimestamp, proposalTitle } from "@/lib/format";
import { getSnapshot, ipfsGateway, type Snapshot } from "@/lib/server/snapshot";

export const metadata: Metadata = { title: "Acquisitions" };

type TreeWork = Snapshot["acquisitions"]["acquired"][number]["works"][number];

export default async function AcquisitionsPage() {
  const snapshot = await getSnapshot();
  const { acquired, proposed } = snapshot.acquisitions;
  const gateway = ipfsGateway();
  const titleOf = (id: bigint | null) => {
    const p = snapshot.proposals.find((x) => x.id === id);
    return p ? proposalTitle(p.description) : "Acquisition";
  };
  // A work without a readable image keeps its place in the row as its token number.
  const work = (w: TreeWork): LedgerWork => {
    const art = w.metadata.status === "ok" ? w.metadata.artwork : null;
    return {
      tokenId: w.tokenId.toString(),
      name: art?.name ?? null,
      src: art?.imageCid && w.image ? new URL(art.imageCid, gateway).href : null,
      ratio: w.image?.ratio ?? 0.8,
      minted: w.minted,
    };
  };

  const entries: LedgerEntry[] = [
    ...proposed.map((p) => ({
      key: `${p.proposalId}-${p.root}`,
      href: `/governance#${p.proposalId}`,
      title: titleOf(p.proposalId),
      status: "proposed" as const,
      note:
        p.state === "Pending"
          ? `Vote opens ${formatTimestamp(p.voteStart)}`
          : p.state === "Active"
            ? `In vote · ends ${formatTimestamp(p.voteEnd)}`
            : p.state === "Succeeded"
              ? "Passed · to be queued"
              : "Queued · to be executed",
      at: Number(p.voteStart),
      verdict: p.verdict === "match" || p.verdict === "mismatch" ? p.verdict : ("unverifiable" as const),
      works: p.works.map(work),
    })),
    ...acquired
      .map((g) => ({
        key: g.root,
        href: `/acquisitions/${g.root}`,
        title: titleOf(g.proposalId),
        status: g.enabled ? ("enabled" as const) : ("revoked" as const),
        at: Number(g.addedAt),
        verdict: g.verdict === "match" || g.verdict === "mismatch" ? g.verdict : ("unverifiable" as const),
        works: g.works.map(work),
      }))
      .sort((a, b) => b.at - a.at), // newest first
  ];

  const committed = acquired.reduce((t, g) => t + g.works.length, 0);
  const minted = acquired.reduce((t, g) => t + g.works.filter((w) => w.minted).length, 0);

  return (
    <>
      <h1>Acquisitions</h1>
      <p className="lede">
        Each acquisition the shareholders approve commits a Merkle root of its works on chain; works are minted from it
        with a proof. Open one to rebuild its tree in your browser.
      </p>
      <AsOf snapshot={snapshot} />
      {entries.length === 0 ? (
        <p>No acquisitions yet.</p>
      ) : (
        <>
          <dl className="ledger-totals">
            <div>
              <dd>{acquired.length}</dd>
              <dt>{acquired.length === 1 ? "acquisition" : "acquisitions"}</dt>
            </div>
            <div>
              <dd>{committed}</dd>
              <dt>works committed</dt>
            </div>
            <div>
              <dd>{minted}</dd>
              <dt>minted</dt>
            </div>
          </dl>
          <AcquisitionLedger entries={entries} />
        </>
      )}
    </>
  );
}
