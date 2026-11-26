import { Fragment, type ReactNode } from "react";
import { etherscanAddress, etherscanBlock, formatTimestamp, STATE_GLYPH } from "@/lib/format";
import type { ProposalState } from "@/lib/proposals";
import type { Snapshot } from "@/lib/server/snapshot";

// Full identifiers, always: wrapped, never truncated.
export function Hash({ children }: { children: ReactNode }) {
  return <code className="hash">{children}</code>;
}

// A full identifier (hash, address, CID) that wraps only between equal chunks: an address in halves,
// a longer hash or a CID in thirds. So a wrap looks intended and never strands a character.
export function Id({ value }: { value: string }) {
  const n = value.length <= 42 ? 2 : 3;
  const size = Math.ceil(value.length / n);
  return (
    <Hash>
      {Array.from({ length: n }, (_, k) => (
        <Fragment key={k}>
          {k > 0 && <wbr />}
          <span className="nowrap">{value.slice(k * size, (k + 1) * size)}</span>
        </Fragment>
      ))}
    </Hash>
  );
}

// Free text (a proposal title) shown whole, never parsed for a structure. Only hex identifiers
// (addresses, hashes) are set as identifiers, wherever they appear.
export function HexText({ text }: { text: string }) {
  return text.split(/(0x[0-9a-fA-F]{40,})/).map((part, i) => (i % 2 ? <Id key={i} value={part} /> : part));
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

// Holds the title's place while a detail page's URL-specific content streams in, so nothing jumps.
export function DetailPending() {
  return <div className="detail-pending" role="status" aria-label="Loading" />;
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
