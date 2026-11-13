"use client";

import { useState } from "react";
import type { Hex } from "viem";
import { computeRoot, parseGallery } from "@/lib/gallery";

type Outcome = { ok: true; leaves: number; root: Hex } | { ok: false; error: string };

function rebuild(text: string): Outcome {
  let body: unknown;
  try {
    body = JSON.parse(text);
  } catch {
    return { ok: false, error: "it isn't valid JSON" };
  }
  const tree = parseGallery(body);
  if (!tree.ok) return { ok: false, error: `it isn't a gallery tree (${tree.detail})` };
  if (tree.leaves.length < 2) return { ok: false, error: "a single-entry tree has no root in this construction" };
  return { ok: true, leaves: tree.leaves.length, root: computeRoot(tree.leaves) };
}

// The visitor's own copy of the tree, hashed locally: nothing is uploaded and no network call is
// made. Separate from the browser checks, which fetch the published tree themselves.
export function TreeRebuild({ root }: { root: Hex }) {
  const [file, setFile] = useState<{ name: string; outcome: Outcome } | null>(null);
  const [dragging, setDragging] = useState(false);

  const check = async (picked: File | undefined) => {
    if (picked) setFile({ name: picked.name, outcome: rebuild(await picked.text()) });
  };

  return (
    <section className="rebuild" aria-labelledby="rebuild-title">
      <h2 id="rebuild-title">Rebuild the root from your own file</h2>
      <p>
        Use the tree file above or your own copy, and check that it gives this gallery&apos;s root. The file is read in
        your browser: nothing is uploaded.
      </p>
      <label
        htmlFor="tree-file"
        className={dragging ? "dropzone dragging" : "dropzone"}
        onDragOver={(e) => {
          e.preventDefault();
          setDragging(true);
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={(e) => {
          e.preventDefault();
          setDragging(false);
          check(e.dataTransfer.files[0]);
        }}
      >
        <input
          id="tree-file"
          className="visually-hidden"
          type="file"
          accept=".json,application/json"
          onChange={(e) => check(e.target.files?.[0])}
        />
        {file ? (
          <>
            <code>{file.name}</code> · <u>choose another</u>
          </>
        ) : (
          <>
            Drop the tree file here, or <u>choose a file</u>
          </>
        )}
      </label>

      {file &&
        (file.outcome.ok ? (
          <div className="rebuild-result">
            <p>
              <code>{file.name}</code> ({file.outcome.leaves} entries) rebuilds to{" "}
              <code className="hash">{file.outcome.root}</code>
            </p>
            <p>
              <strong>
                {file.outcome.root.toLowerCase() === root.toLowerCase()
                  ? "✓ Matches this gallery's root."
                  : "✕ Doesn't match this gallery's root."}
              </strong>
            </p>
          </div>
        ) : (
          <p className="rebuild-result">
            ? Can&apos;t rebuild <code>{file.name}</code>: {file.outcome.error}.
          </p>
        ))}

      <details>
        <summary>How the root is computed</summary>
        <ol className="small">
          <li>
            Each entry <code>{`{ "tokenId", "cId" }`}</code>, in file order, becomes a leaf:{" "}
            <code>keccak256(bytes.concat(keccak256(abi.encode(tokenId, cId))))</code>. This is the leaf{" "}
            <code>ArtRegistry.mintArtwork</code> checks.
          </li>
          <li>Leaves are paired with their neighbour, level by level. A level with an odd count pairs its last node with <code>bytes32(0)</code>.</li>
          <li>
            Each pair is hashed in ascending order: <code>keccak256(smaller ‖ larger)</code>.
          </li>
          <li>The last remaining hash is the root.</li>
        </ol>
        <p className="muted small">
          This is Murky&apos;s construction, which built galleries 001 and 002. Order matters: moving an entry into a
          different pair changes the root, while swapping the two entries of a pair doesn&apos;t, because each pair is
          hashed sorted. OpenZeppelin&apos;s <code>StandardMerkleTree</code> sorts the leaves first, so it gives a
          different root for the same file.
        </p>
      </details>
    </section>
  );
}
