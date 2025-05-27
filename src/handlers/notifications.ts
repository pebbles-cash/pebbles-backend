import { APIGatewayProxyResult } from "aws-lambda";
import { connectToDatabase } from "../services/mongoose";
import { success, error } from "../utils/response";
import { User } from "../models";
import { requireAuth } from "../middleware/auth";
import {
  AuthenticatedAPIGatewayProxyEvent,
  RegisterFCMTokenRequestBody,
  UpdateNotificationPreferencesRequestBody,
} from "../types";
import { validateToken } from "../services/firebase";

/**
 * Register FCM token for push notifications
 * POST /api/notifications/subscribe
 */
export const subscribe = requireAuth(
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

      const body: RegisterFCMTokenRequestBody = JSON.parse(event.body);
      const { token, device = "web" } = body;

      if (!token) {
        return error("FCM token is required", 400);
      }

      // Validate the token with Firebase
      const isValidToken = await validateToken(token);
      if (!isValidToken) {
        return error("Invalid FCM token", 400);
      }

      // Get user from database
      const user = await User.findById(userId);

      if (!user) {
        return error("User not found", 404);
      }

      // Check if token already exists
      const existingTokenIndex = user.fcmTokens.findIndex(
        (fcmToken) => fcmToken.token === token
      );

      if (existingTokenIndex !== -1) {
        // Update existing token
        user.fcmTokens[existingTokenIndex].lastUsed = new Date();
        user.fcmTokens[existingTokenIndex].active = true;
        user.fcmTokens[existingTokenIndex].device = device;
      } else {
        // Add new token
        user.fcmTokens.push({
          token,
          device,
          lastUsed: new Date(),
          active: true,
        });
      }

      await user.save();

      return success({
        message: "FCM token registered successfully",
        tokenCount: user.fcmTokens.filter((t) => t.active).length,
      });
    } catch (err) {
      console.error("Register FCM token error:", err);
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
    try {
      // User is provided by the auth middleware
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

      // Get user from database
      const user = await User.findById(userId);

      if (!user) {
        return error("User not found", 404);
      }

      // Find and deactivate the token
      const tokenIndex = user.fcmTokens.findIndex(
        (fcmToken) => fcmToken.token === token
      );

      if (tokenIndex === -1) {
        return error("Token not found", 404);
      }

      // Remove the token from the array
      user.fcmTokens.splice(tokenIndex, 1);

      await user.save();

      return success({
        message: "FCM token unregistered successfully",
        tokenCount: user.fcmTokens.filter((t) => t.active).length,
      });
    } catch (err) {
      console.error("Unregister FCM token error:", err);
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
 * Get notification history (placeholder for future implementation)
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

      // This would be implemented with a NotificationHistory model
      // For now, return empty array
      return success({
        notifications: [],
        total: 0,
      });
    } catch (err) {
      console.error("Get notification history error:", err);
      return error("Could not retrieve notification history", 500);
    }
  }
);
