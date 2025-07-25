import { cleanupPendingTransactions } from "./src/handlers/scheduled-tasks";

async function testScheduledTask() {
  console.log("Testing scheduled task handler...");

  try {
    // Simulate the EventBridge event
    const mockEvent = {
      source: "aws.events",
      detail: {
        action: "cleanup-pending-transactions",
      },
      "detail-type": "Scheduled Event",
      resources: [
        "arn:aws:events:us-east-1:123456789012:rule/cleanup-pending-transactions",
      ],
      time: new Date().toISOString(),
      region: "us-east-1",
    };

    console.log("Mock EventBridge event:", JSON.stringify(mockEvent, null, 2));

    // Call the scheduled task handler
    const result = await cleanupPendingTransactions(mockEvent as any);

    console.log("\n=== SCHEDULED TASK RESULT ===");
    console.log("Status Code:", result.statusCode);
    console.log("Headers:", result.headers);
    console.log("Body:", result.body);

    if (result.statusCode === 200) {
      console.log("✅ Scheduled task executed successfully!");
    } else {
      console.log("❌ Scheduled task failed");
    }
  } catch (error) {
    console.error("Error testing scheduled task:", error);
  }
}

testScheduledTask();
