// SPDX-License-Identifier: MIT
pragma solidity ^0.8.36;

import {VmSafe} from "forge-std/Vm.sol";
import {CommonBase} from "forge-std/Base.sol";
import {TimelockController} from "@openzeppelin/contracts/governance/TimelockController.sol";
import {ERC1967Proxy} from "@openzeppelin/contracts/proxy/ERC1967/ERC1967Proxy.sol";
import {FundGovernor} from "@raisonne/FundGovernor.sol";
import {FundTreasury} from "@raisonne/FundTreasury.sol";
import {FundShare} from "@raisonne/FundShare.sol";
import {ArtRegistry} from "@raisonne/ArtRegistry.sol";
import {Deployment} from "./DeploymentRecord.sol";

library RaisonneDeployer {
    function deploy(
        uint256 minDelay,
        uint48 roundDeadlineOffset,
        address[] memory stakeholders,
        uint256[] memory contributions,
        uint48 votingDelay,
        uint32 votingPeriod,
        uint256 proposalThreshold,
        uint256 quorumNumerator
    ) internal returns (Deployment memory) {
        // Deploy TimelockController with temporal deployer as admin.
        address[] memory proposers = new address[](0);
        address[] memory executors = new address[](0);
        address admin = msg.sender;
        TimelockController timelock = new TimelockController(minDelay, proposers, executors, admin);

        // Deploy FundTreasury implementation.
        FundTreasury treasuryImpl = new FundTreasury();

        // Deploy FundTreasury proxy.
        ERC1967Proxy proxy =
            new ERC1967Proxy(address(treasuryImpl), abi.encodeCall(FundTreasury.initialize, (msg.sender)));
        FundTreasury treasuryProxy = FundTreasury(payable(address(proxy)));

        // Deploy FundShare.
        uint48 roundDeadline = uint48(block.timestamp) + roundDeadlineOffset;
        FundShare token = new FundShare(address(treasuryProxy), roundDeadline, stakeholders, contributions);

        // Deploy FundGovernor.
        FundGovernor governor =
            new FundGovernor(votingDelay, votingPeriod, proposalThreshold, quorumNumerator, timelock, token);

        // Deploy ArtRegistry.
        ArtRegistry registry = new ArtRegistry(address(timelock), address(treasuryProxy));

        // Initialize Treasury's registry.
        treasuryProxy.initializeRegistry(registry);

        // Transfer treasury ownership to TimelockController.
        treasuryProxy.transferOwnership(address(timelock));

        // Grant proposer and executor roles to FundGovernor.
        timelock.grantRole(timelock.PROPOSER_ROLE(), address(governor));
        timelock.grantRole(timelock.CANCELLER_ROLE(), address(governor));
        timelock.grantRole(timelock.EXECUTOR_ROLE(), address(0));

        // Renounce admin role.
        timelock.renounceRole(timelock.DEFAULT_ADMIN_ROLE(), msg.sender);

        return Deployment(timelock, governor, treasuryImpl, treasuryProxy, token, registry);
    }
}
