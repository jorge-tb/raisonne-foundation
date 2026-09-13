// SPDX-License-Identifier: MIT
pragma solidity 0.8.36;

import {ERC20} from "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import {ERC20Votes} from "@openzeppelin/contracts/token/ERC20/extensions/ERC20Votes.sol";
import {ERC20Permit} from "@openzeppelin/contracts/token/ERC20/extensions/ERC20Permit.sol";
import {Votes} from "@openzeppelin/contracts/governance/utils/Votes.sol";
import {Time} from "@openzeppelin/contracts/utils/types/Time.sol";
import {ERC6372Utils} from "@openzeppelin/contracts/utils/ERC6372Utils.sol";
import {Nonces} from "@openzeppelin/contracts/utils/Nonces.sol";

contract FundShare is ERC20, ERC20Permit, ERC20Votes {
    error InvalidFundTreasury();
    error InvalidDeadline();
    error ZeroStakeholders();
    error DuplicatedStakeholder(address stakeholder);
    error LengthMismatch(uint256 stakeholdersLength, uint256 contributionsLength);
    error ZeroContribution(uint256 index);
    error ZeroAddressStakeholder(uint256 index);
    error NotAStakeholder(address caller);
    error AlreadySubscribed();
    error WrongContribution(uint256 sent, uint256 expected);
    error InvalidRoundState(RoundState actual, RoundState expected);
    error RoundAlreadyFinalized();
    error StakeholderNotSubscribed();
    error RefundTransferFailed(address stakeholder, address recipient);
    error TreasuryTransferFailed();
    error ZeroAddressRecipient();
    error TransferLockedDuringRound(RoundState state);

    event Subscribed(address indexed stakeholder, uint256 contribution);
    event Refunded(address indexed stakeholder, address indexed recipient, uint256 contribution);
    event RoundFinalized(address indexed finalizer);

    address public immutable treasury;
    uint48 public immutable deadline;
    mapping(address stakeholder => uint256 contribution) public expectedContributions;
    mapping(address stakeholder => bool isSubscribed) public hasSubscribed;
    uint256 public totalExpected;
    uint256 public totalReceived;
    bool public isFinalized;

    enum RoundState {
        OPEN,
        EXPIRED,
        COMPLETED
    }

    constructor(address _treasury, uint48 _deadline, address[] memory stakeholders, uint256[] memory contributions)
        ERC20("FundShare", "FS")
        ERC20Permit("FundShare")
    {
        require(_treasury != address(0), InvalidFundTreasury());
        require(_deadline > block.timestamp, InvalidDeadline());
        require(stakeholders.length > 0, ZeroStakeholders());
        require(stakeholders.length == contributions.length, LengthMismatch(stakeholders.length, contributions.length));

        for (uint256 i = 0; i < stakeholders.length;) {
            require(contributions[i] > 0, ZeroContribution(i));
            require(stakeholders[i] != address(0), ZeroAddressStakeholder(i));
            require(expectedContributions[stakeholders[i]] == 0, DuplicatedStakeholder(stakeholders[i]));

            expectedContributions[stakeholders[i]] = contributions[i];
            totalExpected += contributions[i];

            unchecked {
                ++i;
            }
        }

        deadline = _deadline;
        treasury = _treasury;
    }

    function subscribe() external payable onlyStakeholders {
        RoundState currentState = roundState();
        require(currentState == RoundState.OPEN, InvalidRoundState(currentState, RoundState.OPEN));
        require(!hasSubscribed[msg.sender], AlreadySubscribed());
        require(
            expectedContributions[msg.sender] == msg.value,
            WrongContribution(msg.value, expectedContributions[msg.sender])
        );

        hasSubscribed[msg.sender] = true;
        totalReceived += msg.value;
        _mint(msg.sender, msg.value);

        emit Subscribed(msg.sender, msg.value);
    }

    function refund(address to) external onlyStakeholders {
        RoundState currentState = roundState();
        require(to != address(0), ZeroAddressRecipient());
        require(currentState == RoundState.EXPIRED, InvalidRoundState(currentState, RoundState.EXPIRED));
        require(hasSubscribed[msg.sender], StakeholderNotSubscribed());

        uint256 contribution = expectedContributions[msg.sender];
        hasSubscribed[msg.sender] = false;
        totalReceived -= contribution;
        _burn(msg.sender, contribution);

        (bool succ,) = to.call{value: contribution}("");
        require(succ, RefundTransferFailed(msg.sender, to));

        emit Refunded(msg.sender, to, contribution);
    }

    function finalize() external {
        RoundState currentState = roundState();
        require(currentState == RoundState.COMPLETED, InvalidRoundState(currentState, RoundState.COMPLETED));
        require(!isFinalized, RoundAlreadyFinalized());

        isFinalized = true;

        (bool succ,) = treasury.call{value: totalReceived}("");
        require(succ, TreasuryTransferFailed());

        emit RoundFinalized(msg.sender);
    }

    function _update(address from, address to, uint256 value) internal override(ERC20, ERC20Votes) {
        if (from != address(0) && to != address(0)) {
            // Note: refund() requires that the subscriber hold shares equal to their contribution,
            // so allowing transfers would prevent stakeholders from recovering their funds.
            RoundState state = roundState();
            require(state == RoundState.COMPLETED, TransferLockedDuringRound(state));
        }
        super._update(from, to, value);
    }

    function nonces(address owner) public view override(Nonces, ERC20Permit) returns (uint256) {
        return super.nonces(owner);
    }

    function clock() public view override(Votes) returns (uint48) {
        return Time.timestamp();
    }

    function CLOCK_MODE() public view override(Votes) returns (string memory) {
        return ERC6372Utils.timestampClockMode(clock);
    }

    function roundState() public view returns (RoundState state) {
        if (totalExpected == totalReceived) {
            return RoundState.COMPLETED;
        } else if (block.timestamp <= deadline) {
            return RoundState.OPEN;
        } else {
            return RoundState.EXPIRED;
        }
    }

    modifier onlyStakeholders() {
        require(expectedContributions[msg.sender] > 0, NotAStakeholder(msg.sender));
        _;
    }
}
