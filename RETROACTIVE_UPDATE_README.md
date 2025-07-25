# Retroactive Meld FiatInteraction Update Script

This script retroactively updates all existing FiatInteraction records with the correct data from the Meld API endpoint.

## What it does

1. **Finds all FiatInteractions** with customer IDs in your database
2. **Calls the Meld API** for each transaction to get detailed data
3. **Updates the database** with the correct amounts, status, and metadata
4. **Automatically updates status** from "pending" to "completed"/"failed" based on Meld's response
5. **Stores amounts** using Meld's exact format (`sourceAmount`, `sourceCurrencyCode`, etc.)
6. **Adds audit trails** with webhook events for tracking changes

## How to run

### Option 1: Using npm script
```bash
npm run retroactive-meld-update
```

### Option 2: Direct execution
```bash
node retroactive-meld-update.js
```

## Features

- **Batch processing**: Processes 10 transactions at a time to avoid overwhelming the API
- **Rate limiting**: Adds delays between API calls to respect rate limits
- **Error handling**: Continues processing even if some transactions fail
- **Progress tracking**: Shows detailed progress and results
- **Smart updates**: Only updates records that actually need changes
- **Audit trail**: Adds webhook events to track retroactive updates

## Output

The script will show:
- Total number of FiatInteractions processed
- Number of records updated
- Number of records skipped (already up to date)
- Number of errors encountered
- Detailed error information for failed updates

## Example output

```
Starting retroactive Meld FiatInteraction update
Found 150 FiatInteractions to process
Processing batch 1/15
Processing FiatInteraction 1/150
Successfully updated FiatInteraction retroactively
Processing batch 2/15
...

=== Retroactive Meld Update Results ===
Total Processed: 150
Updated: 45
Skipped: 95
Errors: 10

=== Errors ===
1. Customer ID: abc123
   FiatInteraction ID: 507f1f77bcf86cd799439011
   Error: API rate limit exceeded
```

## What gets updated

For each FiatInteraction, the script updates:

- **Amount fields**: `sourceAmount`, `sourceCurrencyCode`, `destinationAmount`, `destinationCurrencyCode`
- **Legacy fields**: `fiatAmount`, `cryptoAmount` (for backward compatibility)
- **Status**: Automatically changes from "pending" to "completed"/"failed" based on Meld status
- **Meld fields**: `meldPaymentTransactionStatus`, `meldTransactionType`
- **Fees**: Calculated from the difference between source and destination amounts
- **Metadata**: Adds `lastRetroactiveUpdate` timestamp and `retroactiveUpdate: true` flag
- **Webhook events**: Adds `RETROACTIVE_STATUS_UPDATE` events for audit trail

## Safety features

- **Dry run capability**: Can be modified to preview changes without saving
- **Error recovery**: Continues processing even if individual records fail
- **Rate limiting**: Respects API rate limits to avoid being blocked
- **Progress logging**: Detailed logs for monitoring and debugging
- **Backup recommendation**: Consider backing up your database before running

## Environment setup

Make sure your environment variables are properly configured:
- `MONGODB_URI`: Your MongoDB connection string
- `MELD_API_KEY`: Your Meld API key
- `MELD_API_URL`: Meld API base URL

## Troubleshooting

### Common issues:

1. **API rate limits**: The script includes delays, but if you hit limits, wait and retry
2. **Missing customer IDs**: Records without `meldCustomerId` will be skipped
3. **Network timeouts**: The script will retry individual records but may fail on network issues
4. **Database connection**: Ensure your MongoDB connection is stable

### If the script fails:

1. Check the error logs for specific issues
2. Verify your Meld API credentials
3. Ensure your database connection is working
4. Consider running in smaller batches by modifying the `batchSize` variable

## Monitoring

After running the script, you can monitor the updates through:
- Database queries on the `FiatInteraction` collection
- Webhook events in the `webhookEvents` array
- Metadata fields indicating retroactive updates 