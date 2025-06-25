// src/handlers/webhooks.ts
import { APIGatewayProxyEvent, APIGatewayProxyResult } from "aws-lambda";
import crypto from "crypto";
import { connectToDatabase } from "../services/mongoose";
import { success, error } from "../utils/response";
import { User, FiatInteraction, Transaction } from "../models";
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

    case "TRANSACTION_COMPLETED":
    case "ONRAMP_COMPLETED":
      await handleOnrampCompleted(data, accountId, eventId);
      break;

    case "TRANSACTION_FAILED":
    case "ONRAMP_FAILED":
      await handleOnrampFailed(data, accountId, eventId);
      break;

    case "OFFRAMP_COMPLETED":
      await handleOfframpCompleted(data, accountId, eventId);
      break;

    case "OFFRAMP_FAILED":
      await handleOfframpFailed(data, accountId, eventId);
      break;

    // Crypto transaction webhooks
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

/**
 * Handle onramp (fiat to crypto) completion
 */
async function handleOnrampCompleted(
  data: any,
  accountId: string,
  eventId: string
): Promise<void> {
  try {
    logger.info("Onramp completed", { accountId, eventId, data });

    const user = await findUserByMeldAccountId(accountId);
    if (!user) {
      logger.warn("User not found for completed onramp", {
        accountId,
        eventId,
      });
      return;
    }

    // Update FiatInteraction record
    await updateFiatInteraction(data.transactionId || eventId, {
      status: "completed",
      transactionHash: data.transactionHash,
      completedAt: new Date(),
    });

    // Create a Transaction record for internal tracking
    await createInternalTransaction(user._id.toString(), {
      type: "payment",
      amount: data.cryptoAmount?.value || data.amount,
      currency: data.cryptoAmount?.currency || "USD",
      sourceType: "onramp",
      externalTransactionId: data.transactionId || eventId,
      metadata: {
        provider: "meld",
        fiatAmount: data.fiatAmount,
        exchangeRate: data.exchangeRate,
      },
    });

    // Send notification to user
    await sendOnrampNotification(
      user._id.toString(),
      "completed",
      data.cryptoAmount?.value || data.amount,
      data.cryptoAmount?.currency || "USD"
    );
  } catch (err) {
    logger.error("Error handling onramp completed", err as Error, {
      accountId,
      eventId,
    });
  }
}

/**
 * Handle onramp failure
 */
async function handleOnrampFailed(
  data: any,
  accountId: string,
  eventId: string
): Promise<void> {
  try {
    logger.info("Onramp failed", { accountId, eventId, data });

    const user = await findUserByMeldAccountId(accountId);
    if (!user) return;

    // Update FiatInteraction record
    await updateFiatInteraction(data.transactionId || eventId, {
      status: "failed",
      failureReason: data.error || data.failureReason,
      failedAt: new Date(),
    });

    // Send notification to user
    await sendOnrampNotification(
      user._id.toString(),
      "failed",
      data.fiatAmount?.value || data.amount,
      data.fiatAmount?.currency || "USD",
      data.error
    );
  } catch (err) {
    logger.error("Error handling onramp failed", err as Error, {
      accountId,
      eventId,
    });
  }
}

/**
 * Handle offramp (crypto to fiat) completion
 */
async function handleOfframpCompleted(
  data: any,
  accountId: string,
  eventId: string
): Promise<void> {
  try {
    logger.info("Offramp completed", { accountId, eventId, data });

    const user = await findUserByMeldAccountId(accountId);
    if (!user) return;

    // Update FiatInteraction record
    await updateFiatInteraction(data.transactionId || eventId, {
      status: "completed",
      completedAt: new Date(),
    });

    // Create internal transaction record
    await createInternalTransaction(user._id.toString(), {
      type: "payment",
      amount: data.fiatAmount?.value || data.amount,
      currency: data.fiatAmount?.currency || "USD",
      sourceType: "offramp",
      externalTransactionId: data.transactionId || eventId,
      metadata: {
        provider: "meld",
        cryptoAmount: data.cryptoAmount,
        exchangeRate: data.exchangeRate,
      },
    });

    // Send notification to user
    await sendOfframpNotification(
      user._id.toString(),
      "completed",
      data.fiatAmount?.value || data.amount,
      data.fiatAmount?.currency || "USD"
    );
  } catch (err) {
    logger.error("Error handling offramp completed", err as Error, {
      accountId,
      eventId,
    });
  }
}

/**
 * Handle offramp failure
 */
async function handleOfframpFailed(
  data: any,
  accountId: string,
  eventId: string
): Promise<void> {
  try {
    logger.info("Offramp failed", { accountId, eventId, data });

    const user = await findUserByMeldAccountId(accountId);
    if (!user) return;

    // Update FiatInteraction record
    await updateFiatInteraction(data.transactionId || eventId, {
      status: "failed",
      failureReason: data.error || data.failureReason,
      failedAt: new Date(),
    });

    // Send notification to user
    await sendOfframpNotification(
      user._id.toString(),
      "failed",
      data.cryptoAmount?.value || data.amount,
      data.cryptoAmount?.currency || "USD",
      data.error
    );
  } catch (err) {
    logger.error("Error handling offramp failed", err as Error, {
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
 * Create internal transaction record
 */
async function createInternalTransaction(
  userId: string,
  transactionData: any
): Promise<void> {
  try {
    const transaction = new Transaction({
      type: transactionData.type,
      toUserId: userId,
      amount: transactionData.amount.toString(),
      sourceChain: "ethereum", // Default
      destinationChain: "ethereum", // Default
      status: "completed",
      category: transactionData.sourceType,
      metadata: transactionData.metadata,
    });

    await transaction.save();
  } catch (err) {
    logger.error("Error creating internal transaction", err as Error, {
      userId,
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

async function sendOnrampNotification(
  userId: string,
  status: "completed" | "failed",
  amount: string | number,
  currency: string,
  error?: string
): Promise<void> {
  const isSuccess = status === "completed";

  const notificationOptions: NotificationOptions = {
    notification: {
      title: isSuccess ? "Purchase Completed" : "Purchase Failed",
      body: isSuccess
        ? `Successfully purchased ${amount} ${currency}`
        : `Failed to purchase ${amount} ${currency}${error ? `: ${error}` : ""}`,
      icon: isSuccess ? "/icons/success-icon.png" : "/icons/error-icon.png",
      clickAction: "/transactions",
    },
    data: {
      type: "onramp",
      status,
      amount: amount.toString(),
      currency,
      error: error || "",
      timestamp: new Date().toISOString(),
    },
  };

  await sendNotificationToUser(userId, notificationOptions, "payments");
}

async function sendOfframpNotification(
  userId: string,
  status: "completed" | "failed",
  amount: string | number,
  currency: string,
  error?: string
): Promise<void> {
  const isSuccess = status === "completed";

  const notificationOptions: NotificationOptions = {
    notification: {
      title: isSuccess ? "Withdrawal Completed" : "Withdrawal Failed",
      body: isSuccess
        ? `Successfully withdrew ${amount} ${currency} to your bank account`
        : `Failed to withdraw ${amount} ${currency}${error ? `: ${error}` : ""}`,
      icon: isSuccess ? "/icons/success-icon.png" : "/icons/error-icon.png",
      clickAction: "/transactions",
    },
    data: {
      type: "offramp",
      status,
      amount: amount.toString(),
      currency,
      error: error || "",
      timestamp: new Date().toISOString(),
    },
  };

  await sendNotificationToUser(userId, notificationOptions, "payments");
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

    const transactionId = data.transactionId;
    if (!transactionId) {
      logger.warn("No transactionId in crypto webhook", { eventType, data });
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

    // 3. Update or create transaction record in database
    const updateData = {
      meldTransactionId: transactionId,
      meldStatus: transactionDetails.status || eventType,
      meldDetails: transactionDetails,
      updatedAt: new Date(),
    };

    // Try to find existing transaction by Meld transaction ID
    let transaction = await Transaction.findOne({
      meldTransactionId: transactionId,
    });

    if (transaction) {
      // Update existing transaction
      await Transaction.findByIdAndUpdate(transaction._id, updateData);
      logger.info("Updated existing transaction", {
        transactionId,
        meldTransactionId: transactionId,
      });
    } else {
      // Create new transaction record if it doesn't exist
      // This might happen if the webhook is received before the transaction is created in your system
      const newTransaction = new Transaction({
        type: "payment", // Default type, adjust based on your business logic
        toUserId: user._id,
        toAddress:
          transactionDetails.destinationAddress || user.primaryWalletAddress,
        amount: transactionDetails.destinationAmount?.toString() || "0",
        sourceChain: "ethereum", // Default, adjust based on transaction details
        destinationChain: "ethereum", // Default, adjust based on transaction details
        status: mapMeldStatusToInternalStatus(
          transactionDetails.status || eventType
        ),
        category: "crypto_deposit",
        ...updateData,
      });

      await newTransaction.save();
      transaction = newTransaction;
      logger.info("Created new transaction record", {
        transactionId,
        meldTransactionId: transactionId,
      });
    }

    // 4. Send notification to frontend
    await sendCryptoTransactionNotification(
      user._id.toString(),
      eventType,
      transactionDetails,
      transaction._id.toString()
    );

    logger.info("Successfully processed crypto transaction webhook", {
      eventType,
      transactionId,
      userId: user._id.toString(),
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
 * Map Meld transaction status to internal status
 */
function mapMeldStatusToInternalStatus(
  meldStatus: string
): "pending" | "completed" | "failed" {
  switch (meldStatus) {
    case "PENDING":
    case "TRANSFERRING":
      return "pending";
    case "COMPLETED":
    case "SETTLED":
      return "completed";
    case "FAILED":
    case "CANCELLED":
      return "failed";
    default:
      return "pending";
  }
}

/**
 * Send notification for crypto transaction updates
 */
async function sendCryptoTransactionNotification(
  userId: string,
  eventType: string,
  transactionDetails: any,
  transactionId: string
): Promise<void> {
  try {
    const statusMessages = {
      TRANSACTION_CRYPTO_PENDING: "Your crypto deposit is being processed",
      TRANSACTION_CRYPTO_TRANSFERRING:
        "Your crypto deposit is being transferred",
      TRANSACTION_CRYPTO_COMPLETE: "Your crypto deposit has been completed",
      TRANSACTION_CRYPTO_FAILED: "Your crypto deposit has failed",
    };

    const isSuccess = eventType === "TRANSACTION_CRYPTO_COMPLETE";
    const isFailure = eventType === "TRANSACTION_CRYPTO_FAILED";

    const notificationOptions: NotificationOptions = {
      notification: {
        title: isSuccess
          ? "Deposit Completed"
          : isFailure
            ? "Deposit Failed"
            : "Deposit Update",
        body:
          statusMessages[eventType as keyof typeof statusMessages] ||
          "Your deposit status has been updated",
        icon: isSuccess
          ? "/icons/success-icon.png"
          : isFailure
            ? "/icons/error-icon.png"
            : "/icons/info-icon.png",
        clickAction: "/transactions",
      },
      data: {
        type: "crypto_transaction",
        eventType,
        transactionId,
        status: transactionDetails.status,
        amount: transactionDetails.destinationAmount?.toString() || "",
        currency: transactionDetails.destinationCurrency || "",
        timestamp: new Date().toISOString(),
      },
    };

    await sendNotificationToUser(userId, notificationOptions, "payments");

    logger.info("Sent crypto transaction notification", {
      userId,
      eventType,
      transactionId,
    });
  } catch (err) {
    logger.error(
      "Error sending crypto transaction notification",
      err as Error,
      {
        userId,
        eventType,
        transactionId,
      }
    );
  }
}
