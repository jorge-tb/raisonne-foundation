import type { ReactNode } from "react";
import { etherscanAddress, etherscanBlock, formatTimestamp, STATE_GLYPH } from "@/lib/format";
import type { ProposalState } from "@/lib/proposals";
import type { Snapshot } from "@/lib/server/snapshot";
import type { Verification } from "@/lib/verify";

// Full identifiers, always: wrapped, never truncated.
export function Hash({ children }: { children: ReactNode }) {
  return <code className="hash">{children}</code>;
}

export function External({ href, children }: { href: string; children: ReactNode }) {
  return (
    <a href={href} target="_blank" rel="noreferrer">
      {children}
    </a>
  );
}

export function AddressLink({ address }: { address: string }) {
  return (
    <External href={etherscanAddress(address)}>
      <Hash>{address}</Hash>
    </External>
  );
}

export function StateLabel({ state }: { state: ProposalState }) {
  return (
    <span className={`state state-${state.toLowerCase()}`}>
      <span aria-hidden="true">{STATE_GLYPH[state]}</span> {state}
    </span>
  );
}

export function AsOf({ snapshot }: { snapshot: Snapshot }) {
  return (
    <p className="muted small">
      As of block <External href={etherscanBlock(snapshot.blockNumber)}>{snapshot.blockNumber.toString()}</External> (
      {formatTimestamp(snapshot.blockTimestamp)}). Reads via JSON-RPC
      {snapshot.logSource === "etherscan" ? "; log blocks discovered via Etherscan" : ""}.
    </p>
  );
}

const VERDICT_LABEL: Record<Verification["status"], string> = {
  match: "✓ Match",
  mismatch: "✕ Mismatch",
  unverifiable: "? Unverifiable",
  "revokes-gallery": "⊘ Revokes gallery",
  "not-applicable": "– Not applicable",
  malformed: "! Malformed calldata",
};

export function VerdictLabel({ status }: { status: Verification["status"] }) {
  return <strong className={`verdict verdict-${status}`}>{VERDICT_LABEL[status]}</strong>;
}
