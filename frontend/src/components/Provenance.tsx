import type { ReactNode } from "react";
import Link from "next/link";
import { etherscanTx, proposalTitle } from "@/lib/format";
import type { SnapshotProposal } from "@/lib/server/snapshot";
import { External } from "./ui";

export type ProvenanceStep = { label: string; title: ReactNode; detail?: ReactNode };

// Step 1 for any root: the proposal it came from (the executed one when the same calldata was proposed twice).
export function decisionStep(source: SnapshotProposal | undefined): ProvenanceStep {
  if (!source) return { label: "Decided", title: <span className="muted">No proposal found for this root</span> };
  return {
    label: "Decided",
    title: <Link href={`/governance#${source.id}`}>{proposalTitle(source.description)}</Link>,
    detail: source.executed ? (
      <>
        Executed in block {source.executed.blockNumber.toString()} ·{" "}
        <External href={etherscanTx(source.executed.transactionHash)}>transaction</External>
      </>
    ) : (
      `${source.state}, not executed`
    ),
  };
}

// The chain behind every work: the vote that decided it, the root that acquired it, the token that
// holds it. Each page passes its steps and marks the one it is about.
export function Provenance({ steps, current }: { steps: ProvenanceStep[]; current: number }) {
  return (
    <section aria-labelledby="provenance-title">
      <h2 id="provenance-title">Provenance</h2>
      <ol className="provenance">
        {steps.map((s, i) => (
          <li key={s.label} aria-current={i === current ? "step" : undefined}>
            <span className="provenance-label">{s.label}</span>
            <span className="provenance-title">{s.title}</span>
            {s.detail && <span className="muted small">{s.detail}</span>}
          </li>
        ))}
      </ol>
    </section>
  );
}
