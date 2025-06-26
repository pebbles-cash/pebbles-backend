import { APIGatewayProxyResult } from "aws-lambda";
import { connectToDatabase } from "../services/mongoose";
import { success, error } from "../utils/response";
import { FiatInteraction, User } from "../models";
import { requireAuth } from "../middleware/auth";
import { AuthenticatedAPIGatewayProxyEvent } from "../types";

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
 * Get FiatInteraction details by ID
 * GET /api/fiat-interactions/{fiatInteractionId}
 */
export const getFiatInteractionDetails = requireAuth(
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

      // Get FiatInteraction ID from path parameters
      if (!event.pathParameters?.fiatInteractionId) {
        return error("FiatInteraction ID parameter is required", 400);
      }

      const fiatInteractionId = event.pathParameters.fiatInteractionId;

      // Get the FiatInteraction
      const fiatInteraction = await FiatInteraction.findById(fiatInteractionId);

      if (!fiatInteraction) {
        return error("FiatInteraction not found", 404);
      }

      // Check if user is authorized to view this FiatInteraction
      if (fiatInteraction.userId.toString() !== userId) {
        return error("Unauthorized to access this FiatInteraction", 403);
      }

      return success({
        fiatInteraction,
      });
    } catch (err) {
      console.error("Get FiatInteraction details error:", err);
      return error("Could not retrieve FiatInteraction details", 500);
    }
  }
);

/**
 * Get FiatInteraction by external transaction ID
 * GET /api/fiat-interactions/external/{externalTransactionId}
 */
export const getFiatInteractionByExternalId = requireAuth(
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

      // Get external transaction ID from path parameters
      if (!event.pathParameters?.externalTransactionId) {
        return error("External transaction ID parameter is required", 400);
      }

      const externalTransactionId = event.pathParameters.externalTransactionId;

      // Get the FiatInteraction by external transaction ID
      const fiatInteraction = await FiatInteraction.findOne({
        externalTransactionId,
        userId,
      });

      if (!fiatInteraction) {
        return error("FiatInteraction not found", 404);
      }

      return success({
        fiatInteraction,
      });
    } catch (err) {
      console.error("Get FiatInteraction by external ID error:", err);
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
