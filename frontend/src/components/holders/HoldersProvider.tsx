"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import type { HolderView } from "@/lib/holders";
import { HolderCard } from "./HolderCard";
import type { HoldersData } from "./views";

// One state for every holder mark on the page, so they stay linked: hovering a holder anywhere lights
// it up everywhere, the coalition is shared by the ring and its legend, and one card opens at a time.
type Holders = HoldersData & {
  find: (address: string) => HolderView | undefined;
  focus: string | null;
  setFocus: (address: string | null) => void;
  picked: ReadonlySet<string>;
  toggle: (address: string) => void;
  clear: () => void;
  openCard: (address: string, anchor: HTMLElement) => void;
};

const HoldersContext = createContext<Holders | null>(null);
export const useHolders = () => useContext(HoldersContext);

const key = (address: string) => address.toLowerCase();

export function HoldersProvider({ data, children }: { data: HoldersData; children: ReactNode }) {
  const [focus, setFocusState] = useState<string | null>(null);
  const [picked, setPicked] = useState<ReadonlySet<string>>(new Set());
  const [card, setCard] = useState<{ address: string; anchor: HTMLElement } | null>(null);
  const byAddress = useMemo(() => new Map(data.holders.map((h) => [key(h.address), h])), [data.holders]);

  const setFocus = useCallback((address: string | null) => setFocusState(address && key(address)), []);
  const toggle = useCallback((address: string) => {
    setPicked((prev) => {
      const next = new Set(prev);
      if (!next.delete(key(address))) next.add(key(address));
      return next;
    });
  }, []);
  const clear = useCallback(() => setPicked(new Set()), []);
  const openCard = useCallback((address: string, anchor: HTMLElement) => setCard({ address: key(address), anchor }), []);
  const closeCard = useCallback(() => setCard(null), []);

  const value = useMemo<Holders>(
    () => ({ ...data, find: (a) => byAddress.get(key(a)), focus, setFocus, picked, toggle, clear, openCard }),
    [data, byAddress, focus, setFocus, picked, toggle, clear, openCard],
  );

  return (
    <HoldersContext value={value}>
      <div className="holders-scope" data-focus={focus ?? undefined}>
        {children}
      </div>
      {card && byAddress.get(card.address) && (
        <HolderCard holder={byAddress.get(card.address)!} anchor={card.anchor} onClose={closeCard} />
      )}
    </HoldersContext>
  );
}

// Close on Escape (focus goes back to the avatar that opened it) or on a click elsewhere; used by the card.
export function useDismiss(onClose: () => void, anchor: HTMLElement) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      anchor.focus();
      onClose();
    };
    const onDown = (e: PointerEvent) => {
      const t = e.target as Node;
      if (!ref.current?.contains(t) && !anchor.contains(t)) onClose();
    };
    document.addEventListener("keydown", onKey);
    document.addEventListener("pointerdown", onDown);
    return () => {
      document.removeEventListener("keydown", onKey);
      document.removeEventListener("pointerdown", onDown);
    };
  }, [onClose, anchor]);
  return ref;
}
