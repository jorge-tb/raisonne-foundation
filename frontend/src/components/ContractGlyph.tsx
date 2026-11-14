import type { ReactNode } from "react";

// One icon per contract, used wherever a contract is named. Drawn on a 24-unit grid in the text colour.
export type ContractKind = "FundShare" | "FundGovernor" | "TimelockController" | "FundTreasury" | "ArtRegistry";

const PATHS: Record<ContractKind, ReactNode> = {
  // a stack of coins: the share token
  FundShare: (
    <>
      <ellipse cx="12" cy="7" rx="7" ry="3" />
      <path d="M5 7v10c0 1.7 3.1 3 7 3s7-1.3 7-3V7" />
      <path d="M5 12c0 1.7 3.1 3 7 3s7-1.3 7-3" />
    </>
  ),
  // a ballot going into a box: the governor
  FundGovernor: (
    <>
      <path d="M4 13h16v7H4z" />
      <path d="M8 13V4h8v9" />
      <path d="M10.5 8h3" />
      <path d="M8 16.5h8" />
    </>
  ),
  // an hourglass: the timelock
  TimelockController: (
    <>
      <path d="M6 3h12M6 21h12" />
      <path d="M8 3c0 5 8 5 8 9s-8 4-8 9" />
      <path d="M16 3c0 5-8 5-8 9s8 4 8 9" />
    </>
  ),
  // a classical building: the treasury
  FundTreasury: (
    <>
      <path d="M12 3 20.5 7v2h-17V7Z" />
      <path d="M6 11v6M10 11v6M14 11v6M18 11v6M3.5 20h17" />
    </>
  ),
  // a framed picture: the registry of artworks
  ArtRegistry: (
    <>
      <rect x="3.5" y="3.5" width="17" height="17" rx="1" />
      <rect x="7.5" y="7.5" width="9" height="9" />
    </>
  ),
};

export function ContractGlyph({ kind, size = 22 }: { kind: ContractKind; size?: number }) {
  return (
    <svg
      className="contract-glyph"
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.6}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      {PATHS[kind]}
    </svg>
  );
}
