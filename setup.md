# Payment Platform API - Serverless Setup Guide

This guide will walk you through setting up the complete NodeJS/MongoDB serverless project for AWS Lambda.

## 1. Project Initialization

```bash
# Create project directory
mkdir payment-platform-api
cd payment-platform-api

# Initialize npm
npm init -y

# Create project structure
mkdir -p src/{handlers,models,services,utils}
```

## 2. Install Dependencies

```bash
# Install production dependencies
npm install mongoose jsonwebtoken qrcode axios uuid crypto

# Install AWS Lambda specific dependencies
npm install aws-sdk

# Install development dependencies
npm install --save-dev serverless serverless-esbuild serverless-offline serverless-domain-manager esbuild nodemon jest
```

## 3. Update package.json

Replace your `package.json` with:

```json
{
  "name": "payment-platform-api",
  "version": "1.0.0",
  "description": "Serverless payment platform API for freelancers and content creators",
  "main": "index.js",
  "scripts": {
    "start": "serverless offline start",
    "deploy": "serverless deploy",
    "deploy:prod": "serverless deploy --stage prod",
    "dev": "nodemon --exec serverless offline",
    "test": "jest"
  },
  "dependencies": {
    "mongoose": "^7.5.0",
    "jsonwebtoken": "^9.0.0",
    "qrcode": "^1.5.3",
    "axios": "^1.4.0",
    "uuid": "^9.0.0",
    "crypto": "^1.0.1",
    "aws-sdk": "^2.1445.0"
  },
  "devDependencies": {
    "serverless": "^3.33.0",
    "serverless-esbuild": "^1.46.0",
    "serverless-offline": "^12.0.4",
    "serverless-domain-manager": "^7.0.2",
    "esbuild": "^0.19.2",
    "nodemon": "^3.0.1",
    "jest": "^29.6.4"
  },
  "engines": {
    "node": ">=18.0.0"
  }
}
```

## 4. Configure Serverless

Create a `serverless.yml` file in the root directory:

```yaml
service: payment-platform-api

frameworkVersion: '3'

provider:
  name: aws
  runtime: nodejs18.x
  stage: ${opt:stage, 'dev'}
  region: ${opt:region, 'us-east-1'}
  memorySize: 256
  timeout: 30
  environment:
    MONGODB_URI: ${ssm:/payment-platform/${self:provider.stage}/mongodb/uri~true}
    MONGODB_DATABASE: payment_platform_${self:provider.stage}
    JWT_SECRET: ${ssm:/payment-platform/${self:provider.stage}/jwt/secret~true}
    DYNAMIC_API_KEY: ${ssm:/payment-platform/${self:provider.stage}/dynamic/api-key~true}
    DYNAMIC_API_URL: ${ssm:/payment-platform/${self:provider.stage}/dynamic/api-url}
    AUTH_REDIRECT_URL: ${ssm:/payment-platform/${self:provider.stage}/auth/redirect-url}
    PAYMENT_BASE_URL: ${ssm:/payment-platform/${self:provider.stage}/payment/base-url}
  iam:
    role:
      statements:
        - Effect: Allow
          Action:
            - ssm:GetParameters
            - ssm:GetParameter
          Resource: 
            - 'arn:aws:ssm:${self:provider.region}:*:parameter/payment-platform/${self:provider.stage}/*'
        - Effect: Allow
          Action:
            - logs:CreateLogGroup
            - logs:CreateLogStream
            - logs:PutLogEvents
          Resource: 'arn:aws:logs:${self:provider.region}:*:*'

functions:
  # Authentication Handlers
  authLogin:
    handler: src/handlers/auth.login
    events:
      - http:
          path: /api/auth/login
          method: post
          cors: true
  
  authCallback:
    handler: src/handlers/auth.callback
    events:
      - http:
          path: /api/auth/callback
          method: post
          cors: true
  
  # User Management Handlers
  getCurrentUser:
    handler: src/handlers/users.getCurrentUser
    events:
      - http:
          path: /api/users/me
          method: get
          cors: true
  
  updateCurrentUser:
    handler: src/handlers/users.updateCurrentUser
    events:
      - http:
          path: /api/users/me
          method: put
          cors: true
  
  getUserByUsername:
    handler: src/handlers/users.getUserByUsername
    events:
      - http:
          path: /api/users/{username}
          method: get
          cors: true
  
  updateSocialStats:
    handler: src/handlers/users.updateSocialStats
    events:
      - http:
          path: /api/users/social-stats
          method: post
          cors: true
  
  # Wallet Management Handlers
  getUserWallets:
    handler: src/handlers/wallets.getUserWallets
    events:
      - http:
          path: /api/wallets
          method: get
          cors: true
  
  getWalletDetails:
    handler: src/handlers/wallets.getWalletDetails
    events:
      - http:
          path: /api/wallets/{walletId}
          method: get
          cors: true
  
  getWalletBalance:
    handler: src/handlers/wallets.getWalletBalance
    events:
      - http:
          path: /api/wallets/{walletId}/balance
          method: get
          cors: true
  
  createWallet:
    handler: src/handlers/wallets.createWallet
    events:
      - http:
          path: /api/wallets/create
          method: post
          cors: true
  
  # Payment & QR Code Handlers
  generateQRCode:
    handler: src/handlers/payments.generateQRCode
    events:
      - http:
          path: /api/payments/qr-code
          method: post
          cors: true
  
  createPaymentRequest:
    handler: src/handlers/payments.createPaymentRequest
    events:
      - http:
          path: /api/payments/request
          method: post
          cors: true
  
  getPaymentRequest:
    handler: src/handlers/payments.getPaymentRequest
    events:
      - http:
          path: /api/payments/request/{requestId}
          method: get
          cors: true
  
  processPayment:
    handler: src/handlers/payments.processPayment
    events:
      - http:
          path: /api/payments/process
          method: post
          cors: true
  
  getPaymentUrl:
    handler: src/handlers/payments.getPaymentUrl
    events:
      - http:
          path: /api/payments/url/{username}
          method: get
          cors: true

  # Add remaining handlers for orders, transactions, subscriptions, etc.

custom:
  esbuild:
    bundle: true
    minify: false
    sourcemap: true
    exclude: ['aws-sdk']
    target: 'node18'
    define:
      'require.resolve': undefined
    platform: 'node'
    concurrency: 10
  serverless-offline:
    httpPort: 3000
    lambdaPort: 3002
    useChildProcesses: true
    # Enable environment variables for local development
    # Override these in a .env file for local development
    environment:
      MONGODB_URI: ${env:MONGODB_URI, 'mongodb://localhost:27017'}
      MONGODB_DATABASE: ${env:MONGODB_DATABASE, 'payment_platform_dev'}
      JWT_SECRET: ${env:JWT_SECRET, 'local-dev-jwt-secret'}
      DYNAMIC_API_KEY: ${env:DYNAMIC_API_KEY, 'test-api-key'}
      DYNAMIC_API_URL: ${env:DYNAMIC_API_URL, 'http://localhost:3003/mock'}
      AUTH_REDIRECT_URL: ${env:AUTH_REDIRECT_URL, 'http://localhost:3000/auth/callback'}
      PAYMENT_BASE_URL: ${env:PAYMENT_BASE_URL, 'http://localhost:3000'}
  # Domain management for API Gateway
  customDomain:
    domainName: api-${self:provider.stage}.payment-platform.com
    basePath: ''
    stage: ${self:provider.stage}
    createRoute53Record: true
    certificateName: '*.payment-platform.com'
    endpointType: edge
    securityPolicy: tls_1_2
    apiType: rest
    autoDomain: true

plugins:
  - serverless-esbuild
  - serverless-offline
  - serverless-domain-manager
```

## 5. Create Auth Middleware (Optional)

To reduce duplicated authentication code, create an authentication middleware:

```javascript
// src/middleware/auth.js
const jwt = require('jsonwebtoken');
const { error } = require('../utils/response');

/**
 * Authentication middleware for Lambda functions
 * @param {Function} handler - The Lambda handler function
 * @returns {Function} - Wrapped handler with authentication
 */
const requireAuth = (handler) => {
  return async (event, context) => {
    try {
      // Extract JWT from Authorization header
      const token = event.headers.Authorization?.split(' ')[1] || 
                    event.headers.authorization?.split(' ')[1];
      
      if (!token) {
        return error('Authorization required', 401);
      }
      
      // Verify token
      let decoded;
      try {
        decoded = jwt.verify(token, process.env.JWT_SECRET);
      } catch (err) {
        return error('Invalid or expired token', 401);
      }
      
      // Add user info to the event object
      event.user = decoded;
      
      // Call the original handler
      return await handler(event, context);
    } catch (err) {
      console.error('Authentication error:', err);
      return error('Authentication failed', 500);
    }
  };
};

module.exports = {
  requireAuth
};
```

## 6. Local Development Setup

### Create a .env file:

```
MONGODB_URI=mongodb://localhost:27017
MONGODB_DATABASE=payment_platform_dev
JWT_SECRET=local-dev-jwt-secret
DYNAMIC_API_KEY=test-api-key
DYNAMIC_API_URL=http://localhost:3003/mock
AUTH_REDIRECT_URL=http://localhost:3000/auth/callback
PAYMENT_BASE_URL=http://localhost:3000
```

### Start local MongoDB:

```bash
# Using Docker
docker run -d -p 27017:27017 --name mongodb mongo:latest

# Or install and run MongoDB locally following MongoDB documentation
```

### Run the project:

```bash
npm run dev
```

## 7. AWS Setup

### Create Parameter Store Values:

```bash
# Install AWS CLI and configure with credentials
aws configure

# Create SSM Parameters
aws ssm put-parameter --name /payment-platform/dev/mongodb/uri --type SecureString --value "mongodb+srv://username:password@cluster.mongodb.net"
aws ssm put-parameter --name /payment-platform/dev/jwt/secret --type SecureString --value "your-secure-jwt-secret"
aws ssm put-parameter --name /payment-platform/dev/dynamic/api-key --type SecureString --value "your-dynamic-api-key"
aws ssm put-parameter --name /payment-platform/dev/dynamic/api-url --type String --value "https://api.dynamic.xyz"
aws ssm put-parameter --name /payment-platform/dev/auth/redirect-url --type String --value "https://app.payment-platform.com/auth/callback"
aws ssm put-parameter --name /payment-platform/dev/payment/base-url --type String --value "https://app.payment-platform.com"
```

### Deploy to AWS:

```bash
npm run deploy
```

## 8. Monitoring and Debugging

### CloudWatch Logs:

Lambda functions automatically log to CloudWatch. You can view logs in the AWS Console or using the AWS CLI:

```bash
# Get logs for a specific function
aws logs filter-log-events --log-group-name "/aws/lambda/payment-platform-api-dev-authLogin"
```

### X-Ray Tracing (Optional):

Add the following to your `serverless.yml` to enable X-Ray tracing:

```yaml
provider:
  name: aws
  tracing:
    apiGateway: true
    lambda: true
```

### Add Mongoose Debug Mode (Development):

In your mongoose connection service, you can enable debug mode for development:

```javascript
// For local development only
if (process.env.NODE_ENV !== 'production') {
  mongoose.set('debug', true);
}
```

## 9. Testing

Create a basic Jest test setup:

```javascript
// tests/handlers/auth.test.js
const { login, callback } = require('../../src/handlers/auth');
const mongoose = require('mongoose');

// Mock dependencies
jest.mock('../../src/services/mongoose', () => ({
  connectToDatabase: jest.fn().mockResolvedValue()
}));

jest.mock('jsonwebtoken', () => ({
  sign: jest.fn().mockReturnValue('test-token'),
  verify: jest.fn().mockReturnValue({ userId: 'test-user-id' })
}));

// Tests
describe('Auth Handler', () => {
  beforeAll(async () => {
    // Setup test database connection if needed
  });

  afterAll(async () => {
    await mongoose.disconnect();
  });

  test('login should return auth URL', async () => {
    const event = {
      body: JSON.stringify({
        loginMethod: 'email'
      })
    };

    const response = await login(event);
    expect(response.statusCode).toBe(200);
    
    const body = JSON.parse(response.body);
    expect(body.success).toBe(true);
    expect(body.data).toHaveProperty('authUrl');
  });
});
```

Run tests with:

```bash
npm test
```

## 10. Production Considerations

### Database Indexing:

Create indexes on fields that will be frequently queried:

```javascript
// Example: Add to User model
userSchema.index({ username: 1 }, { unique: true });
userSchema.index({ email: 1 }, { unique: true });
userSchema.index({ dynamicUserId: 1 }, { unique: true });

// Example: Add to Wallet model
walletSchema.index({ userId: 1 });
walletSchema.index({ address: 1 }, { unique: true });

// Example: Add to Transaction model
transactionSchema.index({ fromUserId: 1 });
transactionSchema.index({ toUserId: 1 });
transactionSchema.index({ status: 1 });
```

### Lambda Provisioned Concurrency:

For critical endpoints with cold start concerns, configure provisioned concurrency:

```yaml
functions:
  processPayment:
    handler: src/handlers/payments.processPayment
    events:
      - http:
          path: /api/payments/process
          method: post
          cors: true
    provisionedConcurrency: 5
```

### Environment-Specific Deployments:

```bash
# Deploy to staging
npm run deploy -- --stage staging

# Deploy to production
npm run deploy:prod
```

### CI/CD Integration:

Create a GitHub Actions workflow file:

```yaml
# .github/workflows/deploy.yml
name: Deploy API

on:
  push:
    branches:
      - main
      - staging

jobs:
  deploy:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v3
      
      - name: Set up Node.js
        uses: actions/setup-node@v3
        with:
          node-version: '18'
          
      - name: Install dependencies
        run: npm ci
      
      - name: Run tests
        run: npm test
      
      - name: Deploy to AWS
        env:
          AWS_ACCESS_KEY_ID: ${{ secrets.AWS_ACCESS_KEY_ID }}
          AWS_SECRET_ACCESS_KEY: ${{ secrets.AWS_SECRET_ACCESS_KEY }}
        run: |
          if [[ $GITHUB_REF == 'refs/heads/main' ]]; then
            npm run deploy:prod
          else
            npm run deploy -- --stage staging
          fi
```