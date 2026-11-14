import type { Metadata } from "next";
import { ContractGlyph, type ContractKind } from "@/components/ContractGlyph";
import { ContractsDiagram, type DiagramContract } from "@/components/ContractsDiagram";
import { holdersData } from "@/components/holders/views";
import { AddressLink, AsOf, External } from "@/components/ui";
import { ADDRESSES } from "@/generated/contracts";
import type { GuaranteeKey } from "@/lib/contracts";
import { etherscanCode, etherscanTx } from "@/lib/format";
import { getSnapshot } from "@/lib/server/snapshot";

export const metadata: Metadata = { title: "Contracts" };

const CONTRACTS: { kind: ContractKind; role: string; can: string }[] = [
  {
    kind: "FundShare",
    role: "ERC-20 votes token: one share per wei subscribed",
    can: "Mints shares to the stakeholders who subscribe; finalize() sends the subscribed ETH to the treasury. Shares vote once delegated.",
  },
  {
    kind: "FundGovernor",
    role: "Proposals and voting",
    can: "Counts FundShare votes and decides proposals. The only account allowed to queue or cancel in the timelock.",
  },
  {
    kind: "TimelockController",
    role: "Executes passed proposals after a delay",
    can: "Holds each passed proposal for the delay, then anyone may execute it. Owns the treasury and the registry.",
  },
  {
    kind: "FundTreasury",
    role: "Holds the ETH and the artworks (UUPS proxy)",
    can: "Owned by the timelock: only a passed proposal can pay(), sell() an artwork or upgrade its code.",
  },
  {
    kind: "ArtRegistry",
    role: "Acquisition roots and minted artworks (ERC-721)",
    can: "Owned by the timelock: only a passed proposal can add or revoke a gallery. Anyone with a Merkle proof can mint an artwork, always into the treasury.",
  },
];

// What each guarantee says, and the on-chain read that decides it (lib/contracts.ts).
const GUARANTEES: Record<GuaranteeKey, { title: string; check: string; how: string }> = {
  noAdmin: {
    title: "No one holds admin power",
    check: "TimelockController.hasRole(DEFAULT_ADMIN_ROLE | PROPOSER_ROLE | CANCELLER_ROLE, deployer) == false",
    how: "The deployer set the system up, then gave its roles away and renounced the admin role.",
  },
  treasuryByVote: {
    title: "The treasury moves only by vote",
    check: "FundTreasury.owner() == TimelockController",
    how: "Paying, selling an artwork and upgrading the treasury's code all need a passed proposal.",
  },
  registryByVote: {
    title: "Galleries change only by vote",
    check: "ArtRegistry.owner() == TimelockController",
    how: "Adding or revoking an acquisition's gallery needs a passed proposal.",
  },
  governorQueues: {
    title: "Only the Governor can queue or cancel",
    check: "TimelockController.hasRole(PROPOSER_ROLE and CANCELLER_ROLE, FundGovernor) and FundGovernor.timelock() == TimelockController",
    how: "Nothing reaches the timelock except a proposal the shareholders passed.",
  },
  anyoneExecutes: {
    title: "Anyone can execute a passed proposal",
    check: "TimelockController.hasRole(EXECUTOR_ROLE, address(0)) == true",
    how: "No one can sit on a decision once its delay is over.",
  },
  votesFromShares: {
    title: "Votes come from the shares",
    check: "FundGovernor.token() == FundShare",
    how: "Voting power is FundShare balance delegated, nothing else.",
  },
  fundsToTreasury: {
    title: "Subscriptions go to the treasury",
    check: "FundShare.treasury() == FundTreasury",
    how: "The ETH paid for shares can only be forwarded to the treasury.",
  },
  delay: {
    title: "Every decision waits before it runs",
    check: "TimelockController.getMinDelay()",
    how: "The delay is what lets a holder who disagrees exit before a decision runs.",
  },
};

const MARK = { ok: "✓", fail: "✕", warn: "!" } as const;

const duration = (seconds: bigint) => {
  const s = Number(seconds);
  return s % 86_400 === 0 ? `${s / 86_400} day${s === 86_400 ? "" : "s"}` : s % 3600 === 0 ? `${s / 3600} h` : s % 60 === 0 ? `${s / 60} min` : `${s} s`;
};

export default async function ContractsPage() {
  const snapshot = await getSnapshot();
  const { contracts, capTable } = snapshot;
  const holders = holdersData(snapshot)?.holders ?? [];
  const diagram: DiagramContract[] = CONTRACTS.map((c) => ({ ...c, address: ADDRESSES[c.kind] }));
  const failing = contracts.guarantees.filter((g) => g.status === "fail").length;

  return (
    <>
      <h1>Contracts</h1>
      <p className="lede">
        Five contracts run the fund. None of them, and no person, can move its money or artworks without a vote that
        passed and waited out the timelock. The diagram shows who can do what; the guarantees below are read from the
        chain, not quoted.
      </p>
      <AsOf snapshot={snapshot} />

      <section>
        <h2>Chain of command</h2>
        <ContractsDiagram contracts={diagram} holders={holders.map((h) => ({ address: h.address, slot: h.slot }))} />
      </section>

      <section>
        <h2>What nobody can do</h2>
        <p className="muted small">
          Each line is read from the contracts at the block above and marked ✓ only if the chain agrees. The linked
          transaction is where the deployment set it up.
          {failing > 0 && <strong> {failing} guarantee{failing > 1 ? "s do" : " does"} not hold right now.</strong>}
        </p>
        <ul className="guarantees">
          {contracts.guarantees.map((g) => {
            const text = GUARANTEES[g.key];
            return (
              <li key={g.key} className={`guarantee guarantee-${g.status}`}>
                <span className="guarantee-mark" aria-label={g.status === "ok" ? "holds" : g.status === "warn" ? "holds, with a caveat" : "does not hold"}>
                  {MARK[g.status]}
                </span>
                <b>
                  {text.title}
                  {g.key === "delay" && `: ${duration(contracts.params.minDelay)}`}
                </b>
                <code className="guarantee-check">{text.check}</code>
                <span className="muted small">
                  {g.key === "delay" && g.status === "warn"
                    ? `${text.how} ${duration(contracts.params.minDelay)} is a testnet value, too short for that.`
                    : text.how}
                </span>
                {g.origin && (
                  <span className="guarantee-origin small">
                    <External href={etherscanTx(g.origin)}>set up in this transaction</External>
                  </span>
                )}
              </li>
            );
          })}
        </ul>
      </section>

      <section>
        <h2>Addresses</h2>
        <div className="table-scroll">
          <table>
            <thead>
              <tr>
                <th>Contract</th>
                <th>Role</th>
                <th>Address</th>
              </tr>
            </thead>
            <tbody>
              {CONTRACTS.map((c) => (
                <tr key={c.kind}>
                  <td>
                    <span className="contract-name">
                      <ContractGlyph kind={c.kind} size={18} />
                      {c.kind}
                    </span>
                  </td>
                  <td>{c.role}</td>
                  <td>
                    <AddressLink address={ADDRESSES[c.kind]} /> · <External href={etherscanCode(ADDRESSES[c.kind])}>verified source</External>
                  </td>
                </tr>
              ))}
              {contracts.treasuryImplementation && (
                <tr>
                  <td>
                    <span className="contract-name">
                      <ContractGlyph kind="FundTreasury" size={18} />
                      FundTreasury
                    </span>
                    <span className="muted small"> implementation</span>
                  </td>
                  <td>The code behind the treasury proxy, read from its ERC-1967 slot; replaceable only by a vote</td>
                  <td>
                    <AddressLink address={contracts.treasuryImplementation} /> ·{" "}
                    <External href={etherscanCode(contracts.treasuryImplementation)}>verified source</External>
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        <h3>Governance parameters</h3>
        <dl className="params">
          <div>
            <dt>Voting delay</dt>
            <dd>{duration(contracts.params.votingDelay)}</dd>
          </div>
          <div>
            <dt>Voting period</dt>
            <dd>{duration(contracts.params.votingPeriod)}</dd>
          </div>
          {capTable && (
            <div>
              <dt>Quorum</dt>
              <dd>
                {((Number(capTable.quorum.numerator) / Number(capTable.quorum.denominator)) * 100).toFixed(0)}% of supply
              </dd>
            </div>
          )}
          <div>
            <dt>Proposal threshold</dt>
            <dd>{contracts.params.proposalThreshold.toString()} shares</dd>
          </div>
          <div>
            <dt>Timelock delay</dt>
            <dd>{duration(contracts.params.minDelay)}</dd>
          </div>
        </dl>
      </section>
    </>
  );
}
