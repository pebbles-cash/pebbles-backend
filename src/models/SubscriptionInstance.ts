import { Schema, model } from "mongoose";
import { ISubscriptionInstance, IAmount } from "../types";

const amountSchema = new Schema<IAmount>(
  {
    value: {
      type: Number,
      required: true,
    },
    currency: {
      type: String,
      required: true,
    },
  },
  { _id: false }
);

const subscriptionInstanceSchema = new Schema<ISubscriptionInstance>(
  {
    subscriptionId: {
      type: Schema.Types.ObjectId,
      ref: "Subscription",
      required: true,
    },
    creatorId: {
      type: Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    subscriberId: {
      type: Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    startDate: {
      type: Date,
      required: true,
      default: Date.now,
    },
    endDate: {
      type: Date,
      required: true,
    },
    price: {
      type: amountSchema,
      required: true,
    },
    autoRenew: {
      type: Boolean,
      default: true,
    },
    status: {
      type: String,
      required: true,
      enum: ["active", "canceled", "expired"],
      default: "active",
    },
    transactions: [
      {
        type: Schema.Types.ObjectId,
        ref: "Transaction",
      },
    ],
  },
  { timestamps: true }
);

// Create indexes
subscriptionInstanceSchema.index({ subscriptionId: 1 });
subscriptionInstanceSchema.index({ creatorId: 1 });
subscriptionInstanceSchema.index({ subscriberId: 1 });
subscriptionInstanceSchema.index({ status: 1 });
subscriptionInstanceSchema.index({ endDate: 1 });
subscriptionInstanceSchema.index({ createdAt: -1 });
subscriptionInstanceSchema.index(
  {
    subscriptionId: 1,
    subscriberId: 1,
    status: 1,
  },
  { unique: true }
);

export const SubscriptionInstance = model<ISubscriptionInstance>(
  "SubscriptionInstance",
  subscriptionInstanceSchema
);
