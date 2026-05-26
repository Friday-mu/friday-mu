#!/usr/bin/env node
'use strict';

require('dotenv').config();

const scheduler = require('../src/ask_friday/scheduler');
const { close } = require('../src/database/client');

console.log('[ask-friday/analyzer-worker] starting');
scheduler.start();

async function shutdown(signal) {
  console.log(`[ask-friday/analyzer-worker] ${signal} received; stopping`);
  scheduler.stop();
  await close().catch((e) => {
    console.warn('[ask-friday/analyzer-worker] db close failed:', e.message);
  });
  process.exit(0);
}

process.on('SIGINT', () => { shutdown('SIGINT'); });
process.on('SIGTERM', () => { shutdown('SIGTERM'); });
