// SPDX-License-Identifier: MIT
pragma solidity 0.8.36;

import {ERC721URIStorage, ERC721} from "@openzeppelin/contracts/token/ERC721/extensions/ERC721URIStorage.sol";
import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";
import {MerkleProof} from "@openzeppelin/contracts/utils/cryptography/MerkleProof.sol";
import {FundTreasury} from "./FundTreasury.sol";

contract ArtRegistry is ERC721URIStorage, Ownable {

    error ZeroRoot();
    error GalleryAlreadyAdded(bytes32 root);
    error InvalidGallery(bytes32 root);
    error InvalidMerkleProof(bytes32 leaf);
    error InvalidFundTreasuryProxy(address fundTreasuryProxy);

    event GalleryAdded(bytes32 indexed root);
    event GalleryRevoked(bytes32 indexed root);
    event ArtworkMinted(bytes32 indexed galleryRoot, uint256 indexed tokenId, string indexed cid);

    address private immutable _fundTreasuryProxy;
    mapping(bytes32 galleryRoot => bool) private _galleryRoots;

    constructor(address timelockController, address fundTreasuryProxy) 
        ERC721("ArtRegistry", "ART")
        Ownable(timelockController) {
            require(fundTreasuryProxy != address(0), InvalidFundTreasuryProxy(fundTreasuryProxy));
            _fundTreasuryProxy = fundTreasuryProxy;
        }

    function addGallery(bytes32 root) external onlyOwner {
        require(root != bytes32(0), ZeroRoot());
        require(!_galleryRoots[root], GalleryAlreadyAdded(root));
        _galleryRoots[root] = true;
        emit GalleryAdded(root);
    }

    function revokeGallery(bytes32 root) external onlyOwner onlyEnabledGallery(root) {
        _galleryRoots[root] = false;
        emit GalleryRevoked(root);
    }

    function isGalleryEnabled(bytes32 root) external view returns (bool) {
        return _galleryRoots[root];
    }

    function mintArtwork(bytes32[] calldata proof, bytes32 root, uint256 tokenId, string calldata cid) external 
    onlyEnabledGallery(root) {
        bytes memory encoded = abi.encode(tokenId, cid);
        bytes32 leaf = keccak256(bytes.concat(keccak256(encoded)));
        require(MerkleProof.verifyCalldata(proof, root, leaf), InvalidMerkleProof(leaf));

        // Note: _mint over _safeMint provided receiver is a known address, avoid external unnecessary call
        _mint(_fundTreasuryProxy, tokenId);
        _setTokenURI(tokenId, cid);

        emit ArtworkMinted(root, tokenId, cid);
    }

    function _baseURI() internal pure override returns (string memory) {
        return "ipfs://";
    }

    modifier onlyEnabledGallery(bytes32 root) {
        require(_galleryRoots[root], InvalidGallery(root));
        _;
    }
}

