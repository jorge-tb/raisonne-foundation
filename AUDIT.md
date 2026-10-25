# Self-audit

Findings from reviewing this codebase against its own stated guarantees. Written as
contracts land, so the list grows and closes over time rather than arriving as a single
report.

**Scope:** `src/ArtRegistry.sol`, `src/FundShare.sol`, `src/FundGovernor.sol`,
`src/FundTreasury.sol`, the deployment sequence in `script/libs/RaisonneDeployer.sol` and
`script/Deploy.s.sol`, and the Sepolia deployment recorded in `DEPLOYMENTS.md`
**Out of scope:** OpenZeppelin library code, except where a finding depends on its behaviour
**Compiler:** solc 0.8.37, via-IR, optimizer at 200 runs · OpenZeppelin Contracts v5 and
Contracts Upgradeable v5

| ID | Severity | Title | Status |
|---|---|---|---|
| M-01 | Medium | Transferring shares during the founding round strands the refund | Fixed |
| M-02 | Medium | `cid` is unrecoverable from the `ArtworkMinted` log | Fixed |
| M-03 | Medium | Token IDs are not namespaced across galleries | Open |
| L-01 | Low | `finalize()` forwards `totalReceived`, not the contract balance | Acknowledged |
| L-02 | Low | `ERC20Votes` clock mode is unset | Fixed |
| L-03 | Low | Deploy script is the unmodified Foundry template | Fixed |
| L-04 | Low | Unused `FundTreasury` import in `ArtRegistry` | Open |
| L-05 | Low | Deployment leaves a trust window whose effects can outlast it | Acknowledged |
| I-01 | Info | Revoked gallery roots can be re-approved | Open |
| I-02 | Info | Approved roots cannot be enumerated on-chain | Acknowledged |
| I-03 | Info | Constructor loop is unbounded | Acknowledged |
| I-04 | Info | Refunds push ETH to the recipient | Acknowledged |
| I-05 | Info | Six `forge lint` warnings are suppressed | Acknowledged |
| I-06 | Info | Under via-IR, a test's `block.timestamp` read can move across `vm.warp` | Mitigated |
| I-07 | Info | Some Sepolia images are licensed for non-commercial use only | Acknowledged |

---

## `FundTreasury` review

`FundTreasury` produced no finding above Low. What was checked, and what holds:

- **Implementation cannot be initialised.** The constructor calls `_disableInitializers()`.
  On Sepolia the implementation's `Initializable` slot holds `type(uint64).max`.
- **Proxy initialisation cannot be front-run.** `initialize(deployer)` runs in the
  `ERC1967Proxy` constructor's calldata, in the same transaction that creates the proxy.
- **Each initialiser runs once.** `initialize` is `initializer` (version 1) and
  `initializeRegistry` is `reinitializer(2)` and `onlyOwner`. Both are consumed on Sepolia
  (`Initialized(1)` at block 11958429, `Initialized(2)` at block 11958433).
- **Storage location matches ERC-7201.** `FUNDTREASURY_STORAGE` equals
  `keccak256(abi.encode(uint256(keccak256("raisonne.storage.FundTreasury")) - 1)) & ~bytes32(uint256(0xff))`,
  checked with `cast index-erc7201`. `OwnableUpgradeable` and `Initializable` keep their own
  namespaces in v5, so nothing shares a slot.
- **Upgrades take a passed proposal.** `_authorizeUpgrade` is `onlyOwner` and the owner is
  the timelock. OpenZeppelin's `upgradeToAndCall` also checks `proxiableUUID` on the new
  implementation, so an upgrade to a contract that is not UUPS-compatible reverts rather
  than bricking the proxy.
- **Value leaves only through the owner.** `pay` and `sell` are `onlyOwner`. Both make an
  external call to an arbitrary recipient before emitting, but a re-entrant call cannot pass
  `onlyOwner`, and neither function has state left to corrupt after the call.
- **ETH transfer paths fail loudly.** `pay` checks the balance and reverts on a failed call.
  `sell` uses `safeTransferFrom`, so a recipient that cannot hold ERC-721s reverts the sale.

The deployment around it is covered by L-05.

---

## M-01 · Transferring shares during the founding round strands the refund

**Severity:** Medium
**Location:** `FundShare.sol` — `refund`, and the absence of any transfer restriction
**Status:** Fixed

### Description

`subscribe()` mints shares that were immediately transferable, while `refund()` burns an
amount fixed at `expectedContributions[msg.sender]` — the subscriber's full agreed
contribution, not their current balance.

A subscriber who transferred any shares away therefore held less than the burn required.
OpenZeppelin's `_update` reverts with `ERC20InsufficientBalance` when the sender's balance
is below the value being burned, so the burn failed before the ETH transfer on the
following line was ever reached.

The revert is atomic, so no state was corrupted: the flag reset and the `totalReceived`
decrement both unwound cleanly. The problem was liveness, not integrity. `refund()` is the
only exit path from an expired round, and for that subscriber it reverted on every call.

### Impact

The subscriber's ETH remained in the contract with no reachable path out:

- `refund()` reverted for them, on every attempt
- `finalize()` requires the `COMPLETED` state, unreachable once a round has expired unfilled
- no sweep, rescue, or administrative recovery function exists

Recovery was possible in principle by reacquiring enough shares to cover the full
contribution, which is why this is rated Medium rather than High. But that depends on a
counterparty willing to sell back, and is impossible if the shares reached an address that
cannot or will not return them.

The transfer that triggers this is entirely ordinary ERC-20 behaviour — moving shares to a
cold wallet or a multisig for safekeeping is enough — and nothing in the interface warned
against it. A single wei was sufficient to strand the entire contribution.

Two further consequences of unrestricted transferability during the round:

**Griefing.** An attacker acquiring any quantity of shares from a subscriber caused that
subscriber's entire refund to revert. The attacker gained nothing, making this spite
rather than theft, but the effect on the victim was the same.

**Premature governance.** Voting power was delegable from the moment of subscription, so
governance was live over a treasury that held nothing and might never be capitalised.

### Root cause

Neither `subscribe`, `refund`, nor ERC-20 transferability is wrong in isolation. Each
behaves exactly as designed. The defect lived in the interaction between them: refund
entitlement was expressed as a share balance, and share balances were mutable by a
mechanism that knew nothing about refunds.

Two existing tests bracket the bug without touching it — one transfers shares between
delegates, another refunds a subscriber — and 50 passing tests did not catch it, because
none crossed the seam between the two features.

### Fix

`_update` is overridden to reject holder-to-holder transfers unless the round has reached
`COMPLETED`, reverting with `TransferLockedDuringRound` and carrying the current state so
failures are diagnosable.

Mints and burns are exempt: the guard applies only when neither party is the zero address,
so `subscribe` and `refund` pass through unaffected.

`COMPLETED` is the correct threshold because it is precisely the point at which refunds
stop being reachable. In `OPEN` and `EXPIRED` a refund is still possible and a transfer
would strand it; in `COMPLETED` the round has filled, `finalize()` forwards the balance to
the treasury, and there is no longer anything to strand. Transfers unlock exactly when
they can no longer cause harm.

This also states the intended model more honestly. Before the round completes, a share is
a receipt for returnable capital rather than equity in a fund — and a deposit that can be
traded away but not reclaimed is incoherent.

### Tests

A regression test transfers one wei of shares, warps past the deadline, and asserts that
`refund` reverts with `ERC20InsufficientBalance` on the unfixed contract. Additional tests
cover transfer attempts in both `OPEN` and `EXPIRED`, and confirm that transfers succeed
once the round is finalised.

The existing delegate-transfer test now finalises the round before transferring. Its
failure against the fix was expected and confirms the lock is active.

### Follow-up coverage

The README claims that total supply always equals total contributions, and this fix is
what makes that claim hold by construction rather than by circumstance. The natural
expression of it is an invariant test asserting equality between `totalSupply()` and
`totalReceived()` across arbitrary sequences of subscribe, refund, and finalize.

That test now exists. `test/invariant/FundShare.t.sol` drives the three state-changing
functions plus a bounded `warp` from a handler with its own ghost accounting, and asserts
`invariant_TotalSupplyMatchesTotalReceived` alongside four related properties. It would
have caught M-01 directly.

### Note on severity

The commits carrying the test and the fix are labelled `[High]`. This report rates the
finding Medium, for the reason given under *Impact*: recovery by reacquiring the
transferred shares was possible in principle, if not reliably. The commit messages were
written before that analysis and have not been rewritten; the rating here is the
considered one.

---

## M-02 · `cid` is unrecoverable from the `ArtworkMinted` log

**Severity:** Medium
**Location:** `ArtRegistry.sol` — `ArtworkMinted` event declaration
**Status:** Fixed

The `cid` parameter is declared `indexed`. Indexed parameters of dynamic type are not
stored in the log data — the EVM records `keccak256(cid)` as a topic and the value itself
appears nowhere. Any indexer or off-chain consumer reading this event receives a hash it
cannot invert.

This contradicts the design principle stated in the README under *Current state in
storage, history in events*: the most significant piece of history in this event is the
one thing the event fails to record.

**Fix:** move `cid` to the non-indexed data section. If filtering by CID is genuinely
required, add a separate indexed `bytes32` hash alongside the plain string.

**Resolution:** `cid` is no longer `indexed`, so the string is ABI-encoded into the log
data and readable by any consumer (commit `d677b50c1fa344e1d106088b90f32216bf0ff0db`).
Filtering by CID was not needed, so no hash topic was added. The existing event test
passes unchanged, since `expectEmit` compares the data section as well as the topics.

---

## M-03 · Token IDs are not namespaced across galleries

**Severity:** Medium
**Location:** `ArtRegistry.sol` — `mintArtwork`
**Status:** Open

Gallery roots are independent sets and nothing constrains the token IDs a curator places
in a tree. Two separately approved roots may each contain a leaf for the same token ID
with different CIDs.

Whichever is minted first wins. The second reverts inside OpenZeppelin's `_mint` with
`ERC721InvalidSender(address(0))`, which gives the caller no indication of the actual
problem. Governance cannot detect the collision at approval time, since only the root is
on-chain, so it surfaces later as a failed mint against a legitimately approved batch.

**Fix:** either derive token IDs deterministically from the root and leaf index, or add an
explicit existence check before minting so the failure is diagnosable. The existing test
for minting an already-minted token currently asserts the opaque behaviour rather than the
intended one.

---


## L-01 · `finalize()` forwards `totalReceived`, not the contract balance

**Severity:** Low
**Status:** Acknowledged — deliberate

ETH can reach the contract without passing through `subscribe()`, via `SELFDESTRUCT` or by
pre-funding a `CREATE2` address. Any such surplus is never forwarded and never refundable.

The exposure is limited to what an attacker chooses to donate, and forwarding the full
balance instead would let a third party inflate what the treasury receives. Forwarding the
accounted total is the deliberate choice: the treasury receives exactly the capital the cap
table represents.

---

## L-02 · `ERC20Votes` clock mode is unset

**Severity:** Low
**Status:** Fixed

`ERC20Votes` defaults to block numbers. `FundGovernor` must adopt the same clock or
`GovernorVotes` will reject the pairing. The decision was being made implicitly by
omission.

Timestamp-based governance is generally preferable, since block times vary and proposal
durations expressed in blocks drift. The clock overrides belonged on `FundShare`, before
`FundGovernor` was written.

**Fix:** `FundShare` now overrides `clock()` to return `Time.timestamp()` and
`CLOCK_MODE()` to return `ERC6372Utils.timestampClockMode(clock)`, declaring timestamp
mode per ERC-6372. `GovernorVotes` reads the clock from the token, so the governor follows
without further configuration, and the voting delay and period are consequently durations
in seconds rather than block counts.

The ordering was deliberate: the override landed before `FundGovernor` existed, so the
governor was never written against the wrong clock.

---

## L-03 · Deploy script is the unmodified Foundry template

**Severity:** Low
**Status:** Fixed

`script/ArtRegistry.s.sol` retains the contract name generated by `forge init`, deploys
against placeholder addresses, declares `UNLICENSED` where the repository is MIT, and uses
a floating pragma where `src/` pins an exact compiler version.

No security impact. Recorded because a deploy script that cannot deploy is a gap in the
repository's own claims about being buildable and testable.

**Resolution:** the template was removed (commit
`3683e2392ce0741f9068ffbe26bfdfb886219ef4`) and replaced by `script/Deploy.s.sol`
(commit `c95f8664c74d205addf1af771c592f57ae7fce33`), which deploys and wires the whole
system through `script/libs/RaisonneDeployer.sol`, declares MIT, and asserts the final
role and ownership layout before writing the deployment record. Seven further scripts
cover the lifecycle after deployment; the full path has been run end to end on Anvil and
on Sepolia.

---

## L-04 · Unused `FundTreasury` import in `ArtRegistry`

**Severity:** Low
**Status:** Open

The treasury is held as a plain address, so the imported type is never used. Remove the
import, or type the immutable if the interface is intended to matter once `FundTreasury`
is implemented.

`FundTreasury` is now implemented and imports `ArtRegistry` in turn, so the two files
import each other. The import in `ArtRegistry` is still unused. Removing it also removes
the cycle.

---

## L-05 · Deployment leaves a trust window whose effects can outlast it

**Severity:** Low
**Location:** `script/libs/RaisonneDeployer.sol`; `FundTreasury.initialize` and
`initializeRegistry`
**Status:** Acknowledged — verified clean on Sepolia

### Description

`ArtRegistry`'s constructor takes the treasury address, and the treasury needs the
registry's address: a cycle. The deployment breaks it in two steps. The proxy is created
with `initialize(deployer)`, so ownership is set in the same transaction and cannot be
claimed by anyone else. The deployer then calls `initializeRegistry(registry)` and transfers
ownership to the timelock.

From the proxy's creation until `transferOwnership`, the deployer owns the treasury. From
the timelock's creation until `renounceRole`, the deployer also holds `DEFAULT_ADMIN_ROLE`
on the timelock. On Sepolia the window spans blocks 11958427 to 11958438, twelve
transactions.

The two alternatives were rejected for reasons given in the README. Predicting the
treasury address with CREATE2 makes deployment depend on a salt and a matching bytecode
hash to state a relationship that a second transaction states directly. Wiring the
registry by a first governance proposal leaves the treasury without a registry until a
full voting cycle completes, before the fund can do anything else.

### Impact

The window closes, but some things done inside it do not:

- an upgrade of the proxy keeps its implementation after ownership moves to the timelock
- `initializeRegistry` with a different registry consumes `reinitializer(2)`, so the wrong
  wiring is permanent
- a role the deployer grants itself on the timelock, such as `PROPOSER_ROLE`, survives the
  deployer renouncing admin, and so does an operation it schedules with that role

`Deploy.s.sol` asserts what the sequence set: deployer not admin, governor holding proposer
and canceller, open execution, timelock owning the treasury, registry wired. It does not
assert the absence of anything else. It cannot usefully do so, since a deployer intending
to misuse the window would not run the assertions either. The guarantee for anyone outside
the deployer comes from the event history, not from the script.

Rated Low rather than Informational because the persistent effects are not covered by the
script's own checks, so a reviewer has to go to the chain. Not higher because every action
needs the deployer's key, the deployer already chooses the bytecode — so the window adds
no capability that writing the code does not — and every action leaves an event.

### Verification on Sepolia

- `Upgraded`: once, at block 11958429, in the proxy constructor, to the verified
  implementation `0x7F1e7322Ff74DdF244a0443F33F8bE380F27f0Ca`.
- `OwnershipTransferred` on the proxy: to the deployer at block 11958429, then to the
  timelock at block 11958434.
- `RoleGranted` on the timelock: exactly the five expected — admin to the timelock itself
  and to the deployer, proposer and canceller to the governor, executor to `address(0)`.
- `RoleRevoked`: the deployer's admin role, at block 11958438.
- `CallScheduled`: two, both from the governor's `queue` transactions for the two
  acquisitions.

### Aborted deployments

Two earlier `Deploy` runs stopped after six transactions, before any wiring. Their
contracts remain on Sepolia: two treasury proxies owned by the deployer, and two
timelocks with the deployer still admin. Nothing references them, and the canonical
addresses are those in `deployments/11155111.json`. They are the window's failure mode
— a sequence stopped partway — occurring harmlessly.

| Run | `TimelockController` | `ERC1967Proxy` (treasury) |
|---|---|---|
| `run-1792533326024` | `0xcb485610d526bf4c8995046d0f7aabc580a89a75` | `0xa1a7631ef313bd18bbc74de78a51cb569b82940d` |
| `run-1792534356454` | `0x62ba611733fa204f1fc1802a5b6070a86ec85eec` | `0x1f2cad795903c462aaafbb73b222f4aa9b6d4042` |

---

## I-01 · Revoked gallery roots can be re-approved

**Status:** Open

`addGallery` rejects roots that are currently enabled, a condition a revoked root does not
meet. A revoked root can therefore be approved again.

The README's rationale for revocation — wrong metadata, a seller who withdrew — suggests
revocation may be intended as permanent. If so, a separate record of ever-revoked roots
would enforce it. If reinstatement is intended, the behaviour should be documented rather
than left to be inferred.

---

## I-02 · Approved roots cannot be enumerated on-chain

**Status:** Acknowledged

Only membership is queryable. Acceptable given that events carry the history, though this
depends on M-02 being fixed before an indexer can reconstruct anything useful.

---

## I-03 · Constructor loop is unbounded

**Status:** Acknowledged

The allowlist loop is correctly unchecked-incremented and bounded in practice by the block
gas limit. The practical maximum stakeholder count should be stated, since exceeding it
makes the contract undeployable rather than merely expensive.

---

## I-04 · Refunds push ETH to the recipient

**Status:** Acknowledged

`refund(to)` sends the contribution with a low-level call and reverts if it fails. A
stakeholder whose recipient rejects ETH cannot recover their contribution through it.

The `to` parameter is the mitigation. Authorisation stays on `msg.sender`, so a
stakeholder whose own address cannot receive ETH — a contract without a payable path, for
instance — can name any address that can. The residual case is a stakeholder that controls
no address able to receive ETH at all, which is why this is Informational. A pull pattern
would not help: the failure is in the recipient, not in the ordering, and a later
withdrawal to the same recipient fails the same way. The revert is atomic, so a failed
refund loses nothing and can be retried with a different `to`.

---

## I-05 · Six `forge lint` warnings are suppressed

**Status:** Acknowledged

Each is suppressed with `forge-lint: disable-next-line` at the site. Recorded here so the
reasoning lives somewhere other than a comment.

| Lint | Suppressed at | Why it does not apply |
|---|---|---|
| `block-timestamp` | `src/FundShare.sol:54`, constructor | Checks the deadline is in the future at deployment. A proposer can shift the timestamp by seconds; the window is days. |
| `block-timestamp` | `src/FundShare.sol:147`, `roundState()` | Same reasoning. The governance clock also runs on timestamps by design (L-02). |
| `erc20-unchecked-transfer` | `test/unit/FundShare.t.sol:195`, `:214` | The token is `FundShare`, an OpenZeppelin `ERC20` that reverts on failure and otherwise returns `true`. The second site exists to assert the revert. |
| `incorrect-shift` | `test/integration/FundGovernor.t.sol:422`, `:446` | `1 << uint8(state)` builds the proposal-state bitmap that `GovernorUnexpectedProposalState` carries, as OpenZeppelin's `_encodeStateBitmap` does. The lint flags a literal left operand because in Yul `shl(x, y)` shifts `y` by `x`; in Solidity `1 << n` is the intended expression. |

---

## I-06 · Under via-IR, a test's `block.timestamp` read can move across `vm.warp`

**Status:** Mitigated in tests — deployed bytecode unaffected

With `via_ir` and the optimizer both enabled, a test that computes a time from
`block.timestamp`, warps, and then uses that time can fail. In this project the symptom was
a `Panic(0x11)` in a `getPastVotes` test. The build needs `via_ir` because
`RaisonneDeployer`'s single function exceeds the legacy pipeline's stack limit, so turning
it off is not an option.

A minimal reproduction lives in a separate repository, and reproduces on solc 0.8.36 and
0.8.37. Its README attributes the panic to the ternary guarding `index - 1` in
`Checkpoints.upperLookupRecent`. A full trace of the reproduction does not support that:

- the second `vm.warp` goes to 259201, not 172801. `delegationTimestamp` was recomputed
  from `block.timestamp` after the first warp, rather than kept from before it
- the panic is raised in the test contract, and `getPastVotes` is never called
- reading the start time through `vm.getBlockTimestamp()`, with nothing else changed and
  the same compiler settings, makes the test pass

The optimizer is entitled to treat `block.timestamp` as constant for the duration of a
call, and may re-read it instead of keeping a copy. `vm.warp` changes it mid-call, which
no real transaction can do. That makes this a property of testing with cheatcodes, not a
code generation fault, and deployed contracts are unaffected.

The affected test, `test/unit/FundShare.t.sol:220`, reads time through
`vm.getBlockTimestamp()`. Any new test that computes a time before a warp and uses it after
should do the same.

---

## I-07 · Some Sepolia images are licensed for non-commercial use only

**Status:** Acknowledged

The Rijksmuseum works are public domain. The Mauritshuis images are used under the
museum's non-commercial terms; on Sepolia that covers tokens 1, 7, 8, 10, and 11. A testnet
deployment satisfies those terms. A deployment holding these tokens for value would not,
and would need its own rights to the images.
