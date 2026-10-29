import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Raisonné Foundation",
  description: "On-chain closed-end art fund on Sepolia: proposals, cap table, galleries and proofs.",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
