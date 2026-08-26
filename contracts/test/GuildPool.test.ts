import { expect } from "chai";
import { ethers } from "hardhat";
import type { Signer } from "ethers";

describe("GuildPool", function () {
  let owner: Signer;
  let spaceFinancePlaceholder: Signer;
  let members: Signer[]; // 5 candidate members, members[0] creates the guild
  let memberAddresses: string[];
  let outsider: Signer;
  let outsiderAddress: string;
  let ownerAddress: string;

  let guildPool: any;

  beforeEach(async function () {
    const signers = await ethers.getSigners();
    [owner, spaceFinancePlaceholder, ...members] = signers;
    members = members.slice(0, 5);
    memberAddresses = await Promise.all(members.map((m) => m.getAddress()));
    outsider = signers[7];
    outsiderAddress = await outsider.getAddress();
    ownerAddress = await owner.getAddress();

    const GuildPool = await ethers.getContractFactory("GuildPool");
    guildPool = await GuildPool.deploy(ownerAddress, await spaceFinancePlaceholder.getAddress());
    await guildPool.waitForDeployment();
  });

  describe("deployment", function () {
    it("sets the owner, spaceFinance address, and starting guildCounter", async function () {
      expect(await guildPool.owner()).to.equal(ownerAddress);
      expect(await guildPool.spaceFinance()).to.equal(await spaceFinancePlaceholder.getAddress());
      expect(await guildPool.guildCounter()).to.equal(1n);
    });
  });

  describe("createGuild", function () {
    it("creates a guild when called by members[0] and emits GuildCreated", async function () {
      await expect(guildPool.connect(members[0]).createGuild(memberAddresses))
        .to.emit(guildPool, "GuildCreated")
        .withArgs(1n, memberAddresses[0]);

      const guild = await guildPool.getGuild(1n);
      expect(guild.members).to.deep.equal(memberAddresses);
      expect(guild.memberCount).to.equal(0n);
      expect(guild.frozen).to.equal(false);
      expect(await guildPool.guildCounter()).to.equal(2n);
    });

    it("reverts when called by an address other than members[0]", async function () {
      await expect(guildPool.connect(members[1]).createGuild(memberAddresses)).to.be.revertedWith(
        "must be members[0]"
      );
    });

    it("reverts when a member address is the zero address", async function () {
      const withZero = [...memberAddresses];
      withZero[4] = ethers.ZeroAddress;
      await expect(guildPool.connect(members[0]).createGuild(withZero)).to.be.revertedWith("zero address");
    });

    it("reverts when the same address appears twice in the candidate list", async function () {
      const withDuplicate = [...memberAddresses];
      withDuplicate[4] = memberAddresses[1];
      await expect(guildPool.connect(members[0]).createGuild(withDuplicate)).to.be.revertedWith(
        "duplicate member"
      );
    });

    it("reverts when a candidate already belongs to an existing guild", async function () {
      // memberToGuildId is only set once a candidate actually joins (not merely listed at
      // createGuild time), so drive members[0] through approve + joinGuild first.
      await guildPool.connect(members[0]).createGuild(memberAddresses);
      await guildPool.connect(owner).approveGuildMember(1n, memberAddresses[0]);
      await guildPool.connect(members[0]).joinGuild(1n);

      const signers = await ethers.getSigners();
      const otherFive = [memberAddresses[0], await signers[10].getAddress(), await signers[11].getAddress(), await signers[12].getAddress(), await signers[13].getAddress()];

      await expect(guildPool.connect(members[0]).createGuild(otherFive)).to.be.revertedWith(
        "member already in a guild"
      );
    });
  });

  describe("approveGuildMember", function () {
    beforeEach(async function () {
      await guildPool.connect(members[0]).createGuild(memberAddresses);
    });

    it("lets the owner approve a candidate member", async function () {
      await expect(guildPool.connect(owner).approveGuildMember(1n, memberAddresses[1]))
        .to.emit(guildPool, "MemberApproved")
        .withArgs(1n, memberAddresses[1]);
      expect(await guildPool.guildMemberApproved(1n, memberAddresses[1])).to.equal(true);
    });

    it("reverts when approving an address that is not a candidate of the guild", async function () {
      await expect(guildPool.connect(owner).approveGuildMember(1n, outsiderAddress)).to.be.revertedWith(
        "not a guild member"
      );
    });

    it("reverts when called by a non-owner", async function () {
      await expect(
        guildPool.connect(outsider).approveGuildMember(1n, memberAddresses[1])
      ).to.be.revertedWithCustomError(guildPool, "OwnableUnauthorizedAccount");
    });
  });

  describe("joinGuild", function () {
    beforeEach(async function () {
      await guildPool.connect(members[0]).createGuild(memberAddresses);
    });

    it("lets an approved candidate join and increments memberCount", async function () {
      await guildPool.connect(owner).approveGuildMember(1n, memberAddresses[1]);

      await expect(guildPool.connect(members[1]).joinGuild(1n))
        .to.emit(guildPool, "MemberJoined")
        .withArgs(1n, memberAddresses[1]);

      expect(await guildPool.memberToGuildId(memberAddresses[1])).to.equal(1n);
      const guild = await guildPool.getGuild(1n);
      expect(guild.memberCount).to.equal(1n);
    });

    it("reverts without prior approval", async function () {
      await expect(guildPool.connect(members[1]).joinGuild(1n)).to.be.revertedWith("Not approved");
    });

    it("reverts when the caller already belongs to a guild", async function () {
      await guildPool.connect(owner).approveGuildMember(1n, memberAddresses[1]);
      await guildPool.connect(members[1]).joinGuild(1n);

      await expect(guildPool.connect(members[1]).joinGuild(1n)).to.be.revertedWith("already in a guild");
    });

    it("reverts when the guild is frozen", async function () {
      await guildPool.connect(owner).approveGuildMember(1n, memberAddresses[1]);
      await guildPool.connect(owner).freezeGuild(1n, memberAddresses[0]);

      await expect(guildPool.connect(members[1]).joinGuild(1n)).to.be.revertedWith("guild frozen");
    });

    it("caps membership at 5: a 6th, never-approved address cannot join", async function () {
      for (const m of members) {
        await guildPool.connect(owner).approveGuildMember(1n, await m.getAddress());
        await guildPool.connect(m).joinGuild(1n);
      }
      const guild = await guildPool.getGuild(1n);
      expect(guild.memberCount).to.equal(5n);

      // Structurally, only the original 5 members can ever be approved for this guild (see
      // approveGuildMember's "not a guild member" guard), so a 6th address can never obtain
      // approval and joinGuild always rejects it.
      await expect(guildPool.connect(outsider).joinGuild(1n)).to.be.revertedWith("Not approved");
    });
  });

  describe("freezeGuild", function () {
    beforeEach(async function () {
      await guildPool.connect(members[0]).createGuild(memberAddresses);
    });

    it("lets the owner freeze a guild after a member default", async function () {
      await expect(guildPool.connect(owner).freezeGuild(1n, memberAddresses[2]))
        .to.emit(guildPool, "GuildFrozen")
        .withArgs(1n, memberAddresses[2]);

      const guild = await guildPool.getGuild(1n);
      expect(guild.frozen).to.equal(true);
    });

    it("reverts when called by a non-owner", async function () {
      await expect(
        guildPool.connect(outsider).freezeGuild(1n, memberAddresses[2])
      ).to.be.revertedWithCustomError(guildPool, "OwnableUnauthorizedAccount");
    });

    it("reverts when the guild is already frozen", async function () {
      await guildPool.connect(owner).freezeGuild(1n, memberAddresses[2]);
      await expect(guildPool.connect(owner).freezeGuild(1n, memberAddresses[2])).to.be.revertedWith(
        "already frozen"
      );
    });

    it("reverts when the defaulter is not a member of the guild", async function () {
      await expect(guildPool.connect(owner).freezeGuild(1n, outsiderAddress)).to.be.revertedWith(
        "Defaulter not a guild member"
      );
    });
  });

  describe("view helpers", function () {
    it("isGuildMember and isGuildFrozen reflect guild state", async function () {
      await guildPool.connect(members[0]).createGuild(memberAddresses);
      await guildPool.connect(owner).approveGuildMember(1n, memberAddresses[1]);
      await guildPool.connect(members[1]).joinGuild(1n);

      expect(await guildPool.isGuildMember(memberAddresses[1])).to.equal(true);
      expect(await guildPool.isGuildMember(outsiderAddress)).to.equal(false);
      expect(await guildPool.isGuildFrozen(memberAddresses[1])).to.equal(false);

      await guildPool.connect(owner).freezeGuild(1n, memberAddresses[0]);
      expect(await guildPool.isGuildFrozen(memberAddresses[1])).to.equal(true);
    });
  });
});
