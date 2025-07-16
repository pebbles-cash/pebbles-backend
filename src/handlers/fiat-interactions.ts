import { APIGatewayProxyResult } from "aws-lambda";
import { connectToDatabase } from "../services/mongoose";
import { success, error } from "../utils/response";
import { FiatInteraction, User } from "../models";
import { requireAuth } from "../middleware/auth";
import { AuthenticatedAPIGatewayProxyEvent } from "../types";

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
      if (!event.pathParameters?.customerId) {
        return error("Customer ID parameter is required", 400);
      }

      const customerId = event.pathParameters.customerId;

      // Get the FiatInteraction by meldCustomerId
      const fiatInteraction = await FiatInteraction.findOne({
        meldCustomerId: customerId,
        userId: userId,
      });

      if (!fiatInteraction) {
        return error("FiatInteraction not found", 404);
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
