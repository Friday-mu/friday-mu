'use strict';

const express = require('express');
const request = require('supertest');
const jwt = require('jsonwebtoken');

jest.mock('../database/client', () => ({
  query: jest.fn(),
}));

const { query } = require('../database/client');
const { router, _test } = require('./context_tools');

const JWT_SECRET = 'ask-friday-context-tools-test-secret';
const TENANT_ID = '11111111-1111-4111-8111-111111111111';
const USER_ID = '22222222-2222-4222-8222-222222222222';

function app() {
  const server = express();
  server.use(express.json());
  server.use('/context-tools', router);
  return server;
}

function userToken() {
  return jwt.sign({
    user_id: USER_ID,
    role: 'admin',
    username: 'ishant',
    display_name: 'Ishant Ayadassen',
    tenant_id: TENANT_ID,
  }, JWT_SECRET);
}

function surfaceRow(overrides = {}) {
  return {
    surface_id: 'fad_ops_assistant',
    source_system: 'fad',
    access_class: 'staff',
    status: 'active',
    allowed_tools: ['load_reservation_context', 'load_calendar_context', 'load_property_context'],
    allowed_actions: [],
    ...overrides,
  };
}

describe('Ask Friday context tools', () => {
  beforeEach(() => {
    process.env.JWT_SECRET = JWT_SECRET;
    query.mockReset();
    query.mockResolvedValue({ rows: [] });
  });

  test('normalizes empty reservation status as inquiry and not occupied', () => {
    expect(_test.normalizeStatus(null)).toBe('inquiry');
    expect(_test.occupancyClass('inquiry')).toBe('inquiry');
    expect(_test.occupancyClass('confirmed')).toBe('occupied');
  });

  test('loads reservation context without treating null Guesty status as occupied', async () => {
    query
      .mockResolvedValueOnce({ rows: [surfaceRow()] })
      .mockResolvedValueOnce({
        rows: [{
          id: 'res-row-1',
          guesty_id: 'guesty-res-1',
          confirmation_code: 'ABC123',
          status: null,
          listing_guesty_id: 'listing-1',
          check_in_date: '2026-05-29',
          check_out_date: '2026-06-02',
          guests_count: 4,
          adults: 2,
          children: 2,
          infants: 0,
          guest_first_name: 'Julia',
          guest_last_name: 'Maichle',
          synced_at: new Date().toISOString(),
          listing_nickname: 'GBH-C3',
          property_code: 'GBH-C3',
          overlay_status: null,
          overlay_source_kind: 'guesty_pull',
          overlay_cancelled_at: null,
          calendar_nights_cached: 4,
          calendar_blocked_nights: 0,
          calendar_synced_at: new Date().toISOString(),
        }],
      });

    const res = await request(app())
      .post('/context-tools/load-reservation-context')
      .set('Authorization', `Bearer ${userToken()}`)
      .send({
        surfaceId: 'fad_ops_assistant',
        scope: {
          propertyCode: 'GBH-C3',
          dateWindow: { from: '2026-05-28', to: '2026-06-04', mode: 'overlap' },
        },
      })
      .expect(200);

    expect(res.body.tool).toBe('load_reservation_context');
    expect(res.body.policy.allowedByRegistry).toBe(true);
    expect(res.body.reservations[0].status.normalized).toBe('inquiry');
    expect(res.body.reservations[0].status.blockingForOps).toBe(false);
    expect(res.body.caveats).toEqual([]);
    expect(query).toHaveBeenCalledTimes(2);
  });

  test('reservation date-window filters use checkout-excluded overlap semantics', async () => {
    query
      .mockResolvedValueOnce({ rows: [surfaceRow()] })
      .mockResolvedValueOnce({ rows: [] });

    await request(app())
      .post('/context-tools/load-reservation-context')
      .set('Authorization', `Bearer ${userToken()}`)
      .send({
        surfaceId: 'fad_ops_assistant',
        scope: {
          dateWindow: { from: '2026-05-29', to: '2026-06-01', mode: 'overlap' },
        },
      })
      .expect(200);

    const sql = query.mock.calls[1][0];
    expect(sql).toContain('r.check_out_date > $2::date');
    expect(sql).toContain('r.check_in_date < $3::date');
    expect(sql).not.toContain('r.check_out_date >= $2::date');
    expect(sql).not.toContain('r.check_in_date <= $3::date');
    expect(query.mock.calls[1][1]).toEqual([TENANT_ID, '2026-05-29', '2026-06-01']);
  });

  test('reservation context caveats missing calendar coverage for availability and price proof', async () => {
    query
      .mockResolvedValueOnce({ rows: [surfaceRow()] })
      .mockResolvedValueOnce({
        rows: [{
          id: 'res-row-2',
          guesty_id: 'guesty-res-2',
          confirmation_code: 'DEF456',
          status: 'confirmed',
          listing_guesty_id: 'listing-2',
          check_in_date: '2026-07-10',
          check_out_date: '2026-07-12',
          guests_count: 2,
          adults: 2,
          children: 0,
          infants: 0,
          guest_first_name: 'Guest',
          guest_last_name: 'Two',
          synced_at: new Date().toISOString(),
          listing_nickname: 'VA-1',
          property_code: 'VA-1',
          overlay_status: null,
          overlay_source_kind: 'guesty_pull',
          overlay_cancelled_at: null,
          calendar_nights_cached: 0,
          calendar_blocked_nights: 0,
          calendar_synced_at: null,
        }],
      });

    const res = await request(app())
      .post('/context-tools/load-reservation-context')
      .set('Authorization', `Bearer ${userToken()}`)
      .send({
        surfaceId: 'fad_ops_assistant',
        scope: {
          propertyCode: 'VA-1',
          dateWindow: { from: '2026-07-10', to: '2026-07-12' },
        },
      })
      .expect(200);

    expect(res.body.reservations[0].status.blockingForOps).toBe(true);
    expect(res.body.reservations[0].calendar.nightsCached).toBe(0);
    expect(res.body.caveats).toEqual([
      expect.stringContaining('availability and prices are not proved'),
    ]);
  });

  test('calendar context reports missing cache rows as unknown', async () => {
    query
      .mockResolvedValueOnce({ rows: [surfaceRow()] })
      .mockResolvedValueOnce({
        rows: [{
          guesty_id: 'listing-1',
          property_code: 'GBH-C3',
          nickname: 'GBH-C3',
          title: 'Grand Baie Heights C3',
          accommodates: 4,
          bedrooms: 2,
          currency_code: 'EUR',
        }],
      })
      .mockResolvedValueOnce({
        rows: [{
          date: '2026-07-10',
          is_available: true,
          price_minor: 20000,
          currency_code: 'EUR',
          fetched_at: new Date().toISOString(),
        }],
      })
      .mockResolvedValueOnce({ rows: [] });

    const res = await request(app())
      .post('/context-tools/load-calendar-context')
      .set('Authorization', `Bearer ${userToken()}`)
      .send({
        surfaceId: 'fad_ops_assistant',
        scope: {
          propertyCode: 'GBH-C3',
          dateWindow: { from: '2026-07-10', to: '2026-07-12' },
        },
      })
      .expect(200);

    expect(res.body.availability.state).toBe('unknown');
    expect(res.body.availability.unknownNights).toBe(1);
    expect(res.body.caveats[0]).toContain('not proved');
  });

  test('property context separates public and staff-private cards', async () => {
    query
      .mockResolvedValueOnce({ rows: [surfaceRow()] })
      .mockResolvedValueOnce({
        rows: [{
          property_id: 'prop-1',
          guesty_id: 'listing-1',
          property_code: 'GBH-C3',
          name: 'Grand Baie Heights C3',
          area: 'Grand Baie',
          address_city: 'Grand Baie',
          address_country: 'Mauritius',
          property_type: 'apartment',
          bedrooms: 2,
          bathrooms: '2.0',
          accommodates: 4,
          guesty_amenities: ['Air conditioning', 'Wireless Internet'],
          tags: ['north'],
          lifecycle_status: 'live',
          synced_at: new Date().toISOString(),
          overlay_updated_at: new Date().toISOString(),
          cards: [
            { category: 'local_context', title: 'Nearest beach', body: 'Public-safe note', surface: 'guest_facing', source: 'manual' },
            { category: 'access', title: 'Lockbox', body: 'Private access note', surface: 'internal_only', source: 'manual' },
          ],
        }],
      });

    const res = await request(app())
      .post('/context-tools/load-property-context')
      .set('Authorization', `Bearer ${userToken()}`)
      .send({
        surfaceId: 'fad_ops_assistant',
        privacyMode: 'staff_private',
        scope: { propertyCode: 'GBH-C3' },
      })
      .expect(200);

    expect(res.body.property.public.name).toBe('Grand Baie Heights C3');
    expect(res.body.property.guestScoped.cards).toHaveLength(1);
    expect(res.body.property.staffPrivate.cards).toHaveLength(1);
    expect(res.body.property.restricted).toEqual({});
  });

  test('requires staff authentication', async () => {
    await request(app())
      .post('/context-tools/load-property-context')
      .send({ surfaceId: 'fad_ops_assistant', scope: { propertyCode: 'GBH-C3' } })
      .expect(401);
    expect(query).not.toHaveBeenCalled();
  });
});
