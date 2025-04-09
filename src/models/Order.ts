import { Schema, model } from "mongoose";
import { IOrder, IAmount } from "../types";

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

const orderSchema = new Schema<IOrder>(
  {
    creatorId: {
      type: Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    title: {
      type: String,
      required: true,
    },
    description: String,
    amount: {
      type: amountSchema,
      required: true,
    },
    qrCodeUrl: String,
    paymentUrl: {
      type: String,
      required: true,
      unique: true,
    },
    expiresAt: Date,
    status: {
      type: String,
      required: true,
      enum: ["active", "expired", "completed"],
      default: "active",
    },
    transactionId: {
      type: Schema.Types.ObjectId,
      ref: "Transaction",
    },
  },
  { timestamps: true }
);

// Create indexes
orderSchema.index({ creatorId: 1 });
orderSchema.index({ paymentUrl: 1 }, { unique: true });
orderSchema.index({ status: 1 });
orderSchema.index({ expiresAt: 1 }, { sparse: true });
orderSchema.index({ createdAt: -1 });

export const Order = model<IOrder>("Order", orderSchema);
