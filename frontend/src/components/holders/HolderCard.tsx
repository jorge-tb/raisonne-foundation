"use client";

import { useEffect, useLayoutEffect, useState } from "react";
import { isAddressEqual } from "viem";
import { etherscanAddress } from "@/lib/format";
import type { HolderView } from "@/lib/holders";
import { Blockie } from "./Blockie";
import { useDismiss } from "./HoldersProvider";

// Everything about one holder, opened from any of their avatars.
export function HolderCard({ holder: h, anchor, onClose }: { holder: HolderView; anchor: HTMLElement; onClose: () => void }) {
  const ref = useDismiss(onClose, anchor);
  const [pos, setPos] = useState<{ left: number; top: number } | null>(null);
  const [copied, setCopied] = useState<"idle" | "done" | "failed">("idle");

  // Below the avatar that opened it, kept on screen.
  useLayoutEffect(() => {
    const place = () => {
      const r = anchor.getBoundingClientRect(), w = ref.current?.offsetWidth ?? 300, ht = ref.current?.offsetHeight ?? 240;
      const below = r.bottom + 8 + ht <= innerHeight;
      setPos({ left: Math.max(8, Math.min(r.left, innerWidth - w - 8)), top: below ? r.bottom + 8 : Math.max(8, r.top - ht - 8) });
    };
    place();
    addEventListener("scroll", place, { passive: true });
    addEventListener("resize", place);
    return () => {
      removeEventListener("scroll", place);
      removeEventListener("resize", place);
    };
  }, [anchor, ref]);

  useEffect(() => ref.current?.querySelector<HTMLButtonElement>("button")?.focus(), [ref]);

  const self = isAddressEqual(h.delegate as `0x${string}`, h.address as `0x${string}`);
  const delegation = /^0x0+$/.test(h.delegate) ? "nobody: these shares don't vote" : self ? "themselves" : h.delegate;

  return (
    <div ref={ref} className="holder-card" role="dialog" aria-label={`Shareholder ${h.address}`} style={pos ?? { visibility: "hidden" }}>
      <div className="holder-card-head">
        <Blockie address={h.address} slot={h.slot} size={52} />
        <code className="hash">{h.address}</code>
      </div>
      <dl className="compact">
        <dt>Shares</dt>
        <dd>
          {h.shares} FS · {h.sharePct}
        </dd>
        <dt>Votes</dt>
        <dd>{h.votes} FS</dd>
        <dt>Delegates to</dt>
        <dd>{delegation.startsWith("0x") ? <code className="hash">{delegation}</code> : delegation}</dd>
        <dt>Proposals</dt>
        <dd>{h.proposals}</dd>
      </dl>
      <div className="holder-card-actions">
        <button
          type="button"
          onClick={() =>
            navigator.clipboard.writeText(h.address).then(
              () => setCopied("done"),
              () => setCopied("failed"),
            )
          }
        >
          {copied === "done" ? "Copied ✓" : copied === "failed" ? "Select the address to copy" : "Copy address"}
        </button>
        <a href={etherscanAddress(h.address)} target="_blank" rel="noreferrer">
          Etherscan ↗
        </a>
      </div>
    </div>
  );
}
