import type { Metadata } from "next";
import Link from "next/link";
import "./globals.css";

export const metadata: Metadata = {
  title: { default: "Raisonné Foundation", template: "%s · Raisonné Foundation" },
  description: "On-chain closed-end art fund on Sepolia: its collection, acquisitions, governance and proofs.",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en">
      <body>
        <header className="site-header">
          <nav>
            <Link href="/" className="brand">
              Raisonné Foundation
            </Link>
            <Link href="/collection">Collection</Link>
            <Link href="/acquisitions">Acquisitions</Link>
            <Link href="/governance">Governance</Link>
          </nav>
        </header>
        <main>{children}</main>
        <footer className="site-footer muted small">
          Sepolia testnet. Read-only: this site never asks for a wallet.
        </footer>
      </body>
    </html>
  );
}
