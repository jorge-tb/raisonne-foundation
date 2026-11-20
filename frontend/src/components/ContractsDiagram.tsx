"use client";

import { useCallback, useLayoutEffect, useRef, useState, type PointerEvent, type ReactNode } from "react";
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
const CORNER = 10; // rounding of the connectors' corners and of the boxes' outline
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

// The fund's contracts as a chain of command, in the order a decision travels (numbered). Hover (mouse)
// previews a box's own links; a click, tap or keyboard focus selects it and keeps it selected.
export function ContractsDiagram({ contracts, holders }: { contracts: DiagramContract[]; holders: { address: string; slot: number }[] }) {
  const ref = useRef<HTMLDivElement>(null);
  const [selected, setSelected] = useState<NodeId | null>(null);
  const [preview, setPreview] = useState<NodeId | null>(null);
  const [wires, setWires] = useState<Wire[]>([]);
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
  }, [box, contracts, points]);

  useLayoutEffect(() => {
    draw();
    const ro = new ResizeObserver(draw);
    if (ref.current) ro.observe(ref.current);
    document.fonts?.ready.then(draw);
    return () => ro.disconnect();
  }, [draw]);

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
    </div>
  );
}
