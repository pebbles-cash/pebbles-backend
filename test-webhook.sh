#!/bin/bash

# Test script for Meld webhook endpoints
# This script tests the webhook handler with various Meld webhook events

# Configuration
WEBHOOK_URL="http://localhost:3000/dev/webhooks/meld"
WEBHOOK_SECRET="${MELD_WEBHOOK_SECRET:-test-webhook-secret}"

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

echo -e "${BLUE}🚀 Starting Meld Webhook Tests${NC}"
echo -e "Webhook URL: ${WEBHOOK_URL}"
echo -e "Webhook Secret: ${WEBHOOK_SECRET}"
echo -e "=================================================="

# Function to generate signature
generate_signature() {
    local payload="$1"
    local secret="$2"
    echo -n "$payload" | openssl dgst -sha256 -hmac "$secret" | cut -d' ' -f2
}

# Function to test a webhook
test_webhook() {
    local name="$1"
    local event_type="$2"
    local data="$3"
    
    echo -e "\n${YELLOW}🧪 Testing: $name${NC}"
    echo -e "Event Type: $event_type"
    
    # Create webhook payload
    local payload=$(cat <<EOF
{
  "eventType": "$event_type",
  "eventId": "test-event-$(date +%s)",
  "timestamp": "$(date -u +%Y-%m-%dT%H:%M:%S.000Z)",
  "data": $data
}
EOF
)
    
    # Generate signature
    local signature=$(generate_signature "$payload" "$WEBHOOK_SECRET")
    
    # Send webhook request
    local response=$(curl -s -w "\n%{http_code}" -X POST "$WEBHOOK_URL" \
        -H "Content-Type: application/json" \
        -H "X-Meld-Signature: $signature" \
        -H "User-Agent: Meld-Webhook-Test/1.0" \
        -d "$payload")
    
    # Extract status code and response body
    local status_code=$(echo "$response" | tail -n1)
    local response_body=$(echo "$response" | head -n -1)
    
    if [ "$status_code" = "200" ]; then
        echo -e "${GREEN}✅ Status: $status_code${NC}"
        echo -e "Response: $response_body"
        
        # Test the corresponding FiatInteraction endpoint if transactionId exists
        if echo "$data" | grep -q "transactionId"; then
            local transaction_id=$(echo "$data" | grep -o '"transactionId":"[^"]*"' | cut -d'"' -f4)
            if [ -n "$transaction_id" ]; then
                echo -e "\n${BLUE}🔍 Testing FiatInteraction endpoint for transaction: $transaction_id${NC}"
                echo -e "Expected endpoint: http://localhost:3000/dev/api/fiat-interactions/external/$transaction_id"
                echo -e "Note: This endpoint requires authentication in production"
            fi
        fi
    else
        echo -e "${RED}❌ Status: $status_code${NC}"
        echo -e "Response: $response_body"
    fi
    
    # Add delay between tests
    sleep 1
}

# Test data for different webhook types
echo -e "\n${BLUE}Testing Account Created${NC}"
test_webhook "Account Created" "ACCOUNT_CREATED" '{
  "accountId": "test-account-123",
  "userId": "test-user-456",
  "status": "active",
  "createdAt": "'$(date -u +%Y-%m-%dT%H:%M:%S.000Z)'"
}'

echo -e "\n${BLUE}Testing Onramp Completed${NC}"
test_webhook "Onramp Completed" "ONRAMP_COMPLETED" '{
  "accountId": "test-account-123",
  "transactionId": "tx-onramp-789",
  "fiatAmount": {"value": 100, "currency": "USD"},
  "cryptoAmount": {"value": 0.05, "currency": "ETH"},
  "exchangeRate": 2000,
  "status": "completed",
  "transactionHash": "0x1234567890abcdef",
  "createdAt": "'$(date -u +%Y-%m-%dT%H:%M:%S.000Z)'"
}'

echo -e "\n${BLUE}Testing Offramp Completed${NC}"
test_webhook "Offramp Completed" "OFFRAMP_COMPLETED" '{
  "accountId": "test-account-123",
  "transactionId": "tx-offramp-101",
  "cryptoAmount": {"value": 0.1, "currency": "ETH"},
  "fiatAmount": {"value": 200, "currency": "USD"},
  "exchangeRate": 2000,
  "status": "completed",
  "createdAt": "'$(date -u +%Y-%m-%dT%H:%M:%S.000Z)'"
}'

echo -e "\n${BLUE}Testing Crypto Transaction Pending${NC}"
test_webhook "Crypto Transaction Pending" "TRANSACTION_CRYPTO_PENDING" '{
  "accountId": "test-account-123",
  "transactionId": "tx-crypto-202",
  "sourceAmount": 100,
  "sourceCurrency": "USD",
  "destinationAmount": 0.05,
  "destinationCurrency": "ETH",
  "exchangeRate": 2000,
  "status": "pending",
  "sourceAccountId": "bank-123",
  "destinationAddress": "0x742d35Cc6634C0532925a3b8D4C9db96C4b4d8b6",
  "blockchain": "ethereum",
  "createdAt": "'$(date -u +%Y-%m-%dT%H:%M:%S.000Z)'"
}'

echo -e "\n${BLUE}Testing Crypto Transaction Complete${NC}"
test_webhook "Crypto Transaction Complete" "TRANSACTION_CRYPTO_COMPLETE" '{
  "accountId": "test-account-123",
  "transactionId": "tx-crypto-202",
  "sourceAmount": 100,
  "sourceCurrency": "USD",
  "destinationAmount": 0.05,
  "destinationCurrency": "ETH",
  "exchangeRate": 2000,
  "status": "completed",
  "sourceAccountId": "bank-123",
  "destinationAddress": "0x742d35Cc6634C0532925a3b8D4C9db96C4b4d8b6",
  "blockchain": "ethereum",
  "blockchainTransactionHash": "0xabcdef1234567890",
  "createdAt": "'$(date -u +%Y-%m-%dT%H:%M:%S.000Z)'",
  "completedAt": "'$(date -u +%Y-%m-%dT%H:%M:%S.000Z)'"
}'

echo -e "\n${BLUE}Testing Crypto Transaction Failed${NC}"
test_webhook "Crypto Transaction Failed" "TRANSACTION_CRYPTO_FAILED" '{
  "accountId": "test-account-123",
  "transactionId": "tx-crypto-203",
  "sourceAmount": 50,
  "sourceCurrency": "USD",
  "destinationAmount": 0.025,
  "destinationCurrency": "ETH",
  "exchangeRate": 2000,
  "status": "failed",
  "failureReason": "Insufficient funds",
  "sourceAccountId": "bank-123",
  "destinationAddress": "0x742d35Cc6634C0532925a3b8D4C9db96C4b4d8b6",
  "blockchain": "ethereum",
  "createdAt": "'$(date -u +%Y-%m-%dT%H:%M:%S.000Z)'",
  "failedAt": "'$(date -u +%Y-%m-%dT%H:%M:%S.000Z)'"
}'

# Test error cases
echo -e "\n${BLUE}Testing Invalid Signature${NC}"
payload='{
  "eventType": "ACCOUNT_CREATED",
  "eventId": "test-invalid-sig",
  "timestamp": "'$(date -u +%Y-%m-%dT%H:%M:%S.000Z)'",
  "data": {"accountId": "test-account-123"}
}'

response=$(curl -s -w "\n%{http_code}" -X POST "$WEBHOOK_URL" \
    -H "Content-Type: application/json" \
    -H "X-Meld-Signature: invalid-signature" \
    -H "User-Agent: Meld-Webhook-Test/1.0" \
    -d "$payload")

status_code=$(echo "$response" | tail -n1)
response_body=$(echo "$response" | head -n -1)

if [ "$status_code" = "401" ]; then
    echo -e "${GREEN}✅ Correctly rejected invalid signature${NC}"
else
    echo -e "${RED}❌ Should have rejected invalid signature (Status: $status_code)${NC}"
fi

echo -e "\n${BLUE}Testing Missing Signature${NC}"
response=$(curl -s -w "\n%{http_code}" -X POST "$WEBHOOK_URL" \
    -H "Content-Type: application/json" \
    -H "User-Agent: Meld-Webhook-Test/1.0" \
    -d "$payload")

status_code=$(echo "$response" | tail -n1)
response_body=$(echo "$response" | head -n -1)

if [ "$status_code" = "401" ]; then
    echo -e "${GREEN}✅ Correctly rejected missing signature${NC}"
else
    echo -e "${RED}❌ Should have rejected missing signature (Status: $status_code)${NC}"
fi

echo -e "\n${GREEN}✅ All tests completed!${NC}"
echo -e "\n${BLUE}📝 Notes:${NC}"
echo -e "- Webhook processing logs should appear in your serverless offline console"
echo -e "- Check the database for created/updated FiatInteraction records"
echo -e "- Frontend should receive push notifications for status updates"
echo -e "- Use the FiatInteraction endpoints to query transaction status" 