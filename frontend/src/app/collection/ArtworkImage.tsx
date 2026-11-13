import type { CSSProperties } from "react";
import Image from "next/image";
import type { SnapshotToken } from "@/lib/server/snapshot";

// No image: a narrow panel, so it doesn't crowd a row of paintings.
const MISSING_RATIO = 0.8;

export const aspectRatio = (token: SnapshotToken) => (token.image?.ratio ?? MISSING_RATIO);

// One frame for every state, so a missing image says why: permanent (no image in the metadata,
// metadata not pinned, invalid metadata) or transient (gateway unreachable, shown as "right now").
// The frame takes the image's own proportions when they are known.
export function ArtworkImage({ token, gateway, sizes }: { token: SnapshotToken; gateway: string; sizes: string }) {
  const m = token.metadata;
  const style = { "--r": aspectRatio(token) } as CSSProperties;
  if (m.status === "ok" && m.artwork.imageCid)
    return (
      <div className="artwork-frame" style={style}>
        <Image src={new URL(m.artwork.imageCid, gateway).href} alt={m.artwork.name} fill sizes={sizes} />
      </div>
    );
  return (
    <div className="artwork-frame empty" style={style}>
      <span>
        {m.status === "ok" && "No image in the metadata"}
        {m.status === "unpinned" && "Metadata not pinned"}
        {m.status === "malformed" && "Invalid metadata"}
        {m.status === "unavailable" && "Metadata unavailable right now"}
      </span>
    </div>
  );
}
