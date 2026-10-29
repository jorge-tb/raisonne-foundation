"use client";

import { useEffect, useState } from "react";
import type { Hex } from "viem";
import {
  browserClient,
  browserGateway,
  browserRpcUrl,
  checkGalleryEnabled,
  checkTokenUri,
  type Check,
} from "@/lib/browser/checks";
import { fetchGallery, type GalleryFetch } from "@/lib/gallery";
import { leafHash, murkyProof, murkyRoot, verifyProof } from "@/lib/merkle";

type Props = { root: Hex; cid: string; gateway: string; registry: string };

type Result = {
  rpc: string;
  gateway: string;
  tree: GalleryFetch;
  enabled: Check<boolean>;
  // tokenURI per leaf: reverts if unminted, else true when it equals ipfs://<leaf cid>.
  uris: Check<boolean>[];
};

async function run({ root, cid, gateway: fallbackGateway }: Props): Promise<Result> {
  const rpc = browserRpcUrl();
  const gateway = browserGateway(fallbackGateway);
  const client = browserClient(rpc);
  const [tree, enabled] = await Promise.all([fetchGallery(cid, gateway), checkGalleryEnabled(client, root)]);
  const uris = tree.ok ? await Promise.all(tree.leaves.map((l) => checkTokenUri(client, l.tokenId, l.cid))) : [];
  return { rpc, gateway, tree, enabled, uris };
}

// Runs in the viewer's browser, through an RPC and gateway the viewer can override:
//   - the registry confirms the root is enabled (so the root isn't just our server's word)
//   - the tree is fetched from IPFS and rebuilt with the Murky construction
//   - every proof is checked the way ArtRegistry.mintArtwork checks it
//   - tokenURI ties each minted token to the CID in its leaf
export function ProofExplorer(props: Props) {
  const { root, cid, registry } = props;
  const [result, setResult] = useState<Result | null>(null);
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    let cancelled = false;
    run(props).then((r) => {
      if (!cancelled) setResult(r);
    });
    return () => {
      cancelled = true;
    };
    // props are static per render of the server page
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [attempt]);

  const retry = () => {
    setResult(null);
    setAttempt((n) => n + 1);
  };

  if (!result) return <p className="muted">Checking the registry and fetching the tree…</p>;

  const { tree, enabled, uris } = result;
  const enabledNow = enabled.ok && enabled.value;

  const registryLine = enabled.ok ? (
    enabled.value ? (
      <p>✓ Enabled on the registry: ArtRegistry accepts mints against this root today.</p>
    ) : (
      <p>✕ Not enabled on the registry: this root was revoked or never enabled, so nothing can be minted from it.</p>
    )
  ) : (
    <p>
      – Couldn&apos;t read the registry ({enabled.detail}). <button onClick={retry}>Retry</button>
    </p>
  );

  const footer = (
    <p className="muted small">
      Checked in your browser via <code className="hash">{result.rpc}</code> and{" "}
      <code className="hash">{result.gateway}</code>. Use <code>?rpc=</code> / <code>?gateway=</code> to check through
      your own endpoints.
    </p>
  );

  if (!tree.ok) {
    return (
      <section className="browser-check">
        <h2>Checked in your browser</h2>
        {registryLine}
        {tree.reason === "gateway" ? (
          <p>
            ? The tree couldn&apos;t be fetched ({tree.detail}). This is usually temporary.{" "}
            <button onClick={retry}>Retry</button>
          </p>
        ) : (
          <p>? The file at ipfs://{cid} isn&apos;t a gallery tree ({tree.detail}).</p>
        )}
        {footer}
      </section>
    );
  }

  const leaves = tree.leaves.map((l) => leafHash(l.tokenId, l.cid));
  if (leaves.length < 2) return <p>? Unverifiable: single-leaf gallery (Murky can&apos;t build it).</p>;
  const computed = murkyRoot(leaves);
  const matches = computed.toLowerCase() === root.toLowerCase();

  return (
    <section className="browser-check">
      <h2>Checked in your browser</h2>
      {registryLine}
      <p>
        {matches
          ? "✓ The published tree rebuilds to this root."
          : `✕ The published tree does NOT rebuild to this root (it gives ${computed}).`}
      </p>
      {footer}
      <p className="muted small">
        Leaf = keccak256(bytes.concat(keccak256(abi.encode(tokenId, cid)))). Tree built like Murky: leaves in file order,
        odd node paired with bytes32(0), each pair sorted before hashing. Proofs are checked with the same sorted-pair
        rule as OpenZeppelin MerkleProof, which ArtRegistry uses.
      </p>

      <h3>Leaves ({tree.leaves.length})</h3>
      {tree.leaves.map((l, i) => {
        const proof = murkyProof(leaves, i);
        const valid = verifyProof(proof, root, leaves[i]);
        const uri = uris[i];
        const minted = uri.ok;
        const mintable = !minted && uri.reason === "rejected" && matches && valid && enabledNow;
        const mintedLabel = !uri.ok
          ? uri.reason === "rejected"
            ? mintable
              ? "○ mintable"
              : "○ not minted"
            : "– mint status unknown"
          : uri.value
            ? "■ minted, tokenURI matches this leaf"
            : "✕ minted, but tokenURI differs from this leaf";
        return (
          <details key={i} className="leaf">
            <summary>
              <strong>#{l.tokenId.toString()}</strong> · {valid ? "✓ proof valid" : "✕ proof invalid"} · {mintedLabel}
            </summary>
            <dl className="compact">
              <dt>Metadata CID</dt>
              <dd>
                <code className="hash">{l.cid}</code>
              </dd>
              <dt>Leaf</dt>
              <dd>
                <code className="hash">{leaves[i]}</code>
              </dd>
              <dt>Proof</dt>
              <dd>
                <ol className="proof">
                  {proof.map((p, j) => (
                    <li key={j}>
                      <code className="hash">{p}</code>
                    </li>
                  ))}
                </ol>
              </dd>
              <dt>Call</dt>
              <dd>
                <pre className="call">{`ArtRegistry(${registry}).mintArtwork(\n  [${proof.join(",\n   ")}],\n  ${root},\n  ${l.tokenId},\n  "${l.cid}"\n)`}</pre>
                {minted && <p className="muted small">Already minted: this call would revert with ERC721InvalidSender.</p>}
              </dd>
            </dl>
          </details>
        );
      })}
    </section>
  );
}
