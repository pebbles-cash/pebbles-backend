import {
  APIGatewayProxyEvent,
  APIGatewayProxyResult,
  Context,
} from "aws-lambda";
import { AuthenticatedAPIGatewayProxyEvent } from "../../src/types";

/**
 * Create a mock APIGatewayProxyEvent for testing
 */
export const createMockEvent = (
  body?: any,
  pathParameters?: { [key: string]: string },
  queryStringParameters?: { [key: string]: string },
  headers?: { [key: string]: string }
): APIGatewayProxyEvent => {
  return {
    body: body ? JSON.stringify(body) : null,
    headers: headers || {},
    multiValueHeaders: {},
    httpMethod: "GET",
    isBase64Encoded: false,
    path: "/test",
    pathParameters: pathParameters || null,
    queryStringParameters: queryStringParameters || null,
    multiValueQueryStringParameters: null,
    stageVariables: null,
    requestContext: {
      accountId: "mock",
      apiId: "mock",
      authorizer: null,
      protocol: "HTTP/1.1",
      httpMethod: "GET",
      identity: {
        accessKey: null,
        accountId: null,
        apiKey: null,
        apiKeyId: null,
        caller: null,
        clientCert: null,
        cognitoAuthenticationProvider: null,
        cognitoAuthenticationType: null,
        cognitoIdentityId: null,
        cognitoIdentityPoolId: null,
        principalOrgId: null,
        sourceIp: "127.0.0.1",
        user: null,
        userAgent: "jest-test",
        userArn: null,
      },
      path: "/test",
      stage: "test",
      requestId: "test-id",
      requestTimeEpoch: Date.now(),
      resourceId: "mock",
      resourcePath: "/test",
    },
    resource: "/test",
  };
};

/**
 * Create a mock authenticated event with user info
 */
export const createMockAuthenticatedEvent = (
  userId: string = "test-user-id",
  username: string = "testuser",
  email: string = "test@example.com",
  body?: any,
  pathParameters?: { [key: string]: string },
  queryStringParameters?: { [key: string]: string },
  headers?: { [key: string]: string }
): AuthenticatedAPIGatewayProxyEvent => {
  const mockEvent = createMockEvent(
    body,
    pathParameters,
    queryStringParameters,
    headers
  ) as AuthenticatedAPIGatewayProxyEvent;

  mockEvent.user = {
    id: userId,
    username,
    email,
    displayName: "Test User",
    primaryWalletAddress: "0xtest1234567890",
  };

  return mockEvent;
};

/**
 * Create a mock context for Lambda functions
 */
export const createMockContext = (): Context => {
  return {
    callbackWaitsForEmptyEventLoop: true,
    functionName: "test-function",
    functionVersion: "test-version",
    invokedFunctionArn: "test-arn",
    memoryLimitInMB: "128",
    awsRequestId: "test-request-id",
    logGroupName: "test-log-group",
    logStreamName: "test-log-stream",
    getRemainingTimeInMillis: () => 1000,
    done: () => {},
    fail: () => {},
    succeed: () => {},
  };
};

/**
 * Parse response body from API Gateway proxy result
 */
export const parseResponseBody = (response: APIGatewayProxyResult): any => {
  return JSON.parse(response.body);
};
