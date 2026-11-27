export const ETHERSCAN = "https://sepolia.etherscan.io";
export const etherscanAddress = (address: string) => `${ETHERSCAN}/address/${address}`;
// The Contract tab: the verified source (every project contract is verified on Etherscan).
export const etherscanCode = (address: string) => `${etherscanAddress(address)}#code`;
export const etherscanTx = (hash: string) => `${ETHERSCAN}/tx/${hash}`;
// The transaction's Logs tab: the decoded events, e.g. GalleryAdded with its root.
export const etherscanTxLogs = (hash: string) => `${etherscanTx(hash)}#eventlog`;
export const etherscanBlock = (block: bigint) => `${ETHERSCAN}/block/${block}`;

// Governor uses the ERC-6372 timestamp clock: voteStart / voteEnd are unix seconds, not blocks.
// Rendered on the server in UTC so the output doesn't depend on the viewer's clock.
const dateFormat = new Intl.DateTimeFormat("en-GB", { dateStyle: "medium", timeStyle: "short", timeZone: "UTC" });
export const formatTimestamp = (seconds: number | bigint) => `${dateFormat.format(new Date(Number(seconds) * 1000))} UTC`;
// The time of day alone, for steps that follow a dated one: "10:43".
const timeFormat = new Intl.DateTimeFormat("en-GB", { timeStyle: "short", timeZone: "UTC" });
export const formatTime = (seconds: number | bigint) => timeFormat.format(new Date(Number(seconds) * 1000));

// bps < 10000, so Number() is exact here.
// A contract duration in seconds, in the largest whole unit: "5 min", "1 h", "2 days".
export function formatDuration(seconds: bigint): string {
  const s = Number(seconds);
  if (s > 0 && s % 86_400 === 0) return `${s / 86_400} day${s === 86_400 ? "" : "s"}`;
  if (s > 0 && s % 3600 === 0) return `${s / 3600} h`;
  if (s > 0 && s % 60 === 0) return `${s / 60} min`;
  return `${s} s`;
}

export const formatBps = (bps: bigint) => `${(Number(bps) / 100).toFixed(2)}%`;

// First clause of a free-text description, used as a title. A period ends the clause only when
// followed by whitespace or the end, so amounts like "0.0045 ETH" stay whole.
export const proposalTitle = (description: string) => description.split(/[;\n]|\.(?=\s|$)/)[0].trim();
