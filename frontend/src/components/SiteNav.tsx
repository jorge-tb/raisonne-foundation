"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import type { ReactNode } from "react";
import { AcquisitionsIcon, CollectionIcon, FundIcon, GovernanceIcon } from "./icons";

// Counts come from the layout's snapshot; null when the chain couldn't be read (links still work).
export type SectionCounts = { collection: number; acquisitions: number; governance: number; voteOpen: boolean } | null;

type Section = { href: "/" | "/collection" | "/acquisitions" | "/governance"; label: string; icon: ReactNode; count?: number };

function sections(counts: SectionCounts): Section[] {
  return [
    { href: "/", label: "Fund", icon: <FundIcon /> },
    { href: "/collection", label: "Collection", icon: <CollectionIcon />, count: counts?.collection },
    { href: "/acquisitions", label: "Acquisitions", icon: <AcquisitionsIcon />, count: counts?.acquisitions },
    { href: "/governance", label: "Governance", icon: <GovernanceIcon />, count: counts?.governance },
  ];
}

const isCurrent = (pathname: string, href: Section["href"]) =>
  href === "/" ? pathname === "/" : pathname === href || pathname.startsWith(`${href}/`);

// Header tabs on wide screens; a bottom bar on phones, where thumbs reach. CSS shows one or the other,
// so screen readers only ever meet one of them.
export function SiteNav({ counts }: { counts: SectionCounts }) {
  const pathname = usePathname();
  const items = sections(counts);
  const voteOpen = counts?.voteOpen ?? false;

  return (
    <>
      <nav className="tabs" aria-label="Sections">
        {items.slice(1).map((s) => (
          <Link key={s.href} href={s.href} className="tab" aria-current={isCurrent(pathname, s.href) ? "page" : undefined}>
            {s.icon}
            {s.label}
            {s.count !== undefined && <span className="tab-count">{s.count}</span>}
            {s.href === "/governance" && voteOpen && <span className="vote-open">vote open</span>}
          </Link>
        ))}
      </nav>
      <nav className="bottom-bar" aria-label="Sections">
        {items.map((s) => (
          <Link key={s.href} href={s.href} aria-current={isCurrent(pathname, s.href) ? "page" : undefined}>
            {s.icon}
            <span>{s.label}</span>
            {s.href === "/governance" && voteOpen && <span className="vote-dot" aria-label="vote open" />}
          </Link>
        ))}
      </nav>
    </>
  );
}
