# Dynamic Webhook Setup

This document explains how to set up and configure the Dynamic webhook for listening to wallet transfer events.

## Architecture

The webhook handlers have been separated for better organization and maintainability:

- `src/handlers/webhooks/dynamic.ts` - Dynamic webhook handler
- `src/handlers/webhooks/meld.ts` - Meld webhook handler  
- `src/handlers/webhooks/index.ts` - Exports for both handlers

## Overview

The Dynamic webhook handler listens for various Dynamic events, with a primary focus on `wallet.transferred` events to detect when transfers happen between Dynamic wallets.

## Environment Variables

Add the following environment variable to your `.env` file:

```bash
DYNAMIC_WEBHOOK_SECRET=your_dynamic_webhook_secret_here
```

## Webhook Endpoint

The webhook endpoint is available at:
```
POST /api/webhooks/dynamic
```

## Supported Events

The webhook handler currently supports the following Dynamic events:

1. **`wallet.transferred`** - When a wallet transfer occurs
2. **`wallet.linked`** - When a wallet is linked to a user
3. **`wallet.unlinked`** - When a wallet is unlinked from a user
4. **`user.created`** - When a new user is created
5. **`user.session.created`** - When a user session is created

## Event Processing

### Wallet Transfer Events (`wallet.transferred`)

When a `wallet.transferred` event is received, the handler:

1. Verifies the webhook signature using HMAC-SHA256
2. Extracts transfer details (fromWallet, toWallet, amount, currency, transactionHash, chain)
3. Finds the user by their Dynamic userId
4. Creates a transaction record in the database
5. Sends a notification to the user about the transfer

### Wallet Link Events (`wallet.linked`)

When a `wallet.linked` event is received, the handler:

1. Updates the user's wallet information (primaryWalletAddress, walletProvider, chain, walletName)
2. Sets the walletLinkedAt timestamp
3. Sends a notification to the user

### Wallet Unlink Events (`wallet.unlinked`)

When a `wallet.unlinked` event is received, the handler:

1. Clears the user's wallet information
2. Sends a notification to the user

## Security

The webhook implements signature verification using the `x-dynamic-signature-256` header. The signature is verified using HMAC-SHA256 with your webhook secret.

## Idempotency

The webhook handler implements idempotency using the `messageId` field from Dynamic. If a message is marked as a redelivery (`redelivery: true`), it will be skipped to prevent duplicate processing.

## Error Handling

- Invalid signatures return 401 Unauthorized
- Missing payload returns 400 Bad Request
- Processing errors return 500 Internal Server Error
- Unknown event types are logged but don't cause errors

## Testing

To test the webhook, you can use the Dynamic Developer Dashboard or send a POST request to the endpoint with a valid signature.

Example test payload for `wallet.transferred`:
```json
{
  "messageId": "test-message-id-123",
  "eventId": "test-event-id-456",
  "eventName": "wallet.transferred",
  "timestamp": "2024-01-01T12:00:00.000Z",
  "webhookId": "test-webhook-id",
  "userId": "test-user-id",
  "environmentId": "test-env-id",
  "environmentName": "sandbox",
  "redelivery": false,
  "data": {
    "fromWallet": "0x1234567890123456789012345678901234567890",
    "toWallet": "0x0987654321098765432109876543210987654321",
    "amount": 0.1,
    "currency": "ETH",
    "transactionHash": "0xabcdef1234567890abcdef1234567890abcdef1234567890abcdef1234567890",
    "chain": "ethereum",
    "timestamp": "2024-01-01T12:00:00.000Z"
  }
}
```

## Deployment

After setting up the environment variable, deploy your application:

```bash
npm run deploy
```

The webhook endpoint will be available at your deployed API Gateway URL. 