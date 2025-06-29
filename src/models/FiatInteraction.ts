import { Schema, model } from "mongoose";
import {
  IFiatInteraction,
  IFeeBreakdown,
  IAccountDetails,
  FiatInteractionModel,
} from "../types";

const feeBreakdownSchema = new Schema<IFeeBreakdown>(
  {
    serviceFee: {
      value: { type: Number, required: true },
      currency: { type: String, required: true },
    },
    networkFee: {
      value: { type: Number, default: 0 },
      currency: { type: String, required: true },
    },
    totalFees: {
      value: { type: Number, required: true },
      currency: { type: String, required: true },
    },
  },
  { _id: false }
);

const accountDetailsSchema = new Schema<IAccountDetails>(
  {
    type: {
      type: String,
      required: true,
      enum: ["bank_account", "card", "crypto_wallet", "other"],
    },
    identifier: { type: String, required: true }, // last 4 digits, wallet address, etc.
    name: String, // Bank name, card type, wallet name
    country: String,
  },
  { _id: false }
);

const fiatInteractionSchema = new Schema<IFiatInteraction>(
  {
    userId: {
      type: Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },
    type: {
      type: String,
      required: true,
      enum: ["onramp", "offramp"],
      index: true,
    },
    status: {
      type: String,
      required: true,
      enum: [
        "pending",
        "processing",
        "completed",
        "failed",
        "cancelled",
        "expired",
      ],
      default: "pending",
      index: true,
    },
    serviceProvider: {
      type: String,
      required: true,
      enum: ["meld", "moonpay", "ramp", "transak", "other"],
    },
    externalTransactionId: {
      type: String,
      required: true,
      unique: true,
    },
    fiatAmount: {
      value: { type: Number, required: true },
      currency: { type: String, required: true, uppercase: true },
    },
    cryptoAmount: {
      value: { type: Number, required: true },
      currency: { type: String, required: true, uppercase: true },
      tokenAddress: String, // For ERC-20 tokens
    },
    exchangeRate: {
      type: Number,
      required: true,
    },
    fees: {
      type: feeBreakdownSchema,
      required: true,
    },
    sourceAccount: {
      type: accountDetailsSchema,
      required: true,
    },
    destinationAccount: {
      type: accountDetailsSchema,
      required: true,
    },
    blockchain: {
      type: String,
      required: true,
      default: "ethereum",
    },
    transactionHash: String, // Blockchain tx hash (for completed transactions)
    initiatedAt: {
      type: Date,
      default: Date.now,
      required: true,
    },
    processingStartedAt: Date,
    completedAt: Date,
    failedAt: Date,
    cancelledAt: Date,
    failureReason: String,
    ipAddress: {
      type: String,
      required: true,
    },
    deviceInfo: {
      userAgent: String,
      platform: String,
      fingerprint: String, // Device fingerprint for security
    },
    kycLevel: {
      type: String,
      enum: ["none", "basic", "full"],
      default: "none",
    },
    limits: {
      dailyRemaining: Number,
      monthlyRemaining: Number,
      transactionLimit: Number,
    },
    metadata: {
      type: Schema.Types.Mixed,
      default: {},
    },
    webhookEvents: [
      {
        event: String,
        timestamp: Date,
        data: Schema.Types.Mixed,
      },
    ],
  },
  {
    timestamps: true,
    toJSON: { virtuals: true },
    toObject: { virtuals: true },
  }
);

// Indexes for efficient querying
fiatInteractionSchema.index({ userId: 1, createdAt: -1 });
fiatInteractionSchema.index({ status: 1, createdAt: -1 });
fiatInteractionSchema.index({ serviceProvider: 1, createdAt: -1 });
fiatInteractionSchema.index({ type: 1, createdAt: -1 });
fiatInteractionSchema.index({ externalTransactionId: 1 }, { unique: true });
fiatInteractionSchema.index({
  userId: 1,
  type: 1,
  status: 1,
  createdAt: -1,
});

// Virtual for calculating net amount after fees
fiatInteractionSchema.virtual("netFiatAmount").get(function () {
  return this.type === "onramp"
    ? this.fiatAmount.value - this.fees.totalFees.value
    : this.fiatAmount.value + this.fees.totalFees.value;
});

// Instance methods
fiatInteractionSchema.methods.updateStatus = function (
  newStatus: string,
  additionalData?: any
) {
  this.status = newStatus;

  const now = new Date();
  switch (newStatus) {
    case "processing":
      this.processingStartedAt = now;
      break;
    case "completed":
      this.completedAt = now;
      if (additionalData?.transactionHash) {
        this.transactionHash = additionalData.transactionHash;
      }
      break;
    case "failed":
      this.failedAt = now;
      if (additionalData?.reason) {
        this.failureReason = additionalData.reason;
      }
      break;
    case "cancelled":
      this.cancelledAt = now;
      break;
  }

  return this.save();
};

fiatInteractionSchema.methods.addWebhookEvent = function (
  event: string,
  data: any
) {
  this.webhookEvents.push({
    event,
    timestamp: new Date(),
    data,
  });
  return this.save();
};

// Static methods
fiatInteractionSchema.statics.getUserStats = async function (
  userId: string,
  timeframe: "day" | "week" | "month" | "year" = "month"
) {
  const now = new Date();
  const startDate = new Date();

  switch (timeframe) {
    case "day":
      startDate.setDate(now.getDate() - 1);
      break;
    case "week":
      startDate.setDate(now.getDate() - 7);
      break;
    case "month":
      startDate.setMonth(now.getMonth() - 1);
      break;
    case "year":
      startDate.setFullYear(now.getFullYear() - 1);
      break;
  }

  return this.aggregate([
    {
      $match: {
        userId: new Schema.Types.ObjectId(userId),
        createdAt: { $gte: startDate },
        status: "completed",
      },
    },
    {
      $group: {
        _id: "$type",
        totalTransactions: { $sum: 1 },
        totalFiatVolume: { $sum: "$fiatAmount.value" },
        totalCryptoVolume: { $sum: "$cryptoAmount.value" },
        totalFees: { $sum: "$fees.totalFees.value" },
        avgTransactionSize: { $avg: "$fiatAmount.value" },
      },
    },
  ]);
};

export const FiatInteraction = model<IFiatInteraction, FiatInteractionModel>(
  "FiatInteraction",
  fiatInteractionSchema
);
