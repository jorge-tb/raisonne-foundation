import Link from "next/link";
import { formatEther } from "viem";
import { AddressLink, AsOf } from "@/components/ui";
import { ArtRegistry, FundGovernor, FundShare, FundTreasury, TimelockController } from "@/generated/contracts";
import { formatBps } from "@/lib/format";
import { getSnapshot } from "@/lib/server/snapshot";

const CONTRACTS = [
  ["FundShare", FundShare.address, "ERC-20 votes token: one share per wei subscribed"],
  ["FundGovernor", FundGovernor.address, "Proposals and voting"],
  ["TimelockController", TimelockController.address, "Executes passed proposals after a delay"],
  ["ArtRegistry", ArtRegistry.address, "Gallery roots and minted artworks"],
  ["FundTreasury", FundTreasury.address, "Treasury (UUPS proxy)"],
] as const;

export default async function Home() {
  const snapshot = await getSnapshot();
  const { capTable, proposals, galleries } = snapshot;

  return (
    <>
      <h1>Raisonné Foundation</h1>
      <p className="lede">
        A closed-end art fund on Sepolia. Shareholders vote on acquisitions; each acquisition commits a Merkle root of
        its artworks on chain, and the tree is published on IPFS so anyone can rebuild the root and check it.
      </p>
      <AsOf snapshot={snapshot} />

      <section>
        <h2>At a glance</h2>
        <ul className="plain">
          <li>
            <Link href="/proposals">{proposals.length} proposals</Link>, {proposals.filter((p) => p.state === "Executed").length} executed
          </li>
          <li>
            <Link href="/galleries">{galleries.length} galleries</Link>, {galleries.filter((g) => g.enabled).length} enabled,{" "}
            {snapshot.mintedTokenIds.length} artworks minted
          </li>
        </ul>
      </section>

      <section>
        <h2>Cap table</h2>
        <p className="muted small">Current balances, replayed from FundShare Transfer logs and checked against totalSupply().</p>
        {capTable ? (
          <table>
            <thead>
              <tr>
                <th>Holder</th>
                <th className="num">Shares (ETH)</th>
                <th className="num">Ownership</th>
              </tr>
            </thead>
            <tbody>
              {capTable.holders.map((h) => (
                <tr key={h.address}>
                  <td>
                    <AddressLink address={h.address} />
                  </td>
                  <td className="num">{formatEther(h.balance)}</td>
                  <td className="num">
                    {formatBps(h.bps)} <span className="muted">({h.bps.toString()} bps)</span>
                  </td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr>
                <td>Total supply</td>
                <td className="num">{formatEther(capTable.supply)}</td>
                <td className="num">{formatBps(10000n - capTable.remainderBps)}</td>
              </tr>
              <tr>
                <td colSpan={2} className="muted">
                  Rounding remainder (each holder&apos;s share is rounded down to whole basis points)
                </td>
                <td className="num muted">{formatBps(capTable.remainderBps)}</td>
              </tr>
            </tfoot>
          </table>
        ) : (
          <p>No shares issued.</p>
        )}
        <p className="muted small">
          Balance is not voting power: undelegated shares count for nothing in a vote.
        </p>
      </section>

      <section>
        <h2>Contracts</h2>
        <dl>
          {CONTRACTS.map(([name, address, role]) => (
            <div key={name}>
              <dt>
                {name} <span className="muted">· {role}</span>
              </dt>
              <dd>
                <AddressLink address={address} />
              </dd>
            </div>
          ))}
        </dl>
      </section>
    </>
  );
}
