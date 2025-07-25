import { APIGatewayProxyEvent, APIGatewayProxyResult } from "aws-lambda";
import { connectToDatabase } from "../services/mongoose";
import { transactionStatusService } from "../services/transaction-status-service";
import { logger } from "../utils/logger";

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

    // Run comprehensive cleanup
    const result =
      await transactionStatusService.comprehensivePendingTransactionCleanup();

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
