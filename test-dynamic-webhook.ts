/**
 * Test script for Dynamic webhook endpoints
 *
 * This script tests the Dynamic webhook handler with various Dynamic webhook events.
 * It simulates webhook requests with proper signatures and payloads.
 *
 * Usage:
 * 1. Start the serverless offline service: npm run dev
 * 2. Run this script: npx ts-node test-dynamic-webhook.ts
 *
 * The script will test various webhook scenarios and log the results.
 */

import crypto from "crypto";
import axios from "axios";

// Configuration
const WEBHOOK_URL = "http://localhost:3000/dev/webhooks/dynamic";
const WEBHOOK_SECRET =
  process.env.DYNAMIC_WEBHOOK_SECRET || "test-dynamic-webhook-secret";

// Test data for different Dynamic webhook types
const testWebhooks = [
  {
    name: "Wallet Transferred",
    eventName: "wallet.transferred",
    data: {
      fromWallet: "0x742d35Cc6634C0532925a3b8D4C9db96C4b4d8b6",
      toWallet: "0x1234567890abcdef1234567890abcdef12345678",
      amount: 0.1,
      currency: "ETH",
      transactionHash:
        "0xabcdef1234567890abcdef1234567890abcdef1234567890abcdef1234567890",
      chain: "ethereum",
      timestamp: new Date().toISOString(),
    },
  },
  {
    name: "Wallet Linked",
    eventName: "wallet.linked",
    data: {
      walletPublicKey: "0x742d35Cc6634C0532925a3b8D4C9db96C4b4d8b6",
      walletName: "My Wallet",
      provider: "metamask",
      chain: "ethereum",
      timestamp: new Date().toISOString(),
    },
  },
  {
    name: "Wallet Unlinked",
    eventName: "wallet.unlinked",
    data: {
      walletPublicKey: "0x742d35Cc6634C0532925a3b8D4C9db96C4b4d8b6",
      timestamp: new Date().toISOString(),
    },
  },
  {
    name: "User Created",
    eventName: "user.created",
    data: {
      userId: "dynamic-user-123",
      email: "test@example.com",
      username: "testuser",
      timestamp: new Date().toISOString(),
    },
  },
  {
    name: "User Session Created",
    eventName: "user.session.created",
    data: {
      userId: "dynamic-user-123",
      sessionId: "session-456",
      timestamp: new Date().toISOString(),
    },
  },
  {
    name: "User to User Transfer",
    eventName: "wallet.transferred",
    data: {
      fromWallet: "0x742d35Cc6634C0532925a3b8D4C9db96C4b4d8b6",
      toWallet: "0x9876543210fedcba9876543210fedcba98765432", // Different wallet
      amount: 0.05,
      currency: "ETH",
      transactionHash:
        "0x1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef",
      chain: "ethereum",
      timestamp: new Date().toISOString(),
    },
  },
];

/**
 * Generate Dynamic webhook signature
 */
function generateDynamicSignature(payload: string, secret: string): string {
  const hash = crypto
    .createHmac("sha256", secret)
    .update(payload, "utf8")
    .digest("hex");
  return `sha256=${hash}`;
}

/**
 * Test a single Dynamic webhook
 */
async function testDynamicWebhook(webhook: any): Promise<void> {
  try {
    console.log(`\n🧪 Testing: ${webhook.name}`);
    console.log(`Event Name: ${webhook.eventName}`);

    // Create webhook payload
    const payload = {
      eventName: webhook.eventName,
      eventId: `test-event-${Date.now()}`,
      messageId: `msg-${Date.now()}`,
      userId: "dynamic-user-123",
      environmentId: "test-env",
      environmentName: "test",
      timestamp: new Date().toISOString(),
      redelivery: false,
      data: webhook.data,
    };

    const payloadString = JSON.stringify(payload);
    const signature = generateDynamicSignature(payloadString, WEBHOOK_SECRET);

    console.log(`Payload: ${payloadString}`);
    console.log(`Signature: ${signature}`);

    // Send webhook request
    const response = await axios.post(WEBHOOK_URL, payload, {
      headers: {
        "Content-Type": "application/json",
        "X-Dynamic-Signature-256": signature,
        "User-Agent": "Dynamic-Webhook-Test/1.0",
      },
      timeout: 10000,
    });

    console.log(`✅ Status: ${response.status}`);
    console.log(`Response: ${JSON.stringify(response.data, null, 2)}`);
  } catch (error: any) {
    console.log(`❌ Error: ${error.message}`);
    if (error.response) {
      console.log(`Status: ${error.response.status}`);
      console.log(`Response: ${JSON.stringify(error.response.data, null, 2)}`);
    }
  }
}

/**
 * Test invalid signature
 */
async function testInvalidSignature(): Promise<void> {
  try {
    console.log(`\n🧪 Testing: Invalid Signature`);

    const payload = {
      eventName: "wallet.transferred",
      eventId: "test-invalid-sig",
      messageId: "msg-invalid",
      userId: "dynamic-user-123",
      data: {
        fromWallet: "0x742d35Cc6634C0532925a3b8D4C9db96C4b4d8b6",
        toWallet: "0x1234567890abcdef1234567890abcdef12345678",
        amount: 0.1,
        currency: "ETH",
        transactionHash: "0xabcdef1234567890",
        chain: "ethereum",
      },
    };

    const payloadString = JSON.stringify(payload);

    const response = await axios.post(WEBHOOK_URL, payload, {
      headers: {
        "Content-Type": "application/json",
        "X-Dynamic-Signature-256": "invalid-signature",
        "User-Agent": "Dynamic-Webhook-Test/1.0",
      },
      timeout: 10000,
    });

    console.log(
      `❌ Should have rejected invalid signature (Status: ${response.status})`
    );
  } catch (error: any) {
    if (error.response?.status === 401) {
      console.log(`✅ Correctly rejected invalid signature`);
    } else {
      console.log(`❌ Unexpected error: ${error.message}`);
    }
  }
}

/**
 * Test missing signature
 */
async function testMissingSignature(): Promise<void> {
  try {
    console.log(`\n🧪 Testing: Missing Signature`);

    const payload = {
      eventName: "wallet.transferred",
      eventId: "test-missing-sig",
      messageId: "msg-missing",
      userId: "dynamic-user-123",
      data: {
        fromWallet: "0x742d35Cc6634C0532925a3b8D4C9db96C4b4d8b6",
        toWallet: "0x1234567890abcdef1234567890abcdef12345678",
        amount: 0.1,
        currency: "ETH",
        transactionHash: "0xabcdef1234567890",
        chain: "ethereum",
      },
    };

    const response = await axios.post(WEBHOOK_URL, payload, {
      headers: {
        "Content-Type": "application/json",
        "User-Agent": "Dynamic-Webhook-Test/1.0",
      },
      timeout: 10000,
    });

    console.log(
      `❌ Should have rejected missing signature (Status: ${response.status})`
    );
  } catch (error: any) {
    if (error.response?.status === 401) {
      console.log(`✅ Correctly rejected missing signature`);
    } else {
      console.log(`❌ Unexpected error: ${error.message}`);
    }
  }
}

/**
 * Test invalid JSON payload
 */
async function testInvalidJson(): Promise<void> {
  try {
    console.log(`\n🧪 Testing: Invalid JSON Payload`);

    const invalidPayload = "{ invalid json }";
    const signature = generateDynamicSignature(invalidPayload, WEBHOOK_SECRET);

    const response = await axios.post(WEBHOOK_URL, invalidPayload, {
      headers: {
        "Content-Type": "application/json",
        "X-Dynamic-Signature-256": signature,
        "User-Agent": "Dynamic-Webhook-Test/1.0",
      },
      timeout: 10000,
    });

    console.log(
      `❌ Should have rejected invalid JSON (Status: ${response.status})`
    );
  } catch (error: any) {
    if (error.response?.status === 400) {
      console.log(`✅ Correctly rejected invalid JSON`);
    } else {
      console.log(`❌ Unexpected error: ${error.message}`);
    }
  }
}

/**
 * Run all tests
 */
async function runTests(): Promise<void> {
  console.log("🚀 Starting Dynamic Webhook Tests");
  console.log(`Webhook URL: ${WEBHOOK_URL}`);
  console.log(`Webhook Secret: ${WEBHOOK_SECRET}`);
  console.log("==================================================");

  // Test all webhook types
  for (const webhook of testWebhooks) {
    await testDynamicWebhook(webhook);
    // Add delay between tests
    await new Promise((resolve) => setTimeout(resolve, 1000));
  }

  // Test error cases
  await testInvalidSignature();
  await testMissingSignature();
  await testInvalidJson();

  console.log("\n✅ All tests completed!");
}

// Run tests if this file is executed directly
if (require.main === module) {
  runTests().catch(console.error);
}

export { runTests, testDynamicWebhook, generateDynamicSignature };
