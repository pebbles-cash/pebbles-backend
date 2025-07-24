import { APIGatewayProxyResult } from "aws-lambda";
import { requireAuth } from "../middleware/auth";
import { AuthenticatedAPIGatewayProxyEvent } from "../types";
import { Transaction, FiatInteraction, User } from "../models";
import { success, error } from "../utils/response";
import { getTokenSymbol } from "../utils/token-symbols";

/**
 * Unified user activity feed
 * GET /api/user/activity
 */
export const getUserActivity = requireAuth(
  async (
    event: AuthenticatedAPIGatewayProxyEvent
  ): Promise<APIGatewayProxyResult> => {
    try {
      const userId = event.user?.id;
      if (!userId) return error("User ID not found in token", 401);

      // Query params
      const queryParams = event.queryStringParameters || {};
      const page = parseInt(queryParams.page || "1", 10);
      const limit = parseInt(queryParams.limit || "10", 10);
      const skip = (page - 1) * limit;
      const category = queryParams.category as
        | "all"
        | "received"
        | "paid"
        | "deposit"
        | "withdraw"
        | undefined;
      const startDate = queryParams.startDate
        ? new Date(queryParams.startDate)
        : undefined;
      const endDate = queryParams.endDate
        ? new Date(queryParams.endDate)
        : undefined;

      // --- Transactions (received/paid) ---
      const txQuery: any = {
        status: "completed",
        $or: [{ toUserId: userId }, { fromUserId: userId }],
      };
      if (startDate || endDate) {
        txQuery.createdAt = {};
        if (startDate) txQuery.createdAt.$gte = startDate;
        if (endDate) txQuery.createdAt.$lte = endDate;
      }
      // Filter by direction if needed
      if (category === "received") txQuery.toUserId = userId;
      if (category === "paid") txQuery.fromUserId = userId;
      // Only include transaction types for these categories
      if (["received", "paid"].includes(category || "")) {
        // No further filter needed
      }

      // --- Fiat Interactions (deposit/withdraw) ---
      const fiatQuery: any = {
        userId,
        status: "completed",
      };
      if (startDate || endDate) {
        fiatQuery.createdAt = {};
        if (startDate) fiatQuery.createdAt.$gte = startDate;
        if (endDate) fiatQuery.createdAt.$lte = endDate;
      }
      if (category === "deposit") fiatQuery.type = "onramp";
      if (category === "withdraw") fiatQuery.type = "offramp";

      // Fetch all (for now, will paginate after merge)
      const [transactions, fiatInteractions] = await Promise.all([
        Transaction.find(txQuery).sort({ createdAt: -1 }).lean(),
        FiatInteraction.find(fiatQuery).sort({ createdAt: -1 }).lean(),
      ]);

      // Get user info for counterparties
      const userIds = new Set<string>();
      transactions.forEach((tx) => {
        if (tx.fromUserId) userIds.add(tx.fromUserId.toString());
        if (tx.toUserId) userIds.add(tx.toUserId.toString());
      });
      const users = await User.find({
        _id: { $in: Array.from(userIds) },
      }).select("_id username displayName avatar");
      const userMap = new Map();
      users.forEach((user) => {
        userMap.set(user._id.toString(), {
          id: user._id,
          username: user.username,
          displayName: user.displayName,
          avatar: user.avatar,
        });
      });

      // Normalize and merge
      const activities: any[] = [];
      // Transactions
      for (const tx of transactions) {
        const isSender = tx.fromUserId?.toString() === userId;

        // Get token symbol from address and network, fallback to token address if no mapping
        const network = tx.sourceChain || "ethereum";
        const currency = getTokenSymbol(tx.tokenAddress, network);

        activities.push({
          id: tx._id,
          amount: tx.amount,
          currency: currency,
          direction: isSender ? "output" : "input",
          date: tx.createdAt,
          category: isSender ? "paid" : "received",
          rawType: tx.type,
          counterparty: isSender
            ? userMap.get(tx.toUserId?.toString())
            : userMap.get(tx.fromUserId?.toString()),
          note: tx.metadata?.note || "",
        });
      }
      // Fiat Interactions
      for (const fiat of fiatInteractions) {
        // Get token symbol for crypto currency if it has a token address
        let currency =
          fiat.fiatAmount?.currency || fiat.cryptoAmount?.currency || "USD";

        // If it's a crypto amount with a token address, get the symbol
        if (fiat.cryptoAmount?.tokenAddress) {
          const network = fiat.blockchain || "ethereum";
          currency = getTokenSymbol(fiat.cryptoAmount.tokenAddress, network);
        }

        activities.push({
          id: fiat._id,
          amount:
            fiat.fiatAmount?.value?.toString() ||
            fiat.cryptoAmount?.value?.toString() ||
            "",
          currency: currency,
          direction: fiat.type === "onramp" ? "input" : "output",
          date: fiat.createdAt,
          category: fiat.type === "onramp" ? "deposit" : "withdraw",
          rawType: fiat.type,
          counterparty: { username: "Meld", displayName: "Meld" },
          note: fiat.metadata?.note || "",
        });
      }

      // Merge, sort, paginate
      activities.sort(
        (a, b) => new Date(b.date).getTime() - new Date(a.date).getTime()
      );
      const total = activities.length;
      const paginated = activities.slice(skip, skip + limit);

      return success({
        activities: paginated,
        pagination: {
          total,
          page,
          limit,
          pages: Math.ceil(total / limit),
        },
      });
    } catch (err) {
      console.error("Get user activity error:", err);
      return error("Could not retrieve user activity", 500);
    }
  }
);
