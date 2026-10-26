// SPDX-License-Identifier: MIT
pragma solidity ^0.8.36;

import {Test} from "forge-std/Test.sol";
import {IERC721Errors} from "@openzeppelin/contracts/interfaces/draft-IERC6093.sol";
import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";
import {SampleGallery, Artwork} from "../helpers/SampleGallery.sol";
import {ArtRegistry} from "../../src/ArtRegistry.sol";

contract ArtRegistryTest is Test {
    ArtRegistry artRegistry;
    address timelock;
    address treasury;

    function setUp() public {
        timelock = makeAddr("timelock");
        treasury = makeAddr("treasury");
        artRegistry = new ArtRegistry(timelock, treasury);
    }

    function test_Constructor_SetsTimelockAsOwner() public view {
        vm.assertEq(artRegistry.owner(), timelock);
    }

    function test_RevertWhen_InvalidFundTreasury() public {
        address invalidTreasury = address(0);
        vm.expectRevert(abi.encodeWithSelector(ArtRegistry.InvalidFundTreasury.selector, address(0)));
        artRegistry = new ArtRegistry(timelock, invalidTreasury);
    }

    function testFuzz_AddGallery_FromTimelock(bytes32 galleryRoot) public {
        vm.assume(galleryRoot != bytes32(0));
        vm.expectEmit(true, true, true, true);
        emit ArtRegistry.GalleryAdded(galleryRoot);

        vm.prank(timelock);
        artRegistry.addGallery(galleryRoot);

        vm.assertTrue(artRegistry.isGalleryEnabled(galleryRoot));
    }

    function test_RevertWhen_AddGalleryFromNotTimelock() public {
        bytes32 galleryRoot = keccak256("gallery-001");
        vm.expectRevert(abi.encodeWithSelector(Ownable.OwnableUnauthorizedAccount.selector, address(this)));
        artRegistry.addGallery(galleryRoot);
    }

    function test_RevertWhen_AddGalleryZeroRoot() public {
        vm.expectRevert(ArtRegistry.ZeroRoot.selector);
        vm.prank(timelock);
        artRegistry.addGallery(bytes32(0));
    }

    function test_RevertWhen_AddGalleryThatIsAlreadyAdded() public {
        bytes32 galleryRoot = keccak256("gallery-001");
        vm.prank(timelock);
        artRegistry.addGallery(galleryRoot);

        vm.expectRevert(abi.encodeWithSelector(ArtRegistry.GalleryAlreadyAdded.selector, galleryRoot));
        vm.prank(timelock);
        artRegistry.addGallery(galleryRoot);
    }

    function test_RevokeGallery_FromTimelock() public {
        bytes32 galleryRoot = keccak256("gallery-001");
        vm.prank(timelock);
        artRegistry.addGallery(galleryRoot);

        vm.expectEmit(true, true, true, true);
        emit ArtRegistry.GalleryRevoked(galleryRoot);
        vm.prank(timelock);
        artRegistry.revokeGallery(galleryRoot);

        vm.assertTrue(!artRegistry.isGalleryEnabled(galleryRoot));
    }

    function test_RevertWhen_FromNotTimelock() public {
        bytes32 galleryRoot = keccak256("gallery-001");
        vm.expectRevert(abi.encodeWithSelector(Ownable.OwnableUnauthorizedAccount.selector, address(this)));
        artRegistry.revokeGallery(galleryRoot);
    }

    function test_RevertWhen_GalleryIsDisabled() public {
        bytes32 galleryRoot = keccak256("gallery-001");
        vm.expectRevert(abi.encodeWithSelector(ArtRegistry.InvalidGallery.selector, galleryRoot));
        vm.prank(timelock);
        artRegistry.revokeGallery(galleryRoot);
    }

    function test_MintArtwork_ValidProof() public {
        // Construct merkle tree
        Artwork[] memory artworks = SampleGallery.create(5);
        // Compute gallery root
        bytes32 root = SampleGallery.root(artworks);
        // Add gallery root
        vm.prank(timelock);
        artRegistry.addGallery(root);
        // Mint artwork - obtain merkle proof
        bytes32[] memory proof = SampleGallery.proof(artworks, 0);
        // Mint artwork - configure expected event
        vm.expectEmit(true, true, true, true);
        emit ArtRegistry.ArtworkMinted(root, artworks[0].tokenId, artworks[0].cId);
        // Mint artwork - call (it's an open function)
        artRegistry.mintArtwork(proof, root, artworks[0].tokenId, artworks[0].cId);
        // Obtain tokenURI
        string memory artwork1URI = artRegistry.tokenURI(artworks[0].tokenId);
        vm.assertEq(artwork1URI, "ipfs://CID-1");
        // Ensure it belongs to fund treasury
        address owner = artRegistry.ownerOf(artworks[0].tokenId);
        vm.assertEq(owner, treasury);
    }

    function test_RevertWhen_MintArtworkMetadataTampered() public {
        Artwork[] memory artworks = SampleGallery.create(5);
        bytes32 root = SampleGallery.root(artworks);

        Artwork memory invalid = Artwork("CID-TAMPERED", 1);
        bytes32 invalidLeaf = _hashArtwork(invalid);

        vm.prank(timelock);
        artRegistry.addGallery(root);

        bytes32[] memory proof = SampleGallery.proof(artworks, 0);
        vm.expectRevert(abi.encodeWithSelector(ArtRegistry.InvalidMerkleProof.selector, invalidLeaf));
        artRegistry.mintArtwork(proof, root, invalid.tokenId, invalid.cId);
    }

    function test_RevertWhen_MintArtworkAndTokenAlreadyMinted() public {
        Artwork[] memory artworks = SampleGallery.create(5);
        bytes32 root = SampleGallery.root(artworks);

        vm.prank(timelock);
        artRegistry.addGallery(root);

        bytes32[] memory proof = SampleGallery.proof(artworks, 0);
        artRegistry.mintArtwork(proof, root, artworks[0].tokenId, artworks[0].cId);

        vm.expectRevert(abi.encodeWithSelector(IERC721Errors.ERC721InvalidSender.selector, address(0)));
        artRegistry.mintArtwork(proof, root, artworks[0].tokenId, artworks[0].cId);
    }

    function test_RevertWhen_MintArtworkBelongingToDisabledGallery() public {
        Artwork[] memory artworks = SampleGallery.create(5);
        bytes32 root = SampleGallery.root(artworks);
        bytes32[] memory proof = SampleGallery.proof(artworks, 0);

        vm.expectRevert(abi.encodeWithSelector(ArtRegistry.InvalidGallery.selector, root));
        artRegistry.mintArtwork(proof, root, artworks[0].tokenId, artworks[0].cId);
    }

    function _hashArtworks(Artwork[5] memory artworks) private pure returns (bytes32[] memory data) {
        data = new bytes32[](artworks.length);
        for (uint256 i = 0; i < artworks.length;) {
            data[i] = _hashArtwork(artworks[i]);
            unchecked {
                ++i;
            }
        }
        return data;
    }

    function _hashArtwork(Artwork memory artwork) private pure returns (bytes32) {
        return keccak256(bytes.concat(keccak256(abi.encode(artwork.tokenId, artwork.cId))));
    }
}
