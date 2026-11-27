import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Suspense, type ReactNode } from "react";
import { CopyButton } from "@/components/CopyButton";
import { AsOf, DetailPending, External, HexText, Id, StateLabel } from "@/components/ui";
import { ArtRegistry } from "@/generated/contracts";
import { etherscanCode, etherscanTx, etherscanTxLogs, proposalTitle } from "@/lib/format";
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
  // The decision is the proposal that was executed; earlier attempts with the same root that didn't pass
  // stay on Governance.
  const decision = proposals.find((p) => p.state === "Executed") ?? source;
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

      {/* The decision and the transaction once each, then the three identifiers a verifier needs, each with
          what it is and what to do with it. Provenance stays on artwork pages, where it isn't repeated. */}
      <section className="acq-ids" aria-labelledby="acq-ids-title">
        <h2 id="acq-ids-title" className="visually-hidden">
          On-chain record
        </h2>
        <dl className="acq-lines">
          <div>
            <dt>Decided by</dt>
            <dd>
              {decision ? (
                <>
                  <StateLabel state={decision.state} />{" "}
                  <Link href={`/governance#${decision.id}`}>
                    <HexText text={proposalTitle(decision.description)} />
                  </Link>
                </>
              ) : (
                <span className="muted">No proposal found for this root</span>
              )}
            </dd>
          </div>
          <div>
            <dt>Added</dt>
            <dd>
              Block {gallery.added.blockNumber.toString()} ·{" "}
              <External href={etherscanTx(gallery.added.transactionHash)}>transaction</External> ·{" "}
              <External href={etherscanTxLogs(gallery.added.transactionHash)}>GalleryAdded event</External>
            </dd>
          </div>
          {gallery.revoked && (
            <div>
              <dt>Revoked</dt>
              <dd>
                Block {gallery.revoked.blockNumber.toString()} ·{" "}
                <External href={etherscanTxLogs(gallery.revoked.transactionHash)}>GalleryRevoked event</External>
              </dd>
            </div>
          )}
        </dl>

        <ul className="acq-idcards">
          <IdCard
            name="Root"
            value={gallery.root}
            what={`The one hash the registry stores for these ${works.length} ${works.length === 1 ? "work" : "works"}.`}
            action={<External href={etherscanTxLogs(gallery.added.transactionHash)}>See it on Etherscan</External>}
          />
          {gallery.cid ? (
            <IdCard
              name="Tree file"
              value={`ipfs://${gallery.cid}`}
              what="The public list of works the root is built from."
              action={<External href={new URL(gallery.cid, gateway).href}>Open on IPFS</External>}
            />
          ) : (
            <li className="acq-idcard">
              <span className="acq-idcard-name">Tree file</span>
              <span className="acq-idcard-what">No single tree file is named in the proposal description.</span>
            </li>
          )}
          <IdCard
            name="Registry"
            value={ArtRegistry.address}
            what="ArtRegistry, the contract that checks every mint against the root."
            action={<External href={etherscanCode(ArtRegistry.address)}>Read the contract</External>}
          />
        </ul>

        {/* Ways to check without trusting this page, easiest first. The script's setup is in the README. */}
        <details className="acq-more acq-yourself">
          <summary>Check it yourself, without this page</summary>
          <h3>With your own copy of the list</h3>
          <TreeRebuild root={gallery.root} />
          <h3>With the project&apos;s open-source script</h3>
          <p>
            It rebuilds every acquisition&apos;s root on your machine, from the chain and IPFS directly.{" "}
            <External href={`${REPOSITORY}/tree/main/frontend#verification-script`}>How to run it</External>
          </p>
        </details>
      </section>
    </>
  );
}

// One identifier: its name, the value in full, what it is, and two things to do with it.
function IdCard({ name, value, what, action }: { name: string; value: string; what: string; action: ReactNode }) {
  const id = `acq-id-${name.toLowerCase().replace(/\W+/g, "-")}`;
  return (
    <li className="acq-idcard">
      <span className="acq-idcard-name">{name}</span>
      <span id={id}>
        <Id value={value} />
      </span>
      <span className="acq-idcard-what">{what}</span>
      <span className="acq-idcard-actions">
        <CopyButton value={value} label="Copy" targetId={id} />
        {action}
      </span>
    </li>
  );
}
