import { Schema, model, Types } from "mongoose";

export interface INotificationHistory {
  userId: Types.ObjectId;
  type:
    | "payment_received"
    | "tip_received"
    | "subscription_renewal"
    | "new_subscriber"
    | "security_alert"
    | "subscription_expiry_warning"
    | "invoice_generated"
    | "wallet_transfer"
    | "action_required"
    | "marketing";
  title: string;
  body: string;
  senderId?: Types.ObjectId;
  senderName?: string;
  senderAvatar?: string;
  amount?: string;
  currency?: string;
  transactionId?: Types.ObjectId;
  read: boolean;
  clickAction?: string;
  metadata?: Record<string, any>;
  createdAt: Date;
  updatedAt: Date;
}

const notificationHistorySchema = new Schema<INotificationHistory>(
  {
    userId: {
      type: Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },
    type: {
      type: String,
      required: true,
      enum: [
        "payment_received",
        "tip_received",
        "subscription_renewal",
        "new_subscriber",
        "security_alert",
        "subscription_expiry_warning",
        "invoice_generated",
        "wallet_transfer",
        "action_required",
        "marketing",
      ],
    },
    title: {
      type: String,
      required: true,
    },
    body: {
      type: String,
      required: true,
    },
    senderId: {
      type: Schema.Types.ObjectId,
      ref: "User",
      index: true,
    },
    senderName: String,
    senderAvatar: String,
    amount: String,
    currency: String,
    transactionId: {
      type: Schema.Types.ObjectId,
      ref: "Transaction",
      index: true,
    },
    read: {
      type: Boolean,
      default: false,
      index: true,
    },
    clickAction: String,
    metadata: {
      type: Schema.Types.Mixed,
      default: {},
    },
  },
  { timestamps: true }
);

// Create indexes for efficient querying
notificationHistorySchema.index({ userId: 1, createdAt: -1 }); // For getting user's notifications sorted by date
notificationHistorySchema.index({ userId: 1, read: 1 }); // For getting unread notifications
notificationHistorySchema.index({ type: 1, createdAt: -1 }); // For getting notifications by type

// Add methods for common operations
notificationHistorySchema.methods.markAsRead = function () {
  this.read = true;
  return this.save();
};

// Static methods
notificationHistorySchema.statics.getUnreadCount = function (
  userId: Types.ObjectId
) {
  return this.countDocuments({ userId, read: false });
};

notificationHistorySchema.statics.markAllAsRead = function (
  userId: Types.ObjectId
) {
  return this.updateMany({ userId, read: false }, { read: true });
};

notificationHistorySchema.statics.clearAll = function (userId: Types.ObjectId) {
  return this.deleteMany({ userId });
};

export const NotificationHistory = model<INotificationHistory>(
  "NotificationHistory",
  notificationHistorySchema
);
