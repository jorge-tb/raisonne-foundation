import type { CSSProperties } from "react";
import { blockieCells, holderColor } from "@/lib/holders";

// A holder's avatar: the address's blockie pattern in the holder's pigment, so avatar and chart colour
// always agree. Decorative: the address or label beside it carries the identity.
export function Blockie({ address, slot, size = 24, x, y }: { address: string; slot: number; size?: number; x?: number; y?: number }) {
  const c = holderColor(slot);
  const fills = [`color-mix(in srgb, ${c} 22%, var(--surface))`, c, `color-mix(in srgb, ${c} 60%, #000)`];
  return (
    <svg
      className="blockie"
      width={size}
      height={size}
      x={x}
      y={y}
      viewBox="0 0 8 8"
      shapeRendering="crispEdges"
      aria-hidden="true"
      style={{ "--c": c } as CSSProperties}
    >
      <rect width="8" height="8" style={{ fill: fills[0] }} />
      {blockieCells(address).flatMap((row, cy) =>
        row.map((v, cx) => (v ? <rect key={`${cx}.${cy}`} x={cx} y={cy} width="1.02" height="1.02" style={{ fill: fills[v] }} /> : null)),
      )}
    </svg>
  );
}
