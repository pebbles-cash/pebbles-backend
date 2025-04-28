import {
  getUserTransactions,
  getTransactionDetails,
  getTransactionStats,
  filterTransactions,
} from "../../src/handlers/transactions";
import {
  createMockAuthenticatedEvent,
  parseResponseBody,
  createMockContext,
} from "../utils/test-utils";
import mongoose from "mongoose";
import { Transaction, User } from "../../src/models";
import * as analyticsService from "../../src/services/analytics-service";

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
}));

jest.mock("../../src/models", () => ({
  Transaction: {
    find: jest.fn(),
    findById: jest.fn(),
    countDocuments: jest.fn(),
  },
  User: {
    find: jest.fn(),
  },
}));

jest.mock("../../src/services/analytics-service", () => ({
  getEarningsSummary: jest.fn(),
}));

// Import the handlers directly - we're mocking the middleware separately
import * as transactionsHandlerModule from "../../src/handlers/transactions";
import { mock } from "node:test";

// Mock the requireAuth middleware
jest.mock("../../src/middleware/auth", () => ({
  requireAuth: (fn: any) => fn,
}));

describe("Transactions Handler", () => {
  // Create a mock context that can be reused in all tests
  const mockContext = createMockContext();

  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe("getUserTransactions", () => {
    it("should return a list of user transactions", async () => {
      // Mock user ID
      const userId = new mongoose.Types.ObjectId("60d21b4667d0d8992e610c85");
      const secondUserId = new mongoose.Types.ObjectId(
        "60d21b4667d0d8992e610c86"
      );

      // Mock transaction data
      const mockTransactions = [
        {
          _id: new mongoose.Types.ObjectId("60d21b4667d0d8992e610c87"),
          type: "payment",
          fromUserId: userId,
          toUserId: secondUserId,
          fromAddress: "0xsender1234",
          toAddress: "0xrecipient1234",
          amount: "100",
          tokenAddress: "0x0",
          sourceChain: "ethereum",
          destinationChain: "ethereum",
          status: "completed",
          metadata: {
            note: "Test payment",
            category: "test",
          },
          createdAt: new Date("2023-01-01"),
        },
        {
          _id: new mongoose.Types.ObjectId("60d21b4667d0d8992e610c88"),
          type: "tip",
          fromUserId: secondUserId,
          toUserId: userId,
          fromAddress: "0xsender5678",
          toAddress: "0xrecipient5678",
          amount: "50",
          tokenAddress: "0x0",
          sourceChain: "ethereum",
          destinationChain: "ethereum",
          status: "completed",
          metadata: {
            note: "Thanks for your work!",
          },
          createdAt: new Date("2023-01-02"),
        },
      ];

      // Mock user data
      const mockUsers = [
        {
          _id: userId,
          username: "testuser",
          displayName: "Test User",
          avatar: "avatar1.jpg",
        },
        {
          _id: secondUserId,
          username: "otheruser",
          displayName: "Other User",
          avatar: "avatar2.jpg",
        },
      ];

      // Mock Transaction.find
      (Transaction.find as jest.Mock).mockReturnValue({
        sort: jest.fn().mockReturnValue({
          skip: jest.fn().mockReturnValue({
            limit: jest.fn().mockResolvedValue(mockTransactions),
          }),
        }),
      });

      // Mock Transaction.countDocuments
      (Transaction.countDocuments as jest.Mock).mockResolvedValue(2);

      // Mock User.find
      (User.find as jest.Mock).mockResolvedValue(mockUsers);

      // Create mock authenticated event
      const event = createMockAuthenticatedEvent(
        userId.toString(),
        "testuser",
        "test@example.com"
      );

      // Call the handler
      const response = await getUserTransactions(event, mockContext);

      // Parse the response body
      const body = parseResponseBody(response);

      // Assert
      expect(response.statusCode).toBe(200);
      expect(body.success).toBe(true);
      expect(body.data).toHaveProperty("transactions");
      expect(body.data.transactions).toHaveLength(2);

      // Verify first transaction (outgoing)
      expect(body.data.transactions[0]).toHaveProperty(
        "id",
        mockTransactions[0]._id.toString()
      );
      expect(body.data.transactions[0]).toHaveProperty("type", "payment");
      expect(body.data.transactions[0]).toHaveProperty("direction", "outgoing");
      expect(body.data.transactions[0]).toHaveProperty("amount", "100");
      expect(body.data.transactions[0]).toHaveProperty("counterparty");
      expect(body.data.transactions[0].counterparty).toHaveProperty(
        "username",
        "otheruser"
      );

      // Verify second transaction (incoming)
      expect(body.data.transactions[1]).toHaveProperty(
        "id",
        mockTransactions[1]._id.toString()
      );
      expect(body.data.transactions[1]).toHaveProperty("type", "tip");
      expect(body.data.transactions[1]).toHaveProperty("direction", "incoming");
      expect(body.data.transactions[1]).toHaveProperty("amount", "50");
      expect(body.data.transactions[1].counterparty).toHaveProperty(
        "username",
        "otheruser"
      );

      // Verify pagination info
      expect(body.data).toHaveProperty("pagination");
      expect(body.data.pagination).toHaveProperty("total", 2);
      expect(body.data.pagination).toHaveProperty("page", 1);
      expect(body.data.pagination).toHaveProperty("limit", 10);
      expect(body.data.pagination).toHaveProperty("pages", 1);
    });

    it("should filter transactions by type", async () => {
      // Mock user ID
      const userId = new mongoose.Types.ObjectId("60d21b4667d0d8992e610c85");

      // Create mock authenticated event with type filter
      const event = createMockAuthenticatedEvent(
        userId.toString(),
        "testuser",
        "test@example.com",
        null,
        { type: "tip" }
      );

      // Mock empty result
      (Transaction.find as jest.Mock).mockReturnValue({
        sort: jest.fn().mockReturnValue({
          skip: jest.fn().mockReturnValue({
            limit: jest.fn().mockResolvedValue([]),
          }),
        }),
      });

      (Transaction.countDocuments as jest.Mock).mockResolvedValue(0);
      (User.find as jest.Mock).mockResolvedValue([]);

      await getUserTransactions(event, mockContext);

      // Verify that type filter was applied
      expect(Transaction.find).toHaveBeenCalledWith(
        expect.objectContaining({
          type: "tip",
        })
      );
    });

    it("should return 401 if user ID is not in the token", async () => {
      // Create mock authenticated event without user ID
      const event = createMockAuthenticatedEvent(
        undefined as any,
        "testuser",
        "test@example.com"
      );

      // Call the handler
      const response = await getUserTransactions(event, mockContext);

      // Parse the response body
      const body = parseResponseBody(response);

      // Assert
      expect(response.statusCode).toBe(401);
      expect(body.success).toBe(false);
      expect(body.error).toBe("User ID not found in token");
    });

    it("should handle database errors", async () => {
      // Mock user ID
      const userId = new mongoose.Types.ObjectId("60d21b4667d0d8992e610c85");

      // Mock Transaction.find to throw an error
      (Transaction.find as jest.Mock).mockImplementation(() => {
        throw new Error("Database error");
      });

      // Create mock authenticated event
      const event = createMockAuthenticatedEvent(
        userId.toString(),
        "testuser",
        "test@example.com"
      );

      // Call the handler
      const response = await getUserTransactions(event, mockContext);

      // Parse the response body
      const body = parseResponseBody(response);

      // Assert
      expect(response.statusCode).toBe(500);
      expect(body.success).toBe(false);
      expect(body.error).toBe("Could not retrieve transactions");
    });
  });

  describe("getTransactionDetails", () => {
    it("should return detailed information for a specific transaction", async () => {
      // Mock user ID
      const userId = new mongoose.Types.ObjectId("60d21b4667d0d8992e610c85");
      const secondUserId = new mongoose.Types.ObjectId(
        "60d21b4667d0d8992e610c86"
      );
      const transactionId = new mongoose.Types.ObjectId(
        "60d21b4667d0d8992e610c87"
      );

      // Mock transaction data
      const mockTransaction = {
        _id: transactionId,
        type: "payment",
        fromUserId: userId,
        toUserId: secondUserId,
        fromAddress: "0xsender1234",
        toAddress: "0xrecipient1234",
        amount: "100",
        tokenAddress: "0x0",
        sourceChain: "ethereum",
        destinationChain: "ethereum",
        status: "completed",
        metadata: {
          note: "Test payment",
          category: "test",
        },
        createdAt: new Date("2023-01-01"),
        updatedAt: new Date("2023-01-01"),
      };

      // Mock counterparty user
      const mockCounterparty = {
        _id: secondUserId,
        username: "recipient",
        displayName: "Recipient User",
        avatar: "recipient-avatar.jpg",
      };

      // Mock Transaction.findById
      (Transaction.findById as jest.Mock).mockResolvedValue(mockTransaction);

      // Mock User.findById
      (User.findById as jest.Mock).mockResolvedValue(mockCounterparty);

      // Create mock authenticated event
      const event = createMockAuthenticatedEvent(
        userId.toString(),
        "testuser",
        "test@example.com",
        null,
        { transactionId: transactionId.toString() }
      );

      // Call the handler
      const response = await getTransactionDetails(event, mockContext);

      // Parse the response body
      const body = parseResponseBody(response);

      // Assert
      expect(response.statusCode).toBe(200);
      expect(body.success).toBe(true);
      expect(body.data).toHaveProperty("transaction");
      expect(body.data.transaction).toHaveProperty(
        "id",
        transactionId.toString()
      );
      expect(body.data.transaction).toHaveProperty("type", "payment");
      expect(body.data.transaction).toHaveProperty("direction", "outgoing");
      expect(body.data.transaction).toHaveProperty("amount", "100");
      expect(body.data.transaction).toHaveProperty("status", "completed");
      expect(body.data.transaction).toHaveProperty(
        "fromAddress",
        "0xsender1234"
      );
      expect(body.data.transaction).toHaveProperty(
        "toAddress",
        "0xrecipient1234"
      );
      expect(body.data.transaction).toHaveProperty("metadata");
      expect(body.data.transaction.metadata).toHaveProperty(
        "note",
        "Test payment"
      );
      expect(body.data.transaction.metadata).toHaveProperty("category", "test");

      // Verify counterparty info
      expect(body.data.transaction).toHaveProperty("counterparty");
      expect(body.data.transaction.counterparty).toHaveProperty(
        "id",
        secondUserId.toString()
      );
      expect(body.data.transaction.counterparty).toHaveProperty(
        "username",
        "recipient"
      );
      expect(body.data.transaction.counterparty).toHaveProperty(
        "displayName",
        "Recipient User"
      );
      expect(body.data.transaction.counterparty).toHaveProperty(
        "avatar",
        "recipient-avatar.jpg"
      );
    });

    it("should return 400 if transaction ID is not provided", async () => {
      // Mock user ID
      const userId = new mongoose.Types.ObjectId("60d21b4667d0d8992e610c85");

      // Create mock authenticated event without transaction ID
      const event = createMockAuthenticatedEvent(
        userId.toString(),
        "testuser",
        "test@example.com"
      );

      // Call the handler
      const response = await getTransactionDetails(event, mockContext);

      // Parse the response body
      const body = parseResponseBody(response);

      // Assert
      expect(response.statusCode).toBe(400);
      expect(body.success).toBe(false);
      expect(body.error).toBe("Transaction ID parameter is required");
    });

    it("should return 404 if transaction is not found", async () => {
      // Mock user ID
      const userId = new mongoose.Types.ObjectId("60d21b4667d0d8992e610c85");
      const transactionId = new mongoose.Types.ObjectId(
        "60d21b4667d0d8992e610c87"
      );

      // Mock Transaction.findById to return null
      (Transaction.findById as jest.Mock).mockResolvedValue(null);

      // Create mock authenticated event
      const event = createMockAuthenticatedEvent(
        userId.toString(),
        "testuser",
        "test@example.com",
        null,
        { transactionId: transactionId.toString() }
      );

      // Call the handler
      const response = await getTransactionDetails(event, mockContext);

      // Parse the response body
      const body = parseResponseBody(response);

      // Assert
      expect(response.statusCode).toBe(404);
      expect(body.success).toBe(false);
      expect(body.error).toBe("Transaction not found");
    });

    it("should return 403 if user is not authorized to view the transaction", async () => {
      // Mock user IDs
      const userId = new mongoose.Types.ObjectId("60d21b4667d0d8992e610c85");
      const otherUserId1 = new mongoose.Types.ObjectId(
        "60d21b4667d0d8992e610c86"
      );
      const otherUserId2 = new mongoose.Types.ObjectId(
        "60d21b4667d0d8992e610c89"
      );
      const transactionId = new mongoose.Types.ObjectId(
        "60d21b4667d0d8992e610c87"
      );

      // Mock transaction between two other users
      const mockTransaction = {
        _id: transactionId,
        fromUserId: otherUserId1,
        toUserId: otherUserId2,
        // Other transaction properties...
      };

      // Mock Transaction.findById
      (Transaction.findById as jest.Mock).mockResolvedValue(mockTransaction);

      // Create mock authenticated event
      const event = createMockAuthenticatedEvent(
        userId.toString(), // Different from transaction participants
        "testuser",
        "test@example.com",
        null,
        { transactionId: transactionId.toString() }
      );

      // Call the handler
      const response = await getTransactionDetails(event, mockContext);

      // Parse the response body
      const body = parseResponseBody(response);

      // Assert
      expect(response.statusCode).toBe(403);
      expect(body.success).toBe(false);
      expect(body.error).toBe("Unauthorized to access this transaction");
    });
  });

  describe("getTransactionStats", () => {
    it("should return transaction statistics", async () => {
      // Mock user ID
      const userId = new mongoose.Types.ObjectId("60d21b4667d0d8992e610c85");

      // Mock earnings summary data
      const mockEarningsSummary = {
        totalEarnings: 500,
        currency: "USD",
        byType: {
          payment: 300,
          tip: 200,
          subscription: 0,
        },
        topSources: [
          { source: "design", amount: 300 },
          { source: "content", amount: 200 },
        ],
        periodStart: new Date("2023-01-01"),
        periodEnd: new Date("2023-01-31"),
        comparisonWithPrevious: {
          previousTotal: 400,
          percentageChange: 25,
        },
      };

      // Mock analytics service
      (analyticsService.getEarningsSummary as jest.Mock).mockResolvedValue(
        mockEarningsSummary
      );

      // Mock transaction counts
      (Transaction.countDocuments as jest.Mock)
        .mockResolvedValueOnce(10) // incoming
        .mockResolvedValueOnce(5); // outgoing

      // Create mock authenticated event
      const event = createMockAuthenticatedEvent(
        userId.toString(),
        "testuser",
        "test@example.com",
        null,
        { period: "month" }
      );

      // Call the handler
      const response = await getTransactionStats(event, mockContext);

      // Parse the response body
      const body = parseResponseBody(response);

      // Assert
      expect(response.statusCode).toBe(200);
      expect(body.success).toBe(true);
      expect(body.data).toHaveProperty("earningsSummary");
      expect(body.data.earningsSummary).toEqual(mockEarningsSummary);
      expect(body.data).toHaveProperty("transactionCounts");
      expect(body.data.transactionCounts).toHaveProperty("incoming", 10);
      expect(body.data.transactionCounts).toHaveProperty("outgoing", 5);
      expect(body.data.transactionCounts).toHaveProperty("total", 15);
      expect(body.data).toHaveProperty("periodStart");
      expect(body.data).toHaveProperty("periodEnd");

      // Verify analytics service was called with correct parameters
      expect(analyticsService.getEarningsSummary).toHaveBeenCalledWith(
        userId.toString(),
        "month"
      );

      // Verify Transaction.countDocuments was called for incoming and outgoing
      expect(Transaction.countDocuments).toHaveBeenNthCalledWith(1, {
        toUserId: userId.toString(),
        status: "completed",
      });
      expect(Transaction.countDocuments).toHaveBeenNthCalledWith(2, {
        fromUserId: userId.toString(),
        status: "completed",
      });
    });

    it("should return 401 if user ID is not in the token", async () => {
      // Create mock authenticated event without user ID
      const event = createMockAuthenticatedEvent(
        undefined as any,
        "testuser",
        "test@example.com"
      );

      // Call the handler
      const response = await getTransactionStats(event, mockContext);

      // Parse the response body
      const body = parseResponseBody(response);

      // Assert
      expect(response.statusCode).toBe(401);
      expect(body.success).toBe(false);
      expect(body.error).toBe("User ID not found in token");
    });

    it("should handle analytics service errors", async () => {
      // Mock user ID
      const userId = new mongoose.Types.ObjectId("60d21b4667d0d8992e610c85");

      // Mock analytics service error
      (analyticsService.getEarningsSummary as jest.Mock).mockRejectedValue(
        new Error("Analytics service error")
      );

      // Create mock authenticated event
      const event = createMockAuthenticatedEvent(
        userId.toString(),
        "testuser",
        "test@example.com"
      );

      // Call the handler
      const response = await getTransactionStats(event, mockContext);

      // Parse the response body
      const body = parseResponseBody(response);

      // Assert
      expect(response.statusCode).toBe(500);
      expect(body.success).toBe(false);
      expect(body.error).toBe("Could not retrieve transaction statistics");
    });
  });

  describe("filterTransactions", () => {
    it("should filter transactions based on multiple criteria", async () => {
      // Mock user ID
      const userId = new mongoose.Types.ObjectId("60d21b4667d0d8992e610c85");
      const secondUserId = new mongoose.Types.ObjectId(
        "60d21b4667d0d8992e610c86"
      );

      // Mock transaction data
      const mockTransactions = [
        {
          _id: new mongoose.Types.ObjectId("60d21b4667d0d8992e610c87"),
          type: "payment",
          fromUserId: secondUserId,
          toUserId: userId,
          fromAddress: "0xsender1234",
          toAddress: "0xrecipient1234",
          amount: "100",
          tokenAddress: "0x0",
          sourceChain: "ethereum",
          destinationChain: "ethereum",
          status: "completed",
          category: "design",
          tags: ["logo", "branding"],
          metadata: {
            client: "acme-corp",
            note: "Logo design",
          },
          createdAt: new Date("2023-01-15"),
        },
      ];

      // Mock Transaction.find
      (Transaction.find as jest.Mock).mockReturnValue({
        sort: jest.fn().mockReturnValue({
          skip: jest.fn().mockReturnValue({
            limit: jest.fn().mockResolvedValue(mockTransactions),
          }),
        }),
      });

      // Mock Transaction.countDocuments
      (Transaction.countDocuments as jest.Mock).mockResolvedValue(1);

      // Mock User.find
      (User.find as jest.Mock).mockResolvedValue([
        {
          _id: secondUserId,
          username: "client",
          displayName: "Client User",
          avatar: "client-avatar.jpg",
        },
      ]);

      // Create mock authenticated event with filter criteria
      const event = createMockAuthenticatedEvent(
        userId.toString(),
        "testuser",
        "test@example.com",
        {
          types: ["payment"],
          startDate: "2023-01-01",
          endDate: "2023-01-31",
          status: "completed",
          direction: "incoming",
          client: "acme-corp",
          category: "design",
          tags: ["logo"],
        }
      );

      // Call the handler
      const response = await filterTransactions(event, mockContext);

      // Parse the response body
      const body = parseResponseBody(response);

      // Assert
      expect(response.statusCode).toBe(200);
      expect(body.success).toBe(true);
      expect(body.data).toHaveProperty("transactions");
      expect(body.data.transactions).toHaveLength(1);
      expect(body.data.transactions[0]).toHaveProperty(
        "id",
        mockTransactions[0]._id.toString()
      );
      expect(body.data.transactions[0]).toHaveProperty("type", "payment");
      expect(body.data.transactions[0]).toHaveProperty("direction", "incoming");
      expect(body.data.transactions[0]).toHaveProperty("amount", "100");
      expect(body.data.transactions[0]).toHaveProperty("category", "design");
      expect(body.data.transactions[0]).toHaveProperty("tags");
      expect(body.data.transactions[0].tags).toEqual(["logo", "branding"]);
      expect(body.data.transactions[0]).toHaveProperty("counterparty");

      // Verify filter criteria was saved in response
      expect(body.data).toHaveProperty("filters");
      expect(body.data.filters).toHaveProperty("types", ["payment"]);
      expect(body.data.filters).toHaveProperty("startDate", "2023-01-01");
      expect(body.data.filters).toHaveProperty("endDate", "2023-01-31");
      expect(body.data.filters).toHaveProperty("status", "completed");
      expect(body.data.filters).toHaveProperty("direction", "incoming");
      expect(body.data.filters).toHaveProperty("client", "acme-corp");
      expect(body.data.filters).toHaveProperty("category", "design");
      expect(body.data.filters).toHaveProperty("tags", ["logo"]);

      // Verify query was constructed correctly
      expect(Transaction.find).toHaveBeenCalledWith(
        expect.objectContaining({
          toUserId: userId.toString(),
          type: { $in: ["payment"] },
          status: "completed",
          createdAt: {
            $gte: expect.any(Date),
            $lte: expect.any(Date),
          },
          "metadata.client": "acme-corp",
          category: "design",
          tags: { $in: ["logo"] },
        })
      );
    });

    it("should handle empty filter criteria", async () => {
      // Mock user ID
      const userId = new mongoose.Types.ObjectId("60d21b4667d0d8992e610c85");

      // Mock empty results
      (Transaction.find as jest.Mock).mockReturnValue({
        sort: jest.fn().mockReturnValue({
          skip: jest.fn().mockReturnValue({
            limit: jest.fn().mockResolvedValue([]),
          }),
        }),
      });

      (Transaction.countDocuments as jest.Mock).mockResolvedValue(0);
      (User.find as jest.Mock).mockResolvedValue([]);

      // Create mock authenticated event with empty filter
      const event = createMockAuthenticatedEvent(
        userId.toString(),
        "testuser",
        "test@example.com",
        {}
      );

      // Call the handler
      const response = await filterTransactions(event, mockContext);

      // Parse the response body
      const body = parseResponseBody(response);

      // Assert
      expect(response.statusCode).toBe(200);
      expect(body.success).toBe(true);
      expect(body.data).toHaveProperty("transactions");
      expect(body.data.transactions).toHaveLength(0);

      // Verify query contained the base conditions
      expect(Transaction.find).toHaveBeenCalledWith(
        expect.objectContaining({
          $or: [
            { toUserId: userId.toString() },
            { fromUserId: userId.toString() },
          ],
        })
      );
    });

    it("should return 401 if user ID is not in the token", async () => {
      // Create mock authenticated event without user ID
      const event = createMockAuthenticatedEvent(
        undefined as any,
        "testuser",
        "test@example.com",
        {}
      );

      // Call the handler
      const response = await filterTransactions(event, mockContext);

      // Parse the response body
      const body = parseResponseBody(response);

      // Assert
      expect(response.statusCode).toBe(401);
      expect(body.success).toBe(false);
      expect(body.error).toBe("User ID not found in token");
    });

    it("should return 400 if request body is missing", async () => {
      // Mock user ID
      const userId = new mongoose.Types.ObjectId("60d21b4667d0d8992e610c85");

      // Create mock authenticated event without body
      const event = createMockAuthenticatedEvent(
        userId.toString(),
        "testuser",
        "test@example.com"
      );

      // Remove the body
      event.body = null;

      // Call the handler
      const response = await filterTransactions(event, mockContext);

      // Parse the response body
      const body = parseResponseBody(response);

      // Assert
      expect(response.statusCode).toBe(400);
      expect(body.success).toBe(false);
      expect(body.error).toBe("Missing request body");
    });
  });
});
