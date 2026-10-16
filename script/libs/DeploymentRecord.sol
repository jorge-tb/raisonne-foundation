// SPDX-License-Identifier: MIT
pragma solidity ^0.8.36;

import {VmSafe} from "forge-std/Vm.sol";
import {TimelockController} from "@openzeppelin/contracts/governance/TimelockController.sol";
import {ArtRegistry} from "@raisonne/ArtRegistry.sol";
import {FundGovernor} from "@raisonne/FundGovernor.sol";
import {FundShare} from "@raisonne/FundShare.sol";
import {FundTreasury} from "@raisonne/FundTreasury.sol";

struct Deployment {
    TimelockController timelock;
    FundGovernor governor;
    FundTreasury treasuryImpl;
    FundTreasury treasuryProxy;
    FundShare token;
    ArtRegistry registry;
}

library DeploymentRecord {
    address internal constant VM_ADDRESS = address(uint160(uint256(keccak256("hevm cheat code"))));
    VmSafe internal constant vmSafe = VmSafe(VM_ADDRESS);

    function write(Deployment memory d) internal {
        string memory jsonKey = "deployments";

        vmSafe.serializeAddress(jsonKey, "timelock", address(d.timelock));
        vmSafe.serializeAddress(jsonKey, "governor", address(d.governor));
        vmSafe.serializeAddress(jsonKey, "treasuryImpl", address(d.treasuryImpl));
        vmSafe.serializeAddress(jsonKey, "treasuryProxy", address(d.treasuryProxy));
        vmSafe.serializeAddress(jsonKey, "token", address(d.token));
        string memory json = vmSafe.serializeAddress(jsonKey, "registry", address(d.registry));

        vmSafe.writeJson(json, _deploymentPath(block.chainid));
    }

    function read(uint256 chainId) internal view returns (Deployment memory d) {
        string memory json = vmSafe.readFile(_deploymentPath(chainId));
        d.timelock = TimelockController(payable(vmSafe.parseJsonAddress(json, ".timelock")));
        d.governor = FundGovernor(payable(vmSafe.parseJsonAddress(json, ".governor")));
        d.treasuryImpl = FundTreasury(payable(vmSafe.parseJsonAddress(json, ".treasuryImpl")));
        d.treasuryProxy = FundTreasury(payable(vmSafe.parseJsonAddress(json, ".treasuryProxy")));
        d.token = FundShare(vmSafe.parseJsonAddress(json, ".token"));
        d.registry = ArtRegistry(vmSafe.parseJsonAddress(json, ".registry"));
    }

    function _deploymentPath(uint256 chainId) private pure returns (string memory path) {
        path = string.concat("./deployments/", vmSafe.toString(chainId), ".json");
    }
}
