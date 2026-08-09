"use strict";

module.exports = {
  rootDir: __dirname,
  testEnvironment: "jsdom",
  testMatch: ["<rootDir>/tests/unit/**/*.test.js", "<rootDir>/tests/integration/**/*.test.js"],
  collectCoverageFrom: ["js/**/*.js"],
  coverageDirectory: "<rootDir>/coverage",
  verbose: true,
};
