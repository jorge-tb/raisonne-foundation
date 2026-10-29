import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { AsOf, External, Hash, StateLabel } from "@/components/ui";
import { ArtRegistry } from "@/generated/contracts";
import { etherscanTx, proposalTitle } from "@/lib/format";
import { getSnapshot, ipfsGateway } from "@/lib/server/snapshot";
import { ProofExplorer } from "./ProofExplorer";

export async function generateStaticParams() {
  const { galleries } = await getSnapshot();
  return galleries.map((g) => ({ root: g.root }));
}

async function findGallery(root: string) {
  const snapshot = await getSnapshot();
  const gallery = snapshot.galleries.find((g) => g.root.toLowerCase() === root.toLowerCase());
  return { snapshot, gallery };
}

export async function generateMetadata(props: PageProps<"/galleries/[root]">): Promise<Metadata> {
  const { root } = await props.params;
  return { title: `Gallery ${root}` };
}

export default async function GalleryPage(props: PageProps<"/galleries/[root]">) {
  const { root } = await props.params;
  const { snapshot, gallery } = await findGallery(root);
  if (!gallery) notFound();

  const proposals = snapshot.proposals.filter((p) => gallery.proposalIds.includes(p.id));
  const source = proposals.find((p) => p.id === gallery.sourceProposalId);

  return (
    <>
      <p className="small">
        <Link href="/galleries">← Galleries</Link>
      </p>
      <h1>{source ? proposalTitle(source.description) : "Gallery"}</h1>
      <AsOf snapshot={snapshot} />

      <dl className="compact">
        <dt>Root (on chain)</dt>
        <dd>
          <Hash>{gallery.root}</Hash>
        </dd>
        <dt>Status</dt>
        <dd>
          {gallery.enabled ? "● Enabled: minting with a valid proof is possible" : "⊘ Revoked: minting is disabled"}
        </dd>
        <dt>Proposals adding this root</dt>
        <dd>
          <ul className="plain">
            {proposals.map((p) => (
              <li key={p.id.toString()}>
                <StateLabel state={p.state} /> <Link href={`/proposals#${p.id}`}>{proposalTitle(p.description)}</Link>
                {p.id === gallery.sourceProposalId && <span className="muted"> (tree CID taken from this one)</span>}
              </li>
            ))}
          </ul>
        </dd>
        <dt>Minted from this gallery</dt>
        <dd>
          {gallery.minted.length === 0 ? (
            "none"
          ) : (
            <ul className="plain">
              {gallery.minted.map((m) => (
                <li key={m.tokenId.toString()}>
                  #{m.tokenId.toString()} · <External href={etherscanTx(m.transactionHash)}>mint transaction</External>
                </li>
              ))}
            </ul>
          )}
        </dd>
      </dl>

      {gallery.cid ? (
        <ProofExplorer root={gallery.root} cid={gallery.cid} gateway={ipfsGateway()} registry={ArtRegistry.address} />
      ) : (
        <p>
          <strong>? Unverifiable.</strong> The proposal description doesn&apos;t name exactly one tree CID, so there is
          nothing to rebuild.
        </p>
      )}
    </>
  );
}
