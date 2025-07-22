# Environment Configuration Setup

This guide explains how to configure your environment to use different API keys for Dynamic and Meld integrations across development, staging, and production environments.

## Overview

The application uses environment-specific `.env` files that are loaded based on the `NODE_ENV` environment variable:

- **Development**: `.env.development` (when `NODE_ENV=development`)
- **Staging**: `.env.staging` (when `NODE_ENV=staging`) 
- **Production**: `.env.production` (when `NODE_ENV=production`)

## Environment Variables

### Required Variables for Each Environment

#### Dynamic Integration
- `DYNAMIC_API_URL` - Dynamic API base URL
- `DYNAMIC_API_KEY` - Your Dynamic API key for the environment
- `DYNAMIC_ENVIRONMENT_ID` - Dynamic environment ID
- `DYNAMIC_WEBHOOK_SECRET` - Webhook secret for Dynamic

#### Meld Integration
- `MELD_API_URL` - Meld API base URL (defaults to https://api.meld.io)
- `MELD_API_KEY` - Your Meld API key for the environment
- `MELD_WEBHOOK_SECRET` - Webhook secret for Meld

#### Core Configuration
- `MONGODB_URI` - MongoDB connection string
- `MONGODB_DATABASE` - Database name
- `JWT_SECRET` - Secret for JWT token signing
- `AUTH_REDIRECT_URL` - OAuth redirect URL
- `PAYMENT_BASE_URL` - Base URL for payment endpoints

## Setup Instructions

### 1. Local Development Setup

```bash
# Create environment file for development
npm run setup:env:dev

# Edit the file with your development values
nano .env.development
```

### 2. Staging Environment Setup

```bash
# Create environment file for staging
npm run setup:env:staging

# Edit the file with your staging values
nano .env.staging
```

### 3. Production Environment Setup

```bash
# Create environment file for production
npm run setup:env:prod

# Edit the file with your production values
nano .env.production
```

## GitHub Secrets Configuration

For CI/CD deployments, you need to configure the following secrets in your GitHub repository:

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

## Deployment Commands

### Local Development
```bash
npm run dev                    # Start with development environment
npm run dev:debug             # Start with debug logging
```

### Deploy to Environments
```bash
npm run deploy:dev           # Deploy to development
npm run deploy:staging       # Deploy to staging
npm run deploy:prod          # Deploy to production
```

## Environment File Structure

Each environment file (`.env.development`, `.env.staging`, `.env.production`) should contain:

```bash
# Environment
NODE_ENV=development

# MongoDB
MONGODB_URI=mongodb://localhost:27017/pebbles
MONGODB_DATABASE=pebbles

# Authentication
JWT_SECRET=your-jwt-secret
AUTH_REDIRECT_URL=https://your-domain.com/auth/callback
PAYMENT_BASE_URL=https://your-domain.com

# Dynamic Integration
DYNAMIC_API_URL=https://api.dynamic.com
DYNAMIC_API_KEY=your-dynamic-api-key
DYNAMIC_ENVIRONMENT_ID=your-environment-id
DYNAMIC_WEBHOOK_SECRET=your-webhook-secret

# Meld Integration
MELD_API_URL=https://api.meld.io
MELD_API_KEY=your-meld-api-key
MELD_WEBHOOK_SECRET=your-meld-webhook-secret
```

## How It Works

1. **Environment Detection**: The application checks `NODE_ENV` to determine which environment file to load
2. **File Loading**: It loads the corresponding `.env.{environment}` file
3. **Fallback**: If the specific environment file doesn't exist, it falls back to `.env`
4. **Validation**: Required environment variables are validated on startup

## Troubleshooting

### Common Issues

1. **Missing Environment Variables**: Check that all required variables are set in your environment file
2. **Wrong Environment**: Ensure `NODE_ENV` is set correctly for your deployment
3. **API Key Issues**: Verify that you're using the correct API keys for each environment

### Debugging

The application logs which environment file it's loading and whether key configurations are present:

```
Loading environment from .env.development
Environment: development
Meld API Key configured: Yes
Meld Webhook Secret configured: Yes
```

## Security Notes

- Never commit `.env` files to version control
- Use different API keys for each environment
- Rotate secrets regularly
- Use strong, unique secrets for each environment 