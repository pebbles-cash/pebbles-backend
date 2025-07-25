import { APIGatewayProxyEvent, APIGatewayProxyResult } from "aws-lambda";
import { connectToDatabase } from "../services/mongoose";
import { transactionStatusService } from "../services/transaction-status-service";
import { logger } from "../utils/logger";
import { FiatInteraction } from "../models";

/**
 * Scheduled task to clean up pending transactions
 * This can be triggered by AWS EventBridge every 5 minutes
 */
export const cleanupPendingTransactions = async (
  event: APIGatewayProxyEvent
): Promise<APIGatewayProxyResult> => {
  try {
    logger.info("Starting scheduled pending transaction cleanup", {
      event: event.body ? JSON.parse(event.body) : event,
    });

    // Run comprehensive cleanup with limits for scheduled task
    const result =
      await transactionStatusService.comprehensivePendingTransactionCleanup({
        dryRun: false,
        maxTransactions: 50, // Process fewer transactions in scheduled task
      });

    logger.info("Scheduled cleanup completed", {
      fixed: result.fixed,
      errors: result.errors,
      skipped: result.skipped,
      failed: result.failed,
      duration: result.report.duration,
    });

    return {
      statusCode: 200,
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        message: "Scheduled cleanup completed successfully",
        result,
      }),
    };
  } catch (error) {
    logger.error("Error in scheduled cleanup", error as Error);
    return {
      statusCode: 500,
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        message: "Scheduled cleanup failed",
        error: error instanceof Error ? error.message : String(error),
      }),
    };
  }
};

/**
 * Health check for scheduled tasks
 */
export const scheduledTaskHealthCheck = async (
  event: APIGatewayProxyEvent
): Promise<APIGatewayProxyResult> => {
  try {
    await connectToDatabase();

    // Count pending transactions
    const { Transaction } = await import("../models");
    const pendingCount = await Transaction.countDocuments({
      $or: [
        { status: "pending" },
        { "metadata.isPending": true },
        { fromAddress: "pending" },
        { toAddress: "pending" },
        { amount: "0" },
        { tokenAddress: "0x0" },
      ],
    });

    return {
      statusCode: 200,
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        message: "Scheduled task health check",
        pendingTransactions: pendingCount,
        timestamp: new Date().toISOString(),
      }),
    };
  } catch (error) {
    logger.error("Error in scheduled task health check", error as Error);
    return {
      statusCode: 500,
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        message: "Health check failed",
        error: error instanceof Error ? error.message : String(error),
      }),
    };
  }
};

/**
 * Automatically update pending FiatInteractions with detailed data from Meld API
 * This runs every 10 minutes to ensure pending transactions get updated
 */
export const autoUpdatePendingFiatInteractions = async (): Promise<void> => {
  try {
    await connectToDatabase();

    logger.info("Starting automatic update of pending FiatInteractions");

    // Find all pending FiatInteractions that have a customer ID
    const pendingInteractions = await FiatInteraction.find({
      status: "pending",
      meldCustomerId: { $exists: true, $ne: null },
    }).limit(50); // Process in batches to avoid timeout

    if (pendingInteractions.length === 0) {
      logger.info("No pending FiatInteractions found for automatic update");
      return;
    }

    logger.info(
      `Found ${pendingInteractions.length} pending FiatInteractions to update`
    );

    let updatedCount = 0;
    let errorCount = 0;

    // Import meldService
    const { meldService } = await import("../services/meld-service");

    for (const fiatInteraction of pendingInteractions) {
      try {
        const customerId = fiatInteraction.meldCustomerId;
        if (!customerId) {
          logger.warn("FiatInteraction missing customer ID", {
            fiatInteractionId: fiatInteraction._id.toString(),
          });
          continue;
        }

        // Fetch detailed transaction information from Meld API
        const detailedTransactionData =
          await meldService.getPaymentTransaction(customerId);

        if (!detailedTransactionData?.transaction) {
          logger.warn("No detailed transaction data found", {
            customerId,
            fiatInteractionId: fiatInteraction._id.toString(),
          });
          continue;
        }

        const transactionData = detailedTransactionData.transaction;

        // Extract amounts from detailed transaction data using Meld API format
        const sourceAmount =
          transactionData.sourceAmount || fiatInteraction.sourceAmount || 0;
        const sourceCurrencyCode =
          transactionData.sourceCurrencyCode ||
          fiatInteraction.sourceCurrencyCode ||
          "USD";
        const destinationAmount =
          transactionData.destinationAmount ||
          fiatInteraction.destinationAmount ||
          0;
        const destinationCurrencyCode =
          transactionData.destinationCurrencyCode ||
          fiatInteraction.destinationCurrencyCode ||
          "USDT";

        // Calculate fees from the difference between source and destination amounts
        const feeAmount = sourceAmount - destinationAmount;

        const fees = {
          serviceFee: {
            value: feeAmount,
            currency: sourceCurrencyCode,
          },
          networkFee: {
            value: 0,
            currency: sourceCurrencyCode,
          },
          totalFees: {
            value: feeAmount,
            currency: sourceCurrencyCode,
          },
        };

        // Update the FiatInteraction with detailed data using Meld API format
        fiatInteraction.sourceAmount = sourceAmount;
        fiatInteraction.sourceCurrencyCode = sourceCurrencyCode;
        fiatInteraction.destinationAmount = destinationAmount;
        fiatInteraction.destinationCurrencyCode = destinationCurrencyCode;

        fiatInteraction.fees = fees;
        fiatInteraction.meldPaymentTransactionStatus = transactionData.status;
        fiatInteraction.meldTransactionType = transactionData.transactionType;
        fiatInteraction.exchangeRate =
          transactionData.exchangeRate || fiatInteraction.exchangeRate || 1;

        // Auto-update status based on Meld transaction status
        if (
          transactionData.status === "SETTLED" &&
          fiatInteraction.status === "pending"
        ) {
          await fiatInteraction.updateStatus("completed", {
            transactionHash: transactionData.serviceTransactionId,
          });

          // Add webhook event to track this automatic status update
          await fiatInteraction.addWebhookEvent(
            "SCHEDULED_AUTO_STATUS_UPDATE",
            {
              previousStatus: "pending",
              newStatus: "completed",
              meldStatus: transactionData.status,
              timestamp: new Date().toISOString(),
              reason: "Scheduled task updated transaction status",
            }
          );
        } else if (
          transactionData.status === "FAILED" &&
          fiatInteraction.status === "pending"
        ) {
          await fiatInteraction.updateStatus("failed", {
            reason: "Transaction failed in Meld API",
          });

          // Add webhook event to track this automatic status update
          await fiatInteraction.addWebhookEvent(
            "SCHEDULED_AUTO_STATUS_UPDATE",
            {
              previousStatus: "pending",
              newStatus: "failed",
              meldStatus: transactionData.status,
              timestamp: new Date().toISOString(),
              reason: "Scheduled task updated transaction status",
            }
          );
        }

        await fiatInteraction.save();
        updatedCount++;

        logger.info("Successfully updated FiatInteraction via scheduled task", {
          fiatInteractionId: fiatInteraction._id.toString(),
          customerId,
          status: fiatInteraction.status,
          meldStatus: transactionData.status,
        });
      } catch (error) {
        errorCount++;
        logger.error(
          "Error updating FiatInteraction via scheduled task",
          error as Error,
          {
            fiatInteractionId: fiatInteraction._id.toString(),
            customerId: fiatInteraction.meldCustomerId,
          }
        );
      }
    }

    logger.info("Completed automatic update of pending FiatInteractions", {
      totalProcessed: pendingInteractions.length,
      updatedCount,
      errorCount,
    });
  } catch (error) {
    logger.error("Error in autoUpdatePendingFiatInteractions", error as Error);
  }
};
