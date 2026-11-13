import type { Metadata } from "next";
import { Hanken_Grotesk, JetBrains_Mono, Newsreader } from "next/font/google";
import Link from "next/link";
import { SiteNav, type SectionCounts } from "@/components/SiteNav";
import { Wordmark } from "@/components/Wordmark";
import { getSnapshot } from "@/lib/server/snapshot";
import "./globals.css";

// Three faces, three jobs: Hanken Grotesk for the interface, Newsreader italic only for artwork titles,
// JetBrains Mono only for chain data (hashes, ids, counts). next/font downloads them at build time and
// serves them from this site, so visitors make no request to Google.
const ui = Hanken_Grotesk({ subsets: ["latin"], variable: "--font-ui", display: "swap" });
const title = Newsreader({ subsets: ["latin"], style: "italic", variable: "--font-title", display: "swap" });
const mono = JetBrains_Mono({ subsets: ["latin"], variable: "--font-mono", display: "swap" });

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
    <html lang="en" className={`${ui.variable} ${title.variable} ${mono.variable}`}>
      <body>
        <header className="site-header">
          <div className="site-header-inner">
            <Link href="/" className="brand">
              <Wordmark />
            </Link>
            <SiteNav counts={counts} />
            <span className="network">
              <span className="network-chain">Sepolia </span>testnet
            </span>
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
