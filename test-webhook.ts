import crypto from "crypto";
import https from "https";
import http from "http";

// Test configuration
const TEST_SECRET = "your_test_secret_here";
const BASE_URL = "http://localhost:3000"; // Adjust if your serverless offline runs on different port
const WEBHOOK_PATH = "/dev/api/webhooks/meld";

// Sample webhook payloads for different event types
const webhookPayloads = {
  bankLinkingCompleted: {
    type: "BANK_LINKING_CONNECTION_COMPLETED",
    id: "evt_test_123",
    accountId: "acc_test_456",
    data: {
      connectionId: "conn_test_789",
      status: "active",
      accounts: [
        {
          id: "bank_acc_1",
          name: "Checking Account",
          type: "checking",
        },
      ],
    },
  },

  onrampCompleted: {
    type: "ONRAMP_COMPLETED",
    id: "evt_test_124",
    accountId: "acc_test_456",
    data: {
      transactionId: "txn_test_789",
      amount: "100.00",
      currency: "USD",
      status: "completed",
      externalTransactionId: "ext_txn_123",
    },
  },

  onrampFailed: {
    type: "ONRAMP_FAILED",
    id: "evt_test_125",
    accountId: "acc_test_456",
    data: {
      transactionId: "txn_test_790",
      amount: "50.00",
      currency: "USD",
      status: "failed",
      error: "Insufficient funds",
      externalTransactionId: "ext_txn_124",
    },
  },

  transactionsAdded: {
    type: "FINANCIAL_ACCOUNT_TRANSACTIONS_ADDED",
    id: "evt_test_126",
    accountId: "acc_test_456",
    data: {
      accountId: "bank_acc_1",
      transactions: [
        {
          id: "txn_1",
          amount: "25.50",
          currency: "USD",
          description: "Coffee shop",
          date: new Date().toISOString(),
        },
      ],
    },
  },
};

interface WebhookResponse {
  statusCode: number;
  headers: http.IncomingHttpHeaders;
  body: string;
}

/**
 * Generate Meld webhook signature
 */
function generateSignature(payload: any, secret: string): string {
  const hmac = crypto.createHmac("sha256", secret);
  hmac.update(JSON.stringify(payload), "utf8");
  return `sha256=${hmac.digest("hex")}`;
}

/**
 * Make HTTP request
 */
function makeRequest(
  url: string,
  options: http.RequestOptions,
  data?: string
): Promise<WebhookResponse> {
  return new Promise((resolve, reject) => {
    const urlObj = new URL(url);
    const isHttps = urlObj.protocol === "https:";
    const client = isHttps ? https : http;

    const req = client.request(url, options, (res) => {
      let responseData = "";
      res.on("data", (chunk) => {
        responseData += chunk;
      });
      res.on("end", () => {
        resolve({
          statusCode: res.statusCode || 0,
          headers: res.headers,
          body: responseData,
        });
      });
    });

    req.on("error", reject);

    if (data) {
      req.write(data);
    }

    req.end();
  });
}

/**
 * Test a webhook payload
 */
async function testWebhook(
  payloadName: string,
  payload: any
): Promise<WebhookResponse | null> {
  console.log(`\n🧪 Testing ${payloadName}...`);
  console.log("Payload:", JSON.stringify(payload, null, 2));

  const signature = generateSignature(payload, TEST_SECRET);
  const requestBody = JSON.stringify(payload);

  const options: http.RequestOptions = {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Content-Length": Buffer.byteLength(requestBody).toString(),
      "meld-signature": signature,
    },
  };

  try {
    const response = await makeRequest(
      `${BASE_URL}${WEBHOOK_PATH}`,
      options,
      requestBody
    );

    console.log(`\n📊 Response Status: ${response.statusCode}`);
    console.log("Response Headers:", response.headers);
    console.log("Response Body:", response.body);

    if (response.statusCode === 200) {
      console.log("✅ Webhook test PASSED");
    } else {
      console.log("❌ Webhook test FAILED");
    }

    return response;
  } catch (error) {
    console.error("❌ Request failed:", (error as Error).message);
    return null;
  }
}

/**
 * Test without signature (should fail)
 */
async function testWithoutSignature(
  payload: any
): Promise<WebhookResponse | null> {
  console.log("\n🧪 Testing without signature (should fail)...");

  const requestBody = JSON.stringify(payload);

  const options: http.RequestOptions = {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Content-Length": Buffer.byteLength(requestBody).toString(),
    },
  };

  try {
    const response = await makeRequest(
      `${BASE_URL}${WEBHOOK_PATH}`,
      options,
      requestBody
    );

    console.log(`📊 Response Status: ${response.statusCode}`);
    console.log("Response Body:", response.body);

    if (response.statusCode === 401) {
      console.log("✅ Correctly rejected request without signature");
    } else {
      console.log("❌ Should have rejected request without signature");
    }

    return response;
  } catch (error) {
    console.error("❌ Request failed:", (error as Error).message);
    return null;
  }
}

/**
 * Test with invalid signature (should fail)
 */
async function testInvalidSignature(
  payload: any
): Promise<WebhookResponse | null> {
  console.log("\n🧪 Testing with invalid signature (should fail)...");

  const requestBody = JSON.stringify(payload);

  const options: http.RequestOptions = {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Content-Length": Buffer.byteLength(requestBody).toString(),
      "meld-signature": "sha256=invalid_signature_here",
    },
  };

  try {
    const response = await makeRequest(
      `${BASE_URL}${WEBHOOK_PATH}`,
      options,
      requestBody
    );

    console.log(`📊 Response Status: ${response.statusCode}`);
    console.log("Response Body:", response.body);

    if (response.statusCode === 401) {
      console.log("✅ Correctly rejected request with invalid signature");
    } else {
      console.log("❌ Should have rejected request with invalid signature");
    }

    return response;
  } catch (error) {
    console.error("❌ Request failed:", (error as Error).message);
    return null;
  }
}

/**
 * Run all tests
 */
async function runAllTests(): Promise<void> {
  console.log("🚀 Starting Meld Webhook Tests...");
  console.log(`📍 Testing endpoint: ${BASE_URL}${WEBHOOK_PATH}`);
  console.log(`🔑 Using test secret: ${TEST_SECRET}`);

  // Test valid webhooks
  for (const [name, payload] of Object.entries(webhookPayloads)) {
    await testWebhook(name, payload);
  }

  // Test error cases
  await testWithoutSignature(webhookPayloads.onrampCompleted);
  await testInvalidSignature(webhookPayloads.onrampCompleted);

  console.log("\n🎉 All tests completed!");
}

// Run tests if this script is executed directly
if (require.main === module) {
  runAllTests().catch(console.error);
}

export {
  testWebhook,
  testWithoutSignature,
  testInvalidSignature,
  webhookPayloads,
  generateSignature,
};
