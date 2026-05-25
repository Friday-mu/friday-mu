'use strict';

const assert = require('node:assert/strict');
const { _test } = require('./travel_time');

test('parsePoint accepts object and comma string coordinates', () => {
  assert.deepEqual(_test.parsePoint({ lat: '-20.1', lng: '57.5' }), { lat: -20.1, lng: 57.5 });
  assert.deepEqual(_test.parsePoint('-20.1,57.5'), { lat: -20.1, lng: 57.5 });
});

test('parsePoint rejects invalid coordinates', () => {
  assert.equal(_test.parsePoint(null), null);
  assert.equal(_test.parsePoint({ lat: 200, lng: 57 }), null);
  assert.equal(_test.parsePoint({ lat: -20, lng: 300 }), null);
  assert.equal(_test.parsePoint('not-a-point'), null);
  assert.equal(_test.parsePoint('-20,57,extra'), null);
});

test('parseDurationSeconds converts Google duration strings', () => {
  assert.equal(_test.parseDurationSeconds('123s'), 123);
  assert.equal(_test.parseDurationSeconds('123.4s'), 123);
  assert.equal(_test.parseDurationSeconds(''), null);
});

test('estimateTravelTime shapes Google Routes response without live API', async () => {
  const calls = [];
  const result = await _test.estimateTravelTime({
    apiKey: 'test-key',
    origin: { lat: -20.1, lng: 57.5 },
    destination: { lat: -20.2, lng: 57.6 },
    departureTime: '2026-05-26T09:00:00+04:00',
    fetchImpl: async (url, init) => {
      calls.push({ url, init });
      return {
        ok: true,
        json: async () => ({
          routes: [{ duration: '1850s', staticDuration: '1700s', distanceMeters: 24500 }],
        }),
      };
    },
  });

  assert.equal(result.durationMinutes, 31);
  assert.equal(result.distanceMeters, 24500);
  assert.equal(calls.length, 1);
  const body = JSON.parse(calls[0].init.body);
  assert.equal(body.travelMode, 'DRIVE');
  assert.equal(body.routingPreference, 'TRAFFIC_AWARE');
});

test('estimateTravelTime reports missing API key as a configured blocker', async () => {
  await assert.rejects(
    () => _test.estimateTravelTime({
      apiKey: '',
      origin: { lat: -20.1, lng: 57.5 },
      destination: { lat: -20.2, lng: 57.6 },
    }),
    /Google Routes API key is not configured/,
  );
});
