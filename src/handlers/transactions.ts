import { APIGatewayProxyResult } from "aws-lambda";
import { success, error } from "../utils/response";
import { Transaction, User } from "../models";
import { requireAuth } from "../middleware/auth";
import { AuthenticatedAPIGatewayProxyEvent } from "../types";
import { getTokenSymbol } from "../utils/token-symbols";
import { sendTransactionConfirmationNotification } from "../services/notification-service";

/**
 * Create a new transaction
 * POST /api/transactions
 */
export const createTransaction = requireAuth(
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
        type,
        toUserId,
        fromAddress,
        toAddress,
        amount,
        tokenAddress,
        sourceChain,
        destinationChain,
        category,
        tags,
        client,
        projectId,
        metadata,
      } = body;

      // Validate required fields
      if (!type || !["payment", "tip", "subscription"].includes(type)) {
        return error(
          "Valid transaction type is required (payment, tip, subscription)",
          400
        );
      }

      if (!toUserId) {
        return error("Recipient user ID (toUserId) is required", 400);
      }

      if (!toAddress) {
        return error("Recipient wallet address (toAddress) is required", 400);
      }

      if (!amount || isNaN(parseFloat(amount))) {
        return error("Valid amount is required", 400);
      }

      if (!sourceChain || !destinationChain) {
        return error("Source and destination chains are required", 400);
      }

      // Check if recipient user exists
      const recipientUser = await User.findById(toUserId);
      if (!recipientUser) {
        return error("Recipient user not found", 404);
      }

      // Create new transaction
      const transaction = new Transaction({
        type,
        fromUserId: userId, // Current authenticated user is the sender
        toUserId,
        fromAddress: fromAddress || "0x0", // Default if not provided
        toAddress,
        amount: amount.toString(),
        tokenAddress: tokenAddress || "0x0", // Default to native token if not specified
        sourceChain,
        destinationChain,
        status: "pending", // Default status for new transactions
        category: category || "uncategorized",
        tags: tags || [],
        client,
        projectId,
        metadata: metadata || {},
        createdAt: new Date(),
        updatedAt: new Date(),
      });

      await transaction.save();

      // Format response
      return success(
        {
          id: transaction._id,
          type: transaction.type,
          fromUserId: transaction.fromUserId,
          toUserId: transaction.toUserId,
          amount: transaction.amount,
          status: transaction.status,
          createdAt: transaction.createdAt,
          category: transaction.category,
          tags: transaction.tags,
          client: transaction.client,
          projectId: transaction.projectId,
        },
        201
      );
    } catch (err) {
      console.error("Create transaction error:", err);
      return error("Could not create transaction", 500);
    }
  }
);

/**
 * Update an existing transaction
 * PUT /api/transactions/:transactionId
 */
export const updateTransaction = requireAuth(
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

      if (!event.body) {
        return error("Missing request body", 400);
      }

      const body = JSON.parse(event.body);

      // Fields that can be updated
      const { status, category, tags, client, projectId, metadata } = body;

      // Get the transaction
      const transaction = await Transaction.findById(transactionId);

      if (!transaction) {
        return error("Transaction not found", 404);
      }

      // Check if user is authorized to update this transaction
      // User must be either the sender or recipient
      if (
        transaction.fromUserId?.toString() !== userId &&
        transaction.toUserId.toString() !== userId
      ) {
        return error("Unauthorized to update this transaction", 403);
      }

      // Only allow updating certain fields
      // Cannot change fundamental transaction details like amount, addresses, etc.
      const updateData: Record<string, any> = {
        updatedAt: new Date(),
      };

      // Only add fields that are provided in the request
      if (status && ["pending", "completed", "failed"].includes(status)) {
        // Only allow specific status transitions based on current status
        // e.g., prevent changing from 'completed' to 'pending'
        if (transaction.status === "completed" && status !== "completed") {
          return error("Cannot change status of a completed transaction", 400);
        }
        updateData.status = status;
      }

      if (category) updateData.category = category;
      if (tags) updateData.tags = tags;
      if (client) updateData.client = client;
      if (projectId) updateData.projectId = projectId;

      // For metadata, merge with existing metadata rather than replacing
      if (metadata) {
        updateData.metadata = {
          ...(transaction.metadata || {}),
          ...metadata,
        };
      }

      // Update the transaction
      await Transaction.findByIdAndUpdate(transactionId, { $set: updateData });

      // Get updated transaction
      const updatedTransaction = await Transaction.findById(transactionId);

      if (!updatedTransaction) {
        return error("Transaction not found after update", 404);
      }

      // Send notifications if status was changed to completed
      if (status === "completed" && transaction.status !== "completed") {
        try {
          if (updatedTransaction.fromUserId && updatedTransaction.toUserId) {
            const currency = getTokenSymbol(
              updatedTransaction.tokenAddress,
              updatedTransaction.sourceChain
            );

            await sendTransactionConfirmationNotification(
              updatedTransaction._id.toString(),
              updatedTransaction.fromUserId.toString(),
              updatedTransaction.toUserId.toString(),
              updatedTransaction.amount,
              currency,
              updatedTransaction.type as "payment" | "tip" | "subscription"
            );

            console.log(
              `Transaction confirmation notifications sent for manually updated transaction ${updatedTransaction._id}`
            );
          }
        } catch (notificationError) {
          console.error(
            "Failed to send transaction confirmation notifications:",
            notificationError
          );
          // Don't fail the update if notification fails
        }
      }

      // Format response
      return success({
        id: updatedTransaction._id,
        type: updatedTransaction.type,
        fromUserId: updatedTransaction.fromUserId,
        toUserId: updatedTransaction.toUserId,
        amount: updatedTransaction.amount,
        status: updatedTransaction.status,
        updatedAt: updatedTransaction.updatedAt,
        category: updatedTransaction.category,
        tags: updatedTransaction.tags,
        client: updatedTransaction.client,
        projectId: updatedTransaction.projectId,
        metadata: updatedTransaction.metadata,
      });
    } catch (err) {
      console.error("Update transaction error:", err);
      return error("Could not update transaction", 500);
    }
  }
);

/**
 * Get user's transactions
 * GET /api/transactions
 */
export const getUserTransactions = requireAuth(
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
          currency: getTokenSymbol(tx.tokenAddress, tx.sourceChain),
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

      // Debug logging
      console.log(
        "getTransactionDetails called with transactionId:",
        transactionId
      );
      console.log("Full event path:", event.path);
      console.log("Path parameters:", event.pathParameters);

      // Check if this is actually a request for contacts (due to route precedence issue)
      if (transactionId === "contacts" || transactionId === "contacts ") {
        console.log(
          "Detected contacts request, redirecting to getRecentInteractionUsers"
        );
        // Instead of calling the handler directly, return an error that suggests the correct endpoint
        return error(
          "Invalid transaction ID. Did you mean to call /api/contacts?",
          400
        );
      }

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
        currency: getTokenSymbol(
          transaction.tokenAddress,
          transaction.sourceChain
        ),
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
      // User is provided by the auth middleware
      const userId = event.user?.id;

      if (!userId) {
        return error("User ID not found in token", 401);
      }

      // Get query parameters
      const queryParams = event.queryStringParameters || {};
      const period =
        (queryParams.period as "day" | "week" | "month" | "year") || "month";

      // Calculate date range based on period
      const now = new Date();
      let periodStart: Date;

      switch (period) {
        case "day":
          periodStart = new Date(
            now.getFullYear(),
            now.getMonth(),
            now.getDate()
          );
          break;
        case "week":
          const dayOfWeek = now.getDay();
          const daysToSubtract = dayOfWeek === 0 ? 6 : dayOfWeek - 1;
          periodStart = new Date(
            now.getTime() - daysToSubtract * 24 * 60 * 60 * 1000
          );
          periodStart.setHours(0, 0, 0, 0);
          break;
        case "month":
          periodStart = new Date(now.getFullYear(), now.getMonth(), 1);
          break;
        case "year":
          periodStart = new Date(now.getFullYear(), 0, 1);
          break;
        default:
          periodStart = new Date(now.getFullYear(), now.getMonth(), 1);
      }

      // Get transaction counts for the period
      const incomingCount = await Transaction.countDocuments({
        toUserId: userId,
        status: "completed",
        createdAt: { $gte: periodStart },
      });

      const outgoingCount = await Transaction.countDocuments({
        fromUserId: userId,
        status: "completed",
        createdAt: { $gte: periodStart },
      });

      // Calculate earnings summary from transactions
      const incomingTransactions = await Transaction.find({
        toUserId: userId,
        status: "completed",
        createdAt: { $gte: periodStart },
      });

      const totalEarnings = incomingTransactions.reduce((sum, tx) => {
        return sum + (parseFloat(tx.amount) || 0);
      }, 0);

      const earningsSummary = {
        totalEarnings,
        periodStart,
        periodEnd: now,
        period,
      };

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
 * Get transaction by transaction hash
 * GET /api/transactions/hash/{txHash}
 */
export const getTransactionByHash = requireAuth(
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

      // Get transaction hash from path parameters
      if (!event.pathParameters?.txHash) {
        return error("Transaction hash parameter is required", 400);
      }

      const txHash = event.pathParameters.txHash;

      // Get the transaction
      const transaction = await Transaction.findOne({
        txHash,
      });

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
        currency: getTokenSymbol(
          transaction.tokenAddress,
          transaction.sourceChain
        ),
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
      console.error("Get transaction by external ID error:", err);
      return error("Could not retrieve transaction details", 500);
    }
  }
);

/**
 * Get recent interaction users (contacts)
 * GET /api/transactions/contacts
 */
export const getRecentInteractionUsers = requireAuth(
  async (
    event: AuthenticatedAPIGatewayProxyEvent
  ): Promise<APIGatewayProxyResult> => {
    try {
      // Database connection is handled in requireAuth middleware

      // User is provided by the auth middleware
      const userId = event.user?.id;

      // Debug logging
      console.log("getRecentInteractionUsers called");
      console.log("Full event path:", event.path);
      console.log("Path parameters:", event.pathParameters);

      if (!userId) {
        return error("User ID not found in token", 401);
      }

      // Get query parameters
      const queryParams = event.queryStringParameters || {};
      const daysBack = parseInt(queryParams.daysBack || "90"); // Default to 90 days
      const limit = parseInt(queryParams.limit || "50"); // Default to 50 users

      // Calculate the date threshold
      const dateThreshold = new Date();
      dateThreshold.setDate(dateThreshold.getDate() - daysBack);

      // Find all transactions where the user is involved (either sender or recipient)
      const transactions = await Transaction.find({
        $or: [{ fromUserId: userId }, { toUserId: userId }],
        createdAt: { $gte: dateThreshold },
        status: "completed", // Only include completed transactions
      }).sort({ createdAt: -1 });

      // Group transactions by counterparty and collect interaction data
      const userInteractions = new Map();

      for (const transaction of transactions) {
        const isSender = transaction.fromUserId?.toString() === userId;
        const counterpartyId = isSender
          ? transaction.toUserId.toString()
          : transaction.fromUserId?.toString();

        if (!counterpartyId) continue;

        if (!userInteractions.has(counterpartyId)) {
          userInteractions.set(counterpartyId, {
            userId: counterpartyId,
            totalTransactions: 0,
            sentCount: 0,
            receivedCount: 0,
            totalAmount: 0,
            lastInteraction: null,
            interactions: [],
          });
        }

        const interaction = userInteractions.get(counterpartyId);
        const amount = parseFloat(transaction.amount) || 0;

        interaction.totalTransactions++;
        interaction.totalAmount += amount;

        if (isSender) {
          interaction.sentCount++;
        } else {
          interaction.receivedCount++;
        }

        // Track the most recent interaction
        if (
          !interaction.lastInteraction ||
          transaction.createdAt > interaction.lastInteraction
        ) {
          interaction.lastInteraction = transaction.createdAt;
        }

        // Add transaction details to interactions array
        interaction.interactions.push({
          transactionId: transaction._id,
          type: transaction.type,
          direction: isSender ? "sent" : "received",
          amount: transaction.amount,
          createdAt: transaction.createdAt,
          category: transaction.category,
        });
      }

      // Convert to array and sort by last interaction date
      const interactionsArray = Array.from(userInteractions.values())
        .sort(
          (a, b) =>
            new Date(b.lastInteraction).getTime() -
            new Date(a.lastInteraction).getTime()
        )
        .slice(0, limit);

      // Get user details for all counterparties
      const userIds = interactionsArray.map(
        (interaction) => interaction.userId
      );
      const users = await User.find({ _id: { $in: userIds } }).select(
        "_id username displayName avatar primaryWalletAddress email"
      );

      // Create a map for quick user lookup
      const userMap = new Map();
      users.forEach((user) => {
        userMap.set(user._id.toString(), {
          id: user._id,
          username: user.username,
          displayName: user.displayName,
          avatar: user.avatar,
          primaryWalletAddress: user.primaryWalletAddress,
          email: user.email,
        });
      });

      // Combine user data with interaction data
      const result = interactionsArray.map((interaction) => {
        const userData = userMap.get(interaction.userId);
        return {
          user: userData || { id: interaction.userId },
          interactionStats: {
            totalTransactions: interaction.totalTransactions,
            sentCount: interaction.sentCount,
            receivedCount: interaction.receivedCount,
            totalAmount: interaction.totalAmount,
            lastInteraction: interaction.lastInteraction,
            recentInteractions: interaction.interactions.slice(0, 5), // Last 5 interactions
          },
        };
      });

      return success({
        interactions: result,
        totalCount: result.length,
        dateRange: {
          from: dateThreshold,
          to: new Date(),
        },
      });
    } catch (err) {
      console.error("Get recent interaction users error:", err);
      return error("Could not retrieve recent interaction users", 500);
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
          currency: getTokenSymbol(tx.tokenAddress, tx.sourceChain),
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

/**
 * Process blockchain transaction hash
 * POST /api/transactions/process
 */
export const processTransactionHash = requireAuth(
  async (
    event: AuthenticatedAPIGatewayProxyEvent
  ): Promise<APIGatewayProxyResult> => {
    try {
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
        txHash,
        networkId,
        type = "payment",
        category = "blockchain_transaction",
        tags = ["blockchain"],
        client = "blockchain",
        projectId,
        metadata = {},
      } = body;

      // Require networkId to be provided
      if (!networkId) {
        return error(
          "networkId is required to specify which blockchain network the transaction is on",
          400
        );
      }

      // Validate networkId is a number
      const selectedNetworkId = parseInt(networkId.toString(), 10);
      if (isNaN(selectedNetworkId)) {
        return error("networkId must be a valid number", 400);
      }

      // Validate networkId is supported
      const supportedNetworks = [1, 11155111, 56]; // Ethereum mainnet, Sepolia, BSC
      if (!supportedNetworks.includes(selectedNetworkId)) {
        return error(
          `Unsupported networkId: ${selectedNetworkId}. Supported networks: ${supportedNetworks.join(", ")}`,
          400
        );
      }

      // Validate required fields
      if (!txHash) {
        return error("Transaction hash (txHash) is required", 400);
      }

      // Validate transaction hash format
      if (!/^0x[a-fA-F0-9]{64}$/.test(txHash)) {
        return error("Invalid transaction hash format", 400);
      }

      // Import the transaction status service
      const { transactionStatusService } = await import(
        "../services/transaction-status-service"
      );

      // Process the transaction hash
      const result = await transactionStatusService.processTransactionHash(
        userId,
        txHash,
        selectedNetworkId,
        {
          type,
          category,
          tags,
          client,
          projectId,
          ...metadata,
        }
      );

      if (!result.success) {
        return error(result.error || "Failed to process transaction", 400);
      }

      // Get the created transaction
      const transaction = await Transaction.findById(result.transactionId);
      if (!transaction) {
        return error("Transaction not found after creation", 404);
      }

      // Format response
      return success(
        {
          id: transaction._id,
          txHash: transaction.txHash,
          status: transaction.status,
          type: transaction.type,
          amount: transaction.amount,
          fromAddress: transaction.fromAddress,
          toAddress: transaction.toAddress,
          sourceChain: transaction.sourceChain,
          destinationChain: transaction.destinationChain,
          category: transaction.category,
          tags: transaction.tags,
          client: transaction.client,
          projectId: transaction.projectId,
          metadata: transaction.metadata,
          createdAt: transaction.createdAt,
          updatedAt: transaction.updatedAt,
          message:
            result.message ||
            "Transaction processed successfully. Status will be updated asynchronously.",
        },
        201
      );
    } catch (err) {
      console.error("Process transaction hash error:", err);
      return error("Could not process transaction hash", 500);
    }
  }
);

/**
 * Get transaction status by hash
 * GET /api/transactions/status/{txHash}
 */
export const getTransactionStatus = requireAuth(
  async (
    event: AuthenticatedAPIGatewayProxyEvent
  ): Promise<APIGatewayProxyResult> => {
    try {
      // User is provided by the auth middleware
      const userId = event.user?.id;

      if (!userId) {
        return error("User ID not found in token", 401);
      }

      // Get transaction hash from path parameters
      if (!event.pathParameters?.txHash) {
        return error("Transaction hash parameter is required", 400);
      }

      const txHash = event.pathParameters.txHash;
      const networkIdParam = event.queryStringParameters?.networkId;

      // Convert networkId parameter to number, default to Ethereum mainnet (1)
      const selectedNetworkId = networkIdParam
        ? parseInt(networkIdParam, 10)
        : 1;

      // Validate transaction hash format
      if (!/^0x[a-fA-F0-9]{64}$/.test(txHash)) {
        return error("Invalid transaction hash format", 400);
      }

      // Import the transaction status service
      const { transactionStatusService } = await import(
        "../services/transaction-status-service"
      );

      // Check if we have a local transaction record
      const transaction = await Transaction.findOne({ txHash });

      // Get blockchain status
      const blockchainStatus =
        await transactionStatusService.checkTransactionStatus(
          txHash,
          selectedNetworkId
        );

      // If we have a local record, return combined info
      if (transaction) {
        // Check if user is authorized to view this transaction
        if (
          transaction.fromUserId?.toString() !== userId &&
          transaction.toUserId.toString() !== userId
        ) {
          return error("Unauthorized to access this transaction", 403);
        }

        return success({
          transaction: {
            id: transaction._id,
            txHash: transaction.txHash,
            status: transaction.status,
            type: transaction.type,
            amount: transaction.amount,
            fromAddress: transaction.fromAddress,
            toAddress: transaction.toAddress,
            sourceChain: transaction.sourceChain,
            destinationChain: transaction.destinationChain,
            category: transaction.category,
            tags: transaction.tags,
            client: transaction.client,
            projectId: transaction.projectId,
            metadata: transaction.metadata,
            createdAt: transaction.createdAt,
            updatedAt: transaction.updatedAt,
          },
          blockchainStatus: {
            isConfirmed: blockchainStatus.isConfirmed,
            status: blockchainStatus.status,
            confirmations: blockchainStatus.confirmations,
            blockNumber: blockchainStatus.blockNumber,
            error: blockchainStatus.error,
          },
        });
      }

      // If no local record, return only blockchain status
      return success({
        blockchainStatus: {
          isConfirmed: blockchainStatus.isConfirmed,
          status: blockchainStatus.status,
          confirmations: blockchainStatus.confirmations,
          blockNumber: blockchainStatus.blockNumber,
          error: blockchainStatus.error,
        },
        message:
          "No local transaction record found. Only blockchain status available.",
      });
    } catch (err) {
      console.error("Get transaction status error:", err);
      return error("Could not retrieve transaction status", 500);
    }
  }
);

/**
 * Fix pending transactions
 * POST /api/transactions/fix-pending
 */
export const fixPendingTransactions = async (
  event: any
): Promise<APIGatewayProxyResult> => {
  try {
    // Import the transaction status service
    const { transactionStatusService } = await import(
      "../services/transaction-status-service"
    );

    // Fix pending transactions
    const result = await transactionStatusService.fixPendingTransactions();

    return success({
      message: "Pending transactions fix completed",
      result,
    });
  } catch (err) {
    console.error("Fix pending transactions error:", err);
    return error("Could not fix pending transactions", 500);
  }
};

/**
 * Comprehensive pending transaction cleanup
 * POST /api/transactions/cleanup-pending
 */
export const comprehensivePendingTransactionCleanup = async (
  event: any
): Promise<APIGatewayProxyResult> => {
  try {
    // Import the transaction status service
    const { transactionStatusService } = await import(
      "../services/transaction-status-service"
    );

    // Check if this is a dry run
    const body = event.body ? JSON.parse(event.body) : {};
    const isDryRun = body.dryRun === true;
    const maxTransactions = body.maxTransactions || 100; // Limit processing

    console.log("Starting comprehensive cleanup", {
      isDryRun,
      maxTransactions,
      body,
    });

    // Run comprehensive cleanup with limits
    const result =
      await transactionStatusService.comprehensivePendingTransactionCleanup({
        dryRun: isDryRun,
        maxTransactions,
      });

    return success({
      message: "Comprehensive pending transaction cleanup completed",
      result,
      isDryRun,
      maxTransactions,
    });
  } catch (err) {
    console.error("Comprehensive cleanup error:", err);
    return error("Could not run comprehensive cleanup", 500);
  }
};

/**
 * Get supported blockchain networks
 * GET /api/transactions/networks
 */
export const getSupportedNetworks = requireAuth(
  async (
    event: AuthenticatedAPIGatewayProxyEvent
  ): Promise<APIGatewayProxyResult> => {
    try {
      // Import the blockchain service
      const { blockchainService } = await import(
        "../services/blockchain-service"
      );

      const networks = blockchainService.getSupportedNetworks();
      const defaultNetwork = blockchainService.getDefaultNetwork();
      const currentEnvironment = blockchainService.getCurrentEnvironment();

      return success({
        networks,
        defaultNetwork,
        currentEnvironment,
        message: "Supported blockchain networks",
      });
    } catch (err) {
      console.error("Get supported networks error:", err);
      return error("Could not retrieve supported networks", 500);
    }
  }
);
