import { formatEther, isAddressEqual } from "viem";
import { formatBps } from "@/lib/format";
import type { HolderView } from "@/lib/holders";
import type { Snapshot } from "@/lib/server/snapshot";

// voting: share of supply that can vote, from the exact sum (per-holder fractions are floored).
export type HoldersData = { holders: HolderView[]; quorum: number; voting: number };

// The cap table in the shape the holder components take: in slot order, the order the ring's colours
// were validated in.
export function holdersData(snapshot: Snapshot): HoldersData | null {
  const { capTable, proposals } = snapshot;
  if (!capTable) return null;
  const holders = capTable.holders
    .toSorted((a, b) => a.slot - b.slot)
    .map((h) => ({
      address: h.address,
      slot: h.slot,
      shares: formatEther(h.balance),
      sharePct: formatBps(h.bps),
      votes: formatEther(h.votes),
      votesFraction: Number((h.votes * 1_000_000n) / capTable.supply) / 1_000_000,
      delegate: h.delegate,
      proposals: proposals.filter((p) => isAddressEqual(p.proposer, h.address)).length,
    }));
  const votes = capTable.holders.reduce((s, h) => s + h.votes, 0n);
  const voting = Number((votes * 1_000_000n) / capTable.supply) / 1_000_000;
  return { holders, quorum: Number(capTable.quorum.numerator) / Number(capTable.quorum.denominator), voting };
}
