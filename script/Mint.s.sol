// SPDX-License-Identifier: MIT
pragma solidity ^0.8.36;

import {Script} from "forge-std/Script.sol";
import {console} from "forge-std/console.sol";
import {DeploymentRecord, Deployment} from "./libs/DeploymentRecord.sol";
import {SampleGallery, Artwork} from "../test/helpers/SampleGallery.sol";

/**
 * @dev Mints an approved artwork to the treasury by presenting a Merkle proof against an
 * enabled gallery root. It's permissionless.
 */
contract Mint is Script {
    function run() public {
        // Read deployment.
        Deployment memory d = DeploymentRecord.read(block.chainid);

        // Load environment variables.
        uint256 gallerySize = vmSafe.envUint("GALLERY_SIZE");
        uint256 artworkIndex = vmSafe.envUint("ARTWORK_INDEX");

        // Validate environment variables.
        require(gallerySize > 0, "gallery size must be greater than zero");
        require(artworkIndex < gallerySize, "invalid artwork index");

        // Re-create the sample gallery.
        Artwork[] memory artworks = SampleGallery.create(gallerySize);
        bytes32 root = SampleGallery.root(artworks);
        bytes32[] memory proof = SampleGallery.proof(artworks, artworkIndex);
        Artwork memory unminted = artworks[artworkIndex];

        // Pre-validate on-chain state.
        require(d.registry.isGalleryEnabled(root), "gallery root is disabled");

        vmSafe.startBroadcast();
        // Mint artwork.
        d.registry.mintArtwork(proof, root, unminted.tokenId, unminted.cId);
        vmSafe.stopBroadcast();

        string memory tokenURI = d.registry.tokenURI(unminted.tokenId);
        address owner = d.registry.ownerOf(unminted.tokenId);

        // Logs
        console.log("minted token URL: %s", tokenURI);
        console.log("minted token owner: %s", owner);

        // Post-validate on-chain state.
        require(keccak256(bytes(tokenURI)) == keccak256(bytes(string.concat("ipfs://", unminted.cId))), "invalid token URI");
        require(owner == address(d.treasuryProxy), "treasury must be the owner of the artwork NFT");
    }
}
