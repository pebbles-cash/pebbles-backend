#!/bin/bash

# Test configuration
TEST_SECRET="CyBVSYh28hawqqAFk4EChrqqHwrXz"
BASE_URL="http://localhost:3000"
WEBHOOK_PATH="/dev/api/webhooks/meld"

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

echo -e "${BLUE}🚀 Starting Meld Webhook Tests...${NC}"
echo -e "${BLUE}📍 Testing endpoint: ${BASE_URL}${WEBHOOK_PATH}${NC}"
echo -e "${BLUE}🔑 Using test secret: ${TEST_SECRET}${NC}"
echo ""

# Function to generate HMAC signature
generate_signature() {
    local payload="$1"
    local secret="$2"
    echo -n "$payload" | openssl dgst -sha256 -hmac "$secret" | sed 's/^.*= //'
}

# Function to test webhook
test_webhook() {
    local test_name="$1"
    local payload="$2"
    
    echo -e "${YELLOW}🧪 Testing $test_name...${NC}"
    echo "Payload: $payload"
    
    # Generate signature
    local signature=$(generate_signature "$payload" "$TEST_SECRET")
    local signature_header="sha256=$signature"
    
    echo "Signature: $signature_header"
    
    # Make request
    local response=$(curl -s -w "\n%{http_code}" \
        -X POST \
        -H "Content-Type: application/json" \
        -H "meld-signature: $signature_header" \
        -d "$payload" \
        "${BASE_URL}${WEBHOOK_PATH}")
    
    # Extract status code (last line)
    local status_code=$(echo "$response" | tail -n1)
    local response_body=$(echo "$response" | head -n -1)
    
    echo -e "${BLUE}📊 Response Status: $status_code${NC}"
    echo "Response Body: $response_body"
    
    if [ "$status_code" = "200" ]; then
        echo -e "${GREEN}✅ Webhook test PASSED${NC}"
    else
        echo -e "${RED}❌ Webhook test FAILED${NC}"
    fi
    echo ""
}

# Function to test error cases
test_error_case() {
    local test_name="$1"
    local payload="$2"
    local expected_status="$3"
    local signature_header="$4"
    
    echo -e "${YELLOW}🧪 Testing $test_name...${NC}"
    
    local curl_cmd="curl -s -w '\n%{http_code}' -X POST -H 'Content-Type: application/json'"
    
    if [ -n "$signature_header" ]; then
        curl_cmd="$curl_cmd -H 'meld-signature: $signature_header'"
    fi
    
    curl_cmd="$curl_cmd -d '$payload' '${BASE_URL}${WEBHOOK_PATH}'"
    
    local response=$(eval $curl_cmd)
    local status_code=$(echo "$response" | tail -n1)
    local response_body=$(echo "$response" | head -n -1)
    
    echo -e "${BLUE}📊 Response Status: $status_code${NC}"
    echo "Response Body: $response_body"
    
    if [ "$status_code" = "$expected_status" ]; then
        echo -e "${GREEN}✅ Correctly handled error case${NC}"
    else
        echo -e "${RED}❌ Expected status $expected_status, got $status_code${NC}"
    fi
    echo ""
}

# Test payloads
BANK_LINKING_PAYLOAD='{
  "type": "BANK_LINKING_CONNECTION_COMPLETED",
  "id": "evt_test_123",
  "accountId": "acc_test_456",
  "data": {
    "connectionId": "conn_test_789",
    "status": "active",
    "accounts": [
      {
        "id": "bank_acc_1",
        "name": "Checking Account",
        "type": "checking"
      }
    ]
  }
}'

ONRAMP_COMPLETED_PAYLOAD='{
  "type": "ONRAMP_COMPLETED",
  "id": "evt_test_124",
  "accountId": "acc_test_456",
  "data": {
    "transactionId": "txn_test_789",
    "amount": "100.00",
    "currency": "USD",
    "status": "completed",
    "externalTransactionId": "ext_txn_123"
  }
}'

ONRAMP_FAILED_PAYLOAD='{
  "type": "ONRAMP_FAILED",
  "id": "evt_test_125",
  "accountId": "acc_test_456",
  "data": {
    "transactionId": "txn_test_790",
    "amount": "50.00",
    "currency": "USD",
    "status": "failed",
    "error": "Insufficient funds",
    "externalTransactionId": "ext_txn_124"
  }
}'

TRANSACTIONS_ADDED_PAYLOAD='{
  "type": "FINANCIAL_ACCOUNT_TRANSACTIONS_ADDED",
  "id": "evt_test_126",
  "accountId": "acc_test_456",
  "data": {
    "accountId": "bank_acc_1",
    "transactions": [
      {
        "id": "txn_1",
        "amount": "25.50",
        "currency": "USD",
        "description": "Coffee shop",
        "date": "'$(date -u +%Y-%m-%dT%H:%M:%S.%3NZ)'"
      }
    ]
  }
}'

# New crypto transaction webhook payloads
CRYPTO_PENDING_PAYLOAD='{
  "type": "TRANSACTION_CRYPTO_PENDING",
  "id": "evt_test_127",
  "accountId": "acc_test_456",
  "data": {
    "transactionId": "crypto_txn_001",
    "status": "PENDING",
    "sourceAmount": "100.00",
    "sourceCurrency": "USD",
    "destinationAmount": "0.05",
    "destinationCurrency": "ETH",
    "destinationAddress": "0x742d35Cc6634C0532925a3b8D4C9db96C4b4d8b6"
  }
}'

CRYPTO_TRANSFERRING_PAYLOAD='{
  "type": "TRANSACTION_CRYPTO_TRANSFERRING",
  "id": "evt_test_128",
  "accountId": "acc_test_456",
  "data": {
    "transactionId": "crypto_txn_001",
    "status": "TRANSFERRING",
    "sourceAmount": "100.00",
    "sourceCurrency": "USD",
    "destinationAmount": "0.05",
    "destinationCurrency": "ETH",
    "destinationAddress": "0x742d35Cc6634C0532925a3b8D4C9db96C4b4d8b6"
  }
}'

CRYPTO_COMPLETE_PAYLOAD='{
  "type": "TRANSACTION_CRYPTO_COMPLETE",
  "id": "evt_test_129",
  "accountId": "acc_test_456",
  "data": {
    "transactionId": "crypto_txn_001",
    "status": "COMPLETED",
    "sourceAmount": "100.00",
    "sourceCurrency": "USD",
    "destinationAmount": "0.05",
    "destinationCurrency": "ETH",
    "destinationAddress": "0x742d35Cc6634C0532925a3b8D4C9db96C4b4d8b6",
    "blockchainTransactionHash": "0x1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef"
  }
}'

CRYPTO_FAILED_PAYLOAD='{
  "type": "TRANSACTION_CRYPTO_FAILED",
  "id": "evt_test_130",
  "accountId": "acc_test_456",
  "data": {
    "transactionId": "crypto_txn_002",
    "status": "FAILED",
    "sourceAmount": "50.00",
    "sourceCurrency": "USD",
    "destinationAmount": "0.025",
    "destinationCurrency": "ETH",
    "destinationAddress": "0x742d35Cc6634C0532925a3b8D4C9db96C4b4d8b6",
    "failureReason": "Insufficient funds"
  }
}'

# Run tests
test_webhook "Bank Linking Completed" "$BANK_LINKING_PAYLOAD"
test_webhook "Onramp Completed" "$ONRAMP_COMPLETED_PAYLOAD"
test_webhook "Onramp Failed" "$ONRAMP_FAILED_PAYLOAD"
test_webhook "Transactions Added" "$TRANSACTIONS_ADDED_PAYLOAD"

# Test new crypto transaction webhooks
test_webhook "Crypto Transaction Pending" "$CRYPTO_PENDING_PAYLOAD"
test_webhook "Crypto Transaction Transferring" "$CRYPTO_TRANSFERRING_PAYLOAD"
test_webhook "Crypto Transaction Complete" "$CRYPTO_COMPLETE_PAYLOAD"
test_webhook "Crypto Transaction Failed" "$CRYPTO_FAILED_PAYLOAD"

# Test error cases
test_error_case "Without Signature" "$ONRAMP_COMPLETED_PAYLOAD" "401" ""
test_error_case "Invalid Signature" "$ONRAMP_COMPLETED_PAYLOAD" "401" "sha256=invalid_signature_here"

echo -e "${GREEN}🎉 All tests completed!${NC}" 