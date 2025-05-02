#!/bin/bash
# Script to set up AWS SSM Parameters for different environments
# Usage: ./setup-ssm-parameters.sh <environment>

# Check if environment is provided
if [ -z "$1" ]; then
  echo "Usage: ./setup-ssm-parameters.sh <environment>"
  echo "Where <environment> is one of: dev, staging, prod"
  exit 1
fi

# Set environment
ENV=$1

# Validate environment
if [[ "$ENV" != "dev" && "$ENV" != "staging" && "$ENV" != "prod" ]]; then
  echo "Invalid environment: $ENV"
  echo "Environment must be one of: dev, staging, prod"
  exit 1
fi

# Set AWS region
AWS_REGION=${AWS_REGION:-"us-east-1"}

# Ask for confirmation
echo "You are about to set up SSM parameters for the $ENV environment in $AWS_REGION region."
echo "Are you sure you want to continue? (y/n)"
read -r CONFIRM

if [[ "$CONFIRM" != "y" && "$CONFIRM" != "Y" ]]; then
  echo "Aborted."
  exit 0
fi

# Read .env file for the specified environment
ENV_FILE=".env.$ENV"
if [ "$ENV" == "dev" ]; then
  ENV_FILE=".env.development"
fi

if [ ! -f "$ENV_FILE" ]; then
  echo "Environment file $ENV_FILE not found!"
  echo "Please create the environment file first or use .env.example-environments as a template."
  exit 1
fi

# Function to load variables from .env file
load_env_vars() {
  local env_file=$1
  if [ -f "$env_file" ]; then
    echo "Loading variables from $env_file"
    set -a
    source "$env_file"
    set +a
  else
    echo "File $env_file not found. Exiting."
    exit 1
  fi
}

# Load environment variables
load_env_vars "$ENV_FILE"

# Function to securely store parameter in SSM
store_parameter() {
  local name=$1
  local value=$2
  local type=$3
  local description=$4

  if [ -z "$value" ]; then
    echo "⚠️ Warning: Value for $name is empty. Skipping."
    return
  fi

  echo "Storing parameter: $name"
  aws ssm put-parameter \
    --name "/pebbles/$ENV/$name" \
    --value "$value" \
    --type "$type" \
    --description "${description:-Parameter for Pebbles payment platform}" \
    --overwrite \
    --region "$AWS_REGION"

  if [ $? -eq 0 ]; then
    echo "✅ Successfully stored $name"
  else
    echo "❌ Failed to store $name"
  fi
}

# Store parameters in SSM
store_parameter "mongodb-uri" "$MONGODB_URI" "SecureString" "MongoDB connection string for Pebbles Platform"
store_parameter "mongodb-database" "$MONGODB_DATABASE" "String" "MongoDB database name"
store_parameter "jwt-secret" "$JWT_SECRET" "SecureString" "JWT secret key for authentication"
store_parameter "dynamic-api-key" "$DYNAMIC_API_KEY" "SecureString" "Dynamic API key"
store_parameter "dynamic-api-url" "$DYNAMIC_API_URL" "String" "Dynamic API URL"
store_parameter "dynamic-environment-id" "$DYNAMIC_ENVIRONMENT_ID" "String" "Dynamic environment ID"
store_parameter "auth-redirect-url" "$AUTH_REDIRECT_URL" "String" "Authentication redirect URL"
store_parameter "payment-base-url" "$PAYMENT_BASE_URL" "String" "Payment base URL"
store_parameter "llm-provider" "$LLM_PROVIDER" "String" "Default LLM provider"
store_parameter "openai-api-key" "$OPENAI_API_KEY" "SecureString" "OpenAI API key"
store_parameter "openai-model" "$OPENAI_MODEL" "String" "OpenAI model"
store_parameter "anthropic-api-key" "$ANTHROPIC_API_KEY" "SecureString" "Anthropic API key"
store_parameter "anthropic-model" "$ANTHROPIC_MODEL" "String" "Anthropic model"

echo "✅ All parameters have been set up for the $ENV environment."
echo "You can now use these parameters in your serverless.yml or serverless.ts file using the SSM syntax:"
echo "Example: \${ssm:/pebbles/$ENV/mongodb-uri~true} for encrypted parameters"
echo "Example: \${ssm:/pebbles/$ENV/payment-base-url} for non-encrypted parameters"