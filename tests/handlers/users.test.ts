import { getUserByUsername } from "../../src/handlers/users";
import {
  createMockEvent,
  createMockAuthenticatedEvent,
  parseResponseBody,
  createMockContext,
} from "../utils/test-utils";
import mongoose from "mongoose";
import { User, Wallet } from "../../src/models";

// Mock dependencies
jest.mock("jsonwebtoken");
jest.mock("mongoose", () => {
  const actualMongoose = jest.requireActual("mongoose");
  return {
    ...actualMongoose,
    connection: {
      readyState: 1,
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
    findByIdAndUpdate: jest.fn(),
  },
  Wallet: {
    find: jest.fn(),
  },
}));

// Import the handlers directly - we're mocking the middleware separately
import * as userHandlerModule from "../../src/handlers/users";

// Mock the requireAuth middleware
jest.mock("../../src/middleware/auth", () => ({
  requireAuth: (fn: any) => fn,
  optionalAuth: (fn: any) => fn,
}));

describe("User Handler", () => {
  const mockContext = createMockContext();
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe("getUserByUsername", () => {
    it("should return a user profile by username", async () => {
      // Mock user data
      const mockUser = {
        _id: new mongoose.Types.ObjectId("60d21b4667d0d8992e610c85"),
        username: "testuser",
        email: "test@example.com",
        displayName: "Test User",
        avatar: "https://example.com/avatar.jpg",
        bio: "Test bio",
        createdAt: new Date("2023-01-01"),
        updatedAt: new Date("2023-01-02"),
      };

      // Mock User.findOne to return the mock user
      (User.findOne as jest.Mock).mockResolvedValue(mockUser);

      // Create mock event with username parameter
      const event = createMockEvent(null, { username: "testuser" });

      // Call the handler
      const response = await getUserByUsername(event);

      // Parse the response body
      const body = parseResponseBody(response);

      // Assert
      expect(response.statusCode).toBe(200);
      expect(body.success).toBe(true);
      expect(body.data).toHaveProperty("id");
      expect(body.data.username).toBe("testuser");
      expect(body.data.displayName).toBe("Test User");
      expect(body.data.bio).toBe("Test bio");
      expect(body.data).not.toHaveProperty("email");

      // Verify User.findOne was called correctly
      expect(User.findOne).toHaveBeenCalledWith({ username: "testuser" });
    });

    it("should return 404 if user is not found", async () => {
      // Mock User.findOne to return null
      (User.findOne as jest.Mock).mockResolvedValue(null);

      // Create mock event
      const event = createMockEvent(null, { username: "nonexistentuser" });

      // Call the handler
      const response = await getUserByUsername(event);

      // Parse the response body
      const body = parseResponseBody(response);

      // Assert
      expect(response.statusCode).toBe(404);
      expect(body.success).toBe(false);
      expect(body.error).toBe("User not found");
    });

    it("should return 400 if username parameter is missing", async () => {
      // Create mock event without username parameter
      const event = createMockEvent();

      // Call the handler
      const response = await getUserByUsername(event);

      // Parse the response body
      const body = parseResponseBody(response);

      // Assert
      expect(response.statusCode).toBe(400);
      expect(body.success).toBe(false);
      expect(body.error).toBe("Username parameter is required");
    });
  });

  describe("getCurrentUser", () => {
    it("should return the current user profile", async () => {
      // Mock user data
      const mockUser = {
        _id: new mongoose.Types.ObjectId("60d21b4667d0d8992e610c85"),
        username: "testuser",
        email: "test@example.com",
        displayName: "Test User",
        avatar: "https://example.com/avatar.jpg",
        socialProfiles: [
          {
            platform: "twitter",
            profileId: "twitter-id",
            username: "twitteruser",
          },
        ],
        preferences: {
          defaultCurrency: "USD",
          notificationsEnabled: true,
        },
        createdAt: new Date("2023-01-01"),
      };

      // Mock wallet data
      const mockWallets = [
        {
          _id: new mongoose.Types.ObjectId(),
          userId: mockUser._id,
          address: "0x1234567890abcdef",
          chain: "ethereum",
          type: "eoa",
          isDefault: true,
        },
        {
          _id: new mongoose.Types.ObjectId(),
          userId: mockUser._id,
          address: "0xfedcba0987654321",
          chain: "polygon",
          type: "eip7702",
          isDefault: false,
        },
      ];

      // Mock User.findById to return the mock user
      (User.findById as jest.Mock).mockResolvedValue(mockUser);

      // Mock Wallet.find to return the mock wallets
      (Wallet.find as jest.Mock).mockResolvedValue(mockWallets);

      // Create mock authenticated event
      const event = createMockAuthenticatedEvent(
        mockUser._id.toString(),
        mockUser.username,
        mockUser.email
      );

      // Call the handler directly (bypassing middleware)
      const response = await userHandlerModule.getCurrentUser(
        event,
        mockContext
      );

      // Parse the response body
      const body = parseResponseBody(response);

      // Assert
      expect(response.statusCode).toBe(200);
      expect(body.success).toBe(true);
      expect(body.data).toHaveProperty("id");
      expect(body.data.username).toBe("testuser");
      expect(body.data.email).toBe("test@example.com");
      expect(body.data.walletAddresses).toHaveLength(2);
      expect(body.data.walletAddresses).toContain("0x1234567890abcdef");
      expect(body.data.walletAddresses).toContain("0xfedcba0987654321");
      expect(body.data.socialProfiles).toHaveLength(1);
      expect(body.data.preferences).toHaveProperty("defaultCurrency", "USD");

      // Verify User.findById was called correctly
      expect(User.findById).toHaveBeenCalledWith(mockUser._id.toString());

      // Verify Wallet.find was called correctly
      expect(Wallet.find).toHaveBeenCalledWith({ userId: mockUser._id });
    });
  });

  describe("updateCurrentUser", () => {
    it("should update user profile information", async () => {
      // Mock user data
      const mockUserId = new mongoose.Types.ObjectId(
        "60d21b4667d0d8992e610c85"
      );
      const mockUpdatedUser = {
        _id: mockUserId,
        username: "newusername",
        email: "test@example.com",
        displayName: "New Display Name",
        bio: "New bio information",
        updatedAt: new Date(),
      };

      // Mock User.findByIdAndUpdate
      (User.findByIdAndUpdate as jest.Mock).mockResolvedValue({
        modifiedCount: 1,
      });

      // Mock User.findById to return the updated user
      (User.findById as jest.Mock).mockResolvedValue(mockUpdatedUser);

      // Mock User.findOne to check for username uniqueness (return null for no conflict)
      (User.findOne as jest.Mock).mockResolvedValue(null);

      // Create mock authenticated event with update data
      const event = createMockAuthenticatedEvent(
        mockUserId.toString(),
        "oldusername",
        "test@example.com",
        {
          username: "newusername",
          displayName: "New Display Name",
          bio: "New bio information",
        }
      );

      // Call the handler directly (bypassing middleware)
      const response = await userHandlerModule.updateCurrentUser(
        event,
        mockContext
      );

      // Parse the response body
      const body = parseResponseBody(response);

      // Assert
      expect(response.statusCode).toBe(200);
      expect(body.success).toBe(true);
      expect(body.data).toHaveProperty("id");
      expect(body.data.username).toBe("newusername");
      expect(body.data.displayName).toBe("New Display Name");
      expect(body.data.bio).toBe("New bio information");

      // Verify findByIdAndUpdate was called with correct parameters
      expect(User.findByIdAndUpdate).toHaveBeenCalledWith(
        mockUserId.toString(),
        {
          $set: expect.objectContaining({
            username: "newusername",
            displayName: "New Display Name",
            bio: "New bio information",
            updatedAt: expect.any(Date),
          }),
        }
      );
    });

    it("should return 409 if username is already taken", async () => {
      // Mock existing user with the username
      const existingUser = {
        _id: new mongoose.Types.ObjectId("60d21b4667d0d8992e610c86"), // Different ID
        username: "takenusername",
      };

      // Mock User.findOne to find a user with the same username
      (User.findOne as jest.Mock).mockResolvedValue(existingUser);

      // Create mock authenticated event with update data
      const event = createMockAuthenticatedEvent(
        "60d21b4667d0d8992e610c85", // Different from existing user
        "oldusername",
        "test@example.com",
        {
          username: "takenusername",
        }
      );

      // Call the handler directly (bypassing middleware)
      const response = await userHandlerModule.updateCurrentUser(
        event,
        mockContext
      );

      // Parse the response body
      const body = parseResponseBody(response);

      // Assert
      expect(response.statusCode).toBe(409);
      expect(body.success).toBe(false);
      expect(body.error).toBe("Username is already taken");

      // Verify findByIdAndUpdate was not called
      expect(User.findByIdAndUpdate).not.toHaveBeenCalled();
    });
  });
});
