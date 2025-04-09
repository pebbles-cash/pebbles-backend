import { Schema, model } from "mongoose";
import { IWallet, IWalletBalance } from "../types";

const walletBalanceSchema = new Schema<IWalletBalance>(
  {
    amount: { type: String, required: true },
    lastUpdated: { type: Date, default: Date.now },
  },
  { _id: false }
);

const walletSchema = new Schema<IWallet>(
  {
    userId: {
      type: Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    address: {
      type: String,
      required: true,
      unique: true,
    },
    type: {
      type: String,
      enum: ["eip7702", "eoa"],
      default: "eoa",
    },
    chain: {
      type: String,
      required: true,
      enum: ["ethereum", "polygon", "arbitrum", "optimism", "base"],
    },
    isDefault: {
      type: Boolean,
      default: false,
    },
    balance: {
      type: Map,
      of: walletBalanceSchema,
    },
  },
  { timestamps: true }
);

// Create indexes
walletSchema.index({ userId: 1 });
walletSchema.index({ address: 1 }, { unique: true });

export const Wallet = model<IWallet>("Wallet", walletSchema);
