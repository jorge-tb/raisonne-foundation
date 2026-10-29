"use client";

import { useEffect, useState } from "react";
import type { Hex } from "viem";
import { fetchGallery, type GalleryFetch } from "@/lib/gallery";
import { leafHash, murkyProof, murkyRoot, verifyProof } from "@/lib/merkle";

type Props = {
  root: Hex;
  cid: string;
  gateway: string;
  enabled: boolean;
  registry: string;
  // Token ids minted from ANY gallery: a tokenId could appear in two trees.
  mintedTokenIds: string[];
};

// `?gateway=https://ipfs.io/ipfs/` lets a sceptic verify without the project's own gateway.
function gatewayOverride(fallback: string): string {
  const raw = new URLSearchParams(window.location.search).get("gateway");
  if (!raw) return fallback;
  try {
    const url = new URL(raw);
    if (url.protocol !== "https:") return fallback;
    return url.href.endsWith("/") ? url.href : `${url.href}/`;
  } catch {
    return fallback;
  }
}

// Runs in the viewer's browser: fetch the tree from IPFS, rebuild the root with the Murky
// construction, generate every proof and check it the way ArtRegistry.mintArtwork does.
export function ProofExplorer({ root, cid, gateway, enabled, registry, mintedTokenIds }: Props) {
  const [gatewayUsed, setGatewayUsed] = useState(gateway);
  const [result, setResult] = useState<GalleryFetch | null>(null);
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    const base = gatewayOverride(gateway);
    let cancelled = false;
    fetchGallery(cid, base).then((r) => {
      if (cancelled) return;
      setGatewayUsed(base);
      setResult(r);
    });
    return () => {
      cancelled = true;
    };
  }, [cid, gateway, attempt]);

  const retry = () => {
    setResult(null);
    setAttempt((n) => n + 1);
  };

  if (!result) return <p className="muted">Fetching the tree from {gatewayUsed}…</p>;

  if (!result.ok) {
    return (
      <section>
        <h2>? Unverifiable</h2>
        {result.reason === "gateway" ? (
          <p>
            The tree couldn&apos;t be fetched ({result.detail}). This is usually temporary.{" "}
            <button onClick={retry}>Retry</button>
          </p>
        ) : (
          <p>The file at ipfs://{cid} isn&apos;t a gallery tree ({result.detail}).</p>
        )}
      </section>
    );
  }

  const leaves = result.leaves.map((l) => leafHash(l.tokenId, l.cid));
  if (leaves.length < 2) return <p>? Unverifiable: single-leaf gallery (Murky can&apos;t build it).</p>;

  const computed = murkyRoot(leaves);
  const matches = computed.toLowerCase() === root.toLowerCase();
  const minted = new Set(mintedTokenIds);

  return (
    <section>
      <h2>{matches ? "✓ Root rebuilt in your browser matches" : "✕ Rebuilt root does NOT match"}</h2>
      <dl className="compact">
        <dt>Tree</dt>
        <dd>
          <code className="hash">ipfs://{cid}</code> via <code className="hash">{gatewayUsed}</code>
        </dd>
        <dt>Rebuilt root</dt>
        <dd>
          <code className="hash">{computed}</code>
        </dd>
      </dl>
      <p className="muted small">
        Leaf = keccak256(bytes.concat(keccak256(abi.encode(tokenId, cid)))). Tree built like Murky: leaves in file order,
        odd node paired with bytes32(0), each pair sorted before hashing. Proofs are checked with the same sorted-pair
        rule as OpenZeppelin MerkleProof, which ArtRegistry uses.
      </p>

      <h3>Leaves ({result.leaves.length})</h3>
      {result.leaves.map((l, i) => {
        const proof = murkyProof(leaves, i);
        const valid = verifyProof(proof, root, leaves[i]);
        const isMinted = minted.has(l.tokenId.toString());
        const mintable = matches && valid && enabled && !isMinted;
        return (
          <details key={i} className="leaf">
            <summary>
              <strong>#{l.tokenId.toString()}</strong> · {valid ? "✓ proof valid" : "✕ proof invalid"} ·{" "}
              {isMinted ? "■ minted" : mintable ? "○ mintable" : "○ not minted"}
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
                {isMinted && <p className="muted small">Already minted: this call would revert with ERC721InvalidSender.</p>}
              </dd>
            </dl>
          </details>
        );
      })}
    </section>
  );
}
