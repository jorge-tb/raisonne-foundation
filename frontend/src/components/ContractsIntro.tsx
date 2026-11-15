"use client";

import { useCallback, useEffect, useRef, useState, type CSSProperties } from "react";
import { ContractGlyph } from "./ContractGlyph";
import { Blockie } from "./holders/Blockie";

// What the story needs, read from the snapshot by the Contracts page.
export type IntroData = {
  holders: { address: string; slot: number; share: number }[]; // share of supply, 0–1
  supplyEth: string;
  quorum: number; // fraction of supply
  delaySeconds: number;
  acquisition: { title: string; artworks: number };
};

type Layout = "landscape" | "portrait";

// Where everything sits on each stage. Landscape from 560 px, portrait below (a container query in
// globals.css shows one), so text stays near full size on a phone.
const GEOMETRY = {
  landscape: {
    w: 720,
    h: 300,
    avatar: (i: number, n: number) => ({ x: 40, y: 34 + i * Math.min(60, 232 / n), size: 34 }),
    chip: (cy: number) => ({ x: 84, y: cy + 4, anchor: "start" as const, suffix: " · votes" }),
    peopleLabel: { x: 57, y: 292 } as { x: number; y: number } | null,
    card: { x: 250, y: 34, w: 230 },
    tally: { x: 250, y: 126, w: 230 },
    glass: { x: 300, y: 190, tx: 364 },
    vault: { x: 612, y: 92, cx: 648 },
    art: (i: number) => ({ x: 440 - i * 22, y: 52 }),
    final: { x: 160, y: 96, w: 400, h: 108 },
  },
  portrait: {
    w: 360,
    h: 540,
    avatar: (i: number, n: number) => ({ x: 30 + i * (328 / n), y: 18, size: 40 }),
    chip: () => ({ x: NaN, y: 82, anchor: "middle" as const, suffix: "" }),
    peopleLabel: null,
    card: { x: 24, y: 106, w: 312 },
    tally: { x: 24, y: 198, w: 312 },
    glass: { x: 96, y: 262, tx: 160 },
    vault: { x: 144, y: 356, cx: 180 },
    art: (i: number) => ({ x: 300 - i * 22, y: 124 }),
    final: { x: 24, y: 196, w: 312, h: 124 },
  },
};

const clock = (s: number) => `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
const pct = (f: number) => `${(f * 100).toFixed(1)}%`;
const DURATIONS = [2600, 2200, 2200, 3200, 3000, 2800, 2600];

// The stage is drawn in its finished state (the story's last frame before the closing card), so it
// reads complete before any script runs. Playing first hides everything, then reveals step by step.
function Stage({ data, layout }: { data: IntroData; layout: Layout }) {
  const g = GEOMETRY[layout];
  const n = data.holders.length;
  const vault = { x: g.vault.cx, y: g.vault.y + 40 };
  const q = g.tally.x + data.quorum * g.tally.w;
  const segX = data.holders.map((_, i) => g.tally.x + data.holders.slice(0, i).reduce((sum, h) => sum + h.share, 0) * g.tally.w);
  return (
    <svg className={`intro-stage intro-${layout}`} viewBox={`0 0 ${g.w} ${g.h}`} aria-hidden="true">
      <g className="scene">
        {data.holders.map((h, i) => {
          const a = g.avatar(i, n);
          return <Blockie key={h.address} address={h.address} slot={h.slot} size={a.size} x={a.x} y={a.y} />;
        })}
        {g.peopleLabel && (
          <text className="lbl" x={g.peopleLabel.x} y={g.peopleLabel.y} textAnchor="middle">
            shareholders
          </text>
        )}
        <g className="chips">
          {data.holders.map((h, i) => {
            const a = g.avatar(i, n), c = g.chip(a.y + a.size / 2);
            return (
              <text key={h.address} className="lbl ink" x={Number.isNaN(c.x) ? a.x + a.size / 2 : c.x} y={c.y} textAnchor={c.anchor}>
                {pct(h.share)}
                {c.suffix}
              </text>
            );
          })}
        </g>
        {data.holders.map((h, i) => {
          const a = g.avatar(i, n), cx = a.x + a.size / 2, cy = a.y + a.size / 2;
          return (
            <circle key={h.address} className="coin" cx={cx} cy={cy} r="7" opacity="0" data-dx={vault.x - cx} data-dy={vault.y - cy}
              style={{ fill: `var(--holder-${h.slot + 1}, var(--muted))` }} />
          );
        })}
        <g>
          <g className="glyph" transform={`translate(${g.vault.x} ${g.vault.y}) scale(3)`}>
            <ContractGlyph kind="FundTreasury" size={24} />
          </g>
          <text className="lbl" x={g.vault.cx} y={g.vault.y + 94} textAnchor="middle">
            treasury
          </text>
          <text className="bal" x={g.vault.cx} y={g.vault.y + 118} textAnchor="middle">
            {data.supplyEth} ETH
          </text>
          <text className="arts lbl" x={g.vault.cx} y={g.vault.y + 136} textAnchor="middle">
            + {data.acquisition.artworks} artwork{data.acquisition.artworks === 1 ? "" : "s"}
          </text>
        </g>
        <g className="card">
          <rect className="card-box" x={g.card.x} y={g.card.y} width={g.card.w} height="72" rx="2" />
          <g className="glyph" transform={`translate(${g.card.x + 14} ${g.card.y + 13}) scale(0.9)`}>
            <ContractGlyph kind="FundGovernor" size={24} />
          </g>
          <text className="title" x={g.card.x + 42} y={g.card.y + 30}>
            {data.acquisition.title}
          </text>
          <text className="sub lbl" x={g.card.x + 42} y={g.card.y + 52} opacity="0">
            proposal · add a gallery
          </text>
          <text className="enabled lbl accent" x={g.card.x + 42} y={g.card.y + 52}>
            executed · gallery added ✓
          </text>
        </g>
        <g className="tally">
          <rect className="track" x={g.tally.x} y={g.tally.y} width={g.tally.w} height="12" />
          {data.holders.map((h, i) => {
            return (
              <rect key={h.address} className="seg" x={segX[i]} y={g.tally.y} width={Math.max(0, h.share * g.tally.w - 2)} height="12"
                style={{ fill: `var(--holder-${h.slot + 1}, var(--muted))` }} />
            );
          })}
          <line className="qline" x1={q} y1={g.tally.y - 8} x2={q} y2={g.tally.y + 20} />
          <text className="lbl" x={q} y={g.tally.y + 36} textAnchor="middle">
            quorum {Math.round(data.quorum * 100)}%
          </text>
          <text className="passed" x={g.tally.x + g.tally.w} y={g.tally.y + 36} textAnchor="end">
            passed
          </text>
        </g>
        <g className="lock">
          <g className="glyph" transform={`translate(${g.glass.x} ${g.glass.y}) scale(2.2)`}>
            <ContractGlyph kind="TimelockController" size={24} />
          </g>
          <text className="count big" x={g.glass.tx} y={g.glass.y + 36}>
            0:00
          </text>
          <text className="lbl" x={g.glass.tx} y={g.glass.y + 56}>
            timelock
          </text>
        </g>
        {[0, 1].map((i) => {
          const a = g.art(i);
          return <rect key={i} className="art" x={a.x} y={a.y} width="18" height="18" rx="1" opacity="0" data-dx={vault.x - 9 - a.x} data-dy={vault.y - 12 - a.y} />;
        })}
      </g>
      <g className="final" opacity="0">
        <rect className="final-box" x={g.final.x} y={g.final.y} width={g.final.w} height={g.final.h} rx="2" />
        <text className="big" x={g.w / 2} y={g.final.y + g.final.h * 0.4} textAnchor="middle">
          No step can be skipped,
        </text>
        <text className="final-sub" x={g.w / 2} y={g.final.y + g.final.h * 0.4 + 28} textAnchor="middle" style={{ fontSize: g.w < 400 ? 14 : 16 } as CSSProperties}>
          not even by the people who built it.
        </text>
        <text className="lbl accent" x={g.w / 2} y={g.final.y + g.final.h * 0.4 + 50} textAnchor="middle">
          see how it is wired ↓
        </text>
      </g>
    </svg>
  );
}

// A decision, start to finish: seven short steps the visitor starts (never on its own), with back,
// next and a step bar. Reduced motion turns it into a slideshow. Opened with /contracts#intro (the
// home page's Watch button), it starts playing, since that click asked for it.
export function ContractsIntro({ data }: { data: IntroData }) {
  const rootRef = useRef<HTMLDivElement>(null);
  const [step, setStep] = useState(-1);
  const [playing, setPlaying] = useState(false);
  const countdown = useRef<ReturnType<typeof setInterval>>(undefined);

  const captions = [
    `${data.holders.length} shareholders pooled ${data.supplyEth} ETH into the fund's treasury.`,
    "Each share is a vote, once its holder delegates it to themselves or someone else.",
    `Any holder can propose. Here, ${data.acquisition.title}: add a gallery of artworks.`,
    `Holders vote. At least ${Math.round(data.quorum * 100)}% of all shares must take part, and the majority must agree.`,
    "A passed proposal waits in the timelock. Nothing can run before the delay ends.",
    "Then anyone can carry it out: the gallery is added and its artworks are minted into the treasury.",
    "That is the only way money or artworks move. Below: the contracts that enforce it.",
  ];

  // The stage currently on screen (the other one is hidden by the container query).
  const stage = () => [...(rootRef.current?.querySelectorAll<SVGSVGElement>(".intro-stage") ?? [])].find((s) => s.getBoundingClientRect().width > 0);

  const run = useCallback(
    (svg: SVGSVGElement, i: number, motion: boolean) => {
      const q = <T extends Element>(sel: string) => svg.querySelector<T>(sel)!;
      const all = (sel: string) => [...svg.querySelectorAll<SVGElement>(sel)];
      const anim = (el: Element, frames: Keyframe[], duration: number, delay = 0) =>
        el.animate(frames, { duration: motion ? duration : 0, delay: motion ? delay : 0, easing: "cubic-bezier(0.2, 0.7, 0.2, 1)", fill: "forwards" });
      const show = (el: Element, delay = 0) => anim(el, [{ opacity: 0 }, { opacity: 1 }], 450, delay);
      const fly = (el: SVGElement, duration: number, delay: number) =>
        anim(el, [{ opacity: 0, transform: "translate(0,0)" }, { opacity: 1, offset: 0.15 }, { opacity: 1, offset: 0.85 }, { opacity: 0, transform: `translate(${el.dataset.dx}px,${el.dataset.dy}px)` }], duration, delay);
      switch (i) {
        case 0:
          all(".coin").forEach((c, k) => fly(c, 1500, k * 220));
          show(q(".bal"), 1700);
          break;
        case 1:
          show(q(".chips"));
          break;
        case 2:
          anim(q(".card"), [{ opacity: 0, transform: "translateY(10px)" }, { opacity: 1, transform: "none" }], 600);
          break;
        case 3:
          show(q(".tally"));
          all(".seg").forEach((r, k) => anim(r, [{ transform: "scaleX(0)" }, { transform: "scaleX(1)" }], 650, 300 + k * 450));
          anim(q(".qline"), [{ stroke: "var(--foreground)", strokeDasharray: "3 2" }, { stroke: "var(--accent)", strokeDasharray: "none" }], 200, 1100);
          show(q(".passed"), 2300);
          break;
        case 4: {
          show(q(".lock"));
          const el = q<SVGTextElement>(".count");
          clearInterval(countdown.current);
          if (!motion) {
            el.textContent = clock(0);
            break;
          }
          let t = data.delaySeconds;
          const tick = Math.max(1, Math.round(data.delaySeconds / 25));
          el.textContent = clock(t);
          countdown.current = setInterval(() => {
            t = Math.max(0, t - tick);
            el.textContent = clock(t);
            if (!t) clearInterval(countdown.current);
          }, 90);
          break;
        }
        case 5:
          anim(q(".sub"), [{ opacity: 1 }, { opacity: 0 }], 250);
          show(q(".enabled"), 250);
          all(".art").forEach((r, k) => fly(r, 1300, 300 + k * 300));
          show(q(".arts"), 1700);
          break;
        case 6:
          anim(q(".scene"), [{ opacity: 1 }, { opacity: 0.12 }], 500);
          anim(q(".final"), [{ opacity: 0, transform: "scale(0.97)" }, { opacity: 1, transform: "none" }], 500);
          break;
      }
    },
    [data.delaySeconds],
  );

  // Back to the very beginning: every later element hidden (held by zero-length animations, so the
  // server's finished drawing stays the no-script fallback).
  const hideAll = useCallback((svg: SVGSVGElement) => {
    clearInterval(countdown.current);
    svg.getAnimations({ subtree: true }).forEach((a) => a.cancel());
    const hold = (sel: string, frame: Keyframe) => svg.querySelectorAll(sel).forEach((el) => el.animate([frame, frame], { duration: 0, fill: "forwards" }));
    [".chips", ".bal", ".arts", ".card", ".tally", ".passed", ".lock", ".enabled"].forEach((s) => hold(s, { opacity: 0 }));
    hold(".seg", { transform: "scaleX(0)" });
    hold(".qline", { stroke: "var(--foreground)", strokeDasharray: "3 2" });
    hold(".sub", { opacity: 1 });
    svg.querySelector(".count")!.textContent = clock(data.delaySeconds);
  }, [data.delaySeconds]);

  const goTo = useCallback(
    (i: number, animate: boolean) => {
      const svg = stage();
      if (!svg) return;
      hideAll(svg);
      for (let k = 0; k < i; k++) run(svg, k, false);
      run(svg, i, animate && !matchMedia("(prefers-reduced-motion: reduce)").matches);
      setStep(i);
    },
    [hideAll, run],
  );

  const last = captions.length - 1;
  const play = useCallback(() => {
    setPlaying(true);
    if (step < 0 || step >= last) goTo(0, true);
  }, [goTo, last, step]);
  const jump = (i: number) => {
    setPlaying(false);
    goTo(i, true);
  };

  // While playing, each step waits for its animation plus a reading pause, then moves on.
  useEffect(() => {
    if (!playing || step < 0) return;
    const pause = matchMedia("(prefers-reduced-motion: reduce)").matches ? 1800 : 900;
    const t = setTimeout(() => {
      goTo(step + 1, true);
      if (step + 1 >= last) setPlaying(false);
    }, DURATIONS[step] + pause);
    return () => clearTimeout(t);
  }, [playing, step, goTo, last]);

  // Switching layout (rotating a phone, resizing): back to the resting drawing.
  useEffect(() => {
    const root = rootRef.current;
    if (!root) return;
    let shown = stage();
    const ro = new ResizeObserver(() => {
      const now = stage();
      if (now === shown) return;
      shown = now;
      root.querySelectorAll<SVGSVGElement>(".intro-stage").forEach((s) => {
        s.getAnimations({ subtree: true }).forEach((a) => a.cancel());
        s.querySelector(".count")!.textContent = clock(0);
      });
      setPlaying(false);
      setStep(-1);
    });
    ro.observe(root);
    return () => {
      ro.disconnect();
      clearInterval(countdown.current);
    };
  }, []);

  // Opened from the home page's Watch button (/contracts#intro): that click asked for it, so it plays.
  const autoplayed = useRef(false);
  useEffect(() => {
    if (autoplayed.current || location.hash !== "#intro") return;
    autoplayed.current = true;
    const frame = requestAnimationFrame(() => {
      rootRef.current?.scrollIntoView({ block: "start" });
      play();
    });
    return () => cancelAnimationFrame(frame);
  }, [play]);

  const label = playing ? "❚❚ Pause" : step >= last ? "↺ Replay" : step < 0 ? "▶ Play" : "▶ Resume";

  return (
    <div className="intro" ref={rootRef}>
      <div className="intro-stages">
        <Stage data={data} layout="landscape" />
        <Stage data={data} layout="portrait" />
      </div>
      <p className="intro-caption" aria-live="polite">
        {step < 0 ? (
          <>
            <small>7 steps · about 20 seconds</small>
            How a decision moves through the fund, from the founding round to {data.acquisition.title}.
          </>
        ) : (
          <>
            <small>
              Step {step + 1} of {captions.length}
            </small>
            {captions[step]}
          </>
        )}
      </p>
      <div className="intro-controls">
        <button type="button" className="intro-play" onClick={() => (playing ? setPlaying(false) : play())}>
          {label}
        </button>
        <button type="button" aria-label="Previous step" onClick={() => jump(Math.max(0, step - 1))}>
          ←
        </button>
        <button type="button" aria-label="Next step" onClick={() => jump(Math.min(last, step + 1))}>
          →
        </button>
        <div className="intro-dots" role="group" aria-label="Steps">
          {captions.map((_, i) => (
            <button
              key={i}
              type="button"
              aria-label={`Step ${i + 1}`}
              aria-current={i === step ? "step" : undefined}
              className={step >= 0 && i < step ? "done" : undefined}
              onClick={() => jump(i)}
            />
          ))}
        </div>
        <a className="intro-skip" href="#chain-of-command" onClick={() => setPlaying(false)}>
          Skip to the diagram ↓
        </a>
      </div>
    </div>
  );
}
