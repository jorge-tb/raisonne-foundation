// SPDX-License-Identifier: MIT
pragma solidity ^0.8.36;

import {Script} from "forge-std/Script.sol";
import {console} from "forge-std/console.sol";
import {IGovernor} from "@openzeppelin/contracts/governance/IGovernor.sol";
import {Merkle} from "murky/Merkle.sol";
import {DeploymentRecord, Deployment} from "./libs/DeploymentRecord.sol";
import {ProposalRecord, Proposal} from "./libs/ProposalRecord.sol";
import {SampleGallery, Artwork} from "../test/helpers/SampleGallery.sol";
import {ArtRegistry} from "@raisonne/ArtRegistry.sol";

/**
 * @dev Submits an acquisition proposal to the governor, approving a gallery root on the registry.
 * The caller must hold at least the proposal threshold in voting power. Logs the proposal id,
 * which later steps need.
 */
contract ProposeGallery is Script {
    function run() public {
        // Read deployment.
        Deployment memory d = DeploymentRecord.read(block.chainid);

        // Load environment variables.
        string memory filename = vmSafe.envString("GALLERY_FILENAME");
        string memory description = vmSafe.envString("GALLERY_DESCRIPTION");

        // Load gallery
        Artwork[] memory artworks = SampleGallery.load(string.concat(_galleryPath(filename)));
        bytes32 galleryRoot = SampleGallery.root(artworks);

        vmSafe.startBroadcast();
        // Create the proposal.
        uint256 proposalId = _createProposal(d, galleryRoot, description);
        vmSafe.stopBroadcast();

        IGovernor.ProposalState state = d.governor.state(proposalId);

        // Logs
        /// @dev PROPOSAL_ID stdout message is consumed by demo.sh.
        console.log("PROPOSAL_ID=%s", vmSafe.toString(proposalId));
        console.log("proposal state: %s", vmSafe.toString(uint8(state)));

        // Post-validate on-chain state.
        require(state == IGovernor.ProposalState.Pending, "invalid proposal state");
    }

    function _createProposal(Deployment memory d, bytes32 galleryRoot, string memory description)
        private
        returns (uint256 proposalId)
    {
        address[] memory targets = new address[](1);
        uint256[] memory values = new uint256[](1);
        bytes[] memory calldatas = new bytes[](1);

        targets[0] = address(d.registry);
        calldatas[0] = abi.encodeCall(ArtRegistry.addGallery, (galleryRoot));

        proposalId = d.governor.propose(targets, values, calldatas, description);

        ProposalRecord.write(block.chainid, proposalId, targets, values, calldatas, description);
    }

    function _galleryPath(string memory filename) private pure returns (string memory path) {
        path = string.concat("./galleries/", filename, ".json");
    }
}
