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
    notificationsEnabled: { type: Boolean, default: true },
    twoFactorEnabled: { type: Boolean, default: false },
    aiAssistantPreferences: {
      defaultCurrency: { type: String, default: "USD" },
      preferredTimeZone: { type: String, default: "UTC" },
      preferredReportingPeriod: {
        type: String,
        enum: ["week", "month", "quarter"],
        default: "month",
      },
      reminderSettings: {
        enabled: { type: Boolean, default: false },
        frequency: {
          type: String,
          enum: ["daily", "weekly", "monthly"],
          default: "weekly",
        },
        time: { type: String, default: "09:00" }, // HH:MM format
      },
    },
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
    username: {
      type: String,
      required: true,
      unique: true,
      trim: true,
      minlength: 3,
      maxlength: 15,
    },
    displayName: String,
    avatar: String,
    dynamicUserId: String,
    walletAddress: String,
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
