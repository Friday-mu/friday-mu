'use strict';

const express = require('express');

const VALID_STATUS = new Set(['available', 'limited', 'offline']);
const MUT_TIMEZONE = 'Indian/Mauritius';

function envStatus() {
  const raw = String(process.env.FAD_PUBLIC_TEAM_PRESENCE_STATUS || '').trim().toLowerCase();
  return VALID_STATUS.has(raw) ? raw : null;
}

function mauritiusHour(date = new Date()) {
  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone: MUT_TIMEZONE,
    weekday: 'short',
    hour: '2-digit',
    hour12: false,
  }).formatToParts(date);
  const hour = Number(parts.find((p) => p.type === 'hour')?.value);
  const weekday = parts.find((p) => p.type === 'weekday')?.value || '';
  return { hour, weekday };
}

function defaultStatus(now = new Date()) {
  const { hour, weekday } = mauritiusHour(now);
  const isSunday = weekday.toLowerCase().startsWith('sun');
  if (!Number.isFinite(hour) || isSunday || hour < 9 || hour >= 18) return 'offline';
  // Without real FAD presence wired, stay conservative. "limited"
  // means the website can say the team can review, not that a person is online.
  return 'limited';
}

function etaMinutes() {
  const raw = process.env.FAD_PUBLIC_TEAM_PRESENCE_ETA_MINUTES;
  if (raw == null || raw === '') return null;
  const value = Number(raw);
  if (!Number.isFinite(value) || value < 0 || value > 1440) return null;
  return Math.round(value);
}

function defaultMessage(status) {
  if (status === 'available') return 'The Friday team is available to review this.';
  if (status === 'limited') return 'The Friday team can review this and reply as soon as possible.';
  return 'The Friday team is away right now and will review this when back.';
}

function payload(now = new Date()) {
  const status = envStatus() || defaultStatus(now);
  const explicitMessage = String(process.env.FAD_PUBLIC_TEAM_PRESENCE_MESSAGE || '').trim().slice(0, 240);
  return {
    available: status === 'available',
    status,
    etaMinutes: etaMinutes(),
    message: explicitMessage || defaultMessage(status),
  };
}

const router = express.Router();

router.get('/', (req, res) => {
  const out = payload();
  res.set('Cache-Control', 'public, max-age=60');
  res.json(out);
});

module.exports = { router, _test: { payload, defaultStatus, mauritiusHour } };
