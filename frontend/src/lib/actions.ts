import { AbiFunctionSignatureNotFoundError, BaseError, decodeFunctionData, isAddressEqual, type Address, type Hex } from "viem";
import { ArtRegistry } from "@/generated/contracts";

// What one (target, calldata) pair of a proposal does, as far as galleries are concerned.
export type ActionKind =
  | { kind: "add-gallery"; root: Hex }
  | { kind: "revoke-gallery"; root: Hex }
  // Not an ArtRegistry gallery call: treasury withdrawal, upgrade, anything else.
  | { kind: "not-applicable"; target: Address; selector: Hex }
  // ArtRegistry selector matched but the arguments don't decode. Anyone can propose
  // (proposalThreshold = 0), so this must render, not crash the page.
  | { kind: "malformed"; target: Address; error: string };

export function classifyAction(target: Address, calldata: Hex): ActionKind {
  const selector = calldata.slice(0, 10) as Hex;

  // Target first: selectors are 4 bytes and can collide across contracts.
  if (!isAddressEqual(target, ArtRegistry.address)) return { kind: "not-applicable", target, selector };

  let decoded;
  try {
    decoded = decodeFunctionData({ abi: ArtRegistry.abi, data: calldata });
  } catch (error) {
    if (error instanceof AbiFunctionSignatureNotFoundError) return { kind: "not-applicable", target, selector };
    if (error instanceof BaseError) return { kind: "malformed", target, error: error.shortMessage };
    throw error;
  }

  // revokeGallery(bytes32) decodes with the same argument shape and the opposite meaning.
  switch (decoded.functionName) {
    case "addGallery":
      return { kind: "add-gallery", root: decoded.args[0] };
    case "revokeGallery":
      return { kind: "revoke-gallery", root: decoded.args[0] };
    default:
      return { kind: "not-applicable", target, selector };
  }
}
