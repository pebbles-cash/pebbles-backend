# Environment Configuration Examples

This file shows how to structure your environment files for different deployment environments.

## Environment File Structure

Create separate `.env` files for each environment:
- `.env.development` (for dev environment)
- `.env.staging` (for staging environment)  
- `.env.production` (for production environment)

## Example: .env.development

```bash
# =============================================================================
# DEVELOPMENT ENVIRONMENT CONFIGURATION
# =============================================================================

NODE_ENV=development

# MongoDB Configuration
MONGODB_URI=mongodb://localhost:27017/pebbles-dev
MONGODB_DATABASE=pebbles-dev

# Authentication
JWT_SECRET=dev-jwt-secret-123456789
AUTH_REDIRECT_URL=https://dev.yourdomain.com/auth/callback
PAYMENT_BASE_URL=https://dev.yourdomain.com

# Dynamic Integration (Development Keys)
DYNAMIC_API_URL=https://api.dynamic.com
DYNAMIC_API_KEY=dynamic-dev-api-key-abc123
DYNAMIC_ENVIRONMENT_ID=dynamic-dev-environment-456
DYNAMIC_WEBHOOK_SECRET=dynamic-dev-webhook-secret-789

# Meld Integration (Development Keys)
MELD_API_URL=https://api.meld.io
MELD_API_KEY=meld-dev-api-key-def456
MELD_WEBHOOK_SECRET=meld-dev-webhook-secret-ghi789

# Firebase Configuration
FIREBASE_PROJECT_ID=pebbles-dev-firebase
FIREBASE_PRIVATE_KEY=your-firebase-private-key
FIREBASE_CLIENT_EMAIL=your-firebase-client-email
FIREBASE_SERVICE_ACCOUNT_JSON=your-firebase-service-account-json

# Firebase Settings
SKIP_FCM_VALIDATION=false
FCM_VALIDATION_TIMEOUT=5000
ENABLE_FIREBASE_DEBUG=true

# Blockchain Configuration (Development - Sepolia Testnet)
SEPOLIA_RPC_URL=https://sepolia.infura.io/v3/your-project-id
ETHEREUM_RPC_URL=https://mainnet.infura.io/v3/your-project-id
ETHERSCAN_API_KEY=your-etherscan-api-key

# Optional Configurations
IPINFO_TOKEN=your-ipinfo-token
LLM_PROVIDER=openai
OPENAI_API_KEY=your-openai-api-key
OPENAI_MODEL=gpt-4
ANTHROPIC_API_KEY=your-anthropic-api-key
ANTHROPIC_MODEL=claude-3-opus-20240229
```

## Example: .env.staging

```bash
# =============================================================================
# STAGING ENVIRONMENT CONFIGURATION
# =============================================================================

NODE_ENV=staging

# MongoDB Configuration
MONGODB_URI=mongodb://staging-cluster.mongodb.net/pebbles-staging
MONGODB_DATABASE=pebbles-staging

# Authentication
JWT_SECRET=staging-jwt-secret-987654321
AUTH_REDIRECT_URL=https://staging.yourdomain.com/auth/callback
PAYMENT_BASE_URL=https://staging.yourdomain.com

# Dynamic Integration (Staging Keys)
DYNAMIC_API_URL=https://api.dynamic.com
DYNAMIC_API_KEY=dynamic-staging-api-key-xyz789
DYNAMIC_ENVIRONMENT_ID=dynamic-staging-environment-123
DYNAMIC_WEBHOOK_SECRET=dynamic-staging-webhook-secret-456

# Meld Integration (Staging Keys)
MELD_API_URL=https://api.meld.io
MELD_API_KEY=meld-staging-api-key-uvw123
MELD_WEBHOOK_SECRET=meld-staging-webhook-secret-rst456

# Firebase Configuration
FIREBASE_PROJECT_ID=pebbles-staging-firebase
FIREBASE_PRIVATE_KEY=your-firebase-private-key
FIREBASE_CLIENT_EMAIL=your-firebase-client-email
FIREBASE_SERVICE_ACCOUNT_JSON=your-firebase-service-account-json

# Firebase Settings
SKIP_FCM_VALIDATION=false
FCM_VALIDATION_TIMEOUT=5000
ENABLE_FIREBASE_DEBUG=false

# Blockchain Configuration (Staging - Sepolia Testnet)
SEPOLIA_RPC_URL=https://sepolia.infura.io/v3/your-project-id
ETHEREUM_RPC_URL=https://mainnet.infura.io/v3/your-project-id
ETHERSCAN_API_KEY=your-etherscan-api-key

# Optional Configurations
IPINFO_TOKEN=your-ipinfo-token
LLM_PROVIDER=openai
OPENAI_API_KEY=your-openai-api-key
OPENAI_MODEL=gpt-4
ANTHROPIC_API_KEY=your-anthropic-api-key
ANTHROPIC_MODEL=claude-3-opus-20240229
```

## Example: .env.production

```bash
# =============================================================================
# PRODUCTION ENVIRONMENT CONFIGURATION
# =============================================================================

NODE_ENV=production

# MongoDB Configuration
MONGODB_URI=mongodb://prod-cluster.mongodb.net/pebbles-prod
MONGODB_DATABASE=pebbles-prod

# Authentication
JWT_SECRET=prod-jwt-secret-super-secure-123
AUTH_REDIRECT_URL=https://yourdomain.com/auth/callback
PAYMENT_BASE_URL=https://yourdomain.com

# Dynamic Integration (Production Keys)
DYNAMIC_API_URL=https://api.dynamic.com
DYNAMIC_API_KEY=dynamic-prod-api-key-live-456
DYNAMIC_ENVIRONMENT_ID=dynamic-prod-environment-789
DYNAMIC_WEBHOOK_SECRET=dynamic-prod-webhook-secret-live-012

# Meld Integration (Production Keys)
MELD_API_URL=https://api.meld.io
MELD_API_KEY=meld-prod-api-key-live-345
MELD_WEBHOOK_SECRET=meld-prod-webhook-secret-live-678

# Firebase Configuration
FIREBASE_PROJECT_ID=pebbles-prod-firebase
FIREBASE_PRIVATE_KEY=your-firebase-private-key
FIREBASE_CLIENT_EMAIL=your-firebase-client-email
FIREBASE_SERVICE_ACCOUNT_JSON=your-firebase-service-account-json

# Firebase Settings
SKIP_FCM_VALIDATION=false
FCM_VALIDATION_TIMEOUT=5000
ENABLE_FIREBASE_DEBUG=false

# Blockchain Configuration (Production - Ethereum Mainnet)
SEPOLIA_RPC_URL=https://sepolia.infura.io/v3/your-project-id
ETHEREUM_RPC_URL=https://mainnet.infura.io/v3/your-project-id
ETHERSCAN_API_KEY=your-etherscan-api-key

# Optional Configurations
IPINFO_TOKEN=your-ipinfo-token
LLM_PROVIDER=openai
OPENAI_API_KEY=your-openai-api-key
OPENAI_MODEL=gpt-4
ANTHROPIC_API_KEY=your-anthropic-api-key
ANTHROPIC_MODEL=claude-3-opus-20240229
```

## Key Differences Between Environments

### API Keys
- **Development**: Use sandbox/test API keys from Dynamic and Meld
- **Staging**: Use staging API keys (if available) or test keys
- **Production**: Use live/production API keys

### URLs and Domains
- **Development**: `dev.yourdomain.com` or `localhost`
- **Staging**: `staging.yourdomain.com`
- **Production**: `yourdomain.com`

### Databases
- **Development**: Local MongoDB or dev cluster
- **Staging**: Staging cluster
- **Production**: Production cluster

### Blockchain Networks
- **Development**: Sepolia testnet
- **Staging**: Sepolia testnet
- **Production**: Ethereum mainnet

### Firebase Projects
- **Development**: `pebbles-dev-firebase`
- **Staging**: `pebbles-staging-firebase`
- **Production**: `pebbles-prod-firebase`

## Setup Commands

```bash
# Create environment files from template
npm run setup:env:dev
npm run setup:env:staging
npm run setup:env:prod

# Edit each file with appropriate values
nano .env.development
nano .env.staging
nano .env.production
```

## GitHub Secrets Structure

For CI/CD, you'll need these secrets for each environment:

### Development Secrets
- `DEV_MONGODB_URI`
- `DEV_MONGODB_DATABASE`
- `DEV_JWT_SECRET`
- `DEV_DYNAMIC_API_KEY`
- `DEV_DYNAMIC_API_URL`
- `DEV_DYNAMIC_ENVIRONMENT_ID`
- `DEV_DYNAMIC_WEBHOOK_SECRET`
- `DEV_MELD_API_KEY`
- `DEV_MELD_API_URL`
- `DEV_MELD_WEBHOOK_SECRET`
- `DEV_AUTH_REDIRECT_URL`
- `DEV_PAYMENT_BASE_URL`

### Staging Secrets
- `STAGING_MONGODB_URI`
- `STAGING_MONGODB_DATABASE`
- `STAGING_JWT_SECRET`
- `STAGING_DYNAMIC_API_KEY`
- `STAGING_DYNAMIC_API_URL`
- `STAGING_DYNAMIC_ENVIRONMENT_ID`
- `STAGING_DYNAMIC_WEBHOOK_SECRET`
- `STAGING_MELD_API_KEY`
- `STAGING_MELD_API_URL`
- `STAGING_MELD_WEBHOOK_SECRET`
- `STAGING_AUTH_REDIRECT_URL`
- `STAGING_PAYMENT_BASE_URL`

### Production Secrets
- `PROD_MONGODB_URI`
- `PROD_MONGODB_DATABASE`
- `PROD_JWT_SECRET`
- `PROD_DYNAMIC_API_KEY`
- `PROD_DYNAMIC_API_URL`
- `PROD_DYNAMIC_ENVIRONMENT_ID`
- `PROD_DYNAMIC_WEBHOOK_SECRET`
- `PROD_MELD_API_KEY`
- `PROD_MELD_API_URL`
- `PROD_MELD_WEBHOOK_SECRET`
- `PROD_AUTH_REDIRECT_URL`
- `PROD_PAYMENT_BASE_URL` 