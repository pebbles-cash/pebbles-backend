// src/handlers/webhooks/meld.ts
import { APIGatewayProxyEvent, APIGatewayProxyResult } from "aws-lambda";
import crypto from "crypto";
import { connectToDatabase } from "../../services/mongoose";
import { success, error } from "../../utils/response";
import { User, FiatInteraction } from "../../models";
import { logger } from "../../utils/logger";
import { sendNotificationToUser } from "../../services/notification-service";
import { NotificationOptions } from "../../services/firebase";
import { meldService } from "../../services/meld-service";

/**
 * Handle Meld webhook events
 * POST /api/webhooks/meld
 */
export const handleMeldWebhook = async (
  event: APIGatewayProxyEvent
): Promise<APIGatewayProxyResult> => {
  try {
    await connectToDatabase();

    // Get webhook payload
    if (!event.body) {
      logger.warn("Meld webhook received without body");
      return error("Webhook payload is required", 400);
    }

    // Verify webhook signature
    const signature =
      event.headers["meld-signature"] || event.headers["Meld-Signature"];
    const webhookSecret = process.env.MELD_WEBHOOK_SECRET;

    if (!webhookSecret) {
      logger.error("MELD_WEBHOOK_SECRET not configured");
      return error("Webhook secret not configured", 500);
    }

    if (!signature) {
      logger.warn("Meld webhook received without signature");
      return error("Webhook signature is required", 401);
    }

    // Verify the signature
    const isValidSignature = verifyMeldSignature(
      event.body,
      signature,
      webhookSecret
    );
    if (!isValidSignature) {
      logger.warn("Invalid Meld webhook signature", { signature });
      return error("Invalid webhook signature", 401);
    }

    // Parse webhook payload
    let webhookData;
    try {
      webhookData = JSON.parse(event.body);
    } catch (parseError) {
      logger.error("Failed to parse Meld webhook payload", parseError as Error);
      return error("Invalid JSON payload", 400);
    }

    logger.info("Received Meld webhook", {
      eventType: webhookData.type,
      eventId: webhookData.id,
      accountId: webhookData.accountId,
    });

    // Process the webhook based on event type
    await processMeldWebhook(webhookData);

    // Return success response quickly (Meld expects fast response)
    return success({ received: true });
  } catch (err) {
    logger.error("Meld webhook processing error", err as Error);
    return error("Webhook processing failed", 500);
  }
};

/**
 * Verify Meld webhook signature
 */
function verifyMeldSignature(
  payload: string,
  signature: string,
  secret: string
): boolean {
  try {
    // Meld typically uses HMAC-SHA256 for webhook signatures
    // Format might be "sha256=<hash>" or just the hash
    const expectedSignature = crypto
      .createHmac("sha256", secret)
      .update(payload, "utf8")
      .digest("hex");

    // Handle different signature formats
    const receivedSignature = signature.startsWith("sha256=")
      ? signature.slice(7)
      : signature;

    // Use timingSafeEqual to prevent timing attacks
    const expectedBuffer = Buffer.from(expectedSignature, "hex");
    const receivedBuffer = Buffer.from(receivedSignature, "hex");

    return (
      expectedBuffer.length === receivedBuffer.length &&
      crypto.timingSafeEqual(expectedBuffer, receivedBuffer)
    );
  } catch (err) {
    logger.error("Error verifying Meld signature", err as Error);
    return false;
  }
}

/**
 * Process Meld webhook based on event type
 */
async function processMeldWebhook(webhookData: any): Promise<void> {
  const { type: eventType, data, accountId, id: eventId } = webhookData;

  logger.info("Processing Meld webhook event", {
    eventType,
    eventId,
    accountId,
  });

  switch (eventType) {
    case "BANK_LINKING_CONNECTION_COMPLETED":
      await handleBankLinkingCompleted(data, accountId, eventId);
      break;

    case "BANK_LINKING_CONNECTION_DELETED":
      await handleBankLinkingDeleted(data, accountId, eventId);
      break;

    case "BANK_LINKING_CUSTOMER_ACTION_REQUIRED":
      await handleCustomerActionRequired(data, accountId, eventId);
      break;

    case "BANK_LINKING_ACCOUNTS_UPDATING":
      await handleAccountsUpdating(data, accountId, eventId);
      break;

    case "BANK_LINKING_ACCOUNTS_UPDATED":
      await handleAccountsUpdated(data, accountId, eventId);
      break;

    case "BANK_LINKING_ACCOUNTS_REMOVED":
      await handleAccountsRemoved(data, accountId, eventId);
      break;

    case "FINANCIAL_ACCOUNT_ADDED":
      await handleFinancialAccountAdded(data, accountId, eventId);
      break;

    case "FINANCIAL_ACCOUNT_TRANSACTIONS_ADDED":
      await handleTransactionsAdded(data, accountId, eventId);
      break;

    // Crypto transaction webhooks - handled by FiatInteraction
    case "TRANSACTION_CRYPTO_PENDING":
    case "TRANSACTION_CRYPTO_TRANSFERRING":
    case "TRANSACTION_CRYPTO_COMPLETE":
    case "TRANSACTION_CRYPTO_FAILED":
      await handleCryptoTransactionUpdate(eventType, data, accountId, eventId);
      break;

    default:
      logger.info("Unhandled Meld webhook event type", { eventType, eventId });
      // Don't throw error for unknown events, just log them
      break;
  }
}

/**
 * Handle bank linking completion
 */
async function handleBankLinkingCompleted(
  data: any,
  accountId: string,
  eventId: string
): Promise<void> {
  try {
    logger.info("Bank linking completed", { accountId, eventId, data });

    // Find user by Meld account ID (you'll need to store this mapping)
    const user = await findUserByMeldAccountId(accountId);
    if (!user) {
      logger.warn("User not found for Meld account", { accountId });
      return;
    }

    // Send notification to user
    await sendBankLinkingNotification(user._id.toString(), "connected");
  } catch (err) {
    logger.error("Error handling bank linking completed", err as Error, {
      accountId,
      eventId,
    });
  }
}

/**
 * Handle bank linking deletion
 */
async function handleBankLinkingDeleted(
  data: any,
  accountId: string,
  eventId: string
): Promise<void> {
  try {
    logger.info("Bank linking deleted", { accountId, eventId, data });

    // Find user by Meld account ID
    const user = await findUserByMeldAccountId(accountId);
    if (!user) {
      logger.warn("User not found for Meld account", { accountId });
      return;
    }

    // Send notification to user
    await sendBankLinkingNotification(user._id.toString(), "disconnected");
  } catch (err) {
    logger.error("Error handling bank linking deleted", err as Error, {
      accountId,
      eventId,
    });
  }
}

/**
 * Handle customer action required
 */
async function handleCustomerActionRequired(
  data: any,
  accountId: string,
  eventId: string
): Promise<void> {
  try {
    logger.info("Customer action required", { accountId, eventId, data });

    // Find user by Meld account ID
    const user = await findUserByMeldAccountId(accountId);
    if (!user) {
      logger.warn("User not found for Meld account", { accountId });
      return;
    }

    // Send notification to user about required action
    const message = data.message || "Action required for your bank account";
    await sendActionRequiredNotification(user._id.toString(), message);
  } catch (err) {
    logger.error("Error handling customer action required", err as Error, {
      accountId,
      eventId,
    });
  }
}

/**
 * Handle accounts updating
 */
async function handleAccountsUpdating(
  data: any,
  accountId: string,
  eventId: string
): Promise<void> {
  try {
    logger.info("Accounts updating", { accountId, eventId, data });

    // Find user by Meld account ID
    const user = await findUserByMeldAccountId(accountId);
    if (!user) {
      logger.warn("User not found for Meld account", { accountId });
      return;
    }

    // You might want to update user's account status
    logger.info("Accounts are being updated for user", {
      userId: user._id.toString(),
    });
  } catch (err) {
    logger.error("Error handling accounts updating", err as Error, {
      accountId,
      eventId,
    });
  }
}

/**
 * Handle accounts updated
 */
async function handleAccountsUpdated(
  data: any,
  accountId: string,
  eventId: string
): Promise<void> {
  try {
    logger.info("Accounts updated", { accountId, eventId, data });

    // Find user by Meld account ID
    const user = await findUserByMeldAccountId(accountId);
    if (!user) {
      logger.warn("User not found for Meld account", { accountId });
      return;
    }

    // Send notification to user
    await sendAccountUpdateNotification(user._id.toString());
  } catch (err) {
    logger.error("Error handling accounts updated", err as Error, {
      accountId,
      eventId,
    });
  }
}

/**
 * Handle accounts removed
 */
async function handleAccountsRemoved(
  data: any,
  accountId: string,
  eventId: string
): Promise<void> {
  try {
    logger.info("Accounts removed", { accountId, eventId, data });

    // Find user by Meld account ID
    const user = await findUserByMeldAccountId(accountId);
    if (!user) {
      logger.warn("User not found for Meld account", { accountId });
      return;
    }

    // Send notification to user
    await sendBankLinkingNotification(user._id.toString(), "removed");
  } catch (err) {
    logger.error("Error handling accounts removed", err as Error, {
      accountId,
      eventId,
    });
  }
}

/**
 * Handle financial account added
 */
async function handleFinancialAccountAdded(
  data: any,
  accountId: string,
  eventId: string
): Promise<void> {
  try {
    logger.info("Financial account added", { accountId, eventId, data });

    // Find user by Meld account ID
    const user = await findUserByMeldAccountId(accountId);
    if (!user) {
      logger.warn("User not found for Meld account", { accountId });
      return;
    }

    // Process the new financial account
    await processFinancialTransaction(user._id.toString(), data, eventId);
  } catch (err) {
    logger.error("Error handling financial account added", err as Error, {
      accountId,
      eventId,
    });
  }
}

/**
 * Handle transactions added
 */
async function handleTransactionsAdded(
  data: any,
  accountId: string,
  eventId: string
): Promise<void> {
  try {
    logger.info("Transactions added", { accountId, eventId, data });

    // Find user by Meld account ID
    const user = await findUserByMeldAccountId(accountId);
    if (!user) {
      logger.warn("User not found for Meld account", { accountId });
      return;
    }

    // Process each transaction
    if (data.transactions && Array.isArray(data.transactions)) {
      for (const transaction of data.transactions) {
        await processFinancialTransaction(
          user._id.toString(),
          transaction,
          eventId
        );
      }
    }
  } catch (err) {
    logger.error("Error handling transactions added", err as Error, {
      accountId,
      eventId,
    });
  }
}

/**
 * Find user by Meld account ID
 */
async function findUserByMeldAccountId(accountId: string) {
  // You'll need to implement this based on how you store the mapping
  // between Meld account IDs and your user IDs
  return await User.findOne({ meldAccountId: accountId });
}

/**
 * Process financial transaction
 */
async function processFinancialTransaction(
  userId: string,
  transaction: any,
  eventId: string
): Promise<void> {
  try {
    logger.info("Processing financial transaction", {
      userId,
      transactionId: transaction.id,
      eventId,
    });

    // Create or update FiatInteraction record
    const fiatInteraction = new FiatInteraction({
      userId,
      type: "onramp", // or determine based on transaction type
      status: "completed",
      serviceProvider: "meld",
      externalTransactionId: transaction.id,
      fiatAmount: {
        value: transaction.amount,
        currency: transaction.currency,
      },
      cryptoAmount: {
        value: transaction.cryptoAmount,
        currency: transaction.cryptoCurrency,
      },
      exchangeRate: transaction.exchangeRate,
      fees: transaction.fees,
      sourceAccount: transaction.sourceAccount,
      destinationAccount: transaction.destinationAccount,
      blockchain: transaction.blockchain,
      transactionHash: transaction.transactionHash,
      initiatedAt: new Date(transaction.createdAt),
      completedAt: new Date(transaction.completedAt),
      ipAddress: transaction.ipAddress,
      deviceInfo: transaction.deviceInfo,
      kycLevel: transaction.kycLevel,
      metadata: {
        meldEventId: eventId,
        ...transaction.metadata,
      },
    });

    await fiatInteraction.save();

    logger.info("Successfully processed financial transaction", {
      userId,
      transactionId: transaction.id,
      fiatInteractionId: fiatInteraction._id.toString(),
    });
  } catch (err) {
    logger.error("Error processing financial transaction", err as Error, {
      userId,
      transactionId: transaction.id,
      eventId,
    });
  }
}

/**
 * Send bank linking notification
 */
async function sendBankLinkingNotification(
  userId: string,
  status: "connected" | "disconnected" | "removed"
): Promise<void> {
  try {
    const statusMessages = {
      connected: "Your bank account has been successfully connected",
      disconnected: "Your bank account has been disconnected",
      removed: "Your bank account has been removed",
    };

    const notificationOptions: NotificationOptions = {
      notification: {
        title: "Bank Account Update",
        body: statusMessages[status],
        icon: "/icons/bank-icon.png",
        clickAction: "/fiat-interactions",
      },
      data: {
        type: "bank_linking",
        status,
        timestamp: new Date().toISOString(),
      },
    };

    await sendNotificationToUser(userId, notificationOptions, "payments");

    logger.info("Sent bank linking notification", { userId, status });
  } catch (err) {
    logger.error("Error sending bank linking notification", err as Error, {
      userId,
      status,
    });
  }
}

/**
 * Send action required notification
 */
async function sendActionRequiredNotification(
  userId: string,
  message: string
): Promise<void> {
  try {
    const notificationOptions: NotificationOptions = {
      notification: {
        title: "Action Required",
        body: message,
        icon: "/icons/alert-icon.png",
        clickAction: "/fiat-interactions",
      },
      data: {
        type: "action_required",
        message,
        timestamp: new Date().toISOString(),
      },
    };

    await sendNotificationToUser(userId, notificationOptions, "payments");

    logger.info("Sent action required notification", { userId, message });
  } catch (err) {
    logger.error("Error sending action required notification", err as Error, {
      userId,
      message,
    });
  }
}

/**
 * Send account update notification
 */
async function sendAccountUpdateNotification(userId: string): Promise<void> {
  try {
    const notificationOptions: NotificationOptions = {
      notification: {
        title: "Account Updated",
        body: "Your bank account information has been updated",
        icon: "/icons/success-icon.png",
        clickAction: "/fiat-interactions",
      },
      data: {
        type: "account_updated",
        timestamp: new Date().toISOString(),
      },
    };

    await sendNotificationToUser(userId, notificationOptions, "payments");

    logger.info("Sent account update notification", { userId });
  } catch (err) {
    logger.error("Error sending account update notification", err as Error, {
      userId,
    });
  }
}

/**
 * Handle crypto transaction update
 */
async function handleCryptoTransactionUpdate(
  eventType: string,
  data: any,
  accountId: string,
  eventId: string
): Promise<void> {
  try {
    logger.info("Crypto transaction update", {
      eventType,
      accountId,
      eventId,
      data,
    });

    // Find user by Meld account ID
    const user = await findUserByMeldAccountId(accountId);
    if (!user) {
      logger.warn("User not found for Meld account", { accountId });
      return;
    }

    const transactionDetails = data.transaction || data;
    const transactionId =
      transactionDetails.id || transactionDetails.transactionId;

    if (!transactionId) {
      logger.warn("No transaction ID found in crypto transaction update", {
        eventType,
        accountId,
        eventId,
      });
      return;
    }

    // Find existing FiatInteraction
    const fiatInteraction = await FiatInteraction.findOne({
      externalTransactionId: transactionId,
    });

    if (!fiatInteraction) {
      logger.warn("FiatInteraction not found for transaction", {
        transactionId,
        eventType,
      });
      return;
    }

    // Update status based on event type
    const newStatus = mapMeldStatusToFiatStatus(eventType);
    const updateData: any = {
      status: newStatus,
    };

    // Add timestamps based on status
    switch (newStatus) {
      case "processing":
        updateData.processingStartedAt = new Date();
        break;
      case "completed":
        updateData.completedAt = new Date();
        break;
      case "failed":
        updateData.failedAt = new Date();
        updateData.failureReason =
          transactionDetails.failureReason || "Unknown error";
        break;
    }

    // Update the FiatInteraction
    Object.assign(fiatInteraction, updateData);
    await fiatInteraction.save();

    // Add webhook event to the interaction
    await fiatInteraction.addWebhookEvent(eventType, {
      meldEventId: eventId,
      timestamp: new Date(),
      data: transactionDetails,
    });

    // Send notification to user
    await sendFiatInteractionNotification(
      user._id.toString(),
      eventType,
      transactionDetails,
      fiatInteraction._id.toString()
    );

    logger.info("Successfully processed crypto transaction webhook", {
      eventType,
      transactionId,
      userId: user._id.toString(),
      customerId: fiatInteraction._id.toString(),
    });
  } catch (err) {
    logger.error("Error handling crypto transaction update", err as Error, {
      eventType,
      accountId,
      eventId,
      data,
    });
  }
}

/**
 * Map Meld transaction status to FiatInteraction status
 */
function mapMeldStatusToFiatStatus(
  meldStatus: string
): "pending" | "processing" | "completed" | "failed" | "cancelled" | "expired" {
  switch (meldStatus) {
    case "PENDING":
      return "pending";
    case "SETTLING":
    case "TRANSFERRING":
    case "PROCESSING":
      return "processing";
    case "SETTLED":
    case "COMPLETED":
      return "completed";
    case "ERROR":
    case "FAILED":
      return "failed";
    case "CANCELLED":
      return "cancelled";
    case "EXPIRED":
      return "expired";
    default:
      logger.warn("Unknown Meld status, defaulting to pending", { meldStatus });
      return "pending";
  }
}

/**
 * Send notification for FiatInteraction updates
 */
async function sendFiatInteractionNotification(
  userId: string,
  eventType: string,
  transactionDetails: any,
  customerId: string
): Promise<void> {
  try {
    const statusMessages = {
      TRANSACTION_CRYPTO_PENDING: "Your crypto transaction is being processed",
      TRANSACTION_CRYPTO_TRANSFERRING:
        "Your crypto transaction is being transferred",
      TRANSACTION_CRYPTO_COMPLETE: "Your crypto transaction has been completed",
      TRANSACTION_CRYPTO_FAILED: "Your crypto transaction has failed",
      ONRAMP_COMPLETED: "Your crypto purchase has been completed",
      ONRAMP_FAILED: "Your crypto purchase has failed",
      OFFRAMP_COMPLETED: "Your crypto withdrawal has been completed",
      OFFRAMP_FAILED: "Your crypto withdrawal has failed",
    };

    const isSuccess = eventType.includes("COMPLETED");
    const isFailure = eventType.includes("FAILED");
    const isOnramp =
      eventType.includes("ONRAMP") ||
      (eventType.includes("CRYPTO") && !eventType.includes("OFFRAMP"));
    const isOfframp =
      eventType.includes("OFFRAMP") ||
      (eventType.includes("CRYPTO") && eventType.includes("OFFRAMP"));

    const transactionType = isOnramp
      ? "Purchase"
      : isOfframp
        ? "Withdrawal"
        : "Transaction";

    const notificationOptions: NotificationOptions = {
      notification: {
        title: isSuccess
          ? `${transactionType} Completed`
          : isFailure
            ? `${transactionType} Failed`
            : `${transactionType} Update`,
        body:
          statusMessages[eventType as keyof typeof statusMessages] ||
          "Your transaction status has been updated",
        icon: isSuccess
          ? "/icons/success-icon.png"
          : isFailure
            ? "/icons/error-icon.png"
            : "/icons/info-icon.png",
        clickAction: "/fiat-interactions",
      },
      data: {
        type: "fiat_interaction",
        eventType,
        customerId,
        status:
          transactionDetails.paymentTransactionStatus ||
          transactionDetails.status,
        amount:
          transactionDetails.destinationAmount?.toString() ||
          transactionDetails.sourceAmount?.toString() ||
          "",
        currency:
          transactionDetails.destinationCurrency ||
          transactionDetails.sourceCurrency ||
          "",
        timestamp: new Date().toISOString(),
      },
    };

    await sendNotificationToUser(userId, notificationOptions, "payments");

    logger.info("Sent FiatInteraction notification", {
      userId,
      eventType,
      customerId,
    });
  } catch (err) {
    logger.error("Error sending FiatInteraction notification", err as Error, {
      userId,
      eventType,
      customerId,
    });
  }
}
