import { APIGatewayProxyEvent, APIGatewayProxyResult } from "aws-lambda";

export const handleCors = async (
  event: APIGatewayProxyEvent
): Promise<APIGatewayProxyResult> => {
  const corsOrigin = process.env.CORS_ORIGIN || "*";

  return {
    statusCode: 200,
    headers: {
      "Content-Type": "application/json",
      "Access-Control-Allow-Origin": corsOrigin,
      "Access-Control-Allow-Credentials": "true",
      "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
      "Access-Control-Allow-Headers":
        "Content-Type, Authorization, X-Amz-Date, X-Api-Key, X-Amz-Security-Token, X-Amz-User-Agent",
    },
    body: "",
  };
};
