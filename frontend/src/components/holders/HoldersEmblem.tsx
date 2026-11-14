import { ViewTransition } from "react";
import { holderColor } from "@/lib/holders";
import { layout, segmentPath, VIEWBOX } from "./ring";
import type { HoldersData } from "./views";

// The voting-power ring at emblem size, for the home page's Governance door. It shares its view
// transition name with the Governance donut, so following the door morphs one into the other.
export function HoldersEmblem({ data }: { data: HoldersData }) {
  const { voting } = data;
  const parts = layout([
    ...data.holders.filter((h) => h.votesFraction > 0).map((h) => ({ key: h.address, fraction: h.votesFraction, color: holderColor(h.slot) })),
    ...(voting < 0.9999 ? [{ key: "not-voting", fraction: 1 - voting, color: "var(--rule)" }] : []),
  ]);
  return (
    <ViewTransition name="holders-ring" share="morph" default="none">
      <svg className="holders-emblem" viewBox={VIEWBOX} aria-hidden="true">
        {parts.map((p) => (
          <path key={p.key} d={segmentPath(p.a0, p.a1)} style={{ fill: p.color }} stroke="var(--surface)" strokeWidth="4" />
        ))}
      </svg>
    </ViewTransition>
  );
}
