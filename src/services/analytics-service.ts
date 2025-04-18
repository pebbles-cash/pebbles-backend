import { Types } from "mongoose";
import { Transaction, User } from "../models";

/**
 * Get earnings summary for a user in a specific time period
 * @param userId User ID
 * @param period Time period (day, week, month, year)
 * @param startDate Optional custom start date
 * @param endDate Optional custom end date
 * @returns Earnings summary with breakdown by type
 */
export async function getEarningsSummary(
  userId: string,
  period: "day" | "week" | "month" | "year" = "month",
  startDate?: Date,
  endDate?: Date
): Promise<{
  totalEarnings: number;
  currency: string;
  byType: Record<string, number>;
  topSources: Array<{ source: string; amount: number }>;
  periodStart: Date;
  periodEnd: Date;
  comparisonWithPrevious?: {
    previousTotal: number;
    percentageChange: number;
  };
}> {
  try {
    // Determine date range
    const { start, end } = getDateRange(period, startDate, endDate);

    // Get user info (for currency preference)
    const user = await User.findById(userId);
    const currency = user?.preferences?.defaultCurrency || "USD";

    // Build base query for transactions
    const baseQuery = {
      toUserId: new Types.ObjectId(userId),
      status: "completed",
      createdAt: {
        $gte: start,
        $lte: end,
      },
    };

    // Run aggregation for total earnings and earnings by type
    const aggregationResult = await Transaction.aggregate([
      { $match: baseQuery },
      {
        $group: {
          _id: "$type",
          total: { $sum: { $toDouble: "$amount" } },
          count: { $sum: 1 },
        },
      },
    ]);

    // Calculate total earnings and breakdown by type
    let totalEarnings = 0;
    const byType: Record<string, number> = {};

    aggregationResult.forEach((item) => {
      const type = item._id as string;
      const amount = item.total;
      byType[type] = amount;
      totalEarnings += amount;
    });

    // Get top sources (client/category/project)
    const sourceAggregation = await Transaction.aggregate([
      { $match: baseQuery },
      {
        $group: {
          _id: {
            source: { $ifNull: ["$metadata.client", "$metadata.category"] },
            type: "$type",
          },
          amount: { $sum: { $toDouble: "$amount" } },
        },
      },
      { $sort: { amount: -1 } },
      { $limit: 5 },
    ]);

    const topSources = sourceAggregation.map((item) => ({
      source: item._id.source || item._id.type || "Unknown",
      amount: item.amount,
    }));

    // Calculate comparison with previous period
    const previousStart = new Date(start);
    const previousEnd = new Date(end);
    const duration = end.getTime() - start.getTime();

    previousStart.setTime(previousStart.getTime() - duration);
    previousEnd.setTime(previousEnd.getTime() - duration);

    const previousQuery = {
      ...baseQuery,
      createdAt: {
        $gte: previousStart,
        $lte: previousEnd,
      },
    };

    const previousResult = await Transaction.aggregate([
      { $match: previousQuery },
      {
        $group: {
          _id: null,
          total: { $sum: { $toDouble: "$amount" } },
        },
      },
    ]);

    let comparisonWithPrevious;
    if (previousResult.length > 0) {
      const previousTotal = previousResult[0].total;
      const percentageChange =
        previousTotal === 0
          ? 100 // If previous was 0, show 100% increase
          : ((totalEarnings - previousTotal) / previousTotal) * 100;

      comparisonWithPrevious = {
        previousTotal,
        percentageChange,
      };
    }

    return {
      totalEarnings,
      currency,
      byType,
      topSources,
      periodStart: start,
      periodEnd: end,
      comparisonWithPrevious,
    };
  } catch (error) {
    console.error("Error getting earnings summary:", error);
    throw error;
  }
}

/**
 * Get earnings data for a specific transaction type
 * @param userId User ID
 * @param period Time period (day, week, month, year)
 * @param transactionType Type of transaction (payment, subscription, tip)
 * @param startDate Optional custom start date
 * @param endDate Optional custom end date
 * @returns Detailed earnings data for the specified type
 */
export async function getEarningsByType(
  userId: string,
  period: "day" | "week" | "month" | "year" = "month",
  transactionType: string,
  startDate?: Date,
  endDate?: Date
): Promise<{
  totalEarnings: number;
  currency: string;
  transactionType: string;
  transactionCount: number;
  periodStart: Date;
  periodEnd: Date;
  averageAmount: number;
  timeSeries: Array<{
    date: string;
    amount: number;
    count: number;
  }>;
  topSources?: Array<{
    source: string;
    amount: number;
    count: number;
  }>;
}> {
  try {
    // Determine date range
    const { start, end } = getDateRange(period, startDate, endDate);

    // Get user info (for currency preference)
    const user = await User.findById(userId);
    const currency = user?.preferences?.defaultCurrency || "USD";

    // Build query for transactions
    const query = {
      toUserId: new Types.ObjectId(userId),
      type: transactionType,
      status: "completed",
      createdAt: {
        $gte: start,
        $lte: end,
      },
    };

    // Run aggregation for total
    const aggregationResult = await Transaction.aggregate([
      { $match: query },
      {
        $group: {
          _id: null,
          total: { $sum: { $toDouble: "$amount" } },
          count: { $sum: 1 },
        },
      },
    ]);

    const totalEarnings =
      aggregationResult.length > 0 ? aggregationResult[0].total : 0;
    const transactionCount =
      aggregationResult.length > 0 ? aggregationResult[0].count : 0;
    const averageAmount =
      transactionCount > 0 ? totalEarnings / transactionCount : 0;

    // Generate time series data based on period
    const timeSeriesData = await generateTimeSeries(query, period, start, end);

    // Get top sources for this transaction type
    const sourceAggregation = await Transaction.aggregate([
      { $match: query },
      {
        $group: {
          _id: { $ifNull: ["$metadata.client", "$metadata.category"] },
          amount: { $sum: { $toDouble: "$amount" } },
          count: { $sum: 1 },
        },
      },
      { $sort: { amount: -1 } },
      { $limit: 5 },
    ]);

    const topSources = sourceAggregation.map((item) => ({
      source: item._id || "Unknown",
      amount: item.amount,
      count: item.count,
    }));

    return {
      totalEarnings,
      currency,
      transactionType,
      transactionCount,
      periodStart: start,
      periodEnd: end,
      averageAmount,
      timeSeries: timeSeriesData,
      topSources,
    };
  } catch (error) {
    console.error(
      `Error getting earnings by type (${transactionType}):`,
      error
    );
    throw error;
  }
}

/**
 * Get client analytics for a user
 * @param userId User ID
 * @param period Time period (day, week, month, year)
 * @param clientId Optional specific client to analyze
 * @param startDate Optional custom start date
 * @param endDate Optional custom end date
 * @returns Client analytics data
 */
export async function getClientAnalytics(
  userId: string,
  period: "day" | "week" | "month" | "year" = "month",
  clientId?: string,
  startDate?: Date,
  endDate?: Date
): Promise<{
  clients: Array<{
    client: string;
    totalEarnings: number;
    transactionCount: number;
    lastTransaction: Date;
    byType: Record<string, number>;
  }>;
  periodStart: Date;
  periodEnd: Date;
  currency: string;
}> {
  try {
    // Determine date range
    const { start, end } = getDateRange(period, startDate, endDate);

    // Get user info (for currency preference)
    const user = await User.findById(userId);
    const currency = user?.preferences?.defaultCurrency || "USD";

    // Build query for transactions
    const query: any = {
      toUserId: new Types.ObjectId(userId),
      status: "completed",
      createdAt: {
        $gte: start,
        $lte: end,
      },
    };

    // Add client filter if provided
    if (clientId) {
      query["metadata.client"] = clientId;
    }

    // Run aggregation for client data
    const clientAggregation = await Transaction.aggregate([
      { $match: query },
      {
        $group: {
          _id: {
            client: { $ifNull: ["$metadata.client", "Unknown"] },
            type: "$type",
          },
          totalAmount: { $sum: { $toDouble: "$amount" } },
          count: { $sum: 1 },
          lastTransaction: { $max: "$createdAt" },
        },
      },
      { $sort: { "_id.client": 1, totalAmount: -1 } },
    ]);

    // Process the results to group by client
    const clientsMap = new Map();

    clientAggregation.forEach((item) => {
      const clientName = item._id.client;
      const type = item._id.type;

      if (!clientsMap.has(clientName)) {
        clientsMap.set(clientName, {
          client: clientName,
          totalEarnings: 0,
          transactionCount: 0,
          lastTransaction: item.lastTransaction,
          byType: {},
        });
      }

      const clientData = clientsMap.get(clientName);
      clientData.totalEarnings += item.totalAmount;
      clientData.transactionCount += item.count;
      clientData.byType[type] = item.totalAmount;

      // Update last transaction date if newer
      if (
        new Date(item.lastTransaction) > new Date(clientData.lastTransaction)
      ) {
        clientData.lastTransaction = item.lastTransaction;
      }
    });

    // Convert map to array and sort by earnings
    const clients = Array.from(clientsMap.values()).sort(
      (a, b) => b.totalEarnings - a.totalEarnings
    );

    return {
      clients,
      periodStart: start,
      periodEnd: end,
      currency,
    };
  } catch (error) {
    console.error("Error getting client analytics:", error);
    throw error;
  }
}

/**
 * Generate invoice data for a client
 * @param userId User ID
 * @param clientId Client identifier
 * @param startDate Start date for invoice period
 * @param endDate End date for invoice period
 * @returns Invoice data
 */
export async function generateInvoiceData(
  userId: string,
  clientId: string,
  startDate: Date,
  endDate: Date
): Promise<{
  invoiceData: {
    client: string;
    issuer: {
      name: string;
      email: string;
      address?: string;
      walletAddress?: string;
    };
    issueDate: Date;
    dueDate: Date;
    invoiceNumber: string;
    items: Array<{
      description: string;
      date: Date;
      amount: number;
      type: string;
    }>;
    subtotal: number;
    total: number;
    currency: string;
    notes?: string;
  };
  transactions: any[];
}> {
  try {
    // Get user info
    const user = await User.findById(userId);
    if (!user) {
      throw new Error("User not found");
    }

    const currency = user.preferences?.defaultCurrency || "USD";

    // Query for client transactions
    const query = {
      toUserId: new Types.ObjectId(userId),
      "metadata.client": clientId,
      status: "completed",
      createdAt: {
        $gte: startDate,
        $lte: endDate,
      },
    };

    const transactions = await Transaction.find(query)
      .sort({ createdAt: 1 })
      .exec();

    // Calculate totals
    const subtotal = transactions.reduce(
      (sum, tx) => sum + parseFloat(tx.amount),
      0
    );

    // Generate invoice number (simple implementation)
    const invoiceNumber = `INV-${Date.now().toString().substring(7)}-${Math.floor(Math.random() * 1000)}`;

    // Set due date (30 days from issue)
    const dueDate = new Date();
    dueDate.setDate(dueDate.getDate() + 30);

    // Format transactions as invoice items
    const items = transactions.map((tx) => ({
      description: tx.metadata?.note || `${tx.type} payment`,
      date: tx.createdAt,
      amount: parseFloat(tx.amount),
      type: tx.type,
    }));

    // Format issuer details
    const issuer = {
      name: user.displayName || user.username,
      email: user.email,
      address: user.walletAddress,
      walletAddress: user.walletAddress,
    };

    return {
      invoiceData: {
        client: clientId,
        issuer,
        issueDate: new Date(),
        dueDate,
        invoiceNumber,
        items,
        subtotal,
        total: subtotal, // Add tax calculation if needed
        currency,
        notes: `Payment due within 30 days. Thank you for your business.`,
      },
      transactions,
    };
  } catch (error) {
    console.error("Error generating invoice data:", error);
    throw error;
  }
}

/**
 * Get subscription analytics for a user
 * @param userId User ID
 * @param period Time period (day, week, month, year)
 * @param startDate Optional custom start date
 * @param endDate Optional custom end date
 * @returns Subscription analytics data
 */
export async function getSubscriptionAnalytics(
  userId: string,
  period: "day" | "week" | "month" | "year" = "month",
  startDate?: Date,
  endDate?: Date
): Promise<{
  totalSubscriptionRevenue: number;
  activeSubscribers: number;
  churnRate: number;
  newSubscribers: number;
  averageSubscriptionValue: number;
  subscriptionsByPlan: Array<{
    plan: string;
    subscribers: number;
    revenue: number;
  }>;
  periodStart: Date;
  periodEnd: Date;
  currency: string;
}> {
  try {
    // Determine date range
    const { start, end } = getDateRange(period, startDate, endDate);

    // Get user info (for currency preference)
    const user = await User.findById(userId);
    const currency = user?.preferences?.defaultCurrency || "USD";

    // This would be implemented with actual subscription data
    // For now, we'll return a placeholder with mock data

    return {
      totalSubscriptionRevenue: 1250,
      activeSubscribers: 25,
      churnRate: 5,
      newSubscribers: 8,
      averageSubscriptionValue: 50,
      subscriptionsByPlan: [
        {
          plan: "Basic",
          subscribers: 15,
          revenue: 450,
        },
        {
          plan: "Premium",
          subscribers: 10,
          revenue: 800,
        },
      ],
      periodStart: start,
      periodEnd: end,
      currency,
    };
  } catch (error) {
    console.error("Error getting subscription analytics:", error);
    throw error;
  }
}

/**
 * Helper function to determine date range based on period
 */
function getDateRange(
  period: "day" | "week" | "month" | "year",
  startDate?: Date,
  endDate?: Date
): { start: Date; end: Date } {
  // If custom dates are provided, use them
  if (startDate && endDate) {
    return { start: startDate, end: endDate };
  }

  const end = new Date();
  const start = new Date();

  // Configure start date based on period
  switch (period) {
    case "day":
      start.setHours(0, 0, 0, 0);
      end.setHours(23, 59, 59, 999);
      break;
    case "week":
      start.setDate(end.getDate() - 7);
      break;
    case "month":
      start.setMonth(end.getMonth() - 1);
      break;
    case "year":
      start.setFullYear(end.getFullYear() - 1);
      break;
  }

  return { start, end };
}

/**
 * Generate time series data for given query and period
 */
async function generateTimeSeries(
  query: any,
  period: "day" | "week" | "month" | "year",
  start: Date,
  end: Date
): Promise<Array<{ date: string; amount: number; count: number }>> {
  // Determine grouping format based on period
  let dateFormat;
  let numPoints;

  switch (period) {
    case "day":
      dateFormat = { $dateToString: { format: "%H:00", date: "$createdAt" } };
      numPoints = 24;
      break;
    case "week":
      dateFormat = {
        $dateToString: { format: "%Y-%m-%d", date: "$createdAt" },
      };
      numPoints = 7;
      break;
    case "month":
      dateFormat = {
        $dateToString: { format: "%Y-%m-%d", date: "$createdAt" },
      };
      numPoints = 30;
      break;
    case "year":
      dateFormat = { $dateToString: { format: "%Y-%m", date: "$createdAt" } };
      numPoints = 12;
      break;
  }

  // Run time series aggregation
  const timeSeriesAgg = await Transaction.aggregate([
    { $match: query },
    {
      $group: {
        _id: dateFormat,
        amount: { $sum: { $toDouble: "$amount" } },
        count: { $sum: 1 },
      },
    },
    { $sort: { _id: 1 } },
  ]);

  // Transform to consistent format
  const timeSeriesData = timeSeriesAgg.map((point) => ({
    date: point._id,
    amount: point.amount,
    count: point.count,
  }));

  // Fill in missing dates if needed (simplified version)
  // A more complete implementation would generate all dates in the range

  return timeSeriesData;
}
