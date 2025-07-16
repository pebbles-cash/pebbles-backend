# Blockchain Transaction Processing API

This document describes the new blockchain transaction processing endpoints and architecture for handling transaction status updates.

## Overview

The blockchain transaction processing system allows users to:
1. Submit blockchain transaction hashes for processing
2. Query transaction status from both local database and blockchain
3. Get real-time status updates as transactions are confirmed
4. Support multiple blockchain networks (Sepolia for dev, Ethereum for prod)

## Architecture

### Components

1. **Blockchain Service** (`src/services/blockchain-service.ts`)
   - Handles communication with blockchain networks using viem
   - Supports multiple networks (Sepolia, Ethereum)
   - Integrates with Etherscan API for detailed transaction info
   - Provides transaction status checking and confirmation monitoring

2. **Transaction Status Service** (`src/services/transaction-status-service.ts`)
   - Manages transaction lifecycle and status updates
   - Handles async status monitoring
   - Provides retry logic for failed operations
   - Maps blockchain statuses to internal status format

3. **Transaction Handlers** (`src/handlers/transactions.ts`)
   - REST API endpoints for transaction processing
   - Authentication and authorization
   - Request validation and error handling

### Status Flow

```
User submits txHash → Create transaction record → Start async monitoring → Update status as confirmed
```

1. **Initial Processing**: Transaction hash is validated and a local record is created
2. **Async Monitoring**: Background process checks blockchain status every 2 seconds
3. **Status Updates**: Transaction status is updated as confirmations are received
4. **Completion**: Transaction marked as completed when required confirmations are met

## API Endpoints

### 1. Process Transaction Hash
**POST** `/api/transactions/process`

Process a blockchain transaction hash and create a local transaction record.

**Headers:**
```
Authorization: Bearer <your-jwt-token>
Content-Type: application/json
```

**Request Body:**
```json
{
  "txHash": "0xabcdef1234567890abcdef1234567890abcdef1234567890abcdef1234567890",
  "network": "ethereum",
  "type": "payment",
  "category": "blockchain_transaction",
  "tags": ["blockchain"],
  "client": "blockchain",
  "projectId": "optional-project-id",
  "metadata": {
    "note": "Optional transaction note",
    "fromAddress": "0x1234...",
    "toAddress": "0x5678..."
  }
}
```

**Response (201):**
```json
{
  "success": true,
  "data": {
    "id": "507f1f77bcf86cd799439011",
    "txHash": "0xabcdef1234567890abcdef1234567890abcdef1234567890abcdef1234567890",
    "status": "pending",
    "type": "payment",
    "amount": "1000000000000000000",
    "fromAddress": "0x1234567890123456789012345678901234567890",
    "toAddress": "0x0987654321098765432109876543210987654321",
    "sourceChain": "ethereum",
    "destinationChain": "ethereum",
    "category": "blockchain_transaction",
    "tags": ["blockchain"],
    "client": "blockchain",
    "projectId": "optional-project-id",
    "metadata": {
      "note": "Optional transaction note",
      "fromAddress": "0x1234...",
      "toAddress": "0x5678...",
      "blockchainDetails": {
        "gas": "21000",
        "gasPrice": "20000000000",
        "nonce": 5,
        "blockNumber": 12345678,
        "confirmations": 0,
        "timestamp": 1640995200
      },
      "network": "ethereum"
    },
    "createdAt": "2024-01-01T12:00:00.000Z",
    "updatedAt": "2024-01-01T12:00:00.000Z",
    "message": "Transaction processed successfully. Status will be updated asynchronously."
  }
}
```

### 2. Get Transaction Status
**GET** `/api/transactions/status/{txHash}?network=ethereum`

Get the current status of a transaction by its hash.

**Headers:**
```
Authorization: Bearer <your-jwt-token>
```

**Response (200):**
```json
{
  "success": true,
  "data": {
    "transaction": {
      "id": "507f1f77bcf86cd799439011",
      "txHash": "0xabcdef1234567890abcdef1234567890abcdef1234567890abcdef1234567890",
      "status": "completed",
      "type": "payment",
      "amount": "1000000000000000000",
      "fromAddress": "0x1234567890123456789012345678901234567890",
      "toAddress": "0x0987654321098765432109876543210987654321",
      "sourceChain": "ethereum",
      "destinationChain": "ethereum",
      "category": "blockchain_transaction",
      "tags": ["blockchain"],
      "client": "blockchain",
      "projectId": "optional-project-id",
      "metadata": {
        "blockchainDetails": {
          "gas": "21000",
          "gasPrice": "20000000000",
          "nonce": 5,
          "blockNumber": 12345678,
          "confirmations": 12,
          "timestamp": 1640995200
        },
        "network": "ethereum"
      },
      "createdAt": "2024-01-01T12:00:00.000Z",
      "updatedAt": "2024-01-01T12:05:00.000Z"
    },
    "blockchainStatus": {
      "isConfirmed": true,
      "status": "completed",
      "confirmations": 12,
      "blockNumber": 12345678,
      "error": null
    }
  }
}
```

### 3. Get Supported Networks
**GET** `/api/transactions/networks`

Get list of supported blockchain networks.

**Headers:**
```
Authorization: Bearer <your-jwt-token>
```

**Response (200):**
```json
{
  "success": true,
  "data": {
    "networks": ["sepolia", "ethereum"],
    "message": "Supported blockchain networks"
  }
}
```

## Environment Configuration

### Required Environment Variables

```bash
# Blockchain RPC URLs
SEPOLIA_RPC_URL=https://sepolia.infura.io/v3/your-project-id
ETHEREUM_RPC_URL=https://mainnet.infura.io/v3/your-project-id

# Etherscan API Key (for detailed transaction info)
ETHERSCAN_API_KEY=your-etherscan-api-key
```

### Network Configuration

- **Development**: Uses Sepolia testnet
- **Production**: Uses Ethereum mainnet
- **RPC Providers**: Configured via environment variables
- **API Keys**: Etherscan API key for enhanced transaction details

## Transaction Status Monitoring

### Status Types

- **pending**: Transaction submitted but not yet mined
- **completed**: Transaction confirmed with required confirmations
- **failed**: Transaction failed or not found

### Confirmation Threshold

- **Default**: 1 confirmation required
- **Configurable**: Can be adjusted per network
- **Real-time**: Status updates every 2 seconds during monitoring

### Monitoring Process

1. **Initial Check**: Transaction details fetched from blockchain
2. **Status Mapping**: Blockchain status mapped to internal format
3. **Confirmation Check**: Verify required confirmations are met
4. **Database Update**: Update local transaction record
5. **Retry Logic**: Up to 10 retries with 2-second delays

## Error Handling

### Common Error Responses

**Invalid Transaction Hash (400):**
```json
{
  "success": false,
  "message": "Invalid transaction hash format",
  "statusCode": 400
}
```

**Transaction Not Found (400):**
```json
{
  "success": false,
  "message": "Transaction not found on blockchain",
  "statusCode": 400
}
```

**Unsupported Network (400):**
```json
{
  "success": false,
  "message": "Unsupported network: polygon. Supported networks: sepolia, ethereum",
  "statusCode": 400
}
```

**Unauthorized (403):**
```json
{
  "success": false,
  "message": "Unauthorized to access this transaction",
  "statusCode": 403
}
```

## Frontend Integration Examples

### React/TypeScript Example

```typescript
interface ProcessTransactionRequest {
  txHash: string;
  network?: string;
  type?: string;
  category?: string;
  tags?: string[];
  client?: string;
  projectId?: string;
  metadata?: Record<string, any>;
}

interface TransactionStatus {
  isConfirmed: boolean;
  status: 'pending' | 'completed' | 'failed';
  confirmations: number;
  blockNumber?: number;
  error?: string;
}

// Process a transaction hash
async function processTransactionHash(request: ProcessTransactionRequest) {
  try {
    const response = await fetch('/api/transactions/process', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${getAuthToken()}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(request)
    });
    
    const data = await response.json();
    
    if (data.success) {
      return data.data;
    } else {
      throw new Error(data.message);
    }
  } catch (error) {
    console.error('Error processing transaction:', error);
    throw error;
  }
}

// Get transaction status
async function getTransactionStatus(txHash: string, network: string = 'ethereum') {
  try {
    const response = await fetch(
      `/api/transactions/status/${txHash}?network=${network}`,
      {
        headers: {
          'Authorization': `Bearer ${getAuthToken()}`
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
    console.error('Error getting transaction status:', error);
    throw error;
  }
}

// Poll for transaction confirmation
async function pollTransactionStatus(
  txHash: string, 
  network: string = 'ethereum',
  maxAttempts: number = 30
): Promise<TransactionStatus> {
  for (let i = 0; i < maxAttempts; i++) {
    try {
      const result = await getTransactionStatus(txHash, network);
      
      if (result.blockchainStatus.isConfirmed || result.blockchainStatus.status === 'failed') {
        return result.blockchainStatus;
      }
      
      // Wait 2 seconds before next check
      await new Promise(resolve => setTimeout(resolve, 2000));
    } catch (error) {
      console.error(`Error polling transaction status (attempt ${i + 1}):`, error);
      
      if (i === maxAttempts - 1) {
        throw error;
      }
    }
  }
  
  throw new Error('Transaction status polling timed out');
}

// Usage example
async function handleTransactionSubmission(txHash: string) {
  try {
    // Process the transaction
    const transaction = await processTransactionHash({
      txHash,
      network: 'ethereum',
      type: 'payment',
      category: 'user_payment',
      metadata: {
        note: 'Payment for services',
        fromAddress: '0x1234...',
        toAddress: '0x5678...'
      }
    });
    
    console.log('Transaction processed:', transaction);
    
    // Poll for confirmation
    const status = await pollTransactionStatus(txHash);
    
    if (status.isConfirmed) {
      console.log('Transaction confirmed!');
      // Update UI to show success
    } else if (status.status === 'failed') {
      console.log('Transaction failed:', status.error);
      // Update UI to show failure
    }
  } catch (error) {
    console.error('Transaction processing failed:', error);
    // Handle error in UI
  }
}
```

### JavaScript Example

```javascript
// Process transaction with polling
async function processAndMonitorTransaction(txHash, network = 'ethereum') {
  try {
    // Step 1: Process the transaction
    const processResponse = await fetch('/api/transactions/process', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${getAuthToken()}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        txHash,
        network,
        type: 'payment',
        category: 'blockchain_transaction'
      })
    });
    
    const processData = await processResponse.json();
    
    if (!processData.success) {
      throw new Error(processData.message);
    }
    
    console.log('Transaction processed:', processData.data);
    
    // Step 2: Poll for status updates
    let attempts = 0;
    const maxAttempts = 30; // 1 minute with 2-second intervals
    
    const pollStatus = async () => {
      const statusResponse = await fetch(
        `/api/transactions/status/${txHash}?network=${network}`,
        {
          headers: {
            'Authorization': `Bearer ${getAuthToken()}`
          }
        }
      );
      
      const statusData = await statusResponse.json();
      
      if (statusData.success) {
        const { blockchainStatus } = statusData.data;
        
        console.log(`Status: ${blockchainStatus.status}, Confirmations: ${blockchainStatus.confirmations}`);
        
        if (blockchainStatus.isConfirmed) {
          console.log('Transaction confirmed!');
          return blockchainStatus;
        } else if (blockchainStatus.status === 'failed') {
          console.log('Transaction failed:', blockchainStatus.error);
          return blockchainStatus;
        }
      }
      
      attempts++;
      if (attempts < maxAttempts) {
        setTimeout(pollStatus, 2000);
      } else {
        console.log('Polling timed out');
      }
    };
    
    // Start polling
    setTimeout(pollStatus, 2000);
    
  } catch (error) {
    console.error('Error processing transaction:', error);
    throw error;
  }
}

// Usage
processAndMonitorTransaction('0xabcdef1234567890abcdef1234567890abcdef1234567890abcdef1234567890')
  .then(() => console.log('Transaction monitoring completed'))
  .catch(error => console.error('Transaction failed:', error));
```

## Best Practices

### 1. Error Handling
- Always handle network errors and timeouts
- Implement retry logic for failed requests
- Show appropriate user feedback for different error states

### 2. User Experience
- Show loading states during transaction processing
- Display real-time status updates
- Provide clear error messages for failed transactions

### 3. Performance
- Use polling with reasonable intervals (2-5 seconds)
- Implement exponential backoff for retries
- Cache transaction data when possible

### 4. Security
- Always validate transaction hashes
- Check user authorization for transaction access
- Sanitize user inputs

### 5. Monitoring
- Log all transaction processing events
- Monitor blockchain API rate limits
- Track transaction success/failure rates

## Troubleshooting

### Common Issues

1. **Transaction Not Found**
   - Verify the transaction hash is correct
   - Check if the network parameter matches the actual network
   - Ensure the transaction has been broadcast to the network

2. **Status Not Updating**
   - Check if the transaction is still pending
   - Verify blockchain RPC endpoints are working
   - Check for rate limiting on blockchain APIs

3. **Network Errors**
   - Verify environment variables are set correctly
   - Check RPC provider status
   - Ensure Etherscan API key is valid

### Debug Information

The API includes detailed logging for debugging:
- Transaction processing steps
- Blockchain API responses
- Status update events
- Error details with context

Check server logs for detailed information about transaction processing. 