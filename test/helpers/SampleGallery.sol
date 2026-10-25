// SPDX-License-Identifier: MIT
pragma solidity ^0.8.36;

import {VmSafe} from "forge-std/Vm.sol";
import {Merkle} from "murky/Merkle.sol";

/**
 * @dev Artwork struct requires its properties to be defined in alphabetical order to avoid misaligned
 * assignment when decoding it from JSON file.
 */
struct Artwork {
    string cId;
    uint256 tokenId;
}

library SampleGallery {
    address internal constant VM_ADDRESS = address(uint160(uint256(keccak256("hevm cheat code"))));
    VmSafe internal constant vmSafe = VmSafe(VM_ADDRESS);

    function load(string memory path) internal view returns (Artwork[] memory artworks) {
        string memory json = vmSafe.readFile(path);
        artworks = abi.decode(vmSafe.parseJson(json), (Artwork[]));
    }

    function create(uint256 n) internal pure returns (Artwork[] memory artworks) {
        artworks = new Artwork[](n);
        for (uint256 i = 0; i < n; i++) {
            artworks[i] = Artwork(string.concat("CID-", vmSafe.toString(i + 1)), i + 1);
        }
    }

    function root(Artwork[] memory artworks) internal returns (bytes32 root) {
        Merkle m = new Merkle();
        root = m.getRoot(_hashArtworks(artworks));
    }

    function proof(Artwork[] memory artworks, uint256 index) internal returns (bytes32[] memory proof) {
        Merkle m = new Merkle();
        proof = m.getProof(_hashArtworks(artworks), index);
    }

    function _hashArtworks(Artwork[] memory artworks) private pure returns (bytes32[] memory data) {
        data = new bytes32[](artworks.length);
        for (uint256 i = 0; i < artworks.length; i++) {
            data[i] = _hashArtwork(artworks[i]);
        }
    }

    function _hashArtwork(Artwork memory artwork) private pure returns (bytes32) {
        return keccak256(bytes.concat(keccak256(abi.encode(artwork.tokenId, artwork.cId))));
    }
}
