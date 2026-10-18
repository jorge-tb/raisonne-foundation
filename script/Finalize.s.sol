// SPDX-License-Identifier: MIT
pragma solidity ^0.8.36;

import {Script} from "forge-std/Script.sol";
import {console} from "forge-std/console.sol";
import {DeploymentRecord, Deployment} from "./libs/DeploymentRecord.sol";

/**
 * @dev Closes a completed founding round by forwarding the raised ETH from FundShare to
 * the treasury. It's permissionless. Reverts unless every stakeholder has subscribed.
 */
contract Finalize is Script {
    function run() public {
        // Read deployment.
        Deployment memory d = DeploymentRecord.read(block.chainid);

        // Pre-validate on-chain state.
        require(d.token.totalExpected() == d.token.totalReceived(), "not all stakeholders subscribed");
        require(address(d.token).balance == d.token.totalReceived(), "balance does not match total received");
        require(!d.token.isFinalized(), "foundation round is already finished");

        vmSafe.startBroadcast();
        // Finalize the foundation round.
        d.token.finalize();
        vmSafe.stopBroadcast();

        // Post-validate on-chain state.
        require(address(d.token).balance == 0, "token contract not moved all its funds");
        require(address(d.treasuryProxy).balance == d.token.totalExpected(), "treasury not obtained expected funds");
        require(d.token.isFinalized(), "foundation round was not marked as finished");
    }
}
