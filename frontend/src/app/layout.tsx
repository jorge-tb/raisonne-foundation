import type { Metadata } from "next";
import Link from "next/link";
import { SiteNav, type SectionCounts } from "@/components/SiteNav";
import { getSnapshot } from "@/lib/server/snapshot";
import "./globals.css";

export const metadata: Metadata = {
  title: { default: "Raisonné Foundation", template: "%s · Raisonné Foundation" },
  description: "On-chain closed-end art fund on Sepolia: its collection, acquisitions, governance and proofs.",
};

// Live counts for the navigation, from the same cached snapshot as the pages. If the chain can't be
// read, the navigation still renders without counts; the page shows the error.
async function sectionCounts(): Promise<SectionCounts> {
  try {
    const { tokens, galleries, proposals } = await getSnapshot();
    return {
      collection: tokens.length,
      acquisitions: galleries.length,
      governance: proposals.length,
      voteOpen: proposals.some((p) => p.state === "Active"),
    };
  } catch {
    return null;
  }
}

export default async function RootLayout({ children }: LayoutProps<"/">) {
  const counts = await sectionCounts();
  return (
    <html lang="en">
      <body>
        <header className="site-header">
          <div className="site-header-inner">
            <Link href="/" className="brand">
              Raisonné Foundation
            </Link>
            <SiteNav counts={counts} />
            <span className="network">Sepolia testnet</span>
          </div>
        </header>
        <main>{children}</main>
        <footer className="site-footer muted small">
          Sepolia testnet. Read-only: this site never asks for a wallet.
        </footer>
      </body>
    </html>
  );
}
