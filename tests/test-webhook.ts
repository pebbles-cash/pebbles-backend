/**
 * Test script for Meld webhook endpoints
 *
 * This script tests the webhook handler with various Meld webhook events.
 * It simulates webhook requests with proper signatures and payloads.
 *
 * Usage:
 * 1. Start the serverless offline service: npm run dev
 * 2. Run this script: npx ts-node test-webhook.ts
 *
 * The script will test various webhook scenarios and log the results.
 */

import crypto from "crypto";
import axios from "axios";

// Configuration
const WEBHOOK_URL = "http://localhost:3000/dev/webhooks/meld";
const WEBHOOK_SECRET = process.env.MELD_WEBHOOK_SECRET || "test-webhook-secret";

// Test data for different webhook types
const testWebhooks = [
  {
    name: "Account Created",
    eventType: "ACCOUNT_CREATED",
    data: {
      accountId: "test-account-123",
      userId: "test-user-456",
      status: "active",
      createdAt: new Date().toISOString(),
    },
  },
  {
    name: "Onramp Completed",
    eventType: "ONRAMP_COMPLETED",
    data: {
      accountId: "test-account-123",
      paymentTransactionId: "tx-onramp-789",
      fiatAmount: { value: 100, currency: "USD" },
      cryptoAmount: { value: 0.05, currency: "ETH" },
      exchangeRate: 2000,
      paymentTransactionStatus: "SETTLED",
      transactionHash: "0x1234567890abcdef",
      createdAt: new Date().toISOString(),
    },
  },
  {
    name: "Offramp Completed",
    eventType: "OFFRAMP_COMPLETED",
    data: {
      accountId: "test-account-123",
      paymentTransactionId: "tx-offramp-101",
      cryptoAmount: { value: 0.1, currency: "ETH" },
      fiatAmount: { value: 200, currency: "USD" },
      exchangeRate: 2000,
      paymentTransactionStatus: "SETTLED",
      createdAt: new Date().toISOString(),
    },
  },
  {
    name: "Crypto Transaction Pending",
    eventType: "TRANSACTION_CRYPTO_PENDING",
    data: {
      accountId: "test-account-123",
      customerId: "test-customer-456",
      externalCustomerId: "customer_1234443",
      externalSessionId: "session_1234323",
      paymentTransactionId: "tx-crypto-202",
      paymentTransactionStatus: "PENDING",
      sourceAmount: 100,
      sourceCurrency: "USD",
      destinationAmount: 0.05,
      destinationCurrency: "ETH",
      exchangeRate: 2000,
      sourceAccountId: "bank-123",
      destinationAddress: "0x742d35Cc6634C0532925a3b8D4C9db96C4b4d8b6",
      blockchain: "ethereum",
      createdAt: new Date().toISOString(),
    },
  },
  {
    name: "Crypto Transaction Transferring",
    eventType: "TRANSACTION_CRYPTO_TRANSFERRING",
    data: {
      accountId: "test-account-123",
      customerId: "test-customer-456",
      externalCustomerId: "customer_1234443",
      externalSessionId: "session_1234323",
      paymentTransactionId: "tx-crypto-202",
      paymentTransactionStatus: "SETTLING",
      sourceAmount: 100,
      sourceCurrency: "USD",
      destinationAmount: 0.05,
      destinationCurrency: "ETH",
      exchangeRate: 2000,
      sourceAccountId: "bank-123",
      destinationAddress: "0x742d35Cc6634C0532925a3b8D4C9db96C4b4d8b6",
      blockchain: "ethereum",
      createdAt: new Date().toISOString(),
    },
  },
  {
    name: "Crypto Transaction Complete",
    eventType: "TRANSACTION_CRYPTO_COMPLETE",
    data: {
      accountId: "test-account-123",
      customerId: "test-customer-456",
      externalCustomerId: "customer_1234443",
      externalSessionId: "session_1234323",
      paymentTransactionId: "tx-crypto-202",
      paymentTransactionStatus: "SETTLED",
      sourceAmount: 100,
      sourceCurrency: "USD",
      destinationAmount: 0.05,
      destinationCurrency: "ETH",
      exchangeRate: 2000,
      sourceAccountId: "bank-123",
      destinationAddress: "0x742d35Cc6634C0532925a3b8D4C9db96C4b4d8b6",
      blockchain: "ethereum",
      blockchainTransactionHash: "0xabcdef1234567890",
      createdAt: new Date().toISOString(),
      completedAt: new Date().toISOString(),
    },
  },
  {
    name: "Crypto Transaction Failed",
    eventType: "TRANSACTION_CRYPTO_FAILED",
    data: {
      accountId: "test-account-123",
      customerId: "test-customer-456",
      externalCustomerId: "customer_1234443",
      externalSessionId: "session_1234323",
      paymentTransactionId: "tx-crypto-203",
      paymentTransactionStatus: "ERROR",
      sourceAmount: 50,
      sourceCurrency: "USD",
      destinationAmount: 0.025,
      destinationCurrency: "ETH",
      exchangeRate: 2000,
      failureReason: "Insufficient funds",
      sourceAccountId: "bank-123",
      destinationAddress: "0x742d35Cc6634C0532925a3b8D4C9db96C4b4d8b6",
      blockchain: "ethereum",
      createdAt: new Date().toISOString(),
      failedAt: new Date().toISOString(),
    },
  },
];

/**
 * Generate webhook signature using the same algorithm as the Java implementation
 */
function generateSignature(payload: string, secret: string): string {
  const timestamp = Math.floor(Date.now() / 1000).toString();
  const url = "/api/webhooks/meld";

  // Create data string using dot concatenation: timestamp.url.body
  const data = [timestamp, url, payload].join(".");

  // Create HMAC-SHA256 hash
  const hmac = crypto.createHmac("sha256", secret);
  hmac.update(data, "utf8");
  const bytes = hmac.digest();

  // Convert to Base64 URL-safe encoding (same as Java's Base64.getUrlEncoder())
  return bytes
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=/g, "");
}

/**
 * Test a single webhook
 */
async function testWebhook(webhook: any): Promise<void> {
  try {
    console.log(`\n🧪 Testing: ${webhook.name}`);
    console.log(`Event Type: ${webhook.eventType}`);

    // Create webhook payload
    const payload = {
      eventType: webhook.eventType,
      eventId: `test-event-${Date.now()}`,
      timestamp: new Date().toISOString(),
      data: webhook.data,
    };

    const payloadString = JSON.stringify(payload);
    const timestamp = Math.floor(Date.now() / 1000).toString();
    const signature = generateSignature(payloadString, WEBHOOK_SECRET);

    // Send webhook request
    const response = await axios.post(WEBHOOK_URL, payload, {
      headers: {
        "Content-Type": "application/json",
        "X-Meld-Signature": signature,
        "X-Meld-Timestamp": timestamp,
        "User-Agent": "Meld-Webhook-Test/1.0",
      },
      timeout: 10000,
    });

    console.log(`✅ Status: ${response.status}`);
    console.log(`Response: ${JSON.stringify(response.data, null, 2)}`);

    // Test the corresponding FiatInteraction endpoint if transactionId exists
    if (webhook.data.paymentTransactionId) {
      await testFiatInteractionEndpoint(webhook.data.paymentTransactionId);
    }
  } catch (error: any) {
    console.log(`❌ Error: ${error.message}`);
    if (error.response) {
      console.log(`Status: ${error.response.status}`);
      console.log(`Response: ${JSON.stringify(error.response.data, null, 2)}`);
    }
  }
}

/**
 * Test the FiatInteraction endpoint for a transaction
 */
async function testFiatInteractionEndpoint(
  externalTransactionId: string
): Promise<void> {
  try {
    console.log(
      `\n🔍 Testing FiatInteraction endpoint for transaction: ${externalTransactionId}`
    );

    // Note: This would require authentication in a real scenario
    // For testing purposes, we'll just log the expected endpoint
    const endpoint = `http://localhost:3000/dev/api/fiat-interactions/external/${externalTransactionId}`;
    console.log(`Expected endpoint: ${endpoint}`);
    console.log(`Note: This endpoint requires authentication in production`);
  } catch (error: any) {
    console.log(`❌ FiatInteraction endpoint error: ${error.message}`);
  }
}

/**
 * Test invalid signature
 */
async function testInvalidSignature(): Promise<void> {
  try {
    console.log("\n🧪 Testing: Invalid Signature");

    const payload = {
      eventType: "ACCOUNT_CREATED",
      eventId: "test-invalid-sig",
      timestamp: new Date().toISOString(),
      data: { accountId: "test-account-123" },
    };

    const payloadString = JSON.stringify(payload);
    const invalidSignature = "invalid-signature";

    const response = await axios.post(WEBHOOK_URL, payload, {
      headers: {
        "Content-Type": "application/json",
        "X-Meld-Signature": invalidSignature,
        "User-Agent": "Meld-Webhook-Test/1.0",
      },
      timeout: 10000,
    });

    console.log(`Status: ${response.status}`);
    console.log(`Response: ${JSON.stringify(response.data, null, 2)}`);
  } catch (error: any) {
    console.log(`❌ Expected error: ${error.message}`);
    if (error.response) {
      console.log(`Status: ${error.response.status}`);
    }
  }
}

/**
 * Test missing signature
 */
async function testMissingSignature(): Promise<void> {
  try {
    console.log("\n🧪 Testing: Missing Signature");

    const payload = {
      eventType: "ACCOUNT_CREATED",
      eventId: "test-missing-sig",
      timestamp: new Date().toISOString(),
      data: { accountId: "test-account-123" },
    };

    const response = await axios.post(WEBHOOK_URL, payload, {
      headers: {
        "Content-Type": "application/json",
        "User-Agent": "Meld-Webhook-Test/1.0",
      },
      timeout: 10000,
    });

    console.log(`Status: ${response.status}`);
    console.log(`Response: ${JSON.stringify(response.data, null, 2)}`);
  } catch (error: any) {
    console.log(`❌ Expected error: ${error.message}`);
    if (error.response) {
      console.log(`Status: ${error.response.status}`);
    }
  }
}

/**
 * Main test function
 */
async function runTests(): Promise<void> {
  console.log("🚀 Starting Meld Webhook Tests");
  console.log(`Webhook URL: ${WEBHOOK_URL}`);
  console.log(`Webhook Secret: ${WEBHOOK_SECRET}`);
  console.log("=".repeat(50));

  // Test all webhook types
  for (const webhook of testWebhooks) {
    await testWebhook(webhook);
    // Add delay between tests
    await new Promise((resolve) => setTimeout(resolve, 1000));
  }

  // Test error cases
  await testInvalidSignature();
  await testMissingSignature();

  console.log("\n✅ All tests completed!");
  console.log("\n📝 Notes:");
  console.log(
    "- Webhook processing logs should appear in your serverless offline console"
  );
  console.log(
    "- Check the database for created/updated FiatInteraction records"
  );
  console.log(
    "- Frontend should receive push notifications for status updates"
  );
  console.log(
    "- Use the FiatInteraction endpoints to query transaction status"
  );
}

// Run tests if this file is executed directly
if (require.main === module) {
  runTests().catch(console.error);
}
