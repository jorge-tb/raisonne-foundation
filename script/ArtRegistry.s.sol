// SPDX-License-Identifier: UNLICENSED
pragma solidity ^0.8.13;

import {Script} from "forge-std/Script.sol";
import {ArtRegistry} from "../src/ArtRegistry.sol";

contract CounterScript is Script {
    ArtRegistry public artRegistry;

    function setUp() public {}

    function run() public {
        vm.startBroadcast();

        address timelockController = address(1);
        address fundTreasuryProxy = address(2);
        artRegistry = new ArtRegistry(timelockController, fundTreasuryProxy);

        vm.stopBroadcast();
    }
}
