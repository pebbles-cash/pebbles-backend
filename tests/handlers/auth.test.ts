import { APIGatewayProxyEvent, Context } from "aws-lambda";
import jwt from "jsonwebtoken";
import mongoose from "mongoose";
import {
  callback,
  verifyToken,
  logout,
  logoutHandler,
} from "../../src/handlers/auth";
import { connectToDatabase } from "../../src/services/mongoose";
import { User } from "../../src/models";
import jwksClient from "jwks-rsa";

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
  });

  describe("authenticate", () => {
    const mockDynamicToken = "mock-dynamic-token";
    const mockDecodedToken = {
      sub: "dynamic-user-123",
      email: "test@example.com",
      name: "Test User",
    };

    // Create mock event
    const mockEvent = {
      body: JSON.stringify({ dynamicToken: mockDynamicToken }),
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

      // Mock user exists
      const mockUser = {
        _id: "user-123",
        email: "test@example.com",
        username: "testuser",
        displayName: "Test User",
        save: jest.fn().mockResolvedValue(true),
      };
      (User.findOne as jest.Mock).mockResolvedValue(mockUser);

      const response = await callback(mockEvent);

      // Check response
      expect(response.statusCode).toBe(200);
      expect(JSON.parse(response.body).success).toBe(true);
      expect(JSON.parse(response.body).data.token).toBe("new-session-token");

      // Verify function calls
      expect(connectToDatabase).toHaveBeenCalled();
      expect(jwt.decode).toHaveBeenCalledWith(mockDynamicToken, {
        complete: true,
      });
      // The mock is now in the closure of jest.mock, so we can't directly access it
      // We can verify other aspects of the flow instead
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
      // Mock JWT decode and verify same as above
      (jwt.decode as jest.Mock).mockReturnValue({
        header: { kid: "test-key-id" },
        payload: mockDecodedToken,
      });
      (jwt.verify as jest.Mock).mockReturnValue(mockDecodedToken);
      (jwt.sign as jest.Mock).mockReturnValue("new-session-token");

      // Mock user doesn't exist, then username check
      (User.findOne as jest.Mock)
        .mockResolvedValueOnce(null) // First call returns null (user not found)
        .mockResolvedValueOnce(null); // Second call for username check returns null

      // Create a mock User instance that will be returned by the constructor
      const mockUserInstance = {
        _id: "new-user-123",
        email: "test@example.com",
        username: "testuser",
        displayName: "Test User",
        dynamicUserId: "dynamic-user-123",
        save: jest.fn().mockResolvedValue(true),
      };

      // Replace the User model with our mock
      const originalUser = User;
      (User as any) = function () {
        return mockUserInstance;
      };
      (User as any).findOne = originalUser.findOne;
      (User as any).findById = originalUser.findById;

      const response = await callback(mockEvent);

      // Check response
      expect(response.statusCode).toBe(200);
      expect(JSON.parse(response.body).success).toBe(true);
      // Verify user data is returned
      expect(JSON.parse(response.body).data.user).toBeDefined();

      // Restore console.warn
      console.warn = originalWarn;
    });

    it("should return error with missing token", async () => {
      const invalidEvent = {
        body: JSON.stringify({}),
      } as unknown as APIGatewayProxyEvent;

      const response = await callback(invalidEvent);

      expect(response.statusCode).toBe(400);
      expect(JSON.parse(response.body).success).toBe(false);
      expect(JSON.parse(response.body).error).toBe("Dynamic token is required");
    });

    it("should handle invalid token structure", async () => {
      // Mock JWT decode to return something that will trigger the Invalid token structure error
      (jwt.decode as jest.Mock).mockReturnValue(null);

      // Mock console.error to prevent error logs in test output
      const originalError = console.error;
      console.error = jest.fn();

      const response = await callback(mockEvent);

      // Restore console.error
      console.error = originalError;

      expect(response.statusCode).toBe(500);
      expect(JSON.parse(response.body).success).toBe(false);
      expect(JSON.parse(response.body).error).toBe("Authentication failed");
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

      // Create authenticated event
      const authenticatedEvent = {
        headers: {
          Authorization: "Bearer valid-token",
        },
        user: {
          id: "user-123",
          username: "testuser",
          email: "test@example.com",
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
