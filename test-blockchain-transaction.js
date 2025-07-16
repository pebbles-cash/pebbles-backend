const axios = require("axios");

// Configuration
const API_BASE_URL = process.env.API_BASE_URL || "http://localhost:3000";
const AUTH_TOKEN = process.env.AUTH_TOKEN || "your-jwt-token-here";

// Test transaction hash (this is a real Sepolia transaction hash for testing)
const TEST_TX_HASH =
  "0x1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef";

async function testBlockchainTransactionAPI() {
  console.log("🧪 Testing Blockchain Transaction API");
  console.log("=====================================\n");

  try {
    // Test 1: Get supported networks
    console.log("1. Testing GET /api/transactions/networks");
    try {
      const networksResponse = await axios.get(
        `${API_BASE_URL}/api/transactions/networks`,
        {
          headers: {
            Authorization: `Bearer ${AUTH_TOKEN}`,
          },
        }
      );

      if (networksResponse.data.success) {
        console.log(
          "✅ Supported networks:",
          networksResponse.data.data.networks
        );
      } else {
        console.log(
          "❌ Failed to get networks:",
          networksResponse.data.message
        );
      }
    } catch (error) {
      console.log(
        "❌ Error getting networks:",
        error.response?.data?.message || error.message
      );
    }

    console.log("\n2. Testing POST /api/transactions/process");
    try {
      const processResponse = await axios.post(
        `${API_BASE_URL}/api/transactions/process`,
        {
          txHash: TEST_TX_HASH,
          network: "sepolia",
          type: "payment",
          category: "test_transaction",
          tags: ["test", "blockchain"],
          client: "test_client",
          metadata: {
            note: "Test transaction for API verification",
            fromAddress: "0x1234567890123456789012345678901234567890",
            toAddress: "0x0987654321098765432109876543210987654321",
          },
        },
        {
          headers: {
            Authorization: `Bearer ${AUTH_TOKEN}`,
            "Content-Type": "application/json",
          },
        }
      );

      if (processResponse.data.success) {
        console.log("✅ Transaction processed successfully");
        console.log("   Transaction ID:", processResponse.data.data.id);
        console.log("   Status:", processResponse.data.data.status);
        console.log("   Amount:", processResponse.data.data.amount);

        // Test 3: Get transaction status
        console.log("\n3. Testing GET /api/transactions/status/{txHash}");
        try {
          const statusResponse = await axios.get(
            `${API_BASE_URL}/api/transactions/status/${TEST_TX_HASH}?network=sepolia`,
            {
              headers: {
                Authorization: `Bearer ${AUTH_TOKEN}`,
              },
            }
          );

          if (statusResponse.data.success) {
            console.log("✅ Transaction status retrieved");
            console.log(
              "   Local Status:",
              statusResponse.data.data.transaction?.status || "No local record"
            );
            console.log(
              "   Blockchain Status:",
              statusResponse.data.data.blockchainStatus?.status
            );
            console.log(
              "   Confirmations:",
              statusResponse.data.data.blockchainStatus?.confirmations
            );
            console.log(
              "   Is Confirmed:",
              statusResponse.data.data.blockchainStatus?.isConfirmed
            );
          } else {
            console.log(
              "❌ Failed to get transaction status:",
              statusResponse.data.message
            );
          }
        } catch (statusError) {
          console.log(
            "❌ Error getting transaction status:",
            statusError.response?.data?.message || statusError.message
          );
        }
      } else {
        console.log(
          "❌ Failed to process transaction:",
          processResponse.data.message
        );
      }
    } catch (error) {
      console.log(
        "❌ Error processing transaction:",
        error.response?.data?.message || error.message
      );
    }

    // Test 4: Test with invalid transaction hash
    console.log("\n4. Testing with invalid transaction hash");
    try {
      const invalidResponse = await axios.post(
        `${API_BASE_URL}/api/transactions/process`,
        {
          txHash: "invalid-hash",
          network: "sepolia",
          type: "payment",
        },
        {
          headers: {
            Authorization: `Bearer ${AUTH_TOKEN}`,
            "Content-Type": "application/json",
          },
        }
      );
    } catch (error) {
      if (error.response?.status === 400) {
        console.log("✅ Correctly rejected invalid transaction hash");
      } else {
        console.log(
          "❌ Unexpected error with invalid hash:",
          error.response?.data?.message || error.message
        );
      }
    }

    // Test 5: Test with unsupported network
    console.log("\n5. Testing with unsupported network");
    try {
      const unsupportedResponse = await axios.post(
        `${API_BASE_URL}/api/transactions/process`,
        {
          txHash: TEST_TX_HASH,
          network: "polygon",
          type: "payment",
        },
        {
          headers: {
            Authorization: `Bearer ${AUTH_TOKEN}`,
            "Content-Type": "application/json",
          },
        }
      );
    } catch (error) {
      if (error.response?.status === 400) {
        console.log("✅ Correctly rejected unsupported network");
      } else {
        console.log(
          "❌ Unexpected error with unsupported network:",
          error.response?.data?.message || error.message
        );
      }
    }
  } catch (error) {
    console.error("❌ Test failed:", error.message);
  }

  console.log("\n🏁 Test completed");
}

// Run the test
if (require.main === module) {
  testBlockchainTransactionAPI();
}

module.exports = { testBlockchainTransactionAPI };
