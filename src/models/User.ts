import { Schema, model } from "mongoose";
import { IUser, ISocialProfile, IUserPreferences } from "../types";

const socialProfileSchema = new Schema<ISocialProfile>(
  {
    platform: { type: String, required: true },
    profileId: { type: String, required: true },
    username: { type: String, required: true },
    followerCount: Number,
    followingCount: Number,
    postCount: Number,
    lastUpdated: Date,
  },
  { _id: false }
);

const userPreferencesSchema = new Schema<IUserPreferences>(
  {
    defaultCurrency: { type: String, default: "USD" },
    defaultLanguage: { type: String, default: "en" },
    notificationsEnabled: { type: Boolean, default: true },
    twoFactorEnabled: { type: Boolean, default: false },
    preferredTimeZone: { type: String, default: "UTC" },
  },
  { _id: false }
);

const userSchema = new Schema<IUser>(
  {
    email: {
      type: String,
      required: true,
      unique: true,
      trim: true,
    },
    primaryWalletAddress: {
      type: String,
      unique: true,
      required: true,
      trim: true,
    },
    chain: { type: String, required: true, trim: true },
    dynamicUserId: String,
    username: {
      type: String,
      unique: true,
      trim: true,
      minlength: 3,
      maxlength: 15,
    },
    displayName: String,
    avatar: String,
    socialProfiles: [socialProfileSchema],
    preferences: {
      type: userPreferencesSchema,
      default: () => ({}),
    },
  },
  { timestamps: true }
);

// Create indexes
userSchema.index({ username: 1 }, { unique: true });
userSchema.index({ email: 1 }, { unique: true });
userSchema.index({ dynamicUserId: 1 }, { sparse: true });

export const User = model<IUser>("User", userSchema);
