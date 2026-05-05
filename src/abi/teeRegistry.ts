/**
 * Minimal ABI for the on-chain TEE Registry contract.
 *
 * Only the read-only methods needed to discover active TEE endpoints and
 * fetch their pinned TLS certificates are included.
 */
export const TEE_REGISTRY_ABI = [
  {
    inputs: [{ internalType: "uint8", name: "teeType", type: "uint8" }],
    name: "getActiveTEEs",
    outputs: [
      {
        components: [
          { internalType: "address", name: "owner", type: "address" },
          { internalType: "address", name: "paymentAddress", type: "address" },
          { internalType: "string", name: "endpoint", type: "string" },
          { internalType: "bytes", name: "publicKey", type: "bytes" },
          { internalType: "bytes", name: "tlsCertificate", type: "bytes" },
          { internalType: "bytes32", name: "pcrHash", type: "bytes32" },
          { internalType: "uint8", name: "teeType", type: "uint8" },
          { internalType: "bool", name: "enabled", type: "bool" },
          { internalType: "uint256", name: "registeredAt", type: "uint256" },
          { internalType: "uint256", name: "lastHeartbeatAt", type: "uint256" },
        ],
        internalType: "struct TEERegistry.TEEInfo[]",
        name: "",
        type: "tuple[]",
      },
    ],
    stateMutability: "view",
    type: "function",
  },
  {
    inputs: [{ internalType: "bytes32", name: "teeId", type: "bytes32" }],
    name: "isTEEActive",
    outputs: [{ internalType: "bool", name: "", type: "bool" }],
    stateMutability: "view",
    type: "function",
  },
] as const;
