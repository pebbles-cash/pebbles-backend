import { Schema, model } from "mongoose";
import { ITipConfig, ITipGiftOption, IExclusiveContent } from "../types";

const tipGiftOptionSchema = new Schema<ITipGiftOption>(
  {
    image: { type: String, required: true },
    price: { type: Number, required: true },
    currency: { type: String, required: true },
  },
  { _id: false }
);

const exclusiveContentSchema = new Schema<IExclusiveContent>(
  {
    enabled: { type: Boolean, default: false },
    message: { type: String, default: "" },
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
    exclusiveContent: {
      type: exclusiveContentSchema,
      default: () => ({ enabled: false, message: "" }),
    },
    giftOptions: { type: [tipGiftOptionSchema], default: [] },
  },
  { timestamps: true }
);

tipConfigSchema.index({ userId: 1 }, { unique: true });

export const TipConfig = model<ITipConfig>("TipConfig", tipConfigSchema);
