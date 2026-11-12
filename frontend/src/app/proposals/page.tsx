import type { Metadata } from "next";
import Link from "next/link";
import { formatEther } from "viem";
import { AddressLink, AsOf, External, Hash, StateLabel, VerdictLabel } from "@/components/ui";
import { FundGovernor } from "@/generated/contracts";
import { etherscanAddress, etherscanTx, formatTimestamp, proposalTitle } from "@/lib/format";
import { getSnapshot, ipfsGateway, type SnapshotProposal } from "@/lib/server/snapshot";
import { ProposalCheck } from "./ProposalCheck";

export const metadata: Metadata = { title: "Proposals" };

export default async function ProposalsPage() {
  const snapshot = await getSnapshot();
  return (
    <>
      <h1>Proposals</h1>
      <p className="lede">
        Every proposal created on the Governor, including duplicates and defeated ones, with its live state. Anyone can
        propose any calldata, so each action is decoded and checked here rather than trusted.
      </p>
      <p className="small">
        Each proposal is checked twice: by our server (verdicts under <em>Actions</em>) and again in your browser against
        the Governor, so you don&apos;t have to trust our server for what you see. One thing your browser can&apos;t
        check: this list comes from our server, which could leave a proposal out. It can&apos;t alter or invent one.
      </p>
      <AsOf snapshot={snapshot} />
      {snapshot.proposals.length === 0 && <p>No proposals yet.</p>}
      {snapshot.proposals.map((p) => (
        <ProposalCard key={p.id.toString()} proposal={p} now={snapshot.blockTimestamp} />
      ))}
    </>
  );
}

function VotingWindow({ proposal: p, now }: { proposal: SnapshotProposal; now: bigint }) {
  if (p.state === "Pending") return <p>Voting opens {formatTimestamp(p.voteStart)}.</p>;
  if (p.state === "Active")
    return (
      <p>
        {/* Tally link-out is DECIDED but whether Tally indexes this Governor on Sepolia is still OPEN. */}
        <strong>Voting is open</strong> until {formatTimestamp(p.voteEnd)}. Vote with your wallet through the
        Governor&apos;s <External href={`${etherscanAddress(FundGovernor.address)}#writeContract`}>castVote</External>.
      </p>
    );
  return (
    <p className="muted">
      Voting {BigInt(p.voteEnd) <= now ? "ran" : "runs"} {formatTimestamp(p.voteStart)} – {formatTimestamp(p.voteEnd)}.
    </p>
  );
}

function ProposalCard({ proposal: p, now }: { proposal: SnapshotProposal; now: bigint }) {
  return (
    <article className="card" id={p.id.toString()}>
      <header>
        <StateLabel state={p.state} />
        <h2>{proposalTitle(p.description)}</h2>
      </header>
      <dl className="compact">
        <dt>Proposal id</dt>
        <dd>
          <Hash>{p.id.toString()}</Hash>
        </dd>
        <dt>Proposer</dt>
        <dd>
          <AddressLink address={p.proposer} />
        </dd>
        <dt>Created</dt>
        <dd>
          block {p.blockNumber.toString()} · <External href={etherscanTx(p.transactionHash)}>transaction</External>
        </dd>
        {p.queued && (
          <>
            <dt>Queued</dt>
            <dd>
              block {p.queued.blockNumber.toString()} ·{" "}
              <External href={etherscanTx(p.queued.transactionHash)}>transaction</External>
            </dd>
          </>
        )}
        {p.executed && (
          <>
            <dt>Executed</dt>
            <dd>
              block {p.executed.blockNumber.toString()} ·{" "}
              <External href={etherscanTx(p.executed.transactionHash)}>transaction</External>
            </dd>
          </>
        )}
      </dl>
      <VotingWindow proposal={p} now={now} />

      <h3>Actions (checked by our server)</h3>
      <ol className="actions">
        {p.actions.map((a, i) => (
          <li key={i}>
            <VerdictLabel status={a.verification.status} />
            <ActionDetail action={a} />
          </li>
        ))}
      </ol>

      <ProposalCheck
        id={p.id.toString()}
        targets={p.actions.map((a) => a.target)}
        values={p.actions.map((a) => a.value.toString())}
        calldatas={p.actions.map((a) => a.calldata)}
        description={p.description}
        gateway={ipfsGateway()}
      />

      <details>
        <summary>Full description</summary>
        <p className="description">{p.description}</p>
      </details>
    </article>
  );
}

function ActionDetail({ action: a }: { action: SnapshotProposal["actions"][number] }) {
  const v = a.verification;
  return (
    <div className="action-detail">
      {(v.status === "match" || v.status === "mismatch") && (
        <>
          <p>
            <code>ArtRegistry.addGallery</code>: the tree published at <Hash>ipfs://{v.cid}</Hash>{" "}
            {v.status === "match" ? "rebuilds to the root in the calldata." : "does NOT rebuild to the root in the calldata."}
          </p>
          <dl className="compact">
            <dt>Root in calldata</dt>
            <dd>
              <Link href={`/galleries/${v.root}`}>
                <Hash>{v.root}</Hash>
              </Link>
            </dd>
            {v.status === "mismatch" && (
              <>
                <dt>Rebuilt root</dt>
                <dd>
                  <Hash>{v.computed}</Hash>
                </dd>
              </>
            )}
          </dl>
        </>
      )}
      {v.status === "unverifiable" && (
        <p>
          <code>ArtRegistry.addGallery</code> with root <Hash>{v.root}</Hash>, but the tree can&apos;t be checked: {v.reason}.
        </p>
      )}
      {v.status === "revokes-gallery" && (
        <p>
          <code>ArtRegistry.revokeGallery</code> disables gallery <Hash>{v.root}</Hash>. Minting from it stops.
          {a.revertWarning && <strong> Warning: that gallery is not enabled right now, so execution would revert.</strong>}
        </p>
      )}
      {v.status === "not-applicable" && (
        <p>
          Not a gallery action. Target <AddressLink address={a.target} />, selector <Hash>{a.calldata.slice(0, 10)}</Hash>
          {a.value > 0n && <>, sends {formatEther(a.value)} ETH</>}. Review the calldata before voting.
        </p>
      )}
      {v.status === "malformed" && (
        <p>
          Calls ArtRegistry with arguments that don&apos;t decode ({v.error}). Execution would most likely revert.
        </p>
      )}
    </div>
  );
}
