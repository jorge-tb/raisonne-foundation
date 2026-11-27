import Image from "next/image";
import Link from "next/link";
import type { ReactNode } from "react";
import { formatEther, isAddress, isHex, type Address, type Hex } from "viem";
import { ContractGlyph, type ContractKind } from "@/components/ContractGlyph";
import { Blockie } from "@/components/holders/Blockie";
import { External } from "@/components/ui";
import { TimelockController } from "@/generated/contracts";
import { decodeCall, type ContractName } from "@/lib/actions";
import { etherscanAddress, etherscanCode, etherscanTxLogs } from "@/lib/format";
import type { SnapshotProposal } from "@/lib/server/snapshot";
import type { ProposalState } from "@/lib/states";
import { CopyButton } from "./CopyButton";

// One proposal action as a layered card: what it does (category, sentence, flow), what needs a second
// look (only when something does), and the call itself under "Under the hood". Anyone can propose any
// calldata, so every layer is derived from the decoded call, never from the description.

export type ActionArtwork = { id: bigint; name: string | null; src: string | null; ratio: number | null };
export type ActionContext = {
  state: ProposalState;
  executedTx: Hex | null;
  treasuryBalance: bigint;
  artworkOf: (id: bigint) => ActionArtwork;
  holderSlot: (address: Address) => number | null;
};

type Action = SnapshotProposal["actions"][number];
type Category = "treasury" | "collection" | "protocol" | "unknown" | "malformed";
type Flag = { level: "review" | "fail"; title: string; text: ReactNode; link?: { href: string; label: string } };
type Check = { status: "pass" | "fail" | "info"; text: ReactNode };
type End = { icon: ReactNode; name: string; id?: string; note?: string; tone?: "fund" | "receiver" | "ink" | "neutral" | "unknown" };

const CATEGORY_LABEL: Record<Category, string> = {
  treasury: "Treasury",
  collection: "Collection",
  protocol: "Protocol",
  unknown: "Unknown",
  malformed: "Malformed",
};

// would / will / did / didn't, following the proposal.
function tense(state: ProposalState) {
  switch (state) {
    case "Pending":
    case "Active":
      return { i: 0, mode: "live", note: "if the vote passes" } as const;
    case "Succeeded":
    case "Queued":
      return { i: 1, mode: "live", note: "once executed" } as const;
    case "Executed":
      return { i: 2, mode: "done", note: null } as const;
    default:
      return { i: 3, mode: "off", note: null } as const;
  }
}

export function ActionCard({ action: a, ctx, uid }: { action: Action; ctx: ActionContext; uid: string }) {
  const t = tense(ctx.state);
  const m = describe(a, ctx, t.mode);
  const verb = <b className="ac-verb">{m.verbs[t.i]}</b>;
  const call = decodeCall(a.target, a.calldata);
  const attention = t.mode === "live" ? (ctx.state === "Pending" || ctx.state === "Active" ? "Before you vote" : "Before it runs") : "Worth knowing";
  const calldataId = `calldata-${uid}`;
  const flags = a.value > 0n ? [...m.flags, valueFlag(a.value)] : m.flags;

  return (
    <article className={`ac ac-${t.mode} ac-cat-${m.category}`}>
      <header className="ac-top">
        <span className={`ac-cat ${m.category}`}>{CATEGORY_LABEL[m.category]}</span>
        {t.note && <span className="ac-when">{t.note}</span>}
      </header>

      <p className="ac-sentence">{m.sentence(verb)}</p>

      <div className="ac-flow">
        <FlowEnd end={m.from} />
        <span className="ac-path">
          <span className="ac-line" />
          <span className="ac-cargo">
            {m.cargo}
            {m.cargoSub && <span className="ac-cargo-sub">{m.cargoSub}</span>}
          </span>
          <span className="ac-line ac-line-end" />
        </span>
        <FlowEnd end={m.to} />
      </div>

      {m.quote}

      {flags.length > 0 && (
        <div className="ac-note">
          <span className="ac-label">{attention}</span>
          <ul>
            {flags.map((f, i) => (
              <li key={i} className={f.level}>
                <span className="ac-note-icon" aria-hidden="true">
                  {f.level === "fail" ? "✕" : <EyeIcon />}
                </span>
                <span>
                  <b>{f.title}.</b> {f.text}
                  {f.link && (
                    <>
                      {" "}
                      <External href={f.link.href}>{f.link.label}</External>
                    </>
                  )}
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}

      <details className="ac-hood" open={m.category === "protocol" || m.category === "unknown" || m.category === "malformed" ? true : undefined}>
        <summary>Under the hood</summary>
        <div className="ac-hood-body">
          <dl className="ac-receipt">
            <dt>Contract</dt>
            <dd>
              <b>{call.contract ?? "Unrecognised contract"}</b> <Id value={a.target} link />
            </dd>
            <dt>Function</dt>
            <dd className="ac-fn">{call.signature ?? `unknown, selector ${a.calldata.slice(0, 10)}`}</dd>
            {call.params.map((p) => (
              <ParamRow key={p.name} name={p.name} type={p.type} value={p.value} />
            ))}
            <dt>ETH sent</dt>
            <dd>{formatEther(a.value)}</dd>
            <dt>Caller</dt>
            <dd>
              <b>TimelockController</b> <Id value={TimelockController.address} link />
            </dd>
          </dl>
          {m.checks.length > 0 && (
            <>
              <span className="ac-label">Checked by our server</span>
              <ul className="ac-checks">
                {m.checks.map((c, i) => (
                  <li key={i} className={c.status}>
                    <span aria-hidden="true">{c.status === "pass" ? "✓" : c.status === "fail" ? "✕" : "i"}</span>
                    <span>{c.text}</span>
                  </li>
                ))}
              </ul>
            </>
          )}
          <span className="ac-label">Calldata</span>
          <code className="ac-calldata" id={calldataId}>
            <span className="ac-selector">{a.calldata.slice(0, 10)}</span>
            {a.calldata.slice(10)}
          </code>
          <span className="ac-hood-actions">
            <CopyButton value={a.calldata} label="Copy calldata" targetId={calldataId} />
            {t.mode === "done" && ctx.executedTx && (
              <External href={etherscanTxLogs(ctx.executedTx)}>{m.event ? `${m.event} event` : "Execution transaction"} ↗</External>
            )}
          </span>
        </div>
      </details>
    </article>
  );
}

// ---------- What each kind of action says ----------

type Model = {
  key: string;
  category: Category;
  verbs: [string, string, string, string];
  sentence: (verb: ReactNode) => ReactNode;
  from: End;
  cargo: ReactNode;
  cargoSub?: string;
  to: End;
  quote?: ReactNode;
  flags: Flag[];
  checks: Check[];
  event?: string;
};

const contractEnd = (name: ContractName | "Timelock", address: Address, tone: End["tone"] = "fund"): End => ({
  icon: <ContractGlyph kind={(name === "Timelock" ? "TimelockController" : name) as ContractKind} size={18} />,
  name,
  id: address,
  tone,
});

const decodedWith = (name: string): Check => ({ status: "pass", text: `Decoded with ${name}'s ABI at its known address` });

function describe(a: Action, ctx: ActionContext, mode: "live" | "done" | "off"): Model {
  const k = a.kind;
  const v = a.verification;
  const failIf = (warning: string | null, title = "Would revert"): Flag[] => (warning ? [{ level: "fail", title, text: warning }] : []);

  switch (k.kind) {
    case "pay": {
      const share = mode !== "done" && ctx.treasuryBalance > 0n ? Number((k.amount * 1000n) / ctx.treasuryBalance) / 10 : null;
      return {
        key: "pay",
        category: "treasury",
        verbs: ["Would pay", "Will pay", "Paid", "Not paid"],
        sentence: (verb) => (
          <>
            {verb} <Amount value={k.amount} /> from the treasury to <Id value={k.to} />
          </>
        ),
        from: contractEnd("FundTreasury", a.target),
        cargo: (
          <>
            <Amount value={k.amount} />
            {share !== null && (
              <span className="ac-meter" role="img" aria-label={`${share}% of the treasury`}>
                <span style={{ width: `${Math.min(share, 100)}%` }} />
              </span>
            )}
          </>
        ),
        cargoSub: share !== null ? `${share}% of the treasury today` : undefined,
        to: receiverEnd("Receiver", k.to, ctx),
        quote: (
          <blockquote className="ac-quote">
            {k.reason ? <q>{k.reason}</q> : <span className="muted">No reason given.</span>}
            <span className="muted small">
              Reason, recorded on chain in the <code>Paid</code> event
            </span>
          </blockquote>
        ),
        flags: failIf(a.revertWarning),
        checks: [decodedWith("FundTreasury")],
        event: "Paid",
      };
    }

    case "sell": {
      const art = ctx.artworkOf(k.artworkId);
      return {
        key: "sell",
        category: "treasury",
        verbs: ["Would sell", "Will sell", "Sold", "Not sold"],
        sentence: (verb) => (
          <>
            {verb} <b>{art.name ?? `artwork #${k.artworkId}`}</b>
            {art.name && ` (artwork #${k.artworkId})`} from the treasury to <Id value={k.to} />
          </>
        ),
        from: contractEnd("FundTreasury", a.target),
        cargo: (
          <Link href={`/collection/${k.artworkId}`} className="ac-art">
            {art.src && art.ratio ? (
              <Image src={art.src} alt="" height={44} width={Math.round(44 * art.ratio)} />
            ) : (
              <span className="ac-art-blank" />
            )}
            <span>
              <span className="muted small">Artwork #{k.artworkId.toString()}</span>
              <b>{art.name ?? "Unnamed"}</b>
            </span>
          </Link>
        ),
        cargoSub: "price settled outside the call",
        to: receiverEnd("Buyer", k.to, ctx),
        flags: failIf(a.revertWarning),
        checks: [decodedWith("FundTreasury"), { status: "info", text: "The call moves the artwork only: read the description for the price" }],
        event: "Sold",
      };
    }

    case "add-gallery": {
      const leaves = v.status === "match" || v.status === "mismatch" ? v.leaves : null;
      const cid = v.status === "match" || v.status === "mismatch" ? v.cid : null;
      const flags: Flag[] = [];
      const checks: Check[] = [decodedWith("ArtRegistry")];
      if (v.status === "match")
        checks.push({ status: "pass", text: <>The tree at <Id value={`ipfs://${v.cid}`} /> rebuilds to the root in the calldata</> });
      if (v.status === "mismatch") {
        flags.push({ level: "fail", title: "Doesn't match its tree", text: <>The tree published at <Id value={`ipfs://${v.cid}`} /> rebuilds to <Id value={v.computed} />, not to the root voted on.</> });
        checks.push({ status: "fail", text: "The published tree rebuilds to a different root" });
      }
      if (v.status === "unverifiable")
        flags.push({ level: "review", title: "The tree can't be checked", text: `${v.reason}. Rebuild it yourself before voting.` });
      return {
        key: "add",
        category: "collection",
        verbs: ["Would add", "Will add", "Added", "Not added"],
        sentence: (verb) => (
          <>
            {verb} a gallery{leaves !== null && <> of <b>{leaves} works</b></>} to the registry, root <Id value={k.root} />
          </>
        ),
        from: { icon: <TreeIcon />, name: "Acquisition tree", ...(cid ? { id: `ipfs://${cid}` } : { note: "tree not found" }), tone: "fund" },
        cargo: <TreeMarks count={leaves} />,
        cargoSub: leaves !== null ? `Merkle root of ${leaves} works` : "Merkle root",
        to: contractEnd("ArtRegistry", a.target),
        flags,
        checks,
        event: "GalleryAdded",
      };
    }

    case "revoke-gallery":
      return {
        key: "revoke",
        category: "collection",
        verbs: ["Would revoke", "Will revoke", "Revoked", "Not revoked"],
        sentence: (verb) => (
          <>
            {verb} gallery <Id value={k.root} />: no more works can be minted from it
          </>
        ),
        from: contractEnd("ArtRegistry", a.target),
        cargo: <TreeMarks count={null} />,
        cargoSub: "minting from it stops",
        to: { icon: <LockIcon />, name: "Minting closed", note: "minted works stay minted", tone: "neutral" },
        flags: failIf(a.revertWarning),
        checks: [decodedWith("ArtRegistry")],
        event: "GalleryRevoked",
      };

    case "upgrade":
      return {
        key: "upgrade",
        category: "protocol",
        verbs: ["Would replace", "Will replace", "Replaced", "Not replaced"],
        sentence: (verb) => (
          <>
            {verb} <b>all of {k.contract}&apos;s code</b> with the contract at <Id value={k.implementation} />
          </>
        ),
        from: contractEnd(k.contract, a.target),
        cargo: <span className="ac-amount ac-ink">New code</span>,
        cargoSub: k.data === "0x" ? "no setup call" : "with a setup call",
        to: { icon: <CodeIcon />, name: "Implementation", id: k.implementation, tone: "ink" },
        flags: [
          {
            level: "review",
            title: "Read the new code",
            text:
              k.contract === "FundTreasury"
                ? "It replaces every rule the treasury follows and will control all its ETH and artworks."
                : `It replaces every rule ${k.contract} follows.`,
            link: { href: etherscanCode(k.implementation), label: "Verified source ↗" },
          },
        ],
        checks: [decodedWith(k.contract)],
        event: "Upgraded",
      };

    case "contract-call":
      return {
        key: "call",
        category: "protocol",
        verbs: ["Would call", "Will call", "Called", "Not called"],
        sentence: (verb) => (
          <>
            {verb} <code className="ac-code">{k.functionName}</code> on {k.contract}, one of the fund&apos;s own contracts
          </>
        ),
        from: contractEnd("Timelock", TimelockController.address),
        cargo: <span className="ac-amount ac-ink ac-fn-name">{k.functionName}</span>,
        cargoSub: "changes how the fund runs",
        to: contractEnd(k.contract, a.target, "ink"),
        flags: [
          {
            level: "review",
            title: "Check the arguments",
            text: `It changes a setting, role or owner of ${k.contract}. Its arguments are decoded under the hood.`,
          },
        ],
        checks: [decodedWith(k.contract)],
      };

    case "malformed":
      return {
        key: "malformed",
        category: "malformed",
        verbs: ["Would revert", "Will revert", "Reverted", "Never ran"],
        sentence: (verb) => (
          <>
            {verb}: calls {k.contract} with arguments that don&apos;t decode
          </>
        ),
        from: contractEnd("Timelock", TimelockController.address),
        cargo: <span className="ac-amount ac-bad">Bad arguments</span>,
        cargoSub: "can't decode",
        to: contractEnd(k.contract, a.target),
        flags: [{ level: "fail", title: "Arguments don't decode", text: `${k.error}. If it passes, execution fails.` }],
        checks: [{ status: "fail", text: `Known function on ${k.contract}, arguments don't decode` }],
      };

    case "not-applicable":
      return {
        key: "unknown",
        category: "unknown",
        verbs: ["Would call", "Will call", "Called", "Not called"],
        sentence: (verb) => (
          <>
            {verb} function <Id value={k.selector} /> on <Id value={k.target} />, a contract this site can&apos;t decode
          </>
        ),
        from: contractEnd("Timelock", TimelockController.address),
        cargo: <span className="ac-amount ac-muted">{k.selector}</span>,
        cargoSub: "unknown function",
        to: { icon: <QuestionIcon />, name: "Unrecognised call", id: k.target, tone: "unknown" },
        flags: [
          {
            level: "review",
            title: "This call can't be read here",
            text: "The site has no ABI for it, so it can't say what it does. Review the calldata before voting.",
            link: { href: etherscanAddress(k.target), label: "Contract on Etherscan ↗" },
          },
        ],
        checks: [],
      };
  }
}

const valueFlag = (value: bigint): Flag => ({
  level: "review",
  title: "Sends ETH with the call",
  text: `${formatEther(value)} ETH leaves the timelock along with this call.`,
});

function receiverEnd(name: string, address: Address, ctx: ActionContext): End {
  const slot = ctx.holderSlot(address);
  // A shareholder shows their identicon; anyone else the generic receiver.
  return {
    icon: slot !== null ? <Blockie address={address} slot={slot} size={22} /> : <PersonIcon />,
    name: slot !== null ? `${name} · shareholder` : name,
    id: address,
    tone: "receiver",
  };
}

// ---------- Pieces ----------

function FlowEnd({ end }: { end: End }) {
  return (
    <span className="ac-end">
      <span className={`ac-end-icon ${end.tone ?? ""}`}>{end.icon}</span>
      <span className="ac-end-text">
        <b>{end.name}</b>
        {end.id && <Id value={end.id} stacked />}
        {end.note && <span className="ac-end-note">{end.note}</span>}
      </span>
    </span>
  );
}

// A full identifier, split into even pieces (two for an address, three for a root or CID) so it wraps
// cleanly; `stacked` puts the pieces on separate lines. Never shortened.
export function Id({ value, stacked, link }: { value: string; stacked?: boolean; link?: boolean }) {
  const n = Math.ceil(value.length / 22);
  const size = Math.ceil(value.length / n);
  const parts: string[] = [];
  for (let i = 0; i < value.length; i += size) parts.push(value.slice(i, i + size));
  const body = (
    <code className={`ac-id${stacked ? " stacked" : ""}`}>
      {parts.map((p, i) => (
        <span key={i}>
          {p}
          {i < parts.length - 1 && <wbr />}
        </span>
      ))}
    </code>
  );
  return link && isAddress(value) ? <External href={etherscanAddress(value)}>{body}</External> : body;
}

function Amount({ value }: { value: bigint }) {
  return (
    <span className="ac-amount">
      {formatEther(value)}
      <small>ETH</small>
    </span>
  );
}

function TreeMarks({ count }: { count: number | null }) {
  const bars = Math.min(count ?? 8, 16);
  return (
    <span className="ac-amount">
      <span className="ac-tree" aria-hidden="true">
        {Array.from({ length: bars }, (_, i) => (
          <i key={i} />
        ))}
      </span>
      {count !== null && (
        <>
          {count}
          <small>works</small>
        </>
      )}
    </span>
  );
}

function ParamRow({ name, type, value }: { name: string; type: string; value: unknown }) {
  return (
    <>
      <dt>{name}</dt>
      <dd>{formatParam(type, value)}</dd>
    </>
  );
}

function formatParam(type: string, value: unknown): ReactNode {
  if (type === "address" && typeof value === "string") return <Id value={value} link />;
  if (type.startsWith("uint") || type.startsWith("int")) {
    const n = value as bigint;
    return (
      <>
        <span className="ac-mono">{n.toString()}</span>
        {n >= 10n ** 12n && <span className="muted"> ({formatEther(n)} if in wei)</span>}
      </>
    );
  }
  if (type === "string") return value === "" ? <span className="muted">empty</span> : <q>{String(value)}</q>;
  if (type === "bool") return String(value);
  if (typeof value === "string" && isHex(value)) return value === "0x" ? <span className="muted">empty</span> : <Id value={value} />;
  return <span className="ac-mono">{JSON.stringify(value, (_, x) => (typeof x === "bigint" ? x.toString() : x))}</span>;
}

// ---------- Icons ----------

const svg = (children: ReactNode, size = 18) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    {children}
  </svg>
);
const PersonIcon = () =>
  svg(
    <>
      <circle cx="12" cy="8.5" r="3.5" />
      <path d="M5 19.5c1.4-3.3 4-5 7-5s5.6 1.7 7 5" />
    </>,
  );
const TreeIcon = () =>
  svg(
    <>
      <circle cx="12" cy="5" r="2" />
      <circle cx="6" cy="13" r="2" />
      <circle cx="18" cy="13" r="2" />
      <path d="M11 6.7 7 11.3M13 6.7l4 4.6M6 15v4M18 15v4" />
    </>,
  );
const LockIcon = () =>
  svg(
    <>
      <rect x="5" y="10.5" width="14" height="10" rx="2" />
      <path d="M8 10.5V7.5a4 4 0 0 1 8 0v3M12 14.5v2.5" />
    </>,
  );
const CodeIcon = () => svg(<path d="m8 7-5 5 5 5M16 7l5 5-5 5M13.5 5l-3 14" />);
const QuestionIcon = () =>
  svg(
    <>
      <path d="M9.2 9a3 3 0 1 1 4.3 2.7c-.9.4-1.5 1.2-1.5 2.2V15" />
      <circle cx="12" cy="18.5" r=".6" fill="currentColor" />
    </>,
  );
const EyeIcon = () =>
  svg(
    <>
      <path d="M2.5 12S6 5.5 12 5.5 21.5 12 21.5 12 18 18.5 12 18.5 2.5 12 2.5 12Z" />
      <circle cx="12" cy="12" r="2.8" />
    </>,
    15,
  );
