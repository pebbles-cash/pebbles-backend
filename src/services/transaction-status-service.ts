import { Transaction, User } from "../models";
import { blockchainService } from "./blockchain-service";
import { logger } from "../utils/logger";

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

  /**
   * Process a new transaction hash and create/update transaction record
   */
  async processTransactionHash(
    userId: string,
    txHash: string,
    network: string = "ethereum",
    metadata: any = {}
  ): Promise<{ success: boolean; transactionId?: string; error?: string }> {
    try {
      // Validate network
      if (!blockchainService.isNetworkSupported(network)) {
        return {
          success: false,
          error: `Unsupported network: ${network}. Supported networks: ${blockchainService.getSupportedNetworks().join(", ")}`,
        };
      }

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

      // Get transaction details from blockchain
      const txDetails = await blockchainService.getTransactionDetails(
        network,
        txHash
      );

      if (!txDetails) {
        return {
          success: false,
          error: "Transaction not found on blockchain",
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
        sourceChain: network,
        destinationChain: network,
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
          network,
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
        network,
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
        network
      );

      logger.info("Transaction processed successfully", {
        txHash,
        transactionId: transaction._id.toString(),
        network,
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
        network,
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
   * Monitor transaction status asynchronously
   */
  private async monitorTransactionStatus(
    transactionId: string,
    txHash: string,
    network: string
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

        // Get updated transaction details from blockchain
        const txDetails = await blockchainService.getTransactionDetails(
          network,
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
          network,
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

          await Transaction.findByIdAndUpdate(transactionId, {
            $set: updateData,
          });

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
    network: string = "ethereum"
  ): Promise<StatusCheckResult> {
    try {
      const txDetails = await blockchainService.getTransactionDetails(
        network,
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
        network,
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
        network,
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
    network: string = "ethereum",
    maxRetries: number = 5
  ): Promise<StatusCheckResult> {
    for (let i = 0; i < maxRetries; i++) {
      const result = await this.checkTransactionStatus(txHash, network);

      if (result.isConfirmed || result.status === "failed") {
        return result;
      }

      if (i < maxRetries - 1) {
        await new Promise((resolve) => setTimeout(resolve, this.RETRY_DELAY));
      }
    }

    return await this.checkTransactionStatus(txHash, network);
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
}

export const transactionStatusService = new TransactionStatusService();
