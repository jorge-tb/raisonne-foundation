// Lists every proposal on chain, verifies each gallery action against its published
// tree, and prints the current cap table.
//
//   npm run verify                         scan deployment block -> head
//   npm run verify -- --to 11970376        stop the scan at a block (testing on a capped RPC)
//
// Env (.env.local): ALCHEMY_SEPOLIA_URL, ETHERSCAN_API_KEY (log discovery; without it the
// script range-scans, which needs an RPC without Alchemy's free-tier cap), optional LOGS_MAX_RANGE,
// optional LOGS_CONCURRENCY, optional IPFS_GATEWAY (base URL ending in /ipfs/).
import { formatEther } from "viem";
import { ArtRegistry, CHAIN_ID } from "@/generated/contracts";
import { getCapTable } from "@/lib/capTable";
import { createClient, DEPLOYMENT_BLOCK, LOG_EMITTERS, scanLogs } from "@/lib/chain";
import { discoverLogBlocks } from "@/lib/discovery";
import { getProposals } from "@/lib/proposals";
import { verifyAction } from "@/lib/verify";

process.loadEnvFile(".env.local");
const rpcUrl = process.env.ALCHEMY_SEPOLIA_URL;
if (!rpcUrl) throw new Error("ALCHEMY_SEPOLIA_URL is not set in .env.local");

const toArg = process.argv.indexOf("--to");
const toBlock = toArg > 0 ? BigInt(process.argv[toArg + 1]) : undefined;
const maxRange = process.env.LOGS_MAX_RANGE ? BigInt(process.env.LOGS_MAX_RANGE) : undefined;
const concurrency = process.env.LOGS_CONCURRENCY ? Number(process.env.LOGS_CONCURRENCY) : undefined;

// viem errors embed the RPC URL (and so the API key): redact secrets before printing.
process.on("unhandledRejection", (error) => {
  const text = error instanceof Error ? (error.stack ?? error.message) : String(error);
  let redacted = text.replaceAll(rpcUrl, "<ALCHEMY_SEPOLIA_URL>");
  if (process.env.ETHERSCAN_API_KEY) redacted = redacted.replaceAll(process.env.ETHERSCAN_API_KEY, "<ETHERSCAN_API_KEY>");
  console.error(redacted);
  process.exit(1);
});

const client = createClient(rpcUrl);
const started = Date.now();
const head = toBlock ?? (await client.getBlockNumber());
const etherscanKey = process.env.ETHERSCAN_API_KEY;
const blocks = etherscanKey ? await discoverLogBlocks(etherscanKey, CHAIN_ID, LOG_EMITTERS, DEPLOYMENT_BLOCK, head) : undefined;
const scan = await scanLogs(client, { toBlock: head, maxRange, blocks, concurrency });
const source = blocks ? `Etherscan discovery, ${blocks.length} blocks read from RPC` : "RPC range scan";
console.log(`Scanned to block ${scan.toBlock} (${source}): ${scan.logs.length} logs in ${((Date.now() - started) / 1000).toFixed(1)} s\n`);

const proposals = await getProposals(client, scan);
console.log(`== Proposals (${proposals.length})\n`);
for (const p of proposals) {
  console.log(`${p.state.padEnd(9)} ${p.id}`);
  console.log(`          ${p.description.split(/[.;]/)[0]}`);
  for (const [i, action] of p.actions.entries()) {
    const v = await verifyAction(action.kind, p.description, process.env.IPFS_GATEWAY || undefined);
    const prefix = `          action ${i}:`;
    switch (v.status) {
      case "match":
      case "mismatch": {
        const enabled = await client.readContract({ ...ArtRegistry, functionName: "isGalleryEnabled", args: [v.root], blockNumber: scan.toBlock });
        console.log(`${prefix} ${v.status === "match" ? "MATCH" : "MISMATCH"} (gallery ${enabled ? "enabled" : "not enabled"})`);
        console.log(`            on-chain ${v.root}`);
        console.log(`            computed ${v.status === "match" ? v.root : v.computed}`);
        console.log(`            tree     ipfs://${v.cid}`);
        break;
      }
      case "unverifiable":
        console.log(`${prefix} UNVERIFIABLE (${v.reason})\n            on-chain ${v.root}`);
        break;
      case "revokes-gallery":
        console.log(`${prefix} REVOKES GALLERY ${v.root}`);
        break;
      case "not-applicable":
        console.log(`${prefix} NOT APPLICABLE (target ${action.target})`);
        break;
      case "malformed":
        console.log(`${prefix} MALFORMED CALLDATA (${v.error})`);
        break;
    }
  }
  console.log();
}

const cap = await getCapTable(client, scan);
console.log("== Cap table (current, from Transfer logs)\n");
if (!cap) {
  console.log("No shares issued");
} else {
  for (const h of cap.holders) console.log(`${h.address}  ${formatEther(h.balance).padStart(8)}  ${(Number(h.bps) / 100).toFixed(2).padStart(6)}%  (${h.bps} bps)`);
  const total = 10000n - cap.remainderBps;
  console.log(`\nSupply ${formatEther(cap.supply)}  Total ${total} bps (${(Number(total) / 100).toFixed(2)}%)  Rounding remainder ${cap.remainderBps} bps`);
}
