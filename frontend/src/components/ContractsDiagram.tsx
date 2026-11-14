"use client";

import { useCallback, useLayoutEffect, useRef, useState } from "react";
import { etherscanCode } from "@/lib/format";
import { ContractGlyph, type ContractKind } from "./ContractGlyph";
import { Blockie } from "./holders/Blockie";

export type DiagramContract = { kind: ContractKind; address: string; role: string; can: string };
type NodeId = ContractKind | "holders";

// Who can do what to whom. Arrows in ink are control (ownership, roles); light ones are flows.
const WIRES: { from: NodeId; to: NodeId; label: string; control?: boolean }[] = [
  { from: "holders", to: "FundShare", label: "hold" },
  { from: "FundShare", to: "FundGovernor", label: "votes" },
  { from: "FundGovernor", to: "TimelockController", label: "queues", control: true },
  { from: "TimelockController", to: "FundTreasury", label: "owns", control: true },
  { from: "TimelockController", to: "ArtRegistry", label: "owns", control: true },
  { from: "ArtRegistry", to: "FundTreasury", label: "mints into" },
];

type Box = { l: number; t: number; r: number; b: number; cx: number; cy: number };

// The fund's contracts as a chain of command. Hover, focus or tap a contract to follow its arrows;
// the panel below gives its address, verified source and what it can do.
export function ContractsDiagram({ contracts, holders }: { contracts: DiagramContract[]; holders: { address: string; slot: number }[] }) {
  const ref = useRef<HTMLDivElement>(null);
  const [focus, setFocus] = useState<NodeId | null>(null);
  const [wires, setWires] = useState<{ d: string; lx: number; ly: number; anchor: "start" | "middle" | "end"; w: (typeof WIRES)[number] }[]>([]);
  const byKind = Object.fromEntries(contracts.map((c) => [c.kind, c])) as Record<ContractKind, DiagramContract>;

  // Arrows are drawn between the nodes' real positions, so the grid's layout (a row on wide screens,
  // a column on phones) decides the geometry.
  const draw = useCallback(() => {
    const root = ref.current;
    if (!root) return;
    const o = root.getBoundingClientRect();
    const box = (id: NodeId): Box => {
      const r = root.querySelector(`[data-node="${id}"]`)!.getBoundingClientRect();
      return { l: r.left - o.left, t: r.top - o.top, r: r.right - o.left, b: r.bottom - o.top, cx: (r.left + r.right) / 2 - o.left, cy: (r.top + r.bottom) / 2 - o.top };
    };
    const vertical = getComputedStyle(root).gridTemplateColumns.split(" ").length === 1;
    setWires(
      WIRES.map((w) => {
        const a = box(w.from), b = box(w.to);
        if (vertical) {
          // Registry sits above the treasury on phones, so only "timelock owns treasury" curves past it.
          if (w.from === "TimelockController" && w.to === "FundTreasury")
            return { w, d: `M${a.r} ${a.cy} C${a.r + 18} ${a.cy} ${b.r + 18} ${b.cy} ${b.r} ${b.cy}`, lx: a.r - 8, ly: a.b + 20, anchor: "end" };
          return { w, d: `M${a.cx} ${a.b} L${b.cx} ${b.t}`, lx: a.cx + 10, ly: (a.b + b.t) / 2 + 4, anchor: "start" };
        }
        if (w.to === "ArtRegistry")
          return { w, d: `M${a.cx} ${a.b} C${a.cx} ${a.b + 30} ${b.cx - 40} ${b.t - 30} ${b.cx - 20} ${b.t}`, lx: (a.cx + b.cx) / 2 - 30, ly: (a.b + b.t) / 2, anchor: "middle" };
        if (w.from === "ArtRegistry")
          return { w, d: `M${b.cx + 20} ${a.t} C${b.cx + 20} ${a.t - 25} ${b.cx} ${b.b + 25} ${b.cx} ${b.b}`, lx: b.cx + 6, ly: (a.t + b.b) / 2 + 4, anchor: "end" };
        return { w, d: `M${a.r} ${a.cy} L${b.l} ${b.cy}`, lx: (a.r + b.l) / 2, ly: a.cy - 9, anchor: "middle" };
      }),
    );
  }, []);

  useLayoutEffect(() => {
    draw();
    const ro = new ResizeObserver(draw);
    if (ref.current) ro.observe(ref.current);
    return () => ro.disconnect();
  }, [draw]);

  const near = new Set(WIRES.filter((w) => w.from === focus || w.to === focus).flatMap((w) => [w.from, w.to]));
  const nodeProps = (id: NodeId) => ({
    "data-node": id,
    className: `cmd-node cmd-${id}${focus === id ? " on" : ""}${near.has(id) ? " near" : ""}`,
    onPointerEnter: () => setFocus(id),
    onFocus: () => setFocus(id),
    onClick: () => setFocus(id),
    type: "button" as const,
  });
  const selected = focus && focus !== "holders" ? byKind[focus] : null;

  return (
    <div className="cmd-wrap">
      <div ref={ref} className="cmd" data-focus={focus ?? undefined} onPointerLeave={() => setFocus(null)}>
        <svg className="cmd-wires" aria-hidden="true">
          <defs>
            <marker id="cmd-arrow" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse">
              <path d="M0 0 10 5 0 10z" fill="context-stroke" />
            </marker>
          </defs>
          {wires.map(({ w, d, lx, ly, anchor }) => {
            const on = focus !== null && (w.from === focus || w.to === focus);
            return (
              <g key={`${w.from}-${w.to}`} className={`cmd-wire${w.control ? " control" : ""}${on ? " on" : ""}`}>
                <path d={d} markerEnd="url(#cmd-arrow)" />
                <text x={lx} y={ly} textAnchor={anchor}>
                  {w.label}
                </text>
              </g>
            );
          })}
        </svg>
        <button {...nodeProps("holders")} aria-label={`Shareholders: ${holders.length} stakeholders`}>
          <span className="cmd-icon cmd-avatars">
            {holders.map((h) => (
              <Blockie key={h.address} address={h.address} slot={h.slot} size={20} />
            ))}
          </span>
          <b>Shareholders</b>
          <span className="cmd-role">{holders.length} stakeholders</span>
        </button>
        {contracts.map((c) => (
          <button key={c.kind} {...nodeProps(c.kind)}>
            <span className="cmd-icon">
              <ContractGlyph kind={c.kind} />
            </span>
            {/* Lets "TimelockController" break between its words, not mid-word. */}
            <b>{c.kind.replace(/([a-z])([A-Z])/g, "$1​$2")}</b>
            <span className="cmd-role">{c.role}</span>
          </button>
        ))}
      </div>
      <div className="cmd-detail" aria-live="polite">
        {selected ? (
          <>
            <p>
              <b>{selected.kind}</b> ·{" "}
              <a href={etherscanCode(selected.address)} target="_blank" rel="noreferrer">
                verified source
              </a>
            </p>
            <code className="hash">{selected.address}</code>
            <p className="muted">{selected.can}</p>
          </>
        ) : focus === "holders" ? (
          <p className="muted">
            The people who subscribed. They hold FundShare and delegate it to vote; holding and delegating are the only
            arrows they start.
          </p>
        ) : (
          <p className="muted">
            Hover or tap a contract to follow its arrows. Arrows in ink are control (ownership and roles); light ones are
            flows.
          </p>
        )}
      </div>
    </div>
  );
}
