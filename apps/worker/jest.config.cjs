module.exports = {
  extensionsToTreatAsEsm: ['.ts'],
  moduleNameMapper: { '^(\\.{1,2}/.*)\\.js$': '$1' },
  testEnvironment: 'node',
  testMatch: ['<rootDir>/src/**/*.spec.ts'],
  transform: { '^.+\\.ts$': ['ts-jest', { diagnostics: { ignoreCodes: [151002] }, tsconfig: '<rootDir>/tsconfig.json', useESM: true }] },
};
