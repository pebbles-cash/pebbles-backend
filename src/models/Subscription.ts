import { Schema, model } from "mongoose";
import { ISubscription, IAmount, IBillingCycle } from "../types";

const amountSchema = new Schema<IAmount>(
  {
    value: {
      type: Number,
      required: true,
    },
    currency: {
      type: String,
      required: true,
      default: "USD",
    },
  },
  { _id: false }
);

const billingCycleSchema = new Schema<IBillingCycle>(
  {
    interval: {
      type: String,
      required: true,
      enum: ["day", "week", "month", "year"],
    },
    count: {
      type: Number,
      required: true,
      default: 1,
      min: 1,
    },
  },
  { _id: false }
);

const subscriptionSchema = new Schema<ISubscription>(
  {
    creatorId: {
      type: Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    name: {
      type: String,
      required: true,
    },
    description: String,
    price: {
      type: amountSchema,
      required: true,
    },
    billingCycle: {
      type: billingCycleSchema,
      required: true,
    },
    features: [String],
    active: {
      type: Boolean,
      default: true,
    },
    smartContractId: String, // Reference to deployed contract address
  },
  { timestamps: true }
);

// Create indexes
subscriptionSchema.index({ creatorId: 1 });
subscriptionSchema.index({ active: 1 });
subscriptionSchema.index({ "price.value": 1 });
subscriptionSchema.index({ createdAt: -1 });

export const Subscription = model<ISubscription>(
  "Subscription",
  subscriptionSchema
);
