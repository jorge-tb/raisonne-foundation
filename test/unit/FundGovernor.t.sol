// SPDX-License-Identifier: MIT
pragma solidity 0.8.36;

import {Test} from "forge-std/Test.sol";
import {FundGovernor} from "../../src/FundGovernor.sol";
import {TimelockController} from "@openzeppelin/contracts/governance/TimelockController.sol";
import {FundShare} from "../../src/FundShare.sol";
import {FundTreasury} from "../../src/FundTreasury.sol";

contract FundGovernorTest is Test {
    uint256 constant DEFAULT_DENOMINATOR = 100;

    FundGovernor governor;
    TimelockController timelock;
    FundShare token;

    uint48 private _votingDelay;
    uint32 private _votingPeriod;
    uint256 private _proposalThreshold;
    uint256 private _quorumNumerator;

    uint256 private _allSubscribedTimestamp;
    address[] private _stakeholders;
    uint256[] private _contributions;

    function setUp() public {
        // - Deploy TimelockController
        uint256 minDelay = 1 days;
        address[] memory proposers = new address[](0);
        address[] memory executors = new address[](0);
        address admin = address(this);
        timelock = new TimelockController(minDelay, proposers, executors, admin);

        // - Deploy FundTreasury
        FundTreasury treasury = new FundTreasury();

        // - Deploy FundShare
        uint48 deadline = uint48(block.timestamp + 1 weeks);
        uint256[10] memory fixedContributions = _fixedContributions();
        for (uint256 i = 0; i < fixedContributions.length; i++) {
            _stakeholders.push(makeAddr(string.concat("stakeholder", vm.toString(i))));
            _contributions.push(fixedContributions[i]);
        }
        token = new FundShare(address(treasury), deadline, _stakeholders, _contributions);

        // Subscribe all stakeholders to generate maximum token supply and test quorum.
        _allSubscribedTimestamp = block.timestamp + 1 days;
        vm.warp(_allSubscribedTimestamp);
        for (uint256 i = 0; i < _stakeholders.length; i++) {
            vm.deal(_stakeholders[i], _contributions[i]);
            vm.prank(_stakeholders[i]);
            token.subscribe{value: _contributions[i]}();
        }

        // - Deploy FundGovernor
        _votingDelay = 3 days;
        _votingPeriod = 1 weeks;
        _proposalThreshold = 5;
        _quorumNumerator = 40;
        governor = new FundGovernor(_votingDelay, _votingPeriod, _proposalThreshold, _quorumNumerator, timelock, token);
    }

    function test_Constructor_SetsGovernorSettings() public view {
        assertEq(governor.votingDelay(), _votingDelay);
        assertEq(governor.votingPeriod(), _votingPeriod);
        assertEq(governor.proposalThreshold(), _proposalThreshold);
    }

    function test_Constructor_SetsQuorumAsFractionThreshold() public {
        // Note: Important to maintain +1 to not obtain Future Lookup error when calling quorum provided that supply should be forged in a past block.
        vm.warp(_allSubscribedTimestamp + 1);
        uint256 quorumBeforeSupply = governor.quorum(_allSubscribedTimestamp - 1);
        uint256 quorumAfterSupply = governor.quorum(_allSubscribedTimestamp);

        assertEq(quorumBeforeSupply, 0 ether);
        assertEq(quorumAfterSupply, 40 ether);
        assertEq(governor.quorumNumerator(), _quorumNumerator);
        assertEq(governor.quorumDenominator(), DEFAULT_DENOMINATOR);
    }

    function test_Constructor_SetsTimelock() public view {
        assertEq(governor.timelock(), address(timelock));
    }

    function test_Constructor_SetsToken() public view {
        assertEq(address(governor.token()), address(token));
    }

    function test_RevertWhen_ConstructorReceivesZeroAddressTimelock() public {
        vm.expectRevert(abi.encodeWithSelector(FundGovernor.InvalidTimelock.selector));
        new FundGovernor(
            _votingDelay,
            _votingPeriod,
            _proposalThreshold,
            _quorumNumerator,
            TimelockController(payable(address(0))),
            token
        );
    }

    function test_RevertWhen_ConstructorReceivesZeroAddressToken() public {
        // Note: GovernorVotes(token) runs first calling token.clock() and it works as a inherited guard against token zero address.
        vm.expectRevert();
        new FundGovernor(
            _votingDelay, _votingPeriod, _proposalThreshold, _quorumNumerator, timelock, FundShare(address(0))
        );
    }

    // Note: Total fixed contributions sum 100 and that's what makes percentages readable.
    function _fixedContributions() private pure returns (uint256[10] memory contributions) {
        contributions =
            [uint256(25 ether), 20 ether, 15 ether, 12 ether, 8 ether, 6 ether, 5 ether, 4 ether, 3 ether, 2 ether];
    }
}
