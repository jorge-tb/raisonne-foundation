// SPDX-License-Identifier: MIT
pragma solidity ^0.8.36;

import {Script} from "forge-std/Script.sol";
import {console} from "forge-std/console.sol";
import {IGovernor} from "@openzeppelin/contracts/governance/IGovernor.sol";
import {DeploymentRecord, Deployment} from "./libs/DeploymentRecord.sol";
import {ProposalRecord, Proposal} from "./libs/ProposalRecord.sol";
import {FundGovernor} from "@raisonne/FundGovernor.sol";

/**
 * @dev Executes a queued proposal once the timelock delay has elapsed. It's permissionless.
 * The targets, values, calldatas and description must match the original proposal exactly,
 * or the derived proposal id will not resolve.
 */
contract Execute is Script {
    function run() public {
        // Read deployment.
        Deployment memory d = DeploymentRecord.read(block.chainid);

        // Load environment variables.
        uint256 proposalId = vmSafe.envUint("PROPOSAL_ID");

        // Validate enviroment variables.
        require(proposalId != 0, "invalid proposal identifier");

        // Read proposal.
        Proposal memory p = ProposalRecord.read(block.chainid, proposalId);

        // Pre-validate on-chain state.
        require(d.governor.state(proposalId) == IGovernor.ProposalState.Queued, "invalid proposal state");

        vmSafe.startBroadcast();
        _executeProposal(d.governor, p);
        vmSafe.stopBroadcast();

        // Post-validate on-chain state.
        require(d.governor.state(proposalId) == IGovernor.ProposalState.Executed, "invalid proposal state");
    }

    function _executeProposal(FundGovernor governor, Proposal memory p) internal {
        governor.execute(p.targets, p.values, p.calldatas, keccak256(bytes(p.description)));
    }
}
