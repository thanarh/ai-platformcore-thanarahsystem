const { defineConfig } = require('@playwright/test');

module.exports = defineConfig({
  testDir: './tests/browser',
  outputDir: './generated-artifacts/playwright',
  reporter: 'list',
  workers: 1,
  timeout: 180_000,
  use: {
    headless: true,
    navigationTimeout: 150_000,
    actionTimeout: 15_000,
    launchOptions: {
      executablePath: process.env.CHROMIUM_PATH || '/repl/tools/bin/chromium',
      args: ['--no-sandbox'],
    },
  },
});
