# Pebbles Backend

### Authentication & User Management

- **POST /api/auth/login** - Initiate Dynamic login flow
- **POST /api/auth/callback** - Handle Dynamic authentication callback
- **GET /api/users/me** - Get current user profile
- **PUT /api/users/me** - Update user profile
- **GET /api/users/** - Get user profile by username
- **POST /api/users/social-stats** - Update user social media statistics

### Wallet Management

- **GET /api/wallets** - Get user's wallets
- **GET /api/wallets/** - Get specific wallet details
- **GET /api/wallets//balance** - Get wallet balance
- **POST /api/wallets/create** - Create a new wallet (EIP-7702 compatible)

### Payment & QR Codes

- **POST /api/payments/qr-code** - Generate regular payment QR code
- **POST /api/payments/request** - Create payment request with specified amount
- **GET /api/payments/request/** - Get payment request details
- **POST /api/payments/process** - Process a payment
- **GET /api/payments/url/** - Get payment URL for a username

### Orders Management

- **POST /api/orders** - Create a new order
- **GET /api/orders/** - Get order details
- **GET /api/orders** - List user's orders
- **PATCH /api/orders/** - Update order status

### Transactions

- **GET /api/transactions** - Get user's transactions
- **GET /api/transactions/** - Get transaction details
- **GET /api/transactions/stats** - Get transaction statistics
- **POST /api/transactions/filter** - Filter transactions by criteria

### Subscriptions

- **POST /api/subscriptions** - Create a new subscription plan
- **GET /api/subscriptions** - List creator's subscription plans
- **GET /api/subscriptions/** - Get subscription plan details
- **PUT /api/subscriptions/** - Update subscription plan
- **DELETE /api/subscriptions/** - Delete subscription plan
- **POST /api/subscriptions//subscribe** - Subscribe to a plan
- **POST /api/subscriptions/manage/** - Manage subscription instance