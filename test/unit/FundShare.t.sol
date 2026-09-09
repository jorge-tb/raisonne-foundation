// SPDX-License-Identifier: MIT
pragma solidity 0.8.36;

import {Test} from "forge-std/Test.sol";
import {console} from "forge-std/console.sol";
import {FundShare} from "../../src/FundShare.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {ERC20Permit} from "@openzeppelin/contracts/token/ERC20/extensions/ERC20Permit.sol";

contract FundShareTest is Test {
    FundShare fundShare;
    address fundTreasury;
    uint48 deadline;
    address[] stakeholders;
    uint256[] privateKeys;
    uint256[] contributions;

    function setUp() public {
        fundTreasury = makeAddr("FundTreasury");
        deadline = uint48(block.timestamp + 1 weeks);
        for (uint256 i = 0; i < 10; i++) {
            string memory stakeholderName = string.concat("stakeholder", vm.toString(i));
            (address addr, uint256 privKey) = makeAddrAndKey(stakeholderName);
            stakeholders.push(addr);
            privateKeys.push(privKey);
            contributions.push(vm.randomUint(1, 100));
        }
        fundShare = new FundShare(fundTreasury, deadline, stakeholders, contributions);
    }

    function test_Constructor_SetsFundTreasury() public view {
        assertEq(fundShare.fundTreasury(), fundTreasury);
    }

    function test_Constructor_SetsDeadline() public view {
        assertEq(fundShare.deadline(), deadline);
    }

    function test_Constructor_SetsExpectedContributions() public view {
        for (uint256 i = 0; i < stakeholders.length; i++) {
            assertEq(fundShare.expectedContributions(stakeholders[i]), contributions[i]);
        }
    }

    function test_Constructor_SetsTotalExpected() public view {
        uint256 totalExpected;
        for (uint256 i = 0; i < contributions.length; i++) {
            totalExpected += contributions[i];
        }
        assertEq(fundShare.totalExpected(), totalExpected);
    }

    function test_Constructor_NoOneIsSubscribed() public view {
        for (uint256 i = 0; i < stakeholders.length; i++) {
            vm.assertFalse(fundShare.hasSubscribed(stakeholders[i]));
        }
    }

    function test_Constructor_ZeroReceived() public view {
        assertEq(fundShare.totalReceived(), 0);
    }

    function test_RevertWhen_InvalidFundTreasury() public {
        vm.expectRevert(abi.encodeWithSelector(FundShare.InvalidFundTreasury.selector));
        new FundShare(address(0), deadline, stakeholders, contributions);
    }

    function test_RevertWhen_InvalidDeadline() public {
        vm.warp(2 weeks);
        vm.expectRevert(abi.encodeWithSelector(FundShare.InvalidDeadline.selector));
        new FundShare(fundTreasury, uint48(block.timestamp - 1 weeks), stakeholders, contributions);
    }

    function test_RevertWhen_LengthMismatch() public {
        contributions.pop();
        vm.expectRevert(
            abi.encodeWithSelector(FundShare.LengthMismatch.selector, stakeholders.length, contributions.length)
        );
        new FundShare(fundTreasury, deadline, stakeholders, contributions);
    }

    function test_RevertWhen_ZeroStakeholders() public {
        address[] memory emptyArray;
        vm.expectRevert(abi.encodeWithSelector(FundShare.ZeroStakeholders.selector));
        new FundShare(fundTreasury, deadline, emptyArray, contributions);
    }

    function testFuzz_RevertWhen_ZeroContribution(uint256 index) public {
        index = bound(index, 0, contributions.length - 1);
        contributions[index] = 0;
        vm.expectRevert(abi.encodeWithSelector(FundShare.ZeroContribution.selector, index));
        new FundShare(fundTreasury, deadline, stakeholders, contributions);
    }

    function testFuzz_RevertWhen_ZeroAddressStakeholder(uint256 index) public {
        index = bound(index, 0, stakeholders.length - 1);
        stakeholders[index] = address(0);
        vm.expectRevert(abi.encodeWithSelector(FundShare.ZeroAddressStakeholder.selector, index));
        new FundShare(fundTreasury, deadline, stakeholders, contributions);
    }

    function testFuzz_RevertWhen_DuplicatedStakeholder(uint256 indexA, uint256 indexB) public {
        indexA = bound(indexA, 0, stakeholders.length - 1);
        indexB = bound(indexB, 0, stakeholders.length - 1);
        vm.assume(indexA != indexB);
        stakeholders[indexB] = stakeholders[indexA];
        vm.expectRevert(abi.encodeWithSelector(FundShare.DuplicatedStakeholder.selector, stakeholders[indexA]));
        new FundShare(fundTreasury, deadline, stakeholders, contributions);
    }

    function test_Subscribe_MintsSharesWithoutVotingPower() public {
        address stakeholder = stakeholders[0];
        uint256 contribution = contributions[0];

        vm.expectEmit(true, true, true, true);
        emit FundShare.Subscribed(stakeholder, contribution);

        vm.deal(stakeholder, contribution);
        vm.prank(stakeholder);
        fundShare.subscribe{value: contribution}();

        vm.assertTrue(fundShare.hasSubscribed(stakeholder));
        assertEq(fundShare.totalReceived(), contribution);
        assertEq(fundShare.balanceOf(stakeholder), contribution);
        assertEq(fundShare.getVotes(stakeholder), 0);
    }

    function test_RevertWhen_SubscribeFromNotStakeholder() public {
        vm.expectRevert(abi.encodeWithSelector(FundShare.NotAStakeholder.selector, address(this)));
        fundShare.subscribe();
    }

    function test_RevertWhen_SubscribeAndRoundIsNotOpen() public {
        address stakeholder = stakeholders[0];
        uint256 contribution = contributions[0];

        vm.expectRevert(
            abi.encodeWithSelector(
                FundShare.InvalidRoundState.selector, FundShare.RoundState.EXPIRED, FundShare.RoundState.OPEN
            )
        );
        vm.warp(deadline + 1 days);
        vm.deal(stakeholder, contribution);
        vm.prank(stakeholder);
        fundShare.subscribe{value: contribution}();
    }

    function test_RevertWhen_SubscribeWithAlreadySubscribed() public {
        address stakeholder = stakeholders[0];
        uint256 contribution = contributions[0];

        vm.deal(stakeholder, contribution * 2);
        vm.startPrank(stakeholder);
        fundShare.subscribe{value: contribution}();

        vm.expectRevert(abi.encodeWithSelector(FundShare.AlreadySubscribed.selector));
        fundShare.subscribe{value: contribution}();
        vm.stopPrank();
    }

    function test_RevertWhen_SubscribeWithWrongContribution(uint256 wrongContribution) public {
        address stakeholder = stakeholders[0];
        uint256 contribution = contributions[0];
        wrongContribution = bound(wrongContribution, 0, contribution * 2);

        vm.assume(contribution != wrongContribution);
        vm.expectRevert(abi.encodeWithSelector(FundShare.WrongContribution.selector, wrongContribution, contribution));
        vm.deal(stakeholder, wrongContribution);
        vm.prank(stakeholder);
        fundShare.subscribe{value: wrongContribution}();
    }

    function test_Delegate_GrantsVotingPowerEqualToContribution() public {
        (address subscriber, uint256 contribution) = _subscribeStakeholder(0);

        vm.prank(subscriber);
        fundShare.delegate(subscriber);

        assertEq(fundShare.balanceOf(subscriber), contribution);
        assertEq(fundShare.getVotes(subscriber), contribution);
    }

    function test_Transfer_MovesVotingPowerBetweenDelegatesWithRoundCompleted() public {
        _subscribeAll();
        (address subscriber1, uint256 contribution1) = (stakeholders[0], contributions[0]);
        (address subscriber2, uint256 contribution2) = (stakeholders[1], contributions[1]);

        vm.prank(subscriber1);
        fundShare.delegate(subscriber1);

        vm.prank(subscriber2);
        fundShare.delegate(subscriber2);

        vm.prank(subscriber1);
        fundShare.transfer(subscriber2, contribution1);

        assertEq(fundShare.getVotes(subscriber1), 0);
        assertEq(fundShare.getVotes(subscriber2), contribution1 + contribution2);
    }

    function test_RevertWhen_TransferWithRoundNotCompleted() public {
        (address subscriber1, uint256 contribution1) = _subscribeStakeholder(0);
        (address subscriber2,) = _subscribeStakeholder(1);

        vm.prank(subscriber1);
        fundShare.delegate(subscriber1);

        vm.prank(subscriber2);
        fundShare.delegate(subscriber2);

        vm.expectRevert(abi.encodeWithSelector(FundShare.TransferLockedDuringRound.selector, FundShare.RoundState.OPEN));
        vm.prank(subscriber1);
        fundShare.transfer(subscriber2, contribution1);
    }

    function test_GetPastVotes_ReturnsZeroBeforeDelegation() public {
        (address subscriber, uint256 contribution) = _subscribeStakeholder(0);
        uint256 delegationTimestamp = block.timestamp + 1 days;

        vm.warp(delegationTimestamp);
        vm.prank(subscriber);
        fundShare.delegate(subscriber);

        vm.warp(delegationTimestamp + 1 days);
        assertEq(fundShare.getPastVotes(subscriber, delegationTimestamp - 1), 0);
        assertEq(fundShare.getPastVotes(subscriber, delegationTimestamp), contribution);
        assertEq(fundShare.getVotes(subscriber), contribution);
    }

    function test_Permit_SetsAllowance() public {
        (address stakeholder, uint256 contribution) = _subscribeStakeholder(0);
        address spender = makeAddr("spender");
        uint256 permitDeadline = block.timestamp + 1 days;
        uint256 nonces = fundShare.nonces(stakeholder);
        (uint8 v, bytes32 r, bytes32 s) = _signPermitStakeholder(0, spender, contribution, nonces, permitDeadline);

        vm.expectEmit(true, true, true, true);
        emit IERC20.Approval(stakeholder, spender, contribution);

        fundShare.permit(stakeholder, spender, contribution, permitDeadline, v, r, s);

        assertEq(fundShare.allowance(stakeholder, spender), contribution);
        assertEq(fundShare.nonces(stakeholder), nonces + 1);
    }

    function test_RevertWhen_PermitSignatureReplayed() public {
        (address stakeholder, uint256 contribution) = _subscribeStakeholder(0);
        address spender = makeAddr("spender");
        uint256 permitDeadline = block.timestamp + 1 days;
        uint256 nonces = fundShare.nonces(stakeholder);
        (uint8 v, bytes32 r, bytes32 s) = _signPermitStakeholder(0, spender, contribution, nonces, permitDeadline);

        fundShare.permit(stakeholder, spender, contribution, permitDeadline, v, r, s);

        vm.expectPartialRevert(ERC20Permit.ERC2612InvalidSigner.selector);
        fundShare.permit(stakeholder, spender, contribution, permitDeadline, v, r, s);
    }

    function test_RevertWhen_PermitDeadlineExpired() public {
        (address stakeholder, uint256 contribution) = _subscribeStakeholder(0);
        address spender = makeAddr("spender");
        uint256 permitDeadline = block.timestamp + 1 days;
        uint256 nonces = fundShare.nonces(stakeholder);
        (uint8 v, bytes32 r, bytes32 s) = _signPermitStakeholder(0, spender, contribution, nonces, permitDeadline);

        vm.warp(block.timestamp + 2 days);
        vm.expectRevert(abi.encodeWithSelector(ERC20Permit.ERC2612ExpiredSignature.selector, permitDeadline));
        fundShare.permit(stakeholder, spender, contribution, permitDeadline, v, r, s);
    }

    function test_RevertWhen_PermitSignedByWrongAccount() public {
        (address stakeholderA, uint256 contributionA) = _subscribeStakeholder(0);
        (address stakeholderB,) = _subscribeStakeholder(1);
        uint256 privateKeyB = privateKeys[1];
        address spender = makeAddr("spender");
        uint256 permitDeadline = block.timestamp + 1 days;
        uint256 noncesA = fundShare.nonces(stakeholderA);
        (uint8 v, bytes32 r, bytes32 s) =
            _signPermit(stakeholderA, privateKeyB, spender, contributionA, noncesA, permitDeadline);

        vm.expectRevert(abi.encodeWithSelector(ERC20Permit.ERC2612InvalidSigner.selector, stakeholderB, stakeholderA));
        fundShare.permit(stakeholderA, spender, contributionA, permitDeadline, v, r, s);
    }

    function test_Nonces_SharedBetweenPermitAndDelegateBySig() public {
        (address stakeholder, uint256 contribution) = _subscribeStakeholder(0);
        uint256 privateKey = privateKeys[0];
        address spender = makeAddr("spender");
        uint256 futureDate = block.timestamp + 1 days;
        uint256 nonces = fundShare.nonces(stakeholder);
        (uint8 v, bytes32 r, bytes32 s) = _signPermitStakeholder(0, spender, contribution, nonces, futureDate);

        fundShare.permit(stakeholder, spender, contribution, futureDate, v, r, s);

        vm.assertEq(fundShare.nonces(stakeholder), nonces + 1);

        nonces = fundShare.nonces(stakeholder);
        address delegatee = makeAddr("delegatee");
        (v, r, s) = _signDelegate(privateKey, delegatee, nonces, futureDate);
        fundShare.delegateBySig(delegatee, nonces, futureDate, v, r, s);

        vm.assertEq(fundShare.nonces(stakeholder), nonces + 1);
    }

    function test_Refund_ReturnsContribution() public {
        (address subscriber, uint256 contribution) = _subscribeStakeholder(0);
        address recipient = makeAddr("to");

        uint256 recipientPrevBalance = recipient.balance;
        uint256 fundSharePrevBalance = address(fundShare).balance;
        uint256 prevTotalReceived = fundShare.totalReceived();

        vm.expectEmit(true, true, true, true);
        emit FundShare.Refunded(subscriber, recipient, contribution);

        vm.warp(deadline + 1 days);
        vm.prank(subscriber);
        fundShare.refund(recipient);

        assertEq(address(fundShare).balance, fundSharePrevBalance - contribution, "FundShare balance");
        assertEq(recipient.balance, recipientPrevBalance + contribution, "recipient balance");
        assertEq(fundShare.totalReceived(), prevTotalReceived - contribution);
    }

    function test_Refund_BurnsVotingPower() public {
        (address subscriber, uint256 contribution) = _subscribeStakeholder(0);
        address delegatee = makeAddr("delegatee");
        address recipient = makeAddr("to");

        vm.warp(deadline + 1 days);
        vm.startPrank(subscriber);
        fundShare.delegate(delegatee);

        uint256 votesBefore = fundShare.getVotes(delegatee);
        uint256 balanceBefore = fundShare.balanceOf(subscriber);

        fundShare.refund(recipient);
        vm.stopPrank();

        uint256 votesAfter = fundShare.getVotes(delegatee);
        uint256 balanceAfter = fundShare.balanceOf(subscriber);

        assertEq(votesBefore, contribution);
        assertEq(votesAfter, 0);
        assertEq(balanceBefore, contribution);
        assertEq(balanceAfter, 0);
    }

    function test_RevertWhen_RefundFromNotStakeholder() public {
        vm.expectRevert(abi.encodeWithSelector(FundShare.NotAStakeholder.selector, address(this)));
        fundShare.refund(makeAddr("to"));
    }

    function test_RevertWhen_RefundZeroAddressRecipient() public {
        (address subscriber,) = _subscribeStakeholder(0);
        address recipient = address(0);

        vm.expectRevert(abi.encodeWithSelector(FundShare.ZeroAddressRecipient.selector));
        vm.prank(subscriber);
        fundShare.refund(recipient);
    }

    function test_RevertWhen_RefundAndRoundIsNotExpired() public {
        (address subscriber,) = _subscribeStakeholder(0);
        address recipient = makeAddr("to");

        vm.expectRevert(
            abi.encodeWithSelector(
                FundShare.InvalidRoundState.selector, FundShare.RoundState.OPEN, FundShare.RoundState.EXPIRED
            )
        );
        vm.prank(subscriber);
        fundShare.refund(recipient);
    }

    function test_RevertWhen_RefundNotSubscribedStakeholder() public {
        address stakeholder = stakeholders[0];
        address recipient = makeAddr("to");

        vm.expectRevert(abi.encodeWithSelector(FundShare.StakeholderNotSubscribed.selector));
        vm.warp(deadline + 1 days);
        vm.prank(stakeholder);
        fundShare.refund(recipient);
    }

    function test_RevertWhen_RefundTransferFails() public {
        (address subscriber,) = _subscribeStakeholder(0);
        address recipient = address(new RejectingReceiver());

        vm.expectRevert(abi.encodeWithSelector(FundShare.RefundTransferFailed.selector, subscriber, recipient));
        vm.warp(deadline + 1 days);
        vm.prank(subscriber);
        fundShare.refund(recipient);
    }

    function test_Finalize_TransferFundsToTreasury() public {
        _subscribeAll();

        vm.expectEmit(true, true, true, true);
        emit FundShare.RoundFinalized(address(this));

        fundShare.finalize();

        assertEq(address(fundShare).balance, 0);
        assertEq(fundTreasury.balance, fundShare.totalExpected());
        assertTrue(fundShare.isFinalized());
    }

    function test_RevertWhen_FinalizeAndRoundIsNotCompleted() public {
        vm.expectRevert(
            abi.encodeWithSelector(
                FundShare.InvalidRoundState.selector, FundShare.RoundState.OPEN, FundShare.RoundState.COMPLETED
            )
        );
        fundShare.finalize();
    }

    function test_RevertWhen_FinalizeAndRoundIsAlreadyFinalized() public {
        _subscribeAll();

        fundShare.finalize();

        vm.expectRevert(abi.encodeWithSelector(FundShare.RoundAlreadyFinalized.selector));
        fundShare.finalize();
    }

    function test_RevertWhen_FinalizeTreasuryTransferFails() public {
        address rejectingTreasury = address(new RejectingReceiver());
        fundShare = new FundShare(rejectingTreasury, deadline, stakeholders, contributions);

        _subscribeAll();

        vm.expectRevert(abi.encodeWithSelector(FundShare.TreasuryTransferFailed.selector));
        fundShare.finalize();
    }

    function _subscribeAll() private {
        for (uint256 i = 0; i < stakeholders.length; i++) {
            _subscribeStakeholder(i);
        }
    }

    function _subscribeStakeholder(uint256 index) private returns (address, uint256) {
        address stakeholder = stakeholders[index];
        uint256 contribution = contributions[index];
        vm.deal(stakeholder, contribution);
        vm.prank(stakeholder);
        fundShare.subscribe{value: contribution}();
        return (stakeholder, contribution);
    }

    function _signPermitStakeholder(uint256 index, address spender, uint256 amount, uint256 nonces, uint256 _deadline)
        private
        view
        returns (uint8 v, bytes32 r, bytes32 s)
    {
        address stakeholder = stakeholders[index];
        uint256 privateKey = privateKeys[index];

        return _signPermit(stakeholder, privateKey, spender, amount, nonces, _deadline);
    }

    function _signPermit(
        address owner,
        uint256 privateKey,
        address spender,
        uint256 amount,
        uint256 nonces,
        uint256 _deadline
    ) private view returns (uint8 v, bytes32 r, bytes32 s) {
        bytes32 typeHash = keccak256(
            "Permit(address owner,address spender,uint256 value,uint256 nonce,uint256 deadline)"
        );
        bytes memory encodedRequest = abi.encode(typeHash, owner, spender, amount, nonces, _deadline);
        bytes32 requestHash = keccak256(encodedRequest);
        bytes32 domainSeparator = fundShare.DOMAIN_SEPARATOR();
        bytes32 digest = keccak256(abi.encodePacked("\x19\x01", domainSeparator, requestHash));
        return vm.sign(privateKey, digest);
    }

    function _signDelegate(uint256 privateKey, address delegatee, uint256 nonce, uint256 expiry)
        private
        view
        returns (uint8 v, bytes32 r, bytes32 s)
    {
        bytes32 typeHash = keccak256("Delegation(address delegatee,uint256 nonce,uint256 expiry)");
        bytes memory encodedRequest = abi.encode(typeHash, delegatee, nonce, expiry);
        bytes32 requestHash = keccak256(encodedRequest);
        bytes32 domainSeparator = fundShare.DOMAIN_SEPARATOR();
        bytes32 digest = keccak256(abi.encodePacked("\x19\x01", domainSeparator, requestHash));
        return vm.sign(privateKey, digest);
    }
}

contract RejectingReceiver {
    receive() external payable {
        revert();
    }
}
