import { wrapFetchWithPayment } from "@x402/fetch";
import { x402Client } from "@x402/core/client";
import { UptoEvmScheme } from "@x402/evm";
import { registerExactEvmScheme } from "@x402/evm/exact/client";
import { privateKeyToAccount } from "viem/accounts";
import type { Agent } from "undici";
import {
  ChatParams,
  ChatMessage,
  CompletionParams,
  OpenGradientError,
  ResponseFormat,
  StreamChoice,
  StreamChunk,
  TextGenerationOutput,
  TokenUsage,
  X402SettlementMode,
} from "./types";
import type { ActiveTEE, TEEConnection } from "./teeConnection";

const X402_PLACEHOLDER_API_KEY =
  "0x1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef";
const X402_PROCESSING_HASH_HEADER = "x-processing-hash";
const X402_DATA_SETTLEMENT_TX_HASH_HEADER = "x-settlement-tx-hash";
const X402_DATA_SETTLEMENT_BLOB_ID_HEADER = "x-settlement-walrus-blob-id";

const CHAT_ENDPOINT = "/v1/chat/completions";
const COMPLETION_ENDPOINT = "/v1/completions";

export interface LLMConfig {
  privateKey: `0x${string}`;
  maxPaymentValue?: bigint;
  /** Resolves the active TEE endpoint and TLS dispatcher. */
  connection: TEEConnection;
}

/**
 * LLM inference namespace.
 *
 * Provides chat and completion access to LLMs hosted in OpenGradient's TEE
 * (Trusted Execution Environment) with x402 payment protocol support.
 *
 * The TEE endpoint is normally resolved from the on-chain TEE registry, with
 * the TLS certificate pinned to the value stored at registration time. Pass
 * `llmServerUrl` on the `Client` to override with a hardcoded URL.
 */
export class LLM {
  private x402ClientInstance?: x402Client;

  constructor(private readonly config: LLMConfig) {}

  /** Tear down dispatchers and any background refresh timers. */
  async close(): Promise<void> {
    await this.config.connection.close();
  }

  /**
   * Perform a (non-chat) completion via the TEE LLM server.
   */
  async completion(params: CompletionParams): Promise<TextGenerationOutput> {
    const {
      model,
      prompt,
      maxTokens = 100,
      stopSequence,
      temperature = 0.0,
      x402SettlementMode = X402SettlementMode.BATCH_HASHED,
    } = params;

    const payload: Record<string, any> = {
      model: stripProvider(model),
      prompt,
      max_tokens: maxTokens,
      temperature,
    };
    if (stopSequence && stopSequence.length) payload.stop = stopSequence;

    const { response, tee } = await this.requestWithRetry(
      COMPLETION_ENDPOINT,
      payload,
      x402SettlementMode,
    );

    const result = (await response.json()) as {
      completion?: string;
      tee_signature?: string;
      tee_timestamp?: string;
    };
    return {
      completionOutput: result.completion,
      paymentHash: response.headers.get(X402_PROCESSING_HASH_HEADER) ?? undefined,
      dataSettlementTransactionHash: dataSettlementTxHash(response),
      dataSettlementBlobId: dataSettlementBlobId(response),
      teeSignature: result.tee_signature,
      teeTimestamp: result.tee_timestamp,
      teeId: tee.teeId,
      teeEndpoint: tee.endpoint,
      teePaymentAddress: tee.paymentAddress,
    };
  }

  /**
   * Perform a non-streaming chat completion via the TEE LLM server.
   */
  chat(params: ChatParams & { stream?: false }): Promise<TextGenerationOutput>;
  /**
   * Perform a streaming chat completion via the TEE LLM server.
   */
  chat(params: ChatParams & { stream: true }): AsyncIterable<StreamChunk>;
  chat(
    params: ChatParams & { stream?: boolean },
  ): Promise<TextGenerationOutput> | AsyncIterable<StreamChunk> {
    if (params.responseFormat?.type === "json_object") {
      const provider = params.model.split("/")[0];
      if (provider === "anthropic") {
        throw new OpenGradientError(
          "Anthropic models do not support response_format type 'json_object'. " +
            "Use { type: 'json_schema', jsonSchema: {...} } with an explicit schema instead.",
        );
      }
    }

    if (params.stream) {
      // Tool-call streaming responses from the TEE proxy omit tool call
      // content from SSE events; fall back to non-streaming and emit a single
      // final chunk. Mirrors `_chat_tools_as_stream` in the Python SDK.
      if (params.tools && params.tools.length) {
        return this.chatToolsAsStream(params);
      }
      return this.chatStream(params);
    }
    return this.chatNonStreaming(params);
  }

  private async chatNonStreaming(
    params: ChatParams,
  ): Promise<TextGenerationOutput> {
    const payload = this.buildChatPayload(params, false);
    const settlementMode =
      params.x402SettlementMode ?? X402SettlementMode.BATCH_HASHED;
    const { response, tee } = await this.requestWithRetry(
      CHAT_ENDPOINT,
      payload,
      settlementMode,
    );

    const result = (await response.json()) as {
      choices?: Array<{
        message?: ChatMessage;
        finish_reason?: string;
      }>;
      usage?: TokenUsage;
      tee_signature?: string;
      tee_timestamp?: string;
    };

    const choices = result.choices;
    if (!choices || choices.length === 0) {
      throw new OpenGradientError(
        `Invalid response: 'choices' missing or empty in ${JSON.stringify(result)}`,
      );
    }

    const message = choices[0].message ?? { role: "assistant" };
    // Some providers (Anthropic via the proxy) return content as an array of
    // typed blocks; flatten to a plain string for parity with Python.
    if (Array.isArray((message as any).content)) {
      message.content = ((message as any).content as any[])
        .filter((b) => b && typeof b === "object" && b.type === "text")
        .map((b) => b.text ?? "")
        .join(" ")
        .trim();
    }

    return {
      finishReason: choices[0].finish_reason,
      chatOutput: message,
      usage: result.usage,
      paymentHash: response.headers.get(X402_PROCESSING_HASH_HEADER) ?? undefined,
      dataSettlementTransactionHash: dataSettlementTxHash(response),
      dataSettlementBlobId: dataSettlementBlobId(response),
      teeSignature: result.tee_signature,
      teeTimestamp: result.tee_timestamp,
      teeId: tee.teeId,
      teeEndpoint: tee.endpoint,
      teePaymentAddress: tee.paymentAddress,
    };
  }

  private async *chatStream(params: ChatParams): AsyncIterable<StreamChunk> {
    const payload = this.buildChatPayload(params, true);
    const settlementMode =
      params.x402SettlementMode ?? X402SettlementMode.BATCH_HASHED;

    let response: Response;
    let tee: ActiveTEE;
    try {
      ({ response, tee } = await this.sendOnce(
        CHAT_ENDPOINT,
        payload,
        settlementMode,
      ));
    } catch (e) {
      if (e instanceof OpenGradientError && e.statusCode !== undefined) {
        // Server responded with a non-2xx — don't retry.
        throw e;
      }
      // Connection-level failure during stream setup: re-resolve and retry once.
      try {
        await this.config.connection.reconnect();
      } catch (reconnectErr) {
        throw new OpenGradientError(
          `TEE LLM stream failed and registry refresh failed: ${String(reconnectErr)}`,
        );
      }
      ({ response, tee } = await this.sendOnce(
        CHAT_ENDPOINT,
        payload,
        settlementMode,
      ));
    }

    if (!response.body) {
      throw new OpenGradientError("TEE LLM chat stream returned empty body");
    }

    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let buffer = "";
    let pendingFinal: StreamChunk | null = null;

    try {
      while (true) {
        const { value, done } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });

        let newlineIdx;
        while ((newlineIdx = buffer.indexOf("\n")) !== -1) {
          const line = buffer.slice(0, newlineIdx).trim();
          buffer = buffer.slice(newlineIdx + 1);
          if (!line || !line.startsWith("data: ")) continue;

          const dataStr = line.slice(6).trim();
          if (dataStr === "[DONE]") {
            if (pendingFinal) yield pendingFinal;
            return;
          }

          let data: any;
          try {
            data = JSON.parse(dataStr);
          } catch {
            // Skip malformed chunks
            continue;
          }
          const chunk = parseStreamChunk(data);
          if (chunk.isFinal) {
            chunk.dataSettlementTransactionHash =
              chunk.dataSettlementTransactionHash ??
              dataSettlementTxHash(response);
            chunk.dataSettlementBlobId =
              chunk.dataSettlementBlobId ?? dataSettlementBlobId(response);
            chunk.teeId = tee.teeId;
            chunk.teeEndpoint = tee.endpoint;
            chunk.teePaymentAddress = tee.paymentAddress;
            pendingFinal = chunk;
            continue;
          }
          yield chunk;
        }
      }
      if (pendingFinal) yield pendingFinal;
    } finally {
      reader.releaseLock();
    }
  }

  private async *chatToolsAsStream(
    params: ChatParams,
  ): AsyncIterable<StreamChunk> {
    const result = await this.chatNonStreaming(params);
    const chatOutput = result.chatOutput ?? { role: "assistant" };
    yield {
      choices: [
        {
          delta: {
            role: chatOutput.role,
            content: chatOutput.content ?? undefined,
            tool_calls: chatOutput.tool_calls,
          },
          index: 0,
          finish_reason: result.finishReason ?? null,
        },
      ],
      model: stripProvider(params.model),
      isFinal: true,
      teeSignature: result.teeSignature,
      teeTimestamp: result.teeTimestamp,
      teeId: result.teeId,
      teeEndpoint: result.teeEndpoint,
      teePaymentAddress: result.teePaymentAddress,
      dataSettlementTransactionHash: result.dataSettlementTransactionHash,
      dataSettlementBlobId: result.dataSettlementBlobId,
    };
  }

  private buildChatPayload(
    params: ChatParams,
    stream: boolean,
  ): Record<string, any> {
    const {
      model,
      messages,
      maxTokens = 100,
      stopSequence,
      temperature = 0.0,
      tools,
      toolChoice,
      responseFormat,
    } = params;

    const payload: Record<string, any> = {
      model: stripProvider(model),
      messages,
      max_tokens: maxTokens,
      temperature,
    };
    if (stream) payload.stream = true;
    if (stopSequence && stopSequence.length) payload.stop = stopSequence;
    if (tools && tools.length) {
      payload.tools = tools;
      payload.tool_choice = toolChoice ?? "auto";
    }
    if (responseFormat) {
      payload.response_format = serializeResponseFormat(responseFormat);
    }
    return payload;
  }

  private getX402Client(): x402Client {
    if (!this.x402ClientInstance) {
      const account = privateKeyToAccount(this.config.privateKey);
      const client = new x402Client();
      registerExactEvmScheme(client, { signer: account });
      // The TEE may quote the "upto" scheme — register it on EVM networks too.
      client.register("eip155:*", new UptoEvmScheme(account));
      this.x402ClientInstance = client;
    }
    return this.x402ClientInstance;
  }

  /**
   * Build a paid fetch that injects the TEE's pinned TLS dispatcher into every
   * request (including x402 payment retries).
   */
  private buildPaidFetch(dispatcher: Agent): typeof fetch {
    const baseFetch: typeof fetch = ((input: any, init?: any) =>
      fetch(input, { ...(init ?? {}), dispatcher } as any)) as typeof fetch;
    return wrapFetchWithPayment(baseFetch, this.getX402Client()) as typeof fetch;
  }

  /**
   * Send a request, lazily resolving the TEE endpoint. On a connection-level
   * failure the TEE is re-resolved from the registry and the request is
   * retried once. Server-side HTTP errors (non-2xx) are not retried, matching
   * the Python SDK's `_call_with_tee_retry` behavior.
   */
  private async requestWithRetry(
    path: string,
    body: Record<string, any>,
    settlementMode: X402SettlementMode,
  ): Promise<{ response: Response; tee: ActiveTEE }> {
    this.config.connection.ensureRefreshLoop();
    try {
      return await this.sendOnce(path, body, settlementMode);
    } catch (e) {
      if (e instanceof OpenGradientError && e.statusCode !== undefined) {
        // Server responded with a non-2xx — don't retry.
        throw e;
      }
      try {
        await this.config.connection.reconnect();
      } catch (reconnectErr) {
        throw new OpenGradientError(
          `TEE LLM request failed and registry refresh failed: ${String(reconnectErr)}`,
        );
      }
      return await this.sendOnce(path, body, settlementMode);
    }
  }

  private async sendOnce(
    path: string,
    body: Record<string, any>,
    settlementMode: X402SettlementMode,
  ): Promise<{ response: Response; tee: ActiveTEE }> {
    const tee = await this.config.connection.ensureConnected();
    const url = `${trimSlash(tee.endpoint)}${path}`;
    const paidFetch = this.buildPaidFetch(tee.dispatcher);

    let response: Response;
    try {
      response = await paidFetch(url, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${X402_PLACEHOLDER_API_KEY}`,
          "X-SETTLEMENT-TYPE": settlementMode,
        },
        body: JSON.stringify(body),
      });
    } catch (e) {
      throw new OpenGradientError(`TEE LLM request failed: ${String(e)}`);
    }

    if (!response.ok) {
      const text = await response.text().catch(() => "");
      throw new OpenGradientError(
        `TEE LLM request failed: HTTP ${response.status}${text ? ` - ${text}` : ""}`,
        response.status,
      );
    }
    return { response, tee };
  }
}

function stripProvider(model: string): string {
  const idx = model.indexOf("/");
  return idx === -1 ? model : model.slice(idx + 1);
}

function trimSlash(url: string): string {
  return url.endsWith("/") ? url.slice(0, -1) : url;
}

function dataSettlementTxHash(response: Response): string | undefined {
  return response.headers.get(X402_DATA_SETTLEMENT_TX_HASH_HEADER) ?? undefined;
}

function dataSettlementBlobId(response: Response): string | undefined {
  return response.headers.get(X402_DATA_SETTLEMENT_BLOB_ID_HEADER) ?? undefined;
}

function serializeResponseFormat(format: ResponseFormat): Record<string, any> {
  if (format.type === "json_schema" && !format.jsonSchema) {
    throw new OpenGradientError(
      "ResponseFormat.jsonSchema is required when type='json_schema'",
    );
  }
  const out: Record<string, any> = { type: format.type };
  if (format.jsonSchema) out.json_schema = format.jsonSchema;
  return out;
}

function parseStreamChunk(data: any): StreamChunk {
  const choices: StreamChoice[] = (data.choices ?? []).map((c: any) => {
    // The TEE proxy sometimes sends SSE events using the non-streaming
    // "message" key instead of the standard streaming "delta" key.
    const deltaSrc = c.delta ?? c.message ?? {};
    return {
      delta: {
        content: deltaSrc.content,
        role: deltaSrc.role,
        tool_calls: deltaSrc.tool_calls,
      },
      index: c.index ?? 0,
      finish_reason: c.finish_reason ?? null,
    };
  });

  const usage: TokenUsage | undefined = data.usage
    ? {
        prompt_tokens: data.usage.prompt_tokens ?? 0,
        completion_tokens: data.usage.completion_tokens ?? 0,
        total_tokens: data.usage.total_tokens ?? 0,
      }
    : undefined;

  const isFinal =
    choices.some(
      (c) => c.finish_reason !== null && c.finish_reason !== undefined,
    ) || !!usage;

  return {
    choices,
    model: data.model ?? "unknown",
    usage,
    isFinal,
    teeSignature: data.tee_signature,
    teeTimestamp: data.tee_timestamp,
    dataSettlementTransactionHash: data.data_settlement_transaction_hash,
    dataSettlementBlobId: data.data_settlement_blob_id,
  };
}
