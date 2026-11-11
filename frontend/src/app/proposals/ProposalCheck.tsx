"use client";

import { useEffect, useState } from "react";
import type { Address, Hex, PublicClient } from "viem";
import { RpcNotice } from "@/components/RpcNotice";
import {
  browserClient,
  browserGateway,
  browserRpcUrl,
  checkChain,
  checkGalleryEnabled,
  checkProposalBinding,
  decodeGalleryAction,
  type Check,
} from "@/lib/browser/checks";
import { computeRoot, fetchGallery, parseTreeCids } from "@/lib/gallery";
import { PROPOSAL_STATES, type ProposalState } from "@/lib/states";

// Display-ready strings only (B6): ids and values as decimal strings.
type Props = { id: string; targets: string[]; values: string[]; calldatas: string[]; description: string; gateway: string };

// pass ✓ · fail ✕ (the chain contradicts what is shown) · unverifiable ? (couldn't get an answer:
// never a mismatch) · info – (a fact, not a verdict)
type Status = "pass" | "fail" | "unverifiable" | "info";
type Line = { status: Status; text: string };
const GLYPH: Record<Status, string> = { pass: "✓", fail: "✕", unverifiable: "?", info: "–" };

// Two separate claims, never merged into one tick:
//   "matches the vote"  - the tree rebuilds to the root in the calldata the Governor voted on
//   "enabled"           - the registry currently accepts mints against that root
export async function runProposalCheck(p: Props, rpc: string, gateway: string): Promise<Line[]> {
  const client = browserClient(rpc);

  const chain = await checkChain(client, rpc);
  if (!chain.ok) return [{ status: "unverifiable", text: `Unable to verify: ${chain.detail}.` }];

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
    const n = `Action ${i + 1}`;
    // Target must be the hardcoded ArtRegistry and the selector addGallery / revokeGallery.
    const action = decodeGalleryAction(target, contents.calldatas[i]);
    if (!action) {
      lines.push({ status: "info", text: `${n}: not a gallery action; nothing to rebuild.` });
      continue;
    }
    if (action.kind === "revoke") {
      lines.push(await revokeLine(client, n, action.root, state));
      continue;
    }

    // The CID comes from the description the browser just bound to the id.
    const cids = parseTreeCids(contents.description);
    if (cids.length !== 1) {
      lines.push({ status: "unverifiable", text: `${n}: unable to verify, the description names ${cids.length} tree CIDs.` });
      continue;
    }
    const gallery = await fetchGallery(cids[0], gateway);
    if (!gallery.ok) {
      lines.push({ status: "unverifiable", text: `${n}: unable to verify, tree ${gallery.reason === "gateway" ? "fetch failed" : "file is malformed"} (${gallery.detail}).` });
      continue;
    }
    if (gallery.leaves.length < 2) {
      lines.push({ status: "unverifiable", text: `${n}: unable to verify, single-leaf tree.` });
      continue;
    }
    const computed = computeRoot(gallery.leaves);
    const matches = computed.toLowerCase() === action.root.toLowerCase();
    lines.push(
      matches
        ? { status: "pass", text: `${n}: matches the vote. The tree at ipfs://${cids[0]} rebuilds to ${action.root}, the root in the voted calldata.` }
        : { status: "fail", text: `${n}: does NOT match the vote. The tree rebuilds to ${computed}, the calldata says ${action.root}.` },
    );

    if (state === "Executed") {
      const enabled = await checkGalleryEnabled(client, action.root);
      if (!enabled.ok) lines.push({ status: "unverifiable", text: `${n}: unable to read the registry (${enabled.detail}).` });
      else if (enabled.value) lines.push({ status: "pass", text: `${n}: enabled on the registry. ArtRegistry accepts mints against this root today.` });
      // Governance can revoke a gallery after the fact: a state, not a failure.
      else lines.push({ status: "info", text: `${n}: executed, later revoked. The root is no longer enabled on the registry.` });
    }
  }
  return lines;
}

// A revoke has no tree to rebuild; the meaningful check is the registry's current answer for the root.
export async function revokeLine(client: PublicClient, n: string, root: Hex, state: ProposalState): Promise<Line> {
  if (state === "Defeated" || state === "Canceled" || state === "Expired")
    return { status: "info", text: `${n}: would have revoked gallery ${root}; never executed.` };
  const enabled = await checkGalleryEnabled(client, root);
  if (!enabled.ok) return { status: "unverifiable", text: `${n}: revokes gallery ${root}; unable to read the registry (${enabled.detail}).` };
  if (state === "Executed")
    return enabled.value
      ? { status: "info", text: `${n}: revoked gallery ${root}, but the root is enabled again (re-added by a later proposal).` }
      : { status: "pass", text: `${n}: revocation in effect. Gallery ${root} is no longer enabled on the registry.` };
  // Pending, Active, Succeeded, Queued: the outcome can still change.
  return enabled.value
    ? { status: "info", text: `${n}: revokes gallery ${root}, currently enabled; executing this disables minting from it.` }
    : { status: "info", text: `${n}: revokes gallery ${root}, which is not enabled now, so execution would revert.` };
}

function bindingLine(binding: Check<number>): Line {
  if (binding.ok)
    return {
      status: "pass",
      text: `Proposal contents hash to this id and the Governor knows it (state: ${PROPOSAL_STATES[binding.value]}). The calldata and description below are the ones put to the vote.`,
    };
  if (binding.reason === "rejected") return { status: "fail", text: `Proposal contents are NOT what the Governor recorded: ${binding.detail}.` };
  // "unreachable" and "unexpected-revert": no trustworthy answer, never a mismatch.
  return { status: "unverifiable", text: `Unable to verify: ${binding.detail}.` };
}

export function ProposalCheck(props: Props) {
  const [rpc, setRpc] = useState<string | null>(null);
  const [lines, setLines] = useState<Line[] | null>(null);
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    let cancelled = false;
    const url = browserRpcUrl();
    runProposalCheck(props, url, browserGateway(props.gateway)).then((result) => {
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
      {!lines || !rpc ? (
        <p className="muted small">Checking against the Governor…</p>
      ) : (
        <>
          <RpcNotice rpc={rpc} />
          <ul className="plain checks">
            {lines.map((l, i) => (
              <li key={i}>
                <span aria-hidden="true">{GLYPH[l.status]}</span> <span className="hash">{l.text}</span>
              </li>
            ))}
          </ul>
          <p className="muted small">
            Via <code className="hash">{rpc}</code>. ✓ passed · ✕ the chain contradicts what is shown · ? unable to
            verify (not a mismatch) · – fact. Use <code>?rpc=</code> / <code>?gateway=</code> to check through your own
            endpoints.{" "}
            <button
              onClick={() => {
                setLines(null);
                setAttempt((n) => n + 1);
              }}
            >
              Re-check
            </button>
          </p>
        </>
      )}
    </section>
  );
}
