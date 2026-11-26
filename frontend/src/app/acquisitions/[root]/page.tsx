import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { Provenance } from "@/components/Provenance";
import { AsOf, DetailPending, External, HexText, Id, StateLabel } from "@/components/ui";
import { ArtRegistry } from "@/generated/contracts";
import { etherscanTx, etherscanTxLogs, proposalTitle } from "@/lib/format";
import { REISSUED_AS } from "@/lib/metadata";
import { getSnapshot, ipfsGateway } from "@/lib/server/snapshot";
import { AcquisitionProof, type ProofWork } from "./AcquisitionProof";
import { TreeRebuild } from "./TreeRebuild";

const REPOSITORY = "https://github.com/jorge-tb/raisonne-foundation";

export async function generateStaticParams() {
  const { galleries } = await getSnapshot();
  return galleries.map((g) => ({ root: g.root }));
}

export async function generateMetadata(props: PageProps<"/acquisitions/[root]">): Promise<Metadata> {
  const { root } = await props.params;
  return { title: `Acquisition ${root}` };
}

// The frame is shared by every acquisition (the App Shell a link prefetches); what depends on the root
// in the URL streams in inside the boundary.
export default function AcquisitionPage(props: PageProps<"/acquisitions/[root]">) {
  return (
    <>
      <p className="small">
        <Link href="/acquisitions">← Acquisitions</Link>
      </p>
      <Suspense fallback={<DetailPending />}>
        <AcquisitionDetails params={props.params} />
      </Suspense>
    </>
  );
}

const day = new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" });
// Shares are floored so they never overstate (as on the Governance page).
const floorPct = (x: bigint, of: bigint) => `${(Math.floor((Number(x) / Number(of)) * 1000 + 1e-9) / 10).toFixed(1)}%`;

// The acquisition's proof page: the Collection shows the art and the ledger when it was bought; this page
// answers whether these works are exactly what the shareholders voted for.
async function AcquisitionDetails({ params }: Pick<PageProps<"/acquisitions/[root]">, "params">) {
  const { root } = await params;
  const snapshot = await getSnapshot();
  const gallery = snapshot.galleries.find((g) => g.root.toLowerCase() === root.toLowerCase());
  const acquired = snapshot.acquisitions.acquired.find((a) => a.root.toLowerCase() === root.toLowerCase());
  if (!gallery || !acquired) notFound();

  const gateway = ipfsGateway();
  const proposals = snapshot.proposals.filter((p) => gallery.proposalIds.includes(p.id));
  const source = proposals.find((p) => p.id === gallery.sourceProposalId);
  const votes = source?.votes;
  const minted = acquired.works.filter((w) => w.minted).length;
  const works: ProofWork[] = acquired.works.map((w) => {
    const art = w.metadata.status === "ok" ? w.metadata.artwork : null;
    const id = w.tokenId.toString();
    return {
      tokenId: id,
      name: art?.name ?? null,
      src: art?.imageCid && w.image ? new URL(art.imageCid, gateway).href : null,
      reissuedAs: id in REISSUED_AS ? REISSUED_AS[id].toString() : null,
      minted: w.minted,
    };
  });

  return (
    <>
      <h1>
        <HexText text={source ? proposalTitle(source.description) : "Acquisition"} />
      </h1>
      <p className="acq-facts">
        {gallery.enabled ? (
          <span className="ledger-status st-enabled">Enabled</span>
        ) : (
          <span className="ledger-status st-revoked">Revoked</span>
        )}
        <span>{day.format(new Date(Number(acquired.addedAt) * 1000))}</span>
        <span>
          {works.length} {works.length === 1 ? "work" : "works"} · {minted} minted
        </span>
        {votes?.supply ? <span>Voted {floorPct(votes.tally.for, votes.supply)} of all shares For</span> : null}
      </p>
      <AsOf snapshot={snapshot} />

      {gallery.cid ? (
        <AcquisitionProof root={gallery.root} cid={gallery.cid} gateway={gateway} registry={ArtRegistry.address} works={works} />
      ) : (
        <p className="acq-unverifiable">
          <strong>? Unverifiable.</strong> The proposal description doesn&apos;t name exactly one tree file, so there is
          nothing to rebuild.
        </p>
      )}

      <div className="acq-below">
        <Provenance
          current={1}
          steps={[
            {
              label: "Decided",
              title: (
                <span className="acq-decided">
                  {proposals.length === 0 && <span className="muted">No proposal found for this root</span>}
                  {proposals.map((p) => (
                    <span key={p.id.toString()}>
                      <StateLabel state={p.state} /> <Link href={`/governance#${p.id}`}>{proposalTitle(p.description)}</Link>
                    </span>
                  ))}
                </span>
              ),
              detail: source?.executed ? (
                <>
                  Executed in block {source.executed.blockNumber.toString()} ·{" "}
                  <External href={etherscanTx(source.executed.transactionHash)}>transaction</External>
                </>
              ) : undefined,
            },
            {
              label: "Acquired",
              title: "This root, committed on chain",
              detail: (
                <>
                  Block {gallery.added.blockNumber.toString()} ·{" "}
                  <External href={etherscanTxLogs(gallery.added.transactionHash)}>GalleryAdded event</External>
                </>
              ),
            },
            {
              label: "Collected",
              title:
                minted === 0 ? (
                  "Nothing minted yet"
                ) : (
                  <Link href={`/collection#${gallery.root}`}>
                    {minted} of {works.length} works minted
                  </Link>
                ),
            },
          ]}
        />

        <section aria-labelledby="acq-record-title">
          <h2 id="acq-record-title">Record</h2>
          <dl className="acq-record">
            <dt>Root</dt>
            <dd>
              <Id value={gallery.root} />
            </dd>
            <dt>Tree file</dt>
            <dd>
              {gallery.cid ? (
                <External href={new URL(gallery.cid, gateway).href}>
                  <Id value={`ipfs://${gallery.cid}`} />
                </External>
              ) : (
                "no single CID in the proposal description"
              )}
            </dd>
            <dt>Registry</dt>
            <dd>
              <Id value={ArtRegistry.address} />
            </dd>
            <dt>Added</dt>
            <dd>
              Block {gallery.added.blockNumber.toString()} ·{" "}
              <External href={etherscanTxLogs(gallery.added.transactionHash)}>GalleryAdded event</External>
              {gallery.revoked && (
                <>
                  <br />
                  Revoked in block {gallery.revoked.blockNumber.toString()} ·{" "}
                  <External href={etherscanTxLogs(gallery.revoked.transactionHash)}>GalleryRevoked event</External>
                </>
              )}
            </dd>
          </dl>
          <p className="muted small">
            Rebuild every root from your terminal: <code>npm run verify</code> in the repository&apos;s{" "}
            <External href={`${REPOSITORY}/tree/main/frontend#readme`}>frontend</External>, with your own RPC and Etherscan
            keys.
          </p>
          <details className="acq-more">
            <summary>Rebuild the root from your own file</summary>
            <TreeRebuild root={gallery.root} />
          </details>
        </section>
      </div>
    </>
  );
}
