import Image from "next/image";
import Link from "next/link";
import { isAddressEqual } from "viem";
import { AcquisitionsIcon, CollectionIcon, GovernanceIcon } from "@/components/icons";
import { AddressLink, AsOf, External, Hash, StateLabel } from "@/components/ui";
import { ArtRegistry, FundGovernor, FundShare, FundTreasury, TimelockController } from "@/generated/contracts";
import { etherscanCode, formatTimestamp, proposalTitle } from "@/lib/format";
import { getSnapshot, ipfsGateway } from "@/lib/server/snapshot";

const CONTRACTS = [
  ["FundShare", FundShare.address, "ERC-20 votes token: one share per wei subscribed"],
  ["FundGovernor", FundGovernor.address, "Proposals and voting"],
  ["TimelockController", TimelockController.address, "Executes passed proposals after a delay"],
  ["ArtRegistry", ArtRegistry.address, "Acquisition roots (galleries) and minted artworks"],
  ["FundTreasury", FundTreasury.address, "Treasury (UUPS proxy)"],
] as const;

// Height of the paintings in the collection door (desktop); widths follow each image's proportions.
const STRIP_PX = 180;

export default async function Home() {
  const snapshot = await getSnapshot();
  const { proposals, galleries, tokens } = snapshot;
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

  return (
    <>
      <h1>Raisonné Foundation</h1>
      <p className="lede">
        A closed-end art fund on Sepolia. Shareholders vote on acquisitions; each acquisition commits a Merkle root of
        its artworks on chain, and the tree is published on IPFS so anyone can rebuild the root and check it.
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

        <Link href="/governance" className="door">
          <span className="door-head">
            <GovernanceIcon />
            Governance
          </span>
          {latest ? (
            <>
              <span>
                {/* "Acquisition 002 - corrects tokens …": the name before the dash is enough here. */}
                <StateLabel state={latest.state} /> {proposalTitle(latest.description).split(/\s[-–—]\s/)[0]}
              </span>
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

      <section>
        <h2>Contracts</h2>
        <dl>
          {CONTRACTS.map(([name, address, role]) => (
            <div key={name}>
              <dt>
                {name} <span className="muted">· {role}</span>
              </dt>
              <dd>
                <AddressLink address={address} /> · <External href={etherscanCode(address)}>verified source</External>
              </dd>
            </div>
          ))}
        </dl>
      </section>
    </>
  );
}
