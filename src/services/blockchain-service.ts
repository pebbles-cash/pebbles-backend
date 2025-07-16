import { createPublicClient, http, getContract, parseAbi } from "viem";
import { mainnet, sepolia } from "viem/chains";
import axios from "axios";
import { logger } from "../utils/logger";

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

      // Get transaction receipt for status
      const receipt = await client.getTransactionReceipt({
        hash: txHash as `0x${string}`,
      });

      // Get block details if available
      let blockDetails = null;
      if (tx.blockNumber) {
        blockDetails = await client.getBlock({ blockNumber: tx.blockNumber });
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
          ? receipt.status === "0x1"
            ? "confirmed"
            : "failed"
          : "pending",
        confirmations: tx.blockNumber
          ? await this.getConfirmations(network, tx.blockNumber)
          : 0,
        timestamp: blockDetails?.timestamp
          ? Number(blockDetails.timestamp)
          : undefined,
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

      return txDetails.confirmations >= requiredConfirmations;
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
}

export const blockchainService = new BlockchainService();
