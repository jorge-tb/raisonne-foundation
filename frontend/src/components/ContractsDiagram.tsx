"use client";

import { useCallback, useEffect, useId, useLayoutEffect, useRef, useState, type PointerEvent, type ReactNode } from "react";
import { etherscanCode } from "@/lib/format";
import { ContractGlyph, type ContractKind } from "./ContractGlyph";
import { Blockie } from "./holders/Blockie";

export type DiagramContract = { kind: ContractKind; address: string; role: string; can: string };
type NodeId = ContractKind | "holders";

// The order a decision travels, shown on each box.
const STEP: Record<NodeId, string> = { holders: "01", FundShare: "02", FundGovernor: "03", TimelockController: "04", FundTreasury: "05", ArtRegistry: "05" };

// Who can do what to whom. Links in ink are control (ownership, roles); light ones are flows.
const LINKS: { from: NodeId; to: NodeId; label: string; control?: boolean }[] = [
  { from: "holders", to: "FundShare", label: "hold" },
  { from: "FundShare", to: "FundGovernor", label: "votes" },
  { from: "FundGovernor", to: "TimelockController", label: "queues", control: true },
  { from: "TimelockController", to: "FundTreasury", label: "owns", control: true },
  { from: "TimelockController", to: "ArtRegistry", label: "owns", control: true },
  { from: "ArtRegistry", to: "FundTreasury", label: "mints into" },
];

type Box = { l: number; t: number; r: number; b: number; cx: number; cy: number };
type Point = [number, number];
type Rect = [number, number, number, number]; // left, top, right, bottom
type Wire = { d: string; label: { x: number; y: number; anchor: "start" | "middle"; rotate: boolean; lines: string[] }; control?: boolean; key: string };
// One stretch of the trace: through a box, along a link, or (rest) the light standing still while it
// fades. `el` is the box or link it belongs to; `branch` 0 is the shared path, 1 the timelock's branch
// to the treasury, 2 the branch through the registry. `raw` is the shape its direction asks for;
// `size` the shape it has, after inertia.
type Leg = { el: string; branch: 0 | 1 | 2; t0: number; t1: number; at: (u: number) => Point; raw: (u: number) => Point; size: (u: number) => Point; rest?: boolean };
type Line = { total: number; at: (s: number) => { p: Point; d: Point } };
type Spot = { x: number; y: number; rx: number; ry: number; opacity: number; t0: number };

const CORNER = 10; // rounding of the connectors' corners and of the boxes' outline
const SPEED = 0.18; // px per ms: calm enough to follow
// The wake: where the light was, every SPACING px back over TAIL px, each copy smaller and dimmer.
const TAIL = 150;
const SPACING = 12;
// The ending: the light slows into the treasury's centre, then spreads and fades there for REST ms.
const REST = 900;
// Across its direction of travel the light reaches both edges of the box it is in: the edges sit at
// this fraction of its radius, where the soft spot is still at about half strength.
const EDGE = 0.65;
// The light takes a link's corners on a wider curve than the drawn line.
const LINK_CURVE = 24;
// The light's shape eases toward the one its direction asks for with this time constant (ms), so a
// turn reshapes it gradually; worked out ahead every STEP_MS ms.
const TAU = 200;
const STEP_MS = 4;
// The glow drawn where the light is: a soft haze and a fine bright line on each outline and link, and a
// coloured bloom behind each box. Room around each element for the blur, and around the diagram for
// the rail and the bloom.
const HAZE_BLUR = 2.5;
const BLOOM_BLUR = 14;
const BOX_ROOM = 3 * BLOOM_BLUR;
const LINK_ROOM = 8;
const PAD = 60;

// A right-angle path through the points, with rounded corners.
function route(pts: Point[]): string {
  let d = `M${pts[0]}`;
  for (let i = 1; i < pts.length - 1; i++) {
    const [p, q, n] = [pts[i - 1], pts[i], pts[i + 1]];
    const d1 = Math.hypot(q[0] - p[0], q[1] - p[1]), d2 = Math.hypot(n[0] - q[0], n[1] - q[1]), r = Math.min(CORNER, d1 / 2, d2 / 2);
    const a: Point = [q[0] - ((q[0] - p[0]) / d1) * r, q[1] - ((q[1] - p[1]) / d1) * r];
    const b: Point = [q[0] + ((n[0] - q[0]) / d2) * r, q[1] + ((n[1] - q[1]) / d2) * r];
    d += ` L${a} Q${q} ${b}`;
  }
  return `${d} L${pts.at(-1)}`;
}

// A path the light can follow: the corners of P rounded (radius up to R; a corner may use all of an end
// segment, half of a shared one), sampled every 2 px, walked at constant speed.
function smooth(P: Point[], R: number): Line {
  const out: Point[] = [P[0]];
  const line = (a: Point, b: Point) => {
    const n = Math.max(1, Math.ceil(Math.hypot(b[0] - a[0], b[1] - a[1]) / 2));
    for (let k = 1; k <= n; k++) out.push([a[0] + ((b[0] - a[0]) * k) / n, a[1] + ((b[1] - a[1]) * k) / n]);
  };
  const quad = (a: Point, q: Point, b: Point) => {
    const n = Math.max(2, Math.ceil((Math.hypot(q[0] - a[0], q[1] - a[1]) + Math.hypot(b[0] - q[0], b[1] - q[1])) / 2));
    for (let k = 1; k <= n; k++) {
      const t = k / n, m = 1 - t;
      out.push([m * m * a[0] + 2 * m * t * q[0] + t * t * b[0], m * m * a[1] + 2 * m * t * q[1] + t * t * b[1]]);
    }
  };
  let cur = P[0];
  for (let i = 1; i < P.length - 1; i++) {
    const [p, q, n] = [P[i - 1], P[i], P[i + 1]];
    const d1 = Math.hypot(q[0] - p[0], q[1] - p[1]), d2 = Math.hypot(n[0] - q[0], n[1] - q[1]);
    if (d1 < 0.5 || d2 < 0.5) continue;
    const r = Math.min(R, i === 1 ? d1 : d1 / 2, i === P.length - 2 ? d2 : d2 / 2);
    const a: Point = [q[0] - ((q[0] - p[0]) / d1) * r, q[1] - ((q[1] - p[1]) / d1) * r];
    const b: Point = [q[0] + ((n[0] - q[0]) / d2) * r, q[1] + ((n[1] - q[1]) / d2) * r];
    line(cur, a);
    quad(a, q, b);
    cur = b;
  }
  line(cur, P.at(-1)!);
  const acc = [0];
  for (let i = 1; i < out.length; i++) acc.push(acc[i - 1] + Math.hypot(out[i][0] - out[i - 1][0], out[i][1] - out[i - 1][1]));
  const total = acc.at(-1)!;
  return {
    total,
    at: (s) => {
      s = Math.max(0, Math.min(total, s));
      let lo = 1, hi = out.length - 1;
      while (lo < hi) {
        const mid = (lo + hi) >> 1;
        if (acc[mid] < s) lo = mid + 1;
        else hi = mid;
      }
      const a = out[lo - 1], b = out[lo], len = acc[lo] - acc[lo - 1], u = len ? (s - acc[lo - 1]) / len : 0;
      return { p: [a[0] + (b[0] - a[0]) * u, a[1] + (b[1] - a[1]) * u], d: [b[0] - a[0], b[1] - a[1]] };
    },
  };
}

// An address in two even halves: one line on wide screens, two balanced lines on phones.
function Address({ address }: { address: string }) {
  const half = Math.ceil(address.length / 2);
  return (
    <code className="hash chain-address">
      <span>{address.slice(0, half)}</span>
      <span>{address.slice(half)}</span>
    </code>
  );
}

// The fund's contracts as a chain of command, in the order a decision travels (numbered). Wide: one
// row, with the registry under the treasury. Phones: a two-column snake (holders → FundShare along
// the top, down to the governor, back left to the timelock, which forks down to the registry and
// across to the treasury). When the diagram comes into view a soft light carries that order through
// the boxes, lighting each outline and link it reaches, with a coloured bloom behind each box. It
// only moves forward: a box or link it has left can't be lit again by a later step passing nearby. It
// ends in the treasury, settling into the box and dissolving there. Its colour warms from the accent
// blue to yellow along the order. Hover (mouse) previews a box's own links; a click or tap selects it
// and keeps it selected.
export function ContractsDiagram({ contracts, holders }: { contracts: DiagramContract[]; holders: { address: string; slot: number }[] }) {
  const ref = useRef<HTMLDivElement>(null);
  const backRef = useRef<HTMLCanvasElement>(null);
  const frontRef = useRef<HTMLCanvasElement>(null);
  const detailRef = useRef<HTMLDivElement>(null);
  const frame = useRef(0);
  const run = useRef(0);
  const [selected, setSelected] = useState<NodeId | null>(null);
  const [preview, setPreview] = useState<NodeId | null>(null);
  const [wires, setWires] = useState<Wire[]>([]);
  const focus = preview ?? selected;
  // Ids for the sprites' own gradient and filters; useId's characters are not safe inside url(#…).
  const uid = `chain${useId().replace(/[^\w-]/g, "")}`;
  const ids = useCallback(() => ["holders", ...contracts.map((c) => c.kind)] as NodeId[], [contracts]);

  const box = useCallback((id: NodeId): Box => {
    const root = ref.current!, o = root.getBoundingClientRect();
    const r = root.querySelector(`.chain-node[data-node="${id}"]`)!.getBoundingClientRect();
    return { l: r.left - o.left, t: r.top - o.top, r: r.right - o.left, b: r.bottom - o.top, cx: (r.left + r.right) / 2 - o.left, cy: (r.top + r.bottom) / 2 - o.top };
  }, []);
  // Phones lay the boxes out in two columns (the snake); wide screens in five.
  const snake = useCallback(() => !!ref.current && getComputedStyle(ref.current).gridTemplateColumns.split(" ").length === 2, []);

  // Where each link runs. Wide: boxes are entered on the left and left on the right; the timelock's two
  // links fork at a junction in the gap; registry → treasury runs up a rail on the right. Snake: across
  // the top, down, back left, down to the registry, and from the timelock under the governor into the
  // top of the treasury.
  const points = useCallback(
    (from: NodeId, to: NodeId): Point[] => {
      const a = box(from), b = box(to);
      if (snake()) {
        if (from === "holders" || from === "ArtRegistry") return [[a.r, a.cy], [b.l, b.cy]];
        if (from === "FundGovernor") return [[a.l, a.cy], [b.r, b.cy]];
        if (from === "TimelockController" && to === "ArtRegistry") {
          const x = a.l + 0.3 * (a.r - a.l);
          return [[x, a.b], [x, b.t]];
        }
        if (from === "TimelockController") {
          const x = a.l + 0.74 * (a.r - a.l), y = (a.b + box("ArtRegistry").t) / 2;
          return [[x, a.b], [x, y], [b.cx, y], [b.cx, b.t]];
        }
        return [[a.cx, a.b], [b.cx, b.t]];
      }
      if (from === "TimelockController" && to === "ArtRegistry") {
        const x = (a.r + box("FundTreasury").l) / 2;
        return [[a.r, a.cy], [x, a.cy], [x, b.cy], [b.l, b.cy]];
      }
      if (from === "ArtRegistry") {
        const x = Math.max(a.r, b.r) + 16;
        return [[a.r, a.cy], [x, a.cy], [x, b.cy], [b.r, b.cy]];
      }
      return [[a.r, a.cy], [b.l, b.cy]];
    },
    [box, snake],
  );

  const draw = useCallback(() => {
    if (!ref.current) return;
    const rightmost = Math.max(...ids().map((id) => box(id).r));
    setWires(
      LINKS.map((l) => {
        const pts = points(l.from, l.to);
        // The label sits on the link's longest run: above it if horizontal (its words stacked when the
        // gap is narrower than the label), beside it if vertical, and along it on a side rail.
        let best: [Point, Point] = [pts[0], pts[1]], longest = -1;
        for (let i = 1; i < pts.length; i++) {
          const len = Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]);
          if (len > longest) [longest, best] = [len, [pts[i - 1], pts[i]]];
        }
        const [p, q] = best, x = (p[0] + q[0]) / 2, y = (p[1] + q[1]) / 2, horizontal = Math.abs(q[0] - p[0]) >= Math.abs(q[1] - p[1]);
        const label = horizontal
          ? { x, y: y - 8, anchor: "middle" as const, rotate: false, lines: l.label.length * 6.4 > longest - 6 ? l.label.split(" ") : [l.label] }
          : x > rightmost
            ? { x, y, anchor: "middle" as const, rotate: true, lines: [l.label] }
            : { x: x + 8, y: y + 4, anchor: "start" as const, rotate: false, lines: [l.label] };
        return { key: `${l.from}-${l.to}`, d: route(pts), label, control: l.control };
      }),
    );
  }, [box, ids, points]);

  useLayoutEffect(() => {
    draw();
    const ro = new ResizeObserver(draw);
    if (ref.current) ro.observe(ref.current);
    document.fonts?.ready.then(draw);
    return () => ro.disconnect();
  }, [draw]);

  // The trace. Imperative on purpose: a frame loop that must not re-render the page. It draws on two
  // canvases (the bloom behind the boxes, the lit outlines and links in front), so a frame changes no
  // SVG and no styles: each element's glow is prepared once as a picture, and every frame stamps the
  // lit part of it through that element's own light.
  const trace = useCallback(() => {
    const root = ref.current, back = backRef.current, front = frontRef.current;
    if (!root || !back || !front || matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    cancelAnimationFrame(frame.current);
    const thisRun = ++run.current;

    const B = Object.fromEntries(ids().map((id) => [id, box(id)])) as Record<NodeId, Box>;
    // The light is an oval: DEPTH along its travel, across it the box's full width or height (so it
    // reaches both edges), blended by how horizontal the travel is.
    const DEPTH = 0.72 * Math.min(...Object.values(B).map((b) => b.b - b.t));
    const sizeIn = (r: Box, d: Point): Point => {
      const x2 = d[0] * d[0], y2 = d[1] * d[1], w = x2 + y2 ? x2 / (x2 + y2) : 0;
      const H: Point = [DEPTH, (r.b - r.t) / 2 / EDGE], V: Point = [(r.r - r.l) / 2 / EDGE, DEPTH];
      return [w * H[0] + (1 - w) * V[0], w * H[1] + (1 - w) * V[1]];
    };

    const legs: Leg[] = [];
    let branch: Leg["branch"] = 0;
    const none = (): Point => [0, 0];
    // Through a box from where it is entered to where it is left; a change of direction is a curve
    // through the box, not a turn at a point.
    const through = (id: NodeId, entry: Point, exit: Point, t: number, entryDir: Point) => {
      const r = B[id];
      const corner: Point = Math.abs(entryDir[0]) >= Math.abs(entryDir[1]) ? [exit[0], entry[1]] : [entry[0], exit[1]];
      const line = smooth([entry, corner, exit], Infinity), dur = line.total / SPEED;
      legs.push({ el: `box:${id}`, branch, t0: t, t1: t + dur, at: (u) => line.at(u * line.total).p, raw: (u) => sizeIn(r, line.at(u * line.total).d), size: none });
      return t + dur;
    };
    const along = (from: NodeId, to: NodeId, t: number) => {
      const line = smooth(points(from, to), LINK_CURVE), dur = line.total / SPEED;
      legs.push({
        el: `link:${from}-${to}`,
        branch,
        t0: t,
        t1: t + dur,
        at: (u) => line.at(u * line.total).p,
        raw: (u) => {
          const { d } = line.at(u * line.total), a = sizeIn(B[from], d), b = sizeIn(B[to], d), e = u * u * (3 - 2 * u);
          return [a[0] + (b[0] - a[0]) * e, a[1] + (b[1] - a[1]) * e];
        },
        size: none,
      });
      return t + dur;
    };
    // The treasury is where everything ends: the light slows into its centre and dissolves there.
    const land = (id: NodeId, p: Point, d: Point, t: number) => {
      const r = B[id], q: Point = [r.cx, r.cy], size = sizeIn(r, d), dur = (1.6 * Math.hypot(q[0] - p[0], q[1] - p[1])) / SPEED;
      const ease = (u: number) => 1 - (1 - u) ** 2;
      legs.push({ el: `box:${id}`, branch, t0: t, t1: t + dur, at: (u) => [p[0] + (q[0] - p[0]) * ease(u), p[1] + (q[1] - p[1]) * ease(u)], raw: () => size, size: none });
      legs.push({ el: `box:${id}`, branch, t0: t + dur, t1: t + dur + REST, at: () => q, raw: () => size, size: none, rest: true });
    };
    const lastDir = (P: Point[]): Point => [P.at(-1)![0] - P.at(-2)![0], P.at(-1)![1] - P.at(-2)![1]];

    const hs = points("holders", "FundShare"), sg = points("FundShare", "FundGovernor"), gt = points("FundGovernor", "TimelockController");
    const ty = points("TimelockController", "FundTreasury"), tr = points("TimelockController", "ArtRegistry"), ry = points("ArtRegistry", "FundTreasury");
    // The first box is entered from the side opposite the one it is left by.
    const h: Point = [B.holders.cx, B.holders.cy], start: Point = [2 * h[0] - hs[0][0], 2 * h[1] - hs[0][1]];
    let t = through("holders", start, hs[0], 0, [hs[0][0] - start[0], hs[0][1] - start[1]]);
    t = along("holders", "FundShare", t);
    t = through("FundShare", hs.at(-1)!, sg[0], t, lastDir(hs));
    t = along("FundShare", "FundGovernor", t);
    t = through("FundGovernor", sg.at(-1)!, gt[0], t, lastDir(sg));
    t = along("FundGovernor", "TimelockController", t);
    // The fork: both branches leave from where the timelock was entered, each curving to its own exit.
    branch = 1;
    land("FundTreasury", ty.at(-1)!, lastDir(ty), along("TimelockController", "FundTreasury", through("TimelockController", gt.at(-1)!, ty[0], t, lastDir(gt))));
    branch = 2;
    const registry = through("ArtRegistry", tr.at(-1)!, ry[0], along("TimelockController", "ArtRegistry", through("TimelockController", gt.at(-1)!, tr[0], t, lastDir(gt))), lastDir(tr));
    land("FundTreasury", ry.at(-1)!, lastDir(ry), along("ArtRegistry", "FundTreasury", registry));

    // The shape with inertia: a low-pass of the raw shape, worked out ahead along each branch (the shared
    // path belongs to both), so it stays continuous from one leg to the next.
    const K = 1 - Math.exp(-STEP_MS / TAU);
    const timeline = (b: 1 | 2) => {
      const ls = legs.filter((l) => l.branch === 0 || l.branch === b).sort((x, y) => x.t0 - y.t0);
      const last = Math.max(...ls.map((l) => l.t1)), arr: Point[] = [];
      let s: Point | null = null, i = 0;
      for (let at = 0; at <= last + STEP_MS; at += STEP_MS) {
        while (i < ls.length - 1 && at >= ls[i].t1) i++;
        const l = ls[i], raw = l.raw(Math.min(1, Math.max(0, (at - l.t0) / (l.t1 - l.t0))));
        s = s ? [s[0] + (raw[0] - s[0]) * K, s[1] + (raw[1] - s[1]) * K] : raw;
        arr.push(s);
      }
      return (at: number) => arr[Math.max(0, Math.min(arr.length - 1, Math.round(at / STEP_MS)))];
    };
    const shape = { 1: timeline(1), 2: timeline(2) };
    for (const leg of legs) {
      const tl = shape[leg.branch === 2 ? 2 : 1];
      leg.size = (u) => tl(leg.t0 + u * (leg.t1 - leg.t0));
    }

    // The canvases cover the diagram and a margin for the rail and the bloom. The outlines are drawn at
    // the screen's pixel density; the bloom and every element's light are soft, so they are drawn at one
    // pixel per CSS pixel and scaled up, which is invisible and many times less work on dense screens.
    const dpr = Math.min(window.devicePixelRatio || 1, 3), W = root.clientWidth, H = root.clientHeight;
    for (const [c, density] of [[back, 1], [front, dpr]] as const) {
      Object.assign(c.style, { left: `${-PAD}px`, top: `${-PAD}px`, width: `${W + 2 * PAD}px`, height: `${H + 2 * PAD}px` });
      c.width = Math.round((W + 2 * PAD) * density);
      c.height = Math.round((H + 2 * PAD) * density);
    }
    const bctx = back.getContext("2d")!, fctx = front.getContext("2d")!;

    // Each element's glow as a picture, in the theme's colours and the outlines' gradient (blue to
    // yellow along the order), blurred once here instead of on every frame.
    const cs = getComputedStyle(root), c0 = cs.getPropertyValue("--glow").trim(), c1 = cs.getPropertyValue("--yellow").trim();
    const all = Object.values(B), first = B.holders;
    const [g0, g1]: [Point, Point] = snake() ? [[0, first.t], [0, Math.max(...all.map((b) => b.b))]] : [[first.l, 0], [Math.max(...all.map((b) => b.r)), 0]];
    const picture = ([l, t, r, b]: Rect, body: string, density: number) => {
      const w = r - l, h = b - t, img = new Image();
      img.src =
        "data:image/svg+xml," +
        encodeURIComponent(
          `<svg xmlns="http://www.w3.org/2000/svg" width="${w * density}" height="${h * density}" viewBox="${l} ${t} ${w} ${h}"><defs>` +
            `<linearGradient id="${uid}g" gradientUnits="userSpaceOnUse" x1="${g0[0]}" y1="${g0[1]}" x2="${g1[0]}" y2="${g1[1]}"><stop offset="0.6" stop-color="${c0}"/><stop offset="0.8" stop-color="${c1}"/></linearGradient>` +
            `<filter id="${uid}h" filterUnits="userSpaceOnUse" x="${l}" y="${t}" width="${w}" height="${h}"><feGaussianBlur stdDeviation="${HAZE_BLUR}"/></filter>` +
            `<filter id="${uid}b" filterUnits="userSpaceOnUse" x="${l}" y="${t}" width="${w}" height="${h}"><feGaussianBlur stdDeviation="${BLOOM_BLUR}"/></filter>` +
            `</defs>${body}</svg>`,
        );
      return img;
    };
    const outline = (shape: string) =>
      `<g fill="none" stroke="url(#${uid}g)" stroke-linecap="round" stroke-linejoin="round">` +
      `<g opacity="0.55" filter="url(#${uid}h)" stroke-width="6">${shape}</g><g stroke-width="1.6">${shape}</g></g>`;
    const lastOf: Record<string, number> = {};
    for (const leg of legs) lastOf[leg.el] = Math.max(lastOf[leg.el] ?? 0, leg.t1);
    const elements = [
      ...ids().map((id) => {
        // Two areas: a wide one for the soft bloom and the light, a tight one for the sharp outline.
        const r = B[id], area: Rect = [r.l - BOX_ROOM, r.t - BOX_ROOM, r.r + BOX_ROOM, r.b + BOX_ROOM], tight: Rect = [r.l - LINK_ROOM, r.t - LINK_ROOM, r.r + LINK_ROOM, r.b + LINK_ROOM];
        const rect = `<rect x="${r.l + 0.5}" y="${r.t + 0.5}" width="${r.r - r.l - 1}" height="${r.b - r.t - 1}" rx="${CORNER - 0.5}"/>`;
        const bloom = `<rect x="${r.l - 2}" y="${r.t - 2}" width="${r.r - r.l + 4}" height="${r.b - r.t + 4}" rx="${CORNER + 2}" fill="url(#${uid}g)" opacity="0.75" filter="url(#${uid}b)"/>`;
        return { key: `box:${id}`, area, tight, front: picture(tight, outline(rect), dpr), back: picture(area, bloom, 1) as HTMLImageElement | null };
      }),
      ...LINKS.map((l) => {
        const P = points(l.from, l.to);
        const area: Rect = [Math.min(...P.map((p) => p[0])) - LINK_ROOM, Math.min(...P.map((p) => p[1])) - LINK_ROOM, Math.max(...P.map((p) => p[0])) + LINK_ROOM, Math.max(...P.map((p) => p[1])) + LINK_ROOM];
        return { key: `link:${l.from}-${l.to}`, area, tight: area, front: picture(area, outline(`<path d="${route(P)}"/>`), dpr), back: null as HTMLImageElement | null };
      }),
    ].map((e) => {
      // Per element, reused every frame: its light (1x), and scratch canvases to stamp its pictures
      // through it, one at screen density for the outline, one at 1x for the bloom.
      const [l, t, r, b] = e.area, w1 = Math.ceil(r - l), h1 = Math.ceil(b - t), w = Math.ceil((e.tight[2] - e.tight[0]) * dpr), h = Math.ceil((e.tight[3] - e.tight[1]) * dpr);
      const canvas = (cw: number, ch: number) => Object.assign(document.createElement("canvas"), { width: cw, height: ch });
      const mask = canvas(w1, h1), tmp = canvas(w, h), tmpBack = canvas(w1, h1);
      const mctx = mask.getContext("2d")!, spot = mctx.createRadialGradient(0, 0, 0, 0, 0, 1);
      spot.addColorStop(0, "#fff");
      spot.addColorStop(0.5, "rgba(255,255,255,0.8)");
      spot.addColorStop(1, "rgba(255,255,255,0)");
      return { ...e, until: lastOf[e.key] ?? -1, w, h, w1, h1, mask, mctx, spot, tmp, tctx: tmp.getContext("2d")!, tmpBack, bctx2: tmpBack.getContext("2d")! };
    });
    const touches = (s: Spot, [l, t, r, b]: Rect) => s.x + s.rx > l && s.x - s.rx < r && s.y + s.ry > t && s.y - s.ry < b;
    // What was drawn last frame, so only that is cleared (not both whole canvases).
    let dirty: [CanvasRenderingContext2D, number, number, number, number][] = [];
    const clear = (all = false) => {
      for (const [c, x, y, w, h] of dirty) c.clearRect(x, y, w, h);
      dirty = [];
      if (all) for (const c of [bctx, fctx]) c.clearRect(0, 0, c.canvas.width, c.canvas.height);
    };
    // Stamp a picture covering `part` (inside the element's area) through the element's light onto a
    // canvas, at the given density.
    const stamp = (e: (typeof elements)[number], part: Rect, picture: HTMLImageElement, scratch: CanvasRenderingContext2D, w: number, h: number, onto: CanvasRenderingContext2D, density: number) => {
      scratch.globalCompositeOperation = "copy";
      scratch.drawImage(e.mask, part[0] - e.area[0], part[1] - e.area[1], part[2] - part[0], part[3] - part[1], 0, 0, w, h);
      scratch.globalCompositeOperation = "source-in";
      scratch.drawImage(picture, 0, 0, w, h);
      const x = Math.round((part[0] + PAD) * density), y = Math.round((part[1] + PAD) * density);
      onto.drawImage(scratch.canvas, x, y);
      dirty.push([onto, x, y, w, h]);
    };

    // The light and its wake, k = 1..n steps behind it, smaller and dimmer the further back.
    const n = Math.round(TAIL / SPACING), dt = SPACING / SPEED, end = Math.max(...legs.map((l) => l.t1)) + n * dt + 60;
    let start0 = 0;
    const tick = (now: number) => {
      if (thisRun !== run.current) return;
      start0 ||= now;
      const elapsed = now - start0, spots: Spot[] = [];
      for (let k = 0; k < n; k++) {
        const at = elapsed - k * dt;
        if (at < 0) break;
        const fall = 1 - k / n, alpha = k === 0 ? 1 : 0.32 * fall ** 1.5;
        for (const leg of legs) {
          // A light at rest has no wake: only its present spot, spreading and dimming.
          if (at < leg.t0 || at >= leg.t1 || (leg.rest && k > 0)) continue;
          const u = (at - leg.t0) / (leg.t1 - leg.t0), [x, y] = leg.at(u), [rx, ry] = leg.size(u), scale = leg.rest ? 1 + 0.4 * u : 0.55 + 0.45 * fall;
          spots.push({ x, y, rx: rx * scale, ry: ry * scale, opacity: leg.rest ? (1 - u) ** 1.5 : alpha, t0: leg.t0 });
        }
      }
      clear();
      // The light only moves forward. An element accepts light from a spot only if its leg starts no
      // later than the element's own last moment in the trace: it glows as the light approaches and
      // while the light is on it, and its wake fades, but a later step passing nearby can't light it
      // again. Elements no accepted spot reaches are skipped.
      for (const e of elements) {
        const mine = spots.filter((s) => s.opacity > 0.02 && s.t0 <= e.until + 0.5 && touches(s, e.area));
        if (!mine.length) continue;
        const m = e.mctx;
        m.setTransform(1, 0, 0, 1, 0, 0);
        m.clearRect(0, 0, e.w1, e.h1);
        m.setTransform(1, 0, 0, 1, -e.area[0], -e.area[1]);
        m.fillStyle = e.spot;
        for (const s of mine) {
          m.save();
          m.globalAlpha = s.opacity;
          m.translate(s.x, s.y);
          m.scale(s.rx, s.ry);
          m.beginPath();
          m.arc(0, 0, 1, 0, 2 * Math.PI);
          m.fill();
          m.restore();
        }
        stamp(e, e.tight, e.front, e.tctx, e.w, e.h, fctx, dpr);
        if (e.back) stamp(e, e.area, e.back, e.bctx2, e.w1, e.h1, bctx, 1);
      }
      if (elapsed < end) frame.current = requestAnimationFrame(tick);
      else clear(true);
    };
    // Start once every picture is ready (a few milliseconds; they are drawn from inline SVG).
    Promise.all(elements.flatMap((e) => [e.front, e.back].filter((p): p is HTMLImageElement => !!p).map((p) => p.decode()))).then(
      () => {
        if (thisRun === run.current) frame.current = requestAnimationFrame(tick);
      },
      () => {},
    );
  }, [box, ids, points, snake, uid]);

  // Once, when the diagram comes into view; again from the button.
  useEffect(() => {
    const root = ref.current;
    if (!root) return;
    const io = new IntersectionObserver(
      ([e]) => {
        if (!e.isIntersecting) return;
        io.disconnect();
        document.fonts?.ready.then(() => requestAnimationFrame(trace));
      },
      { threshold: 0.5 },
    );
    io.observe(root);
    const loop = frame, current = run;
    return () => {
      io.disconnect();
      current.current++;
      cancelAnimationFrame(loop.current);
    };
  }, [trace]);

  // A tap on a phone shows its answer: the panel is brought into view if it isn't.
  const choose = useCallback(
    (id: NodeId) => {
      setSelected(id);
      if (!snake()) return;
      requestAnimationFrame(() =>
        detailRef.current?.scrollIntoView({ block: "nearest", behavior: matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth" }),
      );
    },
    [snake],
  );

  const near = new Set(LINKS.filter((l) => l.from === focus || l.to === focus).flatMap((l) => [l.from, l.to]));
  const nodeProps = (id: NodeId) => ({
    "data-node": id,
    type: "button" as const,
    className: `chain-node chain-${id}${focus === id ? " on" : ""}${near.has(id) ? " near" : ""}`,
    "aria-pressed": selected === id,
    onPointerEnter: (e: PointerEvent) => e.pointerType === "mouse" && setPreview(id),
    onFocus: () => setSelected(id),
    onClick: () => choose(id),
  });

  // Every panel is rendered in the same grid cell and only the active one is visible, so the panel is
  // always as tall as its tallest content: choosing a contract never moves the page. On phones the
  // boxes show no role, so each panel starts with it.
  const panels: { id: NodeId | null; content: ReactNode }[] = [
    {
      id: null,
      content: <p className="muted">Hover or tap a contract to follow its links. Links in ink are control (ownership and roles); light ones are flows.</p>,
    },
    {
      id: "holders",
      content: (
        <>
          <p className="chain-panel-role">
            <b>Shareholders</b> · {holders.length} stakeholders
          </p>
          <p className="muted">
            The people who subscribed. They hold FundShare and delegate it to vote; holding and delegating are the only links they start.
          </p>
        </>
      ),
    },
    ...contracts.map((c) => ({
      id: c.kind as NodeId,
      content: (
        <>
          <p>
            <b>{c.kind}</b> ·{" "}
            <a href={etherscanCode(c.address)} target="_blank" rel="noreferrer">
              verified source
            </a>
          </p>
          <Address address={c.address} />
          <p className="chain-panel-role muted">{c.role}.</p>
          <p className="muted">{c.can}</p>
        </>
      ),
    })),
  ];

  return (
    <div className="chain-wrap">
      <div ref={ref} className="chain" data-focus={focus ?? undefined} onPointerLeave={(e) => e.pointerType === "mouse" && setPreview(null)}>
        {/* The light: the bloom behind the boxes, the lit outlines and links in front. */}
        <canvas ref={backRef} className="chain-light chain-light-back" aria-hidden="true" />
        <svg className="chain-links" aria-hidden="true">
          {wires.map((w, i) => {
            const l = LINKS[i], on = focus !== null && (l.from === focus || l.to === focus);
            return (
              <g key={w.key} className={`chain-link${w.control ? " control" : ""}${on ? " on" : ""}`}>
                <path d={w.d} />
                <text
                  x={w.label.x}
                  y={w.label.y}
                  textAnchor={w.label.anchor}
                  transform={w.label.rotate ? `rotate(90 ${w.label.x} ${w.label.y}) translate(0 -6)` : undefined}
                >
                  {w.label.lines.length === 1
                    ? w.label.lines[0]
                    : w.label.lines.map((s, k) => (
                        <tspan key={s} x={w.label.x} y={w.label.y - (w.label.lines.length - 1 - k) * 12}>
                          {s}
                        </tspan>
                      ))}
                </text>
              </g>
            );
          })}
        </svg>
        <canvas ref={frontRef} className="chain-light chain-light-front" aria-hidden="true" />
        <button {...nodeProps("holders")} aria-label={`Step 01, shareholders: ${holders.length} stakeholders`}>
          <span className="chain-top">
            <span className="chain-avatars">
              {holders.map((h) => (
                <Blockie key={h.address} address={h.address} slot={h.slot} size={18} />
              ))}
            </span>
            <span className="chain-step">{STEP.holders}</span>
          </span>
          <b>Shareholders</b>
          <span className="chain-role">{holders.length} stakeholders</span>
        </button>
        {contracts.map((c) => (
          <button key={c.kind} {...nodeProps(c.kind)} aria-label={`Step ${STEP[c.kind]}, ${c.kind}: ${c.role}`}>
            <span className="chain-top">
              <ContractGlyph kind={c.kind} size={20} />
              <span className="chain-step">{STEP[c.kind]}</span>
            </span>
            {/* Lets "TimelockController" break between its words, not mid-word. */}
            <b>{c.kind.replace(/([a-z])([A-Z])/g, "$1​$2")}</b>
            <span className="chain-role">{c.role}</span>
          </button>
        ))}
      </div>
      <div ref={detailRef} className="chain-detail" aria-live="polite">
        {panels.map((p) => (
          <div key={p.id ?? "none"} className="chain-panel" data-active={p.id === focus || undefined}>
            {p.content}
          </div>
        ))}
      </div>
      <button type="button" className="chain-replay" onClick={trace}>
        ↻ Trace the order again
      </button>
    </div>
  );
}
