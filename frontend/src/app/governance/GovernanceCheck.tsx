"use client";

import { useEffect, useState } from "react";
import type { Address, Hex } from "viem";
import { RpcNotice } from "@/components/RpcNotice";
import { HexText } from "@/components/ui";
import { clearBrowserOutcomes, setBrowserOutcome, type BrowserOutcome } from "@/lib/browser/checkStore";
import {
  browserClient,
  browserGateway,
  browserRpcUrl,
  checkChain,
  checkProposalBinding,
  DEFAULT_BROWSER_RPC,
  decodeGalleryAction,
  type Check,
} from "@/lib/browser/checks";
import { computeRoot, fetchGallery, parseTreeCids } from "@/lib/gallery";

// Display-ready strings only: ids and values as decimal strings.
export type CheckedProposal = { id: string; title: string; targets: string[]; values: string[]; calldatas: string[]; description: string };

type Line = { status: BrowserOutcome; text: string };
type Result = { id: string; lines: Line[]; outcome: BrowserOutcome };

const GLYPH: Record<BrowserOutcome, string> = { pass: "✓", fail: "✕", unverifiable: "?" };

// Two claims per proposal, in the visitor's browser:
//   - its contents hash to its id and the Governor knows it: what the page shows is what was voted on
//   - each gallery it adds rebuilds, from the tree on IPFS, to the root in the voted calldata
// Anything else (a gallery's state today, a treasury action) isn't about the vote and isn't checked here.
async function checkProposal(p: CheckedProposal, rpc: string, gateway: string): Promise<Result> {
  const client = browserClient(rpc);
  const done = (lines: Line[]): Result => ({
    id: p.id,
    lines,
    outcome: lines.some((l) => l.status === "fail") ? "fail" : lines.some((l) => l.status === "unverifiable") ? "unverifiable" : "pass",
  });

  const chain = await checkChain(client, rpc);
  if (!chain.ok) return done([{ status: "unverifiable", text: `Unable to verify: ${chain.detail}. This is not a mismatch.` }]);

  const contents = {
    id: BigInt(p.id),
    targets: p.targets as Address[],
    values: p.values.map(BigInt),
    calldatas: p.calldatas as Hex[],
    description: p.description,
  };
  const binding = await checkProposalBinding(client, contents);
  if (!binding.ok) return done([bindingLine(binding)]);
  const lines: Line[] = [bindingLine(binding)];

  const several = contents.targets.length > 1;
  for (const [i, target] of contents.targets.entries()) {
    const action = decodeGalleryAction(target, contents.calldatas[i]);
    if (!action || action.kind !== "add") continue;
    const n = several ? `Action ${i + 1}: the` : "The";
    const uid = `${p.id}-${i}`;
    const line = await galleryLine(n, action.root, contents.description, gateway);
    setBrowserOutcome(uid, line.status);
    lines.push(line);
  }
  return done(lines);
}

// The CID comes from the description the browser just bound to the id.
async function galleryLine(n: string, root: Hex, description: string, gateway: string): Promise<Line> {
  const cids = parseTreeCids(description);
  if (cids.length !== 1)
    return { status: "unverifiable", text: `${n} gallery's tree can't be checked: the description names ${cids.length} tree files. This is not a mismatch.` };
  const tree = await fetchGallery(cids[0], gateway);
  if (!tree.ok)
    return { status: "unverifiable", text: `${n} gallery's tree couldn't be ${tree.reason === "gateway" ? "fetched" : "read"} (${tree.detail}). This is not a mismatch.` };
  if (tree.leaves.length < 2) return { status: "unverifiable", text: `${n} gallery's tree has a single entry, which has no root in this construction.` };
  const computed = computeRoot(tree.leaves);
  return computed.toLowerCase() === root.toLowerCase()
    ? { status: "pass", text: `${n} gallery's tree, fetched from IPFS, rebuilds to the root in the voted calldata.` }
    : { status: "fail", text: `${n} gallery doesn't match the vote: its tree rebuilds to ${computed}, the vote says ${root}.` };
}

function bindingLine(binding: Check<number>): Line {
  if (binding.ok)
    return { status: "pass", text: "These are the actions and the description that were voted on: they hash to this proposal's id on the Governor." };
  if (binding.reason === "rejected")
    return { status: "fail", text: `These aren't the actions and description the Governor recorded: ${binding.detail}.` };
  // "unreachable" and "unexpected-revert": no trustworthy answer, never a mismatch.
  return { status: "unverifiable", text: `Unable to verify: ${binding.detail}. This is not a mismatch.` };
}

// One band for the whole page: the outcome, the RPC and Re-check said once; each proposal's lines in
// its Details, which open by themselves when something doesn't match.
export function GovernanceCheck({ proposals, gateway }: { proposals: CheckedProposal[]; gateway: string }) {
  const [rpc, setRpc] = useState<string | null>(null);
  const [results, setResults] = useState<Map<string, Result>>(new Map());
  const [attempt, setAttempt] = useState(0);
  const [open, setOpen] = useState<boolean | null>(null);

  useEffect(() => {
    let cancelled = false;
    const url = browserRpcUrl();
    const gw = browserGateway(gateway);
    for (const p of proposals)
      checkProposal(p, url, gw).then((r) => {
        if (cancelled) return;
        setRpc(url);
        setResults((m) => new Map(m).set(r.id, r));
      });
    return () => {
      cancelled = true;
    };
    // proposals are static per render of the server page
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [attempt]);

  const total = proposals.length;
  const done = [...results.values()];
  const failed = done.filter((r) => r.outcome === "fail").length;
  const unknown = done.filter((r) => r.outcome === "unverifiable").length;
  const running = done.length < total;
  const tone = failed ? "bad" : running ? "run" : unknown ? "unknown" : "ok";
  const headline = failed
    ? `Your browser found ${failed} ${failed === 1 ? "proposal" : "proposals"} that ${failed === 1 ? "doesn't" : "don't"} match the vote`
    : running
      ? `Checking the ${total} proposals in your browser…`
      : unknown
        ? `Your browser couldn't check ${unknown} of ${total} proposals`
        : `Your browser checked ${total} of ${total} proposals: each matches what was voted`;
  const isOpen = open ?? failed > 0;

  const recheck = () => {
    clearBrowserOutcomes();
    setResults(new Map());
    setAttempt((n) => n + 1);
  };

  if (total === 0) return null;
  return (
    <section className={`gov-check is-${tone}`} aria-labelledby="gov-check-title">
      <div className="gov-check-band">
        <span className="gov-check-mark" aria-hidden="true">
          {tone === "ok" ? "✓" : tone === "bad" ? "✕" : tone === "unknown" ? "?" : ""}
        </span>
        <div className="gov-check-text">
          <h2 id="gov-check-title">{headline}</h2>
          <p>
            Each proposal&apos;s actions and description are rehashed and compared with the Governor, and each
            gallery&apos;s tree is rebuilt from IPFS. One thing your browser can&apos;t check: this list comes from our
            server, which could leave a proposal out. It can&apos;t alter or invent one.
          </p>
          <p className="gov-check-via">
            Via <code className="hash">{rpc ?? DEFAULT_BROWSER_RPC}</code>. Add <code>?rpc=</code> to the address to use
            your own.
          </p>
          {rpc && <RpcNotice rpc={rpc} />}
          <button type="button" className="gov-check-more" aria-expanded={isOpen} onClick={() => setOpen(!isOpen)}>
            {isOpen ? "Hide details" : "Details"}
          </button>
        </div>
        <button type="button" className="gov-check-again" onClick={recheck} disabled={running}>
          Re-check
        </button>
      </div>

      {isOpen && (
        <ul className="gov-check-list">
          {proposals.map((p) => {
            const r = results.get(p.id);
            return (
              <li key={p.id} className={`gov-check-item is-${r ? r.outcome : "run"}`}>
                <a href={`#${p.id}`} className="gov-check-name">
                  <HexText text={p.title} />
                </a>
                {r ? (
                  <ul>
                    {r.lines.map((l, i) => (
                      <li key={i} className={`is-${l.status}`}>
                        <span aria-hidden="true">{GLYPH[l.status]}</span>
                        <span>
                          <HexText text={l.text} />
                        </span>
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p className="muted small">Checking…</p>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
