import {
  createPublicClient,
  http,
  getContract,
  parseAbi,
  decodeEventLog,
} from "viem";
import { mainnet, sepolia } from "viem/chains";
import axios from "axios";
import { logger } from "../utils/logger";
import { getBlockchainNetwork, NODE_ENV } from "../config/env";

// ERC-20 Transfer event signature
const ERC20_TRANSFER_EVENT_SIGNATURE = "Transfer(address,address,uint256)";
const ERC20_TRANSFER_EVENT_TOPIC =
  "0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef";

export interface BlockchainConfig {
  chainId: number;
  rpcUrl: string;
  etherscanApiKey: string;
  etherscanUrl: string;
}

export interface TransactionDetails {
  hash: string;
  from: string;
  to: string;
  value: string;
  gas: string;
  gasPrice: string;
  nonce: number;
  blockNumber?: number;
  blockHash?: string;
  transactionIndex?: number;
  status?: "pending" | "confirmed" | "failed";
  confirmations?: number;
  timestamp?: number;
  // Add fields for ERC-20 transfers
  isERC20Transfer?: boolean;
  actualRecipient?: string;
  tokenAddress?: string;
  tokenAmount?: string;
}

export interface ERC20TransferDetails {
  from: string;
  to: string;
  value: string;
  tokenAddress: string;
}

export interface TransactionReceipt {
  transactionHash: string;
  blockNumber: string;
  blockHash: string;
  transactionIndex: string;
  from: string;
  to: string;
  cumulativeGasUsed: string;
  gasUsed: string;
  contractAddress?: string;
  logs: any[];
  status: string;
  logsBloom: string;
  effectiveGasPrice: string;
}

class BlockchainService {
  private configs: Map<string, BlockchainConfig> = new Map();
  private clients: Map<string, any> = new Map();

  constructor() {
    this.initializeNetworks();
  }

  private initializeNetworks() {
    // Sepolia for development
    const sepoliaConfig: BlockchainConfig = {
      chainId: 11155111,
      rpcUrl:
        process.env.SEPOLIA_RPC_URL ||
        "https://sepolia.infura.io/v3/your-project-id",
      etherscanApiKey: process.env.ETHERSCAN_API_KEY || "",
      etherscanUrl: "https://api-sepolia.etherscan.io/api",
    };

    // Ethereum mainnet for production
    const mainnetConfig: BlockchainConfig = {
      chainId: 1,
      rpcUrl:
        process.env.ETHEREUM_RPC_URL ||
        "https://mainnet.infura.io/v3/your-project-id",
      etherscanApiKey: process.env.ETHERSCAN_API_KEY || "",
      etherscanUrl: "https://api.etherscan.io/api",
    };

    this.configs.set("sepolia", sepoliaConfig);
    this.configs.set("ethereum", mainnetConfig);

    // Initialize clients
    this.configs.forEach((config, network) => {
      const client = createPublicClient({
        chain: network === "sepolia" ? sepolia : mainnet,
        transport: http(config.rpcUrl),
      });
      this.clients.set(network, client);
    });
  }

  /**
   * Parse ERC-20 transfer events from transaction logs
   */
  private parseERC20TransferEvents(logs: any[]): ERC20TransferDetails[] {
    const transferEvents: ERC20TransferDetails[] = [];

    for (const log of logs) {
      // Check if this is a Transfer event (first topic should match Transfer event signature)
      if (log.topics && log.topics[0] === ERC20_TRANSFER_EVENT_TOPIC) {
        try {
          // Parse the Transfer event
          const decoded = decodeEventLog({
            abi: parseAbi([
              "event Transfer(address indexed from, address indexed to, uint256 value)",
            ]),
            data: log.data,
            topics: log.topics,
          });

          if (decoded.eventName === "Transfer") {
            transferEvents.push({
              from: decoded.args.from,
              to: decoded.args.to,
              value: decoded.args.value.toString(),
              tokenAddress: log.address,
            });
          }
        } catch (error) {
          logger.warn("Failed to decode ERC-20 transfer event", {
            logAddress: log.address,
            topics: log.topics,
            error: error instanceof Error ? error.message : String(error),
          });
        }
      }
    }

    return transferEvents;
  }

  /**
   * Check if a transaction is an ERC-20 transfer
   */
  private isERC20Transfer(logs: any[]): boolean {
    return logs.some(
      (log) => log.topics && log.topics[0] === ERC20_TRANSFER_EVENT_TOPIC
    );
  }

  /**
   * Get transaction details from blockchain
   */
  async getTransactionDetails(
    network: string,
    txHash: string
  ): Promise<TransactionDetails | null> {
    try {
      const config = this.configs.get(network);
      const client = this.clients.get(network);

      if (!config || !client) {
        throw new Error(`Network ${network} not configured`);
      }

      // Get transaction details from RPC
      const tx = await client.getTransaction({ hash: txHash as `0x${string}` });

      if (!tx) {
        return null;
      }

      // Get transaction receipt for status and logs
      const receipt = await client.getTransactionReceipt({
        hash: txHash as `0x${string}`,
      });

      // Get block details if available
      let blockDetails = null;
      if (tx.blockNumber) {
        blockDetails = await client.getBlock({ blockNumber: tx.blockNumber });
      }

      // Check if this is an ERC-20 transfer
      const isERC20Transfer = receipt
        ? this.isERC20Transfer(receipt.logs)
        : false;
      let actualRecipient = tx.to || "";
      let tokenAddress = "";
      let tokenAmount = "0";

      // If it's an ERC-20 transfer, parse the actual recipient from logs
      if (isERC20Transfer && receipt) {
        const transferEvents = this.parseERC20TransferEvents(receipt.logs);

        if (transferEvents.length > 0) {
          // For simplicity, we'll use the first transfer event
          // In a more sophisticated implementation, you might want to handle multiple transfers
          const transferEvent = transferEvents[0];
          actualRecipient = transferEvent.to;
          tokenAddress = transferEvent.tokenAddress;
          tokenAmount = transferEvent.value;

          logger.info("ERC-20 transfer detected", {
            txHash,
            contractAddress: tx.to,
            actualRecipient,
            tokenAddress,
            tokenAmount,
          });
        }
      }

      return {
        hash: tx.hash,
        from: tx.from,
        to: tx.to || "",
        value: tx.value.toString(),
        gas: tx.gas.toString(),
        gasPrice: tx.gasPrice?.toString() || "0",
        nonce: tx.nonce,
        blockNumber: tx.blockNumber ? Number(tx.blockNumber) : undefined,
        blockHash: tx.blockHash,
        transactionIndex: tx.transactionIndex,
        status: receipt
          ? receipt.status === "success"
            ? "confirmed"
            : "failed"
          : "pending",
        confirmations: tx.blockNumber
          ? await this.getConfirmations(network, tx.blockNumber)
          : 0,
        timestamp: blockDetails?.timestamp
          ? Number(blockDetails.timestamp)
          : undefined,
        // ERC-20 specific fields
        isERC20Transfer,
        actualRecipient,
        tokenAddress,
        tokenAmount,
      };
    } catch (error) {
      logger.error("Error getting transaction details", error as Error, {
        network,
        txHash,
      });
      return null;
    }
  }

  /**
   * Get transaction details from Etherscan API (more detailed info)
   */
  async getTransactionFromEtherscan(
    network: string,
    txHash: string
  ): Promise<any> {
    try {
      const config = this.configs.get(network);

      if (!config) {
        throw new Error(`Network ${network} not configured`);
      }

      const response = await axios.get(config.etherscanUrl, {
        params: {
          module: "proxy",
          action: "eth_getTransactionByHash",
          txhash: txHash,
          apikey: config.etherscanApiKey,
        },
      });

      if (response.data.error) {
        throw new Error(`Etherscan API error: ${response.data.error.message}`);
      }

      return response.data.result;
    } catch (error) {
      logger.error("Error getting transaction from Etherscan", error as Error, {
        network,
        txHash,
      });
      return null;
    }
  }

  /**
   * Get transaction receipt from Etherscan
   */
  async getTransactionReceiptFromEtherscan(
    network: string,
    txHash: string
  ): Promise<TransactionReceipt | null> {
    try {
      const config = this.configs.get(network);

      if (!config) {
        throw new Error(`Network ${network} not configured`);
      }

      const response = await axios.get(config.etherscanUrl, {
        params: {
          module: "proxy",
          action: "eth_getTransactionReceipt",
          txhash: txHash,
          apikey: config.etherscanApiKey,
        },
      });

      if (response.data.error) {
        throw new Error(`Etherscan API error: ${response.data.error.message}`);
      }

      return response.data.result;
    } catch (error) {
      logger.error(
        "Error getting transaction receipt from Etherscan",
        error as Error,
        { network, txHash }
      );
      return null;
    }
  }

  /**
   * Get current block number
   */
  async getCurrentBlockNumber(network: string): Promise<number> {
    try {
      const client = this.clients.get(network);

      if (!client) {
        throw new Error(`Network ${network} not configured`);
      }

      const blockNumber = await client.getBlockNumber();
      return Number(blockNumber);
    } catch (error) {
      logger.error("Error getting current block number", error as Error, {
        network,
      });
      throw error;
    }
  }

  /**
   * Get number of confirmations for a transaction
   */
  async getConfirmations(
    network: string,
    blockNumber: bigint
  ): Promise<number> {
    try {
      const currentBlock = await this.getCurrentBlockNumber(network);
      return Math.max(0, currentBlock - Number(blockNumber));
    } catch (error) {
      logger.error("Error getting confirmations", error as Error, {
        network,
        blockNumber,
      });
      return 0;
    }
  }

  /**
   * Wait for transaction confirmation
   */
  async waitForTransaction(
    network: string,
    txHash: string,
    confirmations: number = 1
  ): Promise<TransactionDetails | null> {
    try {
      const client = this.clients.get(network);

      if (!client) {
        throw new Error(`Network ${network} not configured`);
      }

      // Wait for transaction to be mined
      const receipt = await client.waitForTransactionReceipt({
        hash: txHash as `0x${string}`,
        confirmations,
      });

      // Get updated transaction details
      return await this.getTransactionDetails(network, txHash);
    } catch (error) {
      logger.error("Error waiting for transaction", error as Error, {
        network,
        txHash,
        confirmations,
      });
      return null;
    }
  }

  /**
   * Check if transaction is confirmed (has required confirmations)
   */
  async isTransactionConfirmed(
    network: string,
    txHash: string,
    requiredConfirmations: number = 1
  ): Promise<boolean> {
    try {
      const txDetails = await this.getTransactionDetails(network, txHash);

      if (!txDetails || !txDetails.blockNumber) {
        return false;
      }

      return (
        txDetails.confirmations !== undefined &&
        txDetails.confirmations >= requiredConfirmations
      );
    } catch (error) {
      logger.error("Error checking transaction confirmation", error as Error, {
        network,
        txHash,
      });
      return false;
    }
  }

  /**
   * Get supported networks
   */
  getSupportedNetworks(): string[] {
    return Array.from(this.configs.keys());
  }

  /**
   * Check if network is supported
   */
  isNetworkSupported(network: string): boolean {
    return this.configs.has(network);
  }

  /**
   * Get default network for current environment
   */
  getDefaultNetwork(): string {
    return getBlockchainNetwork();
  }

  /**
   * Get current environment
   */
  getCurrentEnvironment(): string {
    return NODE_ENV;
  }
}

export const blockchainService = new BlockchainService();
