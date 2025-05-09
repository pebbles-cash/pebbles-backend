import { APIGatewayProxyResult } from "aws-lambda";
import { connectToDatabase } from "../services/mongoose";
import { success, error } from "../utils/response";
import {
  User,
  Subscription,
  SubscriptionInstance,
  Transaction,
} from "../models";
import { requireAuth } from "../middleware/auth";
import {
  AuthenticatedAPIGatewayProxyEvent,
  SubscriptionPlanRequestBody,
  SubscribeRequestBody,
  ManageSubscriptionRequestBody,
} from "../types";

/**
 * Create a new subscription plan
 * POST /api/subscriptions
 */
export const createSubscriptionPlan = requireAuth(
  async (
    event: AuthenticatedAPIGatewayProxyEvent
  ): Promise<APIGatewayProxyResult> => {
    try {
      // Database connection is handled in requireAuth middleware

      // User is provided by the auth middleware
      const userId = event.user?.id;

      if (!userId) {
        return error("User ID not found in token", 401);
      }

      if (!event.body) {
        return error("Missing request body", 400);
      }

      const body: SubscriptionPlanRequestBody = JSON.parse(event.body);
      const {
        name,
        description,
        price,
        billingCycle,
        features,
        smartContractId,
        active = true,
      } = body;

      // Basic validation
      if (!name) {
        return error("Subscription name is required", 400);
      }

      if (!price || !price.value || !price.currency) {
        return error("Valid price is required", 400);
      }

      if (!billingCycle || !billingCycle.interval || !billingCycle.count) {
        return error("Valid billing cycle is required", 400);
      }

      // Create subscription plan
      const subscription = new Subscription({
        creatorId: userId,
        name,
        description,
        price,
        billingCycle,
        features: features || [],
        active,
        smartContractId,
      });

      await subscription.save();

      return success({
        id: subscription._id,
        name: subscription.name,
        description: subscription.description,
        price: subscription.price,
        billingCycle: subscription.billingCycle,
        features: subscription.features,
        active: subscription.active,
        createdAt: subscription.createdAt,
      });
    } catch (err) {
      console.error("Create subscription plan error:", err);
      return error("Could not create subscription plan", 500);
    }
  }
);

/**
 * Get creator's subscription plans
 * GET /api/subscriptions
 */
export const getCreatorSubscriptions = requireAuth(
  async (
    event: AuthenticatedAPIGatewayProxyEvent
  ): Promise<APIGatewayProxyResult> => {
    try {
      // Database connection is handled in requireAuth middleware

      // User is provided by the auth middleware
      const userId = event.user?.id;

      if (!userId) {
        return error("User ID not found in token", 401);
      }

      // Get query parameters
      const queryParams = event.queryStringParameters || {};
      const creatorUsername = queryParams.creator;
      const includeInactive = queryParams.includeInactive === "true";

      let creatorId = userId;

      // If a creator username is provided, look up that user instead
      if (creatorUsername) {
        const creator = await User.findOne({ username: creatorUsername });
        if (!creator) {
          return error("Creator not found", 404);
        }
        creatorId = creator._id.toString();
      }

      // Build query
      const query: any = {
        creatorId,
      };

      // Only include active plans unless explicitly requested
      if (!includeInactive) {
        query.active = true;
      }

      // Get subscription plans
      const subscriptions = await Subscription.find(query).sort({ price: 1 });

      // Count subscribers for each plan
      const subscriptionIds = subscriptions.map((sub) => sub._id);

      // Get count of active subscribers for each plan
      const subscriberCounts = await SubscriptionInstance.aggregate([
        {
          $match: {
            subscriptionId: { $in: subscriptionIds },
            status: "active",
          },
        },
        {
          $group: {
            _id: "$subscriptionId",
            count: { $sum: 1 },
          },
        },
      ]);

      // Create a map of subscription IDs to subscriber counts
      const subscriberCountMap = new Map();
      subscriberCounts.forEach((item) => {
        subscriberCountMap.set(item._id.toString(), item.count);
      });

      // Format response
      const formattedSubscriptions = subscriptions.map((subscription) => ({
        id: subscription._id,
        name: subscription.name,
        description: subscription.description,
        price: subscription.price,
        billingCycle: subscription.billingCycle,
        features: subscription.features,
        active: subscription.active,
        createdAt: subscription.createdAt,
        subscriberCount:
          subscriberCountMap.get(subscription._id.toString()) || 0,
      }));

      return success({
        subscriptions: formattedSubscriptions,
      });
    } catch (err) {
      console.error("Get creator subscriptions error:", err);
      return error("Could not retrieve subscription plans", 500);
    }
  }
);

/**
 * Get subscription plan details
 * GET /api/subscriptions/:subscriptionId
 */
export const getSubscriptionDetails = requireAuth(
  async (
    event: AuthenticatedAPIGatewayProxyEvent
  ): Promise<APIGatewayProxyResult> => {
    try {
      // Database connection handled in requireAuth middleware

      // Get subscription ID from path parameters
      if (!event.pathParameters?.subscriptionId) {
        return error("Subscription ID parameter is required", 400);
      }

      const subscriptionId = event.pathParameters.subscriptionId;

      // Get the subscription
      const subscription = await Subscription.findById(subscriptionId);

      if (!subscription) {
        return error("Subscription plan not found", 404);
      }

      // Get creator info
      const creator = await User.findById(subscription.creatorId).select(
        "_id username displayName avatar"
      );

      if (!creator) {
        return error("Creator not found", 404);
      }

      // Get subscriber count
      const subscriberCount = await SubscriptionInstance.countDocuments({
        subscriptionId,
        status: "active",
      });

      // Format response
      const formattedSubscription = {
        id: subscription._id,
        name: subscription.name,
        description: subscription.description,
        price: subscription.price,
        billingCycle: subscription.billingCycle,
        features: subscription.features,
        active: subscription.active,
        createdAt: subscription.createdAt,
        creator: {
          id: creator._id,
          username: creator.username,
          displayName: creator.displayName,
          avatar: creator.avatar,
        },
        subscriberCount,
      };

      return success({
        subscription: formattedSubscription,
      });
    } catch (err) {
      console.error("Get subscription details error:", err);
      return error("Could not retrieve subscription details", 500);
    }
  }
);

/**
 * Update subscription plan
 * PUT /api/subscriptions/:subscriptionId
 */
export const updateSubscriptionPlan = requireAuth(
  async (
    event: AuthenticatedAPIGatewayProxyEvent
  ): Promise<APIGatewayProxyResult> => {
    try {
      // Database connection is handled in requireAuth middleware

      // User is provided by the auth middleware
      const userId = event.user?.id;

      if (!userId) {
        return error("User ID not found in token", 401);
      }

      // Get subscription ID from path parameters
      if (!event.pathParameters?.subscriptionId) {
        return error("Subscription ID parameter is required", 400);
      }

      const subscriptionId = event.pathParameters.subscriptionId;

      if (!event.body) {
        return error("Missing request body", 400);
      }

      const body: Partial<SubscriptionPlanRequestBody> = JSON.parse(event.body);
      const { name, description, features, active } = body;

      // Get the subscription
      const subscription = await Subscription.findById(subscriptionId);

      if (!subscription) {
        return error("Subscription plan not found", 404);
      }

      // Check if user is the creator
      if (subscription.creatorId.toString() !== userId) {
        return error("Unauthorized to update this subscription plan", 403);
      }

      // Prepare update data
      const updateData: Partial<SubscriptionPlanRequestBody> = {};

      if (name !== undefined) updateData.name = name;
      if (description !== undefined) updateData.description = description;
      if (features !== undefined) updateData.features = features;
      if (active !== undefined) updateData.active = active;

      // Don't allow updating price or billing cycle for existing subscriptions
      // as it would affect existing subscribers

      // Update subscription
      await Subscription.findByIdAndUpdate(subscriptionId, updateData);

      // Get updated subscription
      const updatedSubscription = await Subscription.findById(subscriptionId);

      if (!updatedSubscription) {
        return error("Subscription plan not found after update", 404);
      }

      return success({
        id: updatedSubscription._id,
        name: updatedSubscription.name,
        description: updatedSubscription.description,
        price: updatedSubscription.price,
        billingCycle: updatedSubscription.billingCycle,
        features: updatedSubscription.features,
        active: updatedSubscription.active,
        updatedAt: updatedSubscription.updatedAt,
      });
    } catch (err) {
      console.error("Update subscription plan error:", err);
      return error("Could not update subscription plan", 500);
    }
  }
);

/**
 * Delete subscription plan
 * DELETE /api/subscriptions/:subscriptionId
 */
export const deleteSubscriptionPlan = requireAuth(
  async (
    event: AuthenticatedAPIGatewayProxyEvent
  ): Promise<APIGatewayProxyResult> => {
    try {
      // Database connection is handled in requireAuth middleware

      // User is provided by the auth middleware
      const userId = event.user?.id;

      if (!userId) {
        return error("User ID not found in token", 401);
      }

      // Get subscription ID from path parameters
      if (!event.pathParameters?.subscriptionId) {
        return error("Subscription ID parameter is required", 400);
      }

      const subscriptionId = event.pathParameters.subscriptionId;

      // Get the subscription
      const subscription = await Subscription.findById(subscriptionId);

      if (!subscription) {
        return error("Subscription plan not found", 404);
      }

      // Check if user is the creator
      if (subscription.creatorId.toString() !== userId) {
        return error("Unauthorized to delete this subscription plan", 403);
      }

      // Check if there are active subscribers
      const activeSubscribers = await SubscriptionInstance.countDocuments({
        subscriptionId,
        status: "active",
      });

      if (activeSubscribers > 0) {
        return error(
          "Cannot delete subscription plan with active subscribers. Deactivate the plan instead.",
          400
        );
      }

      // Delete the subscription
      await Subscription.findByIdAndDelete(subscriptionId);

      return success({
        message: "Subscription plan deleted successfully",
      });
    } catch (err) {
      console.error("Delete subscription plan error:", err);
      return error("Could not delete subscription plan", 500);
    }
  }
);

/**
 * Subscribe to a plan
 * POST /api/subscriptions/:subscriptionId/subscribe
 */
export const subscribeToPlan = requireAuth(
  async (
    event: AuthenticatedAPIGatewayProxyEvent
  ): Promise<APIGatewayProxyResult> => {
    try {
      // Database connection is handled in requireAuth middleware

      // User is provided by the auth middleware
      const userId = event.user?.id;

      if (!userId) {
        return error("User ID not found in token", 401);
      }

      // Get subscription ID from path parameters
      if (!event.pathParameters?.subscriptionId) {
        return error("Subscription ID parameter is required", 400);
      }

      const subscriptionId = event.pathParameters.subscriptionId;

      if (!event.body) {
        return error("Missing request body", 400);
      }

      const body: SubscribeRequestBody = JSON.parse(event.body);
      const { paymentMethod, walletAddress } = body;

      // Basic validation
      if (!paymentMethod) {
        return error("Payment method is required", 400);
      }

      if (paymentMethod === "wallet" && !walletAddress) {
        return error(
          "Wallet address is required for wallet payment method",
          400
        );
      }

      // Get the subscription plan
      const subscription = await Subscription.findById(subscriptionId);

      if (!subscription) {
        return error("Subscription plan not found", 404);
      }

      // Check if the plan is active
      if (!subscription.active) {
        return error("This subscription plan is no longer available", 400);
      }

      // Get the creator
      const creator = await User.findById(subscription.creatorId);

      if (!creator) {
        return error("Creator not found", 404);
      }

      // Check if user is trying to subscribe to their own plan
      if (subscription.creatorId.toString() === userId) {
        return error("You cannot subscribe to your own plan", 400);
      }

      // Check if user is already subscribed to this plan
      const existingSubscription = await SubscriptionInstance.findOne({
        subscriptionId,
        subscriberId: userId,
        status: "active",
      });

      if (existingSubscription) {
        return error("You are already subscribed to this plan", 400);
      }

      // Calculate end date based on billing cycle
      const startDate = new Date();
      const endDate = new Date(startDate);

      switch (subscription.billingCycle.interval) {
        case "day":
          endDate.setDate(endDate.getDate() + subscription.billingCycle.count);
          break;
        case "week":
          endDate.setDate(
            endDate.getDate() + 7 * subscription.billingCycle.count
          );
          break;
        case "month":
          endDate.setMonth(
            endDate.getMonth() + subscription.billingCycle.count
          );
          break;
        case "year":
          endDate.setFullYear(
            endDate.getFullYear() + subscription.billingCycle.count
          );
          break;
      }

      // TODO: Implement blockchain transaction listener or payment processing here

      // Create transaction record
      const transaction = new Transaction({
        type: "subscription",
        fromUserId: userId,
        toUserId: subscription.creatorId,
        fromAddress: walletAddress || "subscriber-wallet-address",
        toAddress: creator.walletAddress || "creator-wallet-address",
        amount: subscription.price.value.toString(),
        tokenAddress: "0x0", // Native token
        sourceChain: "ethereum", // Default for example
        destinationChain: "ethereum", // Default for example
        status: "completed",
        category: "subscription",
        tags: ["subscription", subscription.name],
        metadata: {
          subscriptionId: subscription._id,
          note: `Subscription to ${subscription.name}`,
        },
      });

      await transaction.save();

      // Create subscription instance
      const subscriptionInstance = new SubscriptionInstance({
        subscriptionId,
        creatorId: subscription.creatorId,
        subscriberId: userId,
        startDate,
        endDate,
        price: subscription.price,
        autoRenew: true,
        status: "active",
        transactions: [transaction._id],
      });

      await subscriptionInstance.save();

      return success({
        id: subscriptionInstance._id,
        subscription: {
          id: subscription._id,
          name: subscription.name,
        },
        startDate,
        endDate,
        price: subscription.price,
        autoRenew: subscriptionInstance.autoRenew,
        status: subscriptionInstance.status,
        transactionId: transaction._id,
      });
    } catch (err) {
      console.error("Subscribe to plan error:", err);
      return error("Could not process subscription", 500);
    }
  }
);

/**
 * Manage subscription instance
 * POST /api/subscriptions/manage/:instanceId
 */
export const manageSubscriptionInstance = requireAuth(
  async (
    event: AuthenticatedAPIGatewayProxyEvent
  ): Promise<APIGatewayProxyResult> => {
    try {
      // Database connection is handled in requireAuth middleware

      // User is provided by the auth middleware
      const userId = event.user?.id;

      if (!userId) {
        return error("User ID not found in token", 401);
      }

      // Get instance ID from path parameters
      if (!event.pathParameters?.instanceId) {
        return error("Instance ID parameter is required", 400);
      }

      const instanceId = event.pathParameters.instanceId;

      if (!event.body) {
        return error("Missing request body", 400);
      }

      const body: ManageSubscriptionRequestBody = JSON.parse(event.body);
      const { action } = body;

      // Basic validation
      if (!action || !["cancel", "reactivate", "terminate"].includes(action)) {
        return error(
          "Valid action is required (cancel, reactivate, terminate)",
          400
        );
      }

      // Get the subscription instance
      const instance = await SubscriptionInstance.findById(instanceId);

      if (!instance) {
        return error("Subscription instance not found", 404);
      }

      // Check if user is the subscriber
      if (instance.subscriberId.toString() !== userId) {
        return error("Unauthorized to manage this subscription", 403);
      }

      // Apply the requested action
      switch (action) {
        case "cancel":
          // Cancel auto-renewal but keep active until end date
          if (instance.status !== "active") {
            return error(
              "Cannot cancel a subscription that is not active",
              400
            );
          }
          instance.autoRenew = false;
          await instance.save();
          return success({
            id: instance._id,
            status: instance.status,
            autoRenew: instance.autoRenew,
            message:
              "Subscription auto-renewal has been cancelled. The subscription will remain active until the end date.",
            endDate: instance.endDate,
          });

        case "reactivate":
          // Reactivate auto-renewal if subscription is still active
          if (instance.status !== "active") {
            return error(
              "Cannot reactivate a subscription that is not active",
              400
            );
          }
          instance.autoRenew = true;
          await instance.save();
          return success({
            id: instance._id,
            status: instance.status,
            autoRenew: instance.autoRenew,
            message: "Subscription auto-renewal has been reactivated.",
            endDate: instance.endDate,
          });

        case "terminate":
          // Immediately terminate the subscription
          if (instance.status !== "active") {
            return error(
              "Cannot terminate a subscription that is not active",
              400
            );
          }
          instance.status = "canceled";
          instance.autoRenew = false;
          await instance.save();
          return success({
            id: instance._id,
            status: instance.status,
            autoRenew: instance.autoRenew,
            message: "Subscription has been terminated immediately.",
            endDate: instance.endDate,
          });

        default:
          return error("Invalid action", 400);
      }
    } catch (err) {
      console.error("Manage subscription instance error:", err);
      return error("Could not manage subscription", 500);
    }
  }
);
