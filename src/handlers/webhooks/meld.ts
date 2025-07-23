// src/handlers/webhooks/meld.ts
import { APIGatewayProxyEvent, APIGatewayProxyResult } from "aws-lambda";
import crypto from "crypto";
import { connectToDatabase } from "../../services/mongoose";
import { success, error } from "../../utils/response";
import { User, FiatInteraction } from "../../models";
import { logger } from "../../utils/logger";
import {
  sendNotificationToUser,
  storeNotification,
} from "../../services/notification-service";
import { NotificationOptions } from "../../services/firebase";
import { meldService } from "../../services/meld-service";
import { MELD_WEBHOOK_SECRET } from "../../config/env";

/**
 * Handle Meld webhook events
 * POST /api/webhooks/meld
 */
export const handleMeldWebhook = async (
  event: APIGatewayProxyEvent
): Promise<APIGatewayProxyResult> => {
  try {
    await connectToDatabase();

    // Log the incoming webhook request
    logger.info("Meld webhook received", {
      hasBody: !!event.body,
      bodyLength: event.body?.length,
      headers: event.headers,
      method: event.httpMethod,
      path: event.path,
      requestContext: event.requestContext,
    });

    // Get webhook payload
    if (!event.body) {
      logger.warn("Meld webhook received without body");
      return error("Webhook payload is required", 400);
    }

    // Verify webhook signature
    const signature = event.headers["meld-signature"];
    const webhookSecret = MELD_WEBHOOK_SECRET;

    logger.info("Webhook signature verification setup", {
      hasSignature: !!signature,
      signatureLength: signature?.length,
      hasSecret: !!webhookSecret,
      secretLength: webhookSecret?.length,
    });

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
      webhookSecret,
      event
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
      eventType: webhookData.eventType,
      eventId: webhookData.eventId,
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
  secret: string,
  event: APIGatewayProxyEvent
): boolean {
  try {
    // Get timestamp and URL from headers
    const timestamp = event.headers["meld-signature-timestamp"];

    // Log all headers for debugging
    logger.info("Webhook headers received", {
      headers: event.headers,
      signature: signature,
      hasTimestamp: !!timestamp,
      timestamp: timestamp,
    });

    // Construct the full webhook URL
    let url: string;
    if (event.requestContext?.domainName && event.requestContext?.path) {
      // For API Gateway, construct the full URL
      // Use https since webhooks come over HTTPS, not HTTP/1.1 (which is the HTTP version)
      const protocol = "https";
      const domain = event.requestContext.domainName;
      const path = event.requestContext.path;
      url = `${protocol}://${domain}${path}`;

      logger.info("Constructed webhook URL from API Gateway context", {
        protocol,
        domain,
        path,
        url,
        requestContext: event.requestContext,
      });
    } else {
      // Fallback URL - you should replace this with your actual webhook URL
      url = "https://your-api-domain.com/api/webhooks/meld";

      logger.warn("Using fallback webhook URL - this may be incorrect", {
        url,
        requestContext: event.requestContext,
      });
    }

    if (!timestamp) {
      logger.warn("Missing meld-signature-timestamp in webhook headers");
      return false;
    }

    // Log the data being signed
    const data = [timestamp, url, payload].join(".");
    logger.info("Signature verification data", {
      timestamp,
      url,
      payloadLength: payload.length,
      dataLength: data.length,
      dataPreview: data.substring(0, 100) + (data.length > 100 ? "..." : ""),
    });

    // Create signature using the same format as documented: timestamp.url.body
    const hmac = crypto.createHmac("sha256", secret);
    hmac.update(data, "utf8");
    const expectedSignature = hmac.digest("base64");

    // The signature should be in base64 format as shown in the docs
    const receivedSignature = signature;

    logger.info("Signature comparison", {
      expectedSignature,
      receivedSignature,
      expectedLength: expectedSignature.length,
      receivedLength: receivedSignature.length,
      secretConfigured: !!secret,
      secretLength: secret.length,
    });

    // Use timingSafeEqual to prevent timing attacks
    const expectedBuffer = Buffer.from(expectedSignature, "base64");
    const receivedBuffer = Buffer.from(receivedSignature, "base64");

    const isValid =
      expectedBuffer.length === receivedBuffer.length &&
      crypto.timingSafeEqual(expectedBuffer, receivedBuffer);

    logger.info("Signature verification result", {
      isValid,
      expectedBufferLength: expectedBuffer.length,
      receivedBufferLength: receivedBuffer.length,
      bufferLengthsMatch: expectedBuffer.length === receivedBuffer.length,
    });

    return isValid;
  } catch (err) {
    logger.error("Error verifying Meld signature", err as Error, {
      signature,
      hasSecret: !!secret,
      secretLength: secret?.length,
      payloadLength: payload?.length,
    });
    return false;
  }
}

/**
 * Process Meld webhook based on event type
 */
async function processMeldWebhook(webhookData: any): Promise<void> {
  const { eventType, payload, accountId, eventId } = webhookData;

  logger.info("Processing Meld webhook event", {
    eventType,
    eventId,
    accountId,
  });

  switch (eventType) {
    case "BANK_LINKING_CONNECTION_COMPLETED":
      await handleBankLinkingCompleted(payload, accountId, eventId);
      break;

    case "BANK_LINKING_CONNECTION_DELETED":
      await handleBankLinkingDeleted(payload, accountId, eventId);
      break;

    case "BANK_LINKING_CUSTOMER_ACTION_REQUIRED":
      await handleCustomerActionRequired(payload, accountId, eventId);
      break;

    case "BANK_LINKING_ACCOUNTS_UPDATING":
      await handleAccountsUpdating(payload, accountId, eventId);
      break;

    case "BANK_LINKING_ACCOUNTS_UPDATED":
      await handleAccountsUpdated(payload, accountId, eventId);
      break;

    case "BANK_LINKING_ACCOUNTS_REMOVED":
      await handleAccountsRemoved(payload, accountId, eventId);
      break;

    case "FINANCIAL_ACCOUNT_ADDED":
      await handleFinancialAccountAdded(payload, accountId, eventId);
      break;

    case "FINANCIAL_ACCOUNT_TRANSACTIONS_ADDED":
      await handleTransactionsAdded(payload, accountId, eventId);
      break;

    // Crypto transaction webhooks - handled by FiatInteraction
    case "TRANSACTION_CRYPTO_PENDING":
    case "TRANSACTION_CRYPTO_TRANSFERRING":
    case "TRANSACTION_CRYPTO_COMPLETE":
    case "TRANSACTION_CRYPTO_FAILED":
      await handleCryptoTransactionUpdate(
        eventType,
        payload,
        accountId,
        eventId
      );
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

    // Find user by Meld identifiers
    const user = await findUserByMeldIdentifiers(accountId);
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

    // Find user by Meld identifiers
    const user = await findUserByMeldIdentifiers(accountId);
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

    // Find user by Meld identifiers
    const user = await findUserByMeldIdentifiers(accountId);
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

    // Find user by Meld identifiers
    const user = await findUserByMeldIdentifiers(accountId);
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

    // Find user by Meld identifiers
    const user = await findUserByMeldIdentifiers(accountId);
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

    // Find user by Meld identifiers
    const user = await findUserByMeldIdentifiers(accountId);
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

    // Find user by Meld identifiers
    const user = await findUserByMeldIdentifiers(accountId);
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

    // Find user by Meld identifiers
    const user = await findUserByMeldIdentifiers(accountId);
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
 * Find user by Meld identifiers (for future use when user assignment is needed)
 */
async function findUserByMeldIdentifiers(
  accountId: string,
  customerId?: string,
  sessionId?: string,
  paymentTransactionId?: string
) {
  logger.info("Looking for user by Meld identifiers", {
    accountId,
    customerId,
    sessionId,
    paymentTransactionId,
  });

  // Strategy 1: Look for existing FiatInteraction with any of these identifiers
  const fiatInteraction = await FiatInteraction.findOne({
    $or: [
      { meldAccountId: accountId },
      { meldCustomerId: customerId },
      { meldSessionId: sessionId },
      { meldPaymentTransactionId: paymentTransactionId },
      { externalTransactionId: paymentTransactionId }, // Legacy field
    ].filter(Boolean), // Remove undefined values
  });

  if (fiatInteraction && fiatInteraction.userId) {
    logger.info("Found user via FiatInteraction", {
      userId: fiatInteraction.userId,
      fiatInteractionId: fiatInteraction._id,
      meldAccountId: fiatInteraction.meldAccountId,
      meldCustomerId: fiatInteraction.meldCustomerId,
    });

    // Return the user associated with this FiatInteraction
    return await User.findById(fiatInteraction.userId);
  }

  // Strategy 2: Look for user by customerId in metadata
  // This is the primary identification method - customerId is stored in user metadata
  const userByCustomerId = await User.findOne({
    $or: [
      { "metadata.meldCustomerId": customerId },
      { "metadata.customerId": customerId },
      { "metadata.meldAccountId": accountId },
    ].filter(Boolean),
  });

  if (userByCustomerId) {
    logger.info("Found user via customer ID", {
      userId: userByCustomerId._id,
      customerId,
      accountId,
    });
    return userByCustomerId;
  }

  logger.warn("No user found for any Meld identifiers", {
    accountId,
    customerId,
    sessionId,
    paymentTransactionId,
  });

  return null;
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
      transactionId: transaction.paymentTransactionId,
      eventId,
    });

    // Check if FiatInteraction already exists for this transaction
    const existingInteraction = await FiatInteraction.findOne({
      meldPaymentTransactionId: transaction.paymentTransactionId,
      userId: userId,
    });

    if (existingInteraction) {
      logger.info("FiatInteraction already exists for transaction", {
        transactionId: transaction.paymentTransactionId,
        fiatInteractionId: existingInteraction._id.toString(),
      });
      return;
    }

    // Create new FiatInteraction record
    const fiatInteraction = new FiatInteraction({
      userId,
      type: "onramp", // or determine based on transaction type
      status: "completed",
      serviceProvider: "meld",
      // Meld-specific fields
      meldPaymentTransactionId: transaction.paymentTransactionId,
      meldRequestId: transaction.requestId,
      meldAccountId: transaction.accountId,
      meldProfileId: transaction.profileId,
      meldExternalCustomerId: transaction.externalCustomerId,
      meldExternalSessionId: transaction.externalSessionId,
      meldTransactionType: transaction.transactionType,
      meldPaymentTransactionStatus: transaction.paymentTransactionStatus,
      // Legacy field for backward compatibility
      externalTransactionId: transaction.paymentTransactionId,
      // Note: Some fields may not be available in the webhook payload
      // and would need to be populated from other sources
      fiatAmount: {
        value: transaction.amount || 0,
        currency: transaction.currency || "USD",
      },
      cryptoAmount: {
        value: transaction.cryptoAmount || 0,
        currency: transaction.cryptoCurrency || "BTC",
      },
      exchangeRate: transaction.exchangeRate,
      fees: transaction.fees,
      sourceAccount: transaction.sourceAccount,
      destinationAccount: transaction.destinationAccount,
      blockchain: transaction.blockchain,
      transactionHash: transaction.transactionHash,
      initiatedAt: new Date(transaction.createdAt || Date.now()),
      completedAt: new Date(transaction.completedAt || Date.now()),
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
      transactionId: transaction.paymentTransactionId,
      fiatInteractionId: fiatInteraction._id.toString(),
    });
  } catch (err) {
    logger.error("Error processing financial transaction", err as Error, {
      userId,
      transactionId: transaction.paymentTransactionId,
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

    // Store notification in database
    await storeNotification(
      userId,
      "action_required",
      notificationOptions.notification?.title || "Action Required",
      notificationOptions.notification?.body || message,
      {
        clickAction: notificationOptions.notification?.clickAction,
        metadata: notificationOptions.data,
      }
    );

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
  payload: any,
  accountId: string,
  eventId: string
): Promise<void> {
  try {
    logger.info("Crypto transaction update", {
      eventType,
      accountId,
      eventId,
      payload,
    });

    // The payload contains the transaction details directly
    const transactionDetails = payload;
    const customerId = transactionDetails.customerId;
    const sessionId = transactionDetails.sessionId;
    const paymentTransactionId = transactionDetails.paymentTransactionId;

    // Find existing FiatInteraction by meldCustomerId (with or without userId)
    let fiatInteraction = await FiatInteraction.findOne({
      meldCustomerId: customerId,
    });

    if (!fiatInteraction) {
      logger.info("Creating new FiatInteraction for Meld transaction", {
        customerId,
        accountId,
        eventType,
        eventId,
      });

      // Create new FiatInteraction without userId (will be assigned later)
      fiatInteraction = new FiatInteraction({
        // userId: null, // Will be assigned when user claims the transaction
        type: "onramp", // or determine based on transaction type
        status: "pending",
        serviceProvider: "meld",
        // Meld-specific fields
        meldCustomerId: customerId,
        meldSessionId: sessionId,
        meldPaymentTransactionId: paymentTransactionId,
        meldRequestId: transactionDetails.requestId,
        meldAccountId: accountId,
        meldProfileId: transactionDetails.profileId,
        meldExternalCustomerId: transactionDetails.externalCustomerId,
        meldExternalSessionId: transactionDetails.externalSessionId,
        meldTransactionType: transactionDetails.transactionType,
        meldPaymentTransactionStatus:
          transactionDetails.paymentTransactionStatus,
        // Legacy field for backward compatibility
        externalTransactionId: paymentTransactionId,
        // Basic transaction data (will be updated with more details later)
        fiatAmount: {
          value: transactionDetails.amount || 0,
          currency: transactionDetails.currency || "USD",
        },
        cryptoAmount: {
          value: transactionDetails.cryptoAmount || 0,
          currency: transactionDetails.cryptoCurrency || "BTC",
        },
        exchangeRate: transactionDetails.exchangeRate || 1,
        fees: {
          serviceFee: { value: 0, currency: "USD" },
          networkFee: { value: 0, currency: "USD" },
          totalFees: { value: 0, currency: "USD" },
        },
        sourceAccount: {
          type: "bank_account",
          identifier: "Meld",
        },
        destinationAccount: {
          type: "crypto_wallet",
          identifier: transactionDetails.walletAddress || "Unknown",
        },
        blockchain: transactionDetails.blockchain || "ethereum",
        initiatedAt: new Date(transactionDetails.createdAt || Date.now()),
        ipAddress: transactionDetails.ipAddress || "Unknown",
        deviceInfo: {
          userAgent: transactionDetails.userAgent || "Unknown",
          platform: "web",
          fingerprint: "Unknown",
        },
        kycLevel: "none",
        metadata: {
          meldEventId: eventId,
          meldAccountId: accountId,
          ...transactionDetails.metadata,
        },
      });

      await fiatInteraction.save();
      logger.info("Created new FiatInteraction", {
        fiatInteractionId: fiatInteraction._id.toString(),
        customerId,
        eventType,
      });
    }

    // Update Meld-specific fields from webhook data
    const updateData: any = {
      meldPaymentTransactionId: paymentTransactionId,
      meldPaymentTransactionStatus: transactionDetails.paymentTransactionStatus,
      meldTransactionType: transactionDetails.transactionType,
      meldRequestId: transactionDetails.requestId,
      meldAccountId: accountId,
      meldExternalCustomerId: transactionDetails.externalCustomerId,
      meldExternalSessionId: transactionDetails.externalSessionId,
    };

    // Update status based on event type
    const newStatus = mapMeldStatusToFiatStatus(eventType);
    updateData.status = newStatus;

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

    // Only send notification if user is assigned
    if (fiatInteraction.userId) {
      await sendFiatInteractionNotification(
        fiatInteraction.userId.toString(),
        eventType,
        transactionDetails,
        customerId
      );
    } else {
      logger.info(
        "No user assigned to FiatInteraction, skipping notification",
        {
          fiatInteractionId: fiatInteraction._id.toString(),
          customerId,
          eventType,
        }
      );
    }

    logger.info("Successfully processed crypto transaction webhook", {
      eventType,
      customerId,
      fiatInteractionId: fiatInteraction._id.toString(),
      hasUser: !!fiatInteraction.userId,
    });
  } catch (err) {
    logger.error("Error handling crypto transaction update", err as Error, {
      eventType,
      accountId,
      eventId,
      payload,
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
