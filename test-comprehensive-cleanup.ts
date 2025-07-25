import { transactionStatusService } from "./src/services/transaction-status-service";
import { connectToDatabase } from "./src/services/mongoose";

async function testComprehensiveCleanup() {
  console.log("Testing comprehensive pending transaction cleanup...");

  try {
    // Connect to database
    await connectToDatabase();

    // Run comprehensive cleanup
    console.log("Running comprehensive cleanup...");
    const result =
      await transactionStatusService.comprehensivePendingTransactionCleanup();

    console.log("\n=== COMPREHENSIVE CLEANUP RESULTS ===");
    console.log("Fixed transactions:", result.fixed);
    console.log("Errors:", result.errors);
    console.log("Skipped:", result.skipped);
    console.log("Failed:", result.failed);
    console.log("Duration:", result.report.duration, "ms");

    console.log("\n=== DETAILED REPORT ===");
    console.log(
      "Total transactions processed:",
      result.report.transactions.total
    );
    console.log("Networks processed:", Object.keys(result.report.networks));

    for (const [network, stats] of Object.entries(result.report.networks)) {
      const networkStats = stats as any;
      console.log(
        `- ${network}: ${networkStats.total} total, ${networkStats.fixed} fixed, ${networkStats.errors} errors`
      );
    }

    if (result.report.errors.length > 0) {
      console.log("\n=== ERRORS ===");
      result.report.errors.forEach((error: any, index: number) => {
        console.log(
          `${index + 1}. Transaction ${error.transactionId}: ${error.error}`
        );
      });
    }

    console.log("\n=== SUMMARY ===");
    if (result.fixed > 0) {
      console.log(`✅ Successfully fixed ${result.fixed} pending transactions`);
    }
    if (result.failed > 0) {
      console.log(`❌ Marked ${result.failed} old transactions as failed`);
    }
    if (result.skipped > 0) {
      console.log(`⏳ Skipped ${result.skipped} transactions (still pending)`);
    }
    if (result.errors > 0) {
      console.log(`⚠️  Encountered ${result.errors} errors during processing`);
    }
  } catch (error) {
    console.error("Error testing comprehensive cleanup:", error);
  }
}

testComprehensiveCleanup();
