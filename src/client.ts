import { LLM } from "./llm";
import { ClientConfig } from "./types";
import {
  RegistryTEEConnection,
  StaticTEEConnection,
  type TEEConnection,
} from "./teeConnection";
import { TEERegistry } from "./teeRegistry";
import {
  DEFAULT_OG_RPC_URL,
  DEFAULT_TEE_REGISTRY_ADDRESS,
} from "./defaults";

/**
 * OpenGradient client.
 *
 * Provides access to LLM chat and completion via OpenGradient's TEE
 * (Trusted Execution Environment) with x402 payment protocol.
 *
 * By default, the TEE endpoint is resolved from the on-chain TEE registry and
 * the TLS certificate is pinned to the value stored at registration time.
 * Pass `llmServerUrl` to override with a hardcoded URL (development /
 * self-hosted TEE servers; TLS verification is disabled).
 *
 * Usage:
 *   const client = new Client({ privateKey: "0x..." });
 *   const result = await client.llm.chat({
 *     model: TEE_LLM.CLAUDE_3_5_HAIKU,
 *     messages: [{ role: "user", content: "Hello" }],
 *   });
 */
export class Client {
  readonly llm: LLM;

  constructor(config: ClientConfig) {
    const privateKey = (
      config.privateKey.startsWith("0x")
        ? config.privateKey
        : `0x${config.privateKey}`
    ) as `0x${string}`;

    let connection: TEEConnection;
    if (config.llmServerUrl) {
      connection = new StaticTEEConnection(config.llmServerUrl);
    } else {
      const registry = new TEERegistry(
        config.rpcUrl ?? DEFAULT_OG_RPC_URL,
        config.teeRegistryAddress ?? DEFAULT_TEE_REGISTRY_ADDRESS,
      );
      connection = new RegistryTEEConnection(registry);
    }

    this.llm = new LLM({
      privateKey,
      maxPaymentValue: config.maxPaymentValue,
      connection,
    });
  }

  /** Tear down dispatchers and any background refresh timers. */
  async close(): Promise<void> {
    await this.llm.close();
  }
}
