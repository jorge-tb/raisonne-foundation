"use client";

import Image from "next/image";
import Link from "next/link";
import { useCallback, useEffect, useLayoutEffect, useRef, useState, type CSSProperties } from "react";
import { CollectionIcon } from "@/components/icons";
import { advance, GAP, layout, loopStart, loopStates, perRow, stacked, visibleFor, type LoopState, type WallWork } from "@/lib/collectionWall";

// The home page's Collection door: the featured work ("On view") as tall as two justified rows of the
// others, moving one place along a closed loop every 12 seconds. Layout rules:
// - what's about the painting moves with it (its label); what's about the door stays put (count and
//   controls in the header, the link on the bottom edge), and the door never changes height;
// - nothing is cropped; works are sized from their own proportions;
// - motion: one gesture under 2 s, then stillness. Pause button; holds on hover, keyboard focus and in a
//   hidden tab; with reduced motion the works crossfade instead of gliding.

// 12 s: a 45 s visit sees 3–4 works featured; each step is ~2 s of motion, then ~10 s to look.
const STEP_MS = 12_000;
const ASSUMED_INNER = 900; // server render, before the door's width is known
// One image request per work wherever it sits (featured or wall): when a work moves into the featured
// spot its picture is already in the browser cache, so it never shows a stale or loading frame.
const SIZES = "(max-width: 40rem) 90vw, 30rem";

type Props = { order: WallWork[]; count: string; initialStep?: number; autoplay?: boolean };

export function CollectionWall({ order, count, initialStep = 0, autoplay = true }: Props) {
  const rootRef = useRef<HTMLElement>(null);
  const artRef = useRef<HTMLDivElement>(null);
  const [inner, setInner] = useState<number | null>(null);
  const width = inner ?? ASSUMED_INNER;
  const n = perRow(width);
  // Phones: one plain queue ("Up next"), every work in line, no corner exchange: the first in the strip
  // becomes featured and everyone moves one place left. Desktop keeps the two-row loop.
  const isPhone = inner !== null && stacked(inner);
  const visible = isPhone ? order.length : visibleFor(width, order.length);

  const [loop, setLoop] = useState<LoopState>(() => startAt(order, visibleFor(ASSUMED_INNER, order.length), perRow(ASSUMED_INNER), initialStep));
  const [step, setStep] = useState(0);
  const [paused, setPaused] = useState(false);
  const [hover, setHover] = useState(false);
  const [focus, setFocus] = useState(false);
  const [hidden, setHidden] = useState(false);
  const held = paused || hover || focus || hidden || !autoplay;
  const [reserve, setReserve] = useState<{ inner: number; max: number; labels: Map<string, number> } | null>(null);

  // The door's content width decides everything else.
  useLayoutEffect(() => {
    const el = artRef.current;
    if (!el) return;
    // Not rounded: the phone layout switch must agree exactly with the CSS container query (width < 572px).
    const ro = new ResizeObserver(([e]) => setInner(e.contentRect.width));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  // A different number of spots (window resized across a breakpoint): restart the loop at the same step.
  const shape = `${visible}/${n}`;
  const shapeRef = useRef(shape);
  useEffect(() => {
    if (shapeRef.current === shape) return;
    shapeRef.current = shape;
    setLoop(startAt(order, visible, n, initialStep));
  }, [shape, order, visible, n, initialStep]);

  // Reserve the tallest art + label of the whole loop, measured with the real fonts, so the door keeps one height.
  useEffect(() => {
    if (inner === null || stacked(inner)) return;
    let cancelled = false;
    const measure = () => {
      if (cancelled || !rootRef.current) return;
      const probe = document.createElement("div");
      probe.className = "cw-label-probe";
      rootRef.current.appendChild(probe);
      let max = 0;
      const labels = new Map<string, number>();
      for (const s of loopStates(order, visible, n)) {
        const l = layout(s.ring, inner);
        probe.style.width = `${labelWidth(l.heroWidth, inner)}px`;
        probe.innerHTML = labelHTML(s.ring[0]);
        const h = probe.getBoundingClientRect().height;
        labels.set(s.ring[0].id, h);
        max = Math.max(max, l.artHeight + GAP + h);
      }
      probe.remove();
      setReserve({ inner, max, labels });
    };
    if (document.fonts) document.fonts.ready.then(measure);
    else measure();
    return () => void (cancelled = true);
  }, [inner, order, visible, n]);

  useEffect(() => {
    const onVis = () => setHidden(document.hidden);
    document.addEventListener("visibilitychange", onVis);
    return () => document.removeEventListener("visibilitychange", onVis);
  }, []);

  // ---- One step, animated FLIP-style with the Web Animations API (always ends at the final state) ----
  const before = useRef<{ rects: Map<string, DOMRect>; wall: DOMRect; featured: string; phone: boolean; leaving: HTMLElement | null } | null>(null);
  const doStep = useCallback(() => {
    const root = rootRef.current;
    if (!root) return;
    const rects = new Map<string, DOMRect>();
    root.querySelectorAll<HTMLElement>("[data-work]").forEach((el) => rects.set(el.dataset.work!, el.getBoundingClientRect()));
    // What visibly leaves: on desktop the work exchanged at the corner; on phones the featured work,
    // which fades where it stands instead of travelling to the (hidden) end of the queue.
    const leavingId = isPhone ? loop.ring[0].id : loop.waiting.length && loop.ring.length > n + 1 ? loop.ring[n + 1].id : null;
    const leavingEl = leavingId ? root.querySelector<HTMLElement>(`[data-work="${leavingId}"]`) : null;
    before.current = {
      rects,
      wall: root.querySelector(".cw-wall")!.getBoundingClientRect(),
      featured: loop.ring[0].id,
      phone: isPhone,
      leaving: leavingEl ? ghostOf(leavingEl, root) : null,
    };
    setLoop((s) => advance(s, n));
    setStep((k) => k + 1);
  }, [loop, n, isPhone]);

  useLayoutEffect(() => {
    const root = rootRef.current, prev = before.current;
    if (!root || !prev) return;
    before.current = null;
    const glide = !matchMedia("(prefers-reduced-motion: reduce)").matches;
    const pieces = [...root.querySelectorAll<HTMLElement>("[data-work]")];
    const last = Math.max(...pieces.map((p) => Number(p.dataset.path)));
    const glideFrom = (el: HTMLElement, a: DOMRect, b: DOMRect, duration: number, delay: number) =>
      el.animate(
        [{ transform: `translate(${a.left - b.left}px, ${a.top - b.top}px) scale(${a.width / b.width})`, transformOrigin: "0 0" }, { transform: "none", transformOrigin: "0 0" }],
        { duration, delay, easing: "cubic-bezier(0.3, 0.7, 0.2, 1)", fill: "backwards" },
      );
    if (prev.phone) {
      // Phones: the next work grows into the featured square; the strip slides one place left; works
      // coming into view enter from the right edge, the way the queue flows.
      const wall = root.querySelector(".cw-wall")!.getBoundingClientRect();
      const within = (r: DOMRect, box: DOMRect) => r.width > 0 && r.top >= box.top - 1 && r.bottom <= box.bottom + 1 && r.right <= box.right + 1;
      for (const el of pieces) {
        const a = prev.rects.get(el.dataset.work!), b = el.getBoundingClientRect(), path = Number(el.dataset.path);
        if (!within(b, wall) && path !== 0) continue; // out of view: nothing to show
        if (!glide) el.animate([{ opacity: 0 }, { opacity: 1 }], { duration: 600, fill: "backwards" });
        else if (path === 0 && a) glideFrom(el, a, b, 1000, 150);
        else if (el.dataset.work === prev.featured) el.animate([{ opacity: 0 }, { opacity: 1 }], { duration: 600, delay: 900, fill: "backwards" });
        else if (a && within(a, prev.wall)) glideFrom(el, a, b, 700, 250 + (path - 1) * 90);
        else el.animate([{ transform: "translateX(40px)", opacity: 0 }, { transform: "none", opacity: 1 }], { duration: 650, delay: 350 + (path - 1) * 90, easing: "cubic-bezier(0.3, 0.7, 0.2, 1)", fill: "backwards" });
      }
    }
    for (const el of prev.phone ? [] : pieces) {
      const a = prev.rects.get(el.dataset.work!), b = el.getBoundingClientRect(), path = Number(el.dataset.path);
      if (!a || !glide || !b.width) {
        el.animate([{ opacity: 0 }, { opacity: 1 }], { duration: 700, delay: glide ? 800 : 0, easing: "ease", fill: "backwards" });
        continue;
      }
      // Featured ↔ next is the main gesture; the rows follow one after another along the loop.
      const main = path === 0 || path === last;
      const delay = main ? 0 : 250 + Math.min(path - 1, last - path) * 90;
      el.animate(
        [{ transform: `translate(${a.left - b.left}px, ${a.top - b.top}px) scale(${a.width / b.width})`, transformOrigin: "0 0" }, { transform: "none", transformOrigin: "0 0" }],
        { duration: main ? 1100 : 750, delay, easing: "cubic-bezier(0.3, 0.7, 0.2, 1)", fill: "backwards" },
      );
    }
    root.querySelectorAll(".cw-label .cw-title, .cw-label .cw-by").forEach((el) =>
      el.animate([{ opacity: 0 }, { opacity: 1 }], { duration: 500, delay: glide ? 1000 : 0, fill: "backwards" }),
    );
    const ghost = prev.leaving;
    if (ghost) ghost.animate([{ opacity: 1 }, { opacity: 0 }], { duration: 600, delay: 300, fill: "forwards" }).finished.finally(() => ghost.remove());
  }, [step]);

  // ---- Timer: one step every STEP_MS, paused and resumed without losing its place ----
  // Only an interrupted wait (pause, hover, focus, hidden tab) keeps its remaining time; a wait that ran
  // out starts the next wait fresh. (Subtracting after it fired left 0 ms and stepped twice.)
  const remaining = useRef(STEP_MS);
  const stepRef = useRef(doStep);
  useEffect(() => {
    stepRef.current = doStep;
  }, [doStep]);
  useEffect(() => {
    if (held) return;
    const start = performance.now();
    let fired = false;
    const t = setTimeout(() => {
      fired = true;
      remaining.current = STEP_MS;
      stepRef.current();
    }, remaining.current);
    return () => {
      clearTimeout(t);
      if (!fired) remaining.current = Math.max(0, remaining.current - (performance.now() - start));
    };
  }, [held, step]);

  // ---- Render ----
  const ring = loop.ring.slice(0, visible);
  const l = layout(ring, width);
  const isStacked = inner !== null && stacked(inner); // only for the spare space; CSS does the layout
  const featured = ring[0];
  const fresh = reserve && reserve.inner === inner ? reserve : null; // measured at this width
  const labelH = fresh?.labels.get(featured.id);
  const slack = !isStacked && fresh && labelH !== undefined ? Math.max(0, fresh.max - (l.artHeight + GAP + labelH)) : 0;
  const style = { "--cw-hero": `${(l.heroWidth / width) * 100}%`, "--cw-r": featured.ratio } as CSSProperties;

  return (
    <section
      ref={rootRef}
      className="door door-collection cw"
      style={style}
      aria-labelledby="cw-title"
      onPointerEnter={() => setHover(true)}
      onPointerLeave={() => setHover(false)}
      onFocus={() => setFocus(true)}
      onBlur={(e) => !e.currentTarget.contains(e.relatedTarget) && setFocus(false)}
    >
      <div className="cw-top">
        <h2 className="door-head" id="cw-title">
          <CollectionIcon />
          Collection
          <span className="cw-count">{count}</span>
        </h2>
        {autoplay && (
          <span className="cw-controls">
            <span className="cw-progress" aria-hidden="true">
              <i key={step} style={{ animationDuration: `${STEP_MS}ms`, animationPlayState: held ? "paused" : "running" }} />
            </span>
            <button type="button" className="cw-pause" aria-pressed={paused} onClick={() => setPaused((p) => !p)}>
              {paused ? "Resume" : "Pause"}
            </button>
          </span>
        )}
      </div>

      {/* One markup for both layouts; CSS picks side by side or stacked from the door's own width. */}
      <div className="cw-art" ref={artRef}>
        {/* Keyed by the work: a fresh element per featured work, never another work's picture. */}
        <Link key={featured.id} href={`/collection/${featured.id}`} className="cw-piece cw-hero" data-work={featured.id} data-path={0} style={{ aspectRatio: featured.ratio }}>
          <Image src={featured.src} alt={featured.name} fill sizes={SIZES} />
        </Link>
        {/* Only one of the two label copies is ever displayed; the other is display: none (also for screen readers). */}
        <div className="cw-label-hero">
          <Label work={featured} />
        </div>
        <div className="cw-wall">
          <span className="cw-kicker cw-upnext">Up next</span>
          {(isPhone ? [ring.slice(1), []] : l.rows).map((row, ri) => (
            <div className="cw-row" key={ri}>
              {row.map((w, c) => {
                const path = isPhone ? 1 + c : ri === 0 ? 1 + c : 2 * l.n - c;
                return (
                  <Link
                    key={w.id}
                    href={`/collection/${w.id}`}
                    className="cw-piece"
                    data-work={w.id}
                    data-path={path}
                    style={{ "--cw-grow": w.ratio, "--cw-path": path, aspectRatio: w.ratio } as CSSProperties}
                    aria-label={`${w.name}, ${w.by}`}
                  >
                    <Image src={w.src} alt="" fill sizes={SIZES} />
                  </Link>
                );
              })}
            </div>
          ))}
        </div>
      </div>
      {/* The next work to enter at the corner, loaded ahead so it never arrives blank. */}
      {loop.waiting[0] && (
        <span className="cw-preload" aria-hidden="true">
          <Image key={loop.waiting[0].id} src={loop.waiting[0].src} alt="" fill sizes={SIZES} loading="eager" />
        </span>
      )}
      <div className="cw-label-row" style={{ paddingBottom: slack }}>
        <Label work={featured} />
      </div>
      <Link href="/collection" className="door-go">
        View the collection →
      </Link>
    </section>
  );
}

function Label({ work }: { work: WallWork }) {
  return (
    <span className="cw-label">
      <span className="cw-kicker">On view</span>
      <Link href={`/collection/${work.id}`} className="cw-title">
        {work.name}
      </Link>
      <span className="cw-by">{work.by}</span>
    </span>
  );
}

// Same markup as <Label>, for measuring off-screen.
const esc = (s: string) => s.replace(/[&<>"]/g, (c) => `&#${c.charCodeAt(0)};`);
const labelHTML = (w: WallWork) =>
  `<span class="cw-label"><span class="cw-kicker">On view</span><span class="cw-title">${esc(w.name)}</span><span class="cw-by">${esc(w.by)}</span></span>`;
// The label may run wider than its painting (the space beside it is free): fewer lines.
const labelWidth = (heroWidth: number, inner: number) => Math.min(inner, Math.max(heroWidth, 352));

function startAt(order: WallWork[], visible: number, n: number, steps: number): LoopState {
  let s = loopStart(order, visible);
  for (let k = 0; k < steps; k++) s = advance(s, n);
  return s;
}

function ghostOf(el: HTMLElement, root: HTMLElement): HTMLElement {
  const g = el.cloneNode(true) as HTMLElement;
  const r = el.getBoundingClientRect(), rr = root.getBoundingClientRect();
  g.removeAttribute("data-work");
  g.setAttribute("aria-hidden", "true");
  Object.assign(g.style, { position: "absolute", left: `${r.left - rr.left}px`, top: `${r.top - rr.top}px`, width: `${r.width}px`, height: `${r.height}px`, margin: "0", zIndex: "3", pointerEvents: "none" });
  root.appendChild(g);
  return g;
}
