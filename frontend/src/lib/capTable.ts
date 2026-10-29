import { zeroAddress, type Address, type PublicClient } from "viem";
import { FundShare } from "@/generated/contracts";
import { eventsOf, type ScanResult } from "./chain";

export type CapTable = {
  supply: bigint;
  holders: { address: Address; balance: bigint; bps: bigint }[];
  // 10000 minus the sum of floored bps: the rounding remainder, shown explicitly.
  remainderBps: bigint;
};

// Current cap table, replayed from FundShare Transfer logs (A3: Transfer = current, Subscribed = original).
// Cross-checked against totalSupply() at the scan's head block.
export async function getCapTable(client: PublicClient, scan: ScanResult): Promise<CapTable | null> {
  const balances = new Map<Address, bigint>();
  for (const { args } of eventsOf(scan, FundShare, "Transfer")) {
    if (args.from !== zeroAddress) balances.set(args.from, (balances.get(args.from) ?? 0n) - args.value);
    if (args.to !== zeroAddress) balances.set(args.to, (balances.get(args.to) ?? 0n) + args.value);
  }

  const supply = await client.readContract({ ...FundShare, functionName: "totalSupply", blockNumber: scan.toBlock });
  const replayed = [...balances.values()].reduce((a, b) => a + b, 0n);
  if (replayed !== supply) throw new Error(`Transfer replay gives supply ${replayed}, totalSupply() is ${supply}: the scan missed logs`);
  if (supply === 0n) return null; // "No shares issued"

  const holders = [...balances]
    .filter(([, balance]) => balance > 0n)
    .map(([address, balance]) => ({ address, balance, bps: (balance * 10000n) / supply }))
    .sort((a, b) => (b.balance > a.balance ? 1 : b.balance < a.balance ? -1 : 0));
  const remainderBps = 10000n - holders.reduce((sum, h) => sum + h.bps, 0n);
  return { supply, holders, remainderBps };
}
