import { APIGatewayProxyResult } from "aws-lambda";
import { requireAuth } from "../middleware/auth";
import { AuthenticatedAPIGatewayProxyEvent } from "../types";
import { Transaction, FiatInteraction, User } from "../models";
import { success, error } from "../utils/response";
import { getTokenSymbol } from "../utils/token-symbols";
import { Types } from "mongoose";

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

      // Parse category filter - support both positive and negative filtering
      const categoryParam = queryParams.category;
      let categoryFilter: {
        type: "include" | "exclude";
        value: string;
      } | null = null;

      if (categoryParam) {
        if (categoryParam.startsWith("!=")) {
          // Negative filtering: category!=value
          categoryFilter = {
            type: "exclude",
            value: categoryParam.substring(2),
          };
        } else {
          // Positive filtering: category=value
          categoryFilter = {
            type: "include",
            value: categoryParam,
          };
        }
      }

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

      // Apply category filtering for transactions
      if (categoryFilter) {
        if (categoryFilter.type === "include") {
          // Include specific category
          if (categoryFilter.value === "received") {
            txQuery.toUserId = userId;
            delete txQuery.$or;
          } else if (categoryFilter.value === "paid") {
            txQuery.fromUserId = userId;
            delete txQuery.$or;
          } else if (["deposit", "withdraw"].includes(categoryFilter.value)) {
            // If filtering for fiat categories, exclude all transactions
            txQuery._id = { $exists: false }; // This will return no results
          }
        } else {
          // Exclude specific category
          if (categoryFilter.value === "received") {
            txQuery.fromUserId = userId;
            delete txQuery.$or;
          } else if (categoryFilter.value === "paid") {
            txQuery.toUserId = userId;
            delete txQuery.$or;
          }
          // If excluding deposit/withdraw, no change needed for transactions
        }
      }

      // --- Fiat Interactions (deposit/withdraw) ---
      // Get user's Meld identifiers from metadata to find unassigned fiat interactions
      const user = await User.findById(userId).lean();
      const userMeldIdentifiers =
        user && (user as any).metadata
          ? [
              (user as any).metadata.meldCustomerId,
              (user as any).metadata.customerId,
              (user as any).metadata.meldAccountId,
            ].filter(Boolean)
          : [];

      const fiatQuery: any = {
        $or: [
          { userId }, // Assigned fiat interactions
          // Unassigned fiat interactions that might belong to this user
          ...(userMeldIdentifiers.length > 0
            ? [
                {
                  userId: { $exists: false },
                  $or: userMeldIdentifiers.map((identifier) => ({
                    meldCustomerId: identifier,
                  })),
                },
              ]
            : []),
        ],
        status: "completed",
      };
      if (startDate || endDate) {
        fiatQuery.createdAt = {};
        if (startDate) fiatQuery.createdAt.$gte = startDate;
        if (endDate) fiatQuery.createdAt.$lte = endDate;
      }

      // Apply category filtering for fiat interactions
      if (categoryFilter) {
        if (categoryFilter.type === "include") {
          // Include specific category
          if (categoryFilter.value === "deposit") {
            fiatQuery.type = "onramp";
          } else if (categoryFilter.value === "withdraw") {
            fiatQuery.type = "offramp";
          } else if (["received", "paid"].includes(categoryFilter.value)) {
            // If filtering for transaction categories, exclude all fiat interactions
            fiatQuery._id = { $exists: false }; // This will return no results
          }
        } else {
          // Exclude specific category
          if (categoryFilter.value === "deposit") {
            fiatQuery.type = "offramp";
          } else if (categoryFilter.value === "withdraw") {
            fiatQuery.type = "onramp";
          }
          // If excluding received/paid, no change needed for fiat interactions
        }
      }

      // Fetch all (for now, will paginate after merge)
      const [transactions, fiatInteractions] = await Promise.all([
        Transaction.find(txQuery).sort({ createdAt: -1 }).lean(),
        FiatInteraction.find(fiatQuery).sort({ createdAt: -1 }).lean(),
      ]);

      // Auto-assign unassigned fiat interactions to the user
      if (userMeldIdentifiers.length > 0) {
        const unassignedFiatInteractions = fiatInteractions.filter(
          (fiat) => !fiat.userId
        );

        if (unassignedFiatInteractions.length > 0) {
          // Update unassigned fiat interactions to assign them to this user
          const fiatInteractionIds = unassignedFiatInteractions.map(
            (fiat) => fiat._id
          );

          await FiatInteraction.updateMany(
            { _id: { $in: fiatInteractionIds } },
            { userId: new Types.ObjectId(userId) }
          );

          console.log(
            `Auto-assigned ${unassignedFiatInteractions.length} fiat interactions to user ${userId}`
          );
        }
      }

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
        // Use the new Meld API format fields
        let currency =
          fiat.sourceCurrencyCode || fiat.destinationCurrencyCode || "USD";
        let amount = fiat.sourceAmount || fiat.destinationAmount || 0;

        // For onramp, show the fiat amount (source)
        // For offramp, show the crypto amount (destination)
        if (fiat.type === "onramp") {
          currency = fiat.sourceCurrencyCode || "USD";
          amount = fiat.sourceAmount || 0;
        } else {
          currency = fiat.destinationCurrencyCode || "USD";
          amount = fiat.destinationAmount || 0;
        }

        // Fallback to legacy fields if new fields are not available
        if (!amount || amount === 0) {
          if (fiat.fiatAmount?.value) {
            amount = fiat.fiatAmount.value;
            currency = fiat.fiatAmount.currency || currency;
          } else if (fiat.cryptoAmount?.value) {
            amount = fiat.cryptoAmount.value;
            currency = fiat.cryptoAmount.currency || currency;
          }
        }

        // If it's a crypto amount with a token address, get the symbol
        if (fiat.cryptoAmount?.tokenAddress) {
          const network = fiat.blockchain || "ethereum";
          currency = getTokenSymbol(fiat.cryptoAmount.tokenAddress, network);
        }

        activities.push({
          id: fiat._id,
          amount: amount.toString(),
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
