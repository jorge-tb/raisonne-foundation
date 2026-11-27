"use client";

import { useLayoutEffect, useRef, ViewTransition, type CSSProperties, type KeyboardEvent } from "react";
import { holderColor } from "@/lib/holders";
import { Blockie } from "./Blockie";
import { useHolders } from "./HoldersProvider";
import { arcPath, CX, CY, layout, polar, R, segmentPath, TAU, TOP, VIEWBOX, W } from "./ring";

const pct = (fraction: number) => `${(Math.floor(fraction * 10000) / 100).toFixed(2)}%`;
const SEEN = "raisonne:holders-revealed";

// Voting power by holder, with the quorum marked. Hover, focus or tap a holder to isolate it (every
// mark of that holder on the page lights up); click holders to build a coalition and see whether
// together they reach quorum. Keyboard: arrows move between holders, Enter adds one.
export function HoldersDonut() {
  const ctx = useHolders();
  const svgRef = useRef<SVGSVGElement>(null);
  const segRefs = useRef<(SVGGElement | null)[]>([]);

  // The reveal is a CSS sweep that runs from the first paint, so the ring is never empty at rest.
  // It plays once per session, and not after an in-app navigation (the emblem morph brings the ring).
  useLayoutEffect(() => {
    const svg = svgRef.current;
    if (!svg) return;
    let seen = document.documentElement.dataset.navigated === "1";
    try {
      seen ||= sessionStorage.getItem(SEEN) === "1";
      sessionStorage.setItem(SEEN, "1");
    } catch {}
    if (seen) svg.classList.remove("reveal");
  }, []);

  if (!ctx) return null;
  const { holders, quorum, voting, focus, setFocus, picked, toggle, clear } = ctx;
  const voters = holders.filter((h) => h.votesFraction > 0);
  const parts = layout(voters.map((h) => ({ ...h, fraction: h.votesFraction })));
  const rest = layout([{ fraction: voting }, { fraction: 1 - voting }])[1];
  const coalition = holders.filter((h) => picked.has(h.address.toLowerCase()));
  const coalitionVotes = coalition.reduce((s, h) => s + h.votesFraction, 0);
  const passes = coalition.length > 0 && coalitionVotes >= quorum;
  const focused = holders.find((h) => h.address.toLowerCase() === focus);
  const qa = TOP + quorum * TAU;
  const [qx0, qy0] = polar(qa, R - W - 6), [qx1, qy1] = polar(qa, R + 30), [qtx, qty] = polar(qa, R + 46);

  const onKey = (e: KeyboardEvent, i: number) => {
    const step = e.key === "ArrowRight" || e.key === "ArrowDown" ? 1 : e.key === "ArrowLeft" || e.key === "ArrowUp" ? -1 : 0;
    if (step) {
      e.preventDefault();
      segRefs.current[(i + step + parts.length) % parts.length]?.focus();
    } else if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      toggle(parts[i].address);
    }
  };

  return (
    <div className="holders-donut">
      <div className="holders-ring">
        <ViewTransition name="holders-ring" share="morph" default="none">
          <svg
            ref={svgRef}
            className="reveal"
            viewBox={VIEWBOX}
            role="group"
            aria-label={`Voting power by shareholder, quorum at ${pct(quorum)} of shares. Arrow keys move between holders; Enter adds one to a coalition.`}
          >
            <defs>
              <mask id="holders-sweep">
                <circle className="sweep" cx={CX} cy={CY} r={R - W / 2 + 12} pathLength={1} />
              </mask>
              <pattern id="holders-hatch" width="6" height="6" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
                <rect width="6" height="6" style={{ fill: "var(--rule)" }} />
                <rect width="2" height="6" style={{ fill: "var(--surface)" }} />
              </pattern>
            </defs>
            <circle className="coalition-track" cx={CX} cy={CY} r={R + 22} />
            <g mask="url(#holders-sweep)">
              {parts.map((h, i) => {
                const mid = (h.a0 + h.a1) / 2;
                const on = focus === h.address.toLowerCase();
                return (
                  <g
                    key={h.address}
                    ref={(el) => {
                      segRefs.current[i] = el;
                    }}
                    className={`ring-seg${on ? " on" : ""}${picked.has(h.address.toLowerCase()) ? " picked" : ""}`}
                    style={{ "--dx": `${(Math.cos(mid) * 8).toFixed(1)}px`, "--dy": `${(Math.sin(mid) * 8).toFixed(1)}px` } as CSSProperties}
                    tabIndex={i === 0 ? 0 : -1}
                    role="button"
                    aria-pressed={picked.has(h.address.toLowerCase())}
                    aria-label={`${h.address}: ${pct(h.votesFraction)} of the votes`}
                    onPointerEnter={() => setFocus(h.address)}
                    onPointerLeave={() => setFocus(null)}
                    onFocus={() => setFocus(h.address)}
                    onBlur={() => setFocus(null)}
                    onClick={() => toggle(h.address)}
                    onKeyDown={(e) => onKey(e, i)}
                  >
                    {/* The pointer target stays put while the visible segment lifts out; otherwise lifting it
                        away from a pointer on its edge would end the hover, drop it back, and loop. */}
                    <path className="hit" d={segmentPath(h.a0, h.a1, R - W, R + 10)} />
                    <path className="fill" d={segmentPath(h.a0, h.a1)} style={{ fill: holderColor(h.slot) }} />
                    <path className="outline" d={segmentPath(h.a0 + 0.015, h.a1 - 0.015, R - W - 5, R + 5)} />
                  </g>
                );
              })}
              {voting < 0.9999 && <path d={segmentPath(rest.a0, rest.a1)} style={{ fill: "url(#holders-hatch)" }} />}
            </g>
            <g className="ring-avatars" aria-hidden="true">
              {parts.map((h) => {
                const [x, y] = polar((h.a0 + h.a1) / 2, R + 24);
                return (
                  <g key={h.address} className={focus === h.address.toLowerCase() ? "on" : undefined}>
                    <Blockie address={h.address} slot={h.slot} size={26} x={x - 13} y={y - 13} />
                  </g>
                );
              })}
            </g>
            {coalition.length > 0 && (
              <path className={`coalition${passes ? " passes" : ""}`} d={arcPath(TOP, TOP + Math.min(coalitionVotes, 0.9999) * TAU, R + 22)} />
            )}
            <g className={`quorum${passes ? " passes" : ""}`}>
              <line x1={qx0} y1={qy0} x2={qx1} y2={qy1} />
              <text x={qtx} y={qty + 4} textAnchor="middle">
                {Math.round(quorum * 100)}%
              </text>
            </g>
          </svg>
        </ViewTransition>
        <div className="ring-center" aria-live="polite">
          {coalition.length > 0 ? (
            <>
              <b>{pct(coalitionVotes)}</b>
              <span>
                {coalition.length} holder{coalition.length > 1 ? "s" : ""} together
              </span>
              <span className={passes ? "passes" : undefined}>{passes ? "reach quorum" : `${pct(quorum - coalitionVotes)} short of quorum`}</span>
            </>
          ) : focused ? (
            <>
              <b>{pct(focused.votesFraction)}</b>
              <span>of the votes</span>
              <span>{focused.sharePct} of shares</span>
            </>
          ) : (
            <>
              <b>{pct(voting)}</b>
              <span>of shares can vote</span>
            </>
          )}
        </div>
      </div>

      <div className="ring-legend">
        {holders.map((h) => (
          <button
            key={h.address}
            type="button"
            className={`ring-row${focus === h.address.toLowerCase() ? " on" : ""}`}
            style={{ "--c": holderColor(h.slot) } as CSSProperties}
            aria-pressed={picked.has(h.address.toLowerCase())}
            onPointerEnter={() => setFocus(h.address)}
            onPointerLeave={() => setFocus(null)}
            onFocus={() => setFocus(h.address)}
            onBlur={() => setFocus(null)}
            onClick={() => toggle(h.address)}
          >
            <Blockie address={h.address} slot={h.slot} size={28} />
            <span className="ring-row-who">
              <code className="hash">{h.address}</code>
              {/* Voting power as a share of all shares (on the right); the amount is in the holder's card, in FS. */}
              <span className="muted small">{h.votesFraction > 0 ? "Can vote" : "Not delegated: no votes"}</span>
            </span>
            <span className="ring-row-pct">{pct(h.votesFraction)}</span>
          </button>
        ))}
        <p className="muted small">
          {picked.size > 0 ? (
            <button type="button" className="link-button" onClick={clear}>
              Clear the coalition
            </button>
          ) : (
            <>Select holders to see whether together they reach quorum.</>
          )}
        </p>
      </div>
    </div>
  );
}
