import type { ProposalState } from "./states";

export const ETHERSCAN = "https://sepolia.etherscan.io";
export const etherscanAddress = (address: string) => `${ETHERSCAN}/address/${address}`;
export const etherscanTx = (hash: string) => `${ETHERSCAN}/tx/${hash}`;
export const etherscanBlock = (block: bigint) => `${ETHERSCAN}/block/${block}`;

// Monochrome: state is carried by the word and a glyph, never by colour alone.
export const STATE_GLYPH: Record<ProposalState, string> = {
  Pending: "○",
  Active: "●",
  Canceled: "⊘",
  Defeated: "✕",
  Succeeded: "✓",
  Queued: "◷",
  Expired: "–",
  Executed: "■",
};

// Governor uses the ERC-6372 timestamp clock: voteStart / voteEnd are unix seconds, not blocks.
// Rendered on the server in UTC so the output doesn't depend on the viewer's clock.
const dateFormat = new Intl.DateTimeFormat("en-GB", { dateStyle: "medium", timeStyle: "short", timeZone: "UTC" });
export const formatTimestamp = (seconds: number | bigint) => `${dateFormat.format(new Date(Number(seconds) * 1000))} UTC`;

// bps < 10000, so Number() is exact here.
export const formatBps = (bps: bigint) => `${(Number(bps) / 100).toFixed(2)}%`;

// First clause of a free-text description, used as a title.
export const proposalTitle = (description: string) => description.split(/[.;\n]/)[0].trim();
