import {
  getUserTransactions,
  getTransactionDetails,
  filterTransactions,
  createTransaction,
  updateTransaction,
} from "../../src/handlers/transactions";

import {
  createMockAuthenticatedEvent,
  parseResponseBody,
  createMockContext,
} from "../utils/test-utils";
import mongoose from "mongoose";
import { Transaction, User } from "../../src/models";

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
    find: jest.fn().mockReturnValue({
      sort: jest.fn().mockReturnValue({
        skip: jest.fn().mockReturnValue({
          limit: jest.fn().mockReturnValue({
            exec: jest.fn().mockResolvedValue([]),
          }),
        }),
      }),
    }),
    findById: jest.fn(),
    findByIdAndUpdate: jest.fn(),
    countDocuments: jest.fn(),
  },
  User: {
    find: jest.fn().mockReturnValue({
      select: jest.fn().mockResolvedValue([]),
    }),
    findById: jest.fn(),
  },
}));
// Mock the requireAuth middleware
jest.mock("../../src/middleware/auth", () => ({
  requireAuth: (fn: any) => fn,
}));

describe("Transactions Handler", () => {
  // Create a mock context that can be reused in all tests
  const mockContext = createMockContext();

  beforeEach(() => {
    jest.clearAllMocks();

    // Set up Transaction constructor mock similar to how it's done in payments.test.ts
    (Transaction as any) = Object.assign(
      jest.fn().mockImplementation(() => ({
        _id: new mongoose.Types.ObjectId("60d21b4667d0d8992e610c87"),
        type: "payment",
        fromUserId: new mongoose.Types.ObjectId("60d21b4667d0d8992e610c85"),
        toUserId: new mongoose.Types.ObjectId("60d21b4667d0d8992e610c86"),
        fromAddress: "0xsender1234",
        toAddress: "0xrecipient1234",
        amount: "100",
        tokenAddress: "0x0",
        sourceChain: "ethereum",
        destinationChain: "ethereum",
        status: "pending",
        category: "design",
        tags: ["logo"],
        client: "acme-corp",
        createdAt: new Date(),
        updatedAt: new Date(),
        save: jest.fn().mockResolvedValue(undefined),
      })),
      Transaction
    );
  });
  // Additional tests for the new endpoints
  describe("createTransaction", () => {
    it("should create a new transaction successfully", async () => {
      // Mock user ID
      const userId = new mongoose.Types.ObjectId("60d21b4667d0d8992e610c85");
      const recipientId = new mongoose.Types.ObjectId(
        "60d21b4667d0d8992e610c86"
      );

      // Mock User.findById
      (User.findById as jest.Mock).mockResolvedValue({
        _id: recipientId,
        username: "recipient",
        email: "recipient@example.com",
      });

      // Create mock authenticated event
      const event = createMockAuthenticatedEvent(
        userId.toString(),
        "testuser",
        "test@example.com",
        {
          type: "payment",
          toUserId: recipientId.toString(),
          fromAddress: "0xsender1234",
          toAddress: "0xrecipient1234",
          amount: "100",
          sourceChain: "ethereum",
          destinationChain: "ethereum",
          category: "design",
          tags: ["logo"],
          client: "acme-corp",
        }
      );

      // Call the handler
      const response = await createTransaction(event, mockContext);

      // Parse the response body
      const body = parseResponseBody(response);

      // Assert
      expect(response.statusCode).toBe(201);
      expect(body.success).toBe(true);
      expect(body.data).toHaveProperty("id");
      expect(body.data).toHaveProperty("type", "payment");
      expect(body.data).toHaveProperty("amount", "100");
      expect(body.data).toHaveProperty("status", "pending");
      expect(body.data).toHaveProperty("category", "design");
      expect(body.data).toHaveProperty("tags", ["logo"]);
      expect(body.data).toHaveProperty("client", "acme-corp");

      // Verify Transaction constructor was called with correct data
      expect(Transaction).toHaveBeenCalled();
    });

    it("should return 400 for missing required fields", async () => {
      // Mock user ID
      const userId = new mongoose.Types.ObjectId("60d21b4667d0d8992e610c85");

      // Create mock authenticated event with missing fields
      const event = createMockAuthenticatedEvent(
        userId.toString(),
        "testuser",
        "test@example.com",
        {
          // Missing 'type', 'toUserId', 'toAddress'
          amount: "100",
          sourceChain: "ethereum",
          destinationChain: "ethereum",
        }
      );

      // Call the handler
      const response = await createTransaction(event, mockContext);

      // Parse the response body
      const body = parseResponseBody(response);

      // Assert
      expect(response.statusCode).toBe(400);
      expect(body.success).toBe(false);
      expect(body.error).toBe(
        "Valid transaction type is required (payment, tip, subscription)"
      );
    });

    it("should return 404 if recipient user not found", async () => {
      // Mock user ID
      const userId = new mongoose.Types.ObjectId("60d21b4667d0d8992e610c85");
      const recipientId = new mongoose.Types.ObjectId(
        "60d21b4667d0d8992e610c86"
      );

      // Mock User.findById to return null (user not found)
      (User.findById as jest.Mock).mockResolvedValue(null);

      // Create mock authenticated event
      const event = createMockAuthenticatedEvent(
        userId.toString(),
        "testuser",
        "test@example.com",
        {
          type: "payment",
          toUserId: recipientId.toString(),
          toAddress: "0xrecipient1234",
          amount: "100",
          sourceChain: "ethereum",
          destinationChain: "ethereum",
        }
      );

      // Call the handler
      const response = await createTransaction(event, mockContext);

      // Parse the response body
      const body = parseResponseBody(response);

      // Assert
      expect(response.statusCode).toBe(404);
      expect(body.success).toBe(false);
      expect(body.error).toBe("Recipient user not found");

      // Verify no transaction was created
      expect(Transaction).not.toHaveBeenCalled();
    });
  });

  describe("updateTransaction", () => {
    it("should update transaction successfully", async () => {
      // Mock user ID
      const userId = new mongoose.Types.ObjectId("60d21b4667d0d8992e610c85");
      const recipientId = new mongoose.Types.ObjectId(
        "60d21b4667d0d8992e610c86"
      );
      const transactionId = new mongoose.Types.ObjectId(
        "60d21b4667d0d8992e610c87"
      );

      // Mock existing transaction
      const mockTransaction = {
        _id: transactionId,
        type: "payment",
        fromUserId: userId,
        toUserId: recipientId,
        fromAddress: "0xsender1234",
        toAddress: "0xrecipient1234",
        amount: "100",
        tokenAddress: "0x0",
        sourceChain: "ethereum",
        destinationChain: "ethereum",
        status: "pending",
        category: "uncategorized",
        tags: [],
        metadata: {
          note: "Original note",
        },
      };

      // Mock updated transaction
      const mockUpdatedTransaction = {
        ...mockTransaction,
        status: "completed",
        category: "design",
        tags: ["logo", "branding"],
        client: "acme-corp",
        metadata: {
          note: "Original note",
          completedBy: "John Doe",
        },
        updatedAt: new Date(),
      };

      // Mock Transaction.findById
      (Transaction.findById as jest.Mock)
        .mockResolvedValueOnce(mockTransaction) // First call returns existing transaction
        .mockResolvedValueOnce(mockUpdatedTransaction); // Second call returns updated transaction

      // Mock Transaction.findByIdAndUpdate
      (Transaction.findByIdAndUpdate as jest.Mock).mockResolvedValue({
        modifiedCount: 1,
      });

      // Create mock authenticated event
      const event = createMockAuthenticatedEvent(
        userId.toString(),
        "testuser",
        "test@example.com",
        {
          status: "completed",
          category: "design",
          tags: ["logo", "branding"],
          client: "acme-corp",
          metadata: {
            completedBy: "John Doe",
          },
        },
        { transactionId: transactionId.toString() }
      );

      // Call the handler
      const response = await updateTransaction(event, mockContext);

      // Parse the response body
      const body = parseResponseBody(response);

      // Assert
      expect(response.statusCode).toBe(200);
      expect(body.success).toBe(true);
      expect(body.data).toHaveProperty("id", transactionId.toString());
      expect(body.data).toHaveProperty("status", "completed");
      expect(body.data).toHaveProperty("category", "design");
      expect(body.data).toHaveProperty("tags", ["logo", "branding"]);
      expect(body.data).toHaveProperty("client", "acme-corp");
      expect(body.data).toHaveProperty("metadata");
      expect(body.data.metadata).toHaveProperty("note", "Original note");
      expect(body.data.metadata).toHaveProperty("completedBy", "John Doe");

      // Verify findByIdAndUpdate was called with correct data
      expect(Transaction.findByIdAndUpdate).toHaveBeenCalledWith(
        transactionId.toString(),
        {
          $set: expect.objectContaining({
            status: "completed",
            category: "design",
            tags: ["logo", "branding"],
            client: "acme-corp",
            metadata: {
              note: "Original note",
              completedBy: "John Doe",
            },
            updatedAt: expect.any(Date),
          }),
        }
      );
    });

    it("should return 404 if transaction not found", async () => {
      // Mock user ID
      const userId = new mongoose.Types.ObjectId("60d21b4667d0d8992e610c85");
      const transactionId = new mongoose.Types.ObjectId(
        "60d21b4667d0d8992e610c87"
      );

      // Mock Transaction.findById to return null (transaction not found)
      (Transaction.findById as jest.Mock).mockResolvedValue(null);

      // Create mock authenticated event
      const event = createMockAuthenticatedEvent(
        userId.toString(),
        "testuser",
        "test@example.com",
        {
          status: "completed",
        },
        { transactionId: transactionId.toString() }
      );

      // Call the handler
      const response = await updateTransaction(event, mockContext);

      // Parse the response body
      const body = parseResponseBody(response);

      // Assert
      expect(response.statusCode).toBe(404);
      expect(body.success).toBe(false);
      expect(body.error).toBe("Transaction not found");

      // Verify findByIdAndUpdate was not called
      expect(Transaction.findByIdAndUpdate).not.toHaveBeenCalled();
    });

    it("should return 403 if user is not authorized", async () => {
      // Mock user ID (different from transaction's fromUserId and toUserId)
      const userId = new mongoose.Types.ObjectId("60d21b4667d0d8992e610c85");
      const transactionId = new mongoose.Types.ObjectId(
        "60d21b4667d0d8992e610c87"
      );
      const otherUser1 = new mongoose.Types.ObjectId(
        "60d21b4667d0d8992e610c88"
      );
      const otherUser2 = new mongoose.Types.ObjectId(
        "60d21b4667d0d8992e610c89"
      );

      // Mock existing transaction (with different users)
      const mockTransaction = {
        _id: transactionId,
        fromUserId: otherUser1,
        toUserId: otherUser2,
        // Other transaction properties...
        status: "pending",
      };

      // Mock Transaction.findById
      (Transaction.findById as jest.Mock).mockResolvedValue(mockTransaction);

      // Create mock authenticated event
      const event = createMockAuthenticatedEvent(
        userId.toString(), // Different from transaction users
        "testuser",
        "test@example.com",
        {
          status: "completed",
        },
        { transactionId: transactionId.toString() }
      );

      // Call the handler
      const response = await updateTransaction(event, mockContext);

      // Parse the response body
      const body = parseResponseBody(response);

      // Assert
      expect(response.statusCode).toBe(403);
      expect(body.success).toBe(false);
      expect(body.error).toBe("Unauthorized to update this transaction");

      // Verify findByIdAndUpdate was not called
      expect(Transaction.findByIdAndUpdate).not.toHaveBeenCalled();
    });

    it("should prevent changing completed transaction status", async () => {
      // Mock user ID
      const userId = new mongoose.Types.ObjectId("60d21b4667d0d8992e610c85");
      const transactionId = new mongoose.Types.ObjectId(
        "60d21b4667d0d8992e610c87"
      );

      // Mock existing transaction (already completed)
      const mockTransaction = {
        _id: transactionId,
        fromUserId: userId,
        toUserId: new mongoose.Types.ObjectId(),
        status: "completed", // Already completed
      };

      // Mock Transaction.findById
      (Transaction.findById as jest.Mock).mockResolvedValue(mockTransaction);

      // Create mock authenticated event trying to change status to pending
      const event = createMockAuthenticatedEvent(
        userId.toString(),
        "testuser",
        "test@example.com",
        {
          status: "pending", // Trying to change back to pending
        },
        { transactionId: transactionId.toString() }
      );

      // Call the handler
      const response = await updateTransaction(event, mockContext);

      // Parse the response body
      const body = parseResponseBody(response);

      // Assert
      expect(response.statusCode).toBe(400);
      expect(body.success).toBe(false);
      expect(body.error).toBe(
        "Cannot change status of a completed transaction"
      );

      // Verify findByIdAndUpdate was not called
      expect(Transaction.findByIdAndUpdate).not.toHaveBeenCalled();
    });
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

      // Mock Transaction.find chain
      const mockExec = jest.fn().mockResolvedValue(mockTransactions);
      const mockLimit = jest.fn().mockReturnValue({ exec: mockExec });
      const mockSkip = jest.fn().mockReturnValue({ limit: mockLimit });
      const mockSort = jest.fn().mockReturnValue({ skip: mockSkip });
      (Transaction.find as jest.Mock).mockReturnValue({ sort: mockSort });

      // Mock Transaction.countDocuments
      (Transaction.countDocuments as jest.Mock).mockResolvedValue(2);

      // Mock User.find
      (User.find as jest.Mock).mockReturnValue({
        select: jest.fn().mockResolvedValue(mockUsers),
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

      // Verify the query was constructed correctly
      expect(Transaction.find).toHaveBeenCalledWith({
        $or: [
          { toUserId: userId.toString() },
          { fromUserId: userId.toString() },
        ],
      });
      expect(mockSort).toHaveBeenCalledWith({ createdAt: -1 });
      expect(mockSkip).toHaveBeenCalledWith(0); // (page - 1) * limit = (1 - 1) * 10 = 0
      expect(mockLimit).toHaveBeenCalledWith(10);
    });

    it("should filter transactions by type", async () => {
      // Mock user ID
      const userId = new mongoose.Types.ObjectId("60d21b4667d0d8992e610c85");

      // Create mock authenticated event with type filter
      // Explicitly set the queryStringParameters to make sure it's properly structured
      const event = {
        ...createMockAuthenticatedEvent(
          userId.toString(),
          "testuser",
          "test@example.com"
        ),
        queryStringParameters: {
          type: "tip",
        },
      };

      // Set up mocks for chained functions
      const mockExec = jest.fn().mockResolvedValue([]);
      const mockLimit = jest.fn().mockReturnValue({ exec: mockExec });
      const mockSkip = jest.fn().mockReturnValue({ limit: mockLimit });
      const mockSort = jest.fn().mockReturnValue({ skip: mockSkip });

      // Mock find to capture and check the first argument
      const mockFind = jest.fn().mockImplementation((query) => {
        // Verify the query has the type property
        expect(query).toHaveProperty("type", "tip");
        // Return the chain
        return { sort: mockSort };
      });

      // Apply the mocks
      (Transaction.find as jest.Mock) = mockFind;
      (Transaction.countDocuments as jest.Mock).mockResolvedValue(0);
      (User.find as jest.Mock).mockReturnValue({
        select: jest.fn().mockResolvedValue([]),
      });

      // Call the handler
      await getUserTransactions(event, mockContext);

      // Verify find was called
      expect(mockFind).toHaveBeenCalled();
    });
    it("should return 401 if user ID is not in the token", async () => {
      // Create a mocked event without a user ID in the token
      // Important: We need to explicitly set event.user.id to undefined/null
      const event = {
        ...createMockAuthenticatedEvent(
          "some-id", // This ID will be ignored
          "testuser",
          "test@example.com"
        ),
        user: { id: null }, // Explicitly set id to null to simulate missing user ID
      };

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

      // Temporarily silence console.error
      const originalConsoleError = console.error;
      console.error = jest.fn();

      try {
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
      } finally {
        // Restore console.error
        console.error = originalConsoleError;
      }
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
      (User.findById as jest.Mock).mockReturnValue({
        select: jest.fn().mockResolvedValue(mockCounterparty),
      });

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

      // Mock Transaction.find chain
      const mockExec = jest.fn().mockResolvedValue(mockTransactions);
      const mockLimit = jest.fn().mockReturnValue({ exec: mockExec });
      const mockSkip = jest.fn().mockReturnValue({ limit: mockLimit });
      const mockSort = jest.fn().mockReturnValue({ skip: mockSkip });
      (Transaction.find as jest.Mock).mockReturnValue({ sort: mockSort });

      // Mock Transaction.countDocuments
      (Transaction.countDocuments as jest.Mock).mockResolvedValue(1);

      // Mock User.find
      (User.find as jest.Mock).mockReturnValue({
        select: jest.fn().mockResolvedValue([
          {
            _id: secondUserId,
            username: "client",
            displayName: "Client User",
            avatar: "client-avatar.jpg",
          },
        ]),
      });

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
      const mockExec = jest.fn().mockResolvedValue([]);
      const mockLimit = jest.fn().mockReturnValue({ exec: mockExec });
      const mockSkip = jest.fn().mockReturnValue({ limit: mockLimit });
      const mockSort = jest.fn().mockReturnValue({ skip: mockSkip });
      (Transaction.find as jest.Mock).mockReturnValue({ sort: mockSort });

      (Transaction.countDocuments as jest.Mock).mockResolvedValue(0);
      (User.find as jest.Mock).mockReturnValue({
        select: jest.fn().mockResolvedValue([]),
      });

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
      // Create a mocked event without a user ID in the token
      // Important: We need to explicitly set event.user.id to undefined/null
      const event = {
        ...createMockAuthenticatedEvent(
          "some-id", // This ID will be ignored
          "testuser",
          "test@example.com",
          {}
        ),
        user: { id: null }, // Explicitly set id to null to simulate missing user ID
      };

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
