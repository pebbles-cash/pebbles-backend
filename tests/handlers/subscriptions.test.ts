import mongoose from "mongoose";
import {
  createMockAuthenticatedEvent,
  parseResponseBody,
  createMockContext,
} from "../utils/test-utils";
import {
  User,
  Subscription,
  SubscriptionInstance,
  Transaction,
} from "../../src/models";
import * as subscriptionsHandlerModule from "../../src/handlers/subscriptions";

// Mock dependencies
jest.mock("mongoose", () => {
  const actualMongoose = jest.requireActual("mongoose");
  return {
    ...actualMongoose,
    connection: {
      readyState: 1,
    },
    Types: {
      ObjectId: jest.fn().mockImplementation((id) => id),
    },
  };
});

jest.mock("../../src/services/mongoose", () => ({
  connectToDatabase: jest.fn().mockResolvedValue({}),
  closeConnection: jest.fn().mockResolvedValue(undefined),
}));

jest.mock("../../src/models", () => ({
  User: {
    findById: jest.fn(),
    findOne: jest.fn(),
  },
  Subscription: {
    find: jest.fn(),
    findById: jest.fn(),
    findByIdAndUpdate: jest.fn(),
    findByIdAndDelete: jest.fn(),
    aggregate: jest.fn(),
    countDocuments: jest.fn(),
  },
  SubscriptionInstance: {
    findById: jest.fn(),
    findOne: jest.fn(),
    countDocuments: jest.fn(),
    aggregate: jest.fn(),
  },
  Transaction: {
    find: jest.fn(),
  },
}));

// Mock the requireAuth middleware
jest.mock("../../src/middleware/auth", () => ({
  requireAuth: (fn: any) => fn,
}));

describe("Subscriptions Handlers", () => {
  const mockContext = createMockContext();
  const creatorId = "creator123";
  const subscriberId = "subscriber456";
  const subscriptionId = "subscription789";
  const instanceId = "instance101";

  beforeEach(() => {
    jest.clearAllMocks();

    // Mock Subscription constructor
    (Subscription as any) = Object.assign(
      jest.fn().mockImplementation(() => ({
        _id: subscriptionId,
        creatorId,
        name: "Premium Plan",
        description: "Access to premium content",
        price: { value: 9.99, currency: "USD" },
        billingCycle: { interval: "month", count: 1 },
        features: ["Feature 1", "Feature 2"],
        active: true,
        createdAt: new Date(),
        save: jest.fn().mockResolvedValue(undefined),
      })),
      Subscription
    );

    // Mock Transaction constructor
    (Transaction as any) = Object.assign(
      jest.fn().mockImplementation(() => ({
        _id: "transaction123",
        type: "subscription",
        fromUserId: subscriberId,
        toUserId: creatorId,
        fromAddress: "subscriber-wallet-address",
        toAddress: "creator-wallet-address",
        amount: "9.99",
        tokenAddress: "0x0",
        sourceChain: "ethereum",
        destinationChain: "ethereum",
        status: "completed",
        category: "subscription",
        tags: ["subscription", "Premium Plan"],
        metadata: {
          subscriptionId: subscriptionId,
          note: "Subscription to Premium Plan",
        },
        save: jest.fn().mockResolvedValue(undefined),
      })),
      Transaction
    );

    // Mock SubscriptionInstance constructor
    (SubscriptionInstance as any) = Object.assign(
      jest.fn().mockImplementation(() => ({
        _id: instanceId,
        subscriptionId,
        creatorId,
        subscriberId,
        startDate: new Date(),
        endDate: new Date(new Date().setMonth(new Date().getMonth() + 1)),
        price: { value: 9.99, currency: "USD" },
        autoRenew: true,
        status: "active",
        transactions: ["transaction123"],
        save: jest.fn().mockResolvedValue(undefined),
      })),
      SubscriptionInstance
    );
  });

  describe("createSubscriptionPlan", () => {
    it("should successfully create a new subscription plan", async () => {
      // Create mock authenticated event
      const event = createMockAuthenticatedEvent(
        creatorId,
        "creator",
        "creator@example.com",
        {
          name: "Premium Plan",
          description: "Access to premium content",
          price: { value: 9.99, currency: "USD" },
          billingCycle: { interval: "month", count: 1 },
          features: ["Feature 1", "Feature 2"],
        }
      );

      // Call the handler directly
      const response = await subscriptionsHandlerModule.createSubscriptionPlan(
        event,
        mockContext
      );

      // Parse the response body
      const body = parseResponseBody(response);

      // Assert
      expect(response.statusCode).toBe(200);
      expect(body.success).toBe(true);
      expect(body.data).toHaveProperty("id", subscriptionId);
      expect(body.data).toHaveProperty("name", "Premium Plan");
      expect(body.data).toHaveProperty("price", {
        value: 9.99,
        currency: "USD",
      });
      expect(body.data).toHaveProperty("billingCycle", {
        interval: "month",
        count: 1,
      });
      expect(body.data).toHaveProperty("features", ["Feature 1", "Feature 2"]);
      expect(body.data).toHaveProperty("active", true);

      // Verify constructor was called with correct params
      expect(Subscription).toHaveBeenCalledWith({
        creatorId,
        name: "Premium Plan",
        description: "Access to premium content",
        price: { value: 9.99, currency: "USD" },
        billingCycle: { interval: "month", count: 1 },
        features: ["Feature 1", "Feature 2"],
        active: true,
      });
    });

    it("should handle missing required fields", async () => {
      // Create mock authenticated event with missing fields
      const event = createMockAuthenticatedEvent(
        creatorId,
        "creator",
        "creator@example.com",
        {
          description: "Access to premium content",
          // Missing 'name', 'price', and 'billingCycle'
        }
      );

      // Call the handler directly
      const response = await subscriptionsHandlerModule.createSubscriptionPlan(
        event,
        mockContext
      );

      // Parse the response body
      const body = parseResponseBody(response);

      // Assert
      expect(response.statusCode).toBe(400);
      expect(body.success).toBe(false);
      expect(body.error).toBe("Subscription name is required");
    });

    it("should handle authentication errors", async () => {
      // Create mock authenticated event but remove the user ID
      const event = createMockAuthenticatedEvent(
        creatorId,
        "creator",
        "creator@example.com",
        {
          name: "Premium Plan",
          price: { value: 9.99, currency: "USD" },
          billingCycle: { interval: "month", count: 1 },
        }
      );

      // Remove the ID to simulate auth error
      event.user = undefined;

      // Call the handler directly
      const response = await subscriptionsHandlerModule.createSubscriptionPlan(
        event,
        mockContext
      );

      // Parse the response body
      const body = parseResponseBody(response);

      // Assert
      expect(response.statusCode).toBe(401);
      expect(body.success).toBe(false);
      expect(body.error).toBe("User ID not found in token");
    });
  });

  describe("getCreatorSubscriptions", () => {
    it("should retrieve subscription plans for the authenticated user", async () => {
      // Mock subscription data
      const mockSubscriptions = [
        {
          _id: "subscription1",
          creatorId,
          name: "Basic Plan",
          description: "Basic features",
          price: { value: 4.99, currency: "USD" },
          billingCycle: { interval: "month", count: 1 },
          features: ["Basic Feature 1"],
          active: true,
          createdAt: new Date(),
        },
        {
          _id: "subscription2",
          creatorId,
          name: "Premium Plan",
          description: "Premium features",
          price: { value: 9.99, currency: "USD" },
          billingCycle: { interval: "month", count: 1 },
          features: ["Premium Feature 1", "Premium Feature 2"],
          active: true,
          createdAt: new Date(),
        },
      ];

      // Mock subscriber counts
      const mockSubscriberCounts = [
        { _id: "subscription1", count: 5 },
        { _id: "subscription2", count: 10 },
      ];

      // Setup mocks
      (Subscription.find as jest.Mock).mockReturnValue({
        sort: jest.fn().mockResolvedValue(mockSubscriptions),
      });
      (SubscriptionInstance.aggregate as jest.Mock).mockResolvedValue(
        mockSubscriberCounts
      );

      // Create mock authenticated event
      const event = createMockAuthenticatedEvent(
        creatorId,
        "creator",
        "creator@example.com"
      );

      // Call the handler directly
      const response = await subscriptionsHandlerModule.getCreatorSubscriptions(
        event,
        mockContext
      );

      // Parse the response body
      const body = parseResponseBody(response);

      // Assert
      expect(response.statusCode).toBe(200);
      expect(body.success).toBe(true);
      expect(body.data).toHaveProperty("subscriptions");
      expect(body.data.subscriptions).toHaveLength(2);
      expect(body.data.subscriptions[0]).toHaveProperty("name", "Basic Plan");
      expect(body.data.subscriptions[0]).toHaveProperty("subscriberCount", 5);
      expect(body.data.subscriptions[1]).toHaveProperty("name", "Premium Plan");
      expect(body.data.subscriptions[1]).toHaveProperty("subscriberCount", 10);

      // Verify queries were constructed correctly
      expect(Subscription.find).toHaveBeenCalledWith({
        creatorId,
        active: true,
      });
    });

    it("should fetch subscriptions for a specific creator", async () => {
      // Mock creator
      const targetCreator = {
        _id: "otherCreator123",
        username: "othercreator",
      };

      // Mock subscription data
      const mockSubscriptions = [
        {
          _id: "subscription1",
          creatorId: targetCreator._id,
          name: "Creator Plan",
          description: "Creator features",
          price: { value: 4.99, currency: "USD" },
          billingCycle: { interval: "month", count: 1 },
          features: ["Feature 1"],
          active: true,
          createdAt: new Date(),
        },
      ];

      // Mock subscriber counts
      const mockSubscriberCounts = [{ _id: "subscription1", count: 3 }];

      // Setup mocks
      (User.findOne as jest.Mock).mockResolvedValue(targetCreator);
      (Subscription.find as jest.Mock).mockReturnValue({
        sort: jest.fn().mockResolvedValue(mockSubscriptions),
      });
      (SubscriptionInstance.aggregate as jest.Mock).mockResolvedValue(
        mockSubscriberCounts
      );

      // Create mock authenticated event with query params
      const event = createMockAuthenticatedEvent(
        creatorId,
        "creator",
        "creator@example.com",
        null,
        {},
        { creator: "othercreator" }
      );

      // Call the handler directly
      const response = await subscriptionsHandlerModule.getCreatorSubscriptions(
        event,
        mockContext
      );

      // Parse the response body
      const body = parseResponseBody(response);

      // Assert
      expect(response.statusCode).toBe(200);
      expect(body.success).toBe(true);
      expect(body.data.subscriptions).toHaveLength(1);
      expect(body.data.subscriptions[0]).toHaveProperty("name", "Creator Plan");
      expect(body.data.subscriptions[0]).toHaveProperty("subscriberCount", 3);

      // Verify User.findOne was called correctly
      expect(User.findOne).toHaveBeenCalledWith({ username: "othercreator" });

      // Verify Subscription.find was called with the correct creator ID
      expect(Subscription.find).toHaveBeenCalledWith({
        creatorId: targetCreator._id,
        active: true,
      });
    });

    it("should handle non-existent creators", async () => {
      // Mock User.findOne to return null (creator not found)
      (User.findOne as jest.Mock).mockResolvedValue(null);

      // Create mock authenticated event with query params
      const event = createMockAuthenticatedEvent(
        creatorId,
        "creator",
        "creator@example.com",
        null,
        {},
        { creator: "nonexistentcreator" }
      );

      // Call the handler directly
      const response = await subscriptionsHandlerModule.getCreatorSubscriptions(
        event,
        mockContext
      );

      // Parse the response body
      const body = parseResponseBody(response);

      // Assert
      expect(response.statusCode).toBe(404);
      expect(body.success).toBe(false);
      expect(body.error).toBe("Creator not found");
    });
  });

  describe("getSubscriptionDetails", () => {
    it("should retrieve detailed information for a specific plan", async () => {
      // Mock subscription data
      const mockSubscription = {
        _id: subscriptionId,
        creatorId,
        name: "Premium Plan",
        description: "Premium features",
        price: { value: 9.99, currency: "USD" },
        billingCycle: { interval: "month", count: 1 },
        features: ["Feature 1", "Feature 2"],
        active: true,
        createdAt: new Date(),
      };

      // Mock creator data
      const mockCreator = {
        _id: creatorId,
        username: "creator",
        displayName: "Content Creator",
        avatar: "avatar-url",
      };

      // Setup mocks
      (Subscription.findById as jest.Mock).mockResolvedValue(mockSubscription);
      (User.findById as jest.Mock).mockReturnValue({
        select: jest.fn().mockResolvedValue(mockCreator),
      });
      (SubscriptionInstance.countDocuments as jest.Mock).mockResolvedValue(15);

      // Create mock authenticated event with path parameters
      const event = createMockAuthenticatedEvent(
        subscriberId, // User viewing the details
        "subscriber",
        "subscriber@example.com",
        null,
        { subscriptionId }
      );

      // Call the handler directly
      const response = await subscriptionsHandlerModule.getSubscriptionDetails(
        event,
        mockContext
      );

      // Parse the response body
      const body = parseResponseBody(response);

      // Assert
      expect(response.statusCode).toBe(200);
      expect(body.success).toBe(true);
      expect(body.data).toHaveProperty("subscription");
      expect(body.data.subscription).toHaveProperty("id", subscriptionId);
      expect(body.data.subscription).toHaveProperty("name", "Premium Plan");
      expect(body.data.subscription).toHaveProperty("creator");
      expect(body.data.subscription.creator).toHaveProperty(
        "username",
        "creator"
      );
      expect(body.data.subscription).toHaveProperty("subscriberCount", 15);

      // Verify queries were constructed correctly
      expect(Subscription.findById).toHaveBeenCalledWith(subscriptionId);
      expect(User.findById).toHaveBeenCalledWith(creatorId);
      expect(SubscriptionInstance.countDocuments).toHaveBeenCalledWith({
        subscriptionId,
        status: "active",
      });
    });

    it("should handle missing parameters", async () => {
      // Create mock authenticated event without subscription ID
      const event = createMockAuthenticatedEvent(
        subscriberId,
        "subscriber",
        "subscriber@example.com"
      );

      // No path parameters

      // Call the handler directly
      const response = await subscriptionsHandlerModule.getSubscriptionDetails(
        event,
        mockContext
      );

      // Parse the response body
      const body = parseResponseBody(response);

      // Assert
      expect(response.statusCode).toBe(400);
      expect(body.success).toBe(false);
      expect(body.error).toBe("Subscription ID parameter is required");
    });

    it("should handle non-existent subscriptions or creators", async () => {
      // Mock Subscription.findById to return null (subscription not found)
      (Subscription.findById as jest.Mock).mockResolvedValue(null);

      // Create mock authenticated event with path parameters
      const event = createMockAuthenticatedEvent(
        subscriberId,
        "subscriber",
        "subscriber@example.com",
        null,
        { subscriptionId }
      );

      // Call the handler directly
      const response = await subscriptionsHandlerModule.getSubscriptionDetails(
        event,
        mockContext
      );

      // Parse the response body
      const body = parseResponseBody(response);

      // Assert
      expect(response.statusCode).toBe(404);
      expect(body.success).toBe(false);
      expect(body.error).toBe("Subscription plan not found");

      // Now test when subscription exists but creator doesn't
      const mockSubscription = {
        _id: subscriptionId,
        creatorId,
        name: "Premium Plan",
      };

      (Subscription.findById as jest.Mock).mockResolvedValue(mockSubscription);
      (User.findById as jest.Mock).mockReturnValue({
        select: jest.fn().mockResolvedValue(null),
      });

      const response2 = await subscriptionsHandlerModule.getSubscriptionDetails(
        event,
        mockContext
      );

      const body2 = parseResponseBody(response2);

      expect(response2.statusCode).toBe(404);
      expect(body2.success).toBe(false);
      expect(body2.error).toBe("Creator not found");
    });
  });

  describe("updateSubscriptionPlan", () => {
    it("should successfully update a subscription plan", async () => {
      // Mock existing subscription
      const mockSubscription = {
        _id: subscriptionId,
        creatorId,
        name: "Old Plan Name",
        description: "Old description",
        price: { value: 9.99, currency: "USD" },
        billingCycle: { interval: "month", count: 1 },
        features: ["Old Feature 1"],
        active: true,
      };

      // Mock updated subscription
      const mockUpdatedSubscription = {
        _id: subscriptionId,
        creatorId,
        name: "Updated Plan Name",
        description: "Updated description",
        price: { value: 9.99, currency: "USD" }, // Price stays the same
        billingCycle: { interval: "month", count: 1 }, // Billing cycle stays the same
        features: ["Updated Feature 1", "New Feature 2"],
        active: true,
        updatedAt: new Date(),
      };

      // Setup mocks
      (Subscription.findById as jest.Mock)
        .mockResolvedValueOnce(mockSubscription)
        .mockResolvedValueOnce(mockUpdatedSubscription);

      // Create mock authenticated event with path parameters and update body
      const event = createMockAuthenticatedEvent(
        creatorId, // Must be the creator to update
        "creator",
        "creator@example.com",
        {
          name: "Updated Plan Name",
          description: "Updated description",
          features: ["Updated Feature 1", "New Feature 2"],
        },
        { subscriptionId }
      );

      // Call the handler directly
      const response = await subscriptionsHandlerModule.updateSubscriptionPlan(
        event,
        mockContext
      );

      // Parse the response body
      const body = parseResponseBody(response);

      // Assert
      expect(response.statusCode).toBe(200);
      expect(body.success).toBe(true);
      expect(body.data).toHaveProperty("id", subscriptionId);
      expect(body.data).toHaveProperty("name", "Updated Plan Name");
      expect(body.data).toHaveProperty("description", "Updated description");
      expect(body.data).toHaveProperty("features", [
        "Updated Feature 1",
        "New Feature 2",
      ]);

      // Verify findByIdAndUpdate was called correctly
      expect(Subscription.findByIdAndUpdate).toHaveBeenCalledWith(
        subscriptionId,
        {
          name: "Updated Plan Name",
          description: "Updated description",
          features: ["Updated Feature 1", "New Feature 2"],
        }
      );
    });

    it("should perform authorization checks (only creator can update)", async () => {
      // Mock existing subscription with a different creator ID
      const mockSubscription = {
        _id: subscriptionId,
        creatorId,
        name: "Plan Name",
        description: "Description",
        active: true,
      };

      // Setup mock
      (Subscription.findById as jest.Mock).mockResolvedValue(mockSubscription);

      // Create mock authenticated event with a different user ID
      const event = createMockAuthenticatedEvent(
        "differentuser123", // Not the creator
        "notcreator",
        "notcreator@example.com",
        {
          name: "Attempted Update",
        },
        { subscriptionId }
      );

      // Call the handler directly
      const response = await subscriptionsHandlerModule.updateSubscriptionPlan(
        event,
        mockContext
      );

      // Parse the response body
      const body = parseResponseBody(response);

      // Assert
      expect(response.statusCode).toBe(403);
      expect(body.success).toBe(false);
      expect(body.error).toBe("Unauthorized to update this subscription plan");

      // Verify findByIdAndUpdate was not called
      expect(Subscription.findByIdAndUpdate).not.toHaveBeenCalled();
    });

    it("should handle non-existent subscriptions", async () => {
      // Mock Subscription.findById to return null (subscription not found)
      (Subscription.findById as jest.Mock).mockResolvedValue(null);

      // Create mock authenticated event
      const event = createMockAuthenticatedEvent(
        creatorId,
        "creator",
        "creator@example.com",
        {
          name: "Updated Name",
        },
        { subscriptionId }
      );

      // Call the handler directly
      const response = await subscriptionsHandlerModule.updateSubscriptionPlan(
        event,
        mockContext
      );

      // Parse the response body
      const body = parseResponseBody(response);

      // Assert
      expect(response.statusCode).toBe(404);
      expect(body.success).toBe(false);
      expect(body.error).toBe("Subscription plan not found");

      // Verify findByIdAndUpdate was not called
      expect(Subscription.findByIdAndUpdate).not.toHaveBeenCalled();
    });
  });

  describe("deleteSubscriptionPlan", () => {
    it("should successfully delete a plan with no active subscribers", async () => {
      // Mock existing subscription
      const mockSubscription = {
        _id: subscriptionId,
        creatorId,
        name: "Plan to Delete",
      };

      // Setup mocks
      (Subscription.findById as jest.Mock).mockResolvedValue(mockSubscription);
      (SubscriptionInstance.countDocuments as jest.Mock).mockResolvedValue(0); // No active subscribers

      // Create mock authenticated event
      const event = createMockAuthenticatedEvent(
        creatorId, // Must be the creator to delete
        "creator",
        "creator@example.com",
        null,
        { subscriptionId }
      );

      // Call the handler directly
      const response = await subscriptionsHandlerModule.deleteSubscriptionPlan(
        event,
        mockContext
      );

      // Parse the response body
      const body = parseResponseBody(response);

      // Assert
      expect(response.statusCode).toBe(200);
      expect(body.success).toBe(true);
      expect(body.data).toHaveProperty(
        "message",
        "Subscription plan deleted successfully"
      );

      // Verify findByIdAndDelete was called correctly
      expect(Subscription.findByIdAndDelete).toHaveBeenCalledWith(
        subscriptionId
      );
    });

    it("should prevent deletion when active subscribers exist", async () => {
      // Mock existing subscription
      const mockSubscription = {
        _id: subscriptionId,
        creatorId,
        name: "Plan with Subscribers",
      };

      // Setup mocks
      (Subscription.findById as jest.Mock).mockResolvedValue(mockSubscription);
      (SubscriptionInstance.countDocuments as jest.Mock).mockResolvedValue(5); // 5 active subscribers

      // Create mock authenticated event
      const event = createMockAuthenticatedEvent(
        creatorId,
        "creator",
        "creator@example.com",
        null,
        { subscriptionId }
      );

      // Call the handler directly
      const response = await subscriptionsHandlerModule.deleteSubscriptionPlan(
        event,
        mockContext
      );

      // Parse the response body
      const body = parseResponseBody(response);

      // Assert
      expect(response.statusCode).toBe(400);
      expect(body.success).toBe(false);
      expect(body.error).toBe(
        "Cannot delete subscription plan with active subscribers. Deactivate the plan instead."
      );

      // Verify findByIdAndDelete was not called
      expect(Subscription.findByIdAndDelete).not.toHaveBeenCalled();
    });

    it("should perform authorization checks", async () => {
      // Mock existing subscription with a different creator ID
      const mockSubscription = {
        _id: subscriptionId,
        creatorId,
        name: "Plan Name",
      };

      // Setup mock
      (Subscription.findById as jest.Mock).mockResolvedValue(mockSubscription);

      // Create mock authenticated event with a different user ID
      const event = createMockAuthenticatedEvent(
        "differentuser123", // Not the creator
        "notcreator",
        "notcreator@example.com",
        null,
        { subscriptionId }
      );

      // Call the handler directly
      const response = await subscriptionsHandlerModule.deleteSubscriptionPlan(
        event,
        mockContext
      );

      // Parse the response body
      const body = parseResponseBody(response);

      // Assert
      expect(response.statusCode).toBe(403);
      expect(body.success).toBe(false);
      expect(body.error).toBe("Unauthorized to delete this subscription plan");

      // Verify no further operations were performed
      expect(SubscriptionInstance.countDocuments).not.toHaveBeenCalled();
      expect(Subscription.findByIdAndDelete).not.toHaveBeenCalled();
    });
  });

  describe("subscribeToPlan", () => {
    it("should successfully subscribe to a plan", async () => {
      // Mock subscription data
      const mockSubscription = {
        _id: subscriptionId,
        creatorId,
        name: "Premium Plan",
        description: "Premium features",
        price: { value: 9.99, currency: "USD" },
        billingCycle: { interval: "month", count: 1 },
        features: ["Feature 1", "Feature 2"],
        active: true,
      };

      // Mock creator
      const mockCreator = {
        _id: creatorId,
        username: "creator",
        walletAddress: "creator-wallet-address",
      };

      // Setup mocks
      (Subscription.findById as jest.Mock).mockResolvedValue(mockSubscription);
      (User.findById as jest.Mock).mockResolvedValue(mockCreator);
      (SubscriptionInstance.findOne as jest.Mock).mockResolvedValue(null); // No existing subscription

      // Create mock authenticated event
      const event = createMockAuthenticatedEvent(
        subscriberId, // Subscriber trying to subscribe
        "subscriber",
        "subscriber@example.com",
        {
          paymentMethod: "wallet",
          walletAddress: "subscriber-wallet-address",
        },
        { subscriptionId }
      );

      // Call the handler directly
      const response = await subscriptionsHandlerModule.subscribeToPlan(
        event,
        mockContext
      );

      // Parse the response body
      const body = parseResponseBody(response);

      // Assert
      expect(response.statusCode).toBe(200);
      expect(body.success).toBe(true);
      expect(body.data).toHaveProperty("id", instanceId);
      expect(body.data).toHaveProperty("subscription");
      expect(body.data.subscription).toHaveProperty("id", subscriptionId);
      expect(body.data.subscription).toHaveProperty("name", "Premium Plan");
      expect(body.data).toHaveProperty("autoRenew", true);
      expect(body.data).toHaveProperty("status", "active");
      expect(body.data).toHaveProperty("transactionId", "transaction123");

      // Verify Transaction constructor was called with correct params
      expect(Transaction).toHaveBeenCalledWith(
        expect.objectContaining({
          type: "subscription",
          fromUserId: subscriberId,
          toUserId: creatorId,
          fromAddress: "subscriber-wallet-address",
          toAddress: "creator-wallet-address",
        })
      );

      // Verify SubscriptionInstance constructor was called with correct params
      expect(SubscriptionInstance).toHaveBeenCalledWith(
        expect.objectContaining({
          subscriptionId,
          creatorId,
          subscriberId,
          autoRenew: true,
          status: "active",
        })
      );
    });

    it("should prevent subscription to inactive plans", async () => {
      // Mock inactive subscription
      const mockSubscription = {
        _id: subscriptionId,
        creatorId,
        name: "Inactive Plan",
        price: { value: 9.99, currency: "USD" },
        billingCycle: { interval: "month", count: 1 },
        active: false, // Inactive plan
      };

      // Setup mock
      (Subscription.findById as jest.Mock).mockResolvedValue(mockSubscription);

      // Create mock authenticated event
      const event = createMockAuthenticatedEvent(
        subscriberId,
        "subscriber",
        "subscriber@example.com",
        {
          paymentMethod: "wallet",
          walletAddress: "subscriber-wallet-address",
        },
        { subscriptionId }
      );

      // Call the handler directly
      const response = await subscriptionsHandlerModule.subscribeToPlan(
        event,
        mockContext
      );

      // Parse the response body
      const body = parseResponseBody(response);

      // Assert
      expect(response.statusCode).toBe(400);
      expect(body.success).toBe(false);
      expect(body.error).toBe("This subscription plan is no longer available");
    });

    it("should prevent subscription to your own plan", async () => {
      // Mock subscription where the creator is trying to subscribe
      const mockSubscription = {
        _id: subscriptionId,
        creatorId, // Same as the subscriber ID in this test
        name: "My Own Plan",
        price: { value: 9.99, currency: "USD" },
        billingCycle: { interval: "month", count: 1 },
        active: true,
      };

      // Setup mocks
      (Subscription.findById as jest.Mock).mockResolvedValue(mockSubscription);

      // Create mock authenticated event where the creator is trying to subscribe to their own plan
      const event = createMockAuthenticatedEvent(
        creatorId, // Same as the creatorId of the plan
        "creator",
        "creator@example.com",
        {
          paymentMethod: "wallet",
          walletAddress: "creator-wallet-address",
        },
        { subscriptionId }
      );

      // Call the handler directly
      const response = await subscriptionsHandlerModule.subscribeToPlan(
        event,
        mockContext
      );

      // Parse the response body
      const body = parseResponseBody(response);

      // Assert
      expect(response.statusCode).toBe(400);
      expect(body.success).toBe(false);
      expect(body.error).toBe("You cannot subscribe to your own plan");
    });

    it("should prevent duplicate subscriptions", async () => {
      // Mock subscription data
      const mockSubscription = {
        _id: subscriptionId,
        creatorId,
        name: "Premium Plan",
        price: { value: 9.99, currency: "USD" },
        billingCycle: { interval: "month", count: 1 },
        active: true,
      };

      // Mock existing subscription instance (already subscribed)
      const mockExistingInstance = {
        _id: instanceId,
        subscriptionId,
        creatorId,
        subscriberId,
        status: "active",
      };

      // Setup mocks
      (Subscription.findById as jest.Mock).mockResolvedValue(mockSubscription);
      (User.findById as jest.Mock).mockResolvedValue({ _id: creatorId });
      (SubscriptionInstance.findOne as jest.Mock).mockResolvedValue(
        mockExistingInstance
      );

      // Create mock authenticated event
      const event = createMockAuthenticatedEvent(
        subscriberId,
        "subscriber",
        "subscriber@example.com",
        {
          paymentMethod: "wallet",
          walletAddress: "subscriber-wallet-address",
        },
        { subscriptionId }
      );

      // Call the handler directly
      const response = await subscriptionsHandlerModule.subscribeToPlan(
        event,
        mockContext
      );

      // Parse the response body
      const body = parseResponseBody(response);

      // Assert
      expect(response.statusCode).toBe(400);
      expect(body.success).toBe(false);
      expect(body.error).toBe("You are already subscribed to this plan");
    });
  });

  describe("manageSubscriptionInstance", () => {
    it("should cancel auto-renewal", async () => {
      // Mock subscription instance
      const mockInstance = {
        _id: instanceId,
        subscriptionId,
        creatorId,
        subscriberId,
        status: "active",
        autoRenew: true,
        endDate: new Date(new Date().setMonth(new Date().getMonth() + 1)),
        save: jest.fn().mockResolvedValue(undefined),
      };

      // Setup mock
      (SubscriptionInstance.findById as jest.Mock).mockResolvedValue(
        mockInstance
      );

      // Create mock authenticated event
      const event = createMockAuthenticatedEvent(
        subscriberId, // Must be the subscriber to manage
        "subscriber",
        "subscriber@example.com",
        {
          action: "cancel", // Cancel auto-renewal
        },
        { instanceId }
      );

      // Call the handler directly
      const response =
        await subscriptionsHandlerModule.manageSubscriptionInstance(
          event,
          mockContext
        );

      // Parse the response body
      const body = parseResponseBody(response);

      // Assert
      expect(response.statusCode).toBe(200);
      expect(body.success).toBe(true);
      expect(body.data).toHaveProperty("id", instanceId);
      expect(body.data).toHaveProperty("status", "active"); // Still active until end date
      expect(body.data).toHaveProperty("autoRenew", false); // Auto-renewal turned off
      expect(body.data).toHaveProperty(
        "message",
        "Subscription auto-renewal has been cancelled. The subscription will remain active until the end date."
      );

      // Verify instance properties were updated
      expect(mockInstance.autoRenew).toBe(false);
      expect(mockInstance.save).toHaveBeenCalled();
    });

    it("should reactivate auto-renewal", async () => {
      // Mock subscription instance
      const mockInstance = {
        _id: instanceId,
        subscriptionId,
        creatorId,
        subscriberId,
        status: "active",
        autoRenew: false, // Auto-renewal currently off
        endDate: new Date(new Date().setMonth(new Date().getMonth() + 1)),
        save: jest.fn().mockResolvedValue(undefined),
      };

      // Setup mock
      (SubscriptionInstance.findById as jest.Mock).mockResolvedValue(
        mockInstance
      );

      // Create mock authenticated event
      const event = createMockAuthenticatedEvent(
        subscriberId,
        "subscriber",
        "subscriber@example.com",
        {
          action: "reactivate", // Reactivate auto-renewal
        },
        { instanceId }
      );

      // Call the handler directly
      const response =
        await subscriptionsHandlerModule.manageSubscriptionInstance(
          event,
          mockContext
        );

      // Parse the response body
      const body = parseResponseBody(response);

      // Assert
      expect(response.statusCode).toBe(200);
      expect(body.success).toBe(true);
      expect(body.data).toHaveProperty("id", instanceId);
      expect(body.data).toHaveProperty("status", "active");
      expect(body.data).toHaveProperty("autoRenew", true); // Auto-renewal turned on
      expect(body.data).toHaveProperty(
        "message",
        "Subscription auto-renewal has been reactivated."
      );

      // Verify instance properties were updated
      expect(mockInstance.autoRenew).toBe(true);
      expect(mockInstance.save).toHaveBeenCalled();
    });

    it("should terminate a subscription immediately", async () => {
      // Mock subscription instance
      const mockInstance = {
        _id: instanceId,
        subscriptionId,
        creatorId,
        subscriberId,
        status: "active",
        autoRenew: true,
        endDate: new Date(new Date().setMonth(new Date().getMonth() + 1)),
        save: jest.fn().mockResolvedValue(undefined),
      };

      // Setup mock
      (SubscriptionInstance.findById as jest.Mock).mockResolvedValue(
        mockInstance
      );

      // Create mock authenticated event
      const event = createMockAuthenticatedEvent(
        subscriberId,
        "subscriber",
        "subscriber@example.com",
        {
          action: "terminate", // Immediately terminate
        },
        { instanceId }
      );

      // Call the handler directly
      const response =
        await subscriptionsHandlerModule.manageSubscriptionInstance(
          event,
          mockContext
        );

      // Parse the response body
      const body = parseResponseBody(response);

      // Assert
      expect(response.statusCode).toBe(200);
      expect(body.success).toBe(true);
      expect(body.data).toHaveProperty("id", instanceId);
      expect(body.data).toHaveProperty("status", "canceled"); // Status changed to canceled
      expect(body.data).toHaveProperty("autoRenew", false);
      expect(body.data).toHaveProperty(
        "message",
        "Subscription has been terminated immediately."
      );

      // Verify instance properties were updated
      expect(mockInstance.status).toBe("canceled");
      expect(mockInstance.autoRenew).toBe(false);
      expect(mockInstance.save).toHaveBeenCalled();
    });

    it("should handle various error cases and authorization checks", async () => {
      // Test 1: Missing instanceId parameter
      const event1 = createMockAuthenticatedEvent(
        subscriberId,
        "subscriber",
        "subscriber@example.com",
        {
          action: "cancel",
        }
        // No instanceId parameter
      );

      const response1 =
        await subscriptionsHandlerModule.manageSubscriptionInstance(
          event1,
          mockContext
        );

      const body1 = parseResponseBody(response1);

      expect(response1.statusCode).toBe(400);
      expect(body1.success).toBe(false);
      expect(body1.error).toBe("Instance ID parameter is required");

      // Test 2: Missing or invalid action
      const event2 = createMockAuthenticatedEvent(
        subscriberId,
        "subscriber",
        "subscriber@example.com",
        {
          // No action specified
        },
        { instanceId }
      );

      const response2 =
        await subscriptionsHandlerModule.manageSubscriptionInstance(
          event2,
          mockContext
        );

      const body2 = parseResponseBody(response2);

      expect(response2.statusCode).toBe(400);
      expect(body2.success).toBe(false);
      expect(body2.error).toBe(
        "Valid action is required (cancel, reactivate, terminate)"
      );

      // Test 3: Instance not found
      (SubscriptionInstance.findById as jest.Mock).mockResolvedValue(null);

      const event3 = createMockAuthenticatedEvent(
        subscriberId,
        "subscriber",
        "subscriber@example.com",
        {
          action: "cancel",
        },
        { instanceId }
      );

      const response3 =
        await subscriptionsHandlerModule.manageSubscriptionInstance(
          event3,
          mockContext
        );

      const body3 = parseResponseBody(response3);

      expect(response3.statusCode).toBe(404);
      expect(body3.success).toBe(false);
      expect(body3.error).toBe("Subscription instance not found");

      // Test 4: Unauthorized (not the subscriber)
      const mockInstance = {
        _id: instanceId,
        subscriptionId,
        creatorId,
        subscriberId: "differentuser123", // Different from the authenticated user
        status: "active",
      };

      (SubscriptionInstance.findById as jest.Mock).mockResolvedValue(
        mockInstance
      );

      const event4 = createMockAuthenticatedEvent(
        subscriberId, // Not the subscriber of this instance
        "notsubscriber",
        "notsubscriber@example.com",
        {
          action: "cancel",
        },
        { instanceId }
      );

      const response4 =
        await subscriptionsHandlerModule.manageSubscriptionInstance(
          event4,
          mockContext
        );

      const body4 = parseResponseBody(response4);

      expect(response4.statusCode).toBe(403);
      expect(body4.success).toBe(false);
      expect(body4.error).toBe("Unauthorized to manage this subscription");

      // Test 5: Cannot cancel non-active subscription
      const inactiveInstance = {
        _id: instanceId,
        subscriptionId,
        creatorId,
        subscriberId,
        status: "canceled", // Already canceled
      };

      (SubscriptionInstance.findById as jest.Mock).mockResolvedValue(
        inactiveInstance
      );

      const event5 = createMockAuthenticatedEvent(
        subscriberId,
        "subscriber",
        "subscriber@example.com",
        {
          action: "cancel",
        },
        { instanceId }
      );

      const response5 =
        await subscriptionsHandlerModule.manageSubscriptionInstance(
          event5,
          mockContext
        );

      const body5 = parseResponseBody(response5);

      expect(response5.statusCode).toBe(400);
      expect(body5.success).toBe(false);
      expect(body5.error).toBe(
        "Cannot cancel a subscription that is not active"
      );
    });
  });
});
