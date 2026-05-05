/** OPG token Permit2 approval utilities for x402 payments. */

import {
  createPublicClient,
  createWalletClient,
  http,
  getAddress,
  type Account,
  type Address,
  type Hex,
  type PublicClient,
  type WalletClient,
} from "viem";
import { PERMIT2_ADDRESS } from "@x402/evm";

export const BASE_OPG_ADDRESS: Address = getAddress(
  "0xFbC2051AE2265686a469421b2C5A2D5462FbF5eB",
);
export const BASE_MAINNET_RPC =
  process.env.BASE_MAINNET_RPC ?? "https://base-rpc.publicnode.com";

const APPROVAL_TX_TIMEOUT_MS = 120_000;
const ALLOWANCE_CONFIRMATION_TIMEOUT_MS = 120_000;
const ALLOWANCE_POLL_INTERVAL_MS = 1_000;

const ERC20_ABI = [
  {
    inputs: [
      { name: "owner", type: "address" },
      { name: "spender", type: "address" },
    ],
    name: "allowance",
    outputs: [{ name: "", type: "uint256" }],
    stateMutability: "view",
    type: "function",
  },
  {
    inputs: [
      { name: "spender", type: "address" },
      { name: "amount", type: "uint256" },
    ],
    name: "approve",
    outputs: [{ name: "", type: "bool" }],
    stateMutability: "nonpayable",
    type: "function",
  },
  {
    inputs: [{ name: "account", type: "address" }],
    name: "balanceOf",
    outputs: [{ name: "", type: "uint256" }],
    stateMutability: "view",
    type: "function",
  },
] as const;

const OPG_DECIMALS = 18n;
const OPG_SCALE = 10n ** OPG_DECIMALS;

/**
 * Result of a Permit2 allowance check / approval.
 *
 * - `allowanceBefore`: The Permit2 allowance before the method ran.
 * - `allowanceAfter`: The Permit2 allowance after the method ran.
 * - `txHash`: Transaction hash of the approval, or `null` if no transaction was needed.
 */
export interface Permit2ApprovalResult {
  allowanceBefore: bigint;
  allowanceAfter: bigint;
  txHash: Hex | null;
}

function toBaseUnits(amountOpg: number): bigint {
  if (!Number.isFinite(amountOpg) || amountOpg < 0) {
    throw new Error(`Invalid OPG amount: ${amountOpg}`);
  }
  // Match Python's int(amount * 10**18). Use string arithmetic to avoid
  // float precision loss for typical decimal inputs.
  const [whole, frac = ""] = amountOpg.toString().split(".");
  const fracPadded = (frac + "0".repeat(Number(OPG_DECIMALS))).slice(
    0,
    Number(OPG_DECIMALS),
  );
  return BigInt(whole) * OPG_SCALE + BigInt(fracPadded || "0");
}

function formatOpg(base: bigint): string {
  const whole = base / OPG_SCALE;
  const frac = base % OPG_SCALE;
  const fracStr = frac.toString().padStart(Number(OPG_DECIMALS), "0").slice(0, 6);
  return `${whole}.${fracStr}`;
}

async function readAllowance(
  publicClient: PublicClient,
  owner: Address,
  spender: Address,
): Promise<bigint> {
  return (await publicClient.readContract({
    address: BASE_OPG_ADDRESS,
    abi: ERC20_ABI,
    functionName: "allowance",
    args: [owner, spender],
  })) as bigint;
}

async function readBalance(
  publicClient: PublicClient,
  owner: Address,
): Promise<bigint> {
  return (await publicClient.readContract({
    address: BASE_OPG_ADDRESS,
    abi: ERC20_ABI,
    functionName: "balanceOf",
    args: [owner],
  })) as bigint;
}

async function sendApproveTx(
  publicClient: PublicClient,
  walletClient: WalletClient,
  account: Account,
  owner: Address,
  spender: Address,
  amountBase: bigint,
): Promise<Permit2ApprovalResult> {
  const allowanceBefore = await readAllowance(publicClient, owner, spender);

  let txHash: Hex;
  try {
    txHash = await walletClient.writeContract({
      account,
      chain: null,
      address: BASE_OPG_ADDRESS,
      abi: ERC20_ABI,
      functionName: "approve",
      args: [spender, amountBase],
    });
  } catch (e) {
    throw new Error(`Failed to approve Permit2 for OPG: ${String(e)}`);
  }

  const receipt = await publicClient.waitForTransactionReceipt({
    hash: txHash,
    timeout: APPROVAL_TX_TIMEOUT_MS,
  });

  if (receipt.status !== "success") {
    throw new Error(`Permit2 approval transaction reverted: ${txHash}`);
  }

  const deadline = Date.now() + ALLOWANCE_CONFIRMATION_TIMEOUT_MS;
  let allowanceAfter = allowanceBefore;
  while (allowanceAfter < amountBase) {
    allowanceAfter = await readAllowance(publicClient, owner, spender);
    if (allowanceAfter >= amountBase) break;
    if (Date.now() >= deadline) {
      throw new Error(
        `Permit2 approval transaction was mined, but the updated allowance ` +
          `was not visible within ${ALLOWANCE_CONFIRMATION_TIMEOUT_MS / 1000} seconds: ${txHash}`,
      );
    }
    await new Promise((resolve) =>
      setTimeout(resolve, ALLOWANCE_POLL_INTERVAL_MS),
    );
  }

  return { allowanceBefore, allowanceAfter, txHash };
}

/**
 * Ensure the Permit2 allowance stays above a minimum threshold.
 *
 * Only sends an approval transaction when the current allowance drops
 * below `minAllowance`. When approval is needed, approves `approveAmount`
 * (defaults to `2 * minAllowance`) to create a buffer that survives
 * multiple service restarts without re-approving.
 *
 * Best for backend servers that call this on startup:
 *
 * ```ts
 * import { privateKeyToAccount } from "viem/accounts";
 * import { ensureOpgApproval } from "opengradient-sdk";
 *
 * const account = privateKeyToAccount("0x...");
 * // On startup — only sends a tx when allowance < 5 OPG,
 * // then approves 100 OPG so subsequent restarts are free.
 * const result = await ensureOpgApproval(account, 5, 100);
 * ```
 *
 * @param account - The viem account to check and approve from.
 * @param minAllowance - Minimum acceptable allowance in OPG. A transaction
 *   is only sent when the current allowance is strictly below this value.
 * @param approveAmount - Amount of OPG to approve when a transaction is
 *   needed. Defaults to `2 * minAllowance`. Must be `>= minAllowance`.
 * @returns A {@link Permit2ApprovalResult} with the before/after allowance
 *   and `txHash` (`null` when no approval was needed).
 */
export async function ensureOpgApproval(
  account: Account,
  minAllowance: number,
  approveAmount?: number,
): Promise<Permit2ApprovalResult> {
  const effectiveApprove = approveAmount ?? minAllowance * 2;
  if (effectiveApprove < minAllowance) {
    throw new Error(
      `approveAmount (${effectiveApprove}) must be >= minAllowance (${minAllowance})`,
    );
  }

  const publicClient = createPublicClient({
    transport: http(BASE_MAINNET_RPC),
  });
  const walletClient = createWalletClient({
    account,
    transport: http(BASE_MAINNET_RPC),
  });

  const owner = getAddress(account.address);
  const spender = getAddress(PERMIT2_ADDRESS);

  const allowanceBefore = await readAllowance(publicClient, owner, spender);

  const minBase = toBaseUnits(minAllowance);
  let approveBase = toBaseUnits(effectiveApprove);

  if (allowanceBefore >= minBase) {
    return {
      allowanceBefore,
      allowanceAfter: allowanceBefore,
      txHash: null,
    };
  }

  const balance = await readBalance(publicClient, owner);
  if (balance === 0n) {
    throw new Error(
      `Wallet ${owner} has no OPG tokens. Fund the wallet before approving.`,
    );
  } else if (minBase > balance) {
    throw new Error(
      `Wallet ${owner} has insufficient OPG balance: has ${formatOpg(balance)} OPG, ` +
        `but the minimum required is ${formatOpg(minBase)} OPG. ` +
        `Fund the wallet before approving.`,
    );
  } else if (approveBase > balance) {
    // eslint-disable-next-line no-console
    console.warn(
      `Requested approveAmount (${effectiveApprove} OPG) exceeds wallet balance ` +
        `(${formatOpg(balance)} OPG), capping approval to wallet balance`,
    );
    approveBase = balance;
  }

  console.debug(
    `Permit2 allowance below minimum threshold (${allowanceBefore} < ${minBase}), ` +
      `approving ${approveBase} base units`,
  );
  return sendApproveTx(
    publicClient,
    walletClient,
    account,
    owner,
    spender,
    approveBase,
  );
}
