# Scripts

## The rule

A script in `script/` does what **one participant can do with one key**. It takes
a single signer, performs a single action, and works on any network.

Anything that needs several identities at once, or control over time, lives in
`script/local/` and only works against Anvil.

That boundary is deliberate: it keeps the ordinary scripts honest about what a
real stakeholder can actually do, and confines the pretending to one directory.

---

## Layout

```
script/
  Deploy.s.sol           deploy and wire the whole system
  Subscribe.s.sol        subscribe to the founding round and self-delegate
  Finalize.s.sol         forward the raised ETH to the treasury
  ProposeGallery.s.sol   submit an acquisition proposal
  Vote.s.sol             cast one vote
  Queue.s.sol            schedule a succeeded proposal on the timelock
  Execute.s.sol          execute a queued proposal
  Mint.s.sol             mint one approved artwork against a Merkle proof

  libs/
    RaisonneDeployer.sol   deployment and role wiring
    DeploymentRecord.sol   reads/writes deployments/<chainId>.json
    ProposalRecord.sol     reads/writes proposals/<chainId>/<proposalId>.json
  local/
    demo.sh              the full lifecycle, with the governance delays skipped
```

---

## Shared artifacts

The scripts coordinate through two JSON files rather than through environment
variables, because the values they pass between each other are too awkward to
express as strings — and a single character wrong in a proposal's calldata
produces a different proposal id and a failure that looks unrelated.

**`deployments/<chainId>.json`** — written by `Deploy`, read by everything else.
Holds the six contract addresses.

**`proposals/<chainId>/<proposalId>.json`** — written by `ProposeGallery`, read
by `Queue` and `Execute`. Holds the targets, values, calldatas and description
that identify the proposal.

`Queue` and `Execute` depend on the *format*, not on `ProposeGallery`. Any future
proposal script writing the same shape works with them unchanged.

Foundry blocks filesystem access from scripts by default; `foundry.toml` grants
read-write on `./deployments` and `./proposals` and nothing else. Records for
chain `31337` (Anvil) are git-ignored, since every local run regenerates them,
but both directories are kept with `.gitkeep` files: `vm.writeJson` does not
create missing directories. Records for a public network are meant to be
committed.

---

## Conventions

Every script follows the same shape:

1. **Read** the deployment record, and the proposal record where needed.
2. **Load and validate** environment variables, failing before anything is
   broadcast.
3. **Pre-validate** on-chain state — the proposal is in the right state, the
   caller has the balance or the votes.
4. **Broadcast** the one action the script exists for.
5. **Post-validate** on-chain state — the action had the effect it was supposed
   to.

Pre-validation turns an opaque revert from deep inside OpenZeppelin into a
message that names the actual problem. Post-validation means a script that exits
cleanly has proven its own outcome, not merely sent a transaction.

The signer is whatever `--private-key` (or `--account`) provides; scripts read it
as `msg.sender` for balance and voting-power checks.

---

## Running the system

### Deploy

```
make anvil        # in another terminal
make deploy
```

`make deploy` targets `$RPC_URL` (default `http://localhost:8545`) and signs
with `$DEPLOYER_KEY` (default: Anvil's first account).

`Deploy` runs `libs/RaisonneDeployer.sol`, which deploys and wires the system in
this order:

1. `TimelockController`, empty proposer and executor sets, deployer as admin.
2. `FundTreasury` implementation, then an `ERC1967Proxy` initialised with the
   **deployer** as owner.
3. `FundShare`, with the deadline at `block.timestamp + ROUND_DEADLINE_OFFSET`.
4. `FundGovernor`.
5. `ArtRegistry`, owned by the timelock, minting to the treasury proxy.
6. `initializeRegistry(registry)` on the treasury, then treasury ownership to the
   timelock.
7. `PROPOSER_ROLE` and `CANCELLER_ROLE` to the governor, `EXECUTOR_ROLE` to
   `address(0)`, then the deployer renounces `DEFAULT_ADMIN_ROLE`.

It then asserts the end state — no role left on the deployer, timelock owning
the treasury, registry wired — before writing the deployments file.

Owning the treasury briefly lets the registry be wired during deployment rather
than by a first governance proposal. The cost is a window: each step is a
separate transaction, so if a broadcast stops partway the deployer is left
owning the treasury proxy and possibly still holding timelock admin. Because the
record is written only after post-validation passes, the other scripts will
never pick up a half-wired deployment — but anyone adopting one by hand should
check `owner()` on the treasury proxy and `DEFAULT_ADMIN_ROLE` on the timelock
first.

`RaisonneDeployer` is why the project builds with `via_ir = true`: its one
function exceeds the legacy pipeline's stack limit.

### Founding round

Each stakeholder subscribes with their own key, sending exactly the amount
agreed for them in `CONTRIBUTIONS` — `FundShare` rejects anything else:

```
CONTRIBUTION=1 forge script script/Subscribe.s.sol \
  --rpc-url $RPC_URL --broadcast --private-key $KEY
```

Once every stakeholder has subscribed, anyone may close the round:

```
forge script script/Finalize.s.sol --rpc-url $RPC_URL --broadcast --private-key $KEY
```

### Governance

```
forge script script/ProposeGallery.s.sol ...          # logs PROPOSAL_ID=<id>
# wait out votingDelay
PROPOSAL_ID=<id> forge script script/Vote.s.sol ...   # once per voter
# wait out votingPeriod
PROPOSAL_ID=<id> forge script script/Queue.s.sol ...
# wait out the timelock's minDelay
PROPOSAL_ID=<id> forge script script/Execute.s.sol ...
```

On Anvil, the waits are:

```
cast rpc evm_increaseTime <seconds> --rpc-url $RPC_URL
cast rpc evm_mine --rpc-url $RPC_URL
```

### Minting

Once the gallery root is enabled:

```
ARTWORK_INDEX=0 forge script script/Mint.s.sol ...
```

`ARTWORK_INDEX` is zero-based and must be below `GALLERY_SIZE`. The token URI is
`ipfs://CID-<index + 1>` and the owner is the treasury proxy.

---

## The demo

```
make anvil        # in another terminal
make deploy
make demo
```

`script/local/demo.sh` runs everything after deployment against Anvil —
subscription, finalization, proposal, voting, queueing, execution and minting
every artwork in the gallery — skipping the governance delays. It aborts if
`deployments/31337.json` is missing, so `make deploy` has to come first.

```
make deploy │ make demo
            │
  Deploy ───┼─► Subscribe (each stakeholder) ─► Finalize
            │                                     │
            │   ┌─────────────────────────────────┘
            │   ▼
            │   ProposeGallery ─► [voting delay] ─► Vote (each stakeholder)
            │                                         │
            │   ┌─────────────────────────────────────┘
            │   ▼
            │   [voting period] ─► Queue ─► [timelock delay] ─► Execute ─► Mint (each artwork)
```

Bracketed steps are time that has to pass on-chain. On a live network that is
waiting; in the demo each one is a single `evm_increaseTime` + `evm_mine`, sized
from the governor's `votingDelay()` and `votingPeriod()` and the timelock's
`getMinDelay()`.

**It is a shell script rather than a Forge script for a structural reason.** A
Forge script collects its transactions during a local simulation pass and
broadcasts them all after `run()` returns. Time jumps made inside that pass
therefore happen *before* any transaction is sent, so they cannot land between
stages — the simulation sees a valid sequence and the chain receives a batch
that reverts. Driving each stage as a separate `forge script` process is the
simplest arrangement where each batch lands before the next jump.

The script reads `STAKEHOLDERS_KEYS`, `CONTRIBUTIONS` and `GALLERY_SIZE` from
`.env`, uses the first key as the proposer, discovers the proposal id from
`ProposeGallery`'s logged `PROPOSAL_ID=` line, and finishes by reporting how
many artworks the treasury holds and its ETH balance.

It requires `jq`.

To start over, restart Anvil and run `make deploy` again. The old
`deployments/31337.json` is overwritten; stale files under `proposals/31337/`
can be deleted.

---

## Environment

Create a `.env` at the repository root. It is git-ignored; `forge script` loads
it automatically and `demo.sh` sources it. For a local run, Anvil's published
default accounts are enough:

```
MIN_DELAY=86400
ROUND_DEADLINE_OFFSET=604800
STAKEHOLDERS=0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266,0x70997970C51812dc3A010C7d01b50e0d17dc79C8
STAKEHOLDERS_KEYS=0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80,0x59c6995e998f97a5a0044966f0945389dc9e86dae88c7a8412f4603b6b78690d
CONTRIBUTIONS=60,40
VOTING_DELAY=86400
VOTING_PERIOD=259200
PROPOSAL_THRESHOLD=0
QUORUM_NUMERATOR=4
GALLERY_SIZE=4
```

| Variable | Meaning |
|---|---|
| `MIN_DELAY` | Timelock delay, in seconds (at least one day) |
| `ROUND_DEADLINE_OFFSET` | Subscription window length, in seconds from deployment (at least one day) |
| `STAKEHOLDERS` | Allowlisted addresses, comma-separated |
| `STAKEHOLDERS_KEYS` | Their private keys, same order (local only; the first also proposes) |
| `CONTRIBUTIONS` | Agreed contributions in whole ether, same order |
| `VOTING_DELAY` | Seconds between proposal creation and the snapshot (at least one day) |
| `VOTING_PERIOD` | Seconds the vote stays open (at least one day) |
| `PROPOSAL_THRESHOLD` | Voting power required to propose, in share wei |
| `QUORUM_NUMERATOR` | Quorum as a percentage of past total supply, `0`–`100` |
| `GALLERY_SIZE` | Number of sample artworks to generate |

Per-invocation variables — `CONTRIBUTION`, `PROPOSAL_ID`, `ARTWORK_INDEX` — are
passed on the command line, as in the examples above.

`CONTRIBUTIONS` and `CONTRIBUTION` are in whole ether and multiplied by
`1 ether` in the scripts, so the file stays readable — and so a contribution of
0.5 ETH cannot be expressed.

Never put a key that controls real funds in `.env`. For testnet deployments use
`cast wallet import` and pass `--account` to `forge script` instead of
`--private-key`; note that `make deploy` always signs with `--private-key`, so
run `Deploy` directly in that case.

---

## Limitations

These scripts drive a demonstration, not a production acquisition:

- **Sample gallery only.** `ProposeGallery` and `Mint` build the tree from
  `test/helpers/SampleGallery.sol` — placeholder CIDs (`CID-1`, `CID-2`, …)
  regenerated from `GALLERY_SIZE` on every run. There is no path yet for a
  curated tree loaded from a file.
- **No payment leg.** The proposal approves the root only; the README's
  acquisition lifecycle pairs it with a treasury `pay` to the seller.
- **`Vote` always votes For.** There is no way yet to vote Against or Abstain.
- **Fixed proposal description.** Proposing the same gallery size twice yields
  the same proposal id and reverts.
