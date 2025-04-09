import { Schema, model } from "mongoose";
import { ITransaction, ITransactionMetadata } from "../types";

const transactionMetadataSchema = new Schema<ITransactionMetadata>(
  {
    orderId: { type: Schema.Types.ObjectId, ref: "Order" },
    subscriptionId: { type: Schema.Types.ObjectId, ref: "Subscription" },
    note: String,
    category: String,
    anonymous: Boolean,
  },
  { _id: false }
);

const transactionSchema = new Schema<ITransaction>(
  {
    type: {
      type: String,
      required: true,
      enum: ["payment", "tip", "subscription"],
    },
    fromUserId: {
      type: Schema.Types.ObjectId,
      ref: "User",
    },
    toUserId: {
      type: Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    fromAddress: String,
    toAddress: {
      type: String,
      required: true,
    },
    amount: {
      type: String,
      required: true,
    },
    tokenAddress: String, // ERC-20 token or native currency
    sourceChain: {
      type: String,
      required: true,
    },
    destinationChain: {
      type: String,
      required: true,
    },
    txHash: String,
    status: {
      type: String,
      required: true,
      enum: ["pending", "completed", "failed"],
      default: "pending",
    },
    metadata: {
      type: transactionMetadataSchema,
      default: () => ({}),
    },
  },
  { timestamps: true }
);

// Create indexes
transactionSchema.index({ fromUserId: 1 });
transactionSchema.index({ toUserId: 1 });
transactionSchema.index({ status: 1 });
transactionSchema.index({ createdAt: -1 });
transactionSchema.index({ "metadata.orderId": 1 }, { sparse: true });
transactionSchema.index({ "metadata.subscriptionId": 1 }, { sparse: true });

export const Transaction = model<ITransaction>(
  "Transaction",
  transactionSchema
);
