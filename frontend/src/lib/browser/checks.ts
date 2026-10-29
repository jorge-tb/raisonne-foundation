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
import { ADDRESSES } from "@/generated/contracts";
import { DEFAULT_IPFS_GATEWAY } from "../gallery";

// Checks that run in the viewer's browser, against an RPC the viewer can choose, so that
// nothing our server sends has to be trusted. Current-state eth_calls only (no logs), so a
// keyless public RPC works. Minimal ABI fragments keep the full ABIs out of the bundle.

export const DEFAULT_BROWSER_RPC = "https://ethereum-sepolia-rpc.publicnode.com";

const governorAbi = parseAbi([
  "function hashProposal(address[] targets, uint256[] values, bytes[] calldatas, bytes32 descriptionHash) pure returns (uint256)",
  "function state(uint256 proposalId) view returns (uint8)",
]);

const registryAbi = parseAbi([
  "function addGallery(bytes32 root)",
  "function revokeGallery(bytes32 root)",
  "function isGalleryEnabled(bytes32 root) view returns (bool)",
  "function tokenURI(uint256 tokenId) view returns (string)",
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

export function browserClient(rpcUrl: string): PublicClient {
  return createPublicClient({ chain: sepolia, transport: http(rpcUrl, { retryCount: 2 }) });
}

// "rejected": the chain said no. "unreachable": we couldn't ask (network, RPC down).
export type Check<T = true> = { ok: true; value: T } | { ok: false; reason: "rejected" | "unreachable"; detail: string };

function failure(error: unknown, rejectedDetail: string): Check<never> {
  const reverted = error instanceof BaseError && error.walk((e) => e instanceof ContractFunctionRevertedError);
  if (reverted) return { ok: false, reason: "rejected", detail: rejectedDetail };
  return { ok: false, reason: "unreachable", detail: error instanceof BaseError ? error.shortMessage : String(error) };
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
    return failure(error, "hashProposal reverted");
  }
  if (id !== p.id) return { ok: false, reason: "rejected", detail: `contents hash to a different id (${id})` };
  try {
    const state = await client.readContract({ address: ADDRESSES.FundGovernor, abi: governorAbi, functionName: "state", args: [id] });
    return { ok: true, value: state };
  } catch (error) {
    return failure(error, "the Governor has no proposal with this id");
  }
}

export async function checkGalleryEnabled(client: PublicClient, root: Hex): Promise<Check<boolean>> {
  try {
    const enabled = await client.readContract({ address: ADDRESSES.ArtRegistry, abi: registryAbi, functionName: "isGalleryEnabled", args: [root] });
    return { ok: true, value: enabled };
  } catch (error) {
    return failure(error, "isGalleryEnabled reverted");
  }
}

// ArtRegistry._baseURI() is "ipfs://", so a minted token's tokenURI is ipfs://<leaf cid>.
export async function checkTokenUri(client: PublicClient, tokenId: bigint, cid: string): Promise<Check<boolean>> {
  try {
    const uri = await client.readContract({ address: ADDRESSES.ArtRegistry, abi: registryAbi, functionName: "tokenURI", args: [tokenId] });
    return { ok: true, value: uri === `ipfs://${cid}` };
  } catch (error) {
    return failure(error, "tokenURI reverted (token not minted)");
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
