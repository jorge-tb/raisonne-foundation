// SPDX-License-Identifier: MIT
pragma solidity ^0.8.36;

import {Script} from "forge-std/Script.sol";
import {console} from "forge-std/console.sol";
import {IGovernor} from "@openzeppelin/contracts/governance/IGovernor.sol";
import {DeploymentRecord, Deployment} from "./libs/DeploymentRecord.sol";
import {ProposalRecord, Proposal} from "./libs/ProposalRecord.sol";
import {FundGovernor} from "@raisonne/FundGovernor.sol";

/**
 * @dev Schedules a succeeded proposal on the timelock, starting the execution delay.
 * Permissionless on the governor, which holds the proposer role on the timelock.
 * Reverts unless the proposal has reached the Succeeded state.
 */
contract Queue is Script {
    function run() public {
        // Read deployment.
        Deployment memory d = DeploymentRecord.read(block.chainid);

        // Load environment variables.
        uint256 proposalId = vmSafe.envUint("PROPOSAL_ID");

        // Validate environment variables.
        require(proposalId != 0, "invalid proposal identifier");

        // Read proposal.
        Proposal memory p = ProposalRecord.read(block.chainid, proposalId);

        // Pre-validate on-chain state.
        require(d.governor.state(proposalId) == IGovernor.ProposalState.Succeeded, "invalid proposal state");

        vmSafe.startBroadcast();
        // Queue proposal.
        _queueProposal(d.governor, p);
        vmSafe.stopBroadcast();

        // Post-validate on-chain state.
        require(uint8(d.governor.state(proposalId)) == uint8(IGovernor.ProposalState.Queued));
    }

    function _queueProposal(FundGovernor governor, Proposal memory p) internal {
        governor.queue(p.targets, p.values, p.calldatas, keccak256(bytes(p.description)));
    }
}
