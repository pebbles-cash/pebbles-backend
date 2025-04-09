import mongoose from "mongoose";

/**
 * Mock MongoDB connection functions
 */
export const mockMongoose = () => {
  jest.mock("../../src/services/mongoose", () => ({
    connectToDatabase: jest.fn().mockResolvedValue(mongoose.connection),
    closeConnection: jest.fn().mockResolvedValue(undefined),
  }));
};

/**
 * Helper to mock a Mongoose model with custom implementation
 * @param modelName Name of the model to mock
 * @param mockImplementation Object with mock implementations for model methods
 */
export const mockModel = (
  modelName: string,
  mockImplementation: Record<string, jest.Mock>
) => {
  jest.mock(`../../src/models/${modelName}`, () => {
    const originalModule = jest.requireActual(`../../src/models/${modelName}`);
    return {
      ...originalModule,
      [modelName]: mockImplementation,
    };
  });
};

/**
 * Create a mock ObjectId
 */
export const createMockObjectId = (
  id: string = "507f1f77bcf86cd799439011"
): mongoose.Types.ObjectId => {
  return new mongoose.Types.ObjectId(id);
};
