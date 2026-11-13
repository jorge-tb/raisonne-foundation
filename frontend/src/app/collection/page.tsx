import type { CSSProperties } from "react";
import type { Metadata } from "next";
import Link from "next/link";
import { AsOf, Hash } from "@/components/ui";
import { proposalTitle } from "@/lib/format";
import { attribute, REISSUED_AS } from "@/lib/metadata";
import { getSnapshot, ipfsGateway, type SnapshotToken } from "@/lib/server/snapshot";
import { ArtworkImage, aspectRatio } from "./ArtworkImage";

export const metadata: Metadata = { title: "Artworks" };

// Row height the wall aims for on wide screens (--row in globals.css); used here only to size images.
const ROW_PX = 220;

export default async function ArtworksPage() {
  const snapshot = await getSnapshot();
  const gateway = ipfsGateway();
  const groups = snapshot.galleries
    .map((g) => ({
      gallery: g,
      title: splitTitle(proposalTitle(snapshot.proposals.find((p) => p.id === g.sourceProposalId)?.description ?? "Acquisition")),
      tokens: snapshot.tokens.filter((t) => t.galleryRoot === g.root),
    }))
    .filter((group) => group.tokens.length > 0);

  return (
    <>
      <h1>Artworks</h1>
      <p className="lede">
        Every artwork the fund has minted, grouped by the acquisition that added it. Titles and images come from each
        token&apos;s metadata on IPFS, at the CID recorded on chain when it was minted.
      </p>
      <AsOf snapshot={snapshot} />
      {groups.length === 0 && <p>No artworks minted yet.</p>}
      {groups.map(({ gallery, title, tokens }) => (
        <section key={gallery.root} id={gallery.root} className="acquisition">
          <h2>{title.name}</h2>
          {title.summary && <p>{title.summary}</p>}
          <p className="muted small">
            {tokens.length} {tokens.length === 1 ? "work" : "works"} · added in block {gallery.added.blockNumber.toString()} ·
            root{" "}
            <Link href={`/acquisitions/${gallery.root}`}>
              <Hash>{gallery.root}</Hash>
            </Link>
          </p>
          <div className="wall">
            {tokens.map((t) => (
              <Work key={t.id.toString()} token={t} gateway={gateway} />
            ))}
          </div>
        </section>
      ))}
    </>
  );
}

// "Acquisition 002 - corrects tokens 6 and 10 …" → heading "Acquisition 002", the rest as a summary.
function splitTitle(title: string) {
  const [name, ...rest] = title.split(/\s[-–—]\s/);
  const summary = rest.join(" - ");
  return { name, summary: summary && summary[0].toUpperCase() + summary.slice(1) };
}

// Label under the work is always visible (title, artist, year). Hover or keyboard focus adds a
// caption tinted with the painting's own colour (medium, size, collection, token); touch screens
// don't get the caption, since a tap opens the artwork page.
function Work({ token: t, gateway }: { token: SnapshotToken; gateway: string }) {
  const artwork = t.metadata.status === "ok" ? t.metadata.artwork : null;
  const reissued = REISSUED_AS[t.id.toString()];
  const r = aspectRatio(t);
  const style = { "--r": r, ...(t.image && { "--tone": t.image.tone }) } as CSSProperties;
  const artistYear = artwork && [attribute(artwork, "Artist"), attribute(artwork, "Year")].filter(Boolean).join(", ");
  const details = artwork && [attribute(artwork, "Medium"), attribute(artwork, "Dimensions")].filter(Boolean).join(" · ");
  const collection = artwork && attribute(artwork, "Collection");

  return (
    <Link href={`/collection/${t.id}`} className="work" style={style}>
      <div className="work-frame">
        <ArtworkImage token={t} gateway={gateway} sizes={`(max-width: 40rem) 60vw, ${Math.ceil(r * ROW_PX * 1.5)}px`} />
        {artwork && (
          <div className="work-caption" aria-hidden="true">
            {details && <span>{details}</span>}
            {collection && <span>{collection}</span>}
            <span className="work-chain">Token #{t.id.toString()}</span>
          </div>
        )}
      </div>
      <span className="work-label">
        <em>{artwork?.name ?? `#${t.id}, title unavailable`}</em>
        <span className="muted">
          {artistYear || (reissued ? `reissued as #${reissued}` : `token #${t.id}`)}
        </span>
      </span>
    </Link>
  );
}
