# Payment Platform API

A serverless API for a payment platform built for freelancers, content creators, and digital nomads.

## Features

- 🔐 Authentication via Dynamic wallet service
- 💰 Payment processing with QR codes
- 👛 Wallet management
- 📊 Transaction tracking and analytics
- 🔄 Subscription management
- 💸 Tipping functionality

## Tech Stack

- TypeScript
- AWS Lambda
- API Gateway
- MongoDB with Mongoose
- Serverless Framework
- JWT Authentication

## Getting Started

### Prerequisites

- Node.js 18+
- MongoDB
- AWS CLI configured with appropriate permissions
- Serverless Framework CLI

### Installation

1. Clone the repository:
   ```bash
   git clone https://github.com/yourusername/payment-platform-api.git
   cd payment-platform-api
   ```

2. Install dependencies:
   ```bash
   npm install
   ```

3. Set up environment variables:
   ```bash
   # Create .env file for local development
   cp .env.example .env
   # Edit .env with your own values
   ```

4. Start MongoDB locally:
   ```bash
   # Using Docker
   docker run -d -p 27017:27017 --name mongodb mongo:latest 
   
   # Or use your local MongoDB instance
   ```

5. Run the project locally:
   ```bash
   npm run dev
   ```

### Deployment

1. Configure AWS parameters in SSM Parameter Store:
   ```bash
   # Set up required parameters
   aws ssm put-parameter --name /payment-platform/dev/mongodb/uri --type SecureString --value "your-mongodb-connection-string"
   aws ssm put-parameter --name /payment-platform/dev/jwt/secret --type SecureString --value "your-jwt-secret"
   aws ssm put-parameter --name /payment-platform/dev/dynamic/api-key --type SecureString --value "your-dynamic-api-key"
   aws ssm put-parameter --name /payment-platform/dev/dynamic/api-url --type String --value "https://api.dynamic.xyz"
   aws ssm put-parameter --name /payment-platform/dev/auth/redirect-url --type String --value "https://app.payment-platform.com/auth/callback"
   aws ssm put-parameter --name /payment-platform/dev/payment/base-url --type String --value "https://app.payment-platform.com"
   ```

2. Deploy to AWS:
   ```bash
   # Deploy to development environment
   npm run deploy
   
   # Deploy to production environment
   npm run deploy:prod
   ```

## Project Structure

```
payment-platform-api/
│
├── src/
│   ├── handlers/        # Lambda function handlers
│   ├── models/          # Mongoose data models
│   ├── services/        # External service integrations
│   ├── middleware/      # Shared middleware
│   ├── utils/           # Utility functions
│   └── types/           # TypeScript type definitions
│
├── tests/               # Test files
├── .env                 # Local environment variables
├── serverless.ts        # Serverless Framework configuration
├── tsconfig.json        # TypeScript configuration
└── package.json         # Project dependencies
```

## API Endpoints

### Authentication

- `POST /api/auth/login` - Initiate Dynamic login flow
- `POST /api/auth/callback` - Handle Dynamic authentication callback

### User Management

- `GET /api/users/me` - Get current user profile
- `PUT /api/users/me` - Update user profile
- `GET /api/users/:username` - Get user profile by username
- `POST /api/users/social-stats` - Update user social media statistics

### Wallet Management

- `GET /api/wallets` - Get user's wallets
- `GET /api/wallets/:walletId` - Get specific wallet details
- `GET /api/wallets/:walletId/balance` - Get wallet balance
- `POST /api/wallets/create` - Create a new wallet

### Payments

- `POST /api/payments/qr-code` - Generate regular payment QR code
- `POST /api/payments/request` - Create payment request with specified amount
- `GET /api/payments/request/:requestId` - Get payment request details
- `POST /api/payments/process` - Process a payment
- `GET /api/payments/url/:username` - Get payment URL for a username

### Transactions

- `GET /api/transactions` - Get user's transactions
- `GET /api/transactions/:transactionId` - Get transaction details
- `GET /api/transactions/stats` - Get transaction statistics
- `POST /api/transactions/filter` - Filter transactions by criteria

### Subscriptions

- `POST /api/subscriptions` - Create a new subscription plan
- `GET /api/subscriptions` - List creator's subscription plans
- `GET /api/subscriptions/:subscriptionId` - Get subscription plan details
- `PUT /api/subscriptions/:subscriptionId` - Update subscription plan
- `DELETE /api/subscriptions/:subscriptionId` - Delete subscription plan
- `POST /api/subscriptions/:subscriptionId/subscribe` - Subscribe to a plan
- `POST /api/subscriptions/manage/:instanceId` - Manage subscription instance

### Tipping

- `POST /api/tips/jar` - Create or update tip jar
- `GET /api/tips/jar/:username` - Get tip jar details
- `POST /api/tips/send` - Send a tip

## Testing

Run the test suite:

```bash
npm test
```

Run tests with coverage:

```bash
npm run test:coverage
```

Run specific tests:
```
npm test -- tests/handlers/auth.test.ts
``` 

## Contributing

1. Fork the repository
2. Create your feature branch (`git checkout -b feature/amazing-feature`)
3. Commit your changes (`git commit -m 'Add some amazing feature'`)
4. Push to the branch (`git push origin feature/amazing-feature`)
5. Open a Pull Request

## License

This project is licensed under the MIT License - see the LICENSE file for details.