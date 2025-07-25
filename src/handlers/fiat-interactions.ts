import { APIGatewayProxyResult } from "aws-lambda";
import { connectToDatabase } from "../services/mongoose";
import { success, error } from "../utils/response";
import { FiatInteraction, User } from "../models";
import { requireAuth } from "../middleware/auth";
import { AuthenticatedAPIGatewayProxyEvent } from "../types";
import { Types } from "mongoose";

/**
 * Create a new FiatInteraction record for Meld transaction
 * POST /api/fiat-interactions
 */
export const createFiatInteraction = requireAuth(
  async (
    event: AuthenticatedAPIGatewayProxyEvent
  ): Promise<APIGatewayProxyResult> => {
    try {
      // Database connection is handled in requireAuth middleware

      // User is provided by the auth middleware
      const userId = event.user?.id;

      if (!userId) {
        return error("User ID not found in token", 401);
      }

      if (!event.body) {
        return error("Missing request body", 400);
      }

      const body = JSON.parse(event.body);
      const {
        id, // Meld session ID
        customerId,
        externalSessionId,
        externalCustomerId,
        widgetUrl,
        token,
        // Transaction details
        fiatAmount,
        cryptoAmount,
        exchangeRate,
        fees,
        sourceAccount,
        destinationAccount,
        blockchain = "ethereum",
        type = "onramp", // Default to onramp
        serviceProvider = "meld",
      } = body;

      // Validate required fields
      if (!id || !customerId) {
        return error("Meld session ID and customer ID are required", 400);
      }

      if (!fiatAmount || !cryptoAmount) {
        return error("Fiat and crypto amounts are required", 400);
      }

      // Check if FiatInteraction already exists for this customer
      const existingInteraction = await FiatInteraction.findOne({
        meldCustomerId: customerId,
        userId: userId,
      });

      if (existingInteraction) {
        return error("FiatInteraction already exists for this customer", 409);
      }

      // Create new FiatInteraction
      const fiatInteraction = new FiatInteraction({
        userId,
        type,
        status: "pending",
        serviceProvider,
        // Meld-specific fields
        meldCustomerId: customerId,
        meldSessionId: id,
        meldExternalCustomerId: externalCustomerId,
        meldExternalSessionId: externalSessionId,
        // Transaction details
        fiatAmount,
        cryptoAmount,
        exchangeRate,
        fees,
        sourceAccount,
        destinationAccount,
        blockchain,
        // Metadata
        metadata: {
          widgetUrl,
          token,
          meldSessionId: id,
        },
        // Required fields with defaults
        ipAddress: event.requestContext.identity.sourceIp || "unknown",
        deviceInfo: {
          userAgent: event.headers["User-Agent"] || "unknown",
          platform: "web",
        },
        initiatedAt: new Date(),
      });

      await fiatInteraction.save();

      return success(
        {
          id: fiatInteraction._id,
          meldCustomerId: fiatInteraction.meldCustomerId,
          meldSessionId: fiatInteraction.meldSessionId,
          status: fiatInteraction.status,
          type: fiatInteraction.type,
          createdAt: fiatInteraction.createdAt,
        },
        201
      );
    } catch (err) {
      console.error("Create FiatInteraction error:", err);
      return error("Could not create FiatInteraction", 500);
    }
  }
);

/**
 * Get user's FiatInteraction records
 * GET /api/fiat-interactions
 */
export const getUserFiatInteractions = requireAuth(
  async (
    event: AuthenticatedAPIGatewayProxyEvent
  ): Promise<APIGatewayProxyResult> => {
    try {
      // Database connection is handled in requireAuth middleware

      // User is provided by the auth middleware
      const userId = event.user?.id;

      if (!userId) {
        return error("User ID not found in token", 401);
      }

      // Get query parameters
      const queryParams = event.queryStringParameters || {};
      const type = queryParams.type as "onramp" | "offramp" | undefined;
      const status = queryParams.status as string | undefined;
      const limit = parseInt(queryParams.limit || "10");
      const page = parseInt(queryParams.page || "1");
      const skip = (page - 1) * limit;

      // Build query
      const query: any = { userId };
      if (type) query.type = type;
      if (status) query.status = status;

      // Get FiatInteraction records
      const fiatInteractions = await FiatInteraction.find(query)
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit)
        .lean();

      // Get total count for pagination
      const total = await FiatInteraction.countDocuments(query);

      return success({
        fiatInteractions,
        pagination: {
          page,
          limit,
          total,
          pages: Math.ceil(total / limit),
        },
      });
    } catch (err) {
      console.error("Get user FiatInteractions error:", err);
      return error("Could not retrieve FiatInteraction records", 500);
    }
  }
);

/**
 * Update FiatInteraction with detailed transaction data from Meld API
 * PUT /api/fiat-interactions/{customerId}/update-details
 */
export const updateFiatInteractionDetails = requireAuth(
  async (
    event: AuthenticatedAPIGatewayProxyEvent
  ): Promise<APIGatewayProxyResult> => {
    try {
      // Database connection is handled in requireAuth middleware

      // User is provided by the auth middleware
      const userId = event.user?.id;

      if (!userId) {
        return error("User ID not found in token", 401);
      }

      // Get customer ID from path parameters
      if (!event.pathParameters?.partnerCustomerId) {
        return error("Customer ID parameter is required", 400);
      }

      const partnerCustomerId = event.pathParameters.partnerCustomerId;

      // Find FiatInteraction assigned to this user
      const fiatInteraction = await FiatInteraction.findOne({
        meldCustomerId: partnerCustomerId,
        userId: userId,
      });

      if (!fiatInteraction) {
        return error("FiatInteraction not found", 404);
      }

      // Check if we have a customer ID
      if (!fiatInteraction.meldCustomerId) {
        return error("No customer ID available for this FiatInteraction", 400);
      }

      // Import the meldService
      const { meldService } = await import("../services/meld-service");

      // Fetch detailed transaction information from Meld API
      let detailedTransactionData = null;
      try {
        detailedTransactionData = await meldService.getPaymentTransaction(
          fiatInteraction.meldCustomerId
        );
      } catch (apiError) {
        console.error(
          "Failed to fetch detailed transaction data from Meld API",
          apiError
        );
        return error("Failed to fetch transaction details from Meld API", 500);
      }

      if (!detailedTransactionData?.transaction) {
        return error("No detailed transaction data found", 404);
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

      // Update legacy fields for backward compatibility
      fiatInteraction.fiatAmount = {
        value: sourceAmount,
        currency: sourceCurrencyCode,
      };
      fiatInteraction.cryptoAmount = {
        value: destinationAmount,
        currency: destinationCurrencyCode,
      };

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
        await fiatInteraction.addWebhookEvent("AUTO_STATUS_UPDATE", {
          previousStatus: "pending",
          newStatus: "completed",
          meldStatus: transactionData.status,
          timestamp: new Date().toISOString(),
          reason: "Transaction settled in Meld API",
        });
      } else if (
        transactionData.status === "FAILED" &&
        fiatInteraction.status === "pending"
      ) {
        await fiatInteraction.updateStatus("failed", {
          reason: "Transaction failed in Meld API",
        });

        // Add webhook event to track this automatic status update
        await fiatInteraction.addWebhookEvent("AUTO_STATUS_UPDATE", {
          previousStatus: "pending",
          newStatus: "failed",
          meldStatus: transactionData.status,
          timestamp: new Date().toISOString(),
          reason: "Transaction failed in Meld API",
        });
      }

      // Add metadata about the update
      fiatInteraction.metadata = {
        ...fiatInteraction.metadata,
        lastDetailedUpdate: new Date().toISOString(),
        meldCustomerId: fiatInteraction.meldCustomerId,
      };

      await fiatInteraction.save();

      return success({
        message: "FiatInteraction updated with detailed transaction data",
        fiatInteraction: {
          id: fiatInteraction._id,
          sourceAmount: fiatInteraction.sourceAmount,
          sourceCurrencyCode: fiatInteraction.sourceCurrencyCode,
          destinationAmount: fiatInteraction.destinationAmount,
          destinationCurrencyCode: fiatInteraction.destinationCurrencyCode,
          fees,
          status: fiatInteraction.status,
          meldPaymentTransactionStatus:
            fiatInteraction.meldPaymentTransactionStatus,
          meldTransactionType: fiatInteraction.meldTransactionType,
          updatedAt: fiatInteraction.updatedAt,
        },
      });
    } catch (err) {
      console.error("Update FiatInteraction details error:", err);
      return error("Could not update FiatInteraction details", 500);
    }
  }
);

/**
 * Update FiatInteraction status from pending to confirmed
 * PUT /api/fiat-interactions/{customerId}/update-status
 */
export const updateFiatInteractionStatus = requireAuth(
  async (
    event: AuthenticatedAPIGatewayProxyEvent
  ): Promise<APIGatewayProxyResult> => {
    try {
      // Database connection is handled in requireAuth middleware

      // User is provided by the auth middleware
      const userId = event.user?.id;

      if (!userId) {
        return error("User ID not found in token", 401);
      }

      // Get customer ID from path parameters
      if (!event.pathParameters?.partnerCustomerId) {
        return error("Customer ID parameter is required", 400);
      }

      const partnerCustomerId = event.pathParameters.partnerCustomerId;

      // Parse request body
      if (!event.body) {
        return error("Request body is required", 400);
      }

      const body = JSON.parse(event.body);
      const { status, transactionHash, failureReason, additionalData } = body;

      // Validate status
      const validStatuses = [
        "processing",
        "completed",
        "failed",
        "cancelled",
        "expired",
      ];
      if (!status || !validStatuses.includes(status)) {
        return error(
          `Invalid status. Must be one of: ${validStatuses.join(", ")}`,
          400
        );
      }

      // Find FiatInteraction assigned to this user
      const fiatInteraction = await FiatInteraction.findOne({
        meldCustomerId: partnerCustomerId,
        userId: userId,
      });

      if (!fiatInteraction) {
        return error("FiatInteraction not found", 404);
      }

      // Check if current status is pending
      if (fiatInteraction.status !== "pending") {
        return error(
          `Cannot update status from ${fiatInteraction.status} to ${status}`,
          400
        );
      }

      // Update status using the model's updateStatus method
      const additionalUpdateData: any = {};
      if (transactionHash)
        additionalUpdateData.transactionHash = transactionHash;
      if (failureReason) additionalUpdateData.reason = failureReason;

      await fiatInteraction.updateStatus(status, additionalUpdateData);

      // Add webhook event to track this manual update
      await fiatInteraction.addWebhookEvent("MANUAL_STATUS_UPDATE", {
        previousStatus: "pending",
        newStatus: status,
        updatedBy: userId,
        timestamp: new Date().toISOString(),
        additionalData,
      });

      return success({
        message: "FiatInteraction status updated successfully",
        fiatInteraction: {
          id: fiatInteraction._id,
          status: fiatInteraction.status,
          meldCustomerId: fiatInteraction.meldCustomerId,
          updatedAt: fiatInteraction.updatedAt,
        },
      });
    } catch (err) {
      console.error("Update FiatInteraction status error:", err);
      return error("Could not update FiatInteraction status", 500);
    }
  }
);

/**
 * Bulk update pending FiatInteractions to confirmed status
 * POST /api/fiat-interactions/bulk-update-status
 */
export const bulkUpdateFiatInteractionStatus = requireAuth(
  async (
    event: AuthenticatedAPIGatewayProxyEvent
  ): Promise<APIGatewayProxyResult> => {
    try {
      // Database connection is handled in requireAuth middleware

      // User is provided by the auth middleware
      const userId = event.user?.id;

      if (!userId) {
        return error("User ID not found in token", 401);
      }

      // Parse request body
      if (!event.body) {
        return error("Request body is required", 400);
      }

      const body = JSON.parse(event.body);
      const { status, customerIds, transactionHashes, failureReasons } = body;

      // Validate status
      const validStatuses = [
        "processing",
        "completed",
        "failed",
        "cancelled",
        "expired",
      ];
      if (!status || !validStatuses.includes(status)) {
        return error(
          `Invalid status. Must be one of: ${validStatuses.join(", ")}`,
          400
        );
      }

      if (!customerIds || !Array.isArray(customerIds)) {
        return error("customerIds array is required", 400);
      }

      // Find all pending FiatInteractions for the user with the specified customer IDs
      const fiatInteractions = await FiatInteraction.find({
        meldCustomerId: { $in: customerIds },
        userId: userId,
        status: "pending",
      });

      if (fiatInteractions.length === 0) {
        return error(
          "No pending FiatInteractions found for the specified customer IDs",
          404
        );
      }

      const updateResults = [];

      // Update each FiatInteraction
      for (let i = 0; i < fiatInteractions.length; i++) {
        const fiatInteraction = fiatInteractions[i];
        const customerId = fiatInteraction.meldCustomerId;

        const additionalUpdateData: any = {};
        if (transactionHashes && customerId && transactionHashes[customerId]) {
          additionalUpdateData.transactionHash = transactionHashes[customerId];
        }
        if (failureReasons && customerId && failureReasons[customerId]) {
          additionalUpdateData.reason = failureReasons[customerId];
        }

        await fiatInteraction.updateStatus(status, additionalUpdateData);

        // Add webhook event to track this bulk update
        await fiatInteraction.addWebhookEvent("BULK_STATUS_UPDATE", {
          previousStatus: "pending",
          newStatus: status,
          updatedBy: userId,
          timestamp: new Date().toISOString(),
          bulkUpdate: true,
        });

        updateResults.push({
          customerId,
          fiatInteractionId: fiatInteraction._id,
          status: fiatInteraction.status,
          updatedAt: fiatInteraction.updatedAt,
        });
      }

      return success({
        message: `Successfully updated ${updateResults.length} FiatInteractions`,
        updatedCount: updateResults.length,
        results: updateResults,
      });
    } catch (err) {
      console.error("Bulk update FiatInteraction status error:", err);
      return error("Could not bulk update FiatInteraction status", 500);
    }
  }
);

/**
 * Get FiatInteraction details by ID
 * GET /api/fiat-interactions/{customerId}
 */
export const getFiatInteractionById = requireAuth(
  async (
    event: AuthenticatedAPIGatewayProxyEvent
  ): Promise<APIGatewayProxyResult> => {
    try {
      // Database connection is handled in requireAuth middleware

      // User is provided by the auth middleware
      const userId = event.user?.id;

      if (!userId) {
        return error("User ID not found in token", 401);
      }

      // Get customer ID from path parameters
      if (!event.pathParameters?.partnerCustomerId) {
        return error("Customer ID parameter is required", 400);
      }

      const partnerCustomerId = event.pathParameters.partnerCustomerId;

      // First, try to find FiatInteraction assigned to this user
      let fiatInteraction = await FiatInteraction.findOne({
        meldCustomerId: partnerCustomerId,
        userId: userId,
      });

      // If not found, look for unassigned FiatInteraction and assign it to the user
      if (!fiatInteraction) {
        fiatInteraction = await FiatInteraction.findOne({
          meldCustomerId: partnerCustomerId,
          userId: { $exists: false }, // Unassigned transaction
        });

        if (fiatInteraction) {
          // Assign the transaction to this user
          fiatInteraction.userId = new Types.ObjectId(userId);
          await fiatInteraction.save();

          console.log("Assigned FiatInteraction to user", {
            fiatInteractionId: fiatInteraction._id.toString(),
            userId,
            partnerCustomerId,
          });
        }
      }

      if (!fiatInteraction) {
        return error("FiatInteraction not found", 404);
      }

      return success({
        fiatInteraction,
        assigned: fiatInteraction.userId?.toString() === userId,
      });
    } catch (err) {
      console.error("Get FiatInteraction details error:", err);
      return error("Could not retrieve FiatInteraction details", 500);
    }
  }
);

/**
 * Get FiatInteraction by session ID
 * GET /api/fiat-interactions/session/{sessionId}
 */
export const getFiatInteractionBySessionId = requireAuth(
  async (
    event: AuthenticatedAPIGatewayProxyEvent
  ): Promise<APIGatewayProxyResult> => {
    try {
      // Database connection is handled in requireAuth middleware

      // User is provided by the auth middleware
      const userId = event.user?.id;

      if (!userId) {
        return error("User ID not found in token", 401);
      }

      // Get session ID from path parameters
      if (!event.pathParameters?.sessionId) {
        return error("Session ID parameter is required", 400);
      }

      const sessionId = event.pathParameters.sessionId;

      // Get the FiatInteraction by meldSessionId
      const fiatInteraction = await FiatInteraction.findOne({
        meldSessionId: sessionId,
        userId: userId,
      });

      if (!fiatInteraction) {
        return error("FiatInteraction not found", 404);
      }

      return success({
        fiatInteraction,
      });
    } catch (err) {
      console.error("Get FiatInteraction by session ID error:", err);
      return error("Could not retrieve FiatInteraction details", 500);
    }
  }
);

/**
 * Get FiatInteraction statistics
 * GET /api/fiat-interactions/stats
 */
export const getFiatInteractionStats = requireAuth(
  async (
    event: AuthenticatedAPIGatewayProxyEvent
  ): Promise<APIGatewayProxyResult> => {
    try {
      // User is provided by the auth middleware
      const userId = event.user?.id;

      if (!userId) {
        return error("User ID not found in token", 401);
      }

      // Get query parameters
      const queryParams = event.queryStringParameters || {};
      const timeframe =
        (queryParams.timeframe as "day" | "week" | "month" | "year") || "month";

      // Get stats using the static method
      const stats = await FiatInteraction.getUserStats(userId, timeframe);

      // Get additional counts
      const totalOnramps = await FiatInteraction.countDocuments({
        userId,
        type: "onramp",
        status: "completed",
      });

      const totalOfframps = await FiatInteraction.countDocuments({
        userId,
        type: "offramp",
        status: "completed",
      });

      const pendingTransactions = await FiatInteraction.countDocuments({
        userId,
        status: { $in: ["pending", "processing"] },
      });

      return success({
        stats,
        summary: {
          totalOnramps,
          totalOfframps,
          pendingTransactions,
        },
        timeframe,
      });
    } catch (err) {
      console.error("Get FiatInteraction stats error:", err);
      return error("Could not retrieve FiatInteraction statistics", 500);
    }
  }
);
