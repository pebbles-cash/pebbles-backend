import mongoose from "mongoose";
import {
  createMockAuthenticatedEvent,
  parseResponseBody,
  createMockContext,
} from "../utils/test-utils";
import { User, Wallet } from "../../src/models";

// Mock dependencies
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
  },
  Wallet: {
    find: jest.fn(),
    findOne: jest.fn(),
    countDocuments: jest.fn(),
  },
}));

// Import the handlers directly - we're mocking the middleware separately
import * as walletsHandlerModule from "../../src/handlers/wallets";

// Mock the requireAuth middleware
jest.mock("../../src/middleware/auth", () => ({
  requireAuth: (fn: any) => fn,
}));

describe("Wallets Handler", () => {
  // Create a mock context that can be reused in all tests
  const mockContext = createMockContext();

  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe("getUserWallets", () => {
    it("should return a list of user wallets", async () => {
      // Mock user ID
      const userId = new mongoose.Types.ObjectId("60d21b4667d0d8992e610c85");

      // Mock wallet data
      const mockWallets = [
        {
          _id: new mongoose.Types.ObjectId("60d21b4667d0d8992e610c86"),
          userId: userId,
          address: "0x1234567890abcdef",
          type: "eoa",
          chain: "ethereum",
          isDefault: true,
          createdAt: new Date("2023-01-01"),
        },
        {
          _id: new mongoose.Types.ObjectId("60d21b4667d0d8992e610c87"),
          userId: userId,
          address: "0xabcdef1234567890",
          type: "eip7702",
          chain: "polygon",
          isDefault: false,
          createdAt: new Date("2023-01-02"),
        },
      ];

      // Mock Wallet.find to return the mock wallets
      (Wallet.find as jest.Mock).mockResolvedValue(mockWallets);

      // Create mock authenticated event
      const event = createMockAuthenticatedEvent(
        userId.toString(),
        "testuser",
        "test@example.com"
      );

      // Call the handler directly (bypassing middleware)
      const response = await walletsHandlerModule.getUserWallets(
        event,
        mockContext
      );

      // Parse the response body
      const body = parseResponseBody(response);

      // Assert
      expect(response.statusCode).toBe(200);
      expect(body.success).toBe(true);
      expect(body.data).toHaveProperty("wallets");
      expect(body.data.wallets).toHaveLength(2);
      expect(body.data.wallets[0]).toHaveProperty(
        "id",
        mockWallets[0]._id.toString()
      );
      expect(body.data.wallets[0]).toHaveProperty(
        "address",
        "0x1234567890abcdef"
      );
      expect(body.data.wallets[0]).toHaveProperty("type", "eoa");
      expect(body.data.wallets[0]).toHaveProperty("chain", "ethereum");
      expect(body.data.wallets[0]).toHaveProperty("isDefault", true);
      expect(body.data.wallets[1]).toHaveProperty(
        "address",
        "0xabcdef1234567890"
      );
      expect(body.data.wallets[1]).toHaveProperty("type", "eip7702");

      // Verify Wallet.find was called correctly
      expect(Wallet.find).toHaveBeenCalledWith({ userId: userId.toString() });
    });

    it("should return 401 if user ID is not in the token", async () => {
      // Create mock authenticated event without user ID
      const event = createMockAuthenticatedEvent(
        "testuser-id",
        "testuser",
        "test@example.com"
      );

      // Remove the ID to simulate this error case
      event.user!.id = undefined as any;

      // Call the handler directly
      const response = await walletsHandlerModule.getUserWallets(
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

    it("should handle database errors", async () => {
      // Mock Wallet.find to throw an error
      (Wallet.find as jest.Mock).mockRejectedValue(new Error("Database error"));

      // Create mock authenticated event
      const event = createMockAuthenticatedEvent(
        "testuser-id",
        "testuser",
        "test@example.com"
      );

      // Call the handler directly
      const response = await walletsHandlerModule.getUserWallets(
        event,
        mockContext
      );

      // Parse the response body
      const body = parseResponseBody(response);

      // Assert
      expect(response.statusCode).toBe(500);
      expect(body.success).toBe(false);
      expect(body.error).toBe("Could not retrieve wallets");
    });
  });

  describe("getWalletDetails", () => {
    it("should return detailed wallet information", async () => {
      // Mock user and wallet IDs
      const userId = new mongoose.Types.ObjectId("60d21b4667d0d8992e610c85");
      const walletId = new mongoose.Types.ObjectId("60d21b4667d0d8992e610c86");

      // Mock balance data
      const mockBalances = new Map();
      mockBalances.set("0x0", {
        amount: "1000000000000000000", // 1 ETH in wei
        lastUpdated: new Date(),
      });
      mockBalances.set("0xTokenAddress123", {
        amount: "500000000000000000000", // 500 tokens
        lastUpdated: new Date(),
      });

      // Mock wallet data
      const mockWallet = {
        _id: walletId,
        userId: userId,
        address: "0x1234567890abcdef",
        type: "eoa",
        chain: "ethereum",
        isDefault: true,
        balance: mockBalances,
        createdAt: new Date("2023-01-01"),
        updatedAt: new Date("2023-01-15"),
      };

      // Mock Wallet.findOne to return the mock wallet
      (Wallet.findOne as jest.Mock).mockResolvedValue(mockWallet);

      // Create mock authenticated event
      const event = createMockAuthenticatedEvent(
        userId.toString(),
        "testuser",
        "test@example.com",
        null,
        { walletId: walletId.toString() }
      );

      // Call the handler directly (bypassing middleware)
      const response = await walletsHandlerModule.getWalletDetails(
        event,
        mockContext
      );

      // Parse the response body
      const body = parseResponseBody(response);

      // Assert
      expect(response.statusCode).toBe(200);
      expect(body.success).toBe(true);
      expect(body.data).toHaveProperty("id", walletId.toString());
      expect(body.data).toHaveProperty("address", "0x1234567890abcdef");
      expect(body.data).toHaveProperty("type", "eoa");
      expect(body.data).toHaveProperty("chain", "ethereum");
      expect(body.data).toHaveProperty("isDefault", true);
      expect(body.data).toHaveProperty("balances");
      expect(body.data.balances).toHaveLength(2);

      // Check balances
      const nativeTokenBalance = body.data.balances.find(
        (b: any) => b.tokenAddress === "0x0"
      );
      const erc20TokenBalance = body.data.balances.find(
        (b: any) => b.tokenAddress === "0xTokenAddress123"
      );

      expect(nativeTokenBalance).toBeDefined();
      expect(nativeTokenBalance.amount).toBe("1000000000000000000");
      expect(erc20TokenBalance).toBeDefined();
      expect(erc20TokenBalance.amount).toBe("500000000000000000000");

      // Verify Wallet.findOne was called correctly
      expect(Wallet.findOne).toHaveBeenCalledWith({
        _id: walletId.toString(),
        userId: userId.toString(),
      });
    });

    it("should return 401 if user ID is not in the token", async () => {
      // Create mock authenticated event without user ID
      const event = createMockAuthenticatedEvent(
        "testuser-id",
        "testuser",
        "test@example.com",
        null,
        { walletId: "wallet-id-123" }
      );

      // Remove the ID to simulate this error case
      event.user!.id = undefined as any;

      // Call the handler directly
      const response = await walletsHandlerModule.getWalletDetails(
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

    it("should return 400 if wallet ID parameter is missing", async () => {
      // Create mock authenticated event without wallet ID
      const event = createMockAuthenticatedEvent(
        "testuser-id",
        "testuser",
        "test@example.com"
      );

      // Call the handler directly
      const response = await walletsHandlerModule.getWalletDetails(
        event,
        mockContext
      );

      // Parse the response body
      const body = parseResponseBody(response);

      // Assert
      expect(response.statusCode).toBe(400);
      expect(body.success).toBe(false);
      expect(body.error).toBe("Wallet ID parameter is required");
    });

    it("should return 404 if the wallet is not found", async () => {
      // Mock user and wallet IDs
      const userId = new mongoose.Types.ObjectId("60d21b4667d0d8992e610c85");
      const walletId = new mongoose.Types.ObjectId("60d21b4667d0d8992e610c86");

      // Mock Wallet.findOne to return null (no wallet found)
      (Wallet.findOne as jest.Mock).mockResolvedValue(null);

      // Create mock authenticated event
      const event = createMockAuthenticatedEvent(
        userId.toString(),
        "testuser",
        "test@example.com",
        null,
        { walletId: walletId.toString() }
      );

      // Call the handler directly (bypassing middleware)
      const response = await walletsHandlerModule.getWalletDetails(
        event,
        mockContext
      );

      // Parse the response body
      const body = parseResponseBody(response);

      // Assert
      expect(response.statusCode).toBe(404);
      expect(body.success).toBe(false);
      expect(body.error).toBe("Wallet not found");
    });

    it("should handle database errors", async () => {
      // Mock Wallet.findOne to throw an error
      (Wallet.findOne as jest.Mock).mockRejectedValue(
        new Error("Database error")
      );

      // Create mock authenticated event
      const event = createMockAuthenticatedEvent(
        "testuser-id",
        "testuser",
        "test@example.com",
        null,
        { walletId: "wallet-id-123" }
      );

      // Call the handler directly
      const response = await walletsHandlerModule.getWalletDetails(
        event,
        mockContext
      );

      // Parse the response body
      const body = parseResponseBody(response);

      // Assert
      expect(response.statusCode).toBe(500);
      expect(body.success).toBe(false);
      expect(body.error).toBe("Could not retrieve wallet details");
    });
  });

  describe("getWalletBalance", () => {
    it("should return wallet balance", async () => {
      // Mock user and wallet IDs
      const userId = new mongoose.Types.ObjectId("60d21b4667d0d8992e610c85");
      const walletId = new mongoose.Types.ObjectId("60d21b4667d0d8992e610c86");

      // Mock wallet with balance and save method
      const mockBalances = new Map();
      mockBalances.set("0x0", {
        amount: "1000000000000000000", // 1 ETH in wei
        lastUpdated: new Date(),
      });

      const mockWallet = {
        _id: walletId,
        userId: userId,
        address: "0x1234567890abcdef",
        chain: "ethereum",
        balance: mockBalances,
        save: jest.fn().mockResolvedValue(true),
      };

      // Mock Wallet.findOne to return the mock wallet
      (Wallet.findOne as jest.Mock).mockResolvedValue(mockWallet);

      // Create mock authenticated event
      const event = createMockAuthenticatedEvent(
        userId.toString(),
        "testuser",
        "test@example.com",
        null,
        { walletId: walletId.toString() }
      );

      // Call the handler directly
      const response = await walletsHandlerModule.getWalletBalance(
        event,
        mockContext
      );

      // Parse the response body
      const body = parseResponseBody(response);

      // Assert
      expect(response.statusCode).toBe(200);
      expect(body.success).toBe(true);
      expect(body.data.address).toBe("0x1234567890abcdef");
      expect(body.data.chain).toBe("ethereum");
      expect(body.data.balances).toHaveLength(1);
      expect(body.data.balances[0].tokenAddress).toBe("0x0");
      expect(body.data.balances[0].amount).toBe("1000000000000000000");

      // Verify wallet.save was called
      expect(mockWallet.save).toHaveBeenCalled();

      // Verify Wallet.findOne was called correctly
      expect(Wallet.findOne).toHaveBeenCalledWith({
        _id: walletId.toString(),
        userId: userId.toString(),
      });
    });

    it("should handle blockchain provider error and return cached balance", async () => {
      // Mock user and wallet IDs
      const userId = new mongoose.Types.ObjectId("60d21b4667d0d8992e610c85");
      const walletId = new mongoose.Types.ObjectId("60d21b4667d0d8992e610c86");

      // Mock wallet with balance and save method that throws an error
      const mockBalances = new Map();
      mockBalances.set("0x0", {
        amount: "1000000000000000000", // 1 ETH in wei
        lastUpdated: new Date(),
      });

      const mockWallet = {
        _id: walletId,
        userId: userId,
        address: "0x1234567890abcdef",
        chain: "ethereum",
        balance: mockBalances,
        save: jest.fn().mockImplementation(() => {
          throw new Error("Blockchain provider error");
        }),
      };

      // Mock Wallet.findOne to return the mock wallet
      (Wallet.findOne as jest.Mock).mockResolvedValue(mockWallet);

      // Create mock authenticated event
      const event = createMockAuthenticatedEvent(
        userId.toString(),
        "testuser",
        "test@example.com",
        null,
        { walletId: walletId.toString() }
      );

      // Call the handler directly
      const response = await walletsHandlerModule.getWalletBalance(
        event,
        mockContext
      );

      // Parse the response body
      const body = parseResponseBody(response);

      // Assert
      expect(response.statusCode).toBe(200);
      expect(body.success).toBe(true);
      expect(body.data.address).toBe("0x1234567890abcdef");
      expect(body.data.chain).toBe("ethereum");
      expect(body.data.balances).toHaveLength(1);
      expect(body.data.balances[0].tokenAddress).toBe("0x0");
      expect(body.data.balances[0].amount).toBe("1000000000000000000");
      expect(body.data.warning).toBe(
        "Using cached balance - could not fetch latest from chain"
      );
    });

    it("should return 401 if user ID is not in the token", async () => {
      // Create mock authenticated event without user ID
      const event = createMockAuthenticatedEvent(
        "testuser-id",
        "testuser",
        "test@example.com",
        null,
        { walletId: "wallet-id-123" }
      );

      // Remove the ID to simulate this error case
      event.user!.id = undefined as any;

      // Call the handler directly
      const response = await walletsHandlerModule.getWalletBalance(
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

    it("should return 400 if wallet ID parameter is missing", async () => {
      // Create mock authenticated event without wallet ID
      const event = createMockAuthenticatedEvent(
        "testuser-id",
        "testuser",
        "test@example.com"
      );

      // Call the handler directly
      const response = await walletsHandlerModule.getWalletBalance(
        event,
        mockContext
      );

      // Parse the response body
      const body = parseResponseBody(response);

      // Assert
      expect(response.statusCode).toBe(400);
      expect(body.success).toBe(false);
      expect(body.error).toBe("Wallet ID parameter is required");
    });

    it("should return 404 if wallet is not found", async () => {
      // Mock Wallet.findOne to return null
      (Wallet.findOne as jest.Mock).mockResolvedValue(null);

      // Create mock authenticated event
      const event = createMockAuthenticatedEvent(
        "testuser-id",
        "testuser",
        "test@example.com",
        null,
        { walletId: "wallet-id-123" }
      );

      // Call the handler directly
      const response = await walletsHandlerModule.getWalletBalance(
        event,
        mockContext
      );

      // Parse the response body
      const body = parseResponseBody(response);

      // Assert
      expect(response.statusCode).toBe(404);
      expect(body.success).toBe(false);
      expect(body.error).toBe("Wallet not found");
    });

    it("should handle database errors", async () => {
      // Mock Wallet.findOne to throw an error
      (Wallet.findOne as jest.Mock).mockRejectedValue(
        new Error("Database error")
      );

      // Create mock authenticated event
      const event = createMockAuthenticatedEvent(
        "testuser-id",
        "testuser",
        "test@example.com",
        null,
        { walletId: "wallet-id-123" }
      );

      // Call the handler directly
      const response = await walletsHandlerModule.getWalletBalance(
        event,
        mockContext
      );

      // Parse the response body
      const body = parseResponseBody(response);

      // Assert
      expect(response.statusCode).toBe(500);
      expect(body.success).toBe(false);
      expect(body.error).toBe("Could not retrieve wallet balance");
    });
  });

  describe("createWallet", () => {
    it("should return 401 if user ID is not in the token", async () => {
      // Create mock authenticated event without user ID
      const event = createMockAuthenticatedEvent(
        "testuser-id",
        "testuser",
        "test@example.com",
        {
          chain: "ethereum",
        }
      );

      // Remove the ID to simulate this error case
      event.user!.id = undefined as any;

      // Call the handler directly
      const response = await walletsHandlerModule.createWallet(
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

    it("should return 400 if request body is missing", async () => {
      // Create mock authenticated event without body
      const event = createMockAuthenticatedEvent(
        "testuser-id",
        "testuser",
        "test@example.com"
      );

      // Remove the body
      event.body = null;

      // Call the handler directly
      const response = await walletsHandlerModule.createWallet(
        event,
        mockContext
      );

      // Parse the response body
      const body = parseResponseBody(response);

      // Assert
      expect(response.statusCode).toBe(400);
      expect(body.success).toBe(false);
      expect(body.error).toBe("Missing request body");
    });

    it("should return 400 if chain is invalid", async () => {
      // Create mock authenticated event with invalid chain
      const event = createMockAuthenticatedEvent(
        "60d21b4667d0d8992e610c85",
        "testuser",
        "test@example.com",
        {
          chain: "invalid-chain",
          type: "eoa",
        }
      );

      // Call the handler directly (bypassing middleware)
      const response = await walletsHandlerModule.createWallet(
        event,
        mockContext
      );

      // Parse the response body
      const body = parseResponseBody(response);

      // Assert
      expect(response.statusCode).toBe(400);
      expect(body.success).toBe(false);
      expect(body.error).toBe("Valid chain is required");

      // Verify no database calls were made
      expect(User.findById).not.toHaveBeenCalled();
      expect(Wallet.countDocuments).not.toHaveBeenCalled();
    });

    it("should return 404 if user is not found", async () => {
      // Mock User.findById to return null
      (User.findById as jest.Mock).mockResolvedValue(null);

      // Create mock authenticated event
      const event = createMockAuthenticatedEvent(
        "testuser-id",
        "testuser",
        "test@example.com",
        {
          chain: "ethereum",
        }
      );

      // Call the handler directly
      const response = await walletsHandlerModule.createWallet(
        event,
        mockContext
      );

      // Parse the response body
      const body = parseResponseBody(response);

      // Assert
      expect(response.statusCode).toBe(404);
      expect(body.success).toBe(false);
      expect(body.error).toBe("User not found");
    });

    it("should handle database errors", async () => {
      // Mock User.findById to throw an error
      (User.findById as jest.Mock).mockRejectedValue(
        new Error("Database error")
      );

      // Create mock authenticated event
      const event = createMockAuthenticatedEvent(
        "testuser-id",
        "testuser",
        "test@example.com",
        {
          chain: "ethereum",
        }
      );

      // Call the handler directly
      const response = await walletsHandlerModule.createWallet(
        event,
        mockContext
      );

      // Parse the response body
      const body = parseResponseBody(response);

      // Assert
      expect(response.statusCode).toBe(500);
      expect(body.success).toBe(false);
      expect(body.error).toBe("Could not create wallet");
    });
  });
});
