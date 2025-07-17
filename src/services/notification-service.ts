import { User, NotificationHistory } from "../models";
import { INotificationPreferences } from "../types"; // Add this import
import {
  sendNotificationToTokens,
  NotificationTemplates,
  NotificationOptions,
} from "./firebase";

/**
 * Store notification in database
 */
export async function storeNotification(
  userId: string,
  type: string,
  title: string,
  body: string,
  options: {
    senderId?: string;
    senderName?: string;
    senderAvatar?: string;
    amount?: string;
    currency?: string;
    transactionId?: string;
    clickAction?: string;
    metadata?: Record<string, any>;
  } = {}
): Promise<void> {
  try {
    await NotificationHistory.create({
      userId,
      type,
      title,
      body,
      senderId: options.senderId,
      senderName: options.senderName,
      senderAvatar: options.senderAvatar,
      amount: options.amount,
      currency: options.currency,
      transactionId: options.transactionId,
      clickAction: options.clickAction,
      metadata: options.metadata,
      read: false,
    });
  } catch (error) {
    console.error(`Error storing notification for user ${userId}:`, error);
  }
}

/**
 * Send notification to a user by their ID
 */
export async function sendNotificationToUser(
  userId: string,
  notificationOptions: NotificationOptions,
  notificationType: string = "general"
): Promise<void> {
  try {
    // Get user with FCM tokens
    const user = await User.findById(userId);

    if (!user) {
      console.error(`User not found: ${userId}`);
      return;
    }

    // Check if user has push notifications enabled
    if (!user.notificationPreferences?.pushEnabled) {
      console.log(`Push notifications disabled for user: ${userId}`);
      return;
    }

    // Check if this specific notification type is enabled
    const notificationTypeKey = getNotificationTypeKey(notificationType);
    if (
      notificationTypeKey &&
      !user.notificationPreferences?.[notificationTypeKey]
    ) {
      console.log(
        `${notificationType} notifications disabled for user: ${userId}`
      );
      return;
    }

    // Get active FCM tokens
    const activeTokens = user.fcmTokens
      .filter((token) => token.active)
      .map((token) => token.token);

    if (activeTokens.length === 0) {
      console.log(`No active FCM tokens for user: ${userId}`);
      return;
    }

    // Send notification
    const response = await sendNotificationToTokens(
      activeTokens,
      notificationOptions
    );

    // Handle failed tokens
    if (response.failureCount > 0) {
      const failedTokens: string[] = [];
      response.responses.forEach((resp, idx) => {
        if (!resp.success) {
          failedTokens.push(activeTokens[idx]);
        }
      });

      // Deactivate failed tokens
      await deactivateFailedTokens(userId, failedTokens);
    }

    console.log(
      `Notification sent to user ${userId}: ${response.successCount}/${activeTokens.length} successful`
    );
  } catch (error) {
    console.error(`Error sending notification to user ${userId}:`, error);
  }
}

/**
 * Send payment received notification
 */
export async function sendPaymentReceivedNotification(
  recipientUserId: string,
  amount: string,
  senderName: string,
  senderId?: string,
  transactionId?: string
): Promise<void> {
  const notificationOptions = NotificationTemplates.paymentReceived(
    amount,
    senderName
  );

  // Send push notification
  await sendNotificationToUser(
    recipientUserId,
    notificationOptions,
    "paymentReceived"
  );

  // Store notification in database
  await storeNotification(
    recipientUserId,
    "payment_received",
    notificationOptions.notification?.title || "Payment Received",
    notificationOptions.notification?.body ||
      `You received $${amount} from ${senderName}`,
    {
      senderId,
      senderName,
      amount,
      currency: "USD", // Default currency, could be made configurable
      transactionId,
      clickAction: notificationOptions.notification?.clickAction,
      metadata: notificationOptions.data,
    }
  );
}

/**
 * Send tip received notification
 */
export async function sendTipReceivedNotification(
  recipientUserId: string,
  amount: string,
  senderName?: string,
  senderId?: string,
  transactionId?: string
): Promise<void> {
  const notificationOptions = NotificationTemplates.tipReceived(
    amount,
    senderName
  );

  // Send push notification
  await sendNotificationToUser(
    recipientUserId,
    notificationOptions,
    "tipReceived"
  );

  // Store notification in database
  await storeNotification(
    recipientUserId,
    "tip_received",
    notificationOptions.notification?.title || "Tip Received",
    notificationOptions.notification?.body ||
      (senderName
        ? `${senderName} sent you a $${amount} tip!`
        : `You received a $${amount} tip!`),
    {
      senderId,
      senderName,
      amount,
      currency: "USD", // Default currency, could be made configurable
      transactionId,
      clickAction: notificationOptions.notification?.clickAction,
      metadata: notificationOptions.data,
    }
  );
}

/**
 * Send subscription renewal notification
 */
export async function sendSubscriptionRenewalNotification(
  subscriberUserId: string,
  planName: string,
  amount: string
): Promise<void> {
  const notificationOptions = NotificationTemplates.subscriptionRenewal(
    planName,
    amount
  );
  await sendNotificationToUser(
    subscriberUserId,
    notificationOptions,
    "subscriptionRenewal"
  );
}

/**
 * Send new subscriber notification to creator
 */
export async function sendNewSubscriberNotification(
  creatorUserId: string,
  planName: string,
  subscriberName: string
): Promise<void> {
  const notificationOptions = NotificationTemplates.newSubscriber(
    planName,
    subscriberName
  );
  await sendNotificationToUser(
    creatorUserId,
    notificationOptions,
    "newSubscriber"
  );
}

/**
 * Send security alert notification
 */
export async function sendSecurityAlertNotification(
  userId: string,
  message: string
): Promise<void> {
  const notificationOptions = NotificationTemplates.securityAlert(message);
  await sendNotificationToUser(userId, notificationOptions, "securityAlert");
}

/**
 * Send subscription expiry warning (3 days before expiration)
 */
export async function sendSubscriptionExpiryWarning(
  subscriberUserId: string,
  planName: string,
  expiryDate: Date
): Promise<void> {
  const daysUntilExpiry = Math.ceil(
    (expiryDate.getTime() - Date.now()) / (1000 * 60 * 60 * 24)
  );

  const notificationOptions: NotificationOptions = {
    notification: {
      title: "Subscription Expiring Soon",
      body: `Your ${planName} subscription expires in ${daysUntilExpiry} days`,
      icon: "/icons/warning-icon.png",
      clickAction: "/subscriptions",
    },
    data: {
      type: "subscription_expiry_warning",
      planName,
      daysUntilExpiry: daysUntilExpiry.toString(),
      expiryDate: expiryDate.toISOString(),
      timestamp: new Date().toISOString(),
    },
  };

  await sendNotificationToUser(
    subscriberUserId,
    notificationOptions,
    "subscriptions"
  );
}

/**
 * Send invoice generated notification
 */
export async function sendInvoiceGeneratedNotification(
  userId: string,
  invoiceNumber: string,
  amount: string,
  clientName: string
): Promise<void> {
  const notificationOptions: NotificationOptions = {
    notification: {
      title: "Invoice Generated",
      body: `Invoice ${invoiceNumber} for ${clientName} ($${amount}) is ready`,
      icon: "/icons/invoice-icon.png",
      clickAction: "/invoices",
    },
    data: {
      type: "invoice_generated",
      invoiceNumber,
      amount,
      clientName,
      timestamp: new Date().toISOString(),
    },
  };

  await sendNotificationToUser(userId, notificationOptions, "general");
}

/**
 * Send bulk notifications to multiple users
 */
export async function sendBulkNotifications(
  userIds: string[],
  notificationOptions: NotificationOptions,
  notificationType: string = "general"
): Promise<{
  successful: number;
  failed: number;
  results: Array<{ userId: string; success: boolean; error?: string }>;
}> {
  const results: Array<{ userId: string; success: boolean; error?: string }> =
    [];
  let successful = 0;
  let failed = 0;

  // Process notifications in batches to avoid overwhelming the system
  const batchSize = 10;
  for (let i = 0; i < userIds.length; i += batchSize) {
    const batch = userIds.slice(i, i + batchSize);

    const batchPromises = batch.map(async (userId) => {
      try {
        await sendNotificationToUser(
          userId,
          notificationOptions,
          notificationType
        );
        successful++;
        return { userId, success: true };
      } catch (error) {
        failed++;
        return {
          userId,
          success: false,
          error: error instanceof Error ? error.message : "Unknown error",
        };
      }
    });

    const batchResults = await Promise.all(batchPromises);
    results.push(...batchResults);

    // Small delay between batches to avoid rate limiting
    if (i + batchSize < userIds.length) {
      await new Promise((resolve) => setTimeout(resolve, 100));
    }
  }

  console.log(
    `Bulk notification completed: ${successful} successful, ${failed} failed`
  );
  return { successful, failed, results };
}

/**
 * Send marketing notification to opted-in users
 */
export async function sendMarketingNotification(
  title: string,
  body: string,
  targetAudience?: {
    minTransactionAmount?: number;
    hasActiveSubscriptions?: boolean;
    lastActiveWithinDays?: number;
  }
): Promise<void> {
  try {
    // Build query to find target users
    const query: any = {
      "notificationPreferences.marketing": true,
      "notificationPreferences.pushEnabled": true,
      "fcmTokens.0": { $exists: true }, // Has at least one FCM token
    };

    // Add audience targeting if specified
    if (targetAudience?.lastActiveWithinDays) {
      const cutoffDate = new Date();
      cutoffDate.setDate(
        cutoffDate.getDate() - targetAudience.lastActiveWithinDays
      );
      query.updatedAt = { $gte: cutoffDate };
    }

    // Find target users
    const targetUsers = await User.find(query).select("_id").exec();
    const userIds = targetUsers.map((user) => user._id.toString());

    if (userIds.length === 0) {
      console.log("No users found matching marketing criteria");
      return;
    }

    const notificationOptions: NotificationOptions = {
      notification: {
        title,
        body,
        icon: "/icons/marketing-icon.png",
        clickAction: "/",
      },
      data: {
        type: "marketing",
        timestamp: new Date().toISOString(),
      },
    };

    const results = await sendBulkNotifications(
      userIds,
      notificationOptions,
      "marketing"
    );
    console.log(`Marketing notification sent to ${results.successful} users`);
  } catch (error) {
    console.error("Error sending marketing notification:", error);
  }
}

/**
 * Deactivate failed FCM tokens
 */
async function deactivateFailedTokens(
  userId: string,
  failedTokens: string[]
): Promise<void> {
  try {
    await User.updateOne(
      { _id: userId },
      {
        $set: {
          "fcmTokens.$[elem].active": false,
        },
      },
      {
        arrayFilters: [{ "elem.token": { $in: failedTokens } }],
      }
    );

    console.log(
      `Deactivated ${failedTokens.length} failed tokens for user ${userId}`
    );
  } catch (error) {
    console.error(
      `Error deactivating failed tokens for user ${userId}:`,
      error
    );
  }
}

/**
 * Get notification type key for preferences
 */
function getNotificationTypeKey(
  notificationType: string
): keyof INotificationPreferences | null {
  const typeMap: Record<string, keyof INotificationPreferences> = {
    paymentReceived: "payments",
    tipReceived: "tips",
    subscriptionRenewal: "subscriptions",
    subscriptionExpiry: "subscriptions",
    newSubscriber: "subscriptions",
    securityAlert: "security",
    marketing: "marketing",
  };

  return typeMap[notificationType] || null;
}

/**
 * Clean up old inactive tokens (utility function for maintenance)
 */
export async function cleanupInactiveTokens(
  daysOld: number = 30
): Promise<void> {
  try {
    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - daysOld);

    const result = await User.updateMany(
      {},
      {
        $pull: {
          fcmTokens: {
            $or: [
              { active: false, lastUsed: { $lt: cutoffDate } },
              { lastUsed: { $lt: cutoffDate } },
            ],
          },
        },
      }
    );

    console.log(
      `Cleaned up inactive tokens. Modified ${result.modifiedCount} users.`
    );
  } catch (error) {
    console.error("Error cleaning up inactive tokens:", error);
  }
}

/**
 * Get notification statistics for admin dashboard
 */
export async function getNotificationStats(
  userId?: string,
  startDate?: Date,
  endDate?: Date
): Promise<{
  totalUsers: number;
  usersWithTokens: number;
  totalActiveTokens: number;
  notificationPreferences: {
    payments: number;
    tips: number;
    subscriptions: number;
    security: number;
    marketing: number;
    pushEnabled: number;
  };
}> {
  try {
    const matchStage: any = {};

    if (userId) {
      matchStage._id = userId;
    }

    if (startDate || endDate) {
      matchStage.createdAt = {};
      if (startDate) matchStage.createdAt.$gte = startDate;
      if (endDate) matchStage.createdAt.$lte = endDate;
    }

    const stats = await User.aggregate([
      { $match: matchStage },
      {
        $group: {
          _id: null,
          totalUsers: { $sum: 1 },
          usersWithTokens: {
            $sum: {
              $cond: [{ $gt: [{ $size: "$fcmTokens" }, 0] }, 1, 0],
            },
          },
          totalActiveTokens: {
            $sum: {
              $size: {
                $filter: {
                  input: "$fcmTokens",
                  cond: { $eq: ["$$this.active", true] },
                },
              },
            },
          },
          paymentsEnabled: {
            $sum: {
              $cond: ["$notificationPreferences.payments", 1, 0],
            },
          },
          tipsEnabled: {
            $sum: {
              $cond: ["$notificationPreferences.tips", 1, 0],
            },
          },
          subscriptionsEnabled: {
            $sum: {
              $cond: ["$notificationPreferences.subscriptions", 1, 0],
            },
          },
          securityEnabled: {
            $sum: {
              $cond: ["$notificationPreferences.security", 1, 0],
            },
          },
          marketingEnabled: {
            $sum: {
              $cond: ["$notificationPreferences.marketing", 1, 0],
            },
          },
          pushEnabled: {
            $sum: {
              $cond: ["$notificationPreferences.pushEnabled", 1, 0],
            },
          },
        },
      },
    ]);

    const result = stats[0] || {
      totalUsers: 0,
      usersWithTokens: 0,
      totalActiveTokens: 0,
      paymentsEnabled: 0,
      tipsEnabled: 0,
      subscriptionsEnabled: 0,
      securityEnabled: 0,
      marketingEnabled: 0,
      pushEnabled: 0,
    };

    return {
      totalUsers: result.totalUsers,
      usersWithTokens: result.usersWithTokens,
      totalActiveTokens: result.totalActiveTokens,
      notificationPreferences: {
        payments: result.paymentsEnabled,
        tips: result.tipsEnabled,
        subscriptions: result.subscriptionsEnabled,
        security: result.securityEnabled,
        marketing: result.marketingEnabled,
        pushEnabled: result.pushEnabled,
      },
    };
  } catch (error) {
    console.error("Error getting notification stats:", error);
    throw error;
  }
}

/**
 * Schedule subscription renewal reminders
 * This would typically be called by a cron job or scheduled Lambda
 */
export async function sendSubscriptionRenewalReminders(): Promise<void> {
  try {
    // Find subscriptions expiring in 3 days
    const threeDaysFromNow = new Date();
    threeDaysFromNow.setDate(threeDaysFromNow.getDate() + 3);

    const fourDaysFromNow = new Date();
    fourDaysFromNow.setDate(fourDaysFromNow.getDate() + 4);

    // This would require a SubscriptionInstance model query
    // For now, this is a placeholder showing the structure
    console.log("Checking for subscriptions expiring in 3 days...");

    // Implementation would query SubscriptionInstance model
    // and send renewal reminders to subscribers
  } catch (error) {
    console.error("Error sending renewal reminders:", error);
  }
}
