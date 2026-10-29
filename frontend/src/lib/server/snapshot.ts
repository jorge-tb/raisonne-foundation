import "server-only";
import { cacheLife } from "next/cache";
import type { Hex } from "viem";
import { ArtRegistry, CHAIN_ID } from "@/generated/contracts";
import { getCapTable } from "../capTable";
import { createClient, DEPLOYMENT_BLOCK, LOG_EMITTERS, scanLogs } from "../chain";
import { discoverLogBlocks } from "../discovery";
import { getGalleries } from "../galleries";
import { DEFAULT_IPFS_GATEWAY } from "../gallery";
import { getProposals, type ProposalState } from "../proposals";
import { verifyAction } from "../verify";

const FINAL_STATES: ProposalState[] = ["Defeated", "Canceled", "Executed", "Expired"];

export const ipfsGateway = () => process.env.IPFS_GATEWAY || DEFAULT_IPFS_GATEWAY;

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

  return {
    blockNumber: head.number,
    blockTimestamp: head.timestamp,
    logSource: blocks ? ("etherscan" as const) : ("rpc" as const),
    proposals: verified.reverse(), // newest first
    capTable,
    galleries,
    mintedTokenIds: galleries.flatMap((g) => g.minted.map((m) => m.tokenId)),
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
