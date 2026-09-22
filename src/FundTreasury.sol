// SPDX-License-Identifier: MIT
pragma solidity ^0.8.36;

import {OwnableUpgradeable} from "@openzeppelin/contracts-upgradeable/access/OwnableUpgradeable.sol";
import {Initializable} from "@openzeppelin/contracts-upgradeable/proxy/utils/Initializable.sol";
import {UUPSUpgradeable} from "@openzeppelin/contracts-upgradeable/proxy/utils/UUPSUpgradeable.sol";
import {IERC721Receiver} from "@openzeppelin/contracts/interfaces/IERC721Receiver.sol";
import {ArtRegistry} from "./ArtRegistry.sol";

/**
 * @dev Complete initialization is two-steps to not let unsafe unintialized proxy state
 * that will lead circular dependency in case of combining  ArtRegistry(timelock, treasury)
 * and FundTreasury.intialize(owner, registry) deployments.
 *
 * For this reason, FundTreasury's initialization requires:
 * 1) Call initialize(owner).
 * 2) Call initializeRegistry(registry).
 */
contract FundTreasury is Initializable, OwnableUpgradeable, UUPSUpgradeable, IERC721Receiver {
    event Sold(address indexed to, uint256 artworkId);
    event Paid(address indexed to, uint256 amount, string reason);

    error InvalidOwner();
    error InvalidArtRegistry();
    error InsufficientBalance(uint256 requested, uint256 available);
    error InvalidReceiver();
    error PayTransferFailed();

    /**
     * @dev Storage of the foundation treasury contract.
     *
     * It's implemented on a custom ERC-7201 namespace to reduce the risk of storage collision
     * in case of future FundTreasury new versions.
     *
     * @custom:storage-location erc7201:raisonne.storage.FundTreasury
     */
    struct FundTreasuryStorage {
        /**
         * @dev Reference of the ERC-721 artwork registry contract.
         */
        ArtRegistry registry;
    }

    bytes32 private constant FUNDTREASURY_STORAGE = 0xc75a7a6ea9ec4bb33d2ab2c2a0896cf54f7160b776426de955e8d4b10c146f00;

    constructor() {
        _disableInitializers();
    }

    function initialize(address initialOwner) external initializer {
        require(initialOwner != address(0), InvalidOwner());

        __Ownable_init(initialOwner);
    }

    function initializeRegistry(ArtRegistry _registry) external onlyOwner reinitializer(2) {
        require(address(_registry) != address(0), InvalidArtRegistry());

        FundTreasuryStorage storage $ = _getFundTreasuryStorage();
        $.registry = _registry;
    }

    function registry() external view returns (ArtRegistry) {
        FundTreasuryStorage storage $ = _getFundTreasuryStorage();
        return $.registry;
    }

    function pay(address to, uint256 amount, string calldata reason) external onlyOwner {
        uint256 availableBalance = address(this).balance;
        require(availableBalance >= amount, InsufficientBalance(amount, availableBalance));
        require(to != address(0), InvalidReceiver());

        (bool succ,) = to.call{value: amount}("");
        require(succ, PayTransferFailed());

        emit Paid(to, amount, reason);
    }

    function sell(address to, uint256 artworkId) external onlyOwner {
        require(to != address(0), InvalidReceiver());

        FundTreasuryStorage storage $ = _getFundTreasuryStorage();
        $.registry.safeTransferFrom(address(this), to, artworkId);

        emit Sold(to, artworkId);
    }

    function onERC721Received(address, address, uint256, bytes calldata) external pure override returns (bytes4) {
        return IERC721Receiver.onERC721Received.selector;
    }

    receive() external payable {}

    function _authorizeUpgrade(address newImplementation) internal override onlyOwner {}

    function _fundTreasuryStorage() internal pure returns (bytes32) {
        return FUNDTREASURY_STORAGE;
    }

    function _getFundTreasuryStorage() private pure returns (FundTreasuryStorage storage $) {
        bytes32 slot = _fundTreasuryStorage();
        assembly {
            $.slot := slot
        }
    }
}
