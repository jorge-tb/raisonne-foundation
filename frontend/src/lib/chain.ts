import {
  createPublicClient,
  http,
  isAddressEqual,
  parseEventLogs,
  type Abi,
  type ContractEventName,
  type Hex,
  type Log,
  type PublicClient,
} from "viem";
import { sepolia } from "viem/chains";
import { ArtRegistry, FundGovernor, FundShare } from "@/generated/contracts";

// First block of the deployment: every log scan starts here.
export const DEPLOYMENT_BLOCK = 11958427n;

// viem retries 429s with exponential backoff (retryDelay * 2^attempt).
// Note: viem errors embed the RPC URL, API key included. Never log or render them raw.
export function createClient(rpcUrl: string): PublicClient {
  return createPublicClient({ chain: sepolia, transport: http(rpcUrl, { retryCount: 8, retryDelay: 250 }) });
}

export type ScanOptions = {
  fromBlock?: bigint;
  toBlock?: bigint;
  // Provider cap on eth_getLogs block span (Alchemy free tier: 10, inclusive).
  maxRange?: bigint;
  // Only read these blocks (from discoverLogBlocks), one eth_getLogs each, instead of the whole range.
  blocks?: bigint[];
  concurrency?: number;
};

export const LOG_EMITTERS = [FundGovernor.address, FundShare.address, ArtRegistry.address] as const;

// One eth_getLogs per chunk for all project contracts at once, then decode per contract.
// Result is ordered by (blockNumber, logIndex).
export async function scanLogs(client: PublicClient, opts: ScanOptions = {}) {
  const fromBlock = opts.fromBlock ?? DEPLOYMENT_BLOCK;
  const toBlock = opts.toBlock ?? (await client.getBlockNumber());
  const maxRange = opts.maxRange ?? toBlock - fromBlock + 1n;

  const chunks: [bigint, bigint][] = [];
  if (opts.blocks) {
    for (const b of opts.blocks) if (b >= fromBlock && b <= toBlock) chunks.push([b, b]);
  } else {
    for (let start = fromBlock; start <= toBlock; start += maxRange) {
      const end = start + maxRange - 1n;
      chunks.push([start, end < toBlock ? end : toBlock]);
    }
  }

  const address = [...LOG_EMITTERS];
  const raw: Log[] = [];
  let next = 0;
  const worker = async () => {
    while (next < chunks.length) {
      const [from, to] = chunks[next++];
      raw.push(...(await client.getLogs({ address, fromBlock: from, toBlock: to })));
    }
  };
  await Promise.all(Array.from({ length: opts.concurrency ?? 2 }, worker));

  raw.sort((a, b) => Number(a.blockNumber! - b.blockNumber!) || a.logIndex! - b.logIndex!);
  return { toBlock, logs: raw };
}

export type ScanResult = Awaited<ReturnType<typeof scanLogs>>;

// Decode one event of one contract. Filter by emitter first: FundShare and ArtRegistry
// both emit Transfer(address,address,uint256) with the same topic.
export function eventsOf<const TAbi extends Abi, TEvent extends ContractEventName<TAbi>>(
  scan: ScanResult,
  contract: { address: Hex; abi: TAbi },
  eventName: TEvent,
) {
  const logs = scan.logs.filter((l) => isAddressEqual(l.address, contract.address));
  return parseEventLogs({ abi: contract.abi, eventName, logs });
}
