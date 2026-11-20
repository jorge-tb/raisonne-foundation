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
type Wire = { d: string; label: { x: number; y: number; anchor: "start" | "middle"; rotate: boolean }; on: boolean; control?: boolean; key: string };
type Side = "LM" | "TM" | "RM" | "BM";
// One stretch of the trace: through a box from the side it is entered to the opposite one, along a link,
// or (rest) the light standing still while it fades. `at` is where the light is and `size` its two
// radii (x, y), both at u = 0..1 of the stretch.
type Leg = { t0: number; t1: number; at: (u: number) => Point; size: (u: number) => Point; rest?: boolean };

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

// The fund's contracts as a chain of command, in the order a decision travels (numbered). When the
// diagram comes into view a soft light carries that order through the boxes: the outlines and links
// are drawn a second time, in light, hidden behind a mask, and the light paints the mask as it moves,
// so whatever it reaches glows at once, with a coloured bloom behind each box, and fades behind it.
// It ends in the treasury, settling into the box and dissolving there.
// Its colour warms from the accent blue to yellow along the order. Hover (mouse) previews a box's own
// links; a click or tap selects it and keeps it selected.
export function ContractsDiagram({ contracts, holders }: { contracts: DiagramContract[]; holders: { address: string; slot: number }[] }) {
  const ref = useRef<HTMLDivElement>(null);
  const paintRef = useRef<SVGGElement>(null);
  const frame = useRef(0);
  // Ids for the gradient, filters and mask; useId's own characters are not safe inside url(#…).
  const uid = `chain${useId().replace(/[^\w-]/g, "")}`;
  const [selected, setSelected] = useState<NodeId | null>(null);
  const [preview, setPreview] = useState<NodeId | null>(null);
  const [wires, setWires] = useState<Wire[]>([]);
  const [boxes, setBoxes] = useState<Box[]>([]);
  const [span, setSpan] = useState<[Point, Point]>([[0, 0], [1, 0]]);
  const focus = preview ?? selected;

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
      if (!vertical()) {
        if (from === "TimelockController" && to === "ArtRegistry") {
          const x = (a.r + box("FundTreasury").l) / 2;
          return [[a.r, a.cy], [x, a.cy], [x, b.cy], [b.l, b.cy]];
        }
        if (from === "ArtRegistry") {
          const x = Math.max(a.r, b.r) + 16;
          return [[a.r, a.cy], [x, a.cy], [x, b.cy], [b.r, b.cy]];
        }
        return [[a.r, a.cy], [b.l, b.cy]];
      }
      if (from === "TimelockController" && to === "FundTreasury") {
        const y = (a.b + box("ArtRegistry").t) / 2, x = Math.max(a.r, b.r) + 16;
        return [[a.cx, a.b], [a.cx, y], [x, y], [x, b.cy], [b.r, b.cy]];
      }
      return [[a.cx, a.b], [b.cx, b.t]];
    },
    [box, vertical],
  );

  const draw = useCallback(() => {
    if (!ref.current) return;
    const all = (["holders", ...contracts.map((c) => c.kind)] as NodeId[]).map(box);
    const rightmost = Math.max(...all.map((b) => b.r));
    setBoxes(all);
    // The colour runs along the order: left → right, or top → bottom on phones.
    const first = box("holders");
    setSpan(vertical() ? [[0, first.t], [0, Math.max(...all.map((b) => b.b))]] : [[first.l, 0], [rightmost, 0]]);
    setWires(
      LINKS.map((l) => {
        const pts = points(l.from, l.to);
        // The label sits on the link's longest run: above it if horizontal, beside it if vertical, and
        // along it when the run is a side rail outside the boxes.
        let best: [Point, Point] = [pts[0], pts[1]], longest = -1;
        for (let i = 1; i < pts.length; i++) {
          const len = Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]);
          if (len > longest) [longest, best] = [len, [pts[i - 1], pts[i]]];
        }
        const [p, q] = best, x = (p[0] + q[0]) / 2, y = (p[1] + q[1]) / 2, horizontal = Math.abs(q[0] - p[0]) >= Math.abs(q[1] - p[1]);
        const label = horizontal
          ? { x, y: y - 8, anchor: "middle" as const, rotate: false }
          : x > rightmost
            ? { x, y, anchor: "middle" as const, rotate: true }
            : { x: x + 8, y: y + 4, anchor: "start" as const, rotate: false };
        return { key: `${l.from}-${l.to}`, d: route(pts), label, on: false, control: l.control };
      }),
    );
  }, [box, contracts, points, vertical]);

  useLayoutEffect(() => {
    draw();
    const ro = new ResizeObserver(draw);
    if (ref.current) ro.observe(ref.current);
    document.fonts?.ready.then(draw);
    return () => ro.disconnect();
  }, [draw]);

  // The trace. Imperative on purpose: a frame loop that must not re-render the page.
  const trace = useCallback(() => {
    const root = ref.current, paint = paintRef.current;
    if (!root || !paint || matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    cancelAnimationFrame(frame.current);
    paint.replaceChildren();

    // The light is an oval: along its direction of travel it keeps one size everywhere (DEPTH); across it,
    // it is sized to the box it is in, so it reaches both edges of short and tall boxes alike. On a link
    // it changes smoothly from the size of the box it left to that of the box it is heading for.
    const all = (["holders", ...contracts.map((c) => c.kind)] as NodeId[]).map((id) => box(id));
    const DEPTH = 0.72 * Math.min(...all.map((b) => b.b - b.t));
    const across = (horizontal: boolean) => (r: Box): Point => (horizontal ? [DEPTH, (r.b - r.t) / 2 / EDGE] : [(r.r - r.l) / 2 / EDGE, DEPTH]);
    const sideways = (s: Side) => s === "LM" || s === "RM";
    const fit = (id: NodeId, s: Side) => across(sideways(s))(box(id));
    const blend = (a: Point, b: Point) => (u: number): Point => {
      const e = u * u * (3 - 2 * u);
      return [a[0] + (b[0] - a[0]) * e, a[1] + (b[1] - a[1]) * e];
    };

    // The order as timed legs: through each box from where it is entered to the opposite side, then
    // along its link; the timelock forks to the treasury and the registry, and the registry sends it on
    // into the treasury.
    const legs: Leg[] = [];
    const v = vertical(), IN: Side = v ? "TM" : "LM", OUT: Side = v ? "BM" : "RM";
    const side = (r: Box, s: Side): Point => ({ LM: [r.l, r.cy], RM: [r.r, r.cy], TM: [r.cx, r.t], BM: [r.cx, r.b] })[s] as Point;
    const through = (id: NodeId, from: Side, to: Side, t: number) => {
      const r = box(id), p = side(r, from), q = side(r, to), dur = Math.hypot(q[0] - p[0], q[1] - p[1]) / SPEED, size = fit(id, from);
      legs.push({ t0: t, t1: t + dur, at: (u) => [p[0] + (q[0] - p[0]) * u, p[1] + (q[1] - p[1]) * u], size: () => size });
      return t + dur;
    };
    // A link, leaving `from` by its side `out` and entering `to` by its side `entry`.
    const along = (from: NodeId, out: Side, to: NodeId, entry: Side, t: number) => {
      const path = document.createElementNS(SVG_NS, "path");
      path.setAttribute("d", route(points(from, to)));
      const len = path.getTotalLength(), dur = len / SPEED;
      legs.push({
        t0: t,
        t1: t + dur,
        at: (u) => {
          const pt = path.getPointAtLength(u * len);
          return [pt.x, pt.y];
        },
        size: blend(fit(from, out), fit(to, entry)),
      });
      return t + dur;
    };
    // The treasury is where everything ends: the light slows into its centre and dissolves there,
    // instead of running out of a far edge onto another link.
    const land = (id: NodeId, from: Side, t: number) => {
      const r = box(id), p = side(r, from), q: Point = [r.cx, r.cy], size = fit(id, from);
      const dur = (1.6 * Math.hypot(q[0] - p[0], q[1] - p[1])) / SPEED;
      const ease = (u: number) => 1 - (1 - u) ** 2;
      legs.push({ t0: t, t1: t + dur, at: (u) => [p[0] + (q[0] - p[0]) * ease(u), p[1] + (q[1] - p[1]) * ease(u)], size: () => size });
      legs.push({ t0: t + dur, t1: t + dur + REST, at: () => q, size: () => size, rest: true });
    };
    let t = 0;
    for (const [id, next] of [["holders", "FundShare"], ["FundShare", "FundGovernor"], ["FundGovernor", "TimelockController"]] as [NodeId, NodeId][]) {
      t = along(id, OUT, next, IN, through(id, IN, OUT, t));
    }
    t = through("TimelockController", IN, OUT, t);
    // The fork: both links leave the timelock together.
    const toTreasury: Side = v ? "RM" : "LM", fromRegistry: Side = v ? "TM" : "RM";
    land("FundTreasury", toTreasury, along("TimelockController", OUT, "FundTreasury", toTreasury, t));
    const registry = through("ArtRegistry", IN, OUT, along("TimelockController", OUT, "ArtRegistry", IN, t));
    land("FundTreasury", fromRegistry, along("ArtRegistry", OUT, "FundTreasury", fromRegistry, registry));

    // The light and its wake, k = 1..n steps behind it, smaller and dimmer the further back. Spots are
    // reused from frame to frame.
    const n = Math.round(TAIL / SPACING), dt = SPACING / SPEED, end = Math.max(...legs.map((l) => l.t1)) + n * dt + 60;
    const spots: SVGEllipseElement[] = [];
    const spot = (i: number) => {
      if (!spots[i]) {
        spots[i] = document.createElementNS(SVG_NS, "ellipse");
        spots[i].setAttribute("fill", `url(#${uid}-spot)`);
        paint.appendChild(spots[i]);
      }
      return spots[i];
    };
    const start = performance.now();
    const tick = (now: number) => {
      const elapsed = now - start;
      let used = 0;
      for (let k = 0; k < n; k++) {
        const at = elapsed - k * dt;
        if (at < 0) break;
        const fall = 1 - k / n, alpha = k === 0 ? 1 : 0.32 * fall ** 1.5;
        for (const leg of legs) {
          // A light at rest has no wake: only its present spot, spreading and dimming.
          if (at < leg.t0 || at >= leg.t1 || (leg.rest && k > 0)) continue;
          const u = (at - leg.t0) / (leg.t1 - leg.t0), [x, y] = leg.at(u), [rx, ry] = leg.size(u), c = spot(used++);
          const scale = leg.rest ? 1 + 0.4 * u : 0.55 + 0.45 * fall;
          c.setAttribute("cx", String(x));
          c.setAttribute("cy", String(y));
          c.setAttribute("rx", String(rx * scale));
          c.setAttribute("ry", String(ry * scale));
          c.setAttribute("opacity", String(leg.rest ? (1 - u) ** 1.5 : alpha));
          c.style.display = "";
        }
      }
      for (let i = used; i < spots.length; i++) spots[i].style.display = "none";
      if (elapsed < end) frame.current = requestAnimationFrame(tick);
      else paint.replaceChildren();
    };
    frame.current = requestAnimationFrame(tick);
  }, [box, contracts, points, uid, vertical]);

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
            <mask id={`${uid}-light`} maskUnits="userSpaceOnUse" x="-500" y="-500" width="5000" height="5000">
              <g ref={paintRef} />
            </mask>
          </defs>
          {/* The bloom: a coloured glow behind each box, wherever the light is. */}
          <g mask={`url(#${uid}-light)`}>
            <g className="chain-bloom" filter={`url(#${uid}-bloom)`} fill={`url(#${uid}-hue)`}>
              {boxes.map((b, i) => (
                <rect key={i} x={b.l - 2} y={b.t - 2} width={b.r - b.l + 4} height={b.b - b.t + 4} rx={CORNER + 2} />
              ))}
            </g>
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
                  {l.label}
                </text>
              </g>
            );
          })}
        </svg>
        {/* The outlines and links again, in light, over the boxes; only what the light reaches shows. */}
        <svg className="chain-glow" aria-hidden="true">
          <g mask={`url(#${uid}-light)`} stroke={`url(#${uid}-hue)`}>
            {[
              { cls: "chain-haze", filter: `url(#${uid}-haze)` },
              { cls: "chain-lit", filter: undefined },
            ].map(({ cls, filter }) => (
              <g key={cls} className={cls} filter={filter}>
                {boxes.map((b, i) => (
                  <rect key={i} x={b.l + 0.5} y={b.t + 0.5} width={b.r - b.l - 1} height={b.b - b.t - 1} rx={CORNER - 0.5} />
                ))}
                {wires.map((w) => (
                  <path key={w.key} d={w.d} />
                ))}
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
