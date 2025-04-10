import Web3 from "web3";
import { Contract } from "web3-eth-contract";
import { Account } from "web3-core";
import {
  ClientConfig,
  InferenceMode,
  LLMInferenceMode,
  LLMChatMessage,
  OpenGradientError,
  RawModelInput,
} from "./types";
import { convertToModelInput, convertToModelOutput, sleep, getInferenceResultFromNode } from "./utils";
import { DEFAULT_MAX_RETRY, DEFAULT_RETRY_DELAY_SEC, INFERENCE_PRECOMPILE_ADDRESS } from "./constants";
import { DEFAULT_CONFIG } from "./defaults";


export class Client {
  private readonly web3: Web3;
  private readonly account: Account;
  private readonly contractAddress: string;
  private readonly contract: Contract;
  private readonly precompileContract: Contract;

  constructor(config: ClientConfig) {
    const rpcUrl = DEFAULT_CONFIG.rpcUrl;
    const contractAddress = DEFAULT_CONFIG.inferenceContractAddress;

    this.web3 = new Web3(rpcUrl);
    this.account = this.web3.eth.accounts.privateKeyToAccount(
      config.privateKey,
    );
    this.contractAddress = contractAddress;

    // Load ABI from local file
    const inferenceAbi = require("./abi/inference.json");
    this.contract = new this.web3.eth.Contract(
      inferenceAbi,
      this.contractAddress,
    );

    const precompileAbi = require("./abi/precompile.json");
    this.precompileContract = new this.web3.eth.Contract(
      precompileAbi,
      INFERENCE_PRECOMPILE_ADDRESS,
    );
  }

  private async runWithRetry<T>(
    txnFunction: () => Promise<T>,
    maxRetries: number = DEFAULT_MAX_RETRY,
    retryDelay: number = DEFAULT_RETRY_DELAY_SEC,
  ): Promise<T> {
    const NONCE_ERRORS = ["nonce too low", "nonce too high"];

    for (let attempt = 0; attempt < maxRetries; attempt++) {
      try {
        return await txnFunction();
      } catch (err: unknown) {
        if (!(err instanceof Error)) {
          throw new OpenGradientError(`Unknown error occurred: ${String(err)}`);
        }

        const errorMsg = err.message.toLowerCase();

        if (NONCE_ERRORS.some((msg) => errorMsg.includes(msg))) {
          if (attempt === maxRetries - 1) {
            throw new OpenGradientError(
              `Transaction failed after ${maxRetries} attempts: ${err.message}`,
            );
          }
          await sleep(retryDelay * 1000);
          continue;
        }

        throw err;
      }
    }

    throw new OpenGradientError("Maximum retry attempts reached");
  }

  async infer(
    modelCid: string,
    inferenceMode: InferenceMode,
    modelInput: RawModelInput,
    maxRetries?: number,
  ): Promise<[string, RawModelInput]> {
    const execute = async (): Promise<[string, RawModelInput]> => {
      const inferenceMode8 = Number(inferenceMode);
      const convertedInput = convertToModelInput(modelInput);

      const runFunction = this.contract.methods.run(
        modelCid,
        inferenceMode8,
        convertedInput,
      );

      const nonce = await this.web3.eth.getTransactionCount(
        this.account.address,
        "pending",
      );
      const estimatedGas = await runFunction.estimateGas({
        from: this.account.address,
      });
      const gasLimit = Math.floor(estimatedGas * 3);
      const gasPrice = await this.web3.eth.getGasPrice();

      const transaction = {
        from: this.account.address,
        to: this.contractAddress,
        gas: gasLimit,
        gasPrice: gasPrice,
        nonce: nonce,
        data: runFunction.encodeABI(),
      };

      const signedTx = await this.account.signTransaction(transaction);
      const txHash = await this.web3.eth.sendSignedTransaction(
        signedTx.rawTransaction!,
      );
      const receipt = await this.web3.eth.getTransactionReceipt(
        txHash.transactionHash,
      );

      if (!receipt.status) {
        throw new Error(
          `Transaction failed. Receipt: ${JSON.stringify(receipt)}`,
        );
      }

      const event = receipt.logs[1];
      const eventAbi = this.contract.options.jsonInterface.find(
        (x) => x.name === "InferenceResult",
      )!.inputs;

      const decodedLog = this.web3.eth.abi.decodeLog(
        eventAbi || [],
        event.data,
        event.topics.slice(1),
      );

      var modelOutput = convertToModelOutput(decodedLog);
      // if model out is empty, check inference event through precompile contract
      if (Object.keys(modelOutput).length === 0) {
        const precompileEventAbi = this.precompileContract.options.jsonInterface.find(
          (x) => x.name === "ModelInferenceEvent",
        )!.inputs;

        const precompileEvent = receipt.logs[0];
        const precompileDecodedLog = this.web3.eth.abi.decodeLog(
          precompileEventAbi || [],
          precompileEvent.data,
          precompileEvent.topics.slice(1),
        );

        const inference_result = await getInferenceResultFromNode(DEFAULT_CONFIG.apiUrl, precompileDecodedLog.inferenceID, inferenceMode);
        modelOutput = convertToModelOutput(inference_result)
      }

      return [txHash.transactionHash, modelOutput];
    };

    return this.runWithRetry(execute, maxRetries);
  }

  async llmCompletion(
    modelCid: string,
    inferenceMode: LLMInferenceMode,
    prompt: string,
    maxTokens: number = 100,
    stopSequence: string[] = [],
    temperature: number = 0.0,
    maxRetries?: number,
  ): Promise<[string, string]> {
    const execute = async (): Promise<[string, string]> => {
      if (
        inferenceMode !== LLMInferenceMode.VANILLA &&
        inferenceMode !== LLMInferenceMode.TEE
      ) {
        throw new OpenGradientError(
          "Invalid inference mode: must be VANILLA or TEE",
        );
      }

      const llmRequest = {
        mode: inferenceMode,
        modelCID: modelCid,
        prompt,
        max_tokens: maxTokens,
        stop_sequence: stopSequence,
        temperature: Math.floor(temperature * 100),
      };

      const runFunction = this.contract.methods.runLLMCompletion(llmRequest);
      const nonce = await this.web3.eth.getTransactionCount(
        this.account.address,
        "pending",
      );
      const estimatedGas = await runFunction.estimateGas({
        from: this.account.address,
        value: 0,
      });
      const gasLimit = Math.floor(estimatedGas * 1.5);
      const gasPrice = await this.web3.eth.getGasPrice();

      const transaction = {
        from: this.account.address,
        to: this.contractAddress,
        gas: gasLimit,
        gasPrice: gasPrice,
        nonce: nonce,
        data: runFunction.encodeABI(),
      };

      const signedTx = await this.account.signTransaction(transaction);
      const txHash = await this.web3.eth.sendSignedTransaction(
        signedTx.rawTransaction!,
      );
      const receipt = await this.web3.eth.getTransactionReceipt(
        txHash.transactionHash,
      );

      if (!receipt.status) {
        throw new Error(
          `Transaction failed. Receipt: ${JSON.stringify(receipt)}`,
        );
      }

      const events = await this.contract.getPastEvents("LLMCompletionResult", {
        fromBlock: receipt.blockNumber,
        toBlock: receipt.blockNumber,
      });

      if (events.length < 1) {
        throw new OpenGradientError(
          "LLM completion result event not found in transaction logs",
        );
      }

      const llmAnswer = events[0].returnValues.response.answer;
      return [txHash.transactionHash, llmAnswer];
    };

    return this.runWithRetry(execute, maxRetries);
  }

  async llmChat(
    modelCid: string,
    inferenceMode: LLMInferenceMode,
    messages: LLMChatMessage[],
    maxTokens: number = 100,
    stopSequence: string[] = [],
    temperature: number = 0.0,
    tools: any[] = [],
    toolChoice?: string,
    maxRetries?: number,
  ): Promise<[string, string, any]> {
    const execute = async (): Promise<[string, string, any]> => {
      if (
        inferenceMode !== LLMInferenceMode.VANILLA &&
        inferenceMode !== LLMInferenceMode.TEE
      ) {
        throw new OpenGradientError(
          "Invalid inference mode: must be VANILLA or TEE",
        );
      }

      // Prepare messages with required fields
      const preparedMessages = messages.map((msg) => ({
        ...msg,
        tool_calls: msg.toolCalls || [],
        tool_call_id: msg.toolCallId || "",
        name: msg.name || "",
      }));

      // Convert tools to simplified format
      const convertedTools = tools.map((tool) => {
        const { function: fn } = tool;
        return {
          name: fn.name,
          description: fn.description,
          parameters: fn.parameters ? JSON.stringify(fn.parameters) : undefined,
        };
      });

      const llmRequest = {
        mode: inferenceMode,
        modelCID: modelCid,
        messages: preparedMessages,
        tools: convertedTools,
        tool_choice: toolChoice || (tools.length ? "auto" : ""),
        max_tokens: maxTokens,
        stop_sequence: stopSequence,
        temperature: Math.floor(temperature * 100),
      };

      const runFunction = this.contract.methods.runLLMChat(llmRequest);
      const nonce = await this.web3.eth.getTransactionCount(
        this.account.address,
        "pending",
      );
      // const estimatedGas = await runFunction.estimateGas({
      //   from: this.account.address,
      // });
      const estimatedGas = 100000;
      const gasLimit = Math.floor(estimatedGas * 1.5);
      const gasPrice = await this.web3.eth.getGasPrice();

      const transaction = {
        from: this.account.address,
        to: this.contractAddress,
        gas: gasLimit,
        gasPrice: gasPrice,
        nonce: nonce,
        data: runFunction.encodeABI(),
      };

      const signedTx = await this.account.signTransaction(transaction);
      const txHash = await this.web3.eth.sendSignedTransaction(
        signedTx.rawTransaction!,
      );
      const receipt = await this.web3.eth.getTransactionReceipt(
        txHash.transactionHash,
      );

      if (!receipt.status) {
        throw new Error(
          `Transaction failed. Receipt: ${JSON.stringify(receipt)}`,
        );
      }

      const events = await this.contract.getPastEvents("LLMChatResult", {
        fromBlock: receipt.blockNumber,
        toBlock: receipt.blockNumber,
      });

      if (events.length < 1) {
        throw new OpenGradientError(
          "LLM chat result event not found in transaction logs",
        );
      }

      const llmResult = events[0].returnValues.response;
      const message = { ...llmResult.message };

      if (message.tool_calls) {
        message.toolCalls = message.tool_calls.map((tc: any) => ({ ...tc }));
        delete message.tool_calls;
      }

      return [txHash.transactionHash, llmResult.finish_reason, message];
    };

    return this.runWithRetry(execute, maxRetries);
  }
}
