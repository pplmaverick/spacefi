import { expect } from "chai";
import { ethers } from "hardhat";
import type { Signer } from "ethers";

const NODE_ID_1 = ethers.keccak256(ethers.toUtf8Bytes("spacefi-node-1"));
const NODE_ID_2 = ethers.keccak256(ethers.toUtf8Bytes("spacefi-node-2"));

describe("NodeRegistry", function () {
  let owner: Signer;
  let operator: Signer;
  let otherOperator: Signer;
  let ownerAddress: string;
  let operatorAddress: string;
  let otherOperatorAddress: string;

  let registry: any;

  beforeEach(async function () {
    [owner, operator, otherOperator] = await ethers.getSigners();
    ownerAddress = await owner.getAddress();
    operatorAddress = await operator.getAddress();
    otherOperatorAddress = await otherOperator.getAddress();

    const NodeRegistry = await ethers.getContractFactory("NodeRegistry");
    registry = await NodeRegistry.deploy(ownerAddress);
    await registry.waitForDeployment();
  });

  it("sets the owner on deployment", async function () {
    expect(await registry.owner()).to.equal(ownerAddress);
  });

  describe("approveNode", function () {
    it("lets the owner approve an (operator, nodeId) pair", async function () {
      await expect(registry.connect(owner).approveNode(operatorAddress, NODE_ID_1))
        .to.emit(registry, "NodeApproved")
        .withArgs(operatorAddress, NODE_ID_1);

      expect(await registry.approvedOperators(operatorAddress, NODE_ID_1)).to.equal(true);
    });

    it("reverts when called by a non-owner", async function () {
      await expect(
        registry.connect(operator).approveNode(operatorAddress, NODE_ID_1)
      ).to.be.revertedWithCustomError(registry, "OwnableUnauthorizedAccount");
    });
  });

  describe("registerNode — unapproved state", function () {
    it("reports isNodeRegistered as false before any registration", async function () {
      expect(await registry.isNodeRegistered(NODE_ID_1)).to.equal(false);
    });

    it("reports approvedOperators as false before approveNode is called", async function () {
      expect(await registry.approvedOperators(operatorAddress, NODE_ID_1)).to.equal(false);
    });

    it("reverts with 'Not approved' when registering without prior approval", async function () {
      await expect(registry.connect(operator).registerNode(NODE_ID_1)).to.be.revertedWith("Not approved");
    });

    it("reverts with ZeroNodeId for a zero nodeId, even if hypothetically approved", async function () {
      await expect(registry.connect(operator).registerNode(ethers.ZeroHash)).to.be.revertedWithCustomError(
        registry,
        "ZeroNodeId"
      );
    });
  });

  describe("registerNode — approved state", function () {
    beforeEach(async function () {
      await registry.connect(owner).approveNode(operatorAddress, NODE_ID_1);
    });

    it("registers the node and records the operator", async function () {
      await expect(registry.connect(operator).registerNode(NODE_ID_1))
        .to.emit(registry, "NodeRegistered")
        .withArgs(operatorAddress, NODE_ID_1);

      expect(await registry.nodeOperator(NODE_ID_1)).to.equal(operatorAddress);
      expect(await registry.isNodeRegistered(NODE_ID_1)).to.equal(true);
    });

    it("reverts if a different, unapproved operator tries to register the same nodeId", async function () {
      await expect(
        registry.connect(otherOperator).registerNode(NODE_ID_1)
      ).to.be.revertedWith("Not approved");
    });

    it("lets the same operator register multiple distinct approved nodeIds", async function () {
      await registry.connect(owner).approveNode(operatorAddress, NODE_ID_2);
      await registry.connect(operator).registerNode(NODE_ID_1);
      await registry.connect(operator).registerNode(NODE_ID_2);

      expect(await registry.nodeOperator(NODE_ID_1)).to.equal(operatorAddress);
      expect(await registry.nodeOperator(NODE_ID_2)).to.equal(operatorAddress);
    });

    // NOTE: NodeRegistry.sol's own NatSpec (see contracts/sepolia/NodeRegistry.sol) explicitly
    // states there is "no on-chain uniqueness constraint on nodeId or operator anymore — the
    // approval mapping is the only gate." So calling registerNode twice for the same nodeId does
    // NOT revert as long as the caller stays approved; it just re-emits NodeRegistered. This test
    // documents that actual (intentional) behavior rather than asserting a revert that the current
    // contract does not produce.
    it("does not revert on a repeated registerNode call for the same nodeId (no uniqueness guard)", async function () {
      await registry.connect(operator).registerNode(NODE_ID_1);
      await expect(registry.connect(operator).registerNode(NODE_ID_1))
        .to.emit(registry, "NodeRegistered")
        .withArgs(operatorAddress, NODE_ID_1);
      expect(await registry.nodeOperator(NODE_ID_1)).to.equal(operatorAddress);
    });
  });
});
