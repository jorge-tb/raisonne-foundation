import type { Metadata } from "next";
import Link from "next/link";
import { formatEther, isAddressEqual } from "viem";
import { GovernanceNav } from "@/components/GovernanceNav";
import { HolderChip } from "@/components/holders/HolderChip";
import { ProposalTimeline } from "@/components/ProposalTimeline";
import { ProposalVote, type VoteView } from "@/components/ProposalVote";
import { ActionCard, type ActionArtwork } from "@/components/ActionCard";
import { HoldersDonut } from "@/components/holders/HoldersDonut";
import { HoldersProvider } from "@/components/holders/HoldersProvider";
import { holdersData } from "@/components/holders/views";
import { AsOf, External, Hash, HexText, StateLabel } from "@/components/ui";
import { FundGovernor } from "@/generated/contracts";
import { etherscanAddress, formatTimestamp, proposalTitle } from "@/lib/format";
import { getSnapshot, ipfsGateway, type SnapshotProposal } from "@/lib/server/snapshot";
import { GovernanceCheck } from "./GovernanceCheck";

export const metadata: Metadata = { title: "Governance" };

export default async function GovernancePage() {
  const snapshot = await getSnapshot();
  const holders = holdersData(snapshot);
  const slots = (snapshot.capTable?.holders ?? []).map((h) => ({ address: h.address, slot: h.slot }));
  const gateway = ipfsGateway();
  // The artwork a sell action moves, for its thumbnail; an id with no token still renders.
  const artworkOf = (id: bigint): ActionArtwork => {
    const t = snapshot.tokens.find((x) => x.id === id);
    const art = t?.metadata.status === "ok" ? t.metadata.artwork : null;
    return {
      id,
      name: art?.name ?? null,
      src: art?.imageCid ? new URL(art.imageCid, gateway).href : null,
      ratio: t?.image?.ratio ?? null,
    };
  };
  const holderSlot = (address: `0x${string}`) =>
    slots.find((x) => isAddressEqual(x.address as `0x${string}`, address))?.slot ?? null;
  const treasury = { balance: snapshot.treasuryBalance, artworkOf, holderSlot };
  const body = (
    <>
      {holders && (
        <section className="holders-section">
          <h2>Who decides</h2>
          <p className="muted small">
            Shares vote once delegated. The ring shows each shareholder&apos;s votes as a share of all shares, and the
            quorum a proposal needs.
            {snapshot.capTable && (
              <>
                {" "}
                Shares are FundShare tokens (FS), one for each ETH subscribed: {formatEther(snapshot.capTable.supply)} FS
                in all, replayed from FundShare transfers and checked against <code>totalSupply()</code>.
              </>
            )}
          </p>
          <HoldersDonut />
        </section>
      )}
      {snapshot.proposals.length === 0 && <p>No proposals yet.</p>}
      {snapshot.proposals.map((p) => (
        <ProposalCard key={p.id.toString()} proposal={p} now={snapshot.blockTimestamp} slots={slots} treasury={treasury} />
      ))}
    </>
  );
  return (
    <>
      <h1>Governance</h1>
      <GovernanceNav current="decisions" />
      <p className="lede">
        How the fund decides: every proposal created on the Governor, including duplicates and defeated ones, with its
        live state, and who holds the shares that vote. Anyone can propose any calldata, so each action is decoded and
        checked here rather than trusted. What makes a passed proposal the only way the fund moves:{" "}
        <Link href="/contracts">the contracts</Link>.
      </p>
      <AsOf snapshot={snapshot} />
      <GovernanceCheck
        gateway={gateway}
        proposals={snapshot.proposals.map((p) => ({
          id: p.id.toString(),
          title: proposalTitle(p.description),
          targets: p.actions.map((a) => a.target),
          values: p.actions.map((a) => a.value.toString()),
          calldatas: p.actions.map((a) => a.calldata),
          description: p.description,
        }))}
      />
      {holders ? <HoldersProvider data={holders}>{body}</HoldersProvider> : body}
    </>
  );
}

// Only while it matters: before the vote opens, and while it is open (with how to vote). Afterwards the
// timeline carries the dates.
function VotingWindow({ proposal: p }: { proposal: SnapshotProposal }) {
  if (p.state === "Pending") return <p>Voting opens {formatTimestamp(p.voteStart)}.</p>;
  if (p.state === "Active")
    return (
      <p>
        {/* Tally link-out is DECIDED but whether Tally indexes this Governor on Sepolia is still OPEN. */}
        <strong>Voting is open</strong> until {formatTimestamp(p.voteEnd)}. Vote with your wallet through the
        Governor&apos;s <External href={`${etherscanAddress(FundGovernor.address)}#writeContract`}>castVote</External>.
      </p>
    );
  return null;
}

// The card's vote in plain numbers (ETH) for the client component, with each address's palette slot.
function voteView(p: SnapshotProposal, slots: { address: string; slot: number }[]): VoteView {
  const slotOf = (a: string) => slots.find((s) => isAddressEqual(s.address as `0x${string}`, a as `0x${string}`))?.slot ?? null;
  const n = (x: bigint) => Number(formatEther(x));
  const v = p.votes;
  return {
    state: p.state,
    supply: v.supply === null ? null : n(v.supply),
    quorum: v.quorum === null ? null : n(v.quorum),
    tally: { for: n(v.tally.for), against: n(v.tally.against), abstain: n(v.tally.abstain) },
    voters: v.voters.map((x) => ({ address: x.address, slot: slotOf(x.address), choice: x.choice, weight: n(x.weight) })),
    absent: v.absent.map((x) => ({ address: x.address, slot: slotOf(x.address), power: x.power === null ? null : n(x.power) })),
  };
}

function ProposalCard({
  proposal: p,
  now,
  slots,
  treasury,
}: {
  proposal: SnapshotProposal;
  now: bigint;
  slots: { address: string; slot: number }[];
  treasury: { balance: bigint; artworkOf: (id: bigint) => ActionArtwork; holderSlot: (address: `0x${string}`) => number | null };
}) {
  return (
    <article className="card" id={p.id.toString()}>
      {/* Title first, state on its right (as on the Acquisitions ledger); on phones the state goes under it. */}
      <header className="proposal-head">
        <h2>
          <HexText text={proposalTitle(p.description)} />
        </h2>
        <StateLabel state={p.state} />
      </header>
      <dl className="compact">
        <dt>Proposal id</dt>
        <dd>
          <Hash>{p.id.toString()}</Hash>
        </dd>
        <dt>Proposer</dt>
        <dd>
          <HolderChip address={p.proposer} />
        </dd>
      </dl>
      <ProposalVote vote={voteView(p, slots)} />
      <ProposalTimeline proposal={p} now={now} />
      <VotingWindow proposal={p} />

      <h3>{p.actions.length === 1 ? "Action" : `Actions · ${p.actions.length}`}</h3>
      {p.actions.length > 1 && (
        <p className="muted small">They run in this order, in one transaction: if one fails, none of them happen.</p>
      )}
      <ol className={`actions${p.actions.length === 1 ? " single" : ""}`}>
        {p.actions.map((a, i) => (
          <li key={i}>
            <ActionCard
              action={a}
              uid={`${p.id}-${i}`}
              ctx={{
                state: p.state,
                executedTx: p.executed?.transactionHash ?? null,
                treasuryBalance: treasury.balance,
                artworkOf: treasury.artworkOf,
                holderSlot: treasury.holderSlot,
              }}
            />
          </li>
        ))}
      </ol>

      <details>
        <summary>Full description</summary>
        <p className="description">{p.description}</p>
      </details>
    </article>
  );
}

