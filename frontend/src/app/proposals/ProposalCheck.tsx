"use client";

import { useEffect, useState } from "react";
import type { Address, Hex } from "viem";
import {
  browserClient,
  browserGateway,
  browserRpcUrl,
  checkGalleryEnabled,
  checkProposalBinding,
  decodeGalleryAction,
  type Check,
} from "@/lib/browser/checks";
import { computeRoot, fetchGallery, parseTreeCids } from "@/lib/gallery";
import { PROPOSAL_STATES } from "@/lib/states";

// Display-ready strings only (B6): ids and values as decimal strings.
type Props = { id: string; targets: string[]; values: string[]; calldatas: string[]; description: string; gateway: string };

type Line = { ok: boolean | null; text: string };

// Two separate claims, never merged into one tick:
//   "matches the vote"  - the tree rebuilds to the root in the calldata the Governor voted on
//   "enabled"           - the registry currently accepts mints against that root
async function run(p: Props, rpc: string, gateway: string): Promise<Line[]> {
  const client = browserClient(rpc);
  const contents = {
    id: BigInt(p.id),
    targets: p.targets as Address[],
    values: p.values.map(BigInt),
    calldatas: p.calldatas as Hex[],
    description: p.description,
  };

  const binding = await checkProposalBinding(client, contents);
  if (!binding.ok) return [bindingLine(binding)];
  const lines: Line[] = [bindingLine(binding)];
  const state = PROPOSAL_STATES[binding.value];

  for (const [i, target] of contents.targets.entries()) {
    const action = decodeGalleryAction(target, contents.calldatas[i]);
    if (!action) {
      lines.push({ ok: null, text: `Action ${i + 1}: not a gallery action; nothing to rebuild.` });
      continue;
    }
    if (action.kind === "revoke") {
      lines.push({ ok: null, text: `Action ${i + 1}: revokes gallery ${action.root}; nothing to rebuild.` });
      continue;
    }

    // The CID comes from the description the browser just bound to the id.
    const cids = parseTreeCids(contents.description);
    if (cids.length !== 1) {
      lines.push({ ok: false, text: `Action ${i + 1}: unverifiable, the description names ${cids.length} tree CIDs.` });
      continue;
    }
    const gallery = await fetchGallery(cids[0], gateway);
    if (!gallery.ok) {
      lines.push({ ok: false, text: `Action ${i + 1}: unverifiable, tree fetch failed (${gallery.reason}: ${gallery.detail}).` });
      continue;
    }
    if (gallery.leaves.length < 2) {
      lines.push({ ok: false, text: `Action ${i + 1}: unverifiable, single-leaf tree.` });
      continue;
    }
    const computed = computeRoot(gallery.leaves);
    const matches = computed.toLowerCase() === action.root.toLowerCase();
    lines.push({
      ok: matches,
      text: matches
        ? `Action ${i + 1}: matches the vote. The tree at ipfs://${cids[0]} rebuilds to ${action.root}, the root in the voted calldata.`
        : `Action ${i + 1}: does NOT match the vote. The tree rebuilds to ${computed}, the calldata says ${action.root}.`,
    });

    if (state === "Executed") {
      const enabled = await checkGalleryEnabled(client, action.root);
      lines.push(
        enabled.ok
          ? {
              ok: enabled.value,
              text: enabled.value
                ? `Action ${i + 1}: enabled on the registry. ArtRegistry accepts mints against this root today.`
                : `Action ${i + 1}: not enabled on the registry (revoked since execution).`,
            }
          : { ok: null, text: `Action ${i + 1}: couldn't read the registry (${enabled.detail}).` },
      );
    }
  }
  return lines;
}

function bindingLine(binding: Check<number>): Line {
  if (binding.ok)
    return {
      ok: true,
      text: `Proposal contents hash to this id and the Governor knows it (state: ${PROPOSAL_STATES[binding.value]}). The calldata and description below are the ones put to the vote.`,
    };
  if (binding.reason === "rejected") return { ok: false, text: `Proposal contents are NOT what the Governor recorded: ${binding.detail}.` };
  return { ok: null, text: `Couldn't reach the RPC to check (${binding.detail}).` };
}

export function ProposalCheck(props: Props) {
  const [rpc, setRpc] = useState<string | null>(null);
  const [lines, setLines] = useState<Line[] | null>(null);
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    let cancelled = false;
    const url = browserRpcUrl();
    run(props, url, browserGateway(props.gateway)).then((result) => {
      if (cancelled) return;
      setRpc(url);
      setLines(result);
    });
    return () => {
      cancelled = true;
    };
    // props are static per render of the server page
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [attempt]);

  return (
    <section className="browser-check">
      <h3>Checked in your browser</h3>
      {!lines ? (
        <p className="muted small">Checking against the Governor…</p>
      ) : (
        <>
          <ul className="plain checks">
            {lines.map((l, i) => (
              <li key={i}>
                <span aria-hidden="true">{l.ok === true ? "✓" : l.ok === false ? "✕" : "–"}</span>{" "}
                <span className="hash">{l.text}</span>
              </li>
            ))}
          </ul>
          <p className="muted small">
            Via <code className="hash">{rpc}</code>. Use <code>?rpc=</code> / <code>?gateway=</code> to check through
            your own endpoints. <button onClick={() => { setLines(null); setAttempt((n) => n + 1); }}>Re-check</button>
          </p>
        </>
      )}
    </section>
  );
}
