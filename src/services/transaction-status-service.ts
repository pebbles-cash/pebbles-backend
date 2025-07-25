import { Transaction, User } from "../models";
import { blockchainService } from "./blockchain-service";
import { logger } from "../utils/logger";
import { connectToDatabase } from "./mongoose";
import { sendTransactionConfirmationNotification } from "./notification-service";

export interface TransactionStatusUpdate {
  transactionId: string;
  status: "pending" | "completed" | "failed";
  blockNumber?: number;
  confirmations?: number;
  error?: string;
  updatedAt: Date;
}

export interface StatusCheckResult {
  isConfirmed: boolean;
  status: "pending" | "completed" | "failed";
  confirmations: number;
  blockNumber?: number;
  error?: string;
}

class TransactionStatusService {
  private readonly MAX_RETRIES = 10;
  private readonly RETRY_DELAY = 2000; // 2 seconds
  private readonly CONFIRMATION_THRESHOLD = 1; // Number of confirmations required

  // Network ID to network name mapping
  private readonly NETWORK_MAP: Record<number, string> = {
    1: "ethereum", // Ethereum mainnet
    11155111: "sepolia", // Sepolia testnet
    56: "bsc", // BNB Smart Chain (BSC)
  };

  /**
   * Convert network ID to network name
   */
  private getNetworkName(networkId: number): string {
    const networkName = this.NETWORK_MAP[networkId];
    if (!networkName) {
      throw new Error(
        `Unsupported network ID: ${networkId}. Supported networks: ${Object.keys(this.NETWORK_MAP).join(", ")}`
      );
    }
    return networkName;
  }

  /**
   * Check if network ID is supported
   */
  private isNetworkIdSupported(networkId: number): boolean {
    return networkId in this.NETWORK_MAP;
  }

  /**
   * Process a new transaction hash and create/update transaction record
   */
  async processTransactionHash(
    userId: string,
    txHash: string,
    networkId: number = 1, // Default to Ethereum mainnet (1)
    metadata: any = {}
  ): Promise<{
    success: boolean;
    transactionId?: string;
    error?: string;
    message?: string;
  }> {
    try {
      // Ensure database connection is established
      await connectToDatabase();

      // Validate network ID
      if (!this.isNetworkIdSupported(networkId)) {
        return {
          success: false,
          error: `Unsupported network ID: ${networkId}. Supported networks: ${Object.keys(this.NETWORK_MAP).join(", ")}`,
        };
      }

      // Convert network ID to network name for blockchain service
      const networkName = this.getNetworkName(networkId);

      // Check if transaction already exists
      const existingTransaction = await Transaction.findOne({ txHash });
      if (existingTransaction) {
        logger.info("Transaction already exists", {
          txHash,
          transactionId: existingTransaction._id,
        });
        return {
          success: true,
          transactionId: existingTransaction._id.toString(),
        };
      }

      // Get transaction details from blockchain with retry logic
      const txDetails = await blockchainService.getTransactionDetails(
        networkName,
        txHash
      );

      // If transaction is not found immediately, it might be pending in mempool
      // We'll create a pending transaction record and monitor it
      if (!txDetails) {
        logger.info(
          "Transaction not found immediately, creating pending record",
          {
            txHash,
            networkName,
            userId,
          }
        );

        // Create a pending transaction record
        const pendingTransaction = new Transaction({
          type: metadata.type || "payment",
          fromUserId: userId, // For pending transactions, assume user is sender
          toUserId: userId, // Will be updated when we get actual details
          fromAddress: "pending", // Placeholder
          toAddress: "pending", // Placeholder
          amount: "0", // Placeholder
          tokenAddress: metadata.tokenAddress || "0x0",
          sourceChain: networkName,
          destinationChain: networkName,
          txHash: txHash,
          status: "pending",
          category: metadata.category || "blockchain_transaction",
          tags: metadata.tags || ["blockchain", "pending"],
          client: metadata.client || "blockchain",
          projectId: metadata.projectId,
          metadata: {
            ...metadata,
            isPending: true,
            networkId,
            networkName,
            createdAt: new Date(),
          },
        });

        await pendingTransaction.save();

        // Do immediate check first (most transactions are mined within seconds)
        this.immediateTransactionCheck(
          pendingTransaction._id.toString(),
          txHash,
          networkId,
          userId,
          metadata
        );

        return {
          success: true,
          transactionId: pendingTransaction._id.toString(),
          message:
            "Transaction submitted to blockchain. Status will be updated when mined.",
        };
      }

      // Validate that we have the required transaction data
      if (!txDetails.from || !txDetails.to) {
        return {
          success: false,
          error: "Invalid transaction data from blockchain",
        };
      }

      // Get the authenticated user's wallet address
      const user = await User.findById(userId);
      if (!user) {
        return {
          success: false,
          error: "User not found",
        };
      }

      const userWalletAddress = user.primaryWalletAddress?.toLowerCase();
      if (!userWalletAddress) {
        return {
          success: false,
          error: "User wallet address not found",
        };
      }

      // Determine user's role based on blockchain transaction
      const txFromAddress = txDetails.from.toLowerCase();

      // Use actual recipient for ERC-20 transfers, otherwise use the 'to' address
      const txToAddress =
        txDetails.isERC20Transfer && txDetails.actualRecipient
          ? txDetails.actualRecipient.toLowerCase()
          : txDetails.to.toLowerCase();

      let fromUserId = undefined;
      let toUserId = undefined;

      // Check if the authenticated user is the sender
      if (txFromAddress === userWalletAddress) {
        fromUserId = userId;
        // For blockchain transactions, we might not know the recipient user ID
        // We'll need to either find them by address or create a placeholder
        const recipientUser = await User.findOne({
          primaryWalletAddress: { $regex: new RegExp(txToAddress, "i") },
        });
        toUserId = recipientUser?._id || userId; // Use self if recipient not found
      }
      // Check if the authenticated user is the recipient
      else if (txToAddress === userWalletAddress) {
        toUserId = userId;
        // Find the sender user by their address
        const senderUser = await User.findOne({
          primaryWalletAddress: { $regex: new RegExp(txFromAddress, "i") },
        });
        fromUserId = senderUser?._id; // Can be undefined if sender not in our system
      }
      // If user is neither sender nor recipient, this might be a transaction they're tracking
      else {
        // For tracking purposes, we'll create a record where the user is the recipient
        // and the sender is unknown (fromUserId = undefined)
        toUserId = userId;
        fromUserId = undefined;
      }

      // Determine the correct addresses and amounts for the transaction record
      const fromAddress = txDetails.from;
      const toAddress =
        txDetails.isERC20Transfer && txDetails.actualRecipient
          ? txDetails.actualRecipient
          : txDetails.to;
      const amount =
        txDetails.isERC20Transfer && txDetails.tokenAmount
          ? txDetails.tokenAmount
          : txDetails.value;
      const tokenAddress =
        txDetails.isERC20Transfer && txDetails.tokenAddress
          ? txDetails.tokenAddress
          : metadata.tokenAddress || "0x0";

      // Create transaction record
      const transaction = new Transaction({
        type: metadata.type || "payment", // Use "payment" for blockchain transactions
        fromUserId: fromUserId,
        toUserId: toUserId,
        fromAddress: fromAddress,
        toAddress: toAddress,
        amount: amount,
        tokenAddress: tokenAddress,
        sourceChain: networkName,
        destinationChain: networkName,
        txHash: txHash,
        status: this.mapBlockchainStatus(txDetails.status),
        category: metadata.category || "blockchain_transaction",
        tags: metadata.tags || ["blockchain"],
        client: metadata.client || "blockchain",
        projectId: metadata.projectId,
        metadata: {
          ...metadata,
          blockchainDetails: {
            gas: txDetails.gas,
            gasPrice: txDetails.gasPrice,
            nonce: txDetails.nonce,
            blockNumber: txDetails.blockNumber,
            confirmations: txDetails.confirmations,
            timestamp: txDetails.timestamp,
            isERC20Transfer: txDetails.isERC20Transfer,
            contractAddress: txDetails.isERC20Transfer
              ? txDetails.to
              : undefined,
          },
          networkId,
          networkName,
        },
      });

      // Log transaction creation details for debugging
      logger.info("Creating transaction record", {
        txHash,
        userId,
        userWalletAddress,
        fromUserId,
        toUserId,
        fromAddress: txDetails.from,
        toAddress: txDetails.to,
        actualRecipient: txDetails.actualRecipient,
        isERC20Transfer: txDetails.isERC20Transfer,
        tokenAddress: txDetails.tokenAddress,
        tokenAmount: txDetails.tokenAmount,
        networkId,
        networkName,
        type: metadata.type || "payment",
        userRole:
          txFromAddress === userWalletAddress
            ? "sender"
            : txToAddress === userWalletAddress
              ? "recipient"
              : "tracking",
      });

      await transaction.save();

      // Start async status monitoring
      this.monitorTransactionStatus(
        transaction._id.toString(),
        txHash,
        networkId
      );

      logger.info("Transaction processed successfully", {
        txHash,
        transactionId: transaction._id.toString(),
        networkId,
        networkName,
        status: transaction.status,
      });

      return {
        success: true,
        transactionId: transaction._id.toString(),
      };
    } catch (error) {
      logger.error("Error processing transaction hash", error as Error, {
        txHash,
        userId,
        networkId,
        error: error instanceof Error ? error.message : String(error),
      });
      return {
        success: false,
        error:
          error instanceof Error
            ? error.message
            : "Failed to process transaction",
      };
    }
  }

  /**
   * Immediate transaction check - tries to find the transaction right away
   * Most transactions are mined within seconds, so this catches them immediately
   */
  private async immediateTransactionCheck(
    transactionId: string,
    txHash: string,
    networkId: number,
    userId: string,
    metadata: any
  ): Promise<void> {
    try {
      logger.info("Starting immediate transaction check", {
        transactionId,
        txHash,
        networkId,
      });

      const networkName = this.getNetworkName(networkId);
      const blockchainData = await blockchainService.getTransactionDetails(
        networkName,
        txHash
      );

      if (blockchainData) {
        // Transaction found immediately! Update with real data
        logger.info("Transaction found immediately on blockchain", {
          transactionId,
          txHash,
          networkName,
          blockNumber: blockchainData.blockNumber,
          confirmations: blockchainData.confirmations,
        });

        // Get the authenticated user's wallet address
        const user = await User.findById(userId);
        const userWalletAddress = user?.primaryWalletAddress?.toLowerCase();

        // Determine user's role based on blockchain transaction
        const txFromAddress = blockchainData.from.toLowerCase();
        const txToAddress =
          blockchainData.isERC20Transfer && blockchainData.actualRecipient
            ? blockchainData.actualRecipient.toLowerCase()
            : blockchainData.to.toLowerCase();

        let fromUserId = undefined;
        let toUserId = undefined;

        // Check if the authenticated user is the sender
        if (userWalletAddress && txFromAddress === userWalletAddress) {
          fromUserId = userId;
          const recipientUser = await User.findOne({
            primaryWalletAddress: { $regex: new RegExp(txToAddress, "i") },
          });
          toUserId = recipientUser?._id || userId;
        }
        // Check if the authenticated user is the recipient
        else if (userWalletAddress && txToAddress === userWalletAddress) {
          toUserId = userId;
          const senderUser = await User.findOne({
            primaryWalletAddress: { $regex: new RegExp(txFromAddress, "i") },
          });
          fromUserId = senderUser?._id;
        }
        // If user is neither sender nor recipient, this might be a transaction they're tracking
        else {
          toUserId = userId;
          fromUserId = undefined;
        }

        // Determine the correct addresses and amounts
        const fromAddress = blockchainData.from;
        const toAddress =
          blockchainData.isERC20Transfer && blockchainData.actualRecipient
            ? blockchainData.actualRecipient
            : blockchainData.to;
        const amount =
          blockchainData.isERC20Transfer && blockchainData.tokenAmount
            ? blockchainData.tokenAmount
            : blockchainData.value;
        const tokenAddress =
          blockchainData.isERC20Transfer && blockchainData.tokenAddress
            ? blockchainData.tokenAddress
            : metadata.tokenAddress || "0x0";

        // Update transaction with real blockchain data
        const updateData: any = {
          fromUserId,
          toUserId,
          fromAddress,
          toAddress,
          amount,
          tokenAddress,
          status: this.mapBlockchainStatus(blockchainData.status),
          updatedAt: new Date(),
          metadata: {
            ...metadata,
            blockchainDetails: {
              gas: blockchainData.gas,
              gasPrice: blockchainData.gasPrice,
              nonce: blockchainData.nonce,
              blockNumber: blockchainData.blockNumber,
              confirmations: blockchainData.confirmations,
              timestamp: blockchainData.timestamp,
              isERC20Transfer: blockchainData.isERC20Transfer,
              contractAddress: blockchainData.isERC20Transfer
                ? blockchainData.to
                : undefined,
            },
            networkId,
            networkName,
            isPending: false,
            immediateCheck: true,
          },
        };

        await Transaction.findByIdAndUpdate(transactionId, {
          $set: updateData,
        });

        // Start normal status monitoring for confirmations
        this.monitorTransactionStatus(transactionId, txHash, networkId);

        logger.info("Transaction updated immediately with blockchain data", {
          transactionId,
          txHash,
          status: updateData.status,
          immediateCheck: true,
        });
      } else {
        // Transaction not found immediately, start background monitoring
        logger.info(
          "Transaction not found immediately, starting background monitoring",
          {
            transactionId,
            txHash,
            networkName,
          }
        );

        this.monitorPendingTransaction(
          transactionId,
          txHash,
          networkId,
          userId,
          metadata
        );
      }
    } catch (error) {
      logger.error("Error in immediate transaction check", error as Error, {
        transactionId,
        txHash,
        networkId,
      });

      // Fall back to background monitoring if immediate check fails
      this.monitorPendingTransaction(
        transactionId,
        txHash,
        networkId,
        userId,
        metadata
      );
    }
  }

  /**
   * Monitor pending transaction until it appears on blockchain
   */
  private async monitorPendingTransaction(
    transactionId: string,
    txHash: string,
    networkId: number,
    userId: string,
    metadata: any
  ): Promise<void> {
    let retries = 0;
    const maxRetries = 60; // Increased to 60 retries = 120 seconds total
    const retryDelay = 2000; // 2 seconds

    logger.info("Starting pending transaction monitoring", {
      transactionId,
      txHash,
      networkId,
      maxRetries,
      retryDelay,
    });

    const checkPendingStatus = async (): Promise<void> => {
      try {
        const transaction = await Transaction.findById(transactionId);
        if (!transaction) {
          logger.warn("Pending transaction not found during monitoring", {
            transactionId,
          });
          return;
        }

        const networkName = this.getNetworkName(networkId);
        const txDetails = await blockchainService.getTransactionDetails(
          networkName,
          txHash
        );

        if (txDetails) {
          // Transaction found on blockchain! Update the record with real data
          logger.info("Pending transaction found on blockchain", {
            transactionId,
            txHash,
            networkName,
          });

          // Get the authenticated user's wallet address
          const user = await User.findById(userId);
          const userWalletAddress = user?.primaryWalletAddress?.toLowerCase();

          // Determine user's role based on blockchain transaction
          const txFromAddress = txDetails.from.toLowerCase();
          const txToAddress =
            txDetails.isERC20Transfer && txDetails.actualRecipient
              ? txDetails.actualRecipient.toLowerCase()
              : txDetails.to.toLowerCase();

          let fromUserId = undefined;
          let toUserId = undefined;

          // Check if the authenticated user is the sender
          if (userWalletAddress && txFromAddress === userWalletAddress) {
            fromUserId = userId;
            const recipientUser = await User.findOne({
              primaryWalletAddress: { $regex: new RegExp(txToAddress, "i") },
            });
            toUserId = recipientUser?._id || userId;
          }
          // Check if the authenticated user is the recipient
          else if (userWalletAddress && txToAddress === userWalletAddress) {
            toUserId = userId;
            const senderUser = await User.findOne({
              primaryWalletAddress: { $regex: new RegExp(txFromAddress, "i") },
            });
            fromUserId = senderUser?._id;
          }
          // If user is neither sender nor recipient, this might be a transaction they're tracking
          else {
            toUserId = userId;
            fromUserId = undefined;
          }

          // Determine the correct addresses and amounts
          const fromAddress = txDetails.from;
          const toAddress =
            txDetails.isERC20Transfer && txDetails.actualRecipient
              ? txDetails.actualRecipient
              : txDetails.to;
          const amount =
            txDetails.isERC20Transfer && txDetails.tokenAmount
              ? txDetails.tokenAmount
              : txDetails.value;
          const tokenAddress =
            txDetails.isERC20Transfer && txDetails.tokenAddress
              ? txDetails.tokenAddress
              : metadata.tokenAddress || "0x0";

          // Update transaction with real blockchain data
          const updateData: any = {
            fromUserId,
            toUserId,
            fromAddress,
            toAddress,
            amount,
            tokenAddress,
            status: this.mapBlockchainStatus(txDetails.status),
            updatedAt: new Date(),
            metadata: {
              ...metadata,
              blockchainDetails: {
                gas: txDetails.gas,
                gasPrice: txDetails.gasPrice,
                nonce: txDetails.nonce,
                blockNumber: txDetails.blockNumber,
                confirmations: txDetails.confirmations,
                timestamp: txDetails.timestamp,
                isERC20Transfer: txDetails.isERC20Transfer,
                contractAddress: txDetails.isERC20Transfer
                  ? txDetails.to
                  : undefined,
              },
              networkId,
              networkName,
              isPending: false,
            },
          };

          // Use updateTransactionStatus to ensure notifications are sent if status changes
          await this.updateTransactionStatus(
            transactionId,
            "pending",
            updateData
          );

          // Start normal status monitoring
          this.monitorTransactionStatus(transactionId, txHash, networkId);

          logger.info("Pending transaction updated with blockchain data", {
            transactionId,
            txHash,
            status: updateData.status,
          });
        } else if (retries < maxRetries) {
          // Transaction still not found, retry
          retries++;
          logger.info("Transaction not found yet, retrying", {
            transactionId,
            txHash,
            retry: retries,
            maxRetries,
          });
          setTimeout(checkPendingStatus, retryDelay);
        } else {
          // Max retries reached, mark as failed
          logger.warn("Max retries reached for pending transaction", {
            transactionId,
            txHash,
            retries,
            maxRetries,
          });
          await this.updateTransactionStatus(transactionId, "failed", {
            error: "Transaction not found on blockchain after maximum retries",
          });
        }
      } catch (error) {
        logger.error("Error monitoring pending transaction", error as Error, {
          transactionId,
          txHash,
          retries,
        });

        if (retries < maxRetries) {
          retries++;
          setTimeout(checkPendingStatus, retryDelay);
        } else {
          await this.updateTransactionStatus(transactionId, "failed", {
            error: "Status monitoring failed after maximum retries",
          });
        }
      }
    };

    // Start monitoring
    setTimeout(checkPendingStatus, retryDelay);
  }

  /**
   * Monitor transaction status asynchronously
   */
  private async monitorTransactionStatus(
    transactionId: string,
    txHash: string,
    networkId: number
  ): Promise<void> {
    let retries = 0;
    let lastStatus: string | null = null;

    const checkStatus = async (): Promise<void> => {
      try {
        const transaction = await Transaction.findById(transactionId);
        if (!transaction) {
          logger.warn("Transaction not found during status monitoring", {
            transactionId,
          });
          return;
        }

        // Convert network ID to network name for blockchain service
        const networkName = this.getNetworkName(networkId);

        // Get updated transaction details from blockchain
        const txDetails = await blockchainService.getTransactionDetails(
          networkName,
          txHash
        );

        if (!txDetails) {
          if (retries < this.MAX_RETRIES) {
            retries++;
            setTimeout(checkStatus, this.RETRY_DELAY);
          } else {
            await this.updateTransactionStatus(transactionId, "failed", {
              error: "Transaction not found after maximum retries",
            });
          }
          return;
        }

        const newStatus = this.mapBlockchainStatus(txDetails.status);
        const isConfirmed = await blockchainService.isTransactionConfirmed(
          networkName,
          txHash,
          this.CONFIRMATION_THRESHOLD
        );

        // Update transaction if status changed
        if (newStatus !== lastStatus || isConfirmed) {
          const updateData: any = {
            status: isConfirmed ? "completed" : newStatus,
            updatedAt: new Date(),
          };

          // Update metadata with latest blockchain details
          if (transaction.metadata) {
            transaction.metadata.blockchainDetails = {
              gas: txDetails.gas,
              gasPrice: txDetails.gasPrice,
              nonce: txDetails.nonce,
              blockNumber: txDetails.blockNumber,
              confirmations: txDetails.confirmations,
              timestamp: txDetails.timestamp,
              isERC20Transfer: txDetails.isERC20Transfer,
              contractAddress: txDetails.isERC20Transfer
                ? txDetails.to
                : undefined,
            };
          }

          // If this is an ERC-20 transfer and we have updated details, update the transaction record
          if (txDetails.isERC20Transfer && txDetails.actualRecipient) {
            updateData.toAddress = txDetails.actualRecipient;
            updateData.amount = txDetails.tokenAmount || txDetails.value;
            updateData.tokenAddress =
              txDetails.tokenAddress || transaction.tokenAddress;

            logger.info("Updating ERC-20 transaction with correct recipient", {
              transactionId,
              txHash,
              contractAddress: txDetails.to,
              actualRecipient: txDetails.actualRecipient,
              tokenAddress: txDetails.tokenAddress,
              tokenAmount: txDetails.tokenAmount,
            });
          }

          // Use updateTransactionStatus to ensure notifications are sent
          await this.updateTransactionStatus(
            transactionId,
            updateData.status,
            updateData
          );

          lastStatus = newStatus;

          logger.info("Transaction status updated", {
            transactionId,
            txHash,
            status: updateData.status,
            confirmations: txDetails.confirmations,
            isERC20Transfer: txDetails.isERC20Transfer,
          });
        }

        // Continue monitoring if not confirmed
        if (!isConfirmed && retries < this.MAX_RETRIES) {
          retries++;
          setTimeout(checkStatus, this.RETRY_DELAY);
        }
      } catch (error) {
        logger.error("Error monitoring transaction status", error as Error, {
          transactionId,
          txHash,
          retries,
        });

        if (retries < this.MAX_RETRIES) {
          retries++;
          setTimeout(checkStatus, this.RETRY_DELAY);
        } else {
          await this.updateTransactionStatus(transactionId, "failed", {
            error: "Status monitoring failed after maximum retries",
          });
        }
      }
    };

    // Start monitoring
    setTimeout(checkStatus, this.RETRY_DELAY);
  }

  /**
   * Update transaction status
   */
  private async updateTransactionStatus(
    transactionId: string,
    status: "pending" | "completed" | "failed",
    additionalData: any = {}
  ): Promise<void> {
    try {
      const updateData: any = {
        status,
        updatedAt: new Date(),
      };

      if (additionalData.error) {
        if (!updateData.metadata) updateData.metadata = {};
        updateData.metadata.error = additionalData.error;
      }

      await Transaction.findByIdAndUpdate(transactionId, { $set: updateData });

      logger.info("Transaction status updated", {
        transactionId,
        status,
        error: additionalData.error,
      });

      // Send notifications when transaction is completed
      if (status === "completed") {
        try {
          const transaction = await Transaction.findById(transactionId);
          if (transaction && transaction.fromUserId && transaction.toUserId) {
            // Get token symbol for currency
            const { getTokenSymbol } = await import("../utils/token-symbols");
            const currency = getTokenSymbol(
              transaction.tokenAddress,
              transaction.sourceChain
            );

            await sendTransactionConfirmationNotification(
              transactionId,
              transaction.fromUserId.toString(),
              transaction.toUserId.toString(),
              transaction.amount,
              currency,
              transaction.type as "payment" | "tip" | "subscription"
            );

            logger.info("Transaction confirmation notifications sent", {
              transactionId,
              fromUserId: transaction.fromUserId,
              toUserId: transaction.toUserId,
            });
          }
        } catch (notificationError) {
          logger.error(
            "Error sending transaction confirmation notifications",
            notificationError as Error,
            {
              transactionId,
              status,
            }
          );
          // Don't fail the transaction update if notifications fail
        }
      }
    } catch (error) {
      logger.error("Error updating transaction status", error as Error, {
        transactionId,
        status,
      });
    }
  }

  /**
   * Check transaction status immediately
   */
  async checkTransactionStatus(
    txHash: string,
    networkId: number = 1 // Default to Ethereum mainnet (1)
  ): Promise<StatusCheckResult> {
    try {
      // Ensure database connection is established
      await connectToDatabase();

      const networkName = this.getNetworkName(networkId);
      const txDetails = await blockchainService.getTransactionDetails(
        networkName,
        txHash
      );

      if (!txDetails) {
        return {
          isConfirmed: false,
          status: "pending",
          confirmations: 0,
          error: "Transaction not found",
        };
      }

      const isConfirmed = await blockchainService.isTransactionConfirmed(
        networkName,
        txHash,
        this.CONFIRMATION_THRESHOLD
      );

      return {
        isConfirmed,
        status: this.mapBlockchainStatus(txDetails.status),
        confirmations: txDetails.confirmations || 0,
        blockNumber: txDetails.blockNumber,
      };
    } catch (error) {
      logger.error("Error checking transaction status", error as Error, {
        txHash,
        networkId,
      });
      return {
        isConfirmed: false,
        status: "pending",
        confirmations: 0,
        error: "Failed to check status",
      };
    }
  }

  /**
   * Get transaction status with retry logic
   */
  async getTransactionStatusWithRetry(
    txHash: string,
    networkId: number = 1, // Default to Ethereum mainnet (1)
    maxRetries: number = 5
  ): Promise<StatusCheckResult> {
    for (let i = 0; i < maxRetries; i++) {
      const result = await this.checkTransactionStatus(txHash, networkId);

      if (result.isConfirmed || result.status === "failed") {
        return result;
      }

      if (i < maxRetries - 1) {
        await new Promise((resolve) => setTimeout(resolve, this.RETRY_DELAY));
      }
    }

    return await this.checkTransactionStatus(txHash, networkId);
  }

  /**
   * Map blockchain status to our status format
   */
  private mapBlockchainStatus(
    blockchainStatus?: string
  ): "pending" | "completed" | "failed" {
    switch (blockchainStatus) {
      case "confirmed":
        return "completed";
      case "failed":
        return "failed";
      case "pending":
      default:
        return "pending";
    }
  }

  /**
   * Get supported networks
   */
  getSupportedNetworks(): string[] {
    return blockchainService.getSupportedNetworks();
  }

  /**
   * Fix pending transactions that might have been missed by monitoring
   * This can be called manually or as a scheduled task
   */
  async fixPendingTransactions(): Promise<{
    fixed: number;
    errors: number;
    skipped: number;
  }> {
    try {
      await connectToDatabase();

      // Find all pending transactions with better query
      const pendingTransactions = await Transaction.find({
        $or: [
          { status: "pending" },
          { "metadata.isPending": true },
          { fromAddress: "pending" },
          { toAddress: "pending" },
          { amount: "0" },
        ],
      }).sort({ createdAt: 1 }); // Process oldest first

      logger.info("Found pending transactions to fix", {
        count: pendingTransactions.length,
      });

      let fixed = 0;
      let errors = 0;
      let skipped = 0;

      for (const transaction of pendingTransactions) {
        try {
          const txHash = transaction.txHash;
          if (!txHash) {
            logger.warn("Transaction missing txHash, skipping", {
              transactionId: transaction._id,
            });
            skipped++;
            continue;
          }

          const networkId = (transaction.metadata as any)?.networkId || 1;
          const networkName = this.getNetworkName(networkId);

          logger.info("Processing pending transaction", {
            transactionId: transaction._id,
            txHash,
            networkName,
            createdAt: transaction.createdAt,
          });

          // Check if transaction is now on blockchain
          const blockchainData = await blockchainService.getTransactionDetails(
            networkName,
            txHash || ""
          );

          if (blockchainData) {
            // Transaction found! Update with real data
            const updateData = await this.buildTransactionUpdateData(
              blockchainData,
              networkId,
              transaction.metadata
            );

            // Use updateTransactionStatus to ensure notifications are sent
            await this.updateTransactionStatus(
              transaction._id.toString(),
              "completed",
              updateData
            );

            logger.info("Fixed pending transaction", {
              transactionId: transaction._id,
              txHash,
              status: "completed",
              blockNumber: blockchainData.blockNumber,
              confirmations: blockchainData.confirmations,
            });

            fixed++;
          } else {
            // Still not found, check if it's been too long
            const createdAt = new Date(transaction.createdAt);
            const now = new Date();
            const hoursSinceCreation =
              (now.getTime() - createdAt.getTime()) / (1000 * 60 * 60);

            if (hoursSinceCreation > 2) {
              // Mark as failed if it's been more than 2 hours
              await this.updateTransactionStatus(
                transaction._id.toString(),
                "failed",
                {
                  error: `Transaction not found on blockchain after ${Math.round(hoursSinceCreation)} hours`,
                  hoursSinceCreation: Math.round(hoursSinceCreation),
                }
              );

              logger.warn("Marked old pending transaction as failed", {
                transactionId: transaction._id,
                txHash,
                hoursSinceCreation: Math.round(hoursSinceCreation),
              });
            } else {
              logger.info("Transaction still pending, will retry later", {
                transactionId: transaction._id,
                txHash,
                hoursSinceCreation: Math.round(hoursSinceCreation),
              });
              skipped++;
            }
          }
        } catch (error) {
          logger.error("Error fixing pending transaction", error as Error, {
            transactionId: transaction._id,
            txHash: transaction.txHash,
          });
          errors++;
        }
      }

      logger.info("Finished fixing pending transactions", {
        fixed,
        errors,
        skipped,
        total: pendingTransactions.length,
      });

      return { fixed, errors, skipped };
    } catch (error) {
      logger.error("Error in fixPendingTransactions", error as Error);
      return { fixed: 0, errors: 1, skipped: 0 };
    }
  }

  /**
   * Comprehensive pending transaction cleanup
   * This method handles all edge cases and provides detailed reporting
   */
  async comprehensivePendingTransactionCleanup(
    options: {
      dryRun?: boolean;
      maxTransactions?: number;
    } = {}
  ): Promise<{
    fixed: number;
    errors: number;
    skipped: number;
    failed: number;
    report: any;
  }> {
    const { dryRun = false, maxTransactions = 1000 } = options;
    const startTime = new Date();
    const report = {
      startTime,
      endTime: null as Date | null,
      duration: 0,
      transactions: {
        total: 0,
        fixed: 0,
        errors: 0,
        skipped: 0,
        failed: 0,
      },
      networks: {} as Record<string, any>,
      errors: [] as any[],
    };

    try {
      await connectToDatabase();

      // Find all transactions that need attention
      const pendingTransactions = await Transaction.find({
        $or: [
          { status: "pending" },
          { "metadata.isPending": true },
          { fromAddress: "pending" },
          { toAddress: "pending" },
          { amount: "0" },
          { tokenAddress: "0x0" },
        ],
      })
        .sort({ createdAt: 1 })
        .limit(maxTransactions);

      report.transactions.total = pendingTransactions.length;

      logger.info("Starting comprehensive pending transaction cleanup", {
        totalTransactions: pendingTransactions.length,
        startTime,
        dryRun,
        maxTransactions,
      });

      let fixed = 0;
      let errors = 0;
      let skipped = 0;
      let failed = 0;

      for (const transaction of pendingTransactions) {
        try {
          const txHash = transaction.txHash;
          if (!txHash) {
            logger.warn("Transaction missing txHash, skipping", {
              transactionId: transaction._id,
            });
            skipped++;
            continue;
          }

          // Use the stored networkId from metadata (this is what the frontend sent)
          let networkId = (transaction.metadata as any)?.networkId;

          // If networkId is missing, try to determine from transaction data
          if (!networkId) {
            logger.warn(
              "Transaction missing networkId in metadata, trying to determine from chain",
              {
                transactionId: transaction._id,
                txHash,
                sourceChain: transaction.sourceChain,
                destinationChain: transaction.destinationChain,
              }
            );

            // Try to determine network from chain names
            if (
              transaction.sourceChain === "sepolia" ||
              transaction.destinationChain === "sepolia"
            ) {
              networkId = 11155111; // Sepolia
            } else if (
              transaction.sourceChain === "ethereum" ||
              transaction.destinationChain === "ethereum"
            ) {
              networkId = 1; // Ethereum mainnet
            } else {
              logger.warn("Cannot determine network, skipping", {
                transactionId: transaction._id,
                txHash,
              });
              skipped++;
              continue;
            }
          }

          const networkName = this.getNetworkName(networkId);

          // Track network statistics
          if (!report.networks[networkName]) {
            report.networks[networkName] = { total: 0, fixed: 0, errors: 0 };
          }
          report.networks[networkName].total++;

          logger.info("Processing transaction for cleanup", {
            transactionId: transaction._id,
            txHash,
            networkName,
            networkId,
            createdAt: transaction.createdAt,
            status: transaction.status,
          });

          // Check blockchain status
          const blockchainData = dryRun
            ? null
            : await blockchainService.getTransactionDetails(
                networkName,
                txHash
              );

          if (blockchainData) {
            // Transaction found on blockchain
            const updateData = await this.buildTransactionUpdateData(
              blockchainData,
              networkId,
              transaction.metadata
            );

            if (!dryRun) {
              await this.updateTransactionStatus(
                transaction._id.toString(),
                "completed",
                updateData
              );
            }

            logger.info("Successfully fixed pending transaction", {
              transactionId: transaction._id,
              txHash,
              networkName,
              blockNumber: blockchainData.blockNumber,
              confirmations: blockchainData.confirmations,
              dryRun,
            });

            fixed++;
            report.transactions.fixed++;
            report.networks[networkName].fixed++;
          } else {
            // Transaction not found, check age
            const createdAt = new Date(transaction.createdAt);
            const now = new Date();
            const hoursSinceCreation =
              (now.getTime() - createdAt.getTime()) / (1000 * 60 * 60);

            if (hoursSinceCreation > 2) {
              // Mark as failed if too old
              if (!dryRun) {
                await this.updateTransactionStatus(
                  transaction._id.toString(),
                  "failed",
                  {
                    error: `Transaction not found on blockchain after ${Math.round(hoursSinceCreation)} hours`,
                    hoursSinceCreation: Math.round(hoursSinceCreation),
                    lastChecked: now,
                  }
                );
              }

              logger.warn("Marked old transaction as failed", {
                transactionId: transaction._id,
                txHash,
                networkName,
                hoursSinceCreation: Math.round(hoursSinceCreation),
                dryRun,
              });

              failed++;
              report.transactions.failed++;
            } else {
              logger.info("Transaction still pending, will retry later", {
                transactionId: transaction._id,
                txHash,
                networkName,
                hoursSinceCreation: Math.round(hoursSinceCreation),
              });
              skipped++;
              report.transactions.skipped++;
            }
          }
        } catch (error) {
          const errorInfo = {
            transactionId: transaction._id,
            txHash: transaction.txHash,
            error: error instanceof Error ? error.message : String(error),
            stack: error instanceof Error ? error.stack : undefined,
          };

          logger.error(
            "Error processing transaction in cleanup",
            error as Error,
            errorInfo
          );
          report.errors.push(errorInfo);
          errors++;
          report.transactions.errors++;
        }
      }

      const endTime = new Date();
      report.endTime = endTime;
      report.duration = endTime.getTime() - startTime.getTime();

      logger.info("Comprehensive pending transaction cleanup completed", {
        fixed,
        errors,
        skipped,
        failed,
        duration: report.duration,
        report,
      });

      return { fixed, errors, skipped, failed, report };
    } catch (error) {
      const endTime = new Date();
      report.endTime = endTime;
      report.duration = endTime.getTime() - startTime.getTime();

      logger.error(
        "Error in comprehensive pending transaction cleanup",
        error as Error
      );
      return { fixed: 0, errors: 1, skipped: 0, failed: 0, report };
    }
  }

  /**
   * Build transaction update data from blockchain data
   */
  private async buildTransactionUpdateData(
    blockchainData: any,
    networkId: number,
    metadata: any
  ): Promise<any> {
    // Find users based on addresses
    const fromUser = await User.findOne({
      primaryWalletAddress: { $regex: new RegExp(blockchainData.from, "i") },
    });

    const toUser = await User.findOne({
      primaryWalletAddress: {
        $regex: new RegExp(
          blockchainData.actualRecipient || blockchainData.to,
          "i"
        ),
      },
    });

    // Determine the correct addresses and amounts
    const fromAddress = blockchainData.from;
    const toAddress =
      blockchainData.isERC20Transfer && blockchainData.actualRecipient
        ? blockchainData.actualRecipient
        : blockchainData.to;
    const amount =
      blockchainData.isERC20Transfer && blockchainData.tokenAmount
        ? blockchainData.tokenAmount
        : blockchainData.value;
    const tokenAddress =
      blockchainData.isERC20Transfer && blockchainData.tokenAddress
        ? blockchainData.tokenAddress
        : "0x0";

    return {
      fromUserId: fromUser?._id,
      toUserId: toUser?._id,
      fromAddress,
      toAddress,
      amount,
      tokenAddress,
      status: this.mapBlockchainStatus(blockchainData.status),
      updatedAt: new Date(),
      metadata: {
        ...metadata,
        blockchainDetails: {
          gas: blockchainData.gas,
          gasPrice: blockchainData.gasPrice,
          nonce: blockchainData.nonce,
          blockNumber: blockchainData.blockNumber,
          confirmations: blockchainData.confirmations,
          timestamp: blockchainData.timestamp,
          isERC20Transfer: blockchainData.isERC20Transfer,
          contractAddress: blockchainData.isERC20Transfer
            ? blockchainData.to
            : undefined,
        },
        networkId,
        networkName: this.getNetworkName(networkId),
        isPending: false,
        fixedAt: new Date(),
      },
    };
  }
}

export const transactionStatusService = new TransactionStatusService();
