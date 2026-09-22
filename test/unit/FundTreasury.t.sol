// SPDX-License-Identifier: MIT
pragma solidity ^0.8.36;

import {Test} from "forge-std/Test.sol";
import {console} from "forge-std/console.sol";
import {FundTreasury} from "../../src/FundTreasury.sol";
import {ArtRegistry} from "../../src/ArtRegistry.sol";
import {ERC1967Proxy} from "@openzeppelin/contracts/proxy/ERC1967/ERC1967Proxy.sol";
import {TimelockController} from "@openzeppelin/contracts/governance/TimelockController.sol";
import {OwnableUpgradeable} from "@openzeppelin/contracts-upgradeable/access/OwnableUpgradeable.sol";
import {Merkle} from "murky/Merkle.sol";
import {IERC721Errors} from "@openzeppelin/contracts/interfaces/draft-IERC6093.sol";
import {IERC721Receiver} from "@openzeppelin/contracts/interfaces/IERC721Receiver.sol";
import {Initializable} from "@openzeppelin/contracts-upgradeable/proxy/utils/Initializable.sol";
import {ERC1967Utils} from "@openzeppelin/contracts/proxy/ERC1967/ERC1967Utils.sol";

contract FundTreasuryTest is Test {
    FundTreasury implementation;
    ERC1967Proxy proxy;
    FundTreasury treasury;
    ArtRegistry registry;
    TimelockController timelock;

    struct Artwork {
        uint256 tokenId;
        string cid;
    }
    Artwork[] private _artworks;

    function setUp() public {
        // - Wrap test address into Timelock contract.
        timelock = TimelockController(payable(makeAddr("timelock")));
        // - Deploy implementation and proxy.
        implementation = new FundTreasury();
        proxy = new ERC1967Proxy(address(implementation), abi.encodeCall(FundTreasury.initialize, (address(timelock))));
        // - Wrap proxy with FundTreasury contract to interact with it.
        treasury = FundTreasury(payable(address(proxy)));
        // - Deploy ArtRegistry.
        registry = new ArtRegistry(address(timelock), address(treasury));
        // - Create gallery root
        Merkle merkle = new Merkle();
        for (uint256 i = 0; i < 5; i++) {
            _artworks.push(Artwork(i + 1, string.concat("CID-00", vm.toString(i + 1))));
        }
        bytes32[] memory data = _hashArtworks(_artworks);
        bytes32 root = merkle.getRoot(data);
        // - Add gallery root to registry
        vm.prank(address(timelock));
        registry.addGallery(root);
        // - Mint artworks
        vm.prank(address(timelock));
        bytes32[] memory proof;
        for (uint256 i = 0; i < _artworks.length; i++) {
            proof = merkle.getProof(data, i);
            registry.mintArtwork(proof, root, _artworks[i].tokenId, _artworks[i].cid);
        }
    }

    function test_Initialize_SetsTimelockAsOwner() public view {
        assertEq(treasury.owner(), address(timelock));
    }

    function test_Initialize_LetsRegistryUnintialized() public view {
        assertEq(address(treasury.registry()), address(0));
    }

    function test_RevertWhen_InitializeImplementationDirectly() public {
        address attacker = makeAddr("attacker");

        vm.expectRevert(abi.encodeWithSelector(Initializable.InvalidInitialization.selector));
        vm.prank(attacker);
        implementation.initialize(attacker);
    }

    function testFuzz_RevertWhen_InitializeCalledTwiceNotFromTimelock(address caller) public {
        vm.expectRevert(abi.encodeWithSelector(Initializable.InvalidInitialization.selector));
        vm.prank(caller);
        treasury.initialize(caller);
    }

    function testFuzz_RevertWhen_InitializableCalledTwiceFromTimelock(address newOwner) public {
        vm.expectRevert(abi.encodeWithSelector(Initializable.InvalidInitialization.selector));
        vm.prank(address(timelock));
        treasury.initialize(newOwner);
    }

    function test_RevertWhen_InitializeWithZeroAddressOwner() public {
        vm.expectRevert(abi.encodeWithSelector(FundTreasury.InvalidOwner.selector));
        new ERC1967Proxy(address(implementation), abi.encodeCall(FundTreasury.initialize, (address(0))));
    }

    function test_InitializeRegistry_SetsArtRegistry() public {
        vm.prank(address(timelock));
        treasury.initializeRegistry(registry);

        assertEq(address(treasury.registry()), address(registry));
    }

    function test_RevertWhen_InitializeRegistryCalledTwiceFromTimelock() public {
        vm.startPrank(address(timelock));
        treasury.initializeRegistry(registry);

        vm.expectRevert(abi.encodeWithSelector(Initializable.InvalidInitialization.selector));
        treasury.initializeRegistry(registry);
        vm.stopPrank();
    }

    function test_RevertWhen_InitializeRegistryWithZeroAddress() public {
        vm.expectRevert(abi.encodeWithSelector(FundTreasury.InvalidArtRegistry.selector));
        vm.prank(address(timelock));
        treasury.initializeRegistry(ArtRegistry(address(0)));
    }

    function test_RevertWhen_InitializeRegistryNotCalledFromTimelock() public {
        vm.expectRevert(abi.encodeWithSelector(OwnableUpgradeable.OwnableUnauthorizedAccount.selector, address(this)));
        treasury.initializeRegistry(registry);
    }

    function test_Pay_TransfersAmountToReceiver() public {
        address receiver = makeAddr("receiver");
        uint256 amount = vm.randomUint(1, 100);
        string memory reason = "Acquisition of new gallery";

        vm.expectEmit(true, true, true, true);
        emit FundTreasury.Paid(receiver, amount, reason);

        vm.deal(address(treasury), amount);
        vm.prank(address(timelock));
        treasury.pay(receiver, amount, reason);

        assertEq(address(treasury).balance, 0);
        assertEq(address(receiver).balance, amount);
    }

    function test_RevertWhen_PayZeroAddressReceiver() public {
        address receiver = address(0);
        uint256 amount = vm.randomUint(1, 100);
        string memory reason = "Acquisition of new gallery";

        vm.expectRevert(abi.encodeWithSelector(FundTreasury.InvalidReceiver.selector));
        vm.deal(address(treasury), amount);
        vm.prank(address(timelock));
        treasury.pay(receiver, amount, reason);
    }

    function testFuzz_RevertWhen_PayAndInsufficentBalance(uint256 balance) public {
        address receiver = address(0);
        uint256 amount = vm.randomUint(1, 100);
        string memory reason = "Acquisition of new gallery";
        balance = bound(balance, 0, amount - 1);

        vm.expectRevert(abi.encodeWithSelector(FundTreasury.InsufficientBalance.selector, amount, balance));
        vm.deal(address(treasury), balance);
        vm.prank(address(timelock));
        treasury.pay(receiver, amount, reason);
    }

    function test_RevertWhen_PayTransferFails() public {
        RejectingReceiver receiver = new RejectingReceiver();
        uint256 amount = vm.randomUint(1, 100);
        string memory reason = "Acquisition of new gallery";

        vm.expectRevert(abi.encodeWithSelector(FundTreasury.PayTransferFailed.selector));
        vm.deal(address(treasury), amount);
        vm.prank(address(timelock));
        treasury.pay(address(receiver), amount, reason);
    }

    function test_RevertWhen_PayNotCalledFromTimelock() public {
        address receiver = address(0);
        uint256 amount = vm.randomUint(1, 100);
        string memory reason = "Acquisition of new gallery";

        vm.expectRevert(abi.encodeWithSelector(OwnableUpgradeable.OwnableUnauthorizedAccount.selector, address(this)));
        vm.deal(address(treasury), amount);
        treasury.pay(receiver, amount, reason);
    }

    function test_Sell_TransfersArtworkToReceiver() public {
        address receiver = makeAddr("receiver");
        uint256 artworkId = _artworks[0].tokenId;

        vm.startPrank(address(timelock));
        treasury.initializeRegistry(registry);

        treasury.sell(receiver, artworkId);
        vm.stopPrank();

        assertEq(registry.ownerOf(artworkId), receiver);
    }

    function test_RevertWhen_SellZeroAddressReceiver() public {
        address receiver = address(0);
        uint256 artworkId = _artworks[0].tokenId;

        vm.startPrank(address(timelock));
        treasury.initializeRegistry(registry);

        vm.expectRevert(abi.encodeWithSelector(FundTreasury.InvalidReceiver.selector));
        treasury.sell(receiver, artworkId);
        vm.stopPrank();
    }

    function test_RevertWhen_SellUnmintedArtwork() public {
        address receiver = makeAddr("receiver");
        uint256 artworkId = uint256(keccak256("Girl with a Pearl Earring"));

        vm.startPrank(address(timelock));
        treasury.initializeRegistry(registry);

        vm.expectRevert(abi.encodeWithSelector(IERC721Errors.ERC721NonexistentToken.selector, artworkId));
        treasury.sell(receiver, artworkId);
        vm.stopPrank();
    }

    function test_RevertWhen_SellNotCalledFromTimelock() public {
        address receiver = makeAddr("receiver");
        uint256 artworkId = _artworks[0].tokenId;

        vm.prank(address(timelock));
        treasury.initializeRegistry(registry);

        vm.expectRevert(abi.encodeWithSelector(OwnableUpgradeable.OwnableUnauthorizedAccount.selector, address(this)));
        treasury.sell(receiver, artworkId);
    }

    function testFuzz_OnERC721Received_ReturnsItsSelector(address arg1, address arg2, uint256 arg3, bytes calldata arg4)
        public
        view
    {
        assertEq(treasury.onERC721Received(arg1, arg2, arg3, arg4), IERC721Receiver.onERC721Received.selector);
    }

    function test_UpgradeToAndCall_ChangesImplementation() public {
        UpgradeMechanismProbe newImplementation = new UpgradeMechanismProbe();
        address previousImplementation =
            address(uint160(uint256(vm.load(address(treasury), ERC1967Utils.IMPLEMENTATION_SLOT))));

        vm.prank(address(timelock));
        treasury.upgradeToAndCall(address(newImplementation), abi.encodeCall(UpgradeMechanismProbe.initializeV2, ()));

        address nextImplementation =
            address(uint160(uint256(vm.load(address(treasury), ERC1967Utils.IMPLEMENTATION_SLOT))));
        assertTrue(previousImplementation != nextImplementation);
        assertEq(previousImplementation, address(implementation));
        assertEq(nextImplementation, address(newImplementation));

        UpgradeMechanismProbe upgraded = UpgradeMechanismProbe(payable(address(treasury)));
        assertTrue(upgraded.succeeded());
    }

    function test_UpgradeToAndCall_ConservePreviousState() public {
        UpgradeMechanismProbe newImplementation = new UpgradeMechanismProbe();

        address previousOwner = treasury.owner();
        ArtRegistry previousRegistry = treasury.registry();
        uint256 previousBalance = address(treasury).balance;

        vm.prank(address(timelock));
        treasury.upgradeToAndCall(address(newImplementation), abi.encodeCall(UpgradeMechanismProbe.initializeV2, ()));

        assertEq(treasury.owner(), previousOwner);
        assertEq(address(treasury.registry()), address(previousRegistry));
        assertEq(address(treasury).balance, previousBalance);

        for (uint256 i = 0; i < _artworks.length; i++) {
            assertEq(registry.ownerOf(_artworks[i].tokenId), address(treasury));
        }
    }

    function test_RevertWhen_UpgradeToAndCallNotCalledFromTimelock() public {
        UpgradeMechanismProbe newImplementation = new UpgradeMechanismProbe();

        vm.expectRevert(abi.encodeWithSelector(OwnableUpgradeable.OwnableUnauthorizedAccount.selector, address(this)));
        vm.prank(address(this));
        treasury.upgradeToAndCall(address(newImplementation), abi.encodeCall(UpgradeMechanismProbe.initializeV2, ()));
    }

    function _hashArtworks(Artwork[] storage artworks) private view returns (bytes32[] memory data) {
        data = new bytes32[](artworks.length);
        for (uint256 i = 0; i < artworks.length;) {
            data[i] = _hashArtwork(artworks[i]);
            unchecked {
                ++i;
            }
        }
        return data;
    }

    function _hashArtwork(Artwork storage artwork) private view returns (bytes32) {
        return keccak256(bytes.concat(keccak256(abi.encode(artwork.tokenId, artwork.cid))));
    }
}

contract RejectingReceiver {
    receive() external payable {
        revert();
    }
}

contract UpgradeMechanismProbe is FundTreasury {
    bool public succeeded;

    function initializeV2() external onlyOwner reinitializer(3) {
        succeeded = true;
    }
}
