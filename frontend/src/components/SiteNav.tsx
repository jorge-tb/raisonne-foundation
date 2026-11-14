"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useRef, type ReactNode } from "react";
import { AcquisitionsIcon, CollectionIcon, FundIcon, GovernanceIcon } from "./icons";

// Whether a vote is open, from the layout's snapshot; null when the chain couldn't be read (links still work).
export type NavStatus = { voteOpen: boolean } | null;

// Three places to go, and the fund itself on phones. Counts live on the pages, not here. Governance
// also owns /contracts: "who decides" and "what enforces it" are one section (GovernanceNav switches).
type Section = { href: "/" | "/collection" | "/acquisitions" | "/governance"; label: string; icon: ReactNode; also?: string[] };

const SECTIONS: Section[] = [
  { href: "/", label: "Fund", icon: <FundIcon /> },
  { href: "/collection", label: "Collection", icon: <CollectionIcon /> },
  { href: "/acquisitions", label: "Acquisitions", icon: <AcquisitionsIcon /> },
  { href: "/governance", label: "Governance", icon: <GovernanceIcon />, also: ["/contracts"] },
];

const isCurrent = (pathname: string, s: Section) =>
  s.href === "/" ? pathname === "/" : [s.href, ...(s.also ?? [])].some((h) => pathname === h || pathname.startsWith(`${h}/`));

// Header tabs on wide screens; a bottom bar on phones, where thumbs reach. CSS shows one or the other,
// so screen readers only ever meet one of them.
export function SiteNav({ status }: { status: NavStatus }) {
  const pathname = usePathname();
  const voteOpen = status?.voteOpen ?? false;

  // Marks the document once the visitor has moved inside the app, so entrance animations meant for a
  // first load (the shareholder ring's reveal) don't replay on every in-app page change.
  const initialPath = useRef(pathname);
  useEffect(() => {
    if (pathname !== initialPath.current) document.documentElement.dataset.navigated = "1";
  }, [pathname]);

  return (
    <>
      <nav className="tabs" aria-label="Sections">
        {SECTIONS.slice(1).map((s) => (
          <Link key={s.href} href={s.href} className="tab" aria-current={isCurrent(pathname, s) ? "page" : undefined}>
            {s.icon}
            {s.label}
            {s.href === "/governance" && voteOpen && <span className="vote-open">vote open</span>}
          </Link>
        ))}
      </nav>
      <nav className="bottom-bar" aria-label="Sections">
        {SECTIONS.map((s) => (
          <Link key={s.href} href={s.href} aria-current={isCurrent(pathname, s) ? "page" : undefined}>
            {s.icon}
            <span>{s.label}</span>
            {s.href === "/governance" && voteOpen && <span className="vote-dot" aria-label="vote open" />}
          </Link>
        ))}
      </nav>
    </>
  );
}
