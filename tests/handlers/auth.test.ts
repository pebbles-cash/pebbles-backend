import { login, callback } from "../../src/handlers/auth";
import { createMockEvent, parseResponseBody } from "../utils/test-utils";
import axios from "axios";
import jwt from "jsonwebtoken";
import mongoose from "mongoose";
import { User } from "../../src/models";

// Mock dependencies
jest.mock("axios");
jest.mock("jsonwebtoken");
jest.mock("mongoose", () => {
  const actualMongoose = jest.requireActual("mongoose");
  return {
    ...actualMongoose,
    connect: jest.fn().mockResolvedValue({
      connection: {
        readyState: 1,
      },
    }),
    connection: {
      db: {
        collection: jest.fn().mockReturnValue({
          insertOne: jest.fn().mockResolvedValue({}),
          findOne: jest.fn().mockResolvedValue({
            stateToken: "mock-state-token",
            status: "initiated",
          }),
          updateOne: jest.fn().mockResolvedValue({}),
        }),
      },
    },
  };
});

jest.mock("../../src/services/mongoose", () => ({
  connectToDatabase: jest.fn().mockResolvedValue(mongoose.connection),
  closeConnection: jest.fn().mockResolvedValue(undefined),
}));

jest.mock("../../src/models", () => ({
  User: {
    findOne: jest.fn(),
    findById: jest.fn(),
  },
}));

describe("Auth Handler", () => {
  beforeEach(() => {
    jest.clearAllMocks();

    // Set up environment variables
    process.env.JWT_SECRET = "test-secret";
    process.env.DYNAMIC_API_URL = "https://api.test.dynamic.xyz";
    process.env.DYNAMIC_API_KEY = "test-api-key";
    process.env.AUTH_REDIRECT_URL = "https://test.app/callback";
  });

  describe("login", () => {
    it("should return an auth URL when login is successful", async () => {
      // Mock JWT sign
      (jwt.sign as jest.Mock).mockReturnValue("mock-state-token");

      // Mock axios response
      (axios.post as jest.Mock).mockResolvedValue({
        data: {
          authUrl: "https://test.dynamic.xyz/auth/login/redirect",
        },
      });

      // Create mock event
      const event = createMockEvent({
        loginMethod: "email",
        redirectUrl: "https://app.test/callback",
      });

      // Call the handler
      const response = await login(event);

      // Parse the response body
      const body = parseResponseBody(response);

      // Assert
      expect(response.statusCode).toBe(200);
      expect(body.success).toBe(true);
      expect(body.data).toHaveProperty("authUrl");
      expect(body.data).toHaveProperty("stateToken");
      expect(body.data.stateToken).toBe("mock-state-token");

      // Verify axios was called with correct params
      expect(axios.post).toHaveBeenCalledWith(
        "https://api.test.dynamic.xyz/auth/login",
        {
          apiKey: "test-api-key",
          loginMethod: "email",
          redirectUrl: "https://app.test/callback",
          state: "mock-state-token",
        }
      );

      // Verify JWT sign was called correctly
      expect(jwt.sign).toHaveBeenCalledWith(
        expect.objectContaining({ timestamp: expect.any(Number) }),
        "test-secret",
        { expiresIn: "15m" }
      );
    });

    it("should return an error if login method is missing", async () => {
      // Create mock event with missing loginMethod
      const event = createMockEvent({});

      // Call the handler
      const response = await login(event);

      // Parse the response body
      const body = parseResponseBody(response);

      // Assert
      expect(response.statusCode).toBe(400);
      expect(body.success).toBe(false);
      expect(body.error).toBe("Login method is required");
    });

    it("should handle errors when the API call fails", async () => {
      // Mock JWT sign
      (jwt.sign as jest.Mock).mockReturnValue("mock-state-token");

      // Mock axios to throw an error
      (axios.post as jest.Mock).mockRejectedValue(new Error("API error"));

      // Create mock event
      const event = createMockEvent({
        loginMethod: "email",
      });

      // Call the handler
      const response = await login(event);

      // Parse the response body
      const body = parseResponseBody(response);

      // Assert
      expect(response.statusCode).toBe(503);
      expect(body.success).toBe(false);
      expect(body.error).toBe("Authentication service unavailable");
    });
  });

  describe("callback", () => {
    it("should create a new user when authenticating for the first time", async () => {
      // Mock JWT verify
      (jwt.verify as jest.Mock).mockReturnValue({ timestamp: Date.now() });

      // Mock JWT sign for session token
      (jwt.sign as jest.Mock).mockReturnValue("mock-session-token");

      // Mock axios response for token request
      (axios.post as jest.Mock).mockResolvedValue({
        data: {
          accessToken: "mock-access-token",
          refreshToken: "mock-refresh-token",
          idToken: "mock-id-token",
          expiresIn: 3600,
        },
      });

      // Mock axios response for user info
      (axios.get as jest.Mock).mockResolvedValue({
        data: {
          id: "dynamic-user-id",
          email: "test@example.com",
          username: "testuser",
          displayName: "Test User",
          avatar: "https://example.com/avatar.jpg",
          walletAddress: "0x1234567890",
          socialAccounts: [
            {
              provider: "twitter",
              id: "twitter-id",
              username: "twitteruser",
            },
          ],
        },
      });

      // Mock User.findOne to return null (no existing user)
      (User.findOne as jest.Mock).mockResolvedValue(null);

      // Mock User model save method
      const mockSave = jest.fn().mockResolvedValue(undefined);

      // Mock new User construction
      const mockUserData = {
        _id: new mongoose.Types.ObjectId("60d21b4667d0d8992e610c85"),
        email: "test@example.com",
        username: "testuser",
        displayName: "Test User",
        avatar: "https://example.com/avatar.jpg",
        dynamicUserId: "dynamic-user-id",
        walletAddress: "0x1234567890",
        socialProfiles: [
          {
            platform: "twitter",
            profileId: "twitter-id",
            username: "twitteruser",
            lastUpdated: expect.any(Date),
          },
        ],
        save: mockSave,
      };

      // @ts-expect-error - Constructor mock
      User.mockImplementation(() => mockUserData);

      // Create mock event
      const event = createMockEvent({
        code: "auth-code",
        state: "mock-state-token",
      });

      // Call the handler
      const response = await callback(event);

      // Parse the response body
      const body = parseResponseBody(response);

      // Assert
      expect(response.statusCode).toBe(200);
      expect(body.success).toBe(true);
      expect(body.data).toHaveProperty("user");
      expect(body.data).toHaveProperty("token");
      expect(body.data).toHaveProperty("dynamicTokens");
      expect(body.data.token).toBe("mock-session-token");
      expect(body.data.user).toHaveProperty("id");
      expect(body.data.user.username).toBe("testuser");

      // Verify User model save was called
      expect(mockSave).toHaveBeenCalled();

      // Verify JWT sign was called correctly for session token
      expect(jwt.sign).toHaveBeenCalledWith(
        {
          userId: expect.any(String),
          dynamicId: "dynamic-user-id",
        },
        "test-secret",
        { expiresIn: "7d" }
      );
    });

    it("should return an error if code or state is missing", async () => {
      // Create mock event with missing code and state
      const event = createMockEvent({});

      // Call the handler
      const response = await callback(event);

      // Parse the response body
      const body = parseResponseBody(response);

      // Assert
      expect(response.statusCode).toBe(400);
      expect(body.success).toBe(false);
      expect(body.error).toBe("Invalid callback parameters");
    });

    it("should update an existing user when they authenticate again", async () => {
      // Mock JWT verify
      (jwt.verify as jest.Mock).mockReturnValue({ timestamp: Date.now() });

      // Mock JWT sign for session token
      (jwt.sign as jest.Mock).mockReturnValue("mock-session-token");

      // Mock axios responses
      (axios.post as jest.Mock).mockResolvedValue({
        data: {
          accessToken: "mock-access-token",
          refreshToken: "mock-refresh-token",
          idToken: "mock-id-token",
          expiresIn: 3600,
        },
      });

      (axios.get as jest.Mock).mockResolvedValue({
        data: {
          id: "dynamic-user-id",
          email: "existing@example.com",
          username: "existinguser",
          displayName: "Existing User",
          avatar: "https://example.com/new-avatar.jpg",
          walletAddress: "0xABCDEF1234",
          socialAccounts: [
            {
              provider: "twitter",
              id: "new-twitter-id",
              username: "newTwitterUser",
            },
          ],
        },
      });

      // Mock existing user
      const mockSave = jest.fn().mockResolvedValue(undefined);
      const existingUser = {
        _id: new mongoose.Types.ObjectId("60d21b4667d0d8992e610c86"),
        email: "old@example.com",
        username: "existinguser",
        displayName: "Old Name",
        avatar: "https://example.com/old-avatar.jpg",
        dynamicUserId: "dynamic-user-id",
        walletAddress: "0xOLDWALLET",
        socialProfiles: [],
        save: mockSave,
      };

      // Mock User.findOne to return an existing user
      (User.findOne as jest.Mock).mockResolvedValue(existingUser);

      // Create mock event
      const event = createMockEvent({
        code: "auth-code",
        state: "mock-state-token",
      });

      // Call the handler
      const response = await callback(event);

      // Parse the response body
      const body = parseResponseBody(response);

      // Assert
      expect(response.statusCode).toBe(200);
      expect(body.success).toBe(true);
      expect(body.data.user.id).toEqual(existingUser._id);

      // Verify user was updated
      expect(existingUser.email).toBe("existing@example.com");
      expect(existingUser.displayName).toBe("Existing User");
      expect(existingUser.avatar).toBe("https://example.com/new-avatar.jpg");
      expect(existingUser.walletAddress).toBe("0xABCDEF1234");
      expect(existingUser.socialProfiles.length).toBe(1);

      // Verify save was called
      expect(mockSave).toHaveBeenCalled();
    });
  });
});
