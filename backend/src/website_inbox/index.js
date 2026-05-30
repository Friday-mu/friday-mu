'use strict';

// Website-inbox router. Mounted at /api/inbox/* by server.js.
//
// Routes:
//   POST   /friday-website          (public, HMAC-signed; raw body)
//   GET    /threads                 (auth required, via attachIdentity below)
//   GET    /threads/:id             (auth required)
//   PATCH  /threads/:id             (auth required)
//   POST   /threads/:id/mark-paid   (auth required)
//
// The webhook gets express.raw because HMAC must run on the exact
// bytes friday.mu signed. Everything else parses JSON.

const express = require('express');
const { mountWebhook } = require('./webhook');
const { mountThreads } = require('./threads');
const { mountAiHandoff, mountAiHandoffStaffRoutes } = require('./ai_handoff');
const { startWorker } = require('./jobs');

const router = express.Router();

// ── Webhook (raw body, public) ────────────────────────────────
// Sub-router so the raw body parser only applies here.
const webhookRouter = express.Router();
webhookRouter.use(express.raw({ type: '*/*', limit: '1mb' }));
mountWebhook(webhookRouter);
mountAiHandoff(webhookRouter);
router.use(webhookRouter);

// ── Threads (JSON, auth required at the call sites) ───────────
const threadsRouter = express.Router();
threadsRouter.use(express.json({ limit: '256kb' }));
mountThreads(threadsRouter);
mountAiHandoffStaffRoutes(threadsRouter);
router.use(threadsRouter);

module.exports = { router, startWorker };
