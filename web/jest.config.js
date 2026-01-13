const nextJest = require('next/jest')

const createJestConfig = nextJest({ dir: './' })

/** @type {import('jest').Config} */
const customJestConfig = {
  testEnvironment: 'jsdom',
  testEnvironmentOptions: {
    url: 'http://localhost/',
  },
  setupFilesAfterEnv: ['<rootDir>/jest.setup.js'],
  testMatch: ['<rootDir>/**/*.test.ts', '<rootDir>/**/*.test.tsx'],
  testPathIgnorePatterns: ['<rootDir>/.next/', '<rootDir>/node_modules/', '<rootDir>/tests/'],
  clearMocks: true,
  moduleNameMapper: {
    '^@/lib/(.*)$': '<rootDir>/src/lib/$1',
    '^@/components/(.*)$': '<rootDir>/src/components/$1',
    '^@/app/(.*)$': '<rootDir>/src/app/$1',
    '^@/theme$': '<rootDir>/src/theme.tsx',
    '^@animapp/shared$': '<rootDir>/../packages/shared/src/index.ts',
  },
}

const nextConfigFactory = createJestConfig(customJestConfig)

module.exports = async () => {
  const config = await nextConfigFactory()
  config.transformIgnorePatterns = [
    '^.+\\.module\\.(css|sass|scss)$',
    '/node_modules/(?!(msw|@mswjs|until-async)/)',
  ]
  return config
}
