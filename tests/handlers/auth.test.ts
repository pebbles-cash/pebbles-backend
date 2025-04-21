import { APIGatewayProxyEvent, Context } from "aws-lambda";
import jwt from "jsonwebtoken";
import axios from "axios";
import mongoose from "mongoose";
import { authenticate, verifyToken, logout } from "../../src/handlers/auth";
import { connectToDatabase } from "../../src/services/mongoose";
import { User } from "../../src/models";
import jwksClient from "jwks-rsa";

// Mock dependencies
jest.mock("../../src/services/mongoose");
jest.mock("mongoose", () => {
  const original = jest.requireActual("mongoose");
  return {
    ...original,
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

// Mock jwks-rsa client
const mockJwksClient = {
  getSigningKey: jest.fn().mockResolvedValue({
    getPublicKey: jest.fn().mockReturnValue("mock-public-key"),
  }),
};
(jwksClient as unknown as jest.Mock).mockReturnValue(mockJwksClient);

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
    const mockUser = {
      _id: "user-123",
      email: "test@example.com",
      username: "testuser",
      displayName: "Test User",
      save: jest.fn().mockResolvedValue(true),
    };
    const mockEvent = {
      body: JSON.stringify({ dynamicToken: mockDynamicToken }),
    } as unknown as APIGatewayProxyEvent;

    it("should authenticate a user with valid Dynamic token - existing user", async () => {
      // Mock JWT verification
      (jwt.decode as jest.Mock).mockReturnValue({
        header: { kid: "test-key-id" },
        payload: mockDecodedToken,
      });
      (jwt.verify as jest.Mock).mockReturnValue(mockDecodedToken);
      (jwt.sign as jest.Mock).mockReturnValue("new-session-token");

      // Mock user exists
      (User.findOne as jest.Mock).mockResolvedValue(mockUser);

      const response = await authenticate(mockEvent);

      // Check response
      expect(response.statusCode).toBe(200);
      expect(JSON.parse(response.body).success).toBe(true);
      expect(JSON.parse(response.body).data.token).toBe("new-session-token");
      expect(JSON.parse(response.body).data.user.id).toBe("user-123");

      // Verify function calls
      expect(connectToDatabase).toHaveBeenCalled();
      expect(jwt.decode).toHaveBeenCalledWith(mockDynamicToken, {
        complete: true,
      });
      expect(mockJwksClient.getSigningKey).toHaveBeenCalledWith("test-key-id");
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
    });

    it("should authenticate a user with valid Dynamic token - new user", async () => {
      // Mock JWT verification
      (jwt.decode as jest.Mock).mockReturnValue({
        header: { kid: "test-key-id" },
        payload: mockDecodedToken,
      });
      (jwt.verify as jest.Mock).mockReturnValue(mockDecodedToken);
      (jwt.sign as jest.Mock).mockReturnValue("new-session-token");

      // Mock user doesn't exist, then created
      (User.findOne as jest.Mock)
        .mockResolvedValueOnce(null) // First call returns null (user not found)
        .mockResolvedValueOnce(null); // Second call for username check

      // Mock user creation
      const mockNewUser = {
        ...mockUser,
        _id: "new-user-123",
      };
      // Mock User.findOne to return a properly structured mongoose Query that resolves to null
      jest.spyOn(User, "findOne").mockReturnValue({
        exec: jest.fn().mockResolvedValue(null),
        clone: jest.fn().mockReturnThis(),
        lean: jest.fn().mockReturnThis(),
      } as any);
      const UserMock = User as any;
      UserMock.prototype = Object.create(mongoose.Model.prototype);
      UserMock.prototype.save = jest.fn().mockResolvedValue(true);
      UserMock.mockImplementation(() => ({
        ...mockNewUser,
        save: UserMock.prototype.save,
      }));

      const response = await authenticate(mockEvent);

      // Check correct user creation fields
      expect(UserMock).toHaveBeenCalledWith(
        expect.objectContaining({
          email: "test@example.com",
          dynamicUserId: "dynamic-user-123",
        })
      );
    });

    it("should return error with missing token", async () => {
      const invalidEvent = {
        body: JSON.stringify({}),
      } as unknown as APIGatewayProxyEvent;

      const response = await authenticate(invalidEvent);

      expect(response.statusCode).toBe(400);
      expect(JSON.parse(response.body).success).toBe(false);
      expect(JSON.parse(response.body).error).toBe("Dynamic token is required");
    });

    it("should handle invalid token structure", async () => {
      // Mock JWT decode to return invalid structure
      (jwt.decode as jest.Mock).mockReturnValue(null);

      const response = await authenticate(mockEvent);

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

    const mockEvent = {
      headers: {
        Authorization: "Bearer valid-token",
      },
      user: {
        id: "user-123",
      },
    } as unknown as any;

    it("should logout a user successfully", async () => {
      // Mock necessary functions
      const mockUpdateOne = jest.fn().mockResolvedValue({ modifiedCount: 1 });
      (mongoose.connection.db.collection as jest.Mock).mockReturnValue({
        updateOne: mockUpdateOne,
      });

      const response = await logout(mockEvent, mockContext);

      expect(response.statusCode).toBe(200);
      expect(JSON.parse(response.body).success).toBe(true);
      expect(JSON.parse(response.body).data.message).toBe(
        "Logged out successfully"
      );

      // Verify session was invalidated
      expect(mockUpdateOne).toHaveBeenCalledWith(
        {
          userId: new mongoose.Types.ObjectId("user-123"),
          token: "valid-token",
        },
        { $set: { invalidated: true, loggedOutAt: expect.any(Date) } }
      );
    });

    it("should handle missing user ID", async () => {
      const invalidEvent = {
        headers: {
          Authorization: "Bearer valid-token",
        },
        user: {},
      } as unknown as any;

      const response = await logout(invalidEvent, mockContext);

      expect(response.statusCode).toBe(401);
      expect(JSON.parse(response.body).success).toBe(false);
      expect(JSON.parse(response.body).error).toBe(
        "User ID not found in token"
      );
    });

    it("should handle missing token", async () => {
      const invalidEvent = {
        headers: {},
        user: {
          id: "user-123",
        },
      } as unknown as any;

      const response = await logout(invalidEvent, mockContext);

      expect(response.statusCode).toBe(401);
      expect(JSON.parse(response.body).success).toBe(false);
      expect(JSON.parse(response.body).error).toBe(
        "Authorization token not found"
      );
    });
  });
});
