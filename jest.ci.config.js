const baseConfig = require('./jest.config');

module.exports = {
  ...baseConfig,
  testPathIgnorePatterns: [
    ...baseConfig.testPathIgnorePatterns,
    '/tests/e2e/',
    '/tests/core/context\\.test\\.js',
    '/tests/core/git\\.test\\.js',
    '/tests/core/process\\.test\\.js',
    '/tests/pm/validate\\.test\\.js',
    '/tests/pm/prd-status\\.test\\.js',
    '/tests/pm/init\\.test\\.js',
    '/tests/pm/standup\\.test\\.js',
    '/tests/utils/load-project-context\\.test\\.js',
    '/tests/utils/add-doc-refs\\.test\\.js',
    '/tests/unit/execution-context\\.test\\.js'
  ]
};
