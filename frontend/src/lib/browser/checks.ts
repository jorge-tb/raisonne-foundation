import {
  BaseError,
  ContractFunctionRevertedError,
  createPublicClient,
  decodeFunctionData,
  http,
  isAddressEqual,
  keccak256,
  parseAbi,
  toBytes,
  type Address,
  type Hex,
  type PublicClient,
} from "viem";
import { sepolia } from "viem/chains";
import { ADDRESSES, CHAIN_ID } from "@/generated/contracts";
import { DEFAULT_IPFS_GATEWAY } from "../gallery";

// Checks that run in the viewer's browser, against an RPC the viewer can choose, so that
// nothing our server sends has to be trusted. Current-state eth_calls only (no logs), so a
// keyless public RPC works. Minimal ABI fragments keep the full ABIs out of the bundle.

export const DEFAULT_BROWSER_RPC = "https://ethereum-sepolia-rpc.publicnode.com";

// The custom errors let a revert be classified by name: only the expected one is an answer.
const governorAbi = parseAbi([
  "function hashProposal(address[] targets, uint256[] values, bytes[] calldatas, bytes32 descriptionHash) pure returns (uint256)",
  "function state(uint256 proposalId) view returns (uint8)",
  "error GovernorNonexistentProposal(uint256 proposalId)",
]);

const registryAbi = parseAbi([
  "function addGallery(bytes32 root)",
  "function revokeGallery(bytes32 root)",
  "function isGalleryEnabled(bytes32 root) view returns (bool)",
  "function tokenURI(uint256 tokenId) view returns (string)",
  "error ERC721NonexistentToken(uint256 tokenId)",
]);

// `?rpc=` and `?gateway=` overrides: https URLs only.
function override(param: string, fallback: string, trailingSlash: boolean): string {
  const raw = new URLSearchParams(window.location.search).get(param);
  if (!raw) return fallback;
  try {
    const url = new URL(raw);
    if (url.protocol !== "https:") return fallback;
    return trailingSlash && !url.href.endsWith("/") ? `${url.href}/` : url.href;
  } catch {
    return fallback;
  }
}

export const browserRpcUrl = () => override("rpc", DEFAULT_BROWSER_RPC, false);
export const browserGateway = (fallback = DEFAULT_IPFS_GATEWAY) => override("gateway", fallback, true);

// The RPC is what every ✓ ultimately trusts, and `?rpc=` arrives with the link, so a shared
// link could carry a lying node. The UI must say so whenever this is true.
// Compared as normalised URLs: new URL() adds a trailing slash, so the default passed
// explicitly must not count as an override.
export const rpcOverridden = (rpcUrl: string) => new URL(rpcUrl).href !== new URL(DEFAULT_BROWSER_RPC).href;

// One client per RPC URL for the whole page, so concurrent checks share viem's request dedupe.
const clients = new Map<string, PublicClient>();

export function browserClient(rpcUrl: string): PublicClient {
  let client = clients.get(rpcUrl);
  if (!client) {
    client = createPublicClient({ chain: sepolia, transport: http(rpcUrl, { retryCount: 2 }) });
    clients.set(rpcUrl, client);
  }
  return client;
}

// "rejected": the contract gave the specific answer we asked about (e.g. GovernorNonexistentProposal).
// "unexpected-revert": it reverted with anything else, or with no reason. "unreachable": no
// trustworthy answer (network, RPC down, wrong chain). Only "rejected" may ever render as a mismatch.
export type Check<T = true> =
  | { ok: true; value: T }
  | { ok: false; reason: "rejected" | "unexpected-revert" | "unreachable"; detail: string };

// `expected`: the custom error that means "no" for this call, and how to word it.
// viem errors are matched by name, not instanceof, so a second copy of viem can't break this.
const isViemError = (e: unknown): e is BaseError => e instanceof Error && typeof (e as BaseError).walk === "function";

function failure(error: unknown, expected?: { errorName: string; detail: string }): Check<never> {
  const revert = isViemError(error) ? error.walk((e) => (e as Error).name === "ContractFunctionRevertedError") : null;
  if (revert) {
    const { data, reason, signature } = revert as ContractFunctionRevertedError;
    const name = data?.errorName;
    if (expected && name === expected.errorName) return { ok: false, reason: "rejected", detail: expected.detail };
    // require(string) / panic → their message; unknown custom error → its selector.
    const what = name === "Error" || name === "Panic" ? reason : (name ?? (signature ? `unknown error ${signature}` : reason));
    return { ok: false, reason: "unexpected-revert", detail: `unexpected revert (${what ?? "no reason given"})` };
  }
  const detail = isViemError(error) ? error.shortMessage : String(error);
  return { ok: false, reason: "unreachable", detail: detail.replace(/\.+$/, "") };
}

// Catches an RPC for the wrong network (the hardcoded addresses mean nothing there).
// A lying RPC can fake this too; that is what the override warning is for.
// The default RPC is a hardcoded Sepolia endpoint, a constant like CHAIN_ID: only `?rpc=` is asked.
export async function checkChain(client: PublicClient, rpcUrl: string): Promise<Check<number>> {
  if (!rpcOverridden(rpcUrl)) return { ok: true, value: CHAIN_ID };
  try {
    const chainId = await client.getChainId();
    if (chainId !== CHAIN_ID) return { ok: false, reason: "unreachable", detail: `the RPC is on chain ${chainId}, not Sepolia (${CHAIN_ID})` };
    return { ok: true, value: chainId };
  } catch (error) {
    return failure(error);
  }
}

export type ProposalContents = { id: bigint; targets: Address[]; values: bigint[]; calldatas: Hex[]; description: string };

// The proposal id commits to targets, values, calldatas and keccak256(description). If the
// Governor hashes these contents to the claimed id AND knows that id (state() doesn't revert),
// neither the calldata (so the root) nor the description (so the CID) was altered.
// Returns the live ProposalState index.
export async function checkProposalBinding(client: PublicClient, p: ProposalContents): Promise<Check<number>> {
  const descriptionHash = keccak256(toBytes(p.description));
  let id: bigint;
  try {
    id = await client.readContract({
      address: ADDRESSES.FundGovernor,
      abi: governorAbi,
      functionName: "hashProposal",
      args: [p.targets, p.values, p.calldatas, descriptionHash],
    });
  } catch (error) {
    // A pure function: any revert is unexpected.
    return failure(error);
  }
  if (id !== p.id) return { ok: false, reason: "rejected", detail: `contents hash to a different id (${id})` };
  try {
    const state = await client.readContract({ address: ADDRESSES.FundGovernor, abi: governorAbi, functionName: "state", args: [id] });
    return { ok: true, value: state };
  } catch (error) {
    return failure(error, { errorName: "GovernorNonexistentProposal", detail: "the Governor has no proposal with this id" });
  }
}

export async function checkGalleryEnabled(client: PublicClient, root: Hex): Promise<Check<boolean>> {
  try {
    const enabled = await client.readContract({ address: ADDRESSES.ArtRegistry, abi: registryAbi, functionName: "isGalleryEnabled", args: [root] });
    return { ok: true, value: enabled };
  } catch (error) {
    return failure(error);
  }
}

// ArtRegistry._baseURI() is "ipfs://", so a minted token's tokenURI is ipfs://<leaf cid>.
export async function checkTokenUri(client: PublicClient, tokenId: bigint, cid: string): Promise<Check<boolean>> {
  try {
    const uri = await client.readContract({ address: ADDRESSES.ArtRegistry, abi: registryAbi, functionName: "tokenURI", args: [tokenId] });
    return { ok: true, value: uri === `ipfs://${cid}` };
  } catch (error) {
    // "rejected" here means "not minted", which is a normal answer, not a mismatch.
    return failure(error, { errorName: "ERC721NonexistentToken", detail: "token not minted" });
  }
}

// Same classification as lib/actions.ts, decoded here so the root comes from calldata the
// browser itself bound to the proposal id.
export function decodeGalleryAction(target: Address, calldata: Hex): { kind: "add" | "revoke"; root: Hex } | null {
  if (!isAddressEqual(target, ADDRESSES.ArtRegistry)) return null;
  try {
    const { functionName, args } = decodeFunctionData({ abi: registryAbi, data: calldata });
    if (functionName === "addGallery") return { kind: "add", root: args[0] };
    if (functionName === "revokeGallery") return { kind: "revoke", root: args[0] };
  } catch {
    // Unknown selector or undecodable args: not a gallery action we can verify.
  }
  return null;
}
