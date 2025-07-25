const mongoose = require("mongoose");
const axios = require("axios");
require("dotenv").config();

// MongoDB connection
async function connectToDatabase() {
  try {
    const mongoUri = process.env.MONGODB_URI;
    const databaseName = "pebbles-dev-development";
    console.log(mongoUri, databaseName);

    if (!mongoUri) {
      throw new Error("MONGODB_URI environment variable is required");
    }

    if (!databaseName) {
      throw new Error("MONGODB_DATABASE environment variable is required");
    }

    // Connect to the specific database
    const connectionString = `${mongoUri}/${databaseName}`;
    console.log(`Connecting to MongoDB database: ${databaseName}`);

    await mongoose.connect(connectionString);
    console.log("Connected to MongoDB");
  } catch (error) {
    console.error("Failed to connect to MongoDB:", error);
    throw error;
  }
}

// Meld API service
class MeldService {
  constructor() {
    this.apiKey = process.env.MELD_API_KEY;
    this.apiUrl = process.env.MELD_API_URL || "https://api.meld.io";

    if (!this.apiKey) {
      throw new Error("MELD_API_KEY environment variable is required");
    }
  }

  async getPaymentTransaction(customerId) {
    try {
      const response = await axios.get(
        `${this.apiUrl}/payments/transactions/${customerId}`,
        {
          headers: {
            Authorization: `Bearer ${this.apiKey}`,
            "Content-Type": "application/json",
          },
        }
      );
      return response.data;
    } catch (error) {
      console.error(
        `Error fetching transaction for customer ${customerId}:`,
        error.response?.data || error.message
      );
      throw error;
    }
  }
}

// FiatInteraction Schema (simplified for the script)
const fiatInteractionSchema = new mongoose.Schema({
  meldCustomerId: String,
  status: String,
  sourceAmount: Number,
  sourceCurrencyCode: String,
  destinationAmount: Number,
  destinationCurrencyCode: String,

  fees: {
    serviceFee: { value: Number, currency: String },
    networkFee: { value: Number, currency: String },
    totalFees: { value: Number, currency: String },
  },
  meldPaymentTransactionStatus: String,
  meldTransactionType: String,
  exchangeRate: Number,
  metadata: mongoose.Schema.Types.Mixed,
  webhookEvents: [
    {
      eventType: String,
      data: mongoose.Schema.Types.Mixed,
      timestamp: { type: Date, default: Date.now },
    },
  ],
  createdAt: { type: Date, default: Date.now },
  updatedAt: { type: Date, default: Date.now },
});

// Add methods to the schema
fiatInteractionSchema.methods.updateStatus = async function (
  newStatus,
  additionalData = {}
) {
  this.status = newStatus;
  this.updatedAt = new Date();

  if (additionalData.transactionHash) {
    this.transactionHash = additionalData.transactionHash;
  }

  if (additionalData.reason) {
    this.failureReason = additionalData.reason;
  }
};

fiatInteractionSchema.methods.addWebhookEvent = async function (
  eventType,
  data
) {
  if (!this.webhookEvents) {
    this.webhookEvents = [];
  }

  this.webhookEvents.push({
    eventType,
    data,
    timestamp: new Date(),
  });
};

const FiatInteraction = mongoose.model(
  "FiatInteraction",
  fiatInteractionSchema
);

async function retroactiveMeldUpdate() {
  const result = {
    totalProcessed: 0,
    updatedCount: 0,
    errorCount: 0,
    skippedCount: 0,
    errors: [],
  };

  try {
    await connectToDatabase();
    const meldService = new MeldService();

    console.log("Starting retroactive Meld FiatInteraction update");

    // First, let's see what collections exist in the database
    const collections = await mongoose.connection.db
      .listCollections()
      .toArray();
    console.log(
      "Available collections:",
      collections.map((c) => c.name)
    );

    // First, let's see what FiatInteractions exist and what fields they have
    const allFiatInteractions = await FiatInteraction.find({}).limit(5);
    console.log(
      `Total FiatInteractions in database: ${await FiatInteraction.countDocuments({})}`
    );

    if (allFiatInteractions.length > 0) {
      console.log(
        "Sample FiatInteraction fields:",
        Object.keys(allFiatInteractions[0].toObject())
      );
      console.log(
        "Sample FiatInteraction:",
        JSON.stringify(allFiatInteractions[0].toObject(), null, 2)
      );
    }

    // Check for different possible field names
    const withCustomerId = await FiatInteraction.find({
      meldCustomerId: { $exists: true, $ne: null },
    });
    const withPartnerCustomerId = await FiatInteraction.find({
      partnerCustomerId: { $exists: true, $ne: null },
    });
    const withCustomerIdField = await FiatInteraction.find({
      customerId: { $exists: true, $ne: null },
    });

    console.log(
      `FiatInteractions with 'meldCustomerId': ${withCustomerId.length}`
    );
    console.log(
      `FiatInteractions with 'partnerCustomerId': ${withPartnerCustomerId.length}`
    );
    console.log(
      `FiatInteractions with 'customerId': ${withCustomerIdField.length}`
    );

    // Also check for any documents in the collection with any customer-related field
    const anyCustomerField = await FiatInteraction.find({
      $or: [
        { meldCustomerId: { $exists: true } },
        { partnerCustomerId: { $exists: true } },
        { customerId: { $exists: true } },
        { "meld.customerId": { $exists: true } },
        { "meld.customer_id": { $exists: true } },
      ],
    });
    console.log(
      `FiatInteractions with any customer field: ${anyCustomerField.length}`
    );

    if (anyCustomerField.length > 0) {
      console.log(
        "Sample document with customer field:",
        JSON.stringify(anyCustomerField[0].toObject(), null, 2)
      );
    }

    // Find all FiatInteractions that have a customer ID (try different field names)
    let fiatInteractions = await FiatInteraction.find({
      $or: [
        { meldCustomerId: { $exists: true, $ne: null } },
        { partnerCustomerId: { $exists: true, $ne: null } },
        { customerId: { $exists: true, $ne: null } },
      ],
    }).sort({ createdAt: -1 }); // Process newest first

    console.log(`Found ${fiatInteractions.length} FiatInteractions to process`);

    if (fiatInteractions.length === 0) {
      console.log("No FiatInteractions found with customer IDs");
      return result;
    }

    result.totalProcessed = fiatInteractions.length;

    // Process in batches to avoid overwhelming the API
    const batchSize = 10;
    for (let i = 0; i < fiatInteractions.length; i += batchSize) {
      const batch = fiatInteractions.slice(i, i + batchSize);

      console.log(
        `Processing batch ${Math.floor(i / batchSize) + 1}/${Math.ceil(fiatInteractions.length / batchSize)}`
      );

      // Process batch concurrently with rate limiting
      const batchPromises = batch.map(async (fiatInteraction, index) => {
        // Add small delay between API calls to avoid rate limiting
        await new Promise((resolve) => setTimeout(resolve, index * 200));

        try {
          // Try different possible field names for customer ID
          const customerId =
            fiatInteraction.meldCustomerId ||
            fiatInteraction.partnerCustomerId ||
            fiatInteraction.customerId;

          if (!customerId) {
            result.skippedCount++;
            console.warn("FiatInteraction missing customer ID", {
              fiatInteractionId: fiatInteraction._id.toString(),
              availableFields: Object.keys(fiatInteraction.toObject()).filter(
                (key) => key.includes("customer") || key.includes("Customer")
              ),
            });
            return;
          }

          console.log(
            `Processing FiatInteraction ${i + index + 1}/${fiatInteractions.length}`,
            {
              fiatInteractionId: fiatInteraction._id.toString(),
              customerId,
              currentStatus: fiatInteraction.status,
            }
          );

          // Fetch detailed transaction information from Meld API
          const detailedTransactionData =
            await meldService.getPaymentTransaction(customerId);

          if (!detailedTransactionData?.transaction) {
            result.skippedCount++;
            console.warn("No detailed transaction data found", {
              customerId,
              fiatInteractionId: fiatInteraction._id.toString(),
            });
            return;
          }

          const transactionData = detailedTransactionData.transaction;

          // Extract amounts from detailed transaction data using Meld API format
          const sourceAmount =
            transactionData.sourceAmount || fiatInteraction.sourceAmount || 0;
          const sourceCurrencyCode =
            transactionData.sourceCurrencyCode ||
            fiatInteraction.sourceCurrencyCode ||
            "USD";
          const destinationAmount =
            transactionData.destinationAmount ||
            fiatInteraction.destinationAmount ||
            0;
          const destinationCurrencyCode =
            transactionData.destinationCurrencyCode ||
            fiatInteraction.destinationCurrencyCode ||
            "USDT";

          // Calculate fees from the difference between source and destination amounts
          const feeAmount = sourceAmount - destinationAmount;

          const fees = {
            serviceFee: {
              value: feeAmount,
              currency: sourceCurrencyCode,
            },
            networkFee: {
              value: 0,
              currency: sourceCurrencyCode,
            },
            totalFees: {
              value: feeAmount,
              currency: sourceCurrencyCode,
            },
          };

          // Check if any data actually needs updating
          const needsUpdate =
            fiatInteraction.sourceAmount !== sourceAmount ||
            fiatInteraction.sourceCurrencyCode !== sourceCurrencyCode ||
            fiatInteraction.destinationAmount !== destinationAmount ||
            fiatInteraction.destinationCurrencyCode !==
              destinationCurrencyCode ||
            fiatInteraction.meldPaymentTransactionStatus !==
              transactionData.status ||
            fiatInteraction.meldTransactionType !==
              transactionData.transactionType ||
            (transactionData.status === "SETTLED" &&
              fiatInteraction.status === "pending") ||
            (transactionData.status === "FAILED" &&
              fiatInteraction.status === "pending");

          if (!needsUpdate) {
            result.skippedCount++;
            console.log("FiatInteraction already up to date", {
              fiatInteractionId: fiatInteraction._id.toString(),
              customerId,
            });
            return;
          }

          // Update the FiatInteraction with detailed data using Meld API format
          fiatInteraction.sourceAmount = sourceAmount;
          fiatInteraction.sourceCurrencyCode = sourceCurrencyCode;
          fiatInteraction.destinationAmount = destinationAmount;
          fiatInteraction.destinationCurrencyCode = destinationCurrencyCode;

          fiatInteraction.fees = fees;
          fiatInteraction.meldPaymentTransactionStatus = transactionData.status;
          fiatInteraction.meldTransactionType = transactionData.transactionType;
          fiatInteraction.exchangeRate =
            transactionData.exchangeRate || fiatInteraction.exchangeRate || 1;

          // Auto-update status based on Meld transaction status
          if (
            transactionData.status === "SETTLED" &&
            fiatInteraction.status === "pending"
          ) {
            await fiatInteraction.updateStatus("completed", {
              transactionHash: transactionData.serviceTransactionId,
            });

            // Add webhook event to track this retroactive status update
            await fiatInteraction.addWebhookEvent("RETROACTIVE_STATUS_UPDATE", {
              previousStatus: "pending",
              newStatus: "completed",
              meldStatus: transactionData.status,
              timestamp: new Date().toISOString(),
              reason: "Retroactive update - transaction settled in Meld API",
            });
          } else if (
            transactionData.status === "FAILED" &&
            fiatInteraction.status === "pending"
          ) {
            await fiatInteraction.updateStatus("failed", {
              reason: "Transaction failed in Meld API",
            });

            // Add webhook event to track this retroactive status update
            await fiatInteraction.addWebhookEvent("RETROACTIVE_STATUS_UPDATE", {
              previousStatus: "pending",
              newStatus: "failed",
              meldStatus: transactionData.status,
              timestamp: new Date().toISOString(),
              reason: "Retroactive update - transaction failed in Meld API",
            });
          }

          // Add metadata about the retroactive update
          fiatInteraction.metadata = {
            ...fiatInteraction.metadata,
            lastRetroactiveUpdate: new Date().toISOString(),
            meldCustomerId: customerId,
            retroactiveUpdate: true,
          };

          await fiatInteraction.save();
          result.updatedCount++;

          console.log("Successfully updated FiatInteraction retroactively", {
            fiatInteractionId: fiatInteraction._id.toString(),
            customerId,
            status: fiatInteraction.status,
            meldStatus: transactionData.status,
            sourceAmount,
            destinationAmount,
          });
        } catch (error) {
          result.errorCount++;
          const errorInfo = {
            customerId:
              fiatInteraction.meldCustomerId ||
              fiatInteraction.partnerCustomerId ||
              fiatInteraction.customerId,
            fiatInteractionId: fiatInteraction._id.toString(),
            error: error.message || String(error),
          };
          result.errors.push(errorInfo);

          console.error("Error updating FiatInteraction retroactively", error, {
            fiatInteractionId: fiatInteraction._id.toString(),
            customerId:
              fiatInteraction.meldCustomerId ||
              fiatInteraction.partnerCustomerId ||
              fiatInteraction.customerId,
          });
        }
      });

      // Wait for batch to complete
      await Promise.all(batchPromises);

      // Add delay between batches to avoid rate limiting
      if (i + batchSize < fiatInteractions.length) {
        console.log("Waiting 2 seconds before next batch...");
        await new Promise((resolve) => setTimeout(resolve, 2000));
      }
    }

    console.log("Retroactive Meld update completed", {
      totalProcessed: result.totalProcessed,
      updatedCount: result.updatedCount,
      errorCount: result.errorCount,
      skippedCount: result.skippedCount,
    });

    return result;
  } catch (error) {
    console.error("Error in retroactive Meld update", error);
    throw error;
  }
}

// CLI execution
if (require.main === module) {
  retroactiveMeldUpdate()
    .then((result) => {
      console.log("\n=== Retroactive Meld Update Results ===");
      console.log(`Total Processed: ${result.totalProcessed}`);
      console.log(`Updated: ${result.updatedCount}`);
      console.log(`Skipped: ${result.skippedCount}`);
      console.log(`Errors: ${result.errorCount}`);

      if (result.errors.length > 0) {
        console.log("\n=== Errors ===");
        result.errors.forEach((error, index) => {
          console.log(`${index + 1}. Customer ID: ${error.customerId}`);
          console.log(`   FiatInteraction ID: ${error.fiatInteractionId}`);
          console.log(`   Error: ${error.error}`);
          console.log("");
        });
      }

      process.exit(0);
    })
    .catch((error) => {
      console.error("Script failed:", error);
      process.exit(1);
    });
}

module.exports = { retroactiveMeldUpdate };
