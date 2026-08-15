// SPDX-License-Identifier: MIT
pragma solidity ^0.8.30;

import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";

/// @title GuildPool
/// @notice CC3-side social-collateral grouping for SpaceFinance borrowers: five owner-approved
/// members form a guild, and if any one member defaults the owner freezes the whole guild.
/// @dev Phase 1 skeleton: approval, joining, and freezing are all manual owner-gated steps.
/// Staggered disbursement, the 2-week observation window, and automatic default detection off
/// `spaceFinance` are Phase 2 (mainnet) work — `spaceFinance` is stored but not called yet.
contract GuildPool is Ownable, ReentrancyGuard {
    struct Guild {
        address[5] members;
        bool[5] approved;
        bool frozen;
        uint256 memberCount;
    }

    event GuildCreated(uint256 indexed guildId, address indexed creator);
    event MemberApproved(uint256 indexed guildId, address indexed member);
    event MemberJoined(uint256 indexed guildId, address indexed member);
    event GuildFrozen(uint256 indexed guildId, address indexed defaulter);

    mapping(uint256 => Guild) public guilds;
    mapping(address => uint256) public memberToGuildId;
    mapping(uint256 => mapping(address => bool)) public guildMemberApproved;
    uint256 public guildCounter;
    address public spaceFinance;

    constructor(address initialOwner, address spaceFinance_) Ownable(initialOwner) {
        spaceFinance = spaceFinance_;
        guildCounter = 1;
    }

    /// @notice Register a 5-member guild candidate list. Must be called by members[0].
    function createGuild(address[5] calldata members) external {
        require(msg.sender == members[0], "must be members[0]");

        for (uint256 i = 0; i < 5; i++) {
            require(members[i] != address(0), "zero address");
            require(memberToGuildId[members[i]] == 0, "member already in a guild");
            for (uint256 j = 0; j < 5; j++) {
                if (i != j) {
                    require(members[i] != members[j], "duplicate member");
                }
            }
        }

        uint256 guildId = guildCounter++;
        Guild storage guild = guilds[guildId];
        guild.members = members;
        guild.memberCount = 0;
        guild.frozen = false;

        emit GuildCreated(guildId, msg.sender);
    }

    /// @notice Owner approves one candidate member of a guild.
    function approveGuildMember(uint256 guildId, address member) external onlyOwner {
        Guild storage guild = guilds[guildId];

        bool found = false;
        for (uint256 i = 0; i < 5; i++) {
            if (guild.members[i] == member) {
                guild.approved[i] = true;
                found = true;
                break;
            }
        }
        require(found, "not a guild member");

        guildMemberApproved[guildId][member] = true;

        emit MemberApproved(guildId, member);
    }

    /// @notice Approved candidate joins the guild they were listed for.
    function joinGuild(uint256 guildId) external {
        require(memberToGuildId[msg.sender] == 0, "already in a guild");
        require(guildMemberApproved[guildId][msg.sender], "Not approved");

        Guild storage guild = guilds[guildId];

        bool isMember = false;
        for (uint256 i = 0; i < 5; i++) {
            if (guild.members[i] == msg.sender) {
                isMember = true;
                break;
            }
        }
        require(isMember, "not a guild member");
        require(!guild.frozen, "guild frozen");

        memberToGuildId[msg.sender] = guildId;
        guild.memberCount++;

        emit MemberJoined(guildId, msg.sender);
    }

    /// @notice Owner-gated freeze after confirming a member default. Phase 2: replace with
    /// automatic detection driven by `spaceFinance` loan status.
    function freezeGuild(uint256 guildId, address defaulter) external onlyOwner {
        Guild storage guild = guilds[guildId];
        require(!guild.frozen, "already frozen");
        require(_isMember(guildId, defaulter), "Defaulter not a guild member");

        guild.frozen = true;

        emit GuildFrozen(guildId, defaulter);
    }

    function _isMember(uint256 guildId, address addr) internal view returns (bool) {
        Guild storage guild = guilds[guildId];
        for (uint256 i = 0; i < 5; i++) {
            if (guild.members[i] == addr) return true;
        }
        return false;
    }

    function isGuildMember(address member) external view returns (bool) {
        return memberToGuildId[member] != 0;
    }

    function isGuildFrozen(address member) external view returns (bool) {
        return guilds[memberToGuildId[member]].frozen;
    }

    function getGuild(uint256 guildId) external view returns (Guild memory) {
        return guilds[guildId];
    }
}
