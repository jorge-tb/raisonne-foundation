import { getAddress, isAddressEqual, zeroAddress, type Address, type Hex, type PublicClient } from "viem";
import { ADDRESSES, ArtRegistry, FundGovernor, FundShare, FundTreasury, TimelockController } from "@/generated/contracts";

// The account that deployed the system (DEPLOYMENTS.md, Sepolia). It gave every role away and renounced
// its admin role; the guarantees check, on chain, that it still holds none.
export const DEPLOYER: Address = "0x17b6641de7fad0d8d2d38CfAA780927746D536c0";

// Where the deployment set each permission up (DEPLOYMENTS.md): the origin of a guarantee, not its proof.
// The proof is the read at the snapshot block.
const ORIGIN: Record<string, Hex> = {
  noAdmin: "0x1fc91454971d5307f686fa87c7d0e1908887c4b41508563dff14998e6bddf355",
  treasuryByVote: "0x7a71900cd12f64cafe05f778289c80d55a7e380eb45ce5845598f9f96cb12b4e",
  registryByVote: "0x01a026478d3e25a4d511d8911a025d71eddc2308a308a82c45ecee67f82cae78",
  governorQueues: "0xee40969d305891f90a54ba43eb8a4f2682464510fd87ac09cd97ab58f538b7f0",
  anyoneExecutes: "0x8e22fd934e243be55c3973e6c8b54a5a6a49bf1281e50e89476fc7c7c5fa7cee",
};

// ERC-1967: the slot where a proxy stores its implementation address.
const IMPLEMENTATION_SLOT = "0x360894a13ba1a3210667c828492db98dca3e2076cc3735a920a3ca505d382bbc";

export type GuaranteeKey = "noAdmin" | "treasuryByVote" | "registryByVote" | "governorQueues" | "anyoneExecutes" | "votesFromShares" | "fundsToTreasury" | "delay";
export type Guarantee = { key: GuaranteeKey; status: "ok" | "fail" | "warn"; origin?: Hex };

export type ContractsState = {
  guarantees: Guarantee[];
  params: { votingDelay: bigint; votingPeriod: bigint; proposalThreshold: bigint; minDelay: bigint };
  treasuryImplementation: Address | null;
};

// A timelock delay shorter than a day leaves holders no time to exit before a decision runs.
const SAFE_DELAY = 86_400n;

// The permissions that make "nothing moves without a vote" true, read at the snapshot block.
export async function getContractsState(client: PublicClient, blockNumber: bigint): Promise<ContractsState> {
  const at = { blockNumber };
  const T = TimelockController;
  const [PROPOSER, CANCELLER, EXECUTOR, ADMIN] = await Promise.all([
    client.readContract({ ...T, functionName: "PROPOSER_ROLE", ...at }),
    client.readContract({ ...T, functionName: "CANCELLER_ROLE", ...at }),
    client.readContract({ ...T, functionName: "EXECUTOR_ROLE", ...at }),
    client.readContract({ ...T, functionName: "DEFAULT_ADMIN_ROLE", ...at }),
  ]);
  const hasRole = (role: Hex, account: Address) => client.readContract({ ...T, functionName: "hasRole", args: [role, account], ...at });

  const [
    deployerRoles,
    treasuryOwner,
    registryOwner,
    governorProposer,
    governorCanceller,
    governorTimelock,
    openExecutor,
    token,
    shareTreasury,
    minDelay,
    votingDelay,
    votingPeriod,
    proposalThreshold,
    implementationSlot,
  ] = await Promise.all([
    Promise.all([ADMIN, PROPOSER, CANCELLER].map((role) => hasRole(role, DEPLOYER))),
    client.readContract({ ...FundTreasury, functionName: "owner", ...at }),
    client.readContract({ ...ArtRegistry, functionName: "owner", ...at }),
    hasRole(PROPOSER, ADDRESSES.FundGovernor),
    hasRole(CANCELLER, ADDRESSES.FundGovernor),
    client.readContract({ ...FundGovernor, functionName: "timelock", ...at }),
    hasRole(EXECUTOR, zeroAddress),
    client.readContract({ ...FundGovernor, functionName: "token", ...at }),
    client.readContract({ ...FundShare, functionName: "treasury", ...at }),
    client.readContract({ ...T, functionName: "getMinDelay", ...at }),
    client.readContract({ ...FundGovernor, functionName: "votingDelay", ...at }),
    client.readContract({ ...FundGovernor, functionName: "votingPeriod", ...at }),
    client.readContract({ ...FundGovernor, functionName: "proposalThreshold", ...at }),
    client.getStorageAt({ address: ADDRESSES.FundTreasury, slot: IMPLEMENTATION_SLOT, ...at }),
  ]);

  const timelock = ADDRESSES.TimelockController;
  const is = (ok: boolean): Guarantee["status"] => (ok ? "ok" : "fail");
  const guarantees: Guarantee[] = [
    { key: "noAdmin", status: is(deployerRoles.every((held) => !held)), origin: ORIGIN.noAdmin },
    { key: "treasuryByVote", status: is(isAddressEqual(treasuryOwner, timelock)), origin: ORIGIN.treasuryByVote },
    { key: "registryByVote", status: is(isAddressEqual(registryOwner, timelock)), origin: ORIGIN.registryByVote },
    { key: "governorQueues", status: is(governorProposer && governorCanceller && isAddressEqual(governorTimelock, timelock)), origin: ORIGIN.governorQueues },
    { key: "anyoneExecutes", status: is(openExecutor), origin: ORIGIN.anyoneExecutes },
    { key: "votesFromShares", status: is(isAddressEqual(token, ADDRESSES.FundShare)) },
    { key: "fundsToTreasury", status: is(isAddressEqual(shareTreasury, ADDRESSES.FundTreasury)) },
    { key: "delay", status: minDelay === 0n ? "fail" : minDelay < SAFE_DELAY ? "warn" : "ok" },
  ];

  // The slot holds the address right-aligned in 32 bytes.
  const implementation = implementationSlot && BigInt(implementationSlot) !== 0n ? getAddress(`0x${implementationSlot.slice(-40)}`) : null;

  return { guarantees, params: { votingDelay, votingPeriod, proposalThreshold, minDelay }, treasuryImplementation: implementation };
}
