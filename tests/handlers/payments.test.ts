import { getPaymentRequest, processPayment } from "../../src/handlers/payments";
import {
  createMockEvent,
  createMockAuthenticatedEvent,
  parseResponseBody,
  createMockContext,
} from "../utils/test-utils";
import mongoose from "mongoose";
import { User, Order, Transaction } from "../../src/models";
import QRCode from "qrcode";
import * as paymentsHandlerModule from "../../src/handlers/payments";

// Mock dependencies
jest.mock("qrcode");
jest.mock("uuid", () => ({
  v4: jest.fn().mockReturnValue("mock-uuid"),
}));

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
  },
  Order: {
    findById: jest.fn(),
    findOne: jest.fn(),
  },
  Transaction: {
    mockSave: jest.fn().mockResolvedValue(undefined),
  },
}));

// Mock the requireAuth and optionalAuth middleware
jest.mock("../../src/middleware/auth", () => ({
  requireAuth: (fn: any) => fn,
  optionalAuth: (fn: any) => fn,
}));

describe("Payments Handler", () => {
  const mockContext = createMockContext();
  beforeEach(() => {
    jest.clearAllMocks();

    // Set up environment variables
    process.env.PAYMENT_BASE_URL = "https://pay.test.com";
  });

  describe("generateQRCode", () => {
    it("should generate a payment QR code for a user", async () => {
      // Mock user data
      const mockUser = {
        _id: new mongoose.Types.ObjectId("60d21b4667d0d8992e610c85"),
        username: "testuser",
        email: "test@example.com",
        displayName: "Test User",
      };

      // Mock QRCode.toDataURL
      (QRCode.toDataURL as jest.Mock).mockResolvedValue(
        "data:image/png;base64,mockedQRCodeData"
      );

      // Mock User.findById to return the mock user
      (User.findById as jest.Mock).mockResolvedValue(mockUser);

      // Create mock authenticated event
      const event = createMockAuthenticatedEvent(
        mockUser._id.toString(),
        mockUser.username,
        mockUser.email
      );

      // Call the handler directly (bypassing middleware)
      const response = await paymentsHandlerModule.generateQRCode(
        event,
        mockContext
      );

      // Parse the response body
      const body = parseResponseBody(response);

      // Assert
      expect(response.statusCode).toBe(200);
      expect(body.success).toBe(true);
      expect(body.data).toHaveProperty("username", "testuser");
      expect(body.data).toHaveProperty(
        "paymentUrl",
        "https://pay.test.com/pay/me/testuser"
      );
      expect(body.data).toHaveProperty(
        "qrCodeDataUrl",
        "data:image/png;base64,mockedQRCodeData"
      );

      // Verify QRCode.toDataURL was called correctly
      expect(QRCode.toDataURL).toHaveBeenCalledWith(
        "https://pay.test.com/pay/me/testuser"
      );
    });
  });

  describe("createPaymentRequest", () => {
    it("should create a payment request with specified amount", async () => {
      // Mock user data
      const mockUser = {
        _id: new mongoose.Types.ObjectId("60d21b4667d0d8992e610c85"),
        username: "testuser",
        email: "test@example.com",
        displayName: "Test User",
      };

      // Mock Order model
      const mockSave = jest.fn().mockResolvedValue(undefined);
      const mockOrder = {
        _id: new mongoose.Types.ObjectId("60d21b4667d0d8992e610c86"),
        creatorId: mockUser._id,
        title: "Test Product",
        description: "Test Description",
        amount: {
          value: 99.99,
          currency: "USD",
        },
        qrCodeUrl: "data:image/png;base64,mockedQRCodeData",
        paymentUrl: "https://pay.test.com/pay/request/mock-uuid",
        expiresAt: expect.any(Date),
        status: "active",
        save: mockSave,
      };

      // Mock constructor for Order
      (Order as any) = jest.fn().mockImplementation(() => mockOrder);

      // Mock QRCode.toDataURL
      (QRCode.toDataURL as jest.Mock).mockResolvedValue(
        "data:image/png;base64,mockedQRCodeData"
      );

      // Mock User.findById to return the mock user
      (User.findById as jest.Mock).mockResolvedValue(mockUser);

      // Create mock authenticated event with request data
      const event = createMockAuthenticatedEvent(
        mockUser._id.toString(),
        mockUser.username,
        mockUser.email,
        {
          title: "Test Product",
          amount: 99.99,
          currency: "USD",
          description: "Test Description",
        }
      );

      // Call the handler directly (bypassing middleware)
      const response = await paymentsHandlerModule.createPaymentRequest(
        event,
        mockContext
      );

      // Parse the response body
      const body = parseResponseBody(response);

      // Assert
      expect(response.statusCode).toBe(200);
      expect(body.success).toBe(true);
      expect(body.data).toHaveProperty("orderId");
      expect(body.data).toHaveProperty("requestId", "mock-uuid");
      expect(body.data).toHaveProperty("title", "Test Product");
      expect(body.data).toHaveProperty("amount", 99.99);
      expect(body.data).toHaveProperty("currency", "USD");
      expect(body.data).toHaveProperty("description", "Test Description");
      expect(body.data).toHaveProperty(
        "paymentUrl",
        "https://pay.test.com/pay/request/mock-uuid"
      );
      expect(body.data).toHaveProperty(
        "qrCodeDataUrl",
        "data:image/png;base64,mockedQRCodeData"
      );

      // Verify QRCode.toDataURL was called correctly
      expect(QRCode.toDataURL).toHaveBeenCalledWith(
        "https://pay.test.com/pay/request/mock-uuid"
      );

      // Verify Order constructor was called with correct data
      expect(Order).toHaveBeenCalledWith({
        creatorId: mockUser._id,
        title: "Test Product",
        description: "Test Description",
        amount: {
          value: 99.99,
          currency: "USD",
        },
        qrCodeUrl: "data:image/png;base64,mockedQRCodeData",
        paymentUrl: "https://pay.test.com/pay/request/mock-uuid",
        expiresAt: expect.any(Date),
        status: "active",
      });

      // Verify save was called
      expect(mockSave).toHaveBeenCalled();
    });

    it("should return 400 if required fields are missing", async () => {
      // Create mock authenticated event with missing fields
      const event = createMockAuthenticatedEvent(
        "60d21b4667d0d8992e610c85",
        "testuser",
        "test@example.com",
        {
          // Missing title, amount, and currency
          description: "Test Description",
        }
      );

      // Call the handler directly (bypassing middleware)
      const response = await paymentsHandlerModule.createPaymentRequest(
        event,
        mockContext
      );

      // Parse the response body
      const body = parseResponseBody(response);

      // Assert
      expect(response.statusCode).toBe(400);
      expect(body.success).toBe(false);
      expect(body.error).toBe("Valid amount is required");

      // Verify User.findById was not called
      expect(User.findById).not.toHaveBeenCalled();
    });
  });

  describe("getPaymentRequest", () => {
    it("should retrieve an existing payment request", async () => {
      // Mock order data
      const creatorId = new mongoose.Types.ObjectId("60d21b4667d0d8992e610c85");
      const mockOrder = {
        _id: new mongoose.Types.ObjectId("60d21b4667d0d8992e610c86"),
        creatorId,
        title: "Test Product",
        description: "Test Description",
        amount: {
          value: 99.99,
          currency: "USD",
        },
        paymentUrl: "https://pay.test.com/pay/request/test-request-id",
        status: "active",
        createdAt: new Date("2023-01-01"),
        expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000), // 1 day in the future
      };

      // Mock creator data
      const mockCreator = {
        _id: creatorId,
        username: "creator",
        displayName: "Content Creator",
        email: "creator@example.com",
      };

      // Mock Order.findOne to return the mock order
      (Order.findOne as jest.Mock).mockResolvedValue(mockOrder);

      // Mock User.findById to return the creator
      (User.findById as jest.Mock).mockResolvedValue(mockCreator);

      // Create mock event
      const event = createMockEvent(null, { requestId: "test-request-id" });

      // Call the handler
      const response = await getPaymentRequest(event);

      // Parse the response body
      const body = parseResponseBody(response);

      // Assert
      expect(response.statusCode).toBe(200);
      expect(body.success).toBe(true);
      expect(body.data).toHaveProperty("orderId", mockOrder._id.toString());
      expect(body.data).toHaveProperty("requestId", "test-request-id");
      expect(body.data).toHaveProperty("title", "Test Product");
      expect(body.data).toHaveProperty("amount", 99.99);
      expect(body.data).toHaveProperty("currency", "USD");
      expect(body.data).toHaveProperty("status", "active");
      expect(body.data).toHaveProperty("username", "creator");
    });

    it("should return 404 if the payment request does not exist", async () => {
      // Mock Order.findOne to return null
      (Order.findOne as jest.Mock).mockResolvedValue(null);

      // Create mock event
      const event = createMockEvent(null, {
        requestId: "nonexistent-request-id",
      });

      // Call the handler
      const response = await getPaymentRequest(event);

      // Parse the response body
      const body = parseResponseBody(response);

      // Assert
      expect(response.statusCode).toBe(404);
      expect(body.success).toBe(false);
      expect(body.error).toBe("Payment request not found");
    });

    it("should return 410 if the payment request has expired", async () => {
      // Mock order data with an expired date
      const mockOrder = {
        _id: new mongoose.Types.ObjectId("60d21b4667d0d8992e610c86"),
        creatorId: new mongoose.Types.ObjectId("60d21b4667d0d8992e610c85"),
        title: "Test Product",
        status: "active",
        paymentUrl: "https://pay.test.com/pay/request/expired-request-id",
        expiresAt: new Date(Date.now() - 24 * 60 * 60 * 1000), // 1 day in the past
        save: jest.fn().mockResolvedValue(undefined),
      };

      // Mock Order.findOne to return the expired order
      (Order.findOne as jest.Mock).mockResolvedValue(mockOrder);

      // Create mock event
      const event = createMockEvent(null, { requestId: "expired-request-id" });

      // Call the handler
      const response = await getPaymentRequest(event);

      // Parse the response body
      const body = parseResponseBody(response);

      // Assert
      expect(response.statusCode).toBe(410);
      expect(body.success).toBe(false);
      expect(body.error).toBe("Payment request has expired");

      // Verify that the order status was updated to expired
      expect(mockOrder.status).toBe("expired");
      expect(mockOrder.save).toHaveBeenCalled();
    });
  });

  describe("processPayment", () => {
    it("should process a payment for an existing order", async () => {
      // Mock order data
      const creatorId = new mongoose.Types.ObjectId("60d21b4667d0d8992e610c85");
      const mockOrder = {
        _id: new mongoose.Types.ObjectId("60d21b4667d0d8992e610c86"),
        creatorId,
        title: "Test Product",
        description: "Test Description",
        amount: {
          value: 99.99,
          currency: "USD",
        },
        status: "active",
        save: jest.fn().mockResolvedValue(undefined),
      };

      // Mock creator data
      const mockCreator = {
        _id: creatorId,
        username: "creator",
        displayName: "Content Creator",
        email: "creator@example.com",
        walletAddress: "0xcreator1234567890",
      };

      // Mock transaction data
      const mockTransaction = {
        _id: new mongoose.Types.ObjectId("60d21b4667d0d8992e610c87"),
        save: jest.fn().mockResolvedValue(undefined),
      };

      // Mock Order.findById to return the mock order
      (Order.findById as jest.Mock).mockResolvedValue(mockOrder);

      // Mock User.findById to return the creator
      (User.findById as jest.Mock).mockResolvedValue(mockCreator);

      // Mock Transaction constructor
      (Transaction as any) = jest
        .fn()
        .mockImplementation(() => mockTransaction);

      // Create mock event
      const event = createMockEvent({
        orderId: mockOrder._id.toString(),
        senderWalletAddress: "0xsender1234567890",
        paymentMethod: "crypto",
      });

      // Call the handler
      const response = await processPayment(event, mockContext);

      // Parse the response body
      const body = parseResponseBody(response);

      // Assert
      expect(response.statusCode).toBe(200);
      expect(body.success).toBe(true);
      expect(body.data).toHaveProperty(
        "transactionId",
        mockTransaction._id.toString()
      );
      expect(body.data).toHaveProperty("orderId", mockOrder._id.toString());
      expect(body.data).toHaveProperty("amount", 99.99);
      expect(body.data).toHaveProperty("currency", "USD");
      expect(body.data).toHaveProperty("status", "completed");

      // Verify Transaction constructor was called with correct data
      expect(Transaction).toHaveBeenCalledWith({
        type: "payment",
        fromUserId: undefined, // No authenticated user in this test
        toUserId: creatorId,
        fromAddress: "0xsender1234567890",
        toAddress: "0xcreator1234567890",
        amount: "99.99",
        tokenAddress: "0x0",
        sourceChain: "ethereum",
        destinationChain: "ethereum",
        status: "completed",
        metadata: {
          orderId: mockOrder._id,
          note: "Test Description",
          category: "product",
        },
      });

      // Verify the transaction was saved
      expect(mockTransaction.save).toHaveBeenCalled();

      // Verify the order was updated and saved
      expect(mockOrder.status).toBe("completed");
      // expect(mockOrder.transactionId).toBe(mockTransaction._id);
      expect(mockOrder.save).toHaveBeenCalled();
    });

    it("should return 400 if no payment target is specified", async () => {
      // Create mock event with missing target (no orderId, requestId, or recipientUsername)
      const event = createMockEvent({
        senderWalletAddress: "0xsender1234567890",
        paymentMethod: "crypto",
      });

      // Call the handler
      const response = await processPayment(event, mockContext);

      // Parse the response body
      const body = parseResponseBody(response);

      // Assert
      expect(response.statusCode).toBe(400);
      expect(body.success).toBe(false);
      expect(body.error).toBe(
        "Either orderId, requestId, or recipientUsername is required"
      );
    });

    it("should process a direct payment to a user by username", async () => {
      // Mock recipient data
      const recipientId = new mongoose.Types.ObjectId(
        "60d21b4667d0d8992e610c85"
      );
      const mockRecipient = {
        _id: recipientId,
        username: "recipient",
        displayName: "Payment Recipient",
        email: "recipient@example.com",
        walletAddress: "0xrecipient1234567890",
      };

      // Mock transaction data
      const mockTransaction = {
        _id: new mongoose.Types.ObjectId("60d21b4667d0d8992e610c87"),
        save: jest.fn().mockResolvedValue(undefined),
      };

      // Mock User.findOne to return the recipient
      (User.findOne as jest.Mock).mockResolvedValue(mockRecipient);

      // Mock Transaction constructor
      (Transaction as any) = jest
        .fn()
        .mockImplementation(() => mockTransaction);

      // Create mock event
      const event = createMockEvent({
        recipientUsername: "recipient",
        amount: 50,
        currency: "USD",
        senderWalletAddress: "0xsender1234567890",
        paymentMethod: "crypto",
        description: "Direct payment test",
      });

      // Call the handler
      const response = await processPayment(event, mockContext);

      // Parse the response body
      const body = parseResponseBody(response);

      // Assert
      expect(response.statusCode).toBe(200);
      expect(body.success).toBe(true);
      expect(body.data).toHaveProperty(
        "transactionId",
        mockTransaction._id.toString()
      );
      expect(body.data).toHaveProperty("recipientUsername", "recipient");
      expect(body.data).toHaveProperty("amount", 50);
      expect(body.data).toHaveProperty("currency", "USD");
      expect(body.data).toHaveProperty("status", "completed");

      // Verify Transaction constructor was called with correct data
      expect(Transaction).toHaveBeenCalledWith({
        type: "payment",
        fromUserId: undefined, // No authenticated user in this test
        toUserId: recipientId,
        fromAddress: "0xsender1234567890",
        toAddress: "0xrecipient1234567890",
        amount: "50",
        tokenAddress: "0x0",
        sourceChain: "ethereum",
        destinationChain: "ethereum",
        status: "completed",
        metadata: {
          note: "Direct payment test",
          category: "direct",
        },
      });

      // Verify the transaction was saved
      expect(mockTransaction.save).toHaveBeenCalled();
    });
  });
});
