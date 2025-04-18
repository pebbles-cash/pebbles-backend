import { Schema, model, Document, Types } from "mongoose";
import { IAnalyticsCache, AnalyticsCacheModel } from "../types";

const analyticsCacheSchema = new Schema<IAnalyticsCache>({
  userId: {
    type: Schema.Types.ObjectId,
    ref: "User",
    required: true,
  },
  queryType: {
    type: String,
    required: true,
    enum: [
      "earningsSummary",
      "earningsByType",
      "earningsByCategory",
      "earningsByClient",
      "earningsByProject",
      "earningsTrend",
      "paymentMethods",
      "clientActivity",
      "subscriptionRecurring",
      "tipAnalysis",
      "custom",
    ],
  },
  params: {
    period: {
      type: String,
      enum: ["day", "week", "month", "quarter", "year"],
    },
    startDate: Date,
    endDate: Date,
    transactionType: String,
    categories: [String],
    tags: [String],
    clients: [String],
    groupBy: String,
    currency: String,
    includeDetails: Boolean,
  },
  results: Schema.Types.Mixed,
  createdAt: {
    type: Date,
    default: Date.now,
    expires: "7d", // TTL index to automatically remove entries after 7 days
  },
  expiresAt: {
    type: Date,
    required: true,
    default: () => new Date(Date.now() + 24 * 60 * 60 * 1000), // 24 hours by default
  },
  lastAccessed: {
    type: Date,
    default: Date.now,
  },
  accessCount: {
    type: Number,
    default: 0,
  },
});

// Create indexes
analyticsCacheSchema.index({ userId: 1, queryType: 1 });
analyticsCacheSchema.index({
  userId: 1,
  "params.startDate": 1,
  "params.endDate": 1,
});
analyticsCacheSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 }); // TTL index
analyticsCacheSchema.index({ lastAccessed: 1 });

// Create a compound index for efficient cache lookups
analyticsCacheSchema.index({
  userId: 1,
  queryType: 1,
  "params.period": 1,
  "params.transactionType": 1,
  "params.startDate": 1,
  "params.endDate": 1,
});

// Method to check if result is still valid
analyticsCacheSchema.methods.isValid = function (): boolean {
  return new Date() < this.expiresAt;
};

// Method to update last accessed time and increment counter
analyticsCacheSchema.methods.updateAccess = function (): void {
  this.lastAccessed = new Date();
  this.accessCount += 1;
};

// Static method to find cache entry by parameters
analyticsCacheSchema.statics.findByParams = async function (
  userId: Types.ObjectId,
  queryType: string,
  params: Record<string, any>
): Promise<IAnalyticsCache | null> {
  const query: any = {
    userId,
    queryType,
    expiresAt: { $gt: new Date() },
  };

  // Add parameters to query
  Object.entries(params).forEach(([key, value]) => {
    if (value !== undefined) {
      query[`params.${key}`] = value;
    }
  });

  const cache = await this.findOne(query);

  if (cache) {
    cache.updateAccess();
    await cache.save();
  }

  return cache;
};

// Create a function to generate a unique cache key
analyticsCacheSchema.statics.generateCacheKey = function (
  queryType: string,
  params: Record<string, any>
): string {
  const sortedParams = Object.entries(params)
    .filter(([_, v]) => v !== undefined)
    .sort(([a], [b]) => a.localeCompare(b));

  return `${queryType}:${JSON.stringify(sortedParams)}`;
};

export const AnalyticsCache = model<IAnalyticsCache, AnalyticsCacheModel>(
  "AnalyticsCache",
  analyticsCacheSchema
);
