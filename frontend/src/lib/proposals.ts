import type { PublicClient } from "viem";
import { FundGovernor } from "@/generated/contracts";
import { classifyAction } from "./actions";
import { eventsOf, type ScanResult } from "./chain";
import { PROPOSAL_STATES } from "./states";

export { PROPOSAL_STATES, type ProposalState } from "./states";

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
