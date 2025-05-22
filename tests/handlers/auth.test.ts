import { APIGatewayProxyEvent, Context } from "aws-lambda";
import jwt from "jsonwebtoken";
import mongoose from "mongoose";
import {
  login, // Updated from callback to login
  verifyToken,
  logout,
  logoutHandler,
} from "../../src/handlers/auth";
import { connectToDatabase } from "../../src/services/mongoose";
import { User } from "../../src/models";
import jwksClient from "jwks-rsa";
import axios from "axios";

// Mock dependencies
jest.mock("../../src/services/mongoose");
jest.mock("mongoose", () => {
  const original = jest.requireActual("mongoose");
  return {
    ...original,
    Types: {
      ObjectId: jest.fn().mockImplementation((id) => id),
    },
    connection: {
      db: {
        collection: jest.fn().mockReturnValue({
          insertOne: jest.fn().mockResolvedValue({ insertedId: "mock-id" }),
          updateOne: jest.fn().mockResolvedValue({ modifiedCount: 1 }),
          findOne: jest.fn().mockResolvedValue(null),
        }),
      },
    },
  };
});

jest.mock("../../src/models", () => ({
  User: {
    findOne: jest.fn(),
    findById: jest.fn(),
  },
}));

jest.mock("axios");
jest.mock("jsonwebtoken");
jest.mock("jwks-rsa");

// Mock jwks-rsa client properly
jest.mock("jwks-rsa", () => {
  // Create a mock function that returns a mock object with getSigningKey method
  return jest.fn().mockImplementation(() => {
    return {
      getSigningKey: jest.fn().mockResolvedValue({
        getPublicKey: jest.fn().mockReturnValue("mock-public-key"),
      }),
    };
  });
});

describe("Auth Handlers", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    process.env.JWT_SECRET = "test-secret";
    process.env.DYNAMIC_ENVIRONMENT_ID = "test-env-id";
    process.env.DYNAMIC_API_URL = "https://app.dynamic.xyz/api/v0";
    process.env.DYNAMIC_API_KEY = "test-api-key";

    (User as any) = Object.assign(
      jest.fn().mockImplementation(() => ({
        _id: new mongoose.Types.ObjectId("60d21b4667d0d8992e610c85"),
        email: "test@example.com",
        username: "testuser",
        displayName: "Test User",
        dynamicUserId: "dynamic-user-123",
        primaryWalletAddress: "0x1234567890",
        chain: "ethereum",
        socialProfiles: [],
        preferences: {
          defaultCurrency: "USD",
          defaultLanguage: "en",
          notificationsEnabled: true,
          twoFactorEnabled: false,
          preferredTimeZone: "UTC",
        },
        createdAt: new Date(),
        updatedAt: new Date(),
        save: jest.fn().mockResolvedValue(true),
      })),
      User
    );
  });

  describe("login", () => {
    const mockDynamicToken = "mock-dynamic-token";
    const mockDecodedToken = {
      sub: "dynamic-user-123",
      email: "test@example.com",
      name: "Test User",
    };

    // Create mock event with token in header instead of body
    const mockEvent = {
      headers: {
        Authorization: `Bearer ${mockDynamicToken}`,
      },
      body: JSON.stringify({
        preferences: {
          defaultCurrency: "USD",
          defaultLanguage: "en",
          notificationsEnabled: true,
          twoFactorEnabled: false,
          preferredTimeZone: "UTC",
        },
      }),
    } as unknown as APIGatewayProxyEvent;

    it("should authenticate a user with valid Dynamic token - existing user", async () => {
      // Mock console.warn to avoid unnecessary logs
      const originalWarn = console.warn;
      console.warn = jest.fn();
      // Mock JWT decode to return a proper structure including header with kid
      (jwt.decode as jest.Mock).mockReturnValue({
        header: { kid: "test-key-id" },
        payload: mockDecodedToken,
      });

      // Mock JWT verify to return the decoded token
      (jwt.verify as jest.Mock).mockReturnValue(mockDecodedToken);

      // Mock JWT sign for our app token
      (jwt.sign as jest.Mock).mockReturnValue("new-session-token");

      // Mock user exists with updated schema
      const mockUser = {
        _id: "user-123",
        email: "test@example.com",
        username: "testuser",
        displayName: "Test User",
        primaryWalletAddress: "0x1234567890",
        chain: "ethereum",
        preferences: {
          defaultCurrency: "USD",
          defaultLanguage: "en",
          notificationsEnabled: true,
          twoFactorEnabled: false,
          preferredTimeZone: "UTC",
        },
        save: jest.fn().mockResolvedValue(true),
      };
      (User.findOne as jest.Mock).mockResolvedValue(mockUser);

      const response = await login(mockEvent);

      // Check response
      expect(response.statusCode).toBe(200);
      expect(JSON.parse(response.body).success).toBe(true);
      expect(JSON.parse(response.body).data.token).toBe("new-session-token");

      // Check user data returned includes the new fields
      const userData = JSON.parse(response.body).data.user;
      expect(userData.primaryWalletAddress).toBe("0x1234567890");
      expect(userData.chain).toBe("ethereum");
      expect(userData.preferences).toBeDefined();
      expect(userData.preferences.defaultCurrency).toBe("USD");

      // Verify function calls
      expect(connectToDatabase).toHaveBeenCalled();
      expect(jwt.decode).toHaveBeenCalledWith(mockDynamicToken, {
        complete: true,
      });
      expect(jwt.verify).toHaveBeenCalledWith(
        mockDynamicToken,
        "mock-public-key"
      );
      expect(User.findOne).toHaveBeenCalledWith({
        dynamicUserId: "dynamic-user-123",
      });
      expect(jwt.sign).toHaveBeenCalled();
      expect(mongoose.connection.db.collection).toHaveBeenCalledWith(
        "userSessions"
      );

      // Restore console.warn
      console.warn = originalWarn;
    });

    it("should authenticate a user with valid Dynamic token - new user", async () => {
      // Mock console.warn to avoid unnecessary logs
      const originalWarn = console.warn;
      console.warn = jest.fn();

      // Create event with wallet address in userData to satisfy validation
      const newUserEvent = {
        headers: {
          Authorization: `Bearer ${mockDynamicToken}`,
        },
        body: JSON.stringify({
          primaryWalletAddress: "0x1234567890",
          chain: "ethereum",
          preferences: {
            defaultCurrency: "EUR",
            defaultLanguage: "en",
            notificationsEnabled: true,
            twoFactorEnabled: false,
            preferredTimeZone: "UTC",
          },
        }),
      } as unknown as APIGatewayProxyEvent;

      // Mock JWT decode and verify same as above
      (jwt.decode as jest.Mock).mockReturnValue({
        header: { kid: "test-key-id" },
        payload: mockDecodedToken,
      });
      (jwt.verify as jest.Mock).mockReturnValue(mockDecodedToken);
      (jwt.sign as jest.Mock).mockReturnValue("new-session-token");

      // Properly mock axios for Dynamic API call
      (axios.get as jest.Mock) = jest.fn().mockResolvedValue({
        data: {
          username: "testuser",
          email: "test@example.com",
          displayName: "Test User",
          avatar: "https://example.com/avatar.jpg",
          walletAddress: "0x1234567890", // This provides the wallet address
          chain: "ethereum",
          socialAccounts: [],
        },
      });

      // Mock user doesn't exist, then username check
      (User.findOne as jest.Mock)
        .mockResolvedValueOnce(null) // First call returns null (user not found)
        .mockResolvedValueOnce(null); // Second call for username check returns null

      const response = await login(newUserEvent);

      // Check response
      expect(response.statusCode).toBe(200);
      expect(JSON.parse(response.body).success).toBe(true);
      // Verify user data is returned
      const userData = JSON.parse(response.body).data.user;
      expect(userData).toBeDefined();
      expect(userData.primaryWalletAddress).toBe("0x1234567890");
      expect(userData.chain).toBe("ethereum");
      expect(userData.preferences).toBeDefined();

      // Verify User constructor was called
      expect(User).toHaveBeenCalledWith(
        expect.objectContaining({
          email: "test@example.com",
          dynamicUserId: "dynamic-user-123",
          primaryWalletAddress: "0x1234567890",
          chain: "ethereum",
        })
      );

      // Restore console.warn
      console.warn = originalWarn;
    });

    it("should return error when wallet address is missing for new user", async () => {
      // Mock console.warn to avoid unnecessary logs
      const originalWarn = console.warn;
      console.warn = jest.fn();

      // Create event without wallet address to trigger validation error
      const eventWithoutWallet = {
        headers: {
          Authorization: `Bearer ${mockDynamicToken}`,
        },
        body: JSON.stringify({
          // No primaryWalletAddress provided
          chain: "ethereum",
        }),
      } as unknown as APIGatewayProxyEvent;

      // Mock JWT decode and verify
      (jwt.decode as jest.Mock).mockReturnValue({
        header: { kid: "test-key-id" },
        payload: mockDecodedToken,
      });
      (jwt.verify as jest.Mock).mockReturnValue(mockDecodedToken);

      // Mock axios for Dynamic API call but without wallet address
      (axios.get as jest.Mock) = jest.fn().mockResolvedValue({
        data: {
          username: "testuser",
          email: "test@example.com",
          displayName: "Test User",
          avatar: "https://example.com/avatar.jpg",
          // No walletAddress provided from Dynamic either
          chain: "ethereum",
          socialAccounts: [],
        },
      });

      // Mock user doesn't exist (new user scenario)
      (User.findOne as jest.Mock).mockResolvedValueOnce(null);

      const response = await login(eventWithoutWallet);

      // Check response - should return 400 for missing wallet address
      expect(response.statusCode).toBe(400);
      expect(JSON.parse(response.body).success).toBe(false);
      expect(JSON.parse(response.body).error).toBe(
        "Wallet address is required"
      );

      // Restore console.warn
      console.warn = originalWarn;
    });
  });

  describe("verifyToken", () => {
    it("should verify a valid token", async () => {
      const mockEvent = {
        headers: {
          Authorization: "Bearer valid-token",
        },
      } as unknown as APIGatewayProxyEvent;

      // Mock JWT verification
      (jwt.verify as jest.Mock).mockReturnValue({ userId: "user-123" });

      const response = await verifyToken(mockEvent);

      expect(response.statusCode).toBe(200);
      expect(JSON.parse(response.body).success).toBe(true);
      expect(JSON.parse(response.body).data.valid).toBe(true);
    });

    it("should return invalid for expired token", async () => {
      const mockEvent = {
        headers: {
          Authorization: "Bearer expired-token",
        },
      } as unknown as APIGatewayProxyEvent;

      // Mock JWT verification to throw error
      (jwt.verify as jest.Mock).mockImplementation(() => {
        throw new Error("Token expired");
      });

      const response = await verifyToken(mockEvent);

      expect(response.statusCode).toBe(200);
      expect(JSON.parse(response.body).success).toBe(true);
      expect(JSON.parse(response.body).data.valid).toBe(false);
    });

    it("should handle missing token", async () => {
      const mockEvent = {
        headers: {},
      } as unknown as APIGatewayProxyEvent;

      const response = await verifyToken(mockEvent);

      expect(response.statusCode).toBe(401);
      expect(JSON.parse(response.body).success).toBe(false);
      expect(JSON.parse(response.body).error).toBe("Authorization required");
    });
  });

  describe("logout", () => {
    // This is important - we need to mock the middleware behavior
    beforeEach(() => {
      // For the tests, we'll create properly authenticated events
      // rather than mocking the middleware which would be complex
    });

    const mockEvent = {
      headers: {
        Authorization: "Bearer valid-token",
      },
    } as any;

    const mockContext: Context = {
      callbackWaitsForEmptyEventLoop: false,
      functionName: "test",
      functionVersion: "1",
      invokedFunctionArn: "arn:test",
      memoryLimitInMB: "128",
      awsRequestId: "test-id",
      logGroupName: "test-group",
      logStreamName: "test-stream",
      getRemainingTimeInMillis: () => 1000,
      done: () => {},
      fail: () => {},
      succeed: () => {},
    };

    it("should logout a user successfully", async () => {
      // Mock MongoDB collection
      const mockUpdateOne = jest.fn().mockResolvedValue({ modifiedCount: 1 });
      (mongoose.connection.db.collection as jest.Mock).mockReturnValue({
        updateOne: mockUpdateOne,
        findOne: jest.fn().mockResolvedValue(null),
      });

      // Create authenticated event with updated user fields
      const authenticatedEvent = {
        headers: {
          Authorization: "Bearer valid-token",
        },
        user: {
          id: "user-123",
          username: "testuser",
          email: "test@example.com",
          displayName: "Test User",
          primaryWalletAddress: "0x1234567890",
          chain: "ethereum",
          preferences: {
            defaultCurrency: "USD",
            defaultLanguage: "en",
            notificationsEnabled: true,
            twoFactorEnabled: false,
            preferredTimeZone: "UTC",
          },
        },
      };

      // Test directly with the extracted handler function - bypassing the middleware
      const response = await logoutHandler(authenticatedEvent as any);

      expect(response.statusCode).toBe(200);
      expect(JSON.parse(response.body).success).toBe(true);
      expect(JSON.parse(response.body).data.message).toBe(
        "Logged out successfully"
      );

      // Verify session was invalidated with the right ObjectId type
      expect(mockUpdateOne).toHaveBeenCalledWith(
        expect.objectContaining({
          token: "valid-token",
        }),
        { $set: { invalidated: true, loggedOutAt: expect.any(Date) } }
      );
    });

    it("should handle missing user ID", async () => {
      // Create an event with auth header but no user ID
      const invalidEvent = {
        headers: {
          Authorization: "Bearer valid-token",
        },
        user: {}, // User object but no ID
      } as any;

      const response = await logoutHandler(invalidEvent as any);

      expect(response.statusCode).toBe(401);
      expect(JSON.parse(response.body).success).toBe(false);
      expect(JSON.parse(response.body).error).toBe(
        "User ID not found in token"
      );
    });

    it("should handle missing token", async () => {
      // Create an event with no auth header but with user ID
      const invalidEvent = {
        headers: {},
        user: {
          id: "user-123",
          username: "testuser",
          email: "test@example.com",
        },
      } as any;

      const response = await logoutHandler(invalidEvent as any);

      expect(response.statusCode).toBe(401);
      expect(JSON.parse(response.body).success).toBe(false);
      expect(JSON.parse(response.body).error).toBe(
        "Authorization token not found"
      );
    });
  });
});
