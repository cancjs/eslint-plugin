// Mock error class used in unit tests: never used in a declared failure set
export class MockNetworkError extends Error {
  constructor(public readonly statusCode: number = 500) {
    super('Mock network failure');
  }
}

export function createFailingResponse(): MockNetworkError {
  return new MockNetworkError(503);
}
