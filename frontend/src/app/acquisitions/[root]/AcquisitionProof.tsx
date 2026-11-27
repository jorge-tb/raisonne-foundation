"use client";

import Image from "next/image";
import Link from "next/link";
import { useEffect, useState } from "react";
import { zeroHash, type Hex } from "viem";
import { RpcNotice } from "@/components/RpcNotice";
import { HexText } from "@/components/ui";
import {
  browserClient,
  browserGateway,
  browserRpcUrl,
  checkChain,
  DEFAULT_BROWSER_RPC,
  checkGalleryEnabled,
  checkTokenUri,
  type Check,
} from "@/lib/browser/checks";
import { fetchGallery, type GalleryFetch } from "@/lib/gallery";
import { leafHash, murkyProof, murkyRoot, verifyProof } from "@/lib/merkle";

// One work of the tree, as the server knows it (name and image from its metadata).
export type ProofWork = { tokenId: string; name: string | null; src: string | null; reissuedAs: string | null; minted: boolean };

type Props = { root: Hex; cid: string; gateway: string; registry: string; works: ProofWork[] };

type Result = {
  rpc: string;
  gateway: string;
  chain: Check<number>;
  tree: GalleryFetch;
  enabled: Check<boolean>;
  // tokenURI per leaf: reverts if unminted, else true when it equals ipfs://<leaf cid>.
  uris: Check<boolean>[];
};

async function run({ root, cid, gateway: fallbackGateway }: Props): Promise<Result> {
  const rpc = browserRpcUrl();
  const gateway = browserGateway(fallbackGateway);
  const client = browserClient(rpc);
  const chain = await checkChain(client, rpc);
  if (!chain.ok) {
    const skipped: Check<boolean> = { ok: false, reason: "unreachable", detail: chain.detail };
    return { rpc, gateway, chain, tree: { ok: false, reason: "gateway", detail: "not fetched" }, enabled: skipped, uris: [] };
  }
  const [tree, enabled] = await Promise.all([fetchGallery(cid, gateway), checkGalleryEnabled(client, root)]);
  const uris = tree.ok ? await Promise.all(tree.leaves.map((l) => checkTokenUri(client, l.tokenId, l.cid))) : [];
  return { rpc, gateway, chain, tree, enabled, uris };
}

// A check's outcome, in form as well as words: ✓ passed, ✕ contradicts what is shown, ? unable to
// verify (never a mismatch), ⊘ a fact (a revoked root), … still running.
type Tone = "ok" | "bad" | "unknown" | "fact" | "run";
type Card = { tone: Tone; title: string; detail: string };
const MARK: Record<Tone, string> = { ok: "✓", bad: "✕", unknown: "?", fact: "⊘", run: "" };

// The page's proof, checked in the visitor's browser through an RPC and gateway they can override:
//   - the registry confirms the root is enabled (so the root isn't just our server's word)
//   - the tree is fetched from IPFS and rebuilt with the Murky construction
//   - every proof is checked the way ArtRegistry.mintArtwork checks it
//   - tokenURI ties each minted token to the CID in its leaf
// Shown as a ring (works proven), four check cards, then every work with its proof folded inside.
export function AcquisitionProof(props: Props) {
  const { root, registry, works } = props;
  const [result, setResult] = useState<Result | null>(null);
  const [attempt, setAttempt] = useState(0);
  const [open, setOpen] = useState<string | null>(null);

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

  // What the browser established, per leaf and overall.
  const tree = result?.tree.ok ? result.tree : null;
  const leaves = tree ? tree.leaves.map((l) => leafHash(l.tokenId, l.cid)) : [];
  const buildable = leaves.length >= 2;
  const computed = buildable ? murkyRoot(leaves) : null;
  const matches = computed !== null && computed.toLowerCase() === root.toLowerCase();
  const perLeaf = tree
    ? tree.leaves.map((l, i) => {
        const proof = buildable ? murkyProof(leaves, i) : [];
        const valid = buildable && verifyProof(proof, root, leaves[i]);
        const uri = result!.uris[i];
        return { tokenId: l.tokenId.toString(), cid: l.cid, leaf: leaves[i], proof, valid, uri };
      })
    : [];
  const byToken = new Map(perLeaf.map((p) => [p.tokenId, p]));
  // Proven: in the set (valid proof against the root), and, once minted, its token points to its leaf.
  const isProven = (p: (typeof perLeaf)[number]) => p.valid && (!p.uri.ok || p.uri.value);
  const proven = perLeaf.filter(isProven).length;
  const total = tree ? tree.leaves.length : works.length;

  const cards: Card[] = (() => {
    if (!result) return [0, 1, 2, 3].map(() => ({ tone: "run" as const, title: "Checking…", detail: "" }));
    const { chain, enabled, uris } = result;
    if (!chain.ok) return [0, 1, 2, 3].map(() => ({ tone: "unknown" as const, title: "Unable to verify", detail: chain.detail }));
    const registryCard: Card = enabled.ok
      ? enabled.value
        ? { tone: "ok", title: "Root enabled on the registry", detail: "ArtRegistry accepts mints against it" }
        : { tone: "fact", title: "Root not enabled on the registry", detail: "Revoked: nothing more can be minted from it" }
      : { tone: "unknown", title: "Registry not read", detail: enabled.detail };
    const treeCard: Card = tree
      ? { tone: "ok", title: "Tree file fetched from IPFS", detail: `${tree.leaves.length} ${tree.leaves.length === 1 ? "entry" : "entries"}` }
      : result.tree.ok === false && result.tree.reason === "malformed"
        ? { tone: "unknown", title: "Tree file unreadable", detail: `It isn't a gallery tree (${result.tree.detail})` }
        : { tone: "unknown", title: "Tree file not fetched", detail: result.tree.ok ? "" : `${result.tree.detail}; usually temporary` };
    const rebuildCard: Card = !tree
      ? { tone: "unknown", title: "Root not rebuilt", detail: "Needs the tree file" }
      : !buildable
        ? { tone: "unknown", title: "Root not rebuilt", detail: "A single-entry tree has no root in this construction" }
        : matches
          ? { tone: "ok", title: "Tree rebuilds to this root", detail: "Murky construction, entries in file order" }
          : { tone: "bad", title: "Tree doesn't rebuild to this root", detail: `It gives ${computed}` };
    const minted = uris.filter((u) => u.ok);
    const differ = minted.filter((u) => u.ok && !u.value).length;
    const unknown = uris.filter((u) => !u.ok && u.reason !== "rejected").length;
    const tokensCard: Card = !tree
      ? { tone: "unknown", title: "Tokens not compared", detail: "Needs the tree file" }
      : differ
        ? { tone: "bad", title: `${differ} of ${minted.length} minted tokens don't match`, detail: "Their tokenURI isn't their entry's CID" }
        : unknown
          ? { tone: "unknown", title: `${unknown} ${unknown === 1 ? "token" : "tokens"} not read`, detail: "The registry didn't answer for them" }
          : minted.length
            ? { tone: "ok", title: `${minted.length} of ${minted.length} minted tokens match`, detail: "Each tokenURI is its entry's CID" }
            : { tone: "fact", title: "Nothing minted yet", detail: "Every work can still be minted" };
    return [registryCard, treeCard, rebuildCard, tokensCard];
  })();

  const allOk = result !== null && cards.every((c) => c.tone === "ok" || c.tone === "fact");
  const anyBad = cards.some((c) => c.tone === "bad");
  const headline = !result
    ? "Checking this acquisition in your browser…"
    : anyBad
      ? "Something here doesn't match what was voted"
      : allOk
        ? proven === total
          ? "Every work matches what was voted"
          : `${proven} of ${total} works match what was voted`
        : "Part of this acquisition couldn't be checked";

  // The ring: works proven out of the works in the tree. Empty until the browser has an answer.
  const R = 54;
  const C = 2 * Math.PI * R;
  const share = result && total ? proven / total : 0;

  return (
    <section className="acq-proof" aria-labelledby="acq-proof-title">
      <div className="acq-hero">
        <div className="acq-ring" role="img" aria-label={result ? `${proven} of ${total} works proven` : "Checking"}>
          <svg viewBox="0 0 132 132" aria-hidden="true">
            <circle className="acq-ring-bg" cx="66" cy="66" r={R} />
            <circle className="acq-ring-fg" cx="66" cy="66" r={R} strokeDasharray={C} strokeDashoffset={C * (1 - share)} />
          </svg>
          <span className="acq-ring-label" aria-hidden="true">
            <b>{result ? `${proven}/${total}` : "…"}</b>
            <span>works proven</span>
          </span>
        </div>
        <div className="acq-hero-text">
          <h2 id="acq-proof-title">{headline}</h2>
          <p className="muted">
            Your browser rebuilt this acquisition from its public list of works and compared it with the root on chain and
            with each minted token.
          </p>
          {result && <RpcNotice rpc={result.rpc} />}
          <p className="acq-via">
            Checked via <code className="hash">{result?.rpc ?? DEFAULT_BROWSER_RPC}</code> and{" "}
            <code className="hash">{result?.gateway ?? props.gateway}</code>. Add <code>?rpc=</code> or{" "}
            <code>?gateway=</code> to the address to use your own.
          </p>
          <button type="button" className="acq-again" onClick={retry} disabled={!result}>
            Check again
          </button>
        </div>
      </div>

      <ul className="acq-checks">
        {cards.map((c, i) => (
          <li key={i} className={`acq-check is-${c.tone}`} style={{ transitionDelay: `${i * 120}ms` }}>
            <span className="acq-check-mark" aria-hidden="true">
              {MARK[c.tone]}
            </span>
            <b>{c.title}</b>
            <span>{c.detail}</span>
          </li>
        ))}
      </ul>

      <h3 className="acq-kicker">Each work&apos;s proof</h3>
      <ul className="acq-works">
        {works.map((w) => {
          const p = byToken.get(w.tokenId);
          const isOpen = open === w.tokenId;
          const chip = !result ? "…" : !p ? "? Proof" : isProven(p) ? "✓ Proof" : "✕ Proof";
          return (
            <li key={w.tokenId}>
              <button
                type="button"
                className="acq-row"
                aria-expanded={isOpen}
                onClick={() => setOpen(isOpen ? null : w.tokenId)}
              >
                <span className="acq-thumb">{w.src ? <Image src={w.src} alt="" fill sizes="48px" /> : `#${w.tokenId}`}</span>
                <span className="acq-row-text">
                  <span className="acq-row-title">
                    {w.name ?? (w.reissuedAs ? `Image never pinned · reissued as #${w.reissuedAs}` : `Token #${w.tokenId}`)}
                  </span>
                  <span className="acq-row-sub">
                    #{w.tokenId} · {w.minted ? "minted" : "not minted yet"}
                  </span>
                </span>
                <span className={`acq-chip${p && result && !isProven(p) ? " is-bad" : ""}`}>{chip}</span>
              </button>
              {isOpen && (
                <div className="acq-row-body">
                  {p && buildable ? (
                    <ProofPath p={p} root={root} matches={matches} />
                  ) : (
                    <p className="muted small">
                      {result ? "The proof needs the tree file, which couldn't be read." : "Waiting for the tree file…"}
                    </p>
                  )}
                  <div className="acq-row-links">
                    {w.minted && <Link href={`/collection/${w.tokenId}`}>View in the collection →</Link>}
                  </div>
                  {p && buildable && (
                    <details className="acq-more">
                      <summary>The exact mint call</summary>
                      <pre className="call">{`ArtRegistry(${registry}).mintArtwork(\n  [${p.proof.join(",\n   ")}],\n  ${root},\n  ${p.tokenId},\n  "${p.cid}"\n)`}</pre>
                      {p.uri.ok && <p className="muted small">Already minted: this call would revert with ERC721InvalidSender.</p>}
                    </details>
                  )}
                </div>
              )}
            </li>
          );
        })}
      </ul>
      {result && !result.chain.ok && (
        <p>
          ? Unable to verify: {result.chain.detail}.{" "}
          <button type="button" className="acq-again" onClick={retry}>
            Retry
          </button>
        </p>
      )}
    </section>
  );
}

// From the work's entry to the root: one sibling per level (the zero pad where a level is odd).
function ProofPath({ p, root, matches }: { p: { tokenId: string; leaf: Hex; proof: Hex[]; valid: boolean }; root: Hex; matches: boolean }) {
  return (
    <>
      <ol className="acq-path">
        <li>
          <span className="acq-path-k">Entry · #{p.tokenId}</span>
          <HexText text={p.leaf} />
        </li>
        {p.proof.map((s, i) => (
          <li key={i} className={s === zeroHash ? "is-sibling is-zero" : "is-sibling"}>
            <span className="acq-path-k">{s === zeroHash ? `Pairs with the zero pad, level ${i + 1}` : `Pairs with a sibling, level ${i + 1}`}</span>
            <HexText text={s} />
          </li>
        ))}
        <li className="is-root">
          <span className="acq-path-k">Root</span>
          <HexText text={root} />
          <span className={p.valid && matches ? "acq-path-ok" : "acq-path-bad"}>
            {p.valid ? "✓ Equals the root on chain" : "✕ Doesn't reach the root on chain"}
          </span>
        </li>
      </ol>
      <p className="acq-legend">
        <span>
          <i aria-hidden="true" /> this work&apos;s entry and the root
        </span>
        <span>
          <i className="y" aria-hidden="true" /> siblings in its proof
        </span>
      </p>
    </>
  );
}
