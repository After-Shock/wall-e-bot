/**
 * Jest Configuration
 * 
 * Configured for ESM TypeScript with Discord.js mocking support.
 */

export default {
  // Use ts-jest for TypeScript support with ESM
  preset: 'ts-jest/presets/default-esm',
  
  testEnvironment: 'node',
  
  // File extensions to consider
  moduleFileExtensions: ['ts', 'js', 'json'],
  
  // Test file patterns
  testMatch: [
    '**/tests/**/*.test.ts',
    '**/tests/**/*.spec.ts',
  ],
  
  // Module path aliases (match tsconfig)
  moduleNameMapper: {
    '^(\\.{1,2}/.*)\\.js$': '$1',
    '^@wall-e/shared$': '<rootDir>/../shared/src/index.ts',
  },
  
  // Transform TypeScript files
  transform: {
    '^.+\\.ts$': [
      'ts-jest',
      {
        useESM: true,
        tsconfig: 'tsconfig.json',
      },
    ],
  },
  
  // Setup files to run before tests
  setupFilesAfterEnv: ['<rootDir>/tests/setup.ts'],
  
  // Coverage configuration
  collectCoverageFrom: [
    'src/**/*.ts',
    '!src/**/*.d.ts',
    '!src/index.ts',
    '!src/deploy-commands.ts',
  ],
  
  coverageThreshold: {
    global: {
      branches: 50,
      functions: 50,
      lines: 50,
      statements: 50,
    },
  },
  
  // Increase timeout for integration tests
  testTimeout: 10000,
  
  // Clear mocks between tests
  clearMocks: true,
  
  // Verbose output
  verbose: true,
};
