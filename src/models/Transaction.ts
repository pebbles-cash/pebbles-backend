import mongoose, { Schema, Document } from "mongoose";

export interface ITransaction extends Document {
  type: "payment" | "tip" | "subscription";
  fromUserId?: mongoose.Types.ObjectId;
  toUserId: mongoose.Types.ObjectId;
  fromAddress: string;
  toAddress: string;
  amount: string;
  tokenAddress: string;
  sourceChain: string;
  destinationChain: string;
  txHash?: string;
  status: "pending" | "completed" | "failed";
  category: string;
  tags: string[];
  client?: string;
  projectId?: string;
  metadata?: any;
  createdAt: Date;
  updatedAt: Date;
}

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
    fromAddress: {
      type: String,
      required: true,
    },
    toAddress: {
      type: String,
      required: true,
    },
    amount: {
      type: String,
      required: true,
    },
    tokenAddress: {
      type: String,
      required: true,
    },
    sourceChain: {
      type: String,
      required: true,
    },
    destinationChain: {
      type: String,
      required: true,
    },
    txHash: {
      type: String,
      unique: true,
      sparse: true,
    },
    status: {
      type: String,
      required: true,
      enum: ["pending", "completed", "failed"],
      default: "pending",
    },
    category: {
      type: String,
      required: true,
      default: "uncategorized",
    },
    tags: {
      type: [String],
      default: [],
    },
    client: {
      type: String,
    },
    projectId: {
      type: String,
    },
    metadata: {
      type: Schema.Types.Mixed,
      default: {},
    },
  },
  {
    timestamps: true,
  }
);

// Indexes for optimal query performance
transactionSchema.index({ status: 1, createdAt: 1 }); // For pending transaction queries
transactionSchema.index({ txHash: 1 }); // For transaction hash lookups
transactionSchema.index({ fromUserId: 1, createdAt: -1 }); // For user's sent transactions
transactionSchema.index({ toUserId: 1, createdAt: -1 }); // For user's received transactions
transactionSchema.index({ "metadata.isPending": 1, createdAt: 1 }); // For pending transaction cleanup
transactionSchema.index({ fromAddress: 1, toAddress: 1 }); // For address-based queries
transactionSchema.index({
  status: 1,
  fromAddress: 1,
  toAddress: 1,
  amount: 1,
}); // Composite index for pending cleanup

// Compound index for comprehensive pending transaction queries
transactionSchema.index({
  status: 1,
  "metadata.isPending": 1,
  fromAddress: 1,
  toAddress: 1,
  amount: 1,
  tokenAddress: 1,
  createdAt: 1,
});

export const Transaction = mongoose.model<ITransaction>(
  "Transaction",
  transactionSchema
);
