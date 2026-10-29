import { concat, encodeAbiParameters, keccak256, zeroHash, type Hex } from "viem";

// TypeScript port of Murky (lib/murky/src/common/MurkyBase.sol + Merkle.sol), the tree that
// produced the on-chain gallery roots (script/ProposeGallery.s.sol via SampleGallery.root).
// Construction: leaves in file order, level by level, odd last node paired with bytes32(0),
// pairs hashed in ascending order. Not interchangeable with @openzeppelin/merkle-tree's
// StandardMerkleTree (sorted leaves, heap layout, no padding): for gallery 001 that gives a
// different root (acceptance test, 2026-10-29).

// ArtRegistry.mintArtwork: keccak256(bytes.concat(keccak256(abi.encode(tokenId, cid))))
export function leafHash(tokenId: bigint, cid: string): Hex {
  return keccak256(keccak256(encodeAbiParameters([{ type: "uint256" }, { type: "string" }], [tokenId, cid])));
}

// Murky Merkle.hashLeafPairs and OZ Hashes.commutativeKeccak256: sort, concat, hash.
function hashPair(a: Hex, b: Hex): Hex {
  return BigInt(a) < BigInt(b) ? keccak256(concat([a, b])) : keccak256(concat([b, a]));
}

function hashLevel(level: Hex[]): Hex[] {
  const next: Hex[] = [];
  for (let i = 0; i + 1 < level.length; i += 2) next.push(hashPair(level[i], level[i + 1]));
  if (level.length % 2 === 1) next.push(hashPair(level[level.length - 1], zeroHash));
  return next;
}

// Murky getRoot. Murky reverts for a single leaf; so does this.
export function murkyRoot(leaves: Hex[]): Hex {
  if (leaves.length < 2) throw new Error("Murky won't generate a root for fewer than two leaves");
  let level = leaves;
  while (level.length > 1) level = hashLevel(level);
  return level[0];
}

// Murky getProof. A padded node's sibling is bytes32(0) and is included in the proof.
export function murkyProof(leaves: Hex[], index: number): Hex[] {
  if (leaves.length < 2) throw new Error("Murky won't generate a proof for fewer than two leaves");
  if (!Number.isInteger(index) || index < 0 || index >= leaves.length) throw new Error(`leaf index ${index} out of range`);
  const proof: Hex[] = [];
  let level = leaves;
  let node = index;
  while (level.length > 1) {
    if (node % 2 === 1) proof.push(level[node - 1]);
    else if (node + 1 === level.length) proof.push(zeroHash);
    else proof.push(level[node + 1]);
    node = Math.floor(node / 2);
    level = hashLevel(level);
  }
  return proof;
}

// OZ MerkleProof.processProof: what ArtRegistry.mintArtwork runs on chain.
export function verifyProof(proof: Hex[], root: Hex, leaf: Hex): boolean {
  return proof.reduce(hashPair, leaf).toLowerCase() === root.toLowerCase();
}
