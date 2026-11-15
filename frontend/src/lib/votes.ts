import { isAddressEqual, type Address, type Hex, type PublicClient } from "viem";
import { FundGovernor, FundShare } from "@/generated/contracts";
import { eventsOf, type ScanResult } from "./chain";
import type { Proposal } from "./proposals";

export type Choice = "for" | "against" | "abstain";
// GovernorCountingSimple's support values.
const SUPPORT: Record<number, Choice> = { 0: "against", 1: "for", 2: "abstain" };

export type ProposalVotes = {
  // Shares that could vote (total supply at the snapshot) and the quorum, both null until the snapshot
  // is in the past: the Governor can't answer for a future timepoint.
  supply: bigint | null;
  quorum: bigint | null;
  tally: Record<Choice, bigint>;
  eta: bigint; // 0 unless queued
  voters: { address: Address; choice: Choice; weight: bigint; transactionHash: Hex }[];
  // Current holders who didn't vote, with their voting power at the snapshot (null if not yet known).
  absent: { address: Address; power: bigint | null }[];
  // Block times of the lifecycle transactions.
  times: { created: bigint; queued: bigint | null; executed: bigint | null };
};

// How each proposal was voted, read at the snapshot block: tally, quorum and supply at its snapshot,
// ETA, every VoteCast in the scan, and which current holders stayed away.
export async function getVotes(
  client: PublicClient,
  scan: ScanResult,
  proposals: Proposal[],
  holders: Address[],
): Promise<Map<bigint, ProposalVotes>> {
  const at = { blockNumber: scan.toBlock };
  const cast = eventsOf(scan, FundGovernor, "VoteCast");
  const blockTimes = new Map<bigint, Promise<bigint>>();
  const timeOf = (blockNumber: bigint) => {
    if (!blockTimes.has(blockNumber)) blockTimes.set(blockNumber, client.getBlock({ blockNumber }).then((b) => b.timestamp));
    return blockTimes.get(blockNumber)!;
  };

  const entries = await Promise.all(
    proposals.map(async (p) => {
      const [[against, forVotes, abstain], snapshot, eta, clock] = await Promise.all([
        client.readContract({ ...FundGovernor, functionName: "proposalVotes", args: [p.id], ...at }),
        client.readContract({ ...FundGovernor, functionName: "proposalSnapshot", args: [p.id], ...at }),
        client.readContract({ ...FundGovernor, functionName: "proposalEta", args: [p.id], ...at }),
        client.readContract({ ...FundGovernor, functionName: "clock", ...at }),
      ]);
      const past = snapshot < BigInt(clock);
      const voters = cast
        .filter((l) => l.args.proposalId === p.id)
        .map((l) => ({ address: l.args.voter, choice: SUPPORT[l.args.support], weight: l.args.weight, transactionHash: l.transactionHash }));
      const absentHolders = holders.filter((h) => !voters.some((v) => isAddressEqual(v.address, h)));
      const [supply, quorum, powers, created, queued, executed] = await Promise.all([
        past ? client.readContract({ ...FundShare, functionName: "getPastTotalSupply", args: [snapshot], ...at }) : null,
        past ? client.readContract({ ...FundGovernor, functionName: "quorum", args: [snapshot], ...at }) : null,
        Promise.all(
          absentHolders.map((h) => (past ? client.readContract({ ...FundShare, functionName: "getPastVotes", args: [h, snapshot], ...at }) : null)),
        ),
        timeOf(p.blockNumber),
        p.queued ? timeOf(p.queued.blockNumber) : null,
        p.executed ? timeOf(p.executed.blockNumber) : null,
      ]);
      const votes: ProposalVotes = {
        supply,
        quorum,
        tally: { for: forVotes, against, abstain },
        eta,
        voters,
        absent: absentHolders.map((address, i) => ({ address, power: powers[i] })),
        times: { created, queued, executed },
      };
      return [p.id, votes] as const;
    }),
  );
  return new Map(entries);
}
