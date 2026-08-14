import * as fs from "fs";
import * as path from "path";

const DEPLOYMENT_PATH = path.join(__dirname, "..", "..", "deployment.json");

export interface SepoliaDeployment {
  chainId?: number;
  collateralVault?: string;
  nodeRegistry?: string;
}

export interface Cc3Deployment {
  chainId?: number;
  evmV1Decoder?: string;
  mockPayoutToken?: string;
  spaceFinance?: string;
  treasury?: string;
  loanAmount?: string;
}

export interface DeploymentData {
  sepolia?: SepoliaDeployment;
  cc3?: Cc3Deployment;
}

export function loadDeployment(): DeploymentData {
  if (!fs.existsSync(DEPLOYMENT_PATH)) return {};
  const raw = fs.readFileSync(DEPLOYMENT_PATH, "utf-8").trim();
  return raw ? (JSON.parse(raw) as DeploymentData) : {};
}

/**
 * Merges `data` into the given section (sepolia | cc3) of deployment.json, preserving whatever
 * is already recorded for the other section and for keys not present in `data`.
 */
export function saveDeployment<K extends keyof DeploymentData>(
  section: K,
  data: NonNullable<DeploymentData[K]>
): void {
  const existing = loadDeployment();
  existing[section] = { ...existing[section], ...data } as DeploymentData[K];
  fs.writeFileSync(DEPLOYMENT_PATH, JSON.stringify(existing, null, 2) + "\n");
  console.log(`\nSaved to ${DEPLOYMENT_PATH}`);
}
