import { DEFAULT_IPFS_GATEWAY } from "./gallery";

export type Artwork = {
  name: string;
  description: string | null;
  // The metadata's `image` as written, and its CID when it is a usable ipfs://<cid> (tokens 6 and 10
  // carry the placeholder "ipfs://REPLACE_WITH_IMAGE_CID").
  image: string | null;
  imageCid: string | null;
  attributes: { trait: string; value: string }[];
  externalUrl: string | null;
};

// Permanent and transient failures are kept apart: a gateway hiccup must never read as "no image",
// and an unpinned file must never read as "try again".
export type MetadataFetch =
  | { status: "ok"; artwork: Artwork }
  | { status: "unpinned" } // our dedicated gateway serves only account-pinned files; 403 until re-pinned
  | { status: "malformed"; detail: string }
  | { status: "unavailable"; detail: string };

// CIDv0 (base58btc "Qm…") or CIDv1 in base32 ("b…"), the forms IPFS tooling prints.
const CID = /^(Qm[1-9A-HJ-NP-Za-km-z]{44}|b[a-z2-7]{50,})$/;

export function ipfsCid(uri: string): string | null {
  const cid = uri.match(/^ipfs:\/\/(?:ipfs\/)?([^/?#]+)$/)?.[1];
  return cid && CID.test(cid) ? cid : null;
}

export async function fetchMetadata(cid: string, gateway = DEFAULT_IPFS_GATEWAY): Promise<MetadataFetch> {
  let body: unknown;
  try {
    const res = await fetch(new URL(cid, gateway), { signal: AbortSignal.timeout(15_000) });
    if (res.status === 403) return { status: "unpinned" };
    if (!res.ok) return { status: "unavailable", detail: `HTTP ${res.status}` };
    body = await res.json().catch(() => undefined);
  } catch (error) {
    return { status: "unavailable", detail: error instanceof Error ? error.message : String(error) };
  }
  return parseMetadata(body);
}

// ERC-721 metadata JSON: { name, description, image, external_url, attributes: [{ trait_type, value }] }.
export function parseMetadata(body: unknown): MetadataFetch {
  if (typeof body !== "object" || body === null || Array.isArray(body))
    return { status: "malformed", detail: "not a JSON object" };
  const { name, description, image, external_url, attributes } = body as Record<string, unknown>;
  if (typeof name !== "string" || name === "") return { status: "malformed", detail: "no name" };
  const text = (v: unknown) => (typeof v === "string" && v !== "" ? v : null);
  return {
    status: "ok",
    artwork: {
      name,
      description: text(description),
      image: text(image),
      imageCid: typeof image === "string" ? ipfsCid(image) : null,
      attributes: (Array.isArray(attributes) ? attributes : []).flatMap((a) => {
        const { trait_type, value } = (a ?? {}) as Record<string, unknown>;
        return typeof trait_type === "string" && (typeof value === "string" || typeof value === "number")
          ? [{ trait: trait_type, value: String(value) }]
          : [];
      }),
      externalUrl: text(external_url)?.startsWith("https://") ? (external_url as string) : null,
    },
  };
}

export const attribute = (artwork: Artwork, trait: string) => artwork.attributes.find((a) => a.trait === trait)?.value ?? null;

// Editorial, not on chain: tokens minted with a placeholder image and reissued in Acquisition 002.
// Matched by title (6 and 12 are "Encounter during the Battle of Kijkduin", 10 and 11 "Amorous Couple").
export const REISSUED_AS: Record<string, bigint> = { "6": 12n, "10": 11n };
