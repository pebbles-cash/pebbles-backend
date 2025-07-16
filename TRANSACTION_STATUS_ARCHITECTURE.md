# Transaction Status Architecture

This document explains the architecture for handling transaction status updates and how to design endpoints for retrieving transaction status once a transaction is submitted to the blockchain.

## Overview

When a transaction is submitted to the blockchain, it takes time to be processed and confirmed. The architecture provides multiple ways to handle this asynchronous process:

1. **Immediate Response**: Return transaction record with initial status
2. **Async Monitoring**: Background process updates status as confirmations are received
3. **Status Polling**: Frontend can poll for status updates
4. **Real-time Updates**: WebSocket/SSE for real-time status changes (future enhancement)

## Architecture Components

### 1. Transaction Processing Flow

```
User submits txHash → Validate → Create DB Record → Start Async Monitoring → Update Status
```

**Step-by-step process:**

1. **Validation**: Check transaction hash format and network support
2. **Blockchain Query**: Fetch transaction details from blockchain
3. **Database Record**: Create local transaction record with initial status
4. **Async Monitoring**: Start background process to monitor status
5. **Status Updates**: Update database as confirmations are received

### 2. Status Monitoring Strategy

#### Immediate Status Check
- Query blockchain immediately for current status
- Return both local and blockchain status
- Handle cases where transaction is not yet mined

#### Async Background Monitoring
- Monitor transaction every 2 seconds
- Update database when status changes
- Retry logic for failed queries
- Maximum retry limit to prevent infinite loops

#### Frontend Polling
- Frontend can poll status endpoint
- Configurable polling intervals
- Exponential backoff for failed requests
- Timeout handling for long-running transactions

### 3. Status Types

| Status | Description | Blockchain State |
|--------|-------------|------------------|
| `pending` | Transaction submitted, not yet mined | Transaction in mempool |
| `completed` | Transaction confirmed with required confirmations | Transaction mined and confirmed |
| `failed` | Transaction failed or not found | Transaction failed or invalid |

### 4. Confirmation Strategy

#### Confirmation Threshold
- **Default**: 1 confirmation required
- **Configurable**: Per network basis
- **Security**: Higher confirmations for larger amounts

#### Confirmation Monitoring
```javascript
// Example confirmation check
const isConfirmed = await blockchainService.isTransactionConfirmed(
  network, 
  txHash, 
  CONFIRMATION_THRESHOLD
);
```

## API Design Patterns

### 1. Process Transaction Endpoint

**POST** `/api/transactions/process`

**Purpose**: Submit transaction hash for processing

**Response Strategy**:
- Return immediately with transaction record
- Include message about async status updates
- Provide transaction ID for future queries

```json
{
  "success": true,
  "data": {
    "id": "transaction-id",
    "status": "pending",
    "message": "Transaction processed successfully. Status will be updated asynchronously."
  }
}
```

### 2. Status Query Endpoint

**GET** `/api/transactions/status/{txHash}`

**Purpose**: Get current transaction status

**Response Strategy**:
- Return both local and blockchain status
- Include confirmation count
- Handle missing local records

```json
{
  "success": true,
  "data": {
    "transaction": {
      "id": "local-transaction-id",
      "status": "completed"
    },
    "blockchainStatus": {
      "isConfirmed": true,
      "status": "completed",
      "confirmations": 12
    }
  }
}
```

### 3. Transaction Details Endpoint

**GET** `/api/transactions/{transactionId}`

**Purpose**: Get full transaction details

**Response Strategy**:
- Include all transaction metadata
- Show blockchain details
- Provide confirmation information

## Frontend Integration Patterns

### 1. Immediate Processing

```javascript
// Submit transaction hash
const transaction = await processTransactionHash({
  txHash: '0x...',
  network: 'ethereum'
});

// Show immediate feedback
showTransactionSubmitted(transaction);
```

### 2. Status Polling

```javascript
// Poll for status updates
async function pollTransactionStatus(txHash, maxAttempts = 30) {
  for (let i = 0; i < maxAttempts; i++) {
    const status = await getTransactionStatus(txHash);
    
    if (status.blockchainStatus.isConfirmed) {
      showTransactionConfirmed(status);
      return;
    }
    
    if (status.blockchainStatus.status === 'failed') {
      showTransactionFailed(status);
      return;
    }
    
    // Wait 2 seconds before next check
    await new Promise(resolve => setTimeout(resolve, 2000));
  }
  
  showTransactionTimeout();
}
```

### 3. Real-time Updates (Future)

```javascript
// WebSocket connection for real-time updates
const ws = new WebSocket('ws://api.example.com/transactions');

ws.onmessage = (event) => {
  const update = JSON.parse(event.data);
  
  if (update.type === 'transaction_status_update') {
    updateTransactionUI(update.transaction);
  }
};
```

## Error Handling Strategies

### 1. Network Errors

```javascript
// Retry with exponential backoff
async function getTransactionStatusWithRetry(txHash, maxRetries = 3) {
  for (let i = 0; i < maxRetries; i++) {
    try {
      return await getTransactionStatus(txHash);
    } catch (error) {
      if (i === maxRetries - 1) throw error;
      
      // Exponential backoff
      await new Promise(resolve => 
        setTimeout(resolve, Math.pow(2, i) * 1000)
      );
    }
  }
}
```

### 2. Timeout Handling

```javascript
// Handle long-running transactions
async function waitForTransaction(txHash, timeout = 60000) {
  const startTime = Date.now();
  
  while (Date.now() - startTime < timeout) {
    const status = await getTransactionStatus(txHash);
    
    if (status.blockchainStatus.isConfirmed) {
      return status;
    }
    
    await new Promise(resolve => setTimeout(resolve, 2000));
  }
  
  throw new Error('Transaction timeout');
}
```

### 3. User Feedback

```javascript
// Progressive status updates
function updateTransactionUI(status) {
  switch (status.blockchainStatus.status) {
    case 'pending':
      showPendingStatus(status.blockchainStatus.confirmations);
      break;
    case 'completed':
      showCompletedStatus(status.transaction);
      break;
    case 'failed':
      showFailedStatus(status.blockchainStatus.error);
      break;
  }
}
```

## Performance Considerations

### 1. Caching Strategy

```javascript
// Cache transaction status
const statusCache = new Map();

async function getCachedTransactionStatus(txHash) {
  const cached = statusCache.get(txHash);
  
  if (cached && Date.now() - cached.timestamp < 5000) {
    return cached.data;
  }
  
  const status = await getTransactionStatus(txHash);
  statusCache.set(txHash, {
    data: status,
    timestamp: Date.now()
  });
  
  return status;
}
```

### 2. Rate Limiting

```javascript
// Implement rate limiting for status checks
const rateLimiter = new Map();

function canCheckStatus(txHash) {
  const lastCheck = rateLimiter.get(txHash);
  const now = Date.now();
  
  if (!lastCheck || now - lastCheck > 2000) {
    rateLimiter.set(txHash, now);
    return true;
  }
  
  return false;
}
```

### 3. Batch Processing

```javascript
// Batch multiple status checks
async function getMultipleTransactionStatuses(txHashes) {
  const promises = txHashes.map(hash => getTransactionStatus(hash));
  return Promise.all(promises);
}
```

## Security Considerations

### 1. Input Validation

```javascript
// Validate transaction hash format
function validateTransactionHash(txHash) {
  return /^0x[a-fA-F0-9]{64}$/.test(txHash);
}

// Validate network support
function validateNetwork(network) {
  return ['sepolia', 'ethereum'].includes(network);
}
```

### 2. Authorization

```javascript
// Check user authorization for transaction access
async function authorizeTransactionAccess(userId, transactionId) {
  const transaction = await Transaction.findById(transactionId);
  
  return transaction && (
    transaction.fromUserId?.toString() === userId ||
    transaction.toUserId.toString() === userId
  );
}
```

### 3. Rate Limiting

```javascript
// Implement API rate limiting
const rateLimit = {
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 100 // limit each IP to 100 requests per windowMs
};
```

## Monitoring and Observability

### 1. Logging Strategy

```javascript
// Comprehensive logging
logger.info('Transaction processed', {
  txHash,
  userId,
  network,
  status: 'pending'
});

logger.info('Transaction status updated', {
  txHash,
  oldStatus,
  newStatus,
  confirmations
});
```

### 2. Metrics Collection

```javascript
// Track key metrics
const metrics = {
  transactionsProcessed: 0,
  transactionsConfirmed: 0,
  transactionsFailed: 0,
  averageConfirmationTime: 0
};
```

### 3. Alerting

```javascript
// Alert on critical issues
if (failedTransactions > threshold) {
  sendAlert('High transaction failure rate detected');
}
```

## Future Enhancements

### 1. WebSocket Support

```javascript
// Real-time status updates via WebSocket
const ws = new WebSocket('ws://api.example.com/transactions');

ws.onopen = () => {
  ws.send(JSON.stringify({
    type: 'subscribe',
    txHash: '0x...'
  }));
};
```

### 2. Event-Driven Architecture

```javascript
// Event-driven status updates
eventEmitter.on('transaction_confirmed', (transaction) => {
  notifyUser(transaction);
  updateAnalytics(transaction);
});
```

### 3. Multi-Chain Support

```javascript
// Support for multiple blockchain networks
const supportedNetworks = {
  ethereum: { confirmations: 1, rpcUrl: '...' },
  polygon: { confirmations: 256, rpcUrl: '...' },
  arbitrum: { confirmations: 1, rpcUrl: '...' }
};
```

## Best Practices Summary

1. **Always provide immediate feedback** to users when they submit a transaction
2. **Implement proper error handling** for network failures and timeouts
3. **Use appropriate polling intervals** (2-5 seconds) to balance responsiveness and performance
4. **Cache transaction status** to reduce API calls and improve performance
5. **Implement rate limiting** to prevent abuse and ensure service stability
6. **Provide clear user feedback** for different transaction states
7. **Log all transaction events** for debugging and monitoring
8. **Design for scalability** to handle high transaction volumes
9. **Implement security measures** to prevent unauthorized access
10. **Plan for future enhancements** like real-time updates and multi-chain support

This architecture provides a robust foundation for handling blockchain transaction status updates while maintaining good user experience and system reliability. 