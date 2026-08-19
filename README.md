# Raisonne Foundation

An on-chain art fund. Shareholders govern an art collection whose metadata cannot
be altered after acquisition — not by the curator, not by the treasury, not by the
deployer.

Capstone project for the Alchemy University Ethereum bootcamp.

---

## The problem

Almost every NFT collection stores a mutable `baseURI` and derives each token's
metadata URI from it. Whoever controls that variable can repoint any token at any
document, at any time.

IPFS is often presented as the fix, but it only guarantees that a given CID always
returns the same bytes. It says nothing about *which* CID a contract points a token
at. The issuer can still change the pointer tomorrow. "Metadata frozen" is usually a
promise in an announcement, not a property of the system.

## The approach

Before a batch of artworks can be minted, its `(tokenId, cid)` pairs are hashed into
a Merkle tree and only the **root** is committed on-chain, through a governance vote.
Minting requires presenting a proof against an approved root.

Three consequences follow:

- A token cannot come into existence pointing at metadata outside the committed set.
- The commitment costs one storage slot regardless of collection size.
- No function exists that alters an approved root's contents, so no key — including
  the deployer's — can substitute metadata after the fact.

Voters are not asked to trust a bare 32-byte hash. The proposal body, pinned to IPFS,
contains the full tree. Anyone can rebuild the root locally and compare it against the
proposal's calldata before voting.

---

## Architecture

| Contract | Role | Status |
|---|---|---|
| `ArtRegistry` | ERC-721. Holds approved gallery roots; mints only against a valid proof. | Implemented, tested |
| `FundShare` | ERC-20 + `ERC20Votes` + `ERC20Permit`. Equity and voting power. | Planned |
| `MerkleDistributor` | Initial share allocation, claimed by proof. | Planned |
| `FundGovernor` + `TimelockController` | Proposal lifecycle; executes payloads by low-level `call`. | Planned |
| `FundTreasury` | UUPS proxy. Holds ETH and the collection; distributes sale proceeds. | Planned |

### Acquisition lifecycle

1. A curator pins artwork metadata to IPFS and builds a Merkle tree over the
   resulting `(tokenId, cid)` pairs.
2. A proposal is submitted carrying two actions: approve the root on `ArtRegistry`,
   and transfer funds to the seller.
3. Shareholders rebuild the root from the proposal body and vote.
4. The timelock executes both actions atomically.
5. Anyone may then call `mintArtwork` with a proof. The NFT is minted to the treasury.

Payment and registration are deliberately decoupled — see *Accepted limitations*.

---

## Current status

`ArtRegistry` is complete and covered by 13 passing tests:

- Constructor validation and ownership wiring
- Access control on both gallery functions (timelock only)
- Gallery lifecycle guards: zero root, duplicate addition, revoking an unknown or
  already-revoked gallery
- Mint success: proof verification, `tokenURI` composition, ownership landing on the
  treasury
- Mint failures: metadata tampering, duplicate token, disabled gallery

The remaining contracts are not yet started.

---

## Design decisions

**Gallery roots are a set, not a slot.** Multiple roots are enabled simultaneously, so
approving a new batch never invalidates an outstanding one.

**Revocation does not affect minted tokens.** A root authorises minting; once a token
exists, its CID lives in storage and root validity is irrelevant to it forever after.
Revocation exists for batches that were never minted — a failed acquisition, wrong
metadata, a seller who withdrew.

**Leaves are double-hashed over `abi.encode`.** The second hash prevents an internal
node being presented as a leaf, since both are 32 bytes and the verifier cannot
distinguish them. `abi.encode` rather than `abi.encodePacked` because the leaf combines
a `uint256` with a dynamic `string`, and packed encoding of dynamic types admits
collisions.

**Metadata is stored as a string, not a `bytes32` digest.** A raw digest is one storage
slot instead of three, but reconstructing a CID from it requires on-chain base58
encoding and hardcodes assumptions about hash function and CID version. CIDs are
self-describing by design; the Merkle proof already guarantees the stored string is the
approved one.

**Minting is permissionless.** The NFT goes to the treasury regardless of caller, so
there is nothing for a caller to capture and no reason to gate it.

**`_mint`, not `_safeMint`.** The receiver is a known immutable address, which avoids
imposing an `IERC721Receiver` implementation on the treasury.

**Timestamps live in events, not storage.** Nothing on-chain reads when a gallery was
approved, so it belongs in logs rather than costing a storage slot.

---

## Accepted limitations

**Content addressing gives integrity, not availability.** If nobody pins a CID, the
metadata is unreachable even though the proof still verifies. Mitigated by redundant
pinning; not solved by it.

**Proofs are generated off-chain.** The full tree must remain published, or minting for
that batch becomes impossible. Trees are committed to the repository and pinned.

**Payment precedes registration.** Funds leave at proposal execution, while the NFT is
minted whenever someone calls `mintArtwork`. The treasury can therefore have paid for a
piece not yet on its books. This is deliberate: the purchase happens off-chain under a
real contract, and the token is the fund's record of holding, not title to it.

**On-chain records are not physical facts.** The registry records what governance
approved and what the fund is entitled to hold. Whether a canvas is authentic, intact,
or physically present is unfalsifiable from inside the EVM.

**Securities framing.** A token representing proportional ownership of assets managed by
others would require securities compliance in most jurisdictions. Out of scope here.

---

## Build and test

```
forge build
forge test
forge test --match-contract ArtRegistry -vvv
```

Dependencies: OpenZeppelin Contracts, Murky (Merkle tree construction in tests),
forge-std.

---

## Concepts

A mapping from each bootcamp topic to the file and line where it is exercised lives in
`CONCEPTS.md`. A self-audit of this codebase, in findings format, lives in `AUDIT.md`.
Both are written as the corresponding contracts land.
