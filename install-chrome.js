#!/usr/bin/env node

// Script to install Chrome for Puppeteer on Render
const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const cacheDir = process.env.PUPPETEER_CACHE_DIR || '/opt/render/.cache/puppeteer';

console.log('🔧 Installing Chrome for Puppeteer...');
console.log(`📁 Cache directory: ${cacheDir}`);

// Create cache directory if it doesn't exist
try {
  if (!fs.existsSync(cacheDir)) {
    fs.mkdirSync(cacheDir, { recursive: true });
    console.log(`✅ Created cache directory: ${cacheDir}`);
  } else {
    console.log(`✅ Cache directory exists: ${cacheDir}`);
  }
} catch (error) {
  console.error(`❌ Failed to create cache directory: ${error.message}`);
  process.exit(1);
}

// Install Chrome
try {
  console.log('📥 Downloading Chrome...');
  execSync('npx puppeteer browsers install chrome', {
    stdio: 'inherit',
    env: {
      ...process.env,
      PUPPETEER_CACHE_DIR: cacheDir
    }
  });
  console.log('✅ Chrome installed successfully!');
} catch (error) {
  console.error(`❌ Chrome installation failed: ${error.message}`);
  console.log('⚠️  Will try to use system Chromium if available');
  process.exit(0); // Don't fail the build, let launchBrowser handle fallback
}

