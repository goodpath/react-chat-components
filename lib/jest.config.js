module.exports = {
  collectCoverage: true,
  coveragePathIgnorePatterns: ["/node_modules/", "/test/"],
  preset: "ts-jest",
  setupFilesAfterEnv: ["@testing-library/jest-dom/extend-expect"],
  testEnvironment: "jsdom",
  moduleNameMapper: {
    "\\.(css)$": "<rootDir>/mock/style-mock.ts",
    "\\.(svg)$": "<rootDir>/mock/svg-mock.tsx",
  },
  transform: { "^.+\\.(scss)$": "jest-scss-transform" },
  // Ensure we use local node_modules first to avoid picking up types from parent directories
  moduleDirectories: ["node_modules"],
  roots: ["<rootDir>"],
  globals: {
    "ts-jest": {
      tsconfig: "<rootDir>/tsconfig.test.json",
      isolatedModules: true,
    },
  },
};
