// SPDX-License-Identifier: MIT
pragma solidity 0.8.36;

import {Test} from "forge-std/Test.sol";
import {FundShare} from "../../src/FundShare.sol";
import {console} from "forge-std/console.sol";
import {EnumerableSet} from "@openzeppelin/contracts/utils/structs/EnumerableSet.sol";

contract FundShareHandler is Test {
    FundShare fundShare;
    mapping(address stakeholder => uint256 contribution) public expectedContributions;

    mapping(bytes4 => uint256) public calls;
    mapping(bytes4 => uint256) public skips;

    uint256 public ghost_contributedSum;
    uint256 public ghost_refundedSum;
    bool public ghost_isFinalized;

    address currentStakeholder;
    uint256 currentContribution;

    using EnumerableSet for EnumerableSet.AddressSet;
    EnumerableSet.AddressSet private _subscribers;
    EnumerableSet.AddressSet private _unsubscribers;

    constructor(FundShare _fundShare, address[] memory _stakeholders, uint256[] memory _contributions) {
        fundShare = _fundShare;

        // Note: initialize _unsubsribers enumerable set + expectedContributions
        for (uint256 i = 0; i < _stakeholders.length; i++) {
            expectedContributions[_stakeholders[i]] = _contributions[i];
            _unsubscribers.add(_stakeholders[i]);
        }
    }

    function subscribers() public view returns (address[] memory) {
        return _subscribers.values();
    }

    function unsubscribers() public view returns (address[] memory) {
        return _unsubscribers.values();
    }

    function subscribe(uint256 stakeholderIdx) external useStakeholder(stakeholderIdx, false) {
        calls[this.subscribe.selector]++;

        if (currentStakeholder == address(0)) {
            skips[this.subscribe.selector]++;
            return;
        }

        vm.deal(currentStakeholder, currentContribution);
        fundShare.subscribe{value: currentContribution}();

        ghost_contributedSum += currentContribution;
        _unsubscribers.remove(currentStakeholder);
        _subscribers.add(currentStakeholder);
    }

    function refund(uint256 stakeholderIdx) external useStakeholder(stakeholderIdx, true) {
        calls[this.refund.selector]++;

        if (currentStakeholder == address(0)) {
            skips[this.refund.selector]++;
            return;
        }

        fundShare.refund(currentStakeholder);

        ghost_refundedSum += currentContribution;
        _unsubscribers.add(currentStakeholder);
        _subscribers.remove(currentStakeholder);
    }

    function finalize(address finalizer) external {
        calls[this.finalize.selector]++;

        vm.prank(finalizer);
        fundShare.finalize();

        ghost_isFinalized = true;
    }

    function warp(uint256 secondsForward) external {
        secondsForward = bound(secondsForward, 1 hours, 1 days);
        vm.warp(block.timestamp + secondsForward);
    }

    function callSummary() external view {
        console.log("subscribe calls:", calls[this.subscribe.selector]);
        console.log("refund calls:", calls[this.refund.selector]);
        console.log("finalize calls:", calls[this.finalize.selector]);
        console.log("------------------------------------------------");
        console.log("subscribe skipped calls:", skips[this.subscribe.selector]);
        console.log("refund skipped calls:", skips[this.refund.selector]);
    }

    modifier useStakeholder(uint256 index, bool subscribed) {
        EnumerableSet.AddressSet storage set = subscribed ? _subscribers : _unsubscribers;
        uint256 setLength = set.length();
        if (setLength > 0) {
            index = bound(index, 0, set.length() - 1);
            currentStakeholder = set.pos(index);
            currentContribution = expectedContributions[currentStakeholder];
            vm.startPrank(currentStakeholder);
            _;
            vm.stopPrank();
        } else {
            currentStakeholder = address(0);
            currentContribution = 0;
            _;
        }
    }
}

contract FundShareInvariantTest is Test {
    uint256 constant MAX = 10;
    FundShare fundShare;
    FundShareHandler handler;

    function setUp() public {
        address fundTreasury = makeAddr("FundTreasury");
        uint48 deadline = uint48(block.timestamp + 4 weeks);
        address[] memory stakeholders = new address[](MAX);
        uint256[] memory contributions = new uint256[](MAX);
        for (uint256 i = 0; i < MAX; i++) {
            stakeholders[i] = makeAddr(string.concat("stakeholder", vm.toString(i)));
            contributions[i] = vm.randomUint(1, 100);
        }

        fundShare = new FundShare(fundTreasury, deadline, stakeholders, contributions);
        handler = new FundShareHandler(fundShare, stakeholders, contributions);

        targetContract(address(handler));
    }

    function invariant_TotalBalanceMatchesTotalReceived() public view {
        if (!fundShare.isFinalized()) {
            assertEq(address(fundShare).balance, fundShare.totalReceived());
        }
    }

    function invariant_TotalReceivedMatchesGhost() public view {
        assertEq(fundShare.totalReceived(), handler.ghost_contributedSum() - handler.ghost_refundedSum());
    }

    function invariant_TotalSupplyMatchesTotalReceived() public view {
        assertEq(fundShare.totalSupply(), fundShare.totalReceived());
    }

    function invariant_TotalReceivedIsLessOrEqualThanTotalExpected() public view {
        assertLe(fundShare.totalReceived(), fundShare.totalExpected());
    }

    function invariant_HasSubscribedMatchesHandlerSets() public view {
        address[] memory subscribers = handler.subscribers();
        for (uint256 i = 0; i < subscribers.length; i++) {
            assertTrue(fundShare.hasSubscribed(subscribers[i]));
        }
        address[] memory unsubscribers = handler.unsubscribers();
        for (uint256 i = 0; i < unsubscribers.length; i++) {
            assertFalse(fundShare.hasSubscribed(unsubscribers[i]));
        }
    }

    function invariant_CallSummary() public view {
        handler.callSummary();
    }
}
