// SPDX-License-Identifier: MIT
pragma solidity 0.8.36;

import {Test} from "forge-std/Test.sol";
import {FundGovernor} from "../../src/FundGovernor.sol";
import {FundShare} from "../../src/FundShare.sol";
import {FundTreasury} from "../../src/FundTreasury.sol";
import {ArtRegistry} from "../../src/ArtRegistry.sol";
import {TimelockController} from "@openzeppelin/contracts/governance/TimelockController.sol";
import {IGovernor} from "@openzeppelin/contracts/governance/IGovernor.sol";
import {GovernorCountingSimple} from "@openzeppelin/contracts/governance/extensions/GovernorCountingSimple.sol";
import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";
import {Merkle} from "murky/Merkle.sol";

contract FundGovernorIntegrationTest is Test {
    // TimelockController - constants
    uint256 constant MIN_DELAY = 1 days;

    // FundGovernor - constants
    uint48 constant INITIAL_VOTING_DELAY = 3 days;
    uint32 constant INITIAL_VOTING_PERIOD = 10 days;
    uint256 constant INITIAL_PROPOSAL_THRESHOLD = 0;
    uint256 constant QUORUM_THRESHOLD = 40;

    FundTreasury treasury;
    FundShare token;
    TimelockController timelock;
    ArtRegistry registry;
    FundGovernor governor;

    address[] private _stakeholders;
    uint256[] private _contributions;

    struct Artwork {
        uint256 tokenId;
        string cid;
    }

    function setUp() public {
        // - Deploy FundTreasury
        treasury = new FundTreasury();

        // - Deploy FundShare
        uint256[10] memory contributions = _fixedContributions();
        uint48 deadline = uint48(block.timestamp + 1 days);
        for (uint256 i = 0; i < contributions.length; i++) {
            _stakeholders.push(makeAddr(string.concat("stakeholder", vm.toString(i))));
            _contributions.push(contributions[i]);
        }
        token = new FundShare(address(treasury), deadline, _stakeholders, _contributions);

        // - Deploy TimelockController
        address[] memory proposers = new address[](0);
        address[] memory executors = new address[](0);
        address admin = address(this);
        timelock = new TimelockController(MIN_DELAY, proposers, executors, admin);

        // - Deploy ArtRegistry
        registry = new ArtRegistry(address(timelock), address(treasury));

        // - Deploy FundGovernor
        governor = new FundGovernor(
            INITIAL_VOTING_DELAY, INITIAL_VOTING_PERIOD, INITIAL_PROPOSAL_THRESHOLD, QUORUM_THRESHOLD, timelock, token
        );

        // Use admin role to configure Timelock roles assigning FundGovernor's as proposer and canceller + executor assigned to address(0).
        timelock.grantRole(timelock.PROPOSER_ROLE(), address(governor));
        timelock.grantRole(timelock.CANCELLER_ROLE(), address(governor));
        timelock.grantRole(timelock.EXECUTOR_ROLE(), address(0));

        // Finally, renounce admin role.
        timelock.renounceRole(timelock.DEFAULT_ADMIN_ROLE(), address(this));

        // Subscribe all _stakeholders
        for (uint256 i = 0; i < _stakeholders.length; i++) {
            vm.deal(_stakeholders[i], _contributions[i]);
            vm.prank(_stakeholders[i]);
            token.subscribe{value: _contributions[i]}();
        }

        // Finalize fund round
        token.finalize();

        // Delegate votes to articulate the voting power; for simplicity to themselves.
        for (uint256 i = 0; i < _stakeholders.length; i++) {
            vm.prank(_stakeholders[i]);
            token.delegate(_stakeholders[i]);
        }
    }

    function test_Proposal_BecomesPendingAfterCreation() public {
        bytes32 root = keccak256("gallery");
        (address[] memory targets, uint256[] memory values, bytes[] memory calldatas) =
            _buildProposal(address(registry), uint256(0), abi.encodeCall(ArtRegistry.addGallery, (root)));
        string memory description = "Add gallery root";

        vm.prank(_stakeholders[0]);
        uint256 proposalId = governor.propose(targets, values, calldatas, description);

        assertEq(uint256(governor.state(proposalId)), uint256(IGovernor.ProposalState.Pending));
        assertEq(governor.proposalSnapshot(proposalId), block.timestamp + governor.votingDelay());
        assertEq(governor.proposalDeadline(proposalId), governor.proposalSnapshot(proposalId) + governor.votingPeriod());
    }

    function test_Proposal_BecomesActiveAfterVotingDelay() public {
        bytes32 root = keccak256("gallery");
        (address[] memory targets, uint256[] memory values, bytes[] memory calldatas) =
            _buildProposal(address(registry), uint256(0), abi.encodeCall(ArtRegistry.addGallery, (root)));
        string memory description = "Add gallery root";

        vm.prank(_stakeholders[0]);
        uint256 proposalId = governor.propose(targets, values, calldatas, description);

        vm.warp(block.timestamp + governor.votingDelay() + 1);
        assertEq(uint256(governor.state(proposalId)), uint256(IGovernor.ProposalState.Active));
    }

    function test_Proposal_RemainsPendingAtSnapshotTimestamp() public {
        bytes32 root = keccak256("gallery");
        (address[] memory targets, uint256[] memory values, bytes[] memory calldatas) =
            _buildProposal(address(registry), uint256(0), abi.encodeCall(ArtRegistry.addGallery, (root)));
        string memory description = "Add gallery root";

        vm.prank(_stakeholders[0]);
        uint256 proposalId = governor.propose(targets, values, calldatas, description);

        vm.warp(governor.proposalSnapshot(proposalId));
        assertEq(uint256(governor.state(proposalId)), uint256(IGovernor.ProposalState.Pending));
    }

    function test_Proposal_SucceedsWhenQuorumReachedAndForWins() public {
        bytes32 root = keccak256("gallery");
        (address[] memory targets, uint256[] memory values, bytes[] memory calldatas) =
            _buildProposal(address(registry), uint256(0), abi.encodeCall(ArtRegistry.addGallery, (root)));
        string memory description = "Add gallery root";

        vm.prank(_stakeholders[0]);
        uint256 proposalId = governor.propose(targets, values, calldatas, description);

        address stakeholderWith25Percent = _stakeholders[0];
        address stakeholderWith20Percent = _stakeholders[1];
        address stakeholderWith15Percent = _stakeholders[2];

        vm.warp(governor.proposalSnapshot(proposalId) + 1);
        vm.prank(stakeholderWith25Percent);
        governor.castVote(proposalId, uint8(GovernorCountingSimple.VoteType.For));
        vm.prank(stakeholderWith15Percent);
        governor.castVote(proposalId, uint8(GovernorCountingSimple.VoteType.Abstain));
        vm.prank(stakeholderWith20Percent);
        governor.castVote(proposalId, uint8(GovernorCountingSimple.VoteType.Against));

        vm.warp(governor.proposalDeadline(proposalId));
        assertEq(uint256(governor.state(proposalId)), uint256(IGovernor.ProposalState.Active));
        vm.warp(governor.proposalDeadline(proposalId) + 1);
        assertEq(uint256(governor.state(proposalId)), uint256(IGovernor.ProposalState.Succeeded));
    }

    function test_Proposal_QueuedAfterSuccess() public {
        bytes32 root = keccak256("gallery");
        (address[] memory targets, uint256[] memory values, bytes[] memory calldatas) =
            _buildProposal(address(registry), uint256(0), abi.encodeCall(ArtRegistry.addGallery, (root)));
        string memory description = "Add gallery root";

        vm.prank(_stakeholders[0]);
        uint256 proposalId = governor.propose(targets, values, calldatas, description);

        address stakeholderWith25Percent = _stakeholders[0];
        address stakeholderWith20Percent = _stakeholders[1];
        address stakeholderWith15Percent = _stakeholders[2];

        vm.warp(governor.proposalSnapshot(proposalId) + 1); // Note: without +1 proposal remains Pending
        vm.prank(stakeholderWith25Percent);
        governor.castVote(proposalId, uint8(GovernorCountingSimple.VoteType.For));
        vm.prank(stakeholderWith15Percent);
        governor.castVote(proposalId, uint8(GovernorCountingSimple.VoteType.Abstain));
        vm.prank(stakeholderWith20Percent);
        governor.castVote(proposalId, uint8(GovernorCountingSimple.VoteType.Against));

        vm.warp(governor.proposalDeadline(proposalId) + 1); // Note: without +1 proposal remains Active
        governor.queue(targets, values, calldatas, keccak256(bytes(description)));

        assertEq(uint256(governor.state(proposalId)), uint256(IGovernor.ProposalState.Queued));
    }

    function test_Proposal_ExecutedAfterTimelockDelay() public {
        bytes32 root = keccak256("gallery");
        (address[] memory targets, uint256[] memory values, bytes[] memory calldatas) =
            _buildProposal(address(registry), uint256(0), abi.encodeCall(ArtRegistry.addGallery, (root)));
        string memory description = "Add gallery root";

        vm.prank(_stakeholders[0]);
        uint256 proposalId = governor.propose(targets, values, calldatas, description);

        address stakeholderWith25Percent = _stakeholders[0];
        address stakeholderWith20Percent = _stakeholders[1];
        address stakeholderWith15Percent = _stakeholders[2];

        vm.warp(governor.proposalSnapshot(proposalId) + 1);
        vm.prank(stakeholderWith25Percent);
        governor.castVote(proposalId, uint8(GovernorCountingSimple.VoteType.For));
        vm.prank(stakeholderWith15Percent);
        governor.castVote(proposalId, uint8(GovernorCountingSimple.VoteType.Abstain));
        vm.prank(stakeholderWith20Percent);
        governor.castVote(proposalId, uint8(GovernorCountingSimple.VoteType.Against));

        vm.warp(governor.proposalDeadline(proposalId) + 1);
        governor.queue(targets, values, calldatas, keccak256(bytes(description)));

        vm.warp(governor.proposalEta(proposalId));
        governor.execute(targets, values, calldatas, keccak256(bytes(description)));

        assertEq(uint256(governor.state(proposalId)), uint256(IGovernor.ProposalState.Executed));
    }

    function test_Proposal_DefeatedWhenQuorumNotReached() public {
        bytes32 root = keccak256("gallery");
        (address[] memory targets, uint256[] memory values, bytes[] memory calldatas) =
            _buildProposal(address(registry), uint256(0), abi.encodeCall(ArtRegistry.addGallery, (root)));
        string memory description = "Add gallery root";

        vm.prank(_stakeholders[0]);
        uint256 proposalId = governor.propose(targets, values, calldatas, description);

        address stakeholderWith25Percent = _stakeholders[0];

        vm.warp(governor.proposalSnapshot(proposalId) + 1);
        vm.prank(stakeholderWith25Percent);
        governor.castVote(proposalId, uint8(GovernorCountingSimple.VoteType.For));

        vm.warp(governor.proposalDeadline(proposalId) + 1);
        assertEq(uint256(governor.state(proposalId)), uint256(IGovernor.ProposalState.Defeated));
    }

    function test_Proposal_DefeatedWhenAllVoteAgainst() public {
        bytes32 root = keccak256("gallery");
        (address[] memory targets, uint256[] memory values, bytes[] memory calldatas) =
            _buildProposal(address(registry), uint256(0), abi.encodeCall(ArtRegistry.addGallery, (root)));
        string memory description = "Add gallery root";

        vm.prank(_stakeholders[0]);
        uint256 proposalId = governor.propose(targets, values, calldatas, description);

        address stakeholderWith25Percent = _stakeholders[0];
        address stakeholderWith20Percent = _stakeholders[1];
        address stakeholderWith15Percent = _stakeholders[2];

        vm.warp(governor.proposalSnapshot(proposalId) + 1);
        vm.prank(stakeholderWith25Percent);
        governor.castVote(proposalId, uint8(GovernorCountingSimple.VoteType.Against));
        vm.prank(stakeholderWith15Percent);
        governor.castVote(proposalId, uint8(GovernorCountingSimple.VoteType.Against));
        vm.prank(stakeholderWith20Percent);
        governor.castVote(proposalId, uint8(GovernorCountingSimple.VoteType.Against));

        vm.warp(governor.proposalDeadline(proposalId) + 1);
        assertEq(uint256(governor.state(proposalId)), uint256(IGovernor.ProposalState.Defeated));
    }

    function test_Proposal_DefeatedWhenAllAbstain() public {
        bytes32 root = keccak256("gallery");
        (address[] memory targets, uint256[] memory values, bytes[] memory calldatas) =
            _buildProposal(address(registry), uint256(0), abi.encodeCall(ArtRegistry.addGallery, (root)));
        string memory description = "Add gallery root";

        vm.prank(_stakeholders[0]);
        uint256 proposalId = governor.propose(targets, values, calldatas, description);

        address stakeholderWith25Percent = _stakeholders[0];
        address stakeholderWith20Percent = _stakeholders[1];
        address stakeholderWith15Percent = _stakeholders[2];

        vm.warp(governor.proposalSnapshot(proposalId) + 1);
        vm.prank(stakeholderWith25Percent);
        governor.castVote(proposalId, uint8(GovernorCountingSimple.VoteType.Abstain));
        vm.prank(stakeholderWith15Percent);
        governor.castVote(proposalId, uint8(GovernorCountingSimple.VoteType.Abstain));
        vm.prank(stakeholderWith20Percent);
        governor.castVote(proposalId, uint8(GovernorCountingSimple.VoteType.Abstain));

        vm.warp(governor.proposalDeadline(proposalId) + 1);
        assertEq(uint256(governor.state(proposalId)), uint256(IGovernor.ProposalState.Defeated));
    }

    function test_Proposal_SucceedsWithMinimalCoalition() public {
        bytes32 root = keccak256("gallery");
        (address[] memory targets, uint256[] memory values, bytes[] memory calldatas) =
            _buildProposal(address(registry), uint256(0), abi.encodeCall(ArtRegistry.addGallery, (root)));
        string memory description = "Add gallery root";

        vm.prank(_stakeholders[0]);
        uint256 proposalId = governor.propose(targets, values, calldatas, description);

        address stakeholderWith25Percent = _stakeholders[0];
        address stakeholderWith15Percent = _stakeholders[2];

        vm.warp(governor.proposalSnapshot(proposalId) + 1);
        vm.prank(stakeholderWith25Percent);
        governor.castVote(proposalId, uint8(GovernorCountingSimple.VoteType.For));
        vm.prank(stakeholderWith15Percent);
        governor.castVote(proposalId, uint8(GovernorCountingSimple.VoteType.Abstain));

        vm.warp(governor.proposalDeadline(proposalId) + 1);
        assertEq(uint256(governor.state(proposalId)), uint256(IGovernor.ProposalState.Succeeded));
    }

    function test_Proposal_UndelegatedHolderHasNoVotingPower() public {
        bytes32 root = keccak256("gallery");
        (address[] memory targets, uint256[] memory values, bytes[] memory calldatas) =
            _buildProposal(address(registry), uint256(0), abi.encodeCall(ArtRegistry.addGallery, (root)));
        string memory description = "Add gallery root";

        vm.prank(_stakeholders[0]);
        uint256 proposalId = governor.propose(targets, values, calldatas, description);

        address stakeholderWith25Percent = _stakeholders[0];
        address stakeholderWith15Percent = _stakeholders[2];

        // Undelegate stakeholder with 25%
        vm.prank(stakeholderWith25Percent);
        token.delegate(address(0));

        vm.warp(governor.proposalSnapshot(proposalId) + 1);
        vm.prank(stakeholderWith25Percent);
        governor.castVote(proposalId, uint8(GovernorCountingSimple.VoteType.For));
        vm.prank(stakeholderWith15Percent);
        governor.castVote(proposalId, uint8(GovernorCountingSimple.VoteType.Abstain));

        // Defeated is the expected proposal state due quorum fraction was not reached.
        vm.warp(governor.proposalDeadline(proposalId) + 1);
        assertEq(uint256(governor.state(proposalId)), uint256(IGovernor.ProposalState.Defeated));
    }

    function test_Proposal_TokenAcquiredAfterSnapshotDoNotCount() public {
        bytes32 root = keccak256("gallery");
        (address[] memory targets, uint256[] memory values, bytes[] memory calldatas) =
            _buildProposal(address(registry), uint256(0), abi.encodeCall(ArtRegistry.addGallery, (root)));
        string memory description = "Add gallery root";

        address stakeholderWith25Percent = _stakeholders[0];
        address stakeholderWith15Percent = _stakeholders[2];

        vm.prank(_stakeholders[0]);
        uint256 proposalId = governor.propose(targets, values, calldatas, description);

        // Before proposal snapshot undelegate stakeholder with 25% before proposal is created
        vm.prank(stakeholderWith25Percent);
        token.delegate(address(0));

        // After proposal snapshot delegate voting power of stakeholder with 25% to itself
        vm.warp(governor.proposalSnapshot(proposalId) + 1);
        vm.prank(stakeholderWith25Percent);
        token.delegate(stakeholderWith25Percent);

        vm.prank(stakeholderWith25Percent);
        governor.castVote(proposalId, uint8(GovernorCountingSimple.VoteType.For));
        vm.prank(stakeholderWith15Percent);
        governor.castVote(proposalId, uint8(GovernorCountingSimple.VoteType.Abstain));

        // Defeated is the expected proposal state due quorum fraction was not reached.
        vm.warp(governor.proposalDeadline(proposalId) + 1);
        assertEq(uint256(governor.state(proposalId)), uint256(IGovernor.ProposalState.Defeated));
    }

    function test_RevertWhen_AddGalleryCalledDirectly() public {
        bytes32 root = keccak256("gallery");

        vm.expectRevert(abi.encodeWithSelector(Ownable.OwnableUnauthorizedAccount.selector, address(this)));
        registry.addGallery(root);
    }

    function test_RevertWhen_ExecuteBeforeTimelockDelay() public {
        bytes32 root = keccak256("gallery");
        (address[] memory targets, uint256[] memory values, bytes[] memory calldatas) =
            _buildProposal(address(registry), uint256(0), abi.encodeCall(ArtRegistry.addGallery, (root)));
        string memory description = "Add gallery root";

        vm.prank(_stakeholders[0]);
        uint256 proposalId = governor.propose(targets, values, calldatas, description);

        address stakeholderWith25Percent = _stakeholders[0];
        address stakeholderWith20Percent = _stakeholders[1];
        address stakeholderWith15Percent = _stakeholders[2];

        vm.warp(governor.proposalSnapshot(proposalId) + 1);
        vm.prank(stakeholderWith25Percent);
        governor.castVote(proposalId, uint8(GovernorCountingSimple.VoteType.For));
        vm.prank(stakeholderWith15Percent);
        governor.castVote(proposalId, uint8(GovernorCountingSimple.VoteType.Abstain));
        vm.prank(stakeholderWith20Percent);
        governor.castVote(proposalId, uint8(GovernorCountingSimple.VoteType.Against));

        vm.warp(governor.proposalDeadline(proposalId) + 1);
        governor.queue(targets, values, calldatas, keccak256(bytes(description)));

        vm.warp(governor.proposalEta(proposalId) - 1);
        // Note: Partial revert due operation ID is derived internally and asserting it would mean duplicating _timelockSalt.
        vm.expectPartialRevert(TimelockController.TimelockUnexpectedOperationState.selector);
        governor.execute(targets, values, calldatas, keccak256(bytes(description)));
    }

    function test_RevertWhen_QueueBeforeSuccess() public {
        bytes32 root = keccak256("gallery");
        (address[] memory targets, uint256[] memory values, bytes[] memory calldatas) =
            _buildProposal(address(registry), uint256(0), abi.encodeCall(ArtRegistry.addGallery, (root)));
        string memory description = "Add gallery root";

        vm.prank(_stakeholders[0]);
        uint256 proposalId = governor.propose(targets, values, calldatas, description);

        address stakeholderWith25Percent = _stakeholders[0];
        address stakeholderWith20Percent = _stakeholders[1];
        address stakeholderWith15Percent = _stakeholders[2];

        vm.warp(governor.proposalSnapshot(proposalId) + 1);
        vm.prank(stakeholderWith25Percent);
        governor.castVote(proposalId, uint8(GovernorCountingSimple.VoteType.For));
        vm.prank(stakeholderWith15Percent);
        governor.castVote(proposalId, uint8(GovernorCountingSimple.VoteType.Abstain));
        vm.prank(stakeholderWith20Percent);
        governor.castVote(proposalId, uint8(GovernorCountingSimple.VoteType.Against));

        bytes32 allowedStates = bytes32(1 << uint8(IGovernor.ProposalState.Succeeded));
        IGovernor.ProposalState currentState = governor.state(proposalId);

        vm.warp(governor.proposalDeadline(proposalId));
        vm.expectRevert(
            abi.encodeWithSelector(
                IGovernor.GovernorUnexpectedProposalState.selector, proposalId, currentState, allowedStates
            )
        );
        governor.queue(targets, values, calldatas, keccak256(bytes(description)));
    }

    function test_RevertWhen_VoteAfterDeadline() public {
        bytes32 root = keccak256("gallery");
        (address[] memory targets, uint256[] memory values, bytes[] memory calldatas) =
            _buildProposal(address(registry), uint256(0), abi.encodeCall(ArtRegistry.addGallery, (root)));
        string memory description = "Add gallery root";

        vm.prank(_stakeholders[0]);
        uint256 proposalId = governor.propose(targets, values, calldatas, description);

        vm.warp(governor.proposalDeadline(proposalId) + 1);
        address stakeholderWith25Percent = _stakeholders[0];
        bytes32 allowedStates = bytes32(1 << uint8(IGovernor.ProposalState.Active));
        IGovernor.ProposalState currentState = governor.state(proposalId);

        vm.expectRevert(
            abi.encodeWithSelector(
                IGovernor.GovernorUnexpectedProposalState.selector, proposalId, currentState, allowedStates
            )
        );
        vm.prank(stakeholderWith25Percent);
        governor.castVote(proposalId, uint8(GovernorCountingSimple.VoteType.For));
    }

    function test_RevertWhen_VoteTwice() public {
        bytes32 root = keccak256("gallery");
        (address[] memory targets, uint256[] memory values, bytes[] memory calldatas) =
            _buildProposal(address(registry), uint256(0), abi.encodeCall(ArtRegistry.addGallery, (root)));
        string memory description = "Add gallery root";

        vm.prank(_stakeholders[0]);
        uint256 proposalId = governor.propose(targets, values, calldatas, description);

        address stakeholderWith25Percent = _stakeholders[0];

        vm.warp(governor.proposalSnapshot(proposalId) + 1);
        vm.prank(stakeholderWith25Percent);
        governor.castVote(proposalId, uint8(GovernorCountingSimple.VoteType.For));

        vm.expectRevert(abi.encodeWithSelector(IGovernor.GovernorAlreadyCastVote.selector, stakeholderWith25Percent));
        vm.prank(stakeholderWith25Percent);
        governor.castVote(proposalId, uint8(GovernorCountingSimple.VoteType.For));
    }

    function test_AcquisitionFlow_MintsArtworkToTreasury() public {
        // Curate artworks into a Merkle tree and obtain the gallery root.
        Merkle merkle = new Merkle();
        Artwork[5] memory artworks = [
            Artwork(1, "CID-001"),
            Artwork(2, "CID-002"),
            Artwork(3, "CID-003"),
            Artwork(4, "CID-004"),
            Artwork(5, "CID-005")
        ];
        bytes32[] memory data = _hashArtworks(artworks);
        bytes32 root = merkle.getRoot(data);

        // Create add gallery root proposal
        (address[] memory targets, uint256[] memory values, bytes[] memory calldatas) =
            _buildProposal(address(registry), uint256(0), abi.encodeCall(ArtRegistry.addGallery, (root)));
        string memory description = "Add gallery root";

        vm.prank(_stakeholders[0]);
        uint256 proposalId = governor.propose(targets, values, calldatas, description);

        // Make the proposal succeed through a majority of For votes and reaching Quorum threshold.
        address stakeholderWith25Percent = _stakeholders[0];
        address stakeholderWith15Percent = _stakeholders[2];

        vm.warp(governor.proposalSnapshot(proposalId) + 1);
        vm.prank(stakeholderWith25Percent);
        governor.castVote(proposalId, uint8(GovernorCountingSimple.VoteType.For));
        vm.prank(stakeholderWith15Percent);
        governor.castVote(proposalId, uint8(GovernorCountingSimple.VoteType.Abstain));

        // Queue the succeeded proposal once deadline has passed.
        vm.warp(governor.proposalDeadline(proposalId) + 1);
        governor.queue(targets, values, calldatas, keccak256(bytes(description)));

        // Execute the enqueued task once timelock delay has passed.
        vm.warp(governor.proposalEta(proposalId));
        governor.execute(targets, values, calldatas, keccak256(bytes(description)));

        // Mint artwork bounded to gallery's merkle root providing a valid proof.
        bytes32[] memory proof = merkle.getProof(data, 0);
        vm.prank(stakeholderWith25Percent);
        registry.mintArtwork(proof, root, artworks[0].tokenId, artworks[0].cid);

        assertTrue(registry.isGalleryEnabled(root));
        assertEq(registry.ownerOf(artworks[0].tokenId), address(treasury));
        assertEq(registry.tokenURI(artworks[0].tokenId), "ipfs://CID-001");
    }

    // Note: Total fixed contributions sum 100 and that's what makes percentages readable.
    function _fixedContributions() private pure returns (uint256[10] memory contributions) {
        contributions =
            [uint256(25 ether), 20 ether, 15 ether, 12 ether, 8 ether, 6 ether, 5 ether, 4 ether, 3 ether, 2 ether];
    }

    function _buildProposal(address target, uint256 value, bytes memory _calldata)
        private
        pure
        returns (address[] memory targets, uint256[] memory values, bytes[] memory calldatas)
    {
        targets = new address[](1);
        values = new uint256[](1);
        calldatas = new bytes[](1);
        targets[0] = target;
        values[0] = value;
        calldatas[0] = _calldata;
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
        return keccak256(bytes.concat(keccak256(abi.encode(artwork.tokenId, artwork.cid))));
    }
}
