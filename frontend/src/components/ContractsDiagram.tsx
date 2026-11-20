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
type Wire = { d: string; label: { x: number; y: number; anchor: "start" | "middle"; rotate: boolean; lines: string[] }; control?: boolean; key: string };
// One stretch of the trace: through a box, along a link, or (rest) the light standing still while it
// fades. `el` is the box or link it belongs to; `branch` 0 is the shared path, 1 the timelock's branch
// to the treasury, 2 the branch through the registry. `raw` is the shape its direction asks for;
// `size` the shape it has, after inertia.
type Leg = { el: string; branch: 0 | 1 | 2; t0: number; t1: number; at: (u: number) => Point; raw: (u: number) => Point; size: (u: number) => Point; rest?: boolean };
type Line = { total: number; at: (s: number) => { p: Point; d: Point } };

const SVG_NS = "http://www.w3.org/2000/svg";
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
// turn reshapes it gradually; worked out ahead every STEP ms.
const TAU = 200;
const STEP_MS = 4;

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

// The fund's contracts as a chain of command, in the order a decision travels (numbered). When the diagram comes into view a soft light carries that order through
// the boxes: the outlines and links are drawn a second time, in light, each behind its own mask, and
// the light paints the masks as it moves. It only moves forward: a box or link it has left can't be
// lit again by a later step passing nearby. It ends in the treasury, settling into the box and
// dissolving there. Its colour warms from the accent blue to yellow along the order. Hover (mouse)
// previews a box's own links; a click or tap selects it and keeps it selected.
export function ContractsDiagram({ contracts, holders }: { contracts: DiagramContract[]; holders: { address: string; slot: number }[] }) {
  const ref = useRef<HTMLDivElement>(null);
  const masksRef = useRef<SVGGElement>(null);
  const frame = useRef(0);
  // Ids for the gradient, filters and masks; useId's own characters are not safe inside url(#…).
  const uid = `chain${useId().replace(/[^\w-]/g, "")}`;
  const [selected, setSelected] = useState<NodeId | null>(null);
  const [preview, setPreview] = useState<NodeId | null>(null);
  const [wires, setWires] = useState<Wire[]>([]);
  const [boxes, setBoxes] = useState<(Box & { id: NodeId })[]>([]);
  const [span, setSpan] = useState<[Point, Point]>([[0, 0], [1, 0]]);
  const focus = preview ?? selected;
  const ids = useCallback(() => ["holders", ...contracts.map((c) => c.kind)] as NodeId[], [contracts]);

  const box = useCallback((id: NodeId): Box => {
    const root = ref.current!, o = root.getBoundingClientRect();
    const r = root.querySelector(`.chain-node[data-node="${id}"]`)!.getBoundingClientRect();
    return { l: r.left - o.left, t: r.top - o.top, r: r.right - o.left, b: r.bottom - o.top, cx: (r.left + r.right) / 2 - o.left, cy: (r.top + r.bottom) / 2 - o.top };
  }, []);
  const vertical = useCallback(() => !!ref.current && getComputedStyle(ref.current).gridTemplateColumns.split(" ").length === 1, []);

  // Where each link runs. Wide: boxes are entered on the left and left on the right; the timelock's two
  // links fork at a junction in the gap; registry → treasury runs up a rail on the right. Narrow:
  // entered at the top, left at the bottom; the timelock's link to the treasury forks below it and runs
  // down a side rail.
  const points = useCallback(
    (from: NodeId, to: NodeId): Point[] => {
      const a = box(from), b = box(to);
      if (vertical()) {
        if (from === "TimelockController" && to === "FundTreasury") {
          const y = (a.b + box("ArtRegistry").t) / 2, x = Math.max(a.r, b.r) + 16;
          return [[a.cx, a.b], [a.cx, y], [x, y], [x, b.cy], [b.r, b.cy]];
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
    [box, vertical],
  );

  const draw = useCallback(() => {
    if (!ref.current) return;
    const all = ids().map((id) => ({ id, ...box(id) }));
    const rightmost = Math.max(...all.map((b) => b.r));
    setBoxes(all);
    // The colour runs along the order: left → right, or top → bottom on phones.
    const first = box("holders");
    setSpan(vertical() ? [[0, first.t], [0, Math.max(...all.map((b) => b.b))]] : [[first.l, 0], [rightmost, 0]]);
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
  }, [box, ids, points, vertical]);

  useLayoutEffect(() => {
    draw();
    const ro = new ResizeObserver(draw);
    if (ref.current) ro.observe(ref.current);
    document.fonts?.ready.then(draw);
    return () => ro.disconnect();
  }, [draw]);

  // The trace. Imperative on purpose: a frame loop that must not re-render the page.
  const trace = useCallback(() => {
    const root = ref.current, masksG = masksRef.current;
    if (!root || !masksG || matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    cancelAnimationFrame(frame.current);
    masksG.replaceChildren();
    for (const el of root.querySelectorAll("[data-el]")) el.setAttribute("mask", `url(#${uid}-none)`);

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

    // The light only moves forward. An element accepts light from a leg only if that leg starts no later
    // than the element's own last moment in the trace: it glows as the light approaches and while the
    // light is on it, and its wake fades, but a later step passing nearby can't light it again.
    // Elements with the same last moment share one mask.
    const lastOf: Record<string, number> = {};
    for (const leg of legs) lastOf[leg.el] = Math.max(lastOf[leg.el] ?? 0, leg.t1);
    const masks = [...new Set(Object.values(lastOf))]
      .sort((a, b) => a - b)
      .map((until, i) => {
        const m = document.createElementNS(SVG_NS, "mask");
        m.setAttribute("id", `${uid}-m${i}`);
        m.setAttribute("maskUnits", "userSpaceOnUse");
        for (const [k, v] of [["x", "-500"], ["y", "-500"], ["width", "5000"], ["height", "5000"]]) m.setAttribute(k, v);
        masksG.appendChild(m);
        return { until, m, spots: [] as SVGEllipseElement[], used: 0 };
      });
    for (const el of root.querySelectorAll<SVGGElement>("[data-el]")) {
      const i = masks.findIndex((x) => x.until === lastOf[el.dataset.el!]);
      if (i >= 0) el.setAttribute("mask", `url(#${uid}-m${i})`);
    }
    const place = (mk: (typeof masks)[number], x: number, y: number, rx: number, ry: number, opacity: number) => {
      let e = mk.spots[mk.used];
      if (!e) {
        e = document.createElementNS(SVG_NS, "ellipse");
        e.setAttribute("fill", `url(#${uid}-spot)`);
        mk.m.appendChild(e);
        mk.spots.push(e);
      }
      mk.used++;
      e.setAttribute("cx", String(x));
      e.setAttribute("cy", String(y));
      e.setAttribute("rx", String(rx));
      e.setAttribute("ry", String(ry));
      e.setAttribute("opacity", String(opacity));
      e.style.display = "";
    };

    // The light and its wake, k = 1..n steps behind it, smaller and dimmer the further back.
    const n = Math.round(TAIL / SPACING), dt = SPACING / SPEED, end = Math.max(...legs.map((l) => l.t1)) + n * dt + 60;
    const start0 = performance.now();
    const tick = (now: number) => {
      const elapsed = now - start0;
      for (const mk of masks) mk.used = 0;
      for (let k = 0; k < n; k++) {
        const at = elapsed - k * dt;
        if (at < 0) break;
        const fall = 1 - k / n, alpha = k === 0 ? 1 : 0.32 * fall ** 1.5;
        for (const leg of legs) {
          // A light at rest has no wake: only its present spot, spreading and dimming.
          if (at < leg.t0 || at >= leg.t1 || (leg.rest && k > 0)) continue;
          const u = (at - leg.t0) / (leg.t1 - leg.t0), [x, y] = leg.at(u), [rx, ry] = leg.size(u);
          const scale = leg.rest ? 1 + 0.4 * u : 0.55 + 0.45 * fall, opacity = leg.rest ? (1 - u) ** 1.5 : alpha;
          for (const mk of masks) if (leg.t0 <= mk.until + 0.5) place(mk, x, y, rx * scale, ry * scale, opacity);
        }
      }
      for (const mk of masks) for (let i = mk.used; i < mk.spots.length; i++) mk.spots[i].style.display = "none";
      if (elapsed < end) frame.current = requestAnimationFrame(tick);
      else {
        // Back to the empty mask before removing the trace's own: an element whose mask no longer
        // exists is drawn unmasked, which would leave every outline lit.
        for (const el of root.querySelectorAll("[data-el]")) el.setAttribute("mask", `url(#${uid}-none)`);
        masksG.replaceChildren();
      }
    };
    frame.current = requestAnimationFrame(tick);
  }, [box, ids, points, uid]);

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
    const loop = frame;
    return () => {
      io.disconnect();
      cancelAnimationFrame(loop.current);
    };
  }, [trace]);

  const near = new Set(LINKS.filter((l) => l.from === focus || l.to === focus).flatMap((l) => [l.from, l.to]));
  const nodeProps = (id: NodeId) => ({
    "data-node": id,
    type: "button" as const,
    className: `chain-node chain-${id}${focus === id ? " on" : ""}${near.has(id) ? " near" : ""}`,
    "aria-pressed": selected === id,
    onPointerEnter: (e: PointerEvent) => e.pointerType === "mouse" && setPreview(id),
    onFocus: () => setSelected(id),
    onClick: () => setSelected(id),
  });

  // Every panel is rendered in the same grid cell and only the active one is visible, so the panel is
  // always as tall as its tallest content: choosing a contract never moves the page.
  const panels: { id: NodeId | null; content: ReactNode }[] = [
    {
      id: null,
      content: <p className="muted">Hover or tap a contract to follow its links. Links in ink are control (ownership and roles); light ones are flows.</p>,
    },
    {
      id: "holders",
      content: (
        <p className="muted">
          The people who subscribed. They hold FundShare and delegate it to vote; holding and delegating are the only links they start.
        </p>
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
          <code className="hash">{c.address}</code>
          <p className="muted">{c.can}</p>
        </>
      ),
    })),
  ];

  return (
    <div className="chain-wrap">
      <div ref={ref} className="chain" data-focus={focus ?? undefined} onPointerLeave={(e) => e.pointerType === "mouse" && setPreview(null)}>
        <svg className="chain-links" aria-hidden="true">
          <defs>
            <linearGradient id={`${uid}-hue`} gradientUnits="userSpaceOnUse" x1={span[0][0]} y1={span[0][1]} x2={span[1][0]} y2={span[1][1]}>
              {/* Blue until the timelock, yellow after it: the change happens where a decision becomes an action. */}
              <stop offset="0.6" className="chain-hue-start" />
              <stop offset="0.8" className="chain-hue-end" />
            </linearGradient>
            <radialGradient id={`${uid}-spot`}>
              <stop offset="0" stopColor="#fff" />
              <stop offset="0.5" stopColor="#fff" stopOpacity="0.8" />
              <stop offset="1" stopColor="#fff" stopOpacity="0" />
            </radialGradient>
            <filter id={`${uid}-haze`} x="-20%" y="-20%" width="140%" height="140%">
              <feGaussianBlur stdDeviation="2.5" />
            </filter>
            <filter id={`${uid}-bloom`} x="-50%" y="-50%" width="200%" height="200%">
              <feGaussianBlur stdDeviation="14" />
            </filter>
            {/* Shows nothing: every glowing element wears it until a trace gives it its own mask. */}
            <mask id={`${uid}-none`} maskUnits="userSpaceOnUse" x="-500" y="-500" width="5000" height="5000" />
            {/* The trace's masks, made and painted by the frame loop. */}
            <g ref={masksRef} />
          </defs>
          {/* The bloom: a coloured glow behind each box, wherever the light is. */}
          <g className="chain-bloom" fill={`url(#${uid}-hue)`}>
            {boxes.map((b) => (
              <g key={b.id} data-el={`box:${b.id}`} mask={`url(#${uid}-none)`}>
                <rect filter={`url(#${uid}-bloom)`} x={b.l - 2} y={b.t - 2} width={b.r - b.l + 4} height={b.b - b.t + 4} rx={CORNER + 2} />
              </g>
            ))}
          </g>
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
        {/* The outlines and links again, in light, over the boxes; each shows only where its mask is lit. */}
        <svg className="chain-glow" aria-hidden="true">
          <g stroke={`url(#${uid}-hue)`}>
            {boxes.map((b) => (
              <g key={b.id} data-el={`box:${b.id}`} mask={`url(#${uid}-none)`}>
                <rect className="chain-haze" filter={`url(#${uid}-haze)`} x={b.l + 0.5} y={b.t + 0.5} width={b.r - b.l - 1} height={b.b - b.t - 1} rx={CORNER - 0.5} />
                <rect className="chain-lit" x={b.l + 0.5} y={b.t + 0.5} width={b.r - b.l - 1} height={b.b - b.t - 1} rx={CORNER - 0.5} />
              </g>
            ))}
            {wires.map((w) => (
              <g key={w.key} data-el={`link:${w.key}`} mask={`url(#${uid}-none)`}>
                <path className="chain-haze" filter={`url(#${uid}-haze)`} d={w.d} />
                <path className="chain-lit" d={w.d} />
              </g>
            ))}
          </g>
        </svg>
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
      <div className="chain-detail" aria-live="polite">
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
