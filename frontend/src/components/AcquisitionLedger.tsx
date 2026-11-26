"use client";

import Image from "next/image";
import Link from "next/link";
import { useLayoutEffect, useRef, useState } from "react";
import { HexText } from "@/components/ui";

// The Acquisitions page: one ledger per year, a node per acquisition on the year's spine, its works
// hung in one row. Built on the server (app/acquisitions/page.tsx); this component only filters,
// folds years and counts the works that don't fit.

export type LedgerWork = { tokenId: string; name: string | null; src: string | null; ratio: number; minted: boolean };

export type LedgerEntry = {
  key: string;
  href: string;
  title: string;
  status: "enabled" | "revoked" | "proposed";
  // Proposed only: where the proposal stands ("In vote · ends 28 Nov 2026, 14:00 UTC").
  note?: string;
  at: number; // unix seconds: the GalleryAdded block, or the vote's start for a proposal
  verdict: "match" | "mismatch" | "unverifiable";
  works: LedgerWork[];
};

type Filter = "all" | LedgerEntry["status"];
const FILTERS: [Filter, string][] = [
  ["all", "All"],
  ["enabled", "Enabled"],
  ["revoked", "Revoked"],
  ["proposed", "Proposed"],
];

// UTC, as everywhere on the site, so the server's render and the browser's agree.
const year = (at: number) => new Date(at * 1000).getUTCFullYear();
const day = new Intl.DateTimeFormat("en-GB", { day: "numeric", timeZone: "UTC" });
const month = new Intl.DateTimeFormat("en-GB", { month: "short", timeZone: "UTC" });
const full = new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" });
const date = (at: number) => new Date(at * 1000);

export function AcquisitionLedger({ entries }: { entries: LedgerEntry[] }) {
  const [filter, setFilter] = useState<Filter>("all");
  const acquired = entries.filter((e) => e.status !== "proposed");
  const years = [...new Set(acquired.map((e) => year(e.at)))].sort((a, b) => b - a);
  // The latest year is open; earlier ones fold to one line and open on demand.
  const [open, setOpen] = useState(() => new Set(years.slice(0, 1)));
  const root = useRef<HTMLDivElement>(null);

  const shown = filter === "all" ? entries : entries.filter((e) => e.status === filter);
  const proposed = shown.filter((e) => e.status === "proposed");
  const toggle = (y: number) => setOpen((s) => (s.has(y) ? new Set([...s].filter((x) => x !== y)) : new Set([...s, y])));
  const jump = (y: number) => {
    setOpen((s) => new Set([...s, y]));
    requestAnimationFrame(() => root.current?.querySelector(`#acq-${y}`)?.scrollIntoView({ behavior: "smooth", block: "start" }));
  };

  return (
    <div className="ledger" ref={root}>
      <div className="ledger-bar">
        <div className="ledger-filters" role="group" aria-label="Filter by status">
          {FILTERS.map(([f, label]) => {
            const count = f === "all" ? entries.length : entries.filter((e) => e.status === f).length;
            return count || f === "all" ? (
              <button key={f} type="button" aria-pressed={filter === f} onClick={() => setFilter(f)}>
                {label}
                <span>{count}</span>
              </button>
            ) : null;
          })}
        </div>
        {years.length > 1 && (
          <nav className="ledger-years" aria-label="Years">
            {years.map((y) => (
              <button key={y} type="button" onClick={() => jump(y)}>
                {y}
              </button>
            ))}
          </nav>
        )}
      </div>

      {proposed.length > 0 && (
        <section className="ledger-year" aria-labelledby="acq-proposed">
          <div className="ledger-year-head">
            <h2 id="acq-proposed">Proposed</h2>
            <span className="ledger-sum">
              {proposed.length} {proposed.length === 1 ? "acquisition" : "acquisitions"} in governance, not on chain yet
            </span>
          </div>
          {proposed.map((e) => (
            <Entry key={e.key} entry={e} />
          ))}
        </section>
      )}

      {years.map((y) => {
        const inYear = shown.filter((e) => e.status !== "proposed" && year(e.at) === y);
        if (!inYear.length) return null;
        const isOpen = open.has(y) || years.length === 1;
        const works = inYear.reduce((t, e) => t + e.works.length, 0);
        return (
          <section key={y} className="ledger-year" id={`acq-${y}`} aria-labelledby={`acq-${y}-h`}>
            <div className="ledger-year-head">
              <h2 id={`acq-${y}-h`}>{y}</h2>
              <span className="ledger-sum">
                {inYear.length} {inYear.length === 1 ? "acquisition" : "acquisitions"} · {works} {works === 1 ? "work" : "works"}
              </span>
              {years.length > 1 && (
                <button type="button" className="ledger-fold" aria-expanded={isOpen} onClick={() => toggle(y)}>
                  {isOpen ? "Fold" : "Show"}
                </button>
              )}
            </div>
            {isOpen && inYear.map((e) => <Entry key={e.key} entry={e} />)}
          </section>
        );
      })}

      {shown.length === 0 && <p className="muted">No acquisitions with this status.</p>}
    </div>
  );
}

function Entry({ entry: e }: { entry: LedgerEntry }) {
  const minted = e.works.filter((w) => w.minted).length;
  const d = date(e.at);
  return (
    <article className={`ledger-entry is-${e.status}`}>
      <div className="ledger-date">
        <b>{day.format(d)}</b>
        {month.format(d)}
      </div>
      <div className="ledger-spine" aria-hidden="true" />
      <div className="ledger-body">
        <div className="ledger-top">
          <Link href={e.href} className="ledger-title">
            <HexText text={e.title} />
          </Link>
          <Status entry={e} />
        </div>
        {e.works.length > 0 && <Hang works={e.works} href={e.href} />}
        <div className="ledger-foot">
          <time className="ledger-fulldate" dateTime={d.toISOString()}>
            {full.format(d)}
          </time>
          {e.status === "proposed" ? (
            <span className="ledger-mint">
              {e.works.length} {e.works.length === 1 ? "work" : "works"} proposed
            </span>
          ) : (
            <Minting works={e.works} minted={minted} />
          )}
          <Verdict verdict={e.verdict} />
        </div>
      </div>
    </article>
  );
}

function Status({ entry: e }: { entry: LedgerEntry }) {
  if (e.status === "proposed") return <span className="ledger-status st-proposed">{e.note}</span>;
  return e.status === "enabled" ? (
    <span className="ledger-status st-enabled">Enabled</span>
  ) : (
    <span className="ledger-status st-revoked">Revoked</span>
  );
}

function Verdict({ verdict }: { verdict: LedgerEntry["verdict"] }) {
  if (verdict === "match")
    return (
      <span className="ledger-check" title="The tree file on IPFS rebuilds to the root on chain">
        <b>✓</b> Root verified
      </span>
    );
  if (verdict === "mismatch")
    return (
      <span className="ledger-check is-mismatch" title="The tree file on IPFS doesn't rebuild to the root on chain">
        <b>✗</b> Root mismatch
      </span>
    );
  return (
    <span className="ledger-check" title="No single tree file to rebuild the root from">
      <b>?</b> Unverifiable
    </span>
  );
}

// One square per work in the tree: filled once minted, open while it can still be minted.
function Minting({ works, minted }: { works: LedgerWork[]; minted: number }) {
  const label = `${minted} of ${works.length} minted`;
  return (
    <span className="ledger-mint" role="img" aria-label={label}>
      {works.length <= 40 ? (
        <span className="ledger-ticks" aria-hidden="true">
          {works.map((w) => (
            <i key={w.tokenId} className={w.minted ? undefined : "off"} />
          ))}
        </span>
      ) : (
        <span className="ledger-meter" aria-hidden="true">
          <i style={{ width: `${(100 * minted) / works.length}%` }} />
        </span>
      )}
      <span aria-hidden="true">{label}</span>
    </span>
  );
}

// The works in one row of one height, whole ones only: CSS wraps the rest out of view (so the server's
// render is already right), and the browser counts them for the "+N".
function Hang({ works, href }: { works: LedgerWork[]; href: string }) {
  const ref = useRef<HTMLAnchorElement>(null);
  const [visible, setVisible] = useState(works.length);
  useLayoutEffect(() => {
    const el = ref.current!;
    const count = () => {
      const tiles = [...el.children] as HTMLElement[];
      const top = tiles[0]?.offsetTop ?? 0;
      setVisible(Math.max(1, tiles.filter((t) => t.offsetTop === top).length));
    };
    count();
    const ro = new ResizeObserver(count);
    ro.observe(el);
    return () => ro.disconnect();
  }, [works]);
  const rest = works.length - visible;
  return (
    <Link href={href} className="ledger-hang" ref={ref} aria-hidden="true" tabIndex={-1}>
      {works.map((w, i) => (
        <span key={w.tokenId} className="ledger-work" style={{ aspectRatio: w.ratio }}>
          {w.src ? (
            <Image src={w.src} alt="" fill sizes="160px" />
          ) : (
            <span className="ledger-missing">
              #{w.tokenId}
              <br />
              no image
            </span>
          )}
          {rest > 0 && i === visible - 1 && <span className="ledger-more">+{rest}</span>}
        </span>
      ))}
    </Link>
  );
}
