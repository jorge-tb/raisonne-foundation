// IGovernor.ProposalState order. Expired is unreachable with GovernorTimelockControl but kept for the mapping.
export const PROPOSAL_STATES = ["Pending", "Active", "Canceled", "Defeated", "Succeeded", "Queued", "Expired", "Executed"] as const;
export type ProposalState = (typeof PROPOSAL_STATES)[number];
