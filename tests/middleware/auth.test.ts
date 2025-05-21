import jwt from "jsonwebtoken";
import mongoose from "mongoose";
import { requireAuth, optionalAuth } from "../../src/middleware/auth";
import { connectToDatabase } from "../../src/services/mongoose";
import { User } from "../../src/models";
import { APIGatewayProxyEvent, Context } from "aws-lambda";
import { IUserPreferences } from "../../src/types";

// Mock dependencies
jest.mock("../../src/services/mongoose");
jest.mock("mongoose", () => {
  const original = jest.requireActual("mongoose");
  return {
    ...original,
    connection: {
      db: {
        collection: jest.fn().mockReturnValue({
          findOne: jest.fn(),
          updateOne: jest.fn().mockResolvedValue({ modifiedCount: 1 }),
        }),
      },
    },
  };
});
jest.mock("../../src/models", () => ({
  User: {
    findById: jest.fn(),
  },
}));
jest.mock("jsonwebtoken");

describe("Auth Middleware", () => {
  // Test data
  const mockToken = "valid-jwt-token";
  const mockDecodedToken = { userId: "user-123", dynamicId: "dynamic-456" };

  // Updated mock user to match new model
  const mockUser = {
    _id: "user-123",
    username: "testuser",
    email: "test@example.com",
    displayName: "Test User",
    primaryWalletAddress: "0x123456789",
    chain: "ethereum",
    preferences: {
      defaultCurrency: "USD",
      defaultLanguage: "en",
      notificationsEnabled: true,
      twoFactorEnabled: false,
      preferredTimeZone: "UTC",
    } as IUserPreferences,
  };

  const mockContext = {} as Context;

  // Create mock events
  const createMockEvent = (includeToken = true): APIGatewayProxyEvent => ({
    headers: includeToken ? { Authorization: `Bearer ${mockToken}` } : {},
    pathParameters: null,
    queryStringParameters: null,
    body: null,
    httpMethod: "GET",
    isBase64Encoded: false,
    path: "/test",
    multiValueHeaders: {},
    multiValueQueryStringParameters: null,
    stageVariables: null,
    requestContext: {} as any,
    resource: "",
  });

  // Create mock handler
  const mockHandler = jest.fn().mockResolvedValue({
    statusCode: 200,
    body: JSON.stringify({
      success: true,
      data: { message: "Handler executed" },
    }),
    headers: { "Content-Type": "application/json" },
  });

  beforeEach(() => {
    jest.clearAllMocks();
    process.env.JWT_SECRET = "test-secret";

    // Set up default mocks
    (jwt.verify as jest.Mock).mockReturnValue(mockDecodedToken);
    (User.findById as jest.Mock).mockResolvedValue(mockUser);
    (
      mongoose.connection.db.collection("userSessions").findOne as jest.Mock
    ).mockResolvedValue(null);
  });

  describe("requireAuth", () => {
    it("should authenticate valid token and add user to event", async () => {
      const wrappedHandler = requireAuth(mockHandler);
      const mockEvent = createMockEvent();

      await wrappedHandler(mockEvent, mockContext);

      // Verify token was verified
      expect(connectToDatabase).toHaveBeenCalled();
      expect(jwt.verify).toHaveBeenCalledWith(mockToken, "test-secret");
      expect(User.findById).toHaveBeenCalledWith("user-123");

      // Verify user was added to event and handler was called with updated user fields
      expect(mockHandler).toHaveBeenCalledWith(
        expect.objectContaining({
          user: {
            id: "user-123",
            username: "testuser",
            email: "test@example.com",
            displayName: "Test User",
            primaryWalletAddress: "0x123456789",
            chain: "ethereum",
            preferences: {
              defaultCurrency: "USD",
              defaultLanguage: "en",
              notificationsEnabled: true,
              twoFactorEnabled: false,
              preferredTimeZone: "UTC",
            },
          },
        }),
        mockContext
      );

      // Verify session activity was updated
      expect(mongoose.connection.db.collection).toHaveBeenCalledWith(
        "userSessions"
      );
      expect(
        mongoose.connection.db.collection("userSessions").updateOne
      ).toHaveBeenCalledWith(
        { token: mockToken },
        { $set: { lastActivity: expect.any(Date) } }
      );
    });

    it("should reject request with missing token", async () => {
      const wrappedHandler = requireAuth(mockHandler);
      const mockEvent = createMockEvent(false);

      const response = await wrappedHandler(mockEvent, mockContext);

      expect(response.statusCode).toBe(401);
      expect(JSON.parse(response.body).error).toBe(
        "Middleware: Authorization required"
      );
      expect(mockHandler).not.toHaveBeenCalled();
    });

    it("should reject request with invalid token", async () => {
      const wrappedHandler = requireAuth(mockHandler);
      const mockEvent = createMockEvent();

      // Mock token verification failure
      (jwt.verify as jest.Mock).mockImplementation(() => {
        throw new Error("Invalid token");
      });

      const response = await wrappedHandler(mockEvent, mockContext);

      expect(response.statusCode).toBe(401);
      expect(JSON.parse(response.body).error).toBe(
        "Middleware: Invalid or expired token"
      );
      expect(mockHandler).not.toHaveBeenCalled();
    });

    it("should reject request with invalidated token (logged out)", async () => {
      const wrappedHandler = requireAuth(mockHandler);
      const mockEvent = createMockEvent();

      // Mock finding an invalidated session
      (
        mongoose.connection.db.collection("userSessions").findOne as jest.Mock
      ).mockResolvedValue({
        token: mockToken,
        invalidated: true,
        loggedOutAt: new Date(),
      });

      const response = await wrappedHandler(mockEvent, mockContext);

      expect(response.statusCode).toBe(401);
      expect(JSON.parse(response.body).error).toBe(
        "Session has been invalidated"
      );
      expect(mockHandler).not.toHaveBeenCalled();
    });

    it("should reject request when user not found", async () => {
      const wrappedHandler = requireAuth(mockHandler);
      const mockEvent = createMockEvent();

      // Mock user not found
      (User.findById as jest.Mock).mockResolvedValue(null);

      const response = await wrappedHandler(mockEvent, mockContext);

      expect(response.statusCode).toBe(404);
      expect(JSON.parse(response.body).error).toBe("User not found");
      expect(mockHandler).not.toHaveBeenCalled();
    });

    it("should handle JWT_SECRET not defined", async () => {
      const wrappedHandler = requireAuth(mockHandler);
      const mockEvent = createMockEvent();

      // Remove JWT_SECRET
      delete process.env.JWT_SECRET;

      const response = await wrappedHandler(mockEvent, mockContext);

      expect(response.statusCode).toBe(401);
      expect(JSON.parse(response.body).error).toBe(
        "Middleware: Invalid or expired token"
      );
      expect(mockHandler).not.toHaveBeenCalled();
    });
  });

  describe("optionalAuth", () => {
    it("should add user to event when valid token provided", async () => {
      const wrappedHandler = optionalAuth(mockHandler);
      const mockEvent = createMockEvent();

      await wrappedHandler(mockEvent, mockContext);

      // Verify token was verified
      expect(jwt.verify).toHaveBeenCalledWith(mockToken, "test-secret");
      expect(User.findById).toHaveBeenCalledWith("user-123");

      // Verify user was added to event and handler was called with updated user fields
      expect(mockHandler).toHaveBeenCalledWith(
        expect.objectContaining({
          user: {
            id: "user-123",
            username: "testuser",
            email: "test@example.com",
            displayName: "Test User",
            primaryWalletAddress: "0x123456789",
            chain: "ethereum",
            preferences: {
              defaultCurrency: "USD",
              defaultLanguage: "en",
              notificationsEnabled: true,
              twoFactorEnabled: false,
              preferredTimeZone: "UTC",
            },
          },
        }),
        mockContext
      );
    });

    it("should still call handler when token is missing", async () => {
      const wrappedHandler = optionalAuth(mockHandler);
      const mockEvent = createMockEvent(false);

      await wrappedHandler(mockEvent, mockContext);

      // Verify handler was called without user data
      expect(mockHandler).toHaveBeenCalledWith(
        expect.not.objectContaining({ user: expect.anything() }),
        mockContext
      );
    });

    it("should still call handler with invalidated token", async () => {
      const wrappedHandler = optionalAuth(mockHandler);
      const mockEvent = createMockEvent();

      // Mock finding an invalidated session
      (
        mongoose.connection.db.collection("userSessions").findOne as jest.Mock
      ).mockResolvedValue({
        token: mockToken,
        invalidated: true,
        loggedOutAt: new Date(),
      });

      await wrappedHandler(mockEvent, mockContext);

      // Verify handler was called without user data
      expect(mockHandler).toHaveBeenCalled();
      expect(mockHandler).toHaveBeenCalledWith(
        expect.not.objectContaining({ user: expect.anything() }),
        mockContext
      );
    });

    it("should still call handler with invalid token", async () => {
      const wrappedHandler = optionalAuth(mockHandler);
      const mockEvent = createMockEvent();

      // Mock token verification failure
      (jwt.verify as jest.Mock).mockImplementation(() => {
        throw new Error("Invalid token");
      });

      await wrappedHandler(mockEvent, mockContext);

      // Verify handler was called without user data
      expect(mockHandler).toHaveBeenCalled();
      expect(mockHandler).toHaveBeenCalledWith(
        expect.not.objectContaining({ user: expect.anything() }),
        mockContext
      );
    });
  });
});
