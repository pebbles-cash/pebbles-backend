import { APIGatewayProxyResult } from "aws-lambda";
import { connectToDatabase } from "../services/mongoose";
import { success, error } from "../utils/response";
import { User, NotificationHistory } from "../models";
import { requireAuth } from "../middleware/auth";
import {
  AuthenticatedAPIGatewayProxyEvent,
  RegisterFCMTokenRequestBody,
  UpdateNotificationPreferencesRequestBody,
} from "../types";
import { validateToken } from "../services/firebase";
import { SKIP_FCM_VALIDATION, NODE_ENV } from "../config/env";

let dbConnectionPromise: Promise<any> | null = null;

const ensureDbConnection = async () => {
  if (!dbConnectionPromise) {
    dbConnectionPromise = connectToDatabase();
  }
  return dbConnectionPromise;
};

/**
 * Register FCM token for push notifications
 * POST /api/notifications/subscribe
 */
export const subscribe = requireAuth(
  async (
    event: AuthenticatedAPIGatewayProxyEvent
  ): Promise<APIGatewayProxyResult> => {
    const startTime = Date.now();
    console.log(`📱 Starting optimized FCM registration (env: ${NODE_ENV})`);

    try {
      // ===== STEP 1: Input validation (fast) =====
      const userId = event.user?.id;
      if (!userId) {
        return error("User ID not found in token", 401);
      }

      if (!event.body) {
        return error("Missing request body", 400);
      }

      const body: RegisterFCMTokenRequestBody = JSON.parse(event.body);
      const { token, device = "web" } = body;

      if (!token || token.length < 10) {
        return error("Valid FCM token is required", 400);
      }

      console.log(`📱 Input validated (${Date.now() - startTime}ms)`);

      // ===== STEP 2: Parallel operations setup =====
      const shouldSkipValidation =
        SKIP_FCM_VALIDATION || NODE_ENV !== "production";

      console.log(
        `🚀 Starting parallel operations (${Date.now() - startTime}ms)`
      );
      const parallelStart = Date.now();

      // ===== STEP 3: Execute operations in parallel =====
      const operations = await Promise.allSettled([
        // Operation 1: Ensure DB connection
        ensureDbConnection(),

        // Operation 2: Check if user exists and get current FCM tokens
        User.findById(userId, "fcmTokens", { lean: true }),

        // Operation 3: Validate token (only if needed)
        shouldSkipValidation ? Promise.resolve(true) : validateToken(token),
      ]);

      const parallelDuration = Date.now() - parallelStart;
      console.log(`✅ Parallel operations completed in ${parallelDuration}ms`);

      // ===== STEP 4: Check results =====
      const [dbResult, userResult, validationResult] = operations;

      // Check database connection
      if (dbResult.status === "rejected") {
        console.error("❌ DB connection failed:", dbResult.reason);
        return error("Database connection failed", 500);
      }

      // Check user exists
      if (userResult.status === "rejected" || !userResult.value) {
        console.error("❌ User not found or query failed");
        return error("User not found", 404);
      }

      // Check token validation (if performed)
      if (!shouldSkipValidation) {
        if (validationResult.status === "rejected" || !validationResult.value) {
          console.warn("❌ Token validation failed");
          return error("Invalid FCM token", 400);
        }
        console.log(`✅ Token validated successfully`);
      } else {
        console.log(`⚠️ Skipped token validation (env: ${NODE_ENV})`);
      }

      const user = userResult.value;

      // ===== STEP 5: Atomic database update =====
      console.log(`💾 Starting atomic update (${Date.now() - startTime}ms)`);
      const updateStart = Date.now();

      // Check if token already exists
      const existingToken = user.fcmTokens?.find(
        (fcmToken: any) => fcmToken.token === token
      );

      let updateResult;
      let operationType: string;

      if (existingToken) {
        // ===== OPTIMIZATION: Atomic update of existing token =====
        updateResult = await User.updateOne(
          {
            _id: userId,
            "fcmTokens.token": token,
          },
          {
            $set: {
              "fcmTokens.$.lastUsed": new Date(),
              "fcmTokens.$.active": true,
              "fcmTokens.$.device": device,
            },
          }
        );
        operationType = "updated";
      } else {
        // ===== OPTIMIZATION: Atomic addition of new token =====
        updateResult = await User.updateOne(
          { _id: userId },
          {
            $push: {
              fcmTokens: {
                token,
                device,
                lastUsed: new Date(),
                active: true,
              },
            },
          }
        );
        operationType = "added";
      }

      const updateDuration = Date.now() - updateStart;
      console.log(
        `💾 Token ${operationType} in ${updateDuration}ms (modified: ${updateResult.modifiedCount})`
      );

      // ===== STEP 6: Get final token count (efficient aggregation) =====
      const tokenCountResult = await User.aggregate([
        { $match: { _id: userId } },
        {
          $project: {
            activeTokenCount: {
              $size: {
                $filter: {
                  input: "$fcmTokens",
                  cond: { $eq: ["$$this.active", true] },
                },
              },
            },
          },
        },
      ]);

      const totalDuration = Date.now() - startTime;
      const tokenCount = tokenCountResult[0]?.activeTokenCount || 0;

      console.log(`✅ FCM registration completed in ${totalDuration}ms`);

      return success({
        message: "FCM token registered successfully",
        tokenCount,
        operation: operationType,
        debug: {
          totalDuration,
          parallelDuration,
          updateDuration,
          environment: NODE_ENV,
          skippedValidation: shouldSkipValidation,
          device,
        },
      });
    } catch (err) {
      const duration = Date.now() - startTime;
      console.error(`❌ FCM registration failed after ${duration}ms:`, err);

      // Return specific error messages for common issues
      if (err instanceof SyntaxError) {
        return error("Invalid request body format", 400);
      }

      return error("Could not register FCM token", 500);
    }
  }
);

/**
 * Unregister FCM token
 * DELETE /api/notifications/unsubscribe
 */
export const unsubscribe = requireAuth(
  async (
    event: AuthenticatedAPIGatewayProxyEvent
  ): Promise<APIGatewayProxyResult> => {
    const startTime = Date.now();
    console.log(`📱 Starting optimized FCM unsubscribe`);

    try {
      // ===== STEP 1: Input validation =====
      const userId = event.user?.id;
      if (!userId) {
        return error("User ID not found in token", 401);
      }

      if (!event.body) {
        return error("Missing request body", 400);
      }

      const body: RegisterFCMTokenRequestBody = JSON.parse(event.body);
      const { token } = body;

      if (!token) {
        return error("FCM token is required", 400);
      }

      console.log(`📱 Input validated (${Date.now() - startTime}ms)`);

      // ===== STEP 2: Ensure database connection =====
      await ensureDbConnection();

      // ===== STEP 3: Atomic token removal with result info =====
      console.log(`💾 Starting atomic removal (${Date.now() - startTime}ms)`);
      const removeStart = Date.now();

      const updateResult = await User.updateOne(
        { _id: userId },
        { $pull: { fcmTokens: { token } } }
      );

      const removeDuration = Date.now() - removeStart;
      console.log(
        `💾 Token removal completed in ${removeDuration}ms (modified: ${updateResult.modifiedCount})`
      );

      // Check if token was actually removed
      if (updateResult.modifiedCount === 0) {
        console.warn(`⚠️ Token not found for removal`);
        return error("Token not found or already removed", 404);
      }

      // ===== STEP 4: Get remaining active token count =====
      const tokenCountResult = await User.aggregate([
        { $match: { _id: userId } },
        {
          $project: {
            activeTokenCount: {
              $size: {
                $filter: {
                  input: "$fcmTokens",
                  cond: { $eq: ["$$this.active", true] },
                },
              },
            },
          },
        },
      ]);

      const totalDuration = Date.now() - startTime;
      const tokenCount = tokenCountResult[0]?.activeTokenCount || 0;

      console.log(`✅ FCM unsubscribe completed in ${totalDuration}ms`);

      return success({
        message: "FCM token unregistered successfully",
        tokenCount,
        debug: {
          totalDuration,
          removeDuration,
          tokensRemaining: tokenCount,
        },
      });
    } catch (err) {
      const duration = Date.now() - startTime;
      console.error(`❌ FCM unsubscribe failed after ${duration}ms:`, err);

      if (err instanceof SyntaxError) {
        return error("Invalid request body format", 400);
      }

      return error("Could not unregister FCM token", 500);
    }
  }
);
/**
 * Update notification preferences
 * PUT /api/notifications/preferences
 */
export const updatePreferences = requireAuth(
  async (
    event: AuthenticatedAPIGatewayProxyEvent
  ): Promise<APIGatewayProxyResult> => {
    try {
      // User is provided by the auth middleware
      const userId = event.user?.id;

      if (!userId) {
        return error("User ID not found in token", 401);
      }

      if (!event.body) {
        return error("Missing request body", 400);
      }

      const body: UpdateNotificationPreferencesRequestBody = JSON.parse(
        event.body
      );
      const {
        payments,
        tips,
        subscriptions,
        security,
        marketing,
        pushEnabled,
      } = body;

      // Get user from database
      const user = await User.findById(userId);

      if (!user) {
        return error("User not found", 404);
      }

      // Update preferences
      const updateData: Record<string, any> = {};

      if (payments !== undefined)
        updateData["notificationPreferences.payments"] = payments;
      if (tips !== undefined) updateData["notificationPreferences.tips"] = tips;
      if (subscriptions !== undefined)
        updateData["notificationPreferences.subscriptions"] = subscriptions;
      if (security !== undefined)
        updateData["notificationPreferences.security"] = security;
      if (marketing !== undefined)
        updateData["notificationPreferences.marketing"] = marketing;
      if (pushEnabled !== undefined)
        updateData["notificationPreferences.pushEnabled"] = pushEnabled;

      await User.findByIdAndUpdate(userId, { $set: updateData });

      // Get updated user
      const updatedUser = await User.findById(userId);

      return success({
        message: "Notification preferences updated successfully",
        preferences: updatedUser?.notificationPreferences,
      });
    } catch (err) {
      console.error("Update notification preferences error:", err);
      return error("Could not update notification preferences", 500);
    }
  }
);

/**
 * Get notification preferences
 * GET /api/notifications/preferences
 */
export const getPreferences = requireAuth(
  async (
    event: AuthenticatedAPIGatewayProxyEvent
  ): Promise<APIGatewayProxyResult> => {
    try {
      // User is provided by the auth middleware
      const userId = event.user?.id;

      if (!userId) {
        return error("User ID not found in token", 401);
      }

      // Get user from database
      const user = await User.findById(userId);

      if (!user) {
        return error("User not found", 404);
      }

      return success({
        preferences: user.notificationPreferences,
        activeTokens: user.fcmTokens.filter((t) => t.active).length,
      });
    } catch (err) {
      console.error("Get notification preferences error:", err);
      return error("Could not retrieve notification preferences", 500);
    }
  }
);

/**
 * Get notification history
 * GET /api/notifications/history
 */
export const getHistory = requireAuth(
  async (
    event: AuthenticatedAPIGatewayProxyEvent
  ): Promise<APIGatewayProxyResult> => {
    try {
      // User is provided by the auth middleware
      const userId = event.user?.id;

      if (!userId) {
        return error("User ID not found in token", 401);
      }

      // Parse query parameters
      const queryParams = event.queryStringParameters || {};
      const page = parseInt(queryParams.page || "1");
      const limit = Math.min(parseInt(queryParams.limit || "20"), 50); // Max 50 per page
      const unreadOnly = queryParams.unreadOnly === "true";
      const type = queryParams.type; // Optional filter by notification type

      // Build query
      const query: any = { userId };

      if (unreadOnly) {
        query.read = false;
      }

      if (type) {
        query.type = type;
      }

      // Get total count for pagination
      const total = await NotificationHistory.countDocuments(query);

      // Get notifications with pagination and populate sender info
      const notifications = await NotificationHistory.find(query)
        .populate("senderId", "username displayName avatar")
        .sort({ createdAt: -1 }) // Most recent first
        .skip((page - 1) * limit)
        .limit(limit)
        .lean();

      // Transform notifications to match frontend expectations
      const transformedNotifications = notifications.map((notification) => ({
        id: notification._id,
        type: notification.type,
        title: notification.title,
        body: notification.body,
        sender:
          notification.senderId && typeof notification.senderId === "object"
            ? {
                id: notification.senderId._id,
                username: (notification.senderId as any).username,
                displayName: (notification.senderId as any).displayName,
                avatar: (notification.senderId as any).avatar,
              }
            : {
                username: notification.senderName || "Anonymous",
                avatar: notification.senderAvatar,
              },
        amount: notification.amount,
        currency: notification.currency,
        read: notification.read,
        clickAction: notification.clickAction,
        createdAt: notification.createdAt,
        metadata: notification.metadata,
      }));

      return success({
        notifications: transformedNotifications,
        pagination: {
          page,
          limit,
          total,
          totalPages: Math.ceil(total / limit),
          hasNext: page * limit < total,
          hasPrev: page > 1,
        },
      });
    } catch (err) {
      console.error("Get notification history error:", err);
      return error("Could not retrieve notification history", 500);
    }
  }
);

/**
 * Mark notifications as read
 * PUT /api/notifications/history/read
 */
export const markAsRead = requireAuth(
  async (
    event: AuthenticatedAPIGatewayProxyEvent
  ): Promise<APIGatewayProxyResult> => {
    try {
      const userId = event.user?.id;

      if (!userId) {
        return error("User ID not found in token", 401);
      }

      if (!event.body) {
        return error("Missing request body", 400);
      }

      const body = JSON.parse(event.body);
      const { notificationIds } = body; // Array of notification IDs to mark as read

      if (!notificationIds || !Array.isArray(notificationIds)) {
        return error("notificationIds array is required", 400);
      }

      // Mark specific notifications as read
      const result = await NotificationHistory.updateMany(
        {
          _id: { $in: notificationIds },
          userId,
        },
        { read: true }
      );

      return success({
        message: "Notifications marked as read",
        updatedCount: result.modifiedCount,
      });
    } catch (err) {
      console.error("Mark notifications as read error:", err);
      return error("Could not mark notifications as read", 500);
    }
  }
);

/**
 * Mark all notifications as read
 * PUT /api/notifications/history/read-all
 */
export const markAllAsRead = requireAuth(
  async (
    event: AuthenticatedAPIGatewayProxyEvent
  ): Promise<APIGatewayProxyResult> => {
    try {
      const userId = event.user?.id;

      if (!userId) {
        return error("User ID not found in token", 401);
      }

      // Mark all unread notifications as read
      const result = await NotificationHistory.updateMany(
        { userId, read: false },
        { read: true }
      );

      return success({
        message: "All notifications marked as read",
        updatedCount: result.modifiedCount,
      });
    } catch (err) {
      console.error("Mark all notifications as read error:", err);
      return error("Could not mark all notifications as read", 500);
    }
  }
);

/**
 * Clear all notifications
 * DELETE /api/notifications/history/clear
 */
export const clearAll = requireAuth(
  async (
    event: AuthenticatedAPIGatewayProxyEvent
  ): Promise<APIGatewayProxyResult> => {
    try {
      const userId = event.user?.id;

      if (!userId) {
        return error("User ID not found in token", 401);
      }

      // Delete all notifications for the user
      const result = await NotificationHistory.deleteMany({ userId });

      return success({
        message: "All notifications cleared",
        deletedCount: result.deletedCount,
      });
    } catch (err) {
      console.error("Clear all notifications error:", err);
      return error("Could not clear all notifications", 500);
    }
  }
);

/**
 * Get unread notification count
 * GET /api/notifications/history/unread-count
 */
export const getUnreadCount = requireAuth(
  async (
    event: AuthenticatedAPIGatewayProxyEvent
  ): Promise<APIGatewayProxyResult> => {
    try {
      const userId = event.user?.id;

      if (!userId) {
        return error("User ID not found in token", 401);
      }

      // Count unread notifications
      const count = await NotificationHistory.countDocuments({
        userId,
        read: false,
      });

      return success({
        unreadCount: count,
      });
    } catch (err) {
      console.error("Get unread count error:", err);
      return error("Could not get unread count", 500);
    }
  }
);
