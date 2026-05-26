'use strict';

const express = require('express');
const { attachIdentity } = require('../design/auth');
const { query } = require('../database/client');

const router = express.Router();

const GOOGLE_ROUTES_URL =
  process.env.GOOGLE_ROUTES_URL || 'https://routes.googleapis.com/directions/v2:computeRoutes';
const GOOGLE_ROUTES_API_KEY =
  process.env.GOOGLE_ROUTES_API_KEY
  || process.env.GOOGLE_MAPS_API_KEY
  || process.env.GOOGLE_API_KEY
  || '';

function parsePoint(value) {
  if (!value) return null;
  if (typeof value === 'string') {
    const parts = value.split(',').map((part) => part.trim());
    if (parts.length !== 2) return null;
    const [latRaw, lngRaw] = parts;
    return parsePoint({ lat: latRaw, lng: lngRaw });
  }
  if (typeof value !== 'object') return null;
  const lat = Number(value.lat ?? value.latitude);
  const lng = Number(value.lng ?? value.longitude);
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;
  if (lat < -90 || lat > 90 || lng < -180 || lng > 180) return null;
  return { lat, lng };
}

function parseDurationSeconds(value) {
  const match = String(value || '').trim().match(/^(\d+(?:\.\d+)?)s$/);
  if (!match) return null;
  const seconds = Number(match[1]);
  return Number.isFinite(seconds) ? Math.round(seconds) : null;
}

function cleanPropertyCode(value) {
  return typeof value === 'string' ? value.trim() : '';
}

async function resolvePropertyPoint({
  tenantId,
  code,
  queryImpl = query,
  label,
} = {}) {
  const propertyCode = cleanPropertyCode(code);
  if (!propertyCode) return null;
  const { rows } = await queryImpl(
    `SELECT code, name, geo_lat, geo_lng
       FROM fad_properties
      WHERE tenant_id = $1
        AND UPPER(code) = UPPER($2)
      LIMIT 1`,
    [tenantId, propertyCode],
  );
  if (!rows || rows.length === 0) {
    const err = new Error(`${label} property code was not found`);
    err.status = 404;
    err.code = `${label}_property_not_found`;
    throw err;
  }
  const row = rows[0];
  const point = parsePoint({ lat: row.geo_lat, lng: row.geo_lng });
  if (!point) {
    const err = new Error(`${label} property ${row.code || propertyCode} has no coordinates`);
    err.status = 422;
    err.code = `${label}_property_missing_coordinates`;
    throw err;
  }
  return {
    point,
    property: {
      code: row.code || propertyCode,
      name: row.name || null,
    },
  };
}

async function resolveTravelPoint({
  tenantId,
  body,
  label,
  queryImpl = query,
} = {}) {
  const coordinate = parsePoint(body?.[label]);
  if (coordinate) return { point: coordinate, source: 'coordinate', property: null };

  const propertyCode = body?.[`${label}PropertyCode`] || body?.[`${label}Code`];
  const property = await resolvePropertyPoint({
    tenantId,
    code: propertyCode,
    queryImpl,
    label,
  });
  if (property) return { point: property.point, source: 'property_code', property: property.property };

  const err = new Error(`${label} must be {lat,lng}, "lat,lng", or ${label}PropertyCode`);
  err.status = 400;
  err.code = `invalid_${label}`;
  throw err;
}

function buildRoutesBody({ origin, destination, departureTime }) {
  return {
    origin: { location: { latLng: { latitude: origin.lat, longitude: origin.lng } } },
    destination: { location: { latLng: { latitude: destination.lat, longitude: destination.lng } } },
    travelMode: 'DRIVE',
    routingPreference: 'TRAFFIC_AWARE',
    computeAlternativeRoutes: false,
    ...(departureTime ? { departureTime } : {}),
  };
}

async function estimateTravelTime({
  origin,
  destination,
  departureTime = null,
  fetchImpl = fetch,
  apiKey = GOOGLE_ROUTES_API_KEY,
} = {}) {
  const originPoint = parsePoint(origin);
  const destinationPoint = parsePoint(destination);
  if (!originPoint) {
    const err = new Error('origin must be {lat,lng} or "lat,lng"');
    err.status = 400;
    err.code = 'invalid_origin';
    throw err;
  }
  if (!destinationPoint) {
    const err = new Error('destination must be {lat,lng} or "lat,lng"');
    err.status = 400;
    err.code = 'invalid_destination';
    throw err;
  }
  if (!apiKey) {
    const err = new Error('Google Routes API key is not configured');
    err.status = 503;
    err.code = 'google_routes_not_configured';
    throw err;
  }

  const body = buildRoutesBody({ origin: originPoint, destination: destinationPoint, departureTime });
  const response = await fetchImpl(GOOGLE_ROUTES_URL, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'x-goog-api-key': apiKey,
      'x-goog-fieldmask': 'routes.duration,routes.staticDuration,routes.distanceMeters',
    },
    body: JSON.stringify(body),
  });

  if (!response.ok) {
    let detail = '';
    try {
      detail = await response.text();
    } catch (_) {
      detail = '';
    }
    const err = new Error(`Google Routes request failed: HTTP ${response.status}`);
    err.status = response.status;
    err.code = 'google_routes_failed';
    err.detail = detail.slice(0, 240);
    throw err;
  }

  const data = await response.json();
  const route = Array.isArray(data.routes) ? data.routes[0] : null;
  const durationSeconds = parseDurationSeconds(route?.duration);
  const staticDurationSeconds = parseDurationSeconds(route?.staticDuration);

  return {
    provider: 'google_routes',
    origin: originPoint,
    destination: destinationPoint,
    departureTime,
    durationSeconds,
    durationMinutes: durationSeconds != null ? Math.ceil(durationSeconds / 60) : null,
    staticDurationSeconds,
    distanceMeters: Number.isFinite(Number(route?.distanceMeters)) ? Number(route.distanceMeters) : null,
  };
}

async function estimateTravelTimeForRequest({
  body,
  tenantId,
  queryImpl = query,
  fetchImpl = fetch,
  apiKey = GOOGLE_ROUTES_API_KEY,
} = {}) {
  const origin = await resolveTravelPoint({ tenantId, body, label: 'origin', queryImpl });
  const destination = await resolveTravelPoint({ tenantId, body, label: 'destination', queryImpl });
  const result = await estimateTravelTime({
    origin: origin.point,
    destination: destination.point,
    departureTime: body?.departureTime || null,
    fetchImpl,
    apiKey,
  });
  return {
    ...result,
    originSource: origin.source,
    destinationSource: destination.source,
    originProperty: origin.property,
    destinationProperty: destination.property,
  };
}

router.post('/travel-time/estimate', attachIdentity, async (req, res) => {
  try {
    const result = await estimateTravelTimeForRequest({
      body: req.body || {},
      tenantId: req.tenantId,
    });
    res.json({ configured: true, ...result });
  } catch (error) {
    res.status(error.status || 500).json({
      error: error.code || 'travel_time_failed',
      message: error.message,
      configured: error.code === 'google_routes_not_configured' ? false : undefined,
      detail: error.detail || undefined,
      acceptedEnv: error.code === 'google_routes_not_configured'
        ? ['GOOGLE_ROUTES_API_KEY', 'GOOGLE_MAPS_API_KEY', 'GOOGLE_API_KEY']
        : undefined,
    });
  }
});

module.exports = router;
module.exports._test = {
  buildRoutesBody,
  estimateTravelTime,
  estimateTravelTimeForRequest,
  parseDurationSeconds,
  parsePoint,
  resolveTravelPoint,
};
