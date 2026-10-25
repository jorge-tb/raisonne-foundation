// SPDX-License-Identifier: MIT
pragma solidity ^0.8.36;

import {Test} from "forge-std/Test.sol";
import {SampleGallery, Artwork} from "../helpers/SampleGallery.sol";

contract SampleGalleryTest is Test {
    
    function test_Load_DecodesToStruct() public view {
        Artwork[] memory artworks = SampleGallery.load("./test/fixtures/test-gallery.json");
        for (uint256 i = 0; i < artworks.length; i++) {
            assertEq(artworks[i].tokenId, i + 1);
            assertEq(artworks[i].cId, string.concat("CID-00", vm.toString(i + 1)));
        }
    }
}