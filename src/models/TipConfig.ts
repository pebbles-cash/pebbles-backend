import { Schema, model } from "mongoose";
import { ITipConfig, ITipGift } from "../types";

const tipGiftSchema = new Schema<ITipGift>(
  {
    emoji: { type: String, required: true },
    label: { type: String, required: true },
    price: { type: Number, required: true },
    isCustom: { type: Boolean, default: false },
  },
  { _id: false }
);

const tipConfigSchema = new Schema<ITipConfig>(
  {
    userId: {
      type: Schema.Types.ObjectId,
      ref: "User",
      required: true,
      unique: true,
    },
    statement: { type: String, default: "" },
    gifts: { type: [tipGiftSchema], default: [] },
    exclusiveContentEnabled: { type: Boolean, default: false },
    exclusiveContentMessage: { type: String, default: "" },
  },
  { timestamps: true }
);

tipConfigSchema.index({ userId: 1 }, { unique: true });

export const TipConfig = model<ITipConfig>("TipConfig", tipConfigSchema);
