// SPDX-License-Identifier: MIT
pragma solidity ^0.8.36;

import {Script} from "forge-std/Script.sol";
import {console} from "forge-std/console.sol";
import {DeploymentRecord, Deployment} from "./libs/DeploymentRecord.sol";

/**
 * @dev The caller subscribes to the founding round with their agreed contribution and
 * delegates their voting power to themselves. The caller's wallet must hold enough ETH
 * to cover the contribution.
 */
contract Subscribe is Script {
    function run() public {
        // Read deployment.
        Deployment memory d = DeploymentRecord.read(block.chainid);

        // Load environment variables.
        uint256 contribution = vm.envUint("CONTRIBUTION");

        // Validate environment variables.
        require(contribution > 0, "contribution should be greater than zero");

        // Pre-process environment variables.
        contribution *= 1 ether;

        // Pre-validate on-chain state.
        require(msg.sender.balance >= contribution, "caller has not enough balance");

        vmSafe.startBroadcast();
        // Subscribe and delegate to itself.
        d.token.subscribe{value: contribution}();
        d.token.delegate(msg.sender);
        vmSafe.stopBroadcast();

        // Post-validate on-chain state.
        require(d.token.hasSubscribed(msg.sender), "user is not subscribed");
        require(d.token.getVotes(msg.sender) == contribution, "user has invalid voting power");
    }
}
