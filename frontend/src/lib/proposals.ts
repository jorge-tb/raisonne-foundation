import type { PublicClient } from "viem";
import { FundGovernor } from "@/generated/contracts";
import { classifyAction } from "./actions";
import { eventsOf, type ScanResult } from "./chain";

// IGovernor.ProposalState order. Expired is unreachable with GovernorTimelockControl but kept for the mapping.
export const PROPOSAL_STATES = ["Pending", "Active", "Canceled", "Defeated", "Succeeded", "Queued", "Expired", "Executed"] as const;
export type ProposalState = (typeof PROPOSAL_STATES)[number];

// Every ProposalCreated in the scan, in chain order, with live state() and per-action classification.
export async function getProposals(client: PublicClient, scan: ScanResult) {
  const created = eventsOf(scan, FundGovernor, "ProposalCreated");
  return Promise.all(
    created.map(async (log) => {
      const { proposalId, proposer, targets, values, calldatas, description, voteStart, voteEnd } = log.args;
      const state = await client.readContract({ ...FundGovernor, functionName: "state", args: [proposalId], blockNumber: scan.toBlock });
      return {
        id: proposalId,
        proposer,
        blockNumber: log.blockNumber,
        transactionHash: log.transactionHash,
        description,
        voteStart,
        voteEnd,
        state: PROPOSAL_STATES[state],
        actions: targets.map((target, i) => ({ target, value: values[i], calldata: calldatas[i], kind: classifyAction(target, calldatas[i]) })),
      };
    }),
  );
}

export type Proposal = Awaited<ReturnType<typeof getProposals>>[number];
