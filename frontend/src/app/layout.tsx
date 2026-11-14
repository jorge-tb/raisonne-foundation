import type { Metadata } from "next";
import { Hanken_Grotesk, JetBrains_Mono, Newsreader } from "next/font/google";
import Link from "next/link";
import { SiteNav, type NavStatus } from "@/components/SiteNav";
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

// Whether a vote is open, for the navigation's badge, from the same cached snapshot as the pages. If the
// chain can't be read, the navigation still renders; the page shows the error.
async function navStatus(): Promise<NavStatus> {
  try {
    const { proposals } = await getSnapshot();
    return { voteOpen: proposals.some((p) => p.state === "Active") };
  } catch {
    return null;
  }
}

export default async function RootLayout({ children }: LayoutProps<"/">) {
  const status = await navStatus();
  return (
    <html lang="en" className={`${ui.variable} ${title.variable} ${mono.variable}`}>
      <body>
        {/* What network this is and that the site only reads: it never asks for a wallet, so a look-alike
            that does is not this site. On mainnet the strip goes; the header doesn't change. */}
        <div className="env-strip" role="note">
          <span className="env-dot" aria-hidden="true" />
          <span>
            Sepolia testnet · read-only<span className="env-more">, this site never asks for a wallet</span>
          </span>
        </div>
        <header className="site-header">
          <div className="site-header-inner">
            <Link href="/" className="brand">
              <Wordmark />
            </Link>
            <SiteNav status={status} />
          </div>
        </header>
        <main>{children}</main>
        <footer className="site-footer muted small">
          Raisonné Foundation, an on-chain art fund. <Link href="/contracts">Contracts</Link>
        </footer>
      </body>
    </html>
  );
}
