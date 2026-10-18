// SPDX-License-Identifier: MIT
pragma solidity ^0.8.36;

import {Script} from "forge-std/Script.sol";
import {console} from "forge-std/console.sol";
import {GovernorCountingSimple} from "@openzeppelin/contracts/governance/extensions/GovernorCountingSimple.sol";
import {IGovernor} from "@openzeppelin/contracts/governance/IGovernor.sol";
import {DeploymentRecord, Deployment} from "./libs/DeploymentRecord.sol";

/**
 * @dev Casts a vote on an active proposal with the caller's delegated voting power. Support is 0
 * Against, 1 For, 2 Abstain. Voting power is read at the proposal's snapshot, so tokens acquired
 * afterwards do not count.
 */
contract Vote is Script {
    function run() public {
        // Read deployment.
        Deployment memory d = DeploymentRecord.read(block.chainid);

        // Load environment variables.
        uint256 proposalId = vmSafe.envUint("PROPOSAL_ID");

        // Validate environment variables.
        require(proposalId != 0, "invalid proposal identifier");

        // Pre-validate on-chain state.
        require(d.governor.state(proposalId) == IGovernor.ProposalState.Active, "invalid proposal state");
        require(d.token.getVotes(msg.sender) > 0, "caller has not voting power");

        vmSafe.startBroadcast();
        // Vote in favour of the proposal.
        d.governor.castVote(proposalId, uint8(GovernorCountingSimple.VoteType.For));
        vmSafe.stopBroadcast();

        // TODO: include post-validate on-chain state
    }
}
