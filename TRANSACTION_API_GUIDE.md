# Transaction API Guide

This document explains how your frontend can query for transactions, including those created by the Dynamic webhook.

## Available Endpoints

### 1. Get Transaction by Internal ID
```
GET /api/transactions/{transactionId}
```

**Description**: Get transaction details by the internal MongoDB transaction ID.

**Headers**:
```
Authorization: Bearer <your-jwt-token>
```

**Response**:
```json
{
  "success": true,
  "data": {
    "transaction": {
      "id": "507f1f77bcf86cd799439011",
      "type": "transfer",
      "direction": "incoming",
      "amount": "0.1",
      "currency": "USD",
      "status": "completed",
      "createdAt": "2024-01-01T12:00:00.000Z",
      "updatedAt": "2024-01-01T12:00:00.000Z",
      "fromAddress": "0x1234567890123456789012345678901234567890",
      "toAddress": "0x0987654321098765432109876543210987654321",
      "tokenAddress": "0x0",
      "sourceChain": "ethereum",
      "destinationChain": "ethereum",
      "txHash": "0xabcdef1234567890abcdef1234567890abcdef1234567890abcdef1234567890",
      "metadata": {
        "fromWallet": "0x1234567890123456789012345678901234567890",
        "toWallet": "0x0987654321098765432109876543210987654321",
        "chain": "ethereum",
        "dynamicEventId": "event-123",
        "dynamicMessageId": "message-456",
        "timestamp": "2024-01-01T12:00:00.000Z"
      },
      "counterparty": {
        "id": "507f1f77bcf86cd799439012",
        "username": "sender123",
        "displayName": "John Doe",
        "avatar": "https://example.com/avatar.jpg"
      }
    }
  }
}
```

### 2. Get Transaction by Transaction Hash (NEW)
```
GET /api/transactions/hash/{txHash}
```

**Description**: Get transaction details by the blockchain transaction hash. This is the most useful endpoint for querying transactions created by the Dynamic webhook.

**Headers**:
```
Authorization: Bearer <your-jwt-token>
```

**Example**:
```
GET /api/transactions/hash/0xabcdef1234567890abcdef1234567890abcdef1234567890abcdef1234567890
```

**Response**: Same format as above.

### 3. Get User Transactions
```
GET /api/transactions?limit=10&page=1&type=transfer&status=completed
```

**Description**: Get a paginated list of transactions for the authenticated user.

**Query Parameters**:
- `limit` (optional): Number of transactions per page (default: 10)
- `page` (optional): Page number (default: 1)
- `type` (optional): Filter by transaction type (`payment`, `tip`, `subscription`, `transfer`)
- `status` (optional): Filter by status (`pending`, `completed`, `failed`)
- `direction` (optional): Filter by direction (`incoming`, `outgoing`)

**Response**:
```json
{
  "success": true,
  "data": {
    "transactions": [
      {
        "id": "507f1f77bcf86cd799439011",
        "type": "transfer",
        "direction": "incoming",
        "amount": "0.1",
        "status": "completed",
        "createdAt": "2024-01-01T12:00:00.000Z",
        "counterparty": {
          "id": "507f1f77bcf86cd799439012",
          "username": "sender123",
          "displayName": "John Doe",
          "avatar": "https://example.com/avatar.jpg"
        }
      }
    ],
    "pagination": {
      "currentPage": 1,
      "totalPages": 5,
      "totalItems": 50,
      "hasNext": true,
      "hasPrev": false
    }
  }
}
```

### 4. Filter Transactions
```
POST /api/transactions/filter
```

**Description**: Advanced filtering with more options.

**Request Body**:
```json
{
  "types": ["transfer", "payment"],
  "startDate": "2024-01-01T00:00:00.000Z",
  "endDate": "2024-01-31T23:59:59.999Z",
  "status": "completed",
  "direction": "incoming",
  "client": "client-name",
  "category": "design",
  "tags": ["urgent", "design"],
  "limit": 20,
  "page": 1
}
```

### 5. Get Transaction Statistics
```
GET /api/transactions/stats?period=month
```

**Description**: Get transaction statistics and earnings summary.

**Query Parameters**:
- `period` (optional): Time period (`day`, `week`, `month`, `year`)

## Frontend Integration Examples

### React/JavaScript Example

```javascript
// Get transaction by Dynamic transaction hash
async function getTransactionByHash(transactionHash) {
  try {
    const response = await fetch(
      `/api/transactions/hash/${transactionHash}`,
      {
        headers: {
          'Authorization': `Bearer ${getAuthToken()}`,
          'Content-Type': 'application/json'
        }
      }
    );
    
    const data = await response.json();
    
    if (data.success) {
      return data.data.transaction;
    } else {
      throw new Error(data.message);
    }
  } catch (error) {
    console.error('Error fetching transaction:', error);
    throw error;
  }
}

// Get user's recent transactions
async function getUserTransactions(limit = 10, page = 1) {
  try {
    const response = await fetch(
      `/api/transactions?limit=${limit}&page=${page}`,
      {
        headers: {
          'Authorization': `Bearer ${getAuthToken()}`,
          'Content-Type': 'application/json'
        }
      }
    );
    
    const data = await response.json();
    
    if (data.success) {
      return data.data;
    } else {
      throw new Error(data.message);
    }
  } catch (error) {
    console.error('Error fetching transactions:', error);
    throw error;
  }
}

// Usage example
async function handleWalletTransfer(transactionHash) {
  try {
    // Wait a moment for the webhook to process
    await new Promise(resolve => setTimeout(resolve, 2000));
    
    // Query for the transaction
    const transaction = await getTransactionByHash(transactionHash);
    
    console.log('Transaction found:', transaction);
    
    // Update UI with transaction details
    updateTransactionUI(transaction);
  } catch (error) {
    console.error('Transaction not found or error:', error);
    // Handle error (show loading state, retry, etc.)
  }
}
```

### TypeScript Example

```typescript
interface Transaction {
  id: string;
  type: 'payment' | 'tip' | 'subscription' | 'transfer';
  direction: 'incoming' | 'outgoing';
  amount: string;
  currency: string;
  status: 'pending' | 'completed' | 'failed';
  createdAt: string;
  updatedAt: string;
  fromAddress?: string;
  toAddress: string;
  tokenAddress?: string;
  sourceChain: string;
  destinationChain: string;
  txHash?: string;
  metadata: Record<string, any>;
  counterparty?: {
    id: string;
    username?: string;
    displayName?: string;
    avatar?: string;
  };
}

interface TransactionResponse {
  success: boolean;
  data: {
    transaction: Transaction;
  };
}

async function getTransactionByHash(transactionHash: string): Promise<Transaction> {
  const response = await fetch(
    `/api/transactions/hash/${transactionHash}`,
    {
      headers: {
        'Authorization': `Bearer ${getAuthToken()}`,
        'Content-Type': 'application/json'
      }
    }
  );
  
  const data: TransactionResponse = await response.json();
  
  if (!data.success) {
    throw new Error('Failed to fetch transaction');
  }
  
  return data.data.transaction;
}
```

## Dynamic Webhook Integration

When a `wallet.transferred` event is received from Dynamic, the webhook:

1. Creates a transaction record with:
   - `txHash`: Set to the Dynamic transaction hash (blockchain transaction hash)
   - `metadata`: Contains additional Dynamic event information

2. Your frontend can then query for this transaction using:
   ```javascript
   const transaction = await getTransactionByHash(dynamicTransactionHash);
   ```

## Error Handling

All endpoints return consistent error responses:

```json
{
  "success": false,
  "message": "Error description",
  "statusCode": 400
}
```

Common status codes:
- `400`: Bad Request (missing parameters, invalid data)
- `401`: Unauthorized (missing or invalid token)
- `403`: Forbidden (user not authorized to access transaction)
- `404`: Not Found (transaction doesn't exist)
- `500`: Internal Server Error

## Best Practices

1. **Polling**: After a wallet transfer, wait 1-2 seconds before querying for the transaction to allow the webhook to process.

2. **Error Handling**: Always handle the case where a transaction might not be found immediately.

3. **Caching**: Consider caching transaction data to reduce API calls.

4. **Real-time Updates**: For real-time updates, consider implementing WebSocket connections or server-sent events.

5. **Retry Logic**: Implement retry logic for failed requests with exponential backoff.

## Testing

You can test the endpoints using tools like Postman or curl:

```bash
# Get transaction by hash
curl -X GET \
  "https://your-api-domain.com/api/transactions/hash/0xabcdef1234567890abcdef1234567890abcdef1234567890abcdef1234567890" \
  -H "Authorization: Bearer your-jwt-token"
``` 