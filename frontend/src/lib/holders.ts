// Shareholder identity: a pigment per holder and an avatar drawn from their address.
//
// Pigments are assigned by slot (order of first subscription, see capTable.ts) and never reshuffled.
// The four were found by searching hue and lightness together, then validated with the dataviz
// validator with every pair compared (holders meet outside the ring too), in both themes: worst pair
// ΔE 22.7 for normal vision, 12.3 under colour blindness. Hues near the brand's lapis and lead-tin
// yellow are excluded, and each pigment stays ≥ 15 ΔE from both. Every mark still carries an avatar
// and a label. Colours live in globals.css as --holder-1 … --holder-4.
export const PIGMENTS = ["rose", "umber", "cerulean", "purple"] as const;

// A fifth holder has no validated pigment: it shows in the neutral ink until the ring is re-validated.
export const holderColor = (slot: number) => (slot < PIGMENTS.length ? `var(--holder-${slot + 1})` : "var(--muted)");

// Blockies: the 8x8 mirrored pattern wallets and Etherscan draw from an address (ethereum-blockies),
// keeping its cells (0 background, 1 colour, 2 spot) but not its random colours: those come from the slot.
export function blockieCells(address: string): number[][] {
  const seed = address.toLowerCase();
  const rs = [0, 0, 0, 0];
  // Not wrapped to 32 bits here: the original isn't, and the next shift coerces anyway.
  for (let i = 0; i < seed.length; i++) rs[i % 4] = (rs[i % 4] << 5) - rs[i % 4] + seed.charCodeAt(i);
  const rand = () => {
    const t = rs[0] ^ (rs[0] << 11);
    rs[0] = rs[1];
    rs[1] = rs[2];
    rs[2] = rs[3];
    rs[3] = rs[3] ^ (rs[3] >> 19) ^ t ^ (t >> 8);
    return (rs[3] >>> 0) / ((1 << 31) >>> 0);
  };
  // The original draws three colours first (hue, saturation and four for lightness: 6 each), so the
  // cells start at the 19th random number.
  for (let i = 0; i < 18; i++) rand();
  const cells: number[][] = [];
  for (let y = 0; y < 8; y++) {
    const half = Array.from({ length: 4 }, () => Math.floor(rand() * 2.3));
    cells.push([...half, ...[...half].reverse()]);
  }
  return cells;
}

// What the client components need about a holder; plain values so it crosses the server/client boundary.
export type HolderView = {
  address: string;
  slot: number;
  shares: string; // ETH
  sharePct: string; // of supply, floored to basis points like the cap table
  votes: string; // ETH
  votesFraction: number; // of supply, for the ring
  delegate: string;
  proposals: number; // created on the Governor
};
