import "server-only";
import { cacheLife } from "next/cache";
import type { Hex } from "viem";
import { ArtRegistry, CHAIN_ID } from "@/generated/contracts";
import { getCapTable } from "../capTable";
import { createClient, DEPLOYMENT_BLOCK, LOG_EMITTERS, scanLogs } from "../chain";
import { discoverLogBlocks } from "../discovery";
import { getGalleries } from "../galleries";
import { DEFAULT_IPFS_GATEWAY } from "../gallery";
import { fetchMetadata, REISSUED_AS, type MetadataFetch } from "../metadata";
import { getProposals, type ProposalState } from "../proposals";
import { verifyAction } from "../verify";
import { analyseImage } from "./image";

const FINAL_STATES: ProposalState[] = ["Defeated", "Canceled", "Executed", "Expired"];

export const ipfsGateway = () => process.env.IPFS_GATEWAY || DEFAULT_IPFS_GATEWAY;

// A file under a CID never changes, so a good read is cached long and failures are retried within a
// minute (re-pinning fixes "unpinned"). The snapshot's own cacheLife is explicit, so this doesn't
// shorten it. On Vercel the in-memory cache doesn't survive a revalidation, so a regeneration runs
// these again, but their gateway reads (fetchImmutable) are answered by the persistent fetch cache.
async function getMetadata(cid: string, gateway: string) {
  "use cache";
  const result = await fetchMetadata(cid, gateway);
  if (result.status === "ok") cacheLife("max");
  else cacheLife("minutes");
  return result;
}

// Same rule for an image's proportions and colour, read from a small preview (see image.ts).
async function getImageInfo(cid: string, gateway: string) {
  "use cache";
  const info = await analyseImage(new URL(cid, gateway).href);
  if (info) cacheLife("max");
  else cacheLife("minutes");
  return info;
}

// viem errors embed the RPC URL (API key) and the discovery URL carries the Etherscan key.
// Log a redacted message server-side and throw a generic one.
function redact(error: unknown): string {
  let text = error instanceof Error ? (error.stack ?? error.message) : String(error);
  for (const secret of [process.env.ALCHEMY_SEPOLIA_URL, process.env.ETHERSCAN_API_KEY]) {
    if (secret) text = text.replaceAll(secret, "<redacted>");
  }
  return text;
}

async function load() {
  const rpcUrl = process.env.ALCHEMY_SEPOLIA_URL;
  if (!rpcUrl) throw new Error("ALCHEMY_SEPOLIA_URL is not set");
  const client = createClient(rpcUrl);

  const head = await client.getBlock();
  const etherscanKey = process.env.ETHERSCAN_API_KEY;
  const blocks = etherscanKey
    ? await discoverLogBlocks(etherscanKey, CHAIN_ID, LOG_EMITTERS, DEPLOYMENT_BLOCK, head.number)
    : undefined;
  const scan = await scanLogs(client, { toBlock: head.number, blocks });

  const proposals = await getProposals(client, scan);
  const [capTable, galleries] = await Promise.all([getCapTable(client, scan), getGalleries(client, scan, proposals)]);

  const enabledAt = async (root: Hex) =>
    client.readContract({ ...ArtRegistry, functionName: "isGalleryEnabled", args: [root], blockNumber: head.number });

  const verified = await Promise.all(
    proposals.map(async (p) => ({
      ...p,
      final: FINAL_STATES.includes(p.state),
      actions: await Promise.all(
        p.actions.map(async (a) => ({
          ...a,
          verification: await verifyAction(a.kind, p.description, ipfsGateway()),
          // revokeGallery on a root that isn't enabled would revert; only meaningful while the outcome can change.
          revertWarning:
            a.kind.kind === "revoke-gallery" && !FINAL_STATES.includes(p.state) && !(await enabledAt(a.kind.root)),
        })),
      ),
    })),
  );

  const withImage = async (metadata: MetadataFetch) => ({
    metadata,
    image: metadata.status === "ok" && metadata.artwork.imageCid ? await getImageInfo(metadata.artwork.imageCid, ipfsGateway()) : null,
  });
  const tokens = await Promise.all(
    galleries.flatMap((g) =>
      g.minted.map(async (m) => ({
        id: m.tokenId,
        galleryRoot: g.root,
        cid: m.cid,
        mintTransactionHash: m.transactionHash,
        owner: await client.readContract({ ...ArtRegistry, functionName: "ownerOf", args: [m.tokenId], blockNumber: head.number }),
        // Reissued tokens were reissued because their metadata was never pinned. Failures aren't cached,
        // so asking would cost a gateway request on every regeneration.
        ...(m.tokenId.toString() in REISSUED_AS
          ? { metadata: { status: "unpinned" } as MetadataFetch, image: null }
          : await withImage(await getMetadata(m.cid, ipfsGateway()))),
      })),
    ),
  );

  return {
    blockNumber: head.number,
    blockTimestamp: head.timestamp,
    logSource: blocks ? ("etherscan" as const) : ("rpc" as const),
    proposals: verified.reverse(), // newest first
    capTable,
    galleries,
    tokens: tokens.sort((a, b) => (a.id < b.id ? -1 : 1)),
  };
}

// One cached chain read shared by every page. Regenerated in the background at most once a
// minute, whatever the traffic; a stale copy may be served for up to a day if the RPC is down.
// (Return values use React client serialization, which carries bigint.)
export async function getSnapshot() {
  "use cache";
  cacheLife({ stale: 60, revalidate: 60, expire: 86400 });
  try {
    return await load();
  } catch (error) {
    console.error("[snapshot]", redact(error));
    throw new Error("Chain data is unavailable right now.");
  }
}

export type Snapshot = Awaited<ReturnType<typeof getSnapshot>>;
export type SnapshotProposal = Snapshot["proposals"][number];
export type SnapshotToken = Snapshot["tokens"][number];
