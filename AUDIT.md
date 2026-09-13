# Self-audit

Findings from reviewing this codebase against its own stated guarantees. Written as
contracts land, so the list grows and closes over time rather than arriving as a single
report.

**Scope:** `src/ArtRegistry.sol`, `src/FundShare.sol`, `src/FundGovernor.sol`, and the
role wiring the tests deploy around `TimelockController`
**Out of scope:** `src/FundTreasury.sol`, a placeholder with no logic to review
**Compiler:** solc 0.8.36 · OpenZeppelin Contracts v5

| ID | Severity | Title | Status |
|---|---|---|---|
| M-01 | Medium | Transferring shares during the founding round strands the refund | Fixed |
| M-02 | Medium | `cid` is unrecoverable from the `ArtworkMinted` log | Open |
| M-03 | Medium | Token IDs are not namespaced across galleries | Open |
| L-01 | Low | `finalize()` forwards `totalReceived`, not the contract balance | Acknowledged |
| L-02 | Low | `ERC20Votes` clock mode is unset | Fixed |
| L-03 | Low | Deploy script is the unmodified Foundry template | Open |
| L-04 | Low | Unused `FundTreasury` import in `ArtRegistry` | Open |
| I-01 | Info | Revoked gallery roots can be re-approved | Open |
| I-02 | Info | Approved roots cannot be enumerated on-chain | Acknowledged |
| I-03 | Info | Constructor loop is unbounded | Acknowledged |

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
**Status:** Open

The `cid` parameter is declared `indexed`. Indexed parameters of dynamic type are not
stored in the log data — the EVM records `keccak256(cid)` as a topic and the value itself
appears nowhere. Any indexer or off-chain consumer reading this event receives a hash it
cannot invert.

This contradicts the design principle stated in the README under *Current state in
storage, history in events*: the most significant piece of history in this event is the
one thing the event fails to record.

**Fix:** move `cid` to the non-indexed data section. If filtering by CID is genuinely
required, add a separate indexed `bytes32` hash alongside the plain string.

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
**Status:** Open

`script/ArtRegistry.s.sol` retains the contract name generated by `forge init`, deploys
against placeholder addresses, declares `UNLICENSED` where the repository is MIT, and uses
a floating pragma where `src/` pins an exact compiler version.

No security impact. Recorded because a deploy script that cannot deploy is a gap in the
repository's own claims about being buildable and testable.

---

## L-04 · Unused `FundTreasury` import in `ArtRegistry`

**Severity:** Low
**Status:** Open

The treasury is held as a plain address, so the imported type is never used. Remove the
import, or type the immutable if the interface is intended to matter once `FundTreasury`
is implemented.

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

