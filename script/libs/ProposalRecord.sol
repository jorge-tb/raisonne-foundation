// SPDX-License-Identifier: MIT
pragma solidity ^0.8.36;

import {VmSafe} from "forge-std/Vm.sol";

struct Proposal {
    address[] targets;
    uint256[] values;
    bytes[] calldatas;
    string description;
}

library ProposalRecord {
    address internal constant VM_ADDRESS = address(uint160(uint256(keccak256("hevm cheat code"))));
    VmSafe internal constant vmSafe = VmSafe(VM_ADDRESS);

    function write(
        uint256 chainId,
        uint256 proposalId,
        address[] memory targets,
        uint256[] memory values,
        bytes[] memory calldatas,
        string memory description
    ) internal {
        string memory jsonKey = "proposal";

        vmSafe.serializeAddress(jsonKey, "targets", targets);
        vmSafe.serializeUint(jsonKey, "values", values);
        vmSafe.serializeBytes(jsonKey, "calldatas", calldatas);
        string memory json = vmSafe.serializeString(jsonKey, "description", description);

        vmSafe.writeJson(json, _proposalPath(chainId, proposalId));
    }

    function read(uint256 chainId, uint256 proposalId) internal view returns (Proposal memory p) {
        string memory json = vmSafe.readFile(_proposalPath(chainId, proposalId));
        p.targets = vmSafe.parseJsonAddressArray(json, ".targets");
        p.values = vmSafe.parseJsonUintArray(json, ".values");
        p.calldatas = vmSafe.parseJsonBytesArray(json, ".calldatas");
        p.description = vmSafe.parseJsonString(json, ".description");
    }

    function _proposalPath(uint256 chainId, uint256 proposalId) private pure returns (string memory path) {
        path = string.concat("./proposals/", vmSafe.toString(chainId), "/", vmSafe.toString(proposalId), ".json");
    }
}
