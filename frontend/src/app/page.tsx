import Image from "next/image";
import Link from "next/link";
import { formatEther, isAddressEqual } from "viem";
import { ContractGlyph } from "@/components/ContractGlyph";
import { HoldersEmblem } from "@/components/holders/HoldersEmblem";
import { holdersData } from "@/components/holders/views";
import { AcquisitionsIcon, CollectionIcon, GovernanceIcon } from "@/components/icons";
import { AsOf, Hash, StateLabel } from "@/components/ui";
import { FundTreasury } from "@/generated/contracts";
import { formatDuration, formatTimestamp, proposalTitle } from "@/lib/format";
import { getSnapshot, ipfsGateway } from "@/lib/server/snapshot";
import type { ProposalState } from "@/lib/states";

// Height of the paintings in the collection door (desktop); widths follow each image's proportions.
const STRIP_PX = 180;

// Anyone can propose, so the title is free text: shown whole, never parsed for a structure. Only hex
// identifiers (addresses, hashes) are set as hashes, wherever they appear, so their wrap looks intended.
function ProposalHeadline({ title, state }: { title: string; state: ProposalState }) {
  return (
    <span className="door-proposal">
      <StateLabel state={state} />
      <span className="door-proposal-title">
        {title.split(/(0x[0-9a-fA-F]{40,})/).map((part, i) =>
          i % 2 ? (
            // The "0x" stays with the first digits, so a wrap never leaves a lone "0" at a line's end.
            <Hash key={i}>
              <span className="nowrap">{part.slice(0, 6)}</span>
              {part.slice(6)}
            </Hash>
          ) : (
            part
          ),
        )}
      </span>
    </span>
  );
}

export default async function Home() {
  const snapshot = await getSnapshot();
  const { proposals, galleries, tokens, capTable, contracts } = snapshot;
  const gateway = ipfsGateway();
  const held = tokens.filter((t) => isAddressEqual(t.owner, FundTreasury.address)).length;
  const strip = tokens
    .flatMap((t) =>
      t.metadata.status === "ok" && t.metadata.artwork.imageCid && t.image
        ? [{ id: t.id, src: new URL(t.metadata.artwork.imageCid, gateway).href, ratio: t.image.ratio }]
        : [],
    )
    .slice(0, 6);
  const latest = proposals[0]; // newest first
  const voteOpen = proposals.some((p) => p.state === "Active");
  const latestRoot = galleries.at(-1);
  const holders = holdersData(snapshot);

  return (
    <>
      {/* The header already carries the name; the heading says what the fund is. */}
      <h1>A closed-end art fund, governed on chain</h1>
      <p className="lede">
        Shareholders vote on acquisitions; each acquisition commits a Merkle root of its artworks on chain, and the tree
        is published on IPFS so anyone can rebuild the root and check it.
      </p>
      <AsOf snapshot={snapshot} />

      {/* Three doors, each showing what's inside right now. */}
      <div className="doors">
        <Link href="/collection" className="door door-collection">
          <span className="door-head">
            <CollectionIcon />
            Collection
          </span>
          {strip.length > 0 && (
            <span className="door-strip">
              {strip.map((s) => (
                <Image key={s.id.toString()} src={s.src} alt="" height={STRIP_PX} width={Math.round(STRIP_PX * s.ratio)} />
              ))}
            </span>
          )}
          <span className="door-caption">
            {tokens.length} artworks, {held} held by the fund&apos;s treasury
          </span>
          <span className="door-go">View the collection →</span>
        </Link>

        <Link href="/governance" className="door door-governance">
          {/* The voting-power ring; it morphs into the Governance page's donut on the way there. */}
          {holders && <HoldersEmblem data={holders} />}
          <span className="door-head">
            <GovernanceIcon />
            Governance
          </span>
          {latest ? (
            <>
              <ProposalHeadline title={proposalTitle(latest.description)} state={latest.state} />
              <span className="muted small">
                {latest.state === "Active"
                  ? `Voting open until ${formatTimestamp(latest.voteEnd)}.`
                  : `Latest vote ${formatTimestamp(latest.voteStart)}. ${voteOpen ? "A vote is open." : "No vote open."}`}
              </span>
            </>
          ) : (
            <span>No proposals yet.</span>
          )}
          <span className="muted small">
            {proposals.length} proposals, {proposals.filter((p) => p.state === "Executed").length} executed · who holds
            the shares
          </span>
          <span className="door-go">See decisions →</span>
        </Link>

        <Link href="/acquisitions" className="door">
          <span className="door-head">
            <AcquisitionsIcon />
            Acquisitions
          </span>
          <span>
            {galleries.length} Merkle roots approved by vote, {galleries.filter((g) => g.enabled).length} enabled
          </span>
          {latestRoot && <Hash>{latestRoot.root}</Hash>}
          <span className="muted small">Rebuild each tree and check every proof in your browser.</span>
          <span className="door-go">Verify them →</span>
        </Link>
      </div>

      {/* How the fund decides, in plain words; the addresses and proofs are on the Contracts page.
          The figures are read from the chain like everything else on the page. */}
      <section className="how" aria-labelledby="how-title">
        <h2 id="how-title">How the fund decides</h2>
        <ol className="how-steps">
          <li>
            <span className="how-icon">
              <ContractGlyph kind="FundShare" />
            </span>
            <b>Shareholders hold the fund</b>
            <span>
              {capTable
                ? `${capTable.holders.length} shareholders subscribed ${formatEther(capTable.supply)} ETH. `
                : ""}
              Each share is a vote once its holder delegates it.
            </span>
          </li>
          <li>
            <span className="how-icon">
              <ContractGlyph kind="FundGovernor" />
            </span>
            <b>They vote on proposals</b>
            <span>
              Any holder can propose an acquisition.
              {capTable &&
                ` At least ${Math.round((Number(capTable.quorum.numerator) / Number(capTable.quorum.denominator)) * 100)}% of all shares must vote.`}
            </span>
          </li>
          <li>
            <span className="how-icon">
              <ContractGlyph kind="TimelockController" />
            </span>
            <b>Decisions wait</b>
            <span>
              A passed proposal waits {formatDuration(contracts.params.minDelay)} in the timelock before it can run.
            </span>
          </li>
          <li>
            <span className="how-icon">
              <ContractGlyph kind="FundTreasury" />
            </span>
            <b>Then they run, as voted</b>
            <span>The treasury pays, or the registry adds a gallery. Nothing moves any other way.</span>
          </li>
        </ol>
        <p className="how-more">
          {/* Opens the intro already playing: this click is the visitor asking for it. */}
          <Link href="/contracts#intro" className="how-watch">
            ▶ Watch how a decision moves (20 s)
          </Link>
          <Link href="/contracts">See the contracts that enforce it →</Link>
        </p>
      </section>
    </>
  );
}
