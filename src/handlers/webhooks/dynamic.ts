import { APIGatewayProxyEvent, APIGatewayProxyResult } from "aws-lambda";
import crypto from "crypto";
import { connectToDatabase } from "../../services/mongoose";
import { success, error } from "../../utils/response";
import { User, Transaction } from "../../models";
import { logger } from "../../utils/logger";
import { sendNotificationToUser } from "../../services/notification-service";
import { NotificationOptions } from "../../services/firebase";
import { DYNAMIC_WEBHOOK_SECRET } from "../../config/env";

/**
 * Handle Dynamic webhook events
 * POST /api/webhooks/dynamic
 */
export const handleDynamicWebhook = async (
  event: APIGatewayProxyEvent
): Promise<APIGatewayProxyResult> => {
  try {
    await connectToDatabase();

    // Get webhook payload
    if (!event.body) {
      logger.warn("Dynamic webhook received without body");
      return error("Webhook payload is required", 400);
    }

    // Verify webhook signature
    const signature = event.headers["x-dynamic-signature-256"];
    const webhookSecret = DYNAMIC_WEBHOOK_SECRET;

    if (!webhookSecret) {
      logger.error("DYNAMIC_WEBHOOK_SECRET not configured");
      return error("Webhook secret not configured", 500);
    }

    if (!signature) {
      logger.warn("Dynamic webhook received without signature");
      return error("Webhook signature is required", 401);
    }

    // Verify the signature
    const isValidSignature = verifyDynamicSignature(
      event.body,
      signature,
      webhookSecret
    );
    if (!isValidSignature) {
      logger.warn("Invalid Dynamic webhook signature", { signature });
      return error("Invalid webhook signature", 401);
    }

    // Parse webhook payload
    let webhookData;
    try {
      webhookData = JSON.parse(event.body);
    } catch (parseError) {
      logger.error(
        "Failed to parse Dynamic webhook payload",
        parseError as Error
      );
      return error("Invalid JSON payload", 400);
    }

    logger.info("Received Dynamic webhook", {
      eventName: webhookData.eventName,
      eventId: webhookData.eventId,
      messageId: webhookData.messageId,
      userId: webhookData.userId,
    });

    // Process the webhook based on event type
    await processDynamicWebhook(webhookData);

    // Return success response quickly (Dynamic expects fast response)
    return success({ received: true });
  } catch (err) {
    logger.error("Dynamic webhook processing error", err as Error);
    return error("Webhook processing failed", 500);
  }
};

/**
 * Verify Dynamic webhook signature
 */
function verifyDynamicSignature(
  payload: string,
  signature: string,
  secret: string
): boolean {
  try {
    // Dynamic uses HMAC-SHA256 for webhook signatures
    // Format: "sha256=<hash>"
    const expectedSignature = crypto
      .createHmac("sha256", secret)
      .update(payload, "utf8")
      .digest("hex");

    const trusted = Buffer.from(`sha256=${expectedSignature}`, "ascii");
    const untrusted = Buffer.from(signature, "ascii");

    return crypto.timingSafeEqual(trusted, untrusted);
  } catch (err) {
    logger.error("Error verifying Dynamic signature", err as Error);
    return false;
  }
}

/**
 * Process Dynamic webhook based on event type
 */
async function processDynamicWebhook(webhookData: any): Promise<void> {
  const {
    eventName,
    eventId,
    messageId,
    userId,
    environmentId,
    environmentName,
    timestamp,
    redelivery,
    data,
  } = webhookData;

  logger.info("Processing Dynamic webhook event", {
    eventName,
    eventId,
    messageId,
    userId,
    environmentName,
    redelivery,
  });

  // Handle idempotency using messageId
  if (redelivery) {
    logger.info("Skipping redelivered webhook message", { messageId });
    return;
  }

  switch (eventName) {
    case "wallet.transferred":
      await handleWalletTransferred(data, userId, eventId, messageId);
      break;

    case "wallet.linked":
      await handleWalletLinked(data, userId, eventId, messageId);
      break;

    case "wallet.unlinked":
      await handleWalletUnlinked(data, userId, eventId, messageId);
      break;

    case "user.created":
      await handleUserCreated(data, userId, eventId, messageId);
      break;

    case "user.session.created":
      await handleUserSessionCreated(data, userId, eventId, messageId);
      break;

    default:
      logger.info("Unhandled Dynamic webhook event type", {
        eventName,
        eventId,
      });
      // Don't throw error for unknown events, just log them
      break;
  }
}

/**
 * Handle wallet.transferred event
 */
async function handleWalletTransferred(
  data: any,
  userId: string,
  eventId: string,
  messageId: string
): Promise<void> {
  try {
    logger.info("Wallet transfer detected", {
      userId,
      eventId,
      messageId,
      data,
    });

    // Extract transfer details from the event data
    const {
      fromWallet,
      toWallet,
      amount,
      currency,
      transactionHash,
      chain,
      timestamp,
    } = data;

    // Find the user by Dynamic userId
    const user = await User.findOne({ dynamicUserId: userId });
    if (!user) {
      logger.warn("User not found for Dynamic userId", { userId });
      return;
    }

    // Try to find if the recipient is a user in our system
    let recipientUser = null;
    if (toWallet !== fromWallet) {
      recipientUser = await User.findOne({ primaryWalletAddress: toWallet });
    }

    // Create a transaction record that matches the Transaction schema
    const transaction = new Transaction({
      type: "payment", // Map transfer to payment type
      fromUserId: user._id, // The user who initiated the transfer
      toUserId: recipientUser?._id || user._id, // Use recipient if found, otherwise self-transfer
      fromAddress: fromWallet,
      toAddress: toWallet,
      amount: amount.toString(),
      tokenAddress: "0x0", // Native token, adjust if needed
      sourceChain: chain,
      destinationChain: chain,
      status: "completed",
      txHash: transactionHash,
      category: recipientUser ? "payment" : "wallet_transfer",
      tags: recipientUser ? ["dynamic", "payment"] : ["dynamic", "transfer"],
      client: recipientUser ? "user_payment" : "dynamic",
      projectId: recipientUser ? "user_payment" : "wallet_transfer",
      metadata: {
        note: `Transfer from ${fromWallet.slice(0, 6)}...${fromWallet.slice(-4)} to ${toWallet.slice(0, 6)}...${toWallet.slice(-4)}`,
        category: "wallet_transfer",
        // Store additional data in metadata
        fromWallet,
        toWallet,
        chain,
        dynamicEventId: eventId,
        dynamicMessageId: messageId,
        timestamp,
        currency: currency,
      },
    });

    await transaction.save();

    // Send notification to user about the transfer
    await sendWalletTransferNotification(
      user._id.toString(),
      fromWallet,
      toWallet,
      amount,
      currency,
      transactionHash,
      recipientUser
    );

    logger.info("Successfully processed wallet transfer", {
      userId: user._id.toString(),
      eventId,
      messageId,
      transactionId: transaction._id.toString(),
    });
  } catch (err) {
    logger.error("Error handling wallet transfer", err as Error, {
      userId,
      eventId,
      messageId,
    });
  }
}

/**
 * Handle wallet.linked event
 */
async function handleWalletLinked(
  data: any,
  userId: string,
  eventId: string,
  messageId: string
): Promise<void> {
  try {
    logger.info("Wallet linked", {
      userId,
      eventId,
      messageId,
      data,
    });

    // Find the user by Dynamic userId
    const user = await User.findOne({ dynamicUserId: userId });
    if (!user) {
      logger.warn("User not found for Dynamic userId", { userId });
      return;
    }

    // Update user's wallet information
    const { walletPublicKey, walletName, provider, chain } = data;

    user.primaryWalletAddress = walletPublicKey;
    user.walletProvider = provider;
    user.chain = chain;
    user.walletName = walletName;
    user.walletLinkedAt = new Date();

    await user.save();

    // Send notification to user
    await sendWalletLinkedNotification(
      user._id.toString(),
      walletName,
      provider
    );

    logger.info("Successfully processed wallet link", {
      userId: user._id.toString(),
      eventId,
      messageId,
      walletAddress: walletPublicKey,
    });
  } catch (err) {
    logger.error("Error handling wallet link", err as Error, {
      userId,
      eventId,
      messageId,
    });
  }
}

/**
 * Handle wallet.unlinked event
 */
async function handleWalletUnlinked(
  data: any,
  userId: string,
  eventId: string,
  messageId: string
): Promise<void> {
  try {
    logger.info("Wallet unlinked", {
      userId,
      eventId,
      messageId,
      data,
    });

    // Find the user by Dynamic userId
    const user = await User.findOne({ dynamicUserId: userId });
    if (!user) {
      logger.warn("User not found for Dynamic userId", { userId });
      return;
    }

    // Clear user's wallet information
    user.walletProvider = "";
    user.walletName = "";
    user.walletLinkedAt = undefined;

    await user.save();

    // Send notification to user
    await sendWalletUnlinkedNotification(user._id.toString());

    logger.info("Successfully processed wallet unlink", {
      userId: user._id.toString(),
      eventId,
      messageId,
    });
  } catch (err) {
    logger.error("Error handling wallet unlink", err as Error, {
      userId,
      eventId,
      messageId,
    });
  }
}

/**
 * Handle user.created event
 */
async function handleUserCreated(
  data: any,
  userId: string,
  eventId: string,
  messageId: string
): Promise<void> {
  try {
    logger.info("User created", {
      userId,
      eventId,
      messageId,
      data,
    });

    // This event is typically handled when the user first signs up
    // You might want to update user metadata or send welcome notifications
    const user = await User.findOne({ dynamicUserId: userId });
    if (user) {
      // Update any additional user information if needed
      user.lastDynamicEvent = eventId;
      await user.save();
    }

    logger.info("Successfully processed user creation", {
      userId,
      eventId,
      messageId,
    });
  } catch (err) {
    logger.error("Error handling user creation", err as Error, {
      userId,
      eventId,
      messageId,
    });
  }
}

/**
 * Handle user.session.created event
 */
async function handleUserSessionCreated(
  data: any,
  userId: string,
  eventId: string,
  messageId: string
): Promise<void> {
  try {
    logger.info("User session created", {
      userId,
      eventId,
      messageId,
      data,
    });

    // This event indicates a successful authentication
    // You might want to track login activity or update last login time
    const user = await User.findOne({ dynamicUserId: userId });
    if (user) {
      user.lastLoginAt = new Date();
      user.lastDynamicEvent = eventId;
      await user.save();
    }

    logger.info("Successfully processed user session creation", {
      userId,
      eventId,
      messageId,
    });
  } catch (err) {
    logger.error("Error handling user session creation", err as Error, {
      userId,
      eventId,
      messageId,
    });
  }
}

/**
 * Send notification for wallet transfer
 */
async function sendWalletTransferNotification(
  userId: string,
  fromWallet: string,
  toWallet: string,
  amount: number,
  currency: string,
  transactionHash: string,
  recipientUser?: any
): Promise<void> {
  try {
    const isUserToUser =
      recipientUser && recipientUser._id.toString() !== userId;
    const notificationTitle = isUserToUser
      ? "Payment Sent"
      : "Wallet Transfer Completed";
    const notificationBody = isUserToUser
      ? `Successfully sent ${amount} ${currency} to ${recipientUser.displayName || recipientUser.username}`
      : `Successfully transferred ${amount} ${currency} from ${fromWallet.slice(0, 6)}...${fromWallet.slice(-4)} to ${toWallet.slice(0, 6)}...${toWallet.slice(-4)}`;

    const notificationOptions: NotificationOptions = {
      notification: {
        title: notificationTitle,
        body: notificationBody,
        icon: "/icons/success-icon.png",
        clickAction: "/transactions",
      },
      data: {
        type: "wallet_transfer",
        fromWallet,
        toWallet,
        amount: amount.toString(),
        currency,
        transactionHash,
        timestamp: new Date().toISOString(),
      },
    };

    await sendNotificationToUser(userId, notificationOptions, "payments");

    logger.info("Sent wallet transfer notification", {
      userId,
      transactionHash,
    });
  } catch (err) {
    logger.error("Error sending wallet transfer notification", err as Error, {
      userId,
      transactionHash,
    });
  }
}

/**
 * Send notification for wallet linked
 */
async function sendWalletLinkedNotification(
  userId: string,
  walletName: string,
  provider: string
): Promise<void> {
  try {
    const notificationOptions: NotificationOptions = {
      notification: {
        title: "Wallet Connected",
        body: `Your ${walletName} wallet has been successfully connected via ${provider}`,
        icon: "/icons/success-icon.png",
        clickAction: "/profile",
      },
      data: {
        type: "wallet_linked",
        walletName,
        provider,
        timestamp: new Date().toISOString(),
      },
    };

    await sendNotificationToUser(userId, notificationOptions, "account");

    logger.info("Sent wallet linked notification", {
      userId,
      walletName,
      provider,
    });
  } catch (err) {
    logger.error("Error sending wallet linked notification", err as Error, {
      userId,
      walletName,
      provider,
    });
  }
}

/**
 * Send notification for wallet unlinked
 */
async function sendWalletUnlinkedNotification(userId: string): Promise<void> {
  try {
    const notificationOptions: NotificationOptions = {
      notification: {
        title: "Wallet Disconnected",
        body: "Your wallet has been disconnected from your account",
        icon: "/icons/info-icon.png",
        clickAction: "/profile",
      },
      data: {
        type: "wallet_unlinked",
        timestamp: new Date().toISOString(),
      },
    };

    await sendNotificationToUser(userId, notificationOptions, "account");

    logger.info("Sent wallet unlinked notification", {
      userId,
    });
  } catch (err) {
    logger.error("Error sending wallet unlinked notification", err as Error, {
      userId,
    });
  }
}
