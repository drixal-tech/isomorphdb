/** @type {import('ts-jest').JestConfigWithTsJest} */
module.exports = {
  preset: 'ts-jest',
  testEnvironment: 'node',
  roots: ['<rootDir>/tests'],
  testMatch: ['**/*.test.ts'],
  collectCoverageFrom: [
    'src/**/*.ts',
    '!src/cli/**/*.ts',
    '!src/**/index.ts',
    '!src/utils/logger.ts',
    '!src/utils/progress.ts',
    '!src/utils/config.ts',
    '!src/writer/**/*.ts',
    '!src/profiler/schema-reader.ts',
    '!src/profiler/stats-collector.ts',
    '!src/profiler/profile-writer.ts',
  ],
  coverageDirectory: 'coverage',
  coverageThreshold: {
    global: {
      branches: 50,
      functions: 65,
      lines: 65,
      statements: 65,
    },
  },
};
