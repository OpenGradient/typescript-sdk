import { getAddress, toHex } from "viem";
import type { PrivateKeyAccount } from "viem/accounts";
import { OpenGradientError } from "./types";

const X402_VERSION = 1;
const SCHEME = "exact";

const TRANSFER_WITH_AUTHORIZATION_TYPES = {
  TransferWithAuthorization: [
    { name: "from", type: "address" },
    { name: "to", type: "address" },
    { name: "value", type: "uint256" },
    { name: "validAfter", type: "uint256" },
    { name: "validBefore", type: "uint256" },
    { name: "nonce", type: "bytes32" },
  ],
} as const;

export interface PaymentRequirements {
  scheme: string;
  network: string;
  maxAmountRequired: string;
  resource: string;
  description: string;
  mimeType?: string;
  payTo: string;
  maxTimeoutSeconds: number;
  asset: string;
  extra?: {
    name?: string;
    version?: string;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    [k: string]: any;
  };
}

interface PaymentRequiredResponse {
  x402Version: number;
  error?: string;
  accepts?: PaymentRequirements[];
}

interface SignedAuthorization {
  from: string;
  to: string;
  value: string;
  validAfter: string;
  validBefore: string;
  nonce: string;
}

interface PaymentPayload {
  x402Version: number;
  scheme: string;
  network: string;
  payload: {
    signature: string;
    authorization: SignedAuthorization;
  };
}

/**
 * Minimal x402 client for the og-evm network.
 *
 * Wraps `fetch` so that 402 Payment Required responses are automatically
 * resolved by signing an EIP-3009 TransferWithAuthorization for USDC and
 * retrying the request with an X-PAYMENT header.
 */
export class X402Client {
  private chainIdCache?: number;

  constructor(
    private readonly account: PrivateKeyAccount,
    private readonly rpcUrl: string,
    private readonly networkFilter: string,
  ) {}

  private async getChainId(): Promise<number> {
    if (this.chainIdCache !== undefined) return this.chainIdCache;

    const res = await fetch(this.rpcUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        jsonrpc: "2.0",
        id: 1,
        method: "eth_chainId",
        params: [],
      }),
    });
    if (!res.ok) {
      throw new OpenGradientError(
        `Failed to fetch chain id from ${this.rpcUrl}: HTTP ${res.status}`,
      );
    }
    const json = (await res.json()) as { result?: string };
    if (!json.result) {
      throw new OpenGradientError(
        `Unexpected eth_chainId response: ${JSON.stringify(json)}`,
      );
    }
    this.chainIdCache = parseInt(json.result, 16);
    return this.chainIdCache;
  }

  private selectRequirements(accepts: PaymentRequirements[]): PaymentRequirements {
    const matching = accepts.filter(
      (r) => r.network === this.networkFilter && r.scheme === SCHEME,
    );
    if (matching.length === 0) {
      throw new OpenGradientError(
        `No matching x402 payment requirements found for network=${this.networkFilter}`,
      );
    }
    return matching[0];
  }

  private createNonce(): `0x${string}` {
    const bytes = new Uint8Array(32);
    globalThis.crypto.getRandomValues(bytes);
    return toHex(bytes);
  }

  private async createPaymentHeader(req: PaymentRequirements): Promise<string> {
    const chainId = await this.getChainId();
    const now = Math.floor(Date.now() / 1000);
    const validAfter = BigInt(now - 600).toString();
    const validBefore = BigInt(now + req.maxTimeoutSeconds).toString();
    const nonce = this.createNonce();

    const authorization: SignedAuthorization = {
      from: getAddress(this.account.address),
      to: getAddress(req.payTo),
      value: req.maxAmountRequired,
      validAfter,
      validBefore,
      nonce,
    };

    const signature = await this.account.signTypedData({
      types: TRANSFER_WITH_AUTHORIZATION_TYPES,
      domain: {
        name: req.extra?.name,
        version: req.extra?.version,
        chainId,
        verifyingContract: getAddress(req.asset) as `0x${string}`,
      },
      primaryType: "TransferWithAuthorization",
      message: {
        from: authorization.from as `0x${string}`,
        to: authorization.to as `0x${string}`,
        value: BigInt(authorization.value),
        validAfter: BigInt(authorization.validAfter),
        validBefore: BigInt(authorization.validBefore),
        nonce: authorization.nonce as `0x${string}`,
      },
    });

    const payment: PaymentPayload = {
      x402Version: X402_VERSION,
      scheme: SCHEME,
      network: req.network,
      payload: { signature, authorization },
    };

    return Buffer.from(JSON.stringify(payment)).toString("base64");
  }

  /**
   * Fetch wrapper that handles 402 Payment Required responses.
   */
  async fetch(input: string | URL, init?: RequestInit): Promise<Response> {
    const response = await fetch(input, init);
    if (response.status !== 402) return response;

    let body: PaymentRequiredResponse;
    try {
      body = (await response.clone().json()) as PaymentRequiredResponse;
    } catch (e) {
      throw new OpenGradientError(`Invalid 402 response body: ${String(e)}`);
    }

    const requirement = this.selectRequirements(body.accepts ?? []);
    const header = await this.createPaymentHeader(requirement);

    const headers = new Headers(init?.headers);
    headers.set("X-PAYMENT", header);
    headers.set("Access-Control-Expose-Headers", "X-PAYMENT-RESPONSE");

    return fetch(input, { ...init, headers });
  }
}
