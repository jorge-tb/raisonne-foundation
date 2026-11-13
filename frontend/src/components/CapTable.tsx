import { formatEther } from "viem";
import { AddressLink } from "@/components/ui";
import { formatBps } from "@/lib/format";
import type { Snapshot } from "@/lib/server/snapshot";

export function CapTable({ capTable }: { capTable: Snapshot["capTable"] }) {
  return (
    <section>
      <h2>Shareholders</h2>
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
      <p className="muted small">Balance is not voting power: undelegated shares count for nothing in a vote.</p>
    </section>
  );
}
