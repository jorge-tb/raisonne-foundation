# Raisonné Foundation

An on-chain closed-end art fund. Shareholders govern a collection whose metadata cannot
be altered after acquisition — not by the curator, not by the treasury, not by the
deployer — and whose cap table is provably backed by capital actually contributed.

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
| `ArtRegistry` | ERC-721. Holds approved gallery roots; mints only against a valid proof. | Implemented, 13 tests |
| `FundShare` | ERC-20 + `ERC20Votes` + `ERC20Permit`. Equity, voting power, and the founding subscription round. | Implemented, 38 unit tests + 5 invariants |
| `FundGovernor` + `TimelockController` | Proposal lifecycle; executes payloads through the timelock. | Implemented, 6 unit + 18 integration tests |
| `FundTreasury` | UUPS proxy. Holds ETH and the collection; distributes sale proceeds. | Stub — accepts ETH, nothing else |

### Deployment topology

Ownership is arranged so that no single key can move value or approve metadata.

1. `FundTreasury` is deployed first; both other contracts need its address.
2. `FundShare` is deployed with the treasury, the subscription deadline, and the
   allowlist.
3. `TimelockController` is deployed with empty proposer and executor sets and the
   deployer as temporary admin.
4. `ArtRegistry` is deployed with the timelock as `Ownable` owner and the treasury as
   mint recipient.
5. `FundGovernor` is deployed with the timelock and the share token.
6. The deployer grants `PROPOSER_ROLE` and `CANCELLER_ROLE` to the governor,
   `EXECUTOR_ROLE` to `address(0)`, and then renounces `DEFAULT_ADMIN_ROLE`.

After step 6 the deployer retains no privileges anywhere in the system. The only route
to `addGallery` or `revokeGallery` is a passed proposal, since the timelock is the
registry's owner and the governor is the timelock's only proposer.

### Founding round

The fund raises once, before it owns anything.

1. `FundShare` is deployed with an allowlist of stakeholders, each with an agreed
   contribution, and a subscription deadline.
2. Each stakeholder calls `subscribe()` sending exactly their agreed amount. Shares are
   minted one-to-one with wei contributed.
3. When contributions received equal contributions expected, the round is complete and
   anyone may call `finalize()`, forwarding the full balance to the treasury.
4. If the deadline passes with the round unfilled, it expires and each subscriber may
   call `refund(to)` to recover their contribution.

Shares are non-transferable until the round reaches `COMPLETED`. Until then a share is a
receipt for returnable capital, not equity, and moving it would strand the refund it
backs — see *Shares are locked until the round completes*.

Because shares are minted only against ETH actually received, the resulting cap table is
verifiable on-chain: total supply always equals total contributions. This is asserted
directly by the invariant suite rather than left as a claim in prose.

### Acquisition lifecycle

1. A curator pins artwork metadata to IPFS and builds a Merkle tree over the
   resulting `(tokenId, cid)` pairs.
2. A proposal is submitted carrying two actions: approve the root on `ArtRegistry`,
   and transfer funds to the seller.
3. Shareholders rebuild the root from the proposal body and vote.
4. The timelock executes both actions atomically.
5. Anyone may then call `mintArtwork` with a proof. The NFT is minted to the treasury.

Payment and registration are deliberately decoupled — see *Accepted limitations*.

The full path — curate, propose, vote, queue, execute, mint — runs end to end in
`test/integration/FundGovernor.t.sol`. Only the payment leg is absent, pending
`FundTreasury`.

---

## Current status

**`ArtRegistry`** — complete, 13 tests. Constructor validation and ownership wiring,
access control on both gallery functions, gallery lifecycle guards, proof verification,
`tokenURI` composition, ownership landing on the treasury, and mint failures including
metadata tampering.

**`FundShare`** — complete, 38 unit tests and 5 invariants. Constructor validation with
fuzzed guards on the allowlist loop, the three-state subscription machine, the transfer
lock in all three states, both ETH transfer failure paths, delegation and checkpoint
behaviour, and EIP-712 signature handling for `permit` and `delegateBySig`.

The invariant suite drives `subscribe`, `refund`, and `finalize` from a handler that
tracks its own ghost accounting, and asserts that supply, contract balance, and
`totalReceived` never diverge, that received never exceeds expected, and that
`hasSubscribed` matches the handler's view of who is in.

**`FundGovernor`** — complete, 6 unit and 18 integration tests. The unit tests cover
constructor wiring and its zero-address guards. The integration tests deploy the whole
system and exercise the proposal lifecycle: the pending/active/succeeded/queued/executed
progression including the exact snapshot boundary, defeat by failed quorum, by an
against majority, and by unanimous abstention, a minimal winning coalition, undelegated
holders carrying no weight, tokens acquired after the snapshot not counting, and the
reverts for voting twice, voting after the deadline, queuing before success, executing
before the timelock delay, and calling `addGallery` outside governance.

**`FundTreasury`** — not started. The deployed contract is a placeholder that accepts
ETH so the rest of the system can be wired and tested. The UUPS proxy, custody of the
collection, and proceeds distribution are still to be written.

---

## Design decisions

### Fund structure

**Closed-end, not open-end.** Supply is fixed once the founding round completes; entry
and exit thereafter happen on the secondary market. An open-end fund would mint and
redeem shares continuously at net asset value — which requires knowing what the
collection is currently worth. For illiquid physical art there is no trustworthy
on-chain source for that number, and a mispriced NAV transfers value between new and
existing holders in whichever direction the error runs. Real art funds are closed-end
for the same reason. Raising more capital means a successor fund, not a larger one.

**Subscription closes before the first acquisition.** While the fund holds nothing but
ETH, a share is worth exactly the ETH backing it, so a fixed price is correct rather
than arbitrary. That property disappears the moment the fund owns a painting.

**No `MerkleDistributor`.** An earlier design distributed initial shares against Merkle
proofs with a claimed-status bitmap. It was cut: `ArtRegistry` already demonstrates
Merkle commitments with a stronger threat model, and a distributor only earns its
complexity above roughly a hundred recipients — below that, the index-to-bitmap
machinery is overhead with no beneficiary.

### `FundShare`

**Round state is derived, not stored.** `roundState()` computes OPEN, EXPIRED, or
COMPLETED from the deadline and the contribution totals. Storing it would require a
transition function someone has to call, and would let a `view` disagree with a
state-changing function about the same question.

**Exact contributions only.** `subscribe()` requires `msg.value` to equal the agreed
amount exactly. Gas is charged separately from transferred value, so there is no dust
to tolerate. This also makes `hasSubscribed[x]` imply that `x` contributed exactly
`expectedContributions[x]`, which is what refunds rely on.

**Shares are locked until the round completes.** `_update` rejects holder-to-holder
transfers in any state but `COMPLETED`. Refund entitlement is expressed as a burn of the
full agreed contribution, so a subscriber who moved even one wei away could no longer be
refunded, and an attacker could trigger that on someone else's behalf. Mints and burns
are exempt, so `subscribe` and `refund` are unaffected. `COMPLETED` is the right
threshold because it is exactly the point at which refunds stop being reachable:
transfers unlock precisely when they can no longer strand anything. This was found by
self-audit after the fact and is written up as M-01 in `AUDIT.md`.

**`refund(address to)` takes a recipient.** Authorisation stays on `msg.sender`; only
the destination is redirected. A stakeholder whose subscribing address cannot receive
ETH would otherwise have no recovery path. Shares, by contrast, are always minted to
`msg.sender` — flexibility in where value flows out is cheap, flexibility in where
governance power flows in is not.

**`finalize()` is permissionless.** The action is fully determined and the caller
receives nothing, so gating it would only create a liveness risk.

**Single delegation, not weighted split.** `ERC20Votes` allows one delegate per account
because voting power is conserved: the sum across delegates must always equal total
supply. Weighted splitting would make every token transfer touch every delegate on both
sides, turning an O(1) transfer into an unbounded loop.

**Timestamps, not block numbers.** `clock()` and `CLOCK_MODE()` are overridden for
ERC-6372 timestamp mode. `ERC20Votes` defaults to block numbers, which makes a voting
period a guess about block production rather than a duration; a governance window
denominated in blocks drifts whenever block times do. The token is the clock authority
for the whole system — `GovernorVotes` adopts whatever the token reports — so the
override belongs here and not on the governor.

### `FundGovernor`

**Composition over custom code.** The contract is OpenZeppelin's `Governor` with
`GovernorSettings`, `GovernorVotes`, `GovernorVotesQuorumFraction`,
`GovernorCountingSimple`, and `GovernorTimelockControl`, plus the override
reconciliations the diamond inheritance requires. Everything specific to this fund lives
in the deployment parameters and the timelock's role assignment, not in rewritten
governance logic.

**Governance parameters are constructor arguments.** Voting delay, voting period,
proposal threshold, and quorum numerator are all set at deployment. Voting delay exists
so shareholders can react to a proposal before the snapshot fixes voting power; quorum
is a fraction of supply at the snapshot rather than an absolute figure, so it stays
meaningful regardless of how large the round was.

**The governor owns nothing and holds nothing.** Every payload executes as the timelock:
the timelock is the registry's `Ownable` owner and will be the treasury's controller.
The governor's only privilege is the right to queue into it.

**Execution is open, proposal is not.** `EXECUTOR_ROLE` is granted to `address(0)`, so
any address may execute a proposal whose timelock delay has elapsed. The payload was
fixed at queue time and the executor gains nothing, so gating execution would only add a
liveness risk. `PROPOSER_ROLE` and `CANCELLER_ROLE` go to the governor alone.

**Admin is renounced at deployment.** `TimelockController` is deployed with the deployer
as admin only long enough to wire the roles, then the role is renounced in the same
sequence. A retained admin could grant itself proposer rights and bypass every vote,
which would make the rest of the design decorative.

**Abstain counts for quorum, not for the outcome.** `GovernorCountingSimple` folds
abstentions into the quorum tally while leaving the For/Against comparison untouched, so
a holder can legitimise a vote without taking a side. A proposal carried entirely by
abstentions is defeated, which the integration tests assert explicitly.

### `ArtRegistry`

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

**Current state in storage, history in events.** Nothing on-chain reads when a gallery
was approved, so it belongs in logs. The inverse holds for `tokenURI`, which contracts
must be able to read and which therefore cannot live in events — the EVM has no opcode
that reads a log.

---

## Accepted limitations

**The allowlist presupposes off-chain identity.** Restricting subscription to named
addresses does not provide sybil resistance — nothing on-chain can establish that two
addresses are the same person. It enforces that only parties to the founding agreement
can subscribe, and that guarantee lives in whatever verification produced the list.

**Majority capture is not prevented.** A stakeholder holding a majority of shares
controls every vote. This is ordinary for an equity structure, where votes track capital
at risk, and the mitigation is the timelock: minority holders can see a passed proposal
before it executes and exit. That is an exit right, not a veto.

**The exit right depends on a liquid secondary market.** The timelock gives minority
holders a window to sell before a proposal executes. Whether anyone is buying shares in
a closed-end fund about to make a decision they disagreed with is not something the
contracts can arrange.

**Refunds cannot reach an address that rejects ETH.** `refund(to)` mitigates this by
letting the stakeholder nominate a different recipient, but a stakeholder controlling no
payable address has no path. The transaction reverts atomically, so nothing is lost.

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

**Timestamp dependence.** `roundState()` compares against `block.timestamp`, and the
governance clock runs on timestamps too. A proposer can shift these by a few seconds.
Subscription windows and voting periods are measured in days or weeks, so the impact is
negligible.

**Securities framing.** A token representing proportional ownership of assets managed by
others would require securities compliance in most jurisdictions. Out of scope here.

---

## Build and test

```
forge build
forge test

forge test --match-path "test/unit/*"
forge test --match-path "test/integration/*"
forge test --match-path "test/invariant/*"

forge test --match-contract ArtRegistry -vvv
forge test --match-contract FundShare -vvv
forge test --match-contract FundGovernor -vvv
```

Compiler pinned to solc 0.8.36. Dependencies: OpenZeppelin Contracts v5, Murky (Merkle
tree construction in tests), forge-std.

Tests are split by kind: `test/unit/` for per-contract behaviour, `test/integration/`
for the deployed system end to end, `test/invariant/` for properties asserted across
arbitrary call sequences. The invariant profile runs with `fail_on_revert = false`,
since the handler deliberately drives calls that the contract is expected to reject.

The deploy script in `script/` is still the Foundry template and does not deploy a
working system — recorded as L-03 in `AUDIT.md`.

---

## Concepts

A mapping from each bootcamp topic to the file and line where it is exercised will live
in `CONCEPTS.md`, still to be written. A self-audit of this codebase, in findings
format, lives in `AUDIT.md` and is updated as contracts land.
