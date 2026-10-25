#!/usr/bin/env bash
#
# Runs the full Raisonné Foundation lifecycle against a local Anvil node:
# subscription, finalization, an acquisition proposal, voting, queueing,
# execution, and minting.
#
# The governance delays are skipped with evm_increaseTime between stages. This
# is why the sequence lives here rather than in a Forge script: a script's
# transactions are all broadcast after it finishes, so time jumps made during
# its execution cannot land between them.
#
# Usage:
#   make anvil     # in another terminal
#   make deploy
#   make demo
#
# Requires .env to define STAKEHOLDERS_KEYS, CONTRIBUTIONS and GALLERY_FILENAME.
# ProposeGallery.s.sol must log a line of the form PROPOSAL_ID=<id>.

set -euo pipefail

RPC_URL="${RPC_URL:-http://localhost:8545}"
CHAIN_ID="${CHAIN_ID:-31337}"

cd "$(dirname "$0")/../.."

# --- preconditions ----------------------------------------------------------

[[ -f .env ]] || { echo "error: .env not found" >&2; exit 1; }

set -a
# shellcheck disable=SC1091
source .env
set +a

[[ -f "deployments/${CHAIN_ID}.json" ]] || {
  echo "error: no deployment for chain ${CHAIN_ID} — run 'make deploy' first" >&2
  exit 1
}

IFS=',' read -ra KEYS <<< "$STAKEHOLDERS_KEYS"
IFS=',' read -ra AMOUNTS <<< "$CONTRIBUTIONS"

[[ ${#KEYS[@]} -eq ${#AMOUNTS[@]} ]] || {
  echo "error: STAKEHOLDERS_KEYS and CONTRIBUTIONS have different lengths" >&2
  exit 1
}

GALLERY_FILE="galleries/${GALLERY_FILENAME}.json"

[[ -f "$GALLERY_FILE" ]] || {
  echo "error: gallery file ${GALLERY_FILE} not found" >&2
  exit 1
}

GALLERY_SIZE=$(jq length "$GALLERY_FILE")

DEPLOYER_KEY="${KEYS[0]}"

# --- helpers ----------------------------------------------------------------

# Runs a forge script and returns its stdout, so callers can read logged values.
run() {
  local script="$1"; shift
  forge script "$script" --rpc-url "$RPC_URL" --broadcast "$@"
}

# Runs a forge script and discards its output.
run_quiet() {
  run "$@" >/dev/null
}

advance() {
  local seconds="$1"
  echo "  advancing ${seconds}s"
  cast rpc evm_increaseTime "$seconds" --rpc-url "$RPC_URL" >/dev/null
  cast rpc evm_mine --rpc-url "$RPC_URL" >/dev/null
}

deployed() {
  jq -r ".$1" "deployments/${CHAIN_ID}.json"
}

GOVERNOR=$(deployed governor)
TIMELOCK=$(deployed timelock)
REGISTRY=$(deployed registry)
TREASURY=$(deployed treasuryProxy)

# --- founding round ---------------------------------------------------------

echo "==> Subscribing ${#KEYS[@]} stakeholders"
for i in "${!KEYS[@]}"; do
  echo "  stakeholder ${i}"
  CONTRIBUTION="${AMOUNTS[$i]}" run_quiet script/Subscribe.s.sol --private-key "${KEYS[$i]}"
done

echo "==> Finalizing the founding round"
run_quiet script/Finalize.s.sol --private-key "$DEPLOYER_KEY"

# --- proposal ---------------------------------------------------------------

echo "==> Proposing the gallery"
PROPOSAL_ID=$(run script/ProposeGallery.s.sol --private-key "$DEPLOYER_KEY" \
  | sed -n 's/^[[:space:]]*PROPOSAL_ID=//p' | tail -1)

[[ -n "$PROPOSAL_ID" ]] || {
  echo "error: ProposeGallery did not log a PROPOSAL_ID line" >&2
  exit 1
}
echo "  ${PROPOSAL_ID}"

VOTING_DELAY=$(cast call "$GOVERNOR" "votingDelay()(uint256)" --rpc-url "$RPC_URL" | awk '{print $1}')
VOTING_PERIOD=$(cast call "$GOVERNOR" "votingPeriod()(uint256)" --rpc-url "$RPC_URL" | awk '{print $1}')
MIN_DELAY=$(cast call "$TIMELOCK" "getMinDelay()(uint256)" --rpc-url "$RPC_URL" | awk '{print $1}')

# --- voting -----------------------------------------------------------------

echo "==> Waiting out the voting delay"
advance $((VOTING_DELAY + 1))

echo "==> Casting votes"
for i in "${!KEYS[@]}"; do
  echo "  stakeholder ${i} votes for"
  PROPOSAL_ID="$PROPOSAL_ID" run_quiet script/Vote.s.sol --private-key "${KEYS[$i]}"
done

echo "==> Waiting out the voting period"
advance $((VOTING_PERIOD + 1))

# --- execution --------------------------------------------------------------

echo "==> Queueing the proposal"
PROPOSAL_ID="$PROPOSAL_ID" run_quiet script/Queue.s.sol --private-key "$DEPLOYER_KEY"

echo "==> Waiting out the timelock delay"
advance $((MIN_DELAY + 1))

echo "==> Executing the proposal"
PROPOSAL_ID="$PROPOSAL_ID" run_quiet script/Execute.s.sol --private-key "$DEPLOYER_KEY"

# --- minting ----------------------------------------------------------------

echo "==> Minting ${GALLERY_SIZE} artworks"
for ((i = 0; i < GALLERY_SIZE; i++)); do
  echo "  artwork ${i}"
  ARTWORK_INDEX="$i" run_quiet script/Mint.s.sol --private-key "$DEPLOYER_KEY"
done

# --- summary ----------------------------------------------------------------

HELD=$(cast call "$REGISTRY" "balanceOf(address)(uint256)" "$TREASURY" --rpc-url "$RPC_URL")
BALANCE=$(cast balance "$TREASURY" --rpc-url "$RPC_URL")

echo
echo "Demo complete."
echo "  proposal   ${PROPOSAL_ID}"
echo "  artworks   ${HELD} held by the treasury"
echo "  treasury   ${BALANCE} wei"
