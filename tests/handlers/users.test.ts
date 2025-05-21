import { getUserByUsername, createUser } from "../../src/handlers/users";
import {
  createMockEvent,
  createMockAuthenticatedEvent,
  parseResponseBody,
  createMockContext,
} from "../utils/test-utils";
import mongoose from "mongoose";
import { User } from "../../src/models";
import * as userHandlerModule from "../../src/handlers/users";

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
    countDocuments: jest.fn(),
  },
}));

jest.mock("../../src/utils/response", () => ({
  error: jest.fn().mockImplementation((message, statusCode = 500) => ({
    statusCode,
    body: JSON.stringify({
      success: false,
      error: message,
    }),
  })),
  success: jest.fn().mockImplementation((data, statusCode = 200) => ({
    statusCode,
    body: JSON.stringify({
      success: true,
      data,
    }),
  })),
}));

// Mock the requireAuth middleware
jest.mock("../../src/middleware/auth", () => ({
  requireAuth: (fn: any) => fn,
  optionalAuth: (fn: any) => fn,
}));

jest.mock("../../src/utils/response", () => ({
  success: jest.fn().mockImplementation((data, statusCode = 200) => ({
    statusCode,
    body: JSON.stringify({
      success: true,
      data,
    }),
  })),
  error: jest.fn().mockImplementation((message, statusCode = 500) => ({
    statusCode,
    body: JSON.stringify({
      success: false,
      error: message,
    }),
  })),
}));

describe("User Handler", () => {
  const mockContext = createMockContext();
  beforeEach(() => {
    jest.clearAllMocks();

    (User as any) = Object.assign(
      jest.fn().mockImplementation(() => ({
        _id: new mongoose.Types.ObjectId("60d21b4667d0d8992e610c85"),
        email: "test@example.com",
        username: "testuser",
        dynamicUserId: "f9d3ff12-69c5-4633-ad02-ca69a7d3a3cf",
        primaryWalletAddress: "0x7C9Ed458877BeBBd001Edf7f2Adf87edDb16F257",
        chain: "evm",
        displayName: "Test User",
        avatar: null,
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

  describe("createUser", () => {
    it("should create a new user successfully", async () => {
      // Mock user data for creation request
      const mockUserData = {
        userId: "f9d3ff12-69c5-4633-ad02-ca69a7d3a3cf",
        email: "test@example.com",
        username: "newuser",
        verifiedCredentials: [
          {
            address: "0x7C9Ed458877BeBBd001Edf7f2Adf87edDb16F257",
            chain: "eip155",
          },
        ],
        primaryWallet: {
          address: "0x7C9Ed458877BeBBd001Edf7f2Adf87edDb16F257",
          chain: "EVM",
          id: "4b8c7681-4365-400d-873d-f407c941255d",
        },
      };

      // Mock User.findOne to check for existing user (return null meaning no conflict)
      (User.findOne as jest.Mock).mockResolvedValue(null);

      // Create mock event with user creation data
      const event = createMockEvent(mockUserData);

      // Call the handler
      const response = await createUser(event);

      // Parse the response body
      const body = parseResponseBody(response);

      // Assert
      expect(response.statusCode).toBe(201);
      expect(body.success).toBe(true);
      expect(body.data).toBeDefined(); // Handler returns user data directly

      expect(User.findOne).toHaveBeenCalled();
      const findOneCall = (User.findOne as jest.Mock).mock.calls[0][0];
      expect(findOneCall).toHaveProperty("$or");

      // Check each element individually without depending on order
      const orConditions = findOneCall.$or;
      expect(orConditions).toContainEqual({ email: mockUserData.email });
      expect(orConditions).toContainEqual({
        dynamicUserId: mockUserData.userId,
      });
      expect(orConditions).toContainEqual({
        primaryWalletAddress: mockUserData.primaryWallet.address,
      });

      // Make sure no unexpected conditions are present
      expect(orConditions.length).toBe(3);
    });

    it("should return 400 if required fields are missing", async () => {
      // Create mock event with incomplete data
      const mockIncompleteData = {
        userId: "f9d3ff12-69c5-4633-ad02-ca69a7d3a3cf",
        // Missing email
        verifiedCredentials: [
          {
            address: "0x7C9Ed458877BeBBd001Edf7f2Adf87edDb16F257",
            chain: "eip155",
          },
        ],
        primaryWallet: {
          address: "0x7C9Ed458877BeBBd001Edf7f2Adf87edDb16F257",
          chain: "EVM",
          id: "4b8c7681-4365-400d-873d-f407c941255d",
        },
      };

      const event = createMockEvent(mockIncompleteData);

      // Call the handler
      const response = await createUser(event);

      // Parse the response body
      const body = parseResponseBody(response);

      // Assert
      expect(response.statusCode).toBe(400);
      expect(body.success).toBe(false);
      expect(body.error).toBe("Missing required fields");
    });

    it("should return 409 if user already exists", async () => {
      // Mock user data for creation request
      const mockUserData = {
        userId: "f9d3ff12-69c5-4633-ad02-ca69a7d3a3cf",
        email: "existing@example.com",
        username: "existinguser",
        verifiedCredentials: [
          {
            address: "0x7C9Ed458877BeBBd001Edf7f2Adf87edDb16F257",
            chain: "eip155",
          },
        ],
        primaryWallet: {
          address: "0x7C9Ed458877BeBBd001Edf7f2Adf87edDb16F257",
          chain: "EVM",
          id: "4b8c7681-4365-400d-873d-f407c941255d",
        },
      };

      // Mock existing user
      const mockExistingUser = {
        _id: new mongoose.Types.ObjectId(),
        email: mockUserData.email,
        username: mockUserData.username,
        dynamicUserId: mockUserData.userId,
      };

      // Mock User.findOne to find an existing user
      (User.findOne as jest.Mock).mockResolvedValue(mockExistingUser);

      const event = createMockEvent(mockUserData);

      // Call the handler
      const response = await createUser(event);

      // Parse the response body
      const body = parseResponseBody(response);

      // Assert
      expect(response.statusCode).toBe(409);
      expect(body.success).toBe(false);
      expect(body.error).toBe(
        "User with this email, username, wallet address or Dynamic ID already exists"
      );
    });
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
        primaryWalletAddress: "0x1234567890abcdef",
        chain: "ethereum",
        socialProfiles: [
          {
            platform: "twitter",
            profileId: "twitter-id",
            username: "twitteruser",
            followerCount: 1000,
            lastUpdated: new Date(),
          },
        ],
        preferences: {
          defaultCurrency: "USD",
          defaultLanguage: "en",
          notificationsEnabled: true,
          twoFactorEnabled: false,
          preferredTimeZone: "UTC",
        },
        createdAt: new Date("2023-01-01"),
        updatedAt: new Date("2023-01-01"),
      };

      // Mock User.findById to return the mock user
      (User.findById as jest.Mock).mockResolvedValue(mockUser);

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
      expect(body.data).toHaveProperty("_id");
      expect(body.data.username).toBe("testuser");
      expect(body.data.email).toBe("test@example.com");
      expect(body.data.primaryWalletAddress).toBe("0x1234567890abcdef");
      expect(body.data.chain).toBe("ethereum");
      expect(body.data.socialProfiles).toHaveLength(1);
      expect(body.data.preferences).toHaveProperty("defaultCurrency", "USD");
      expect(body.data.preferences).toHaveProperty("defaultLanguage", "en");

      // Verify User.findById was called correctly
      expect(User.findById).toHaveBeenCalledWith(mockUser._id.toString());
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
        avatar: "https://example.com/new-avatar.jpg",
        primaryWalletAddress: "0x1234567890abcdef",
        chain: "ethereum",
        preferences: {
          defaultCurrency: "EUR",
          defaultLanguage: "fr",
          notificationsEnabled: true,
          twoFactorEnabled: false,
          preferredTimeZone: "Europe/Paris",
        },
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
          avatar: "https://example.com/new-avatar.jpg",
          preferences: {
            defaultCurrency: "EUR",
            defaultLanguage: "fr",
            preferredTimeZone: "Europe/Paris",
          },
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
      expect(body.data).toHaveProperty("_id");
      expect(body.data.username).toBe("newusername");
      expect(body.data.displayName).toBe("New Display Name");
      expect(body.data.avatar).toBe("https://example.com/new-avatar.jpg");
      expect(body.data.preferences.defaultCurrency).toBe("EUR");
      expect(body.data.preferences.defaultLanguage).toBe("fr");

      // Verify findByIdAndUpdate was called with correct parameters
      expect(User.findByIdAndUpdate).toHaveBeenCalledWith(
        mockUserId.toString(),
        {
          $set: expect.objectContaining({
            username: "newusername",
            displayName: "New Display Name",
            avatar: "https://example.com/new-avatar.jpg",
            updatedAt: expect.any(Date),
          }),
        }
      );
    });

    it("should update wallet information when provided", async () => {
      // Mock user data
      const mockUserId = new mongoose.Types.ObjectId(
        "60d21b4667d0d8992e610c85"
      );
      const mockUpdatedUser = {
        _id: mockUserId,
        username: "testuser",
        email: "test@example.com",
        primaryWalletAddress: "0x9876543210abcdef", // Updated wallet
        chain: "polygon", // Updated chain
        updatedAt: new Date(),
      };

      // Mock User.findByIdAndUpdate
      (User.findByIdAndUpdate as jest.Mock).mockResolvedValue({
        modifiedCount: 1,
      });

      // Mock User.findById to return the updated user
      (User.findById as jest.Mock).mockResolvedValue(mockUpdatedUser);

      // Mock User.findOne to check for wallet uniqueness (return null for no conflict)
      (User.findOne as jest.Mock).mockResolvedValue(null);

      // Create mock authenticated event with update data
      const event = createMockAuthenticatedEvent(
        mockUserId.toString(),
        "testuser",
        "test@example.com",
        {
          primaryWallet: {
            address: "0x9876543210abcdef",
            chain: "POLYGON",
          },
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
      expect(body.data.primaryWalletAddress).toBe("0x9876543210abcdef");
      expect(body.data.chain).toBe("polygon");

      // Verify findByIdAndUpdate was called with correct parameters
      expect(User.findByIdAndUpdate).toHaveBeenCalledWith(
        mockUserId.toString(),
        {
          $set: expect.objectContaining({
            primaryWalletAddress: "0x9876543210abcdef",
            chain: "polygon",
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

    it("should return 409 if wallet address is already associated with another user", async () => {
      // Mock existing user with the wallet address
      const existingUser = {
        _id: new mongoose.Types.ObjectId("60d21b4667d0d8992e610c86"), // Different ID
        primaryWalletAddress: "0xalreadyused",
      };

      // Mock User.findOne to find a user with the same wallet address
      (User.findOne as jest.Mock).mockImplementation((query) => {
        if (query.username) {
          return null; // No username conflict
        } else if (query.primaryWalletAddress) {
          return existingUser; // Wallet address conflict
        }
        return null;
      });

      // Create mock authenticated event with update data
      const event = createMockAuthenticatedEvent(
        "60d21b4667d0d8992e610c85", // Different from existing user
        "testuser",
        "test@example.com",
        {
          primaryWallet: {
            address: "0xalreadyused",
            chain: "ETH",
          },
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
      expect(body.error).toBe(
        "Wallet address is already associated with another account"
      );

      // Verify findByIdAndUpdate was not called
      expect(User.findByIdAndUpdate).not.toHaveBeenCalled();
    });
  });
});
