// SPDX-License-Identifier: MIT
pragma solidity ^0.8.36;

import {Script} from "forge-std/Script.sol";
import {console} from "forge-std/console.sol";
import {TimelockController} from "@openzeppelin/contracts/governance/TimelockController.sol";
import {ERC1967Proxy} from "@openzeppelin/contracts/proxy/ERC1967/ERC1967Proxy.sol";
import {ArtRegistry} from "@raisonne/ArtRegistry.sol";
import {FundGovernor} from "@raisonne/FundGovernor.sol";
import {FundShare} from "@raisonne/FundShare.sol";
import {FundTreasury} from "@raisonne/FundTreasury.sol";
import {RaisonneDeployer} from "./libs/RaisonneDeployer.sol";
import {DeploymentRecord, Deployment} from "./libs/DeploymentRecord.sol";

contract Deploy is Script {
    function run() public {
        // Load environment variables.
        uint256 minDelay = vmSafe.envUint("MIN_DELAY");
        uint48 roundDeadlineOffset = uint48(vmSafe.envUint("ROUND_DEADLINE_OFFSET"));
        address[] memory stakeholders = vmSafe.envAddress("STAKEHOLDERS", ",");
        uint256[] memory contributionsWei = vmSafe.envUint("CONTRIBUTIONS_WEI", ",");
        uint48 votingDelay = uint48(vmSafe.envUint("VOTING_DELAY"));
        uint32 votingPeriod = uint32(vmSafe.envUint("VOTING_PERIOD"));
        uint256 proposalThreshold = vmSafe.envUint("PROPOSAL_THRESHOLD");
        uint256 quorumNumerator = vmSafe.envUint("QUORUM_NUMERATOR");

        // Validate environment variables.
        require(minDelay >= 1 days);
        require(roundDeadlineOffset >= 1 days);
        require(stakeholders.length == contributionsWei.length);
        require(votingDelay >= 1 days);
        require(votingPeriod >= 1 days);
        require(quorumNumerator >= 0 && quorumNumerator <= 100);

        vmSafe.startBroadcast();

        Deployment memory d = RaisonneDeployer.deploy(
            minDelay,
            roundDeadlineOffset,
            stakeholders,
            contributionsWei,
            votingDelay,
            votingPeriod,
            proposalThreshold,
            quorumNumerator
        );

        vmSafe.stopBroadcast();

        // Logs
        console.log("timelock addr: %s", address(d.timelock));
        console.log("treasury impl addr: %s", address(d.treasuryImpl));
        console.log("treasury proxy addr: %s", address(d.treasuryProxy));
        console.log("token addr: %s", address(d.token));
        console.log("governor addr: %s", address(d.governor));
        console.log("registry addr: %s", address(d.registry));

        // Post-validate on-chain state.
        require(!d.timelock.hasRole(d.timelock.DEFAULT_ADMIN_ROLE(), msg.sender), "deployer still admin");
        require(d.timelock.hasRole(d.timelock.PROPOSER_ROLE(), address(d.governor)), "governor hasn't proposer role");
        require(d.timelock.hasRole(d.timelock.CANCELLER_ROLE(), address(d.governor)), "governor hasn't canceller role");
        require(d.timelock.hasRole(d.timelock.EXECUTOR_ROLE(), address(0)), "someone has executor role");
        require(d.treasuryProxy.owner() == address(d.timelock), "treasury owner isn't the timelock");
        require(address(d.treasuryProxy.registry()) == address(d.registry), "treasury's registry is invalid");

        // Serialize deployment struct as JSON and write it.
        DeploymentRecord.write(d);
    }
}
