"use client";

import { useEffect, useRef, useState } from "react";
import type { Choice } from "@/lib/votes";
import { Blockie } from "./holders/Blockie";

// Plain numbers (ETH) so the card crosses the server/client boundary; slot is null for an address
// that isn't a current holder (neutral avatar).
export type VoteView = {
  state: string;
  supply: number | null; // shares that could vote, at the snapshot
  quorum: number | null;
  tally: Record<Choice, number>;
  voters: { address: string; slot: number | null; choice: Choice; weight: number }[];
  absent: { address: string; slot: number | null; power: number | null }[];
};

type Row = { address: string; slot: number | null; choice: Choice | "none"; weight: number; power: number | null };

const LABEL: Record<Row["choice"], string> = { for: "For", against: "Against", abstain: "Abstain", none: "Didn't vote" };
const ORDER: Choice[] = ["for", "against", "abstain"];
const SHOWN = 6;

// Shares are floored so they never overstate; the quorum is a rule, so it is rounded.
const floorPct = (x: number, of: number) => `${(Math.floor((x / of) * 1000 + 1e-9) / 10).toFixed(1)}%`;
const rulePct = (x: number, of: number) => `${(Math.round((x / of) * 1000) / 10).toFixed(1).replace(/\.0$/, "")}%`;
// Voting weight is in FundShare tokens (FS), not ether: one FS was minted for each ETH subscribed.
const fs = (x: number) => `${Number(x.toFixed(6))} FS`;

// How a proposal was voted: a bar of all shares by choice (For, Against, Abstain, didn't vote) with the
// quorum marked, then who voted, on demand. The bar is drawn full (complete at rest); a card that starts
// off-screen is emptied unseen and fills when it scrolls in, and the quorum mark turns solid the moment
// turnout crosses it.
export function ProposalVote({ vote }: { vote: VoteView }) {
  const { supply, quorum, tally } = vote;
  const turnout = tally.for + tally.against + tally.abstain;
  const cast = tally.for + tally.against;
  const barRef = useRef<HTMLDivElement>(null);
  const [open, setOpen] = useState(false);
  const [filter, setFilter] = useState<Row["choice"] | "all">("all");
  const [all, setAll] = useState(false);

  useEffect(() => {
    const bar = barRef.current;
    if (!bar || !supply || !quorum || matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    const segs = ORDER.map((c) => [bar.querySelector<HTMLElement>(`.vote-${c}`)!, tally[c]] as const);
    const mark = bar.querySelector<HTMLElement>(".vote-quorum")!;
    const label = bar.closest(".vote")!.querySelector<HTMLElement>(".vote-turnout-value")!;
    const paint = (k: number) => {
      let left = turnout * k;
      for (const [el, v] of segs) {
        const w = Math.min(v, left);
        left -= w;
        el.style.width = `${(w / supply) * 100}%`;
      }
      label.textContent = floorPct(turnout * k, supply);
      mark.classList.toggle("reached", turnout >= quorum && turnout * k >= quorum);
    };
    let frame = 0;
    const run = () => {
      const start = performance.now();
      const step = (now: number) => {
        const t = Math.min(1, (now - start) / 900);
        paint(1 - (1 - t) ** 3);
        if (t < 1) frame = requestAnimationFrame(step);
      };
      frame = requestAnimationFrame(step);
    };
    let first = true;
    const io = new IntersectionObserver(([e]) => {
      if (first) {
        first = false;
        paint(0);
        if (!e.isIntersecting) return; // emptied unseen; fills when it scrolls in
      } else if (!e.isIntersecting) return;
      io.disconnect();
      run();
    }, { threshold: 0.4 });
    io.observe(bar);
    return () => {
      io.disconnect();
      cancelAnimationFrame(frame);
      paint(1);
    };
  }, [supply, quorum, tally, turnout]);

  if (!supply || !quorum) {
    return <p className="vote-pending muted small">The quorum is fixed at the snapshot, when voting opens.</p>;
  }

  const rows: Row[] = [
    ...vote.voters.map((v) => ({ ...v, power: null })),
    ...vote.absent.map((a) => ({ address: a.address, slot: a.slot, choice: "none" as const, weight: 0, power: a.power })),
  ];
  const counts = { all: rows.length, for: 0, against: 0, abstain: 0, none: 0 };
  rows.forEach((r) => counts[r.choice]++);
  const listed = rows
    .filter((r) => filter === "all" || r.choice === filter)
    .sort((a, b) => Number(a.choice === "none") - Number(b.choice === "none") || b.weight - a.weight || (b.power ?? 0) - (a.power ?? 0));
  const stack = [...vote.voters].sort((a, b) => b.weight - a.weight);
  const reached = turnout >= quorum;
  const noWeight = turnout === 0 && vote.voters.length > 0;

  return (
    <div className="vote">
      <div className="vote-headline">
        {turnout === 0 ? (
          <span className="vote-big">
            {vote.state === "Active" ? "No votes yet" : "No quorum"}
            {noWeight && <small>no vote carried weight</small>}
          </span>
        ) : (
          <span className="vote-big">
            {Math.round((tally.for / (cast || 1)) * 100)}% For
            <small>of votes cast{vote.state === "Active" ? " so far" : ""}</small>
          </span>
        )}
        <span className="vote-turnout">
          Turnout <b className="vote-turnout-value">{floorPct(turnout, supply)}</b> of {rulePct(quorum, supply)} needed
        </span>
      </div>

      <div
        ref={barRef}
        className="vote-track"
        role="img"
        aria-label={`For ${floorPct(tally.for, supply)}, Against ${floorPct(tally.against, supply)}, Abstain ${floorPct(tally.abstain, supply)} of all shares; turnout ${floorPct(turnout, supply)}; quorum ${rulePct(quorum, supply)}${reached ? ", reached" : ", not reached"}.`}
      >
        <div className="vote-fill">
          {ORDER.map((c) => (
            <i key={c} className={`vote-${c}`} style={{ width: `${(tally[c] / supply) * 100}%`, display: tally[c] > 0 ? undefined : "none" }} />
          ))}
        </div>
        <span className={`vote-quorum${reached ? " reached" : ""}`} style={{ left: `${(quorum / supply) * 100}%` }}>
          <span>quorum {rulePct(quorum, supply)}</span>
        </span>
      </div>

      <div className="vote-legend">
        {ORDER.map((c) => (
          <span key={c}>
            <i className={`swatch-${c}`} />
            {LABEL[c]} <b>{floorPct(tally[c], supply)}</b>
          </span>
        ))}
        <span>
          <i className="swatch-none" />
          Didn&apos;t vote <b>{floorPct(supply - turnout, supply)}</b>
        </span>
      </div>

      <div className="vote-voters">
        <span className="vote-stack" aria-hidden="true">
          {stack.slice(0, SHOWN).map((v) => (
            <Blockie key={v.address} address={v.address} slot={v.slot ?? 99} size={26} />
          ))}
          {stack.length > SHOWN && <span className="vote-more">+{stack.length - SHOWN}</span>}
        </span>
        <span className="vote-count">
          <b>{vote.voters.length}</b> {vote.voters.length === 1 ? "vote" : "votes"}
          {vote.absent.length > 0 && <> · {vote.absent.length} {vote.absent.length === 1 ? "holder" : "holders"} didn&apos;t vote</>}
        </span>
        <button type="button" className="vote-toggle" aria-expanded={open} onClick={() => setOpen(!open)}>
          {open ? "Hide voters" : "See voters"}
        </button>
      </div>

      {open && (
        <div className="vote-panel">
          <div className="vote-filters" role="group" aria-label="Filter voters">
            {(["all", "for", "against", "abstain", "none"] as const)
              .filter((k) => k === "all" || counts[k] > 0)
              .map((k) => (
                <button key={k} type="button" aria-pressed={filter === k} onClick={() => (setFilter(k), setAll(false))}>
                  {k === "all" ? "All" : LABEL[k]} {counts[k]}
                </button>
              ))}
          </div>
          <ul className="vote-rows">
            {(all ? listed : listed.slice(0, SHOWN)).map((r) => (
              <li key={r.address}>
                <Blockie address={r.address} slot={r.slot ?? 99} size={24} />
                <code className="hash">{r.address}</code>
                <span className={`vote-choice ${r.choice}`}>{LABEL[r.choice]}</span>
                <span className="vote-weight">
                  {r.choice === "none" ? (
                    r.power === null ? null : <small>{floorPct(r.power, supply)} of the votes at the snapshot</small>
                  ) : (
                    <>
                      {fs(r.weight)}
                      <small>{floorPct(r.weight, supply)} of shares</small>
                    </>
                  )}
                </span>
                {r.choice !== "none" && r.weight === 0 && (
                  <span className="vote-note">Voted with 0 weight: the shares weren&apos;t delegated at the snapshot.</span>
                )}
              </li>
            ))}
          </ul>
          {!all && listed.length > SHOWN && (
            <button type="button" className="link-button" onClick={() => setAll(true)}>
              Show all {listed.length}
            </button>
          )}
        </div>
      )}
    </div>
  );
}
