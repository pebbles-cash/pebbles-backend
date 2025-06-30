// src/handlers/webhooks.ts
import { APIGatewayProxyEvent, APIGatewayProxyResult } from "aws-lambda";
import crypto from "crypto";
import { connectToDatabase } from "../services/mongoose";
import { success, error } from "../utils/response";
import { User, FiatInteraction } from "../models";
import { logger } from "../utils/logger";
import { sendNotificationToUser } from "../services/notification-service";
import { NotificationOptions } from "../services/firebase";
import { meldService } from "../services/meld-service";

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

    const user = await findUserByMeldAccountId(accountId);
    if (!user) return;

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

    const user = await findUserByMeldAccountId(accountId);
    if (!user) return;

    await sendActionRequiredNotification(
      user._id.toString(),
      data.message || "Action required for your account"
    );
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
    // This is typically just a status update, might not need user notification
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

    const user = await findUserByMeldAccountId(accountId);
    if (!user) return;

    // Optionally notify user that their account information was updated
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

    const user = await findUserByMeldAccountId(accountId);
    if (!user) return;

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

    const user = await findUserByMeldAccountId(accountId);
    if (!user) return;

    // This indicates a new financial account (bank account, card, etc.) was added
    await sendAccountUpdateNotification(user._id.toString());
  } catch (err) {
    logger.error("Error handling financial account added", err as Error, {
      accountId,
      eventId,
    });
  }
}

/**
 * Handle new transactions added
 */
async function handleTransactionsAdded(
  data: any,
  accountId: string,
  eventId: string
): Promise<void> {
  try {
    logger.info("Transactions added", { accountId, eventId, data });

    const user = await findUserByMeldAccountId(accountId);
    if (!user) return;

    // Process each transaction in the data
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

// Helper functions

/**
 * Find user by Meld account ID
 * You'll need to store the Meld account ID in your User model
 */
async function findUserByMeldAccountId(accountId: string) {
  // You'll need to add meldAccountId field to your User model
  // For now, this is a placeholder
  return await User.findOne({ meldAccountId: accountId });
}

/**
 * Update FiatInteraction record
 */
async function updateFiatInteraction(
  externalTransactionId: string,
  updateData: any
): Promise<void> {
  try {
    await FiatInteraction.findOneAndUpdate(
      { externalTransactionId },
      { $set: updateData },
      { upsert: false }
    );
  } catch (err) {
    logger.error("Error updating FiatInteraction", err as Error, {
      externalTransactionId,
    });
  }
}

/**
 * Process financial transaction from Meld
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

    // This could be bank transactions, credit card transactions, etc.
    // Process according to your business logic

    // Example: Create a record or update user balance
    // Implementation depends on what type of financial data Meld sends
  } catch (err) {
    logger.error("Error processing financial transaction", err as Error, {
      userId,
      eventId,
    });
  }
}

// Notification functions

async function sendBankLinkingNotification(
  userId: string,
  status: "connected" | "disconnected" | "removed"
): Promise<void> {
  const messages = {
    connected: "Your bank account has been successfully connected",
    disconnected: "Your bank account has been disconnected",
    removed: "Your bank account has been removed",
  };

  const notificationOptions: NotificationOptions = {
    notification: {
      title: "Bank Account Update",
      body: messages[status],
      icon: "/icons/bank-icon.png",
      clickAction: "/settings/payments",
    },
    data: {
      type: "bank_linking",
      status,
      timestamp: new Date().toISOString(),
    },
  };

  await sendNotificationToUser(userId, notificationOptions, "security");
}

async function sendActionRequiredNotification(
  userId: string,
  message: string
): Promise<void> {
  const notificationOptions: NotificationOptions = {
    notification: {
      title: "Action Required",
      body: message,
      icon: "/icons/warning-icon.png",
      clickAction: "/settings/payments",
    },
    data: {
      type: "action_required",
      message,
      timestamp: new Date().toISOString(),
    },
  };

  await sendNotificationToUser(userId, notificationOptions, "security");
}

async function sendAccountUpdateNotification(userId: string): Promise<void> {
  const notificationOptions: NotificationOptions = {
    notification: {
      title: "Account Updated",
      body: "Your payment account information has been updated",
      icon: "/icons/account-icon.png",
      clickAction: "/settings/payments",
    },
    data: {
      type: "account_update",
      timestamp: new Date().toISOString(),
    },
  };

  await sendNotificationToUser(userId, notificationOptions, "security");
}

/**
 * Handle crypto transaction webhook updates
 * This function processes TRANSACTION_CRYPTO_* webhooks from Meld
 */
async function handleCryptoTransactionUpdate(
  eventType: string,
  data: any,
  accountId: string,
  eventId: string
): Promise<void> {
  try {
    logger.info("Processing crypto transaction webhook", {
      eventType,
      accountId,
      eventId,
      data,
    });

    // According to Meld docs, the transaction ID is in data.paymentTransactionId
    const transactionId = data.paymentTransactionId;
    if (!transactionId) {
      logger.warn("No paymentTransactionId in crypto webhook", {
        eventType,
        data,
      });
      return;
    }

    // According to Meld docs, the status is in data.paymentTransactionStatus
    const meldStatus = data.paymentTransactionStatus;
    if (!meldStatus) {
      logger.warn("No paymentTransactionStatus in crypto webhook", {
        eventType,
        data,
      });
      return;
    }

    // 1. Fetch latest transaction details from Meld API
    let transactionDetails;
    try {
      transactionDetails = await meldService.getTransaction(transactionId);
      logger.info("Fetched transaction details from Meld", {
        transactionId,
        status: transactionDetails.status,
      });
    } catch (apiError) {
      logger.error(
        "Failed to fetch transaction from Meld API",
        apiError as Error,
        {
          transactionId,
          eventType,
        }
      );
      // Continue processing with webhook data if API call fails
      transactionDetails = data;
    }

    // 2. Find user by Meld account ID
    const user = await findUserByMeldAccountId(accountId);
    if (!user) {
      logger.warn("User not found for Meld account", {
        accountId,
        transactionId,
      });
      return;
    }

    // 3. Map Meld status to FiatInteraction status
    const fiatStatus = mapMeldStatusToFiatStatus(meldStatus);

    // 4. Determine transaction type (onramp/offramp) based on event type
    const transactionType = determineTransactionType(
      eventType,
      transactionDetails
    );

    // 5. Prepare FiatInteraction data
    const fiatInteractionData: any = {
      userId: user._id,
      type: transactionType,
      status: fiatStatus,
      serviceProvider: "meld" as const,
      externalTransactionId: transactionId,
      fiatAmount: {
        value: Number(
          transactionDetails.sourceAmount || transactionDetails.fiatAmount || 0
        ),
        currency: (
          transactionDetails.sourceCurrency ||
          transactionDetails.fiatCurrency ||
          "USD"
        ).toUpperCase(),
      },
      cryptoAmount: {
        value: Number(
          transactionDetails.destinationAmount ||
            transactionDetails.cryptoAmount ||
            0
        ),
        currency: (
          transactionDetails.destinationCurrency ||
          transactionDetails.cryptoCurrency ||
          "ETH"
        ).toUpperCase(),
        tokenAddress: transactionDetails.tokenAddress,
      },
      exchangeRate: transactionDetails.exchangeRate || 0,
      fees: {
        serviceFee: {
          value: transactionDetails.fees?.serviceFee || 0,
          currency: transactionDetails.sourceCurrency || "USD",
        },
        networkFee: {
          value: transactionDetails.fees?.networkFee || 0,
          currency: transactionDetails.sourceCurrency || "USD",
        },
        totalFees: {
          value: transactionDetails.fees?.totalFees || 0,
          currency: transactionDetails.sourceCurrency || "USD",
        },
      },
      sourceAccount: {
        type: transactionType === "onramp" ? "bank_account" : "crypto_wallet",
        identifier:
          transactionDetails.sourceAccountId ||
          transactionDetails.sourceAddress ||
          "",
        name: transactionDetails.sourceAccountName || "",
        country: transactionDetails.sourceCountry,
      },
      destinationAccount: {
        type: transactionType === "onramp" ? "crypto_wallet" : "bank_account",
        identifier:
          transactionDetails.destinationAddress ||
          transactionDetails.destinationAccountId ||
          "",
        name: transactionDetails.destinationAccountName || "",
        country: transactionDetails.destinationCountry,
      },
      blockchain: transactionDetails.blockchain || "ethereum",
      transactionHash: transactionDetails.blockchainTransactionHash,
      initiatedAt: transactionDetails.createdAt
        ? new Date(transactionDetails.createdAt)
        : new Date(),
      failureReason: transactionDetails.failureReason,
      ipAddress: transactionDetails.ipAddress || "unknown",
      deviceInfo: {
        userAgent: transactionDetails.userAgent || "",
        platform: transactionDetails.platform || "",
        fingerprint: transactionDetails.deviceFingerprint || "",
      },
      kycLevel: transactionDetails.kycLevel || "none",
      metadata: {
        ...transactionDetails,
        meldCustomerId: data.customerId,
        meldExternalCustomerId: data.externalCustomerId,
        meldExternalSessionId: data.externalSessionId,
        meldPaymentTransactionStatus: meldStatus,
      },
    };

    // 6. Update timestamps based on status
    const now = new Date();
    switch (fiatStatus) {
      case "processing":
        fiatInteractionData.processingStartedAt = now;
        break;
      case "completed":
        fiatInteractionData.completedAt = now;
        break;
      case "failed":
        fiatInteractionData.failedAt = now;
        break;
      case "cancelled":
        fiatInteractionData.cancelledAt = now;
        break;
    }

    // 7. Find existing FiatInteraction or create new one
    let fiatInteraction = await FiatInteraction.findOne({
      externalTransactionId: transactionId,
      serviceProvider: "meld",
    });

    if (fiatInteraction) {
      // Update existing FiatInteraction
      await FiatInteraction.findByIdAndUpdate(fiatInteraction._id, {
        $set: fiatInteractionData,
        $push: {
          webhookEvents: {
            event: eventType,
            timestamp: now,
            data: transactionDetails,
          },
        },
      });
      logger.info("Updated existing FiatInteraction", {
        transactionId,
        meldTransactionId: transactionId,
      });
    } else {
      // Create new FiatInteraction
      const newFiatInteraction = new FiatInteraction({
        ...fiatInteractionData,
        webhookEvents: [
          {
            event: eventType,
            timestamp: now,
            data: transactionDetails,
          },
        ],
      });

      await newFiatInteraction.save();
      fiatInteraction = newFiatInteraction;
      logger.info("Created new FiatInteraction record", {
        transactionId,
        meldTransactionId: transactionId,
      });
    }

    // 8. Send notification to frontend
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
 * Determine if this is an onramp or offramp transaction
 */
function determineTransactionType(
  eventType: string,
  transactionDetails: any
): "onramp" | "offramp" {
  // Check event type first
  if (eventType.includes("ONRAMP")) {
    return "onramp";
  }
  if (eventType.includes("OFFRAMP")) {
    return "offramp";
  }

  // Check transaction details
  if (transactionDetails.type) {
    if (
      transactionDetails.type.toLowerCase().includes("buy") ||
      transactionDetails.type.toLowerCase().includes("onramp")
    ) {
      return "onramp";
    }
    if (
      transactionDetails.type.toLowerCase().includes("sell") ||
      transactionDetails.type.toLowerCase().includes("offramp")
    ) {
      return "offramp";
    }
  }

  // Default based on direction of funds
  if (
    transactionDetails.sourceCurrency &&
    transactionDetails.destinationCurrency
  ) {
    const sourceIsFiat = ["USD", "EUR", "GBP", "CAD", "AUD"].includes(
      transactionDetails.sourceCurrency.toUpperCase()
    );
    const destIsCrypto = ["ETH", "BTC", "USDC", "USDT"].includes(
      transactionDetails.destinationCurrency.toUpperCase()
    );
    const sourceIsCrypto = ["ETH", "BTC", "USDC", "USDT"].includes(
      transactionDetails.sourceCurrency.toUpperCase()
    );
    const destIsFiat = ["USD", "EUR", "GBP", "CAD", "AUD"].includes(
      transactionDetails.destinationCurrency.toUpperCase()
    );

    if (sourceIsFiat && destIsCrypto) {
      return "onramp";
    }
    if (sourceIsCrypto && destIsFiat) {
      return "offramp";
    }
  }

  // Default to onramp for crypto transactions
  return "onramp";
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
