import { zeroAddress, type Address, type PublicClient } from "viem";
import { FundGovernor, FundShare } from "@/generated/contracts";
import { eventsOf, type ScanResult } from "./chain";

export type CapTable = {
  supply: bigint;
  // slot: order of first subscription, which fixes each holder's colour (lib/holders.ts); never reshuffled.
  // votes and delegate are read at the snapshot block: shares only vote once delegated.
  holders: { address: Address; balance: bigint; bps: bigint; slot: number; votes: bigint; delegate: Address }[];
  // 10000 minus the sum of floored bps: the rounding remainder, shown explicitly.
  remainderBps: bigint;
  // Quorum as a fraction of total supply (GovernorVotesQuorumFraction), e.g. 40/100.
  quorum: { numerator: bigint; denominator: bigint };
};

// Current cap table, replayed from FundShare Transfer logs (A3: Transfer = current, Subscribed = original).
// Cross-checked against totalSupply() at the scan's head block.
export async function getCapTable(client: PublicClient, scan: ScanResult): Promise<CapTable | null> {
  const balances = new Map<Address, bigint>();
  const firstSeen = new Map<Address, number>();
  for (const { args } of eventsOf(scan, FundShare, "Transfer")) {
    if (args.from !== zeroAddress) balances.set(args.from, (balances.get(args.from) ?? 0n) - args.value);
    if (args.to !== zeroAddress) {
      balances.set(args.to, (balances.get(args.to) ?? 0n) + args.value);
      if (!firstSeen.has(args.to)) firstSeen.set(args.to, firstSeen.size);
    }
  }

  const at = { blockNumber: scan.toBlock };
  const [supply, numerator, denominator] = await Promise.all([
    client.readContract({ ...FundShare, functionName: "totalSupply", ...at }),
    client.readContract({ ...FundGovernor, functionName: "quorumNumerator", ...at }),
    client.readContract({ ...FundGovernor, functionName: "quorumDenominator", ...at }),
  ]);
  const replayed = [...balances.values()].reduce((a, b) => a + b, 0n);
  if (replayed !== supply) throw new Error(`Transfer replay gives supply ${replayed}, totalSupply() is ${supply}: the scan missed logs`);
  if (supply === 0n) return null; // "No shares issued"

  const holders = await Promise.all(
    [...balances]
      .filter(([, balance]) => balance > 0n)
      .map(async ([address, balance]) => {
        const [votes, delegate] = await Promise.all([
          client.readContract({ ...FundShare, functionName: "getVotes", args: [address], ...at }),
          client.readContract({ ...FundShare, functionName: "delegates", args: [address], ...at }),
        ]);
        return { address, balance, bps: (balance * 10000n) / supply, slot: firstSeen.get(address)!, votes, delegate };
      }),
  );
  holders.sort((a, b) => (b.balance > a.balance ? 1 : b.balance < a.balance ? -1 : 0));
  const remainderBps = 10000n - holders.reduce((sum, h) => sum + h.bps, 0n);
  return { supply, holders, remainderBps, quorum: { numerator, denominator } };
}
