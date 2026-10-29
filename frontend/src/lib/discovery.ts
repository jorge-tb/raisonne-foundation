import type { Address } from "viem";

// Log discovery via Etherscan V2 (user decision 2026-10-29): Alchemy's free tier caps
// eth_getLogs at 10 blocks, Etherscan doesn't. Etherscan only tells us *which blocks*
// hold project logs; the logs themselves are then read from the RPC (scanLogs({ blocks })).
// Trust impact: Etherscan can hide a log (completeness), not alter one (content).

const ENDPOINT = "https://api.etherscan.io/v2/api";
const PAGE = 1000;

type EtherscanResponse = { status: string; message: string; result: { blockNumber: string }[] | string };

async function request(params: Record<string, string>, apiKey: string): Promise<{ blockNumber: string }[]> {
  const url = `${ENDPOINT}?${new URLSearchParams({ ...params, apikey: apiKey })}`;
  for (let attempt = 0; ; attempt++) {
    // Errors never include `url`: it carries the API key.
    const res = await fetch(url, { signal: AbortSignal.timeout(15_000) });
    if (!res.ok) throw new Error(`Etherscan HTTP ${res.status}`);
    const body = (await res.json()) as EtherscanResponse;
    if (body.status === "1" && Array.isArray(body.result)) return body.result;
    if (body.message === "No records found") return [];
    const detail = typeof body.result === "string" ? body.result : body.message;
    if (/rate limit/i.test(detail) && attempt < 5) {
      await new Promise((r) => setTimeout(r, 500 * 2 ** attempt));
      continue;
    }
    throw new Error(`Etherscan: ${detail}`);
  }
}

// Sorted, distinct block numbers in [fromBlock, toBlock] where any of `addresses` emitted a log.
export async function discoverLogBlocks(
  apiKey: string,
  chainId: number,
  addresses: readonly Address[],
  fromBlock: bigint,
  toBlock: bigint,
): Promise<bigint[]> {
  const blocks = new Set<bigint>();
  for (const address of addresses) {
    // Etherscan caps page * offset at 10,000, so move the fromBlock cursor instead of paging.
    let cursor = fromBlock;
    for (;;) {
      const logs = await request(
        {
          chainid: String(chainId),
          module: "logs",
          action: "getLogs",
          address,
          fromBlock: cursor.toString(),
          toBlock: toBlock.toString(),
          page: "1",
          offset: String(PAGE),
        },
        apiKey,
      );
      for (const log of logs) blocks.add(BigInt(log.blockNumber));
      if (logs.length < PAGE) break;
      // Restart at the last block (not +1): it may hold more logs past this page.
      const last = BigInt(logs[logs.length - 1].blockNumber);
      if (last === cursor) throw new Error(`more than ${PAGE} logs in block ${cursor} for ${address}`);
      cursor = last;
    }
  }
  return [...blocks].sort((a, b) => (a < b ? -1 : a > b ? 1 : 0));
}
