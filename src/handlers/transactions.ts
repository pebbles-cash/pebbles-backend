import { APIGatewayProxyResult } from "aws-lambda";
import { connectToDatabase } from "../services/mongoose";
import { success, error } from "../utils/response";
import { Transaction, User } from "../models";
import { requireAuth } from "../middleware/auth";
import { AuthenticatedAPIGatewayProxyEvent } from "../types";
import * as analyticsService from "../services/analytics-service";

/**
 * Get user's transactions
 * GET /api/transactions
 */
export const getUserTransactions = requireAuth(
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
      const limit = parseInt(queryParams.limit || "10", 10);
      const page = parseInt(queryParams.page || "1", 10);
      const skip = (page - 1) * limit;
      const type = queryParams.type; // 'payment', 'tip', 'subscription'

      // Build query
      const query: any = {
        $or: [
          { toUserId: userId }, // Received transactions
          { fromUserId: userId }, // Sent transactions
        ],
      };

      // Add type filter if provided
      if (type) {
        query.type = type;
      }

      // Get transactions
      const transactions = await Transaction.find(query)
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit)
        .exec();

      // Count total matching transactions for pagination
      const total = await Transaction.countDocuments(query);

      // Get user details for transactions
      const userIds = new Set<string>();

      transactions.forEach((tx) => {
        if (tx.fromUserId) userIds.add(tx.fromUserId.toString());
        if (tx.toUserId) userIds.add(tx.toUserId.toString());
      });

      const users = await User.find({
        _id: { $in: Array.from(userIds) },
      }).select("_id username displayName avatar");

      // Create a map of users for quick lookup
      const userMap = new Map();
      users.forEach((user) => {
        userMap.set(user._id.toString(), {
          id: user._id,
          username: user.username,
          displayName: user.displayName,
          avatar: user.avatar,
        });
      });

      // Format transaction data
      const formattedTransactions = transactions.map((tx) => {
        const isSender = tx.fromUserId?.toString() === userId;
        const direction = isSender ? "outgoing" : "incoming";

        return {
          id: tx._id,
          type: tx.type,
          direction,
          amount: tx.amount,
          currency: "USD", // This would come from tx in a real system
          status: tx.status,
          createdAt: tx.createdAt,
          metadata: tx.metadata,
          counterparty: isSender
            ? userMap.get(tx.toUserId.toString())
            : tx.fromUserId
              ? userMap.get(tx.fromUserId.toString())
              : { username: "Anonymous" },
        };
      });

      return success({
        transactions: formattedTransactions,
        pagination: {
          total,
          page,
          limit,
          pages: Math.ceil(total / limit),
        },
      });
    } catch (err) {
      console.error("Get user transactions error:", err);
      return error("Could not retrieve transactions", 500);
    }
  }
);

/**
 * Get transaction details
 * GET /api/transactions/:transactionId
 */
export const getTransactionDetails = requireAuth(
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

      // Get transaction ID from path parameters
      if (!event.pathParameters?.transactionId) {
        return error("Transaction ID parameter is required", 400);
      }

      const transactionId = event.pathParameters.transactionId;

      // Get the transaction
      const transaction = await Transaction.findById(transactionId);

      if (!transaction) {
        return error("Transaction not found", 404);
      }

      // Check if user is authorized to view this transaction
      if (
        transaction.fromUserId?.toString() !== userId &&
        transaction.toUserId.toString() !== userId
      ) {
        return error("Unauthorized to access this transaction", 403);
      }

      // Get counterparty user details
      const counterpartyId =
        transaction.fromUserId?.toString() === userId
          ? transaction.toUserId
          : transaction.fromUserId;

      let counterparty = null;
      if (counterpartyId) {
        const user = await User.findById(counterpartyId).select(
          "_id username displayName avatar"
        );
        if (user) {
          counterparty = {
            id: user._id,
            username: user.username,
            displayName: user.displayName,
            avatar: user.avatar,
          };
        }
      }

      // Format transaction data
      const isSender = transaction.fromUserId?.toString() === userId;
      const formattedTransaction = {
        id: transaction._id,
        type: transaction.type,
        direction: isSender ? "outgoing" : "incoming",
        amount: transaction.amount,
        currency: "USD", // This would come from tx in a real system
        status: transaction.status,
        createdAt: transaction.createdAt,
        updatedAt: transaction.updatedAt,
        fromAddress: transaction.fromAddress,
        toAddress: transaction.toAddress,
        tokenAddress: transaction.tokenAddress,
        sourceChain: transaction.sourceChain,
        destinationChain: transaction.destinationChain,
        txHash: transaction.txHash,
        metadata: transaction.metadata,
        counterparty,
      };

      return success({
        transaction: formattedTransaction,
      });
    } catch (err) {
      console.error("Get transaction details error:", err);
      return error("Could not retrieve transaction details", 500);
    }
  }
);

/**
 * Get transaction statistics
 * GET /api/transactions/stats
 */
export const getTransactionStats = requireAuth(
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
      const period =
        (queryParams.period as "day" | "week" | "month" | "year") || "month";

      // Get earnings summary from analytics service
      const earningsSummary = await analyticsService.getEarningsSummary(
        userId,
        period
      );

      // Get transaction counts
      const incomingCount = await Transaction.countDocuments({
        toUserId: userId,
        status: "completed",
      });

      const outgoingCount = await Transaction.countDocuments({
        fromUserId: userId,
        status: "completed",
      });

      return success({
        earningsSummary,
        transactionCounts: {
          incoming: incomingCount,
          outgoing: outgoingCount,
          total: incomingCount + outgoingCount,
        },
        periodStart: earningsSummary.periodStart,
        periodEnd: earningsSummary.periodEnd,
      });
    } catch (err) {
      console.error("Get transaction stats error:", err);
      return error("Could not retrieve transaction statistics", 500);
    }
  }
);

/**
 * Filter transactions
 * POST /api/transactions/filter
 */
export const filterTransactions = requireAuth(
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
        types,
        startDate,
        endDate,
        status,
        direction,
        client,
        category,
        tags,
        limit = 10,
        page = 1,
      } = body;

      // Build query
      const query: any = {};

      // Base query - ensure user is involved in the transaction
      if (direction === "incoming") {
        query.toUserId = userId;
      } else if (direction === "outgoing") {
        query.fromUserId = userId;
      } else {
        // Default: both directions
        query.$or = [{ toUserId: userId }, { fromUserId: userId }];
      }

      // Add other filters
      if (types && types.length > 0) {
        query.type = { $in: types };
      }

      if (status) {
        query.status = status;
      }

      if (startDate || endDate) {
        query.createdAt = {};
        if (startDate) {
          query.createdAt.$gte = new Date(startDate);
        }
        if (endDate) {
          query.createdAt.$lte = new Date(endDate);
        }
      }

      if (client) {
        query["metadata.client"] = client;
      }

      if (category) {
        query.category = category;
      }

      if (tags && tags.length > 0) {
        query.tags = { $in: tags };
      }

      // Calculate pagination
      const skip = (page - 1) * limit;

      // Get filtered transactions
      const transactions = await Transaction.find(query)
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit)
        .exec();

      // Count total matching transactions for pagination
      const total = await Transaction.countDocuments(query);

      // Get user details for transactions
      const userIds = new Set<string>();

      transactions.forEach((tx) => {
        if (tx.fromUserId) userIds.add(tx.fromUserId.toString());
        if (tx.toUserId) userIds.add(tx.toUserId.toString());
      });

      const users = await User.find({
        _id: { $in: Array.from(userIds) },
      }).select("_id username displayName avatar");

      // Create a map of users for quick lookup
      const userMap = new Map();
      users.forEach((user) => {
        userMap.set(user._id.toString(), {
          id: user._id,
          username: user.username,
          displayName: user.displayName,
          avatar: user.avatar,
        });
      });

      // Format transaction data
      const formattedTransactions = transactions.map((tx) => {
        const isSender = tx.fromUserId?.toString() === userId;
        const txDirection = isSender ? "outgoing" : "incoming";

        return {
          id: tx._id,
          type: tx.type,
          direction: txDirection,
          amount: tx.amount,
          currency: "USD", // This would come from tx in a real system
          status: tx.status,
          createdAt: tx.createdAt,
          metadata: tx.metadata,
          category: tx.category,
          tags: tx.tags,
          counterparty: isSender
            ? userMap.get(tx.toUserId.toString())
            : tx.fromUserId
              ? userMap.get(tx.fromUserId.toString())
              : { username: "Anonymous" },
        };
      });

      return success({
        transactions: formattedTransactions,
        pagination: {
          total,
          page,
          limit,
          pages: Math.ceil(total / limit),
        },
        filters: {
          types,
          startDate,
          endDate,
          status,
          direction,
          client,
          category,
          tags,
        },
      });
    } catch (err) {
      console.error("Filter transactions error:", err);
      return error("Could not filter transactions", 500);
    }
  }
);
