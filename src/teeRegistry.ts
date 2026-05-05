import {
  createPublicClient,
  http,
  keccak256,
  type Address,
  type Hex,
  type PublicClient,
} from "viem";
import { TEE_REGISTRY_ABI } from "./abi/teeRegistry";

/** TEE types as defined in the registry contract. */
export const TEE_TYPE_LLM_PROXY = 0;
export const TEE_TYPE_VALIDATOR = 1;

/** A verified TEE with its endpoint URL and TLS certificate from the registry. */
export interface TEEEndpoint {
  /** keccak256 of the TEE's public key. */
  teeId: string;
  /** HTTPS endpoint URL of the TEE. */
  endpoint: string;
  /** DER-encoded X.509 certificate bytes as stored in the registry. */
  tlsCertDer: Uint8Array;
  /** Wallet address that receives x402 payments for this TEE. */
  paymentAddress: string;
}

interface RawTEEInfo {
  owner: Address;
  paymentAddress: Address;
  endpoint: string;
  publicKey: Hex;
  tlsCertificate: Hex;
  pcrHash: Hex;
  teeType: number;
  enabled: boolean;
  registeredAt: bigint;
  lastHeartbeatAt: bigint;
}

function hexToBytes(hex: Hex): Uint8Array {
  const cleaned = hex.startsWith("0x") ? hex.slice(2) : hex;
  if (cleaned.length === 0) return new Uint8Array(0);
  const out = new Uint8Array(cleaned.length / 2);
  for (let i = 0; i < out.length; i++) {
    out[i] = parseInt(cleaned.slice(i * 2, i * 2 + 2), 16);
  }
  return out;
}

/**
 * Queries the on-chain TEE Registry contract to retrieve verified TEE
 * endpoints and their TLS certificates.
 *
 * Instead of blindly trusting the TLS certificate presented by a TEE server
 * (TOFU), this class fetches the certificate that was submitted and verified
 * during TEE registration. Any certificate that does not match the one stored
 * in the registry should be rejected.
 */
export class TEERegistry {
  private readonly client: PublicClient;
  private readonly address: Address;

  /**
   * @param rpcUrl - RPC endpoint for the chain where the registry is deployed.
   * @param registryAddress - Address of the deployed TEERegistry contract.
   */
  constructor(rpcUrl: string, registryAddress: string) {
    this.client = createPublicClient({ transport: http(rpcUrl) });
    this.address = registryAddress as Address;
  }

  /**
   * Return all active TEEs of the given type with their endpoints and TLS certs.
   *
   * Uses the contract's `getActiveTEEs(teeType)` which returns only TEEs that
   * are enabled, have a valid (non-revoked) PCR, and a fresh heartbeat — all in
   * a single on-chain call.
   */
  async getActiveTEEsByType(teeType: number): Promise<TEEEndpoint[]> {
    let teeInfos: readonly RawTEEInfo[];
    try {
      teeInfos = (await this.client.readContract({
        address: this.address,
        abi: TEE_REGISTRY_ABI,
        functionName: "getActiveTEEs",
        args: [teeType],
      })) as readonly RawTEEInfo[];
    } catch (e) {
      // eslint-disable-next-line no-console
      console.warn(
        `Failed to fetch active TEEs from registry (type=${teeType}): ${String(e)}`,
      );
      return [];
    }

    const out: TEEEndpoint[] = [];
    for (const tee of teeInfos) {
      if (
        !tee.endpoint ||
        !tee.tlsCertificate ||
        tee.tlsCertificate === "0x"
      ) {
        continue;
      }
      out.push({
        teeId: keccak256(tee.publicKey),
        endpoint: tee.endpoint,
        tlsCertDer: hexToBytes(tee.tlsCertificate),
        paymentAddress: tee.paymentAddress,
      });
    }
    return out;
  }

  /**
   * Return a random active LLM proxy TEE from the registry, or `null` if none
   * are available.
   */
  async getLLMTEE(): Promise<TEEEndpoint | null> {
    const tees = await this.getActiveTEEsByType(TEE_TYPE_LLM_PROXY);
    if (tees.length === 0) return null;
    return tees[Math.floor(Math.random() * tees.length)];
  }
}
