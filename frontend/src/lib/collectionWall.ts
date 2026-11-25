// The home page's collection wall: a featured work as tall as two justified rows, moving as a loop.
// Pure functions, shared by the server (choosing the order) and the client component (layout, steps).

export type WallWork = {
  id: string; // token id
  name: string;
  by: string; // "Johannes Vermeer, c. 1665"
  src: string;
  ratio: number; // width / height
};

export const GAP = 8; // px between works

// Works per row by the door's content width: 4 halves the height swing, but rows get too small
// below ~650 px. Under 572 px (phones) the layout stacks: featured square + "Up next" strip. CSS makes
// that switch itself (container query in globals.css, same 572 px), so the first render is already right.
export const STACKED_BELOW = 572;
export const perRow = (inner: number) => (inner >= 651 ? 4 : 3);
export const stacked = (inner: number) => inner < STACKED_BELOW;

// Visible spots in loop order: featured, row 1 left→right, row 2 right→left. Each step every work
// moves to the previous spot, the featured one to the last (the start of row 2): a closed loop.
// When there are more works than spots, they are exchanged at the far-right corner: the work coming
// up from the end of row 2 leaves for the back of the waiting line and the first waiting work enters.
export type LoopState = { ring: WallWork[]; waiting: WallWork[] };

export function loopStart(order: WallWork[], visible: number): LoopState {
  return { ring: order.slice(0, visible), waiting: order.slice(visible) };
}

export function advance({ ring, waiting }: LoopState, n: number): LoopState {
  const next = ring.slice(1).concat(ring[0]);
  if (!waiting.length || next.length <= n) return { ring: next, waiting };
  const leaving = next[n];
  next[n] = waiting[0];
  return { ring: next, waiting: waiting.slice(1).concat(leaving) };
}

export function loopStates(order: WallWork[], visible: number, n: number, steps = order.length): LoopState[] {
  const out: LoopState[] = [];
  let s = loopStart(order, visible);
  for (let k = 0; k < steps; k++) {
    out.push(s);
    s = advance(s, n);
  }
  return out;
}

// Same markup in both layouts: the featured work and two rows (on phones the rows are the strip).
export const visibleFor = (inner: number, total: number) => Math.min(total, 1 + 2 * perRow(inner));

// Side by side: rows of ratio sums S1, S2 in a wall of width Ww are (Ww - g1)/S1 and (Ww - g2)/S2 tall;
// the featured work (ratio r) is exactly as tall as both when x / r = (Ww - g1)/S1 + (Ww - g2)/S2 + GAP,
// Ww = inner - x - GAP. Solved for its width x. Nothing is cropped.
export type WallLayout = { n: number; heroWidth: number; artHeight: number; rows: [WallWork[], WallWork[]] };

export function layout(ring: WallWork[], inner: number): WallLayout {
  const n = perRow(inner);
  const row1 = ring.slice(1, 1 + n);
  const row2 = ring.slice(1 + n, 1 + 2 * n).reverse(); // displayed left→right
  const S = [row1, row2].map((row) => row.reduce((t, w) => t + w.ratio, 0));
  const g = [row1, row2].map((row) => (row.length - 1) * GAP);
  const r = ring[0].ratio;
  if (!S[0] || !S[1]) return { n, heroWidth: inner, artHeight: inner / r, rows: [row1, row2] };
  const k = 1 / S[0] + 1 / S[1];
  const x = (r * ((inner - GAP) * k - g[0] / S[0] - g[1] / S[1] + GAP)) / (1 + r * k);
  return { n, heroWidth: x, artHeight: x / r, rows: [row1, row2] };
}

// The loop order: portrait and landscape works spread so every row mixes both, which keeps the
// block's height steadiest. A seeded search, so every build picks the same order.
export function chooseOrder(works: WallWork[], tries = 4000): WallWork[] {
  if (works.length < 4) return works;
  const widths = [1080, 900, 690]; // door content widths: wide, laptop, small tablet
  const swing = (order: WallWork[]) =>
    Math.max(
      ...widths.map((inner) => {
        const n = perRow(inner);
        const hs = loopStates(order, visibleFor(inner, order.length), n).map((s) => layout(s.ring, inner).artHeight);
        return Math.max(...hs) - Math.min(...hs);
      }),
    );
  let seed = 0x9e3779b9;
  const rand = () => ((seed = (seed * 1664525 + 1013904223) >>> 0) / 2 ** 32);
  let best = works, bestSwing = swing(works);
  for (let t = 0; t < tries; t++) {
    const o = works.slice(1);
    for (let i = o.length - 1; i > 0; i--) {
      const j = Math.floor(rand() * (i + 1));
      [o[i], o[j]] = [o[j], o[i]];
    }
    const candidate = [works[0], ...o]; // the first work stays first: it opens the loop
    const s = swing(candidate);
    if (s < bestSwing) [best, bestSwing] = [candidate, s];
  }
  return best;
}
