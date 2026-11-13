import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { isAddressEqual } from "viem";
import { AddressLink, AsOf, External, Hash } from "@/components/ui";
import { FundTreasury } from "@/generated/contracts";
import { etherscanTx } from "@/lib/format";
import { REISSUED_AS } from "@/lib/metadata";
import { getSnapshot, ipfsGateway } from "@/lib/server/snapshot";
import { ArtworkImage } from "../ArtworkImage";

export async function generateStaticParams() {
  const { tokens } = await getSnapshot();
  return tokens.map((t) => ({ id: t.id.toString() }));
}

async function findToken(id: string) {
  const snapshot = await getSnapshot();
  const token = /^\d+$/.test(id) ? snapshot.tokens.find((t) => t.id === BigInt(id)) : undefined;
  return { snapshot, token };
}

export async function generateMetadata(props: PageProps<"/collection/[id]">): Promise<Metadata> {
  const { id } = await props.params;
  const { token } = await findToken(id);
  const name = token?.metadata.status === "ok" ? token.metadata.artwork.name : null;
  return { title: name ? `#${id} ${name}` : `Artwork #${id}` };
}

export default async function ArtworkPage(props: PageProps<"/collection/[id]">) {
  const { id } = await props.params;
  const { snapshot, token } = await findToken(id);
  if (!token) notFound();

  const gateway = ipfsGateway();
  const m = token.metadata;
  const artwork = m.status === "ok" ? m.artwork : null;
  const reissuedAs = REISSUED_AS[id];
  const reissueOf = Object.entries(REISSUED_AS).find(([, to]) => to === token.id)?.[0];

  return (
    <>
      <p className="small">
        <Link href="/collection">← Collection</Link>
      </p>
      <h1>
        #{id} {artwork?.name ?? <span className="muted">title unavailable</span>}
      </h1>
      <AsOf snapshot={snapshot} />

      {(reissuedAs || reissueOf) && (
        <p className="note">
          <strong>Curator&apos;s note</strong> <span className="muted">(editorial, not on chain)</span>:{" "}
          {reissuedAs ? (
            <>
              minted with a placeholder instead of an image, and reissued as{" "}
              <Link href={`/collection/${reissuedAs}`}>#{reissuedAs.toString()}</Link>.
            </>
          ) : (
            <>
              reissue of <Link href={`/collection/${reissueOf}`}>#{reissueOf}</Link>, which was minted with a placeholder
              instead of an image.
            </>
          )}
        </p>
      )}

      <div className="artwork-detail">
        <ArtworkImage token={token} gateway={gateway} sizes="(max-width: 64rem) 100vw, 40rem" />
        <div>
          {artwork?.description && <p>{artwork.description}</p>}
          {artwork && artwork.attributes.length > 0 && (
            <dl className="compact">
              {artwork.attributes.map((a) => (
                <div key={a.trait}>
                  <dt>{a.trait}</dt>
                  <dd>{a.value}</dd>
                </div>
              ))}
            </dl>
          )}
          {artwork?.externalUrl && (
            <p className="small">
              <External href={artwork.externalUrl}>Collection page</External>
            </p>
          )}
        </div>
      </div>

      <h2>On chain and on IPFS</h2>
      <dl className="compact">
        <dt>Owner</dt>
        <dd>
          <AddressLink address={token.owner} />
          {isAddressEqual(token.owner, FundTreasury.address) && <span className="muted"> · FundTreasury (the fund)</span>}
        </dd>
        <dt>Minted</dt>
        <dd>
          <External href={etherscanTx(token.mintTransactionHash)}>mint transaction</External> · from{" "}
          <Link href={`/acquisitions/${token.galleryRoot}`}>acquisition</Link> <Hash>{token.galleryRoot}</Hash>
        </dd>
        <dt>Metadata</dt>
        <dd>
          <External href={new URL(token.cid, gateway).href}>
            <Hash>ipfs://{token.cid}</Hash>
          </External>
          <br />
          <span className="muted small">
            {m.status === "ok" && "The CID in this token's Merkle leaf and in tokenURI."}
            {m.status === "unpinned" &&
              "Not pinned to our gateway any more, so title and details can't be shown. The CID is still the one in this token's Merkle leaf."}
            {m.status === "malformed" && `Fetched, but not valid metadata (${m.detail}).`}
            {m.status === "unavailable" && "Our gateway couldn't be reached just now; this page retries within a minute."}
          </span>
        </dd>
        {artwork && (
          <>
            <dt>Image</dt>
            <dd>
              {artwork.imageCid ? (
                <External href={new URL(artwork.imageCid, gateway).href}>
                  <Hash>ipfs://{artwork.imageCid}</Hash>
                </External>
              ) : (
                <>
                  none: the metadata&apos;s <code>image</code> is <Hash>{artwork.image ?? "missing"}</Hash>, not an IPFS
                  CID
                </>
              )}
            </dd>
          </>
        )}
      </dl>
    </>
  );
}
