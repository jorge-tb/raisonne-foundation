import {
  AbiFunctionSignatureNotFoundError,
  BaseError,
  decodeFunctionData,
  getAbiItem,
  isAddressEqual,
  type Abi,
  type AbiFunction,
  type Address,
  type Hex,
} from "viem";
import { formatAbiItem } from "viem/utils";
import { ArtRegistry, FundGovernor, FundShare, FundTreasury, TimelockController } from "@/generated/contracts";

// The fund's own contracts: the only targets whose calls the site can decode.
export const KNOWN_CONTRACTS = [
  { name: "FundShare", address: FundShare.address, abi: FundShare.abi },
  { name: "FundGovernor", address: FundGovernor.address, abi: FundGovernor.abi },
  { name: "TimelockController", address: TimelockController.address, abi: TimelockController.abi },
  { name: "FundTreasury", address: FundTreasury.address, abi: FundTreasury.abi }, // the proxy, which proposals call
  { name: "ArtRegistry", address: ArtRegistry.address, abi: ArtRegistry.abi },
] as const;
export type ContractName = (typeof KNOWN_CONTRACTS)[number]["name"];

const knownContract = (target: Address) => KNOWN_CONTRACTS.find((c) => isAddressEqual(c.address, target)) ?? null;

// What one (target, calldata) pair of a proposal does.
export type ActionKind =
  | { kind: "add-gallery"; root: Hex }
  | { kind: "revoke-gallery"; root: Hex }
  | { kind: "pay"; to: Address; amount: bigint; reason: string }
  | { kind: "sell"; to: Address; artworkId: bigint }
  // Replaces a contract's code (UUPS): changes the rules themselves.
  | { kind: "upgrade"; contract: ContractName; implementation: Address; data: Hex }
  // Any other function on one of the fund's contracts: settings, roles, ownership.
  | { kind: "contract-call"; contract: ContractName; functionName: string }
  // Not one of the fund's contracts, or a selector none of their ABIs has.
  | { kind: "not-applicable"; target: Address; selector: Hex }
  // A known selector whose arguments don't decode. Anyone can propose
  // (proposalThreshold = 0), so this must render, not crash the page.
  | { kind: "malformed"; target: Address; contract: ContractName; error: string };

export function classifyAction(target: Address, calldata: Hex): ActionKind {
  const selector = calldata.slice(0, 10) as Hex;
  const notApplicable = { kind: "not-applicable", target, selector } as const;

  // Target first: selectors are 4 bytes and can collide across contracts.
  const contract = knownContract(target);
  if (!contract) return notApplicable;

  let decoded;
  try {
    decoded = decodeFunctionData({ abi: contract.abi as Abi, data: calldata });
  } catch (error) {
    if (error instanceof AbiFunctionSignatureNotFoundError) return notApplicable;
    if (error instanceof BaseError) return { kind: "malformed", target, contract: contract.name, error: error.shortMessage };
    throw error;
  }

  const args = (decoded.args ?? []) as readonly unknown[];
  // revokeGallery(bytes32) decodes with the same argument shape and the opposite meaning.
  if (contract.name === "ArtRegistry" && decoded.functionName === "addGallery") return { kind: "add-gallery", root: args[0] as Hex };
  if (contract.name === "ArtRegistry" && decoded.functionName === "revokeGallery")
    return { kind: "revoke-gallery", root: args[0] as Hex };
  if (contract.name === "FundTreasury" && decoded.functionName === "pay")
    return { kind: "pay", to: args[0] as Address, amount: args[1] as bigint, reason: args[2] as string };
  if (contract.name === "FundTreasury" && decoded.functionName === "sell")
    return { kind: "sell", to: args[0] as Address, artworkId: args[1] as bigint };
  if (decoded.functionName === "upgradeToAndCall")
    return { kind: "upgrade", contract: contract.name, implementation: args[0] as Address, data: args[1] as Hex };
  return { kind: "contract-call", contract: contract.name, functionName: decoded.functionName };
}

// The call itself, for "Under the hood": contract, signature and every argument by name.
export type DecodedCall = {
  contract: ContractName | null;
  signature: string | null; // null when no known ABI has the selector
  params: { name: string; type: string; value: unknown }[];
};

export function decodeCall(target: Address, calldata: Hex): DecodedCall {
  const contract = knownContract(target);
  if (!contract) return { contract: null, signature: null, params: [] };
  try {
    const decoded = decodeFunctionData({ abi: contract.abi as Abi, data: calldata });
    const args = (decoded.args ?? []) as readonly unknown[];
    const item = getAbiItem({ abi: contract.abi as Abi, name: decoded.functionName, args: args as unknown[] }) as AbiFunction | undefined;
    return {
      contract: contract.name,
      signature: item ? formatAbiItem(item, { includeName: true }).replace(/^function /, "") : decoded.functionName,
      params: (item?.inputs ?? []).map((input, i) => ({ name: input.name || `arg${i}`, type: input.type, value: args[i] })),
    };
  } catch {
    return { contract: contract.name, signature: null, params: [] };
  }
}
