// SPDX-License-Identifier: MIT
pragma solidity 0.8.36;

import {Test} from "forge-std/Test.sol";
import {ArtRegistry} from "../src/ArtRegistry.sol";
import {Merkle} from "murky/Merkle.sol";
import {IERC721Errors} from "@openzeppelin/contracts/interfaces/draft-IERC6093.sol";
import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";

contract ArtRegistryTest is Test {
    ArtRegistry artRegistry;
    address timelockController;
    address fundTreasuryProxy;

    struct Artwork {
        uint256 tokenId;
        string cid;
    }

    function setUp() public {
        timelockController = address(1);
        fundTreasuryProxy = address(2);
        artRegistry = new ArtRegistry(timelockController, fundTreasuryProxy);
    }

    function test_Constructor_SetsTimelockAsOwner() public view {
        vm.assertEq(artRegistry.owner(), timelockController);
    }

    function test_RevertWhen_InvalidFundTreasuryProxy() public {
        address invalidFundTreasuryProxy = address(0);
        vm.expectRevert(abi.encodeWithSelector(ArtRegistry.InvalidFundTreasuryProxy.selector, address(0)));
        artRegistry = new ArtRegistry(
            timelockController,
            invalidFundTreasuryProxy
        );
    }

    function testFuzz_AddGallery_FromTimelock(bytes32 galleryRoot) public {
        vm.assume(galleryRoot != bytes32(0));
        vm.expectEmit(true, true, true, true);
        emit ArtRegistry.GalleryAdded(galleryRoot);

        vm.prank(timelockController);
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
        vm.prank(timelockController);
        artRegistry.addGallery(bytes32(0));
    }

    function test_RevertWhen_AddGalleryThatIsAlreadyAdded() public {
        bytes32 galleryRoot = keccak256("gallery-001");
        vm.prank(timelockController);
        artRegistry.addGallery(galleryRoot);
        
        vm.expectRevert(abi.encodeWithSelector(ArtRegistry.GalleryAlreadyAdded.selector, galleryRoot));
        vm.prank(timelockController);
        artRegistry.addGallery(galleryRoot);
    }

    function test_RevokeGallery_FromTimelock() public {
        bytes32 galleryRoot = keccak256("gallery-001");
        vm.prank(timelockController);
        artRegistry.addGallery(galleryRoot);

        vm.expectEmit(true, true, true, true);
        emit ArtRegistry.GalleryRevoked(galleryRoot);
        vm.prank(timelockController);
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
        vm.prank(timelockController);
        artRegistry.revokeGallery(galleryRoot);
    }

    function test_MintArtwork_ValidProof() public {
        // Construct merkle tree
        Merkle merkle = new Merkle();
        Artwork[5] memory artworks = [Artwork(1, "CID-001"), Artwork(2, "CID-002"), Artwork(3, "CID-003"), Artwork(4, "CID-004"), Artwork(5, "CID-005")];
        bytes32[] memory data = _hashArtworks(artworks);
        // Compute gallery root
        bytes32 root = merkle.getRoot(data);
        // Add gallery root
        vm.prank(timelockController);
        artRegistry.addGallery(root);
        // Mint artwork - obtain merkle proof
        bytes32[] memory proof = merkle.getProof(data, 0);
        // Mint artwork - configure expected event
        vm.expectEmit(true, true, true, true);
        emit ArtRegistry.ArtworkMinted(root, artworks[0].tokenId, artworks[0].cid);
        // Mint artwork - call (it's an open function)
        artRegistry.mintArtwork(proof, root, artworks[0].tokenId, artworks[0].cid);
        // Obtain tokenURI
        string memory artwork1URI = artRegistry.tokenURI(artworks[0].tokenId);
        vm.assertEq(artwork1URI, "ipfs://CID-001");
        // Ensure it belongs to fund treasury
        address owner = artRegistry.ownerOf(artworks[0].tokenId);
        vm.assertEq(owner, fundTreasuryProxy);
    }

    function test_RevertWhen_MintArtworkMetadataTampered() public {
        Merkle merkle = new Merkle();
        Artwork[5] memory artworks = [Artwork(1, "CID-001"), Artwork(2, "CID-002"), Artwork(3, "CID-003"), Artwork(4, "CID-004"), Artwork(5, "CID-005")];
        bytes32[] memory data = _hashArtworks(artworks);
        bytes32 root = merkle.getRoot(data);

        Artwork memory invalid = Artwork(1, "CID-TAMPERED");
        bytes32 invalidLeaf = _hashArtwork(invalid);

        vm.prank(timelockController);
        artRegistry.addGallery(root);

        bytes32[] memory proof = merkle.getProof(data, 0);
        vm.expectRevert(abi.encodeWithSelector(ArtRegistry.InvalidMerkleProof.selector, invalidLeaf));
        artRegistry.mintArtwork(proof, root, invalid.tokenId, invalid.cid);
    }

    function test_RevertWhen_MintArtworkAndTokenAlreadyMinted() public {
        Merkle merkle = new Merkle();
        Artwork[5] memory artworks = [Artwork(1, "CID-001"), Artwork(2, "CID-002"), Artwork(3, "CID-003"), Artwork(4, "CID-004"), Artwork(5, "CID-005")];
        bytes32[] memory data = _hashArtworks(artworks);
        bytes32 root = merkle.getRoot(data);

        vm.prank(timelockController);
        artRegistry.addGallery(root);

        bytes32[] memory proof = merkle.getProof(data, 0);
        artRegistry.mintArtwork(proof, root, artworks[0].tokenId, artworks[0].cid);

        vm.expectRevert(abi.encodeWithSelector(IERC721Errors.ERC721InvalidSender.selector, address(0)));
        artRegistry.mintArtwork(proof, root, artworks[0].tokenId, artworks[0].cid);
    }

    function test_RevertWhen_MintArtworkBelongingToDisabledGallery() public {
        Merkle merkle = new Merkle();
        Artwork[5] memory artworks = [Artwork(1, "CID-001"), Artwork(2, "CID-002"), Artwork(3, "CID-003"), Artwork(4, "CID-004"), Artwork(5, "CID-005")];
        bytes32[] memory data = _hashArtworks(artworks);
        bytes32 root = merkle.getRoot(data);

        bytes32[] memory proof = merkle.getProof(data, 0);
        vm.expectRevert(abi.encodeWithSelector(ArtRegistry.InvalidGallery.selector, root));
        artRegistry.mintArtwork(proof, root, artworks[0].tokenId, artworks[0].cid);
    }

    function _hashArtworks(Artwork[5] memory artworks) private pure returns (bytes32[] memory data) {
        data = new bytes32[](artworks.length);
        for (uint256 i = 0; i < artworks.length;) {
            data[i] = _hashArtwork(artworks[i]);
            unchecked { ++i; }
        }
        return data;
    }

    function _hashArtwork(Artwork memory artwork) private pure returns (bytes32) {
        return keccak256(bytes.concat(keccak256(abi.encode(artwork.tokenId, artwork.cid))));
    }
}