"use client";

import { AddressLink } from "@/components/ui";
import { Blockie } from "./Blockie";
import { useHolders } from "./HoldersProvider";

// An address wherever it appears. For a shareholder: their avatar, linked to the ring (hover lights the
// holder up everywhere) and opening their card. Anyone else: the plain Etherscan link, as before.
export function HolderChip({ address }: { address: string }) {
  const ctx = useHolders();
  const holder = ctx?.find(address);
  if (!ctx || !holder) return <AddressLink address={address} />;
  const on = ctx.focus === holder.address.toLowerCase();
  return (
    <button
      type="button"
      className={`holder-chip${on ? " on" : ""}`}
      aria-haspopup="dialog"
      onPointerEnter={() => ctx.setFocus(holder.address)}
      onPointerLeave={() => ctx.setFocus(null)}
      onFocus={() => ctx.setFocus(holder.address)}
      onBlur={() => ctx.setFocus(null)}
      onClick={(e) => ctx.openCard(holder.address, e.currentTarget)}
    >
      <Blockie address={holder.address} slot={holder.slot} size={22} />
      <code className="hash">{holder.address}</code>
    </button>
  );
}
