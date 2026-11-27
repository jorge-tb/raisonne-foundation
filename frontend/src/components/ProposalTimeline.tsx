import { etherscanTx, formatTimestamp, formatTime } from "@/lib/format";
import type { SnapshotProposal } from "@/lib/server/snapshot";

type Step = { label: string; when: string; status: "done" | "now" | "next" | "fail" | "skip"; tx?: string };

// A proposal's life in five steps: proposed, voting window, queued, runnable from (the timelock's ETA)
// and executed, with times and transactions. A defeated or canceled proposal stops where it ended.
export function ProposalTimeline({ proposal: p, now }: { proposal: SnapshotProposal; now: bigint }) {
  const { votes: v, state } = p;
  const ended = ["Defeated", "Canceled"].includes(state);
  const minutesTo = (t: bigint) => Math.max(1, Math.ceil(Number(t - now) / 60));

  const steps: Step[] = [
    { label: "Proposed", when: formatTimestamp(v.times.created), status: "done", tx: p.transactionHash },
    {
      label: "Voting",
      when: `${formatTime(p.voteStart)} – ${formatTime(p.voteEnd)}`,
      status: state === "Pending" ? "next" : state === "Active" ? "now" : "done",
    },
    ended
      ? {
          label: state,
          when: state === "Canceled" ? "by the proposer" : formatTime(p.voteEnd),
          status: "fail",
        }
      : p.queued && v.times.queued
        ? { label: "Queued", when: formatTime(v.times.queued), status: "done", tx: p.queued.transactionHash }
        : { label: "Queued", when: state === "Succeeded" ? "waiting to be queued" : "—", status: state === "Succeeded" ? "now" : "next" },
    v.eta > 0n
      ? { label: "Runnable from", when: now < v.eta ? `${formatTime(v.eta)} · in ${minutesTo(v.eta)} min` : formatTime(v.eta), status: now < v.eta ? "now" : "done" }
      : { label: "Runnable from", when: "—", status: ended ? "skip" : "next" },
    p.executed && v.times.executed
      ? { label: "Executed", when: formatTime(v.times.executed), status: "done", tx: p.executed.transactionHash }
      : state === "Expired"
        ? { label: "Expired", when: "not executed in time", status: "fail" }
        : { label: "Executed", when: "—", status: ended ? "skip" : "next" },
  ];

  return (
    <ol className="timeline" aria-label="Lifecycle">
      {steps.map((s) => (
        <li key={s.label} className={`timeline-${s.status}`} aria-current={s.status === "now" ? "step" : undefined}>
          <b>{s.label}</b>
          <span>{s.when}</span>
          {s.tx && (
            <a href={etherscanTx(s.tx)} target="_blank" rel="noreferrer">
              tx ↗
            </a>
          )}
        </li>
      ))}
    </ol>
  );
}
