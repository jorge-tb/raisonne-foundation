import Link from "next/link";
import { formatEther, isAddressEqual } from "viem";
import { CollectionWall } from "@/components/CollectionWall";
import { ContractGlyph } from "@/components/ContractGlyph";
import { HoldersEmblem } from "@/components/holders/HoldersEmblem";
import { holdersData } from "@/components/holders/views";
import { AcquisitionsIcon, GovernanceIcon } from "@/components/icons";
import { AsOf, Hash, HexText, StateLabel } from "@/components/ui";
import { FundTreasury } from "@/generated/contracts";
import { chooseOrder, type WallWork } from "@/lib/collectionWall";
import { formatDuration, formatTimestamp, proposalTitle } from "@/lib/format";
import { attribute } from "@/lib/metadata";
import { getSnapshot, ipfsGateway } from "@/lib/server/snapshot";
import type { ProposalState } from "@/lib/states";

// Anyone can propose, so the title is free text: shown whole (see HexText).
function ProposalHeadline({ title, state }: { title: string; state: ProposalState }) {
  return (
    <span className="door-proposal">
      <StateLabel state={state} />
      <span className="door-proposal-title">
        <HexText text={title} />
      </span>
    </span>
  );
}

export default async function Home() {
  const snapshot = await getSnapshot();
  const { proposals, galleries, tokens, capTable, contracts } = snapshot;
  const gateway = ipfsGateway();
  const held = tokens.filter((t) => isAddressEqual(t.owner, FundTreasury.address)).length;
  // Every work with an image, in the loop order that keeps the wall's height steadiest.
  const works: WallWork[] = tokens.flatMap((t) =>
    t.metadata.status === "ok" && t.metadata.artwork.imageCid && t.image
      ? [
          {
            id: t.id.toString(),
            name: t.metadata.artwork.name,
            by: [attribute(t.metadata.artwork, "Artist"), attribute(t.metadata.artwork, "Year")].filter(Boolean).join(", "),
            src: new URL(t.metadata.artwork.imageCid, gateway).href,
            ratio: t.image.ratio,
          },
        ]
      : [],
  );
  const order = chooseOrder(works);
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
        {order.length > 0 ? (
          <CollectionWall
            order={order}
            count={`${tokens.length} artworks · ${held === tokens.length ? "all" : held} held by the fund's treasury`}
          />
        ) : (
          <Link href="/collection" className="door door-collection">
            <span className="door-head">Collection</span>
            <span className="door-caption">No artworks with images yet.</span>
            <span className="door-go">View the collection →</span>
          </Link>
        )}

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
          {latestRoot && (
            <span className="small">
              Latest: {latestRoot.minted.length} {latestRoot.minted.length === 1 ? "work" : "works"} minted from{" "}
              <Hash>{latestRoot.root}</Hash>
            </span>
          )}
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
