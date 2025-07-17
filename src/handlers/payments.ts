import { APIGatewayProxyResult } from "aws-lambda";
import QRCode from "qrcode";
import { v4 as uuidv4 } from "uuid";
import { connectToDatabase } from "../services/mongoose";
import { success, error } from "../utils/response";
import { User, Order, Transaction } from "../models";
import { requireAuth, optionalAuth } from "../middleware/auth";
import {
  AuthenticatedAPIGatewayProxyEvent,
  PaymentRequestBody,
  ProcessPaymentRequestBody,
} from "../types";
import {
  sendPaymentReceivedNotification,
  sendTipReceivedNotification,
} from "../services/notification-service";

/**
 * Generate regular payment QR code
 * POST /api/payments/qr-code
 */
export const generateQRCode = requireAuth(
  async (
    event: AuthenticatedAPIGatewayProxyEvent
  ): Promise<APIGatewayProxyResult> => {
    try {
      // Database connection is handled in requireAuth middleware

      // User is provided by the auth middleware
      const userId = event.user?.id;

      if (!userId) {
        return error("User ID not found in token", 401);
      }

      // Get user from database
      const user = await User.findById(userId);

      if (!user) {
        return error("User not found", 404);
      }

      // Get payment base URL from environment variables
      const paymentBaseUrl = process.env.PAYMENT_BASE_URL;
      if (!paymentBaseUrl) {
        throw new Error("PAYMENT_BASE_URL environment variable is not set");
      }

      // Generate payment URL for regular payments
      const paymentUrl = `${paymentBaseUrl}/pay/me/${user.username}`;

      // Generate QR code
      const qrCodeDataUrl = await QRCode.toDataURL(paymentUrl);

      return success({
        username: user.username,
        paymentUrl,
        qrCodeDataUrl,
      });
    } catch (err) {
      console.error("Generate QR code error:", err);
      return error("Could not generate QR code", 500);
    }
  }
);

/**
 * Create payment request with specified amount
 * POST /api/payments/request
 */
export const createPaymentRequest = requireAuth(
  async (
    event: AuthenticatedAPIGatewayProxyEvent
  ): Promise<APIGatewayProxyResult> => {
    try {
      // Database connection is handled in requireAuth middleware

      // User is provided by the auth middleware
      const userId = event.user?.id;

      if (!userId) {
        return error("User ID not found in token", 401);
      }

      if (!event.body) {
        return error("Missing request body", 400);
      }

      const body: PaymentRequestBody = JSON.parse(event.body);
      const { title, amount, currency, description } = body;

      // Basic validation
      if (!amount || isNaN(amount) || amount <= 0) {
        return error("Valid amount is required", 400);
      }

      if (!currency) {
        return error("Currency is required", 400);
      }

      if (!title) {
        return error("Title is required", 400);
      }

      // Get user from database
      const user = await User.findById(userId);

      if (!user) {
        return error("User not found", 404);
      }

      // Generate a unique requestId
      const requestId = uuidv4();

      // Get payment base URL from environment variables
      const paymentBaseUrl = process.env.PAYMENT_BASE_URL;
      if (!paymentBaseUrl) {
        throw new Error("PAYMENT_BASE_URL environment variable is not set");
      }

      // Generate payment URL for this specific request
      const paymentUrl = `${paymentBaseUrl}/pay/request/${requestId}`;

      // Generate QR code
      const qrCodeDataUrl = await QRCode.toDataURL(paymentUrl);

      // Create order in the database
      const order = new Order({
        creatorId: user._id,
        title,
        description: description || "",
        amount: {
          value: amount,
          currency,
        },
        qrCodeUrl: qrCodeDataUrl,
        paymentUrl,
        expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000), // 7 days expiry
        status: "active",
      });

      await order.save();

      return success({
        orderId: order._id,
        requestId, // We store requestId in the paymentUrl
        title: order.title,
        username: user.username,
        amount: order.amount.value,
        currency: order.amount.currency,
        description: order.description,
        paymentUrl,
        qrCodeDataUrl,
        expiresAt: order.expiresAt,
      });
    } catch (err) {
      console.error("Create payment request error:", err);
      return error("Could not create payment request", 500);
    }
  }
);

/**
 * Get payment request details
 * GET /api/payments/request/:requestId
 */
export const getPaymentRequest = async (
  event: AuthenticatedAPIGatewayProxyEvent
): Promise<APIGatewayProxyResult> => {
  try {
    // Connect to database
    await connectToDatabase();

    if (!event.pathParameters?.requestId) {
      return error("Request ID parameter is required", 400);
    }

    const requestId = event.pathParameters.requestId;

    // Get payment base URL from environment variables
    const paymentBaseUrl = process.env.PAYMENT_BASE_URL;
    if (!paymentBaseUrl) {
      throw new Error("PAYMENT_BASE_URL environment variable is not set");
    }

    // Extract the requestId from the URL pattern
    // We're assuming the URL format is /pay/request/{requestId}
    const paymentUrl = `${paymentBaseUrl}/pay/request/${requestId}`;

    // Find the order with this payment URL
    const order = await Order.findOne({ paymentUrl });

    if (!order) {
      return error("Payment request not found", 404);
    }

    // Check if expired
    if (
      order.status === "expired" ||
      (order.expiresAt && new Date() > new Date(order.expiresAt))
    ) {
      // Update status if it's expired but not marked as such
      if (order.status !== "expired") {
        order.status = "expired";
        await order.save();
      }
      return error("Payment request has expired", 410);
    }

    // Find the creator details
    const creator = await User.findById(order.creatorId);

    if (!creator) {
      return error("Creator not found", 404);
    }

    return success({
      orderId: order._id,
      requestId,
      title: order.title,
      username: creator.username,
      amount: order.amount.value,
      currency: order.amount.currency,
      description: order.description,
      paymentUrl,
      status: order.status,
      createdAt: order.createdAt,
      expiresAt: order.expiresAt,
    });
  } catch (err) {
    console.error("Get payment request error:", err);
    return error("Could not retrieve payment request", 500);
  }
};

/**
 * Process a payment
 * POST /api/payments/process
 */
export const processPayment = optionalAuth(
  async (
    event: AuthenticatedAPIGatewayProxyEvent
  ): Promise<APIGatewayProxyResult> => {
    try {
      // Database connection is handled in optionalAuth middleware

      if (!event.body) {
        return error("Missing request body", 400);
      }

      const body: ProcessPaymentRequestBody = JSON.parse(event.body);
      const {
        orderId,
        requestId,
        senderWalletAddress,
        recipientUsername,
        amount,
        currency,
        paymentMethod,
        description,
      } = body;

      // We need either an orderId, requestId, or a recipient username
      if (!orderId && !requestId && !recipientUsername) {
        return error(
          "Either orderId, requestId, or recipientUsername is required",
          400
        );
      }

      if (!senderWalletAddress) {
        return error("Sender wallet address is required", 400);
      }

      if (!paymentMethod) {
        return error("Payment method is required", 400);
      }

      // Get payment base URL from environment variables
      const paymentBaseUrl = process.env.PAYMENT_BASE_URL;
      if (!paymentBaseUrl) {
        throw new Error("PAYMENT_BASE_URL environment variable is not set");
      }

      // If processing a payment for an order/request
      let order;
      let paymentUrl;

      if (orderId) {
        order = await Order.findById(orderId);
      } else if (requestId) {
        paymentUrl = `${paymentBaseUrl}/pay/request/${requestId}`;
        order = await Order.findOne({ paymentUrl });
      }

      if (order) {
        // Check if the order is active
        if (order.status !== "active") {
          return error(`Order is ${order.status}`, 400);
        }

        // Check if expired
        if (order.expiresAt && new Date() > new Date(order.expiresAt)) {
          order.status = "expired";
          await order.save();
          return error("Order has expired", 410);
        }

        // Get recipient user
        const recipient = await User.findById(order.creatorId);

        if (!recipient) {
          return error("Recipient not found", 404);
        }

        // Get sender user (optional)
        let sender;
        if (event.user?.id) {
          sender = await User.findById(event.user.id);
        }

        // TODO: Implement blockchain transaction listener

        // For this example, we'll just create a transaction record
        const transaction = new Transaction({
          type: "payment",
          fromUserId: sender?._id,
          toUserId: recipient._id,
          fromAddress: senderWalletAddress,
          toAddress:
            recipient.primaryWalletAddress || "recipient-wallet-address",
          amount: order.amount.value.toString(),
          tokenAddress: "0x0", // Native token
          sourceChain: "ethereum", // Default for example
          destinationChain: "ethereum", // Default for example
          status: "completed",
          metadata: {
            orderId: order._id,
            note: order.description,
            category: "product",
          },
        });

        await transaction.save();

        // Update order status
        order.status = "completed";
        order.transactionId = transaction._id;
        await order.save();

        // Send notification to recipient
        try {
          await sendPaymentReceivedNotification(
            recipient._id.toString(),
            order.amount.value.toString(),
            sender?.displayName || sender?.username || "Anonymous",
            sender?._id.toString(),
            transaction._id.toString()
          );
        } catch (notificationError) {
          console.error(
            "Failed to send payment notification:",
            notificationError
          );
          // Don't fail the payment if notification fails
        }

        return success({
          transactionId: transaction._id,
          orderId: order._id,
          amount: order.amount.value,
          currency: order.amount.currency,
          status: "completed",
        });
      }
      // Direct payment to a user (not from an order)
      else if (recipientUsername) {
        // Basic validation
        if (!amount || isNaN(amount) || amount <= 0) {
          return error("Valid amount is required", 400);
        }

        if (!currency) {
          return error("Currency is required", 400);
        }

        // Get recipient user
        const recipient = await User.findOne({ username: recipientUsername });

        if (!recipient) {
          return error("Recipient not found", 404);
        }

        // Get sender user (optional)
        let sender;
        if (event.user?.id) {
          sender = await User.findById(event.user.id);
        }

        // TODO: Implement blockchain transaction listener or payment processing here

        // For this example, we'll just create a transaction record
        const transaction = new Transaction({
          type: "payment",
          fromUserId: sender?._id,
          toUserId: recipient._id,
          fromAddress: senderWalletAddress,
          toAddress:
            recipient.primaryWalletAddress || "recipient-wallet-address",
          amount: amount.toString(),
          tokenAddress: "0x0", // Native token
          sourceChain: "ethereum", // Default for example
          destinationChain: "ethereum", // Default for example
          status: "completed",
          metadata: {
            note: description || "Direct payment",
            category: "direct",
          },
        });

        await transaction.save();

        try {
          if (transaction.type === "tip") {
            await sendTipReceivedNotification(
              recipient._id.toString(),
              amount.toString(),
              sender?.displayName || sender?.username,
              sender?._id.toString(),
              transaction._id.toString()
            );
          } else {
            await sendPaymentReceivedNotification(
              recipient._id.toString(),
              amount.toString(),
              sender?.displayName || sender?.username || "Anonymous",
              sender?._id.toString(),
              transaction._id.toString()
            );
          }
        } catch (notificationError) {
          console.error(
            "Failed to send payment notification:",
            notificationError
          );
          // Don't fail the payment if notification fails
        }

        return success({
          transactionId: transaction._id,
          recipientUsername,
          amount,
          currency,
          status: "completed",
        });
      }

      // Should never reach here due to earlier validation
      return error("Invalid payment request", 400);
    } catch (err) {
      console.error("Process payment error:", err);
      return error("Payment processing failed", 500);
    }
  }
);

/**
 * Get payment URL for a username
 * GET /api/payments/url/:username
 */
export const getPaymentUrl = async (
  event: AuthenticatedAPIGatewayProxyEvent
): Promise<APIGatewayProxyResult> => {
  try {
    // Connect to database
    await connectToDatabase();

    if (!event.pathParameters?.username) {
      return error("Username parameter is required", 400);
    }

    const username = event.pathParameters.username;

    // Check if user exists
    const user = await User.findOne({ username });

    if (!user) {
      return error("User not found", 404);
    }

    // Get payment base URL from environment variables
    const paymentBaseUrl = process.env.PAYMENT_BASE_URL;
    if (!paymentBaseUrl) {
      throw new Error("PAYMENT_BASE_URL environment variable is not set");
    }

    // Generate payment URL
    const paymentUrl = `${paymentBaseUrl}/pay/me/${username}`;

    return success({
      username,
      paymentUrl,
    });
  } catch (err) {
    console.error("Get payment URL error:", err);
    return error("Could not generate payment URL", 500);
  }
};
