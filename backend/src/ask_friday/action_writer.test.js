'use strict';

jest.mock('../database/client', () => ({
  query: jest.fn(),
}));

const { query } = require('../database/client');
const { recordActionRequest } = require('./action_writer');

const TENANT_ID = '11111111-1111-4111-8111-111111111111';

function surfaceRow(overrides = {}) {
  return {
    surface_id: 'fad_global_ask_friday',
    source_system: 'fad',
    status: 'active',
    allowed_actions: ['create_task', 'send_team_message', 'request_approval'],
    ...overrides,
  };
}

describe('Ask Friday Core action writer', () => {
  beforeEach(() => {
    query.mockReset();
  });

  test('writes staff action requests after surface-policy validation', async () => {
    query
      .mockResolvedValueOnce({ rows: [surfaceRow()] })
      .mockResolvedValueOnce({ rows: [{ action_id: 'act-1' }] });

    const result = await recordActionRequest({
      tenantId: TENANT_ID,
      action: {
        actionId: 'act-1',
        sourceSystem: 'fad',
        surfaceId: 'fad_global_ask_friday',
        requestedBy: { identityType: 'staff', identityKey: 'ishant', authenticated: true },
        actionType: 'create_task',
        riskClass: 'low',
        payload: { title: 'Check AC' },
        reason: 'Ask Friday suggested a task.',
        approvalRequired: false,
        status: 'pending',
      },
    });

    expect(result).toEqual({ actionId: 'act-1', written: true });
    expect(query).toHaveBeenCalledTimes(2);
    expect(query.mock.calls[1][0]).toContain('INSERT INTO ask_friday_action_requests');
    expect(query.mock.calls[1][1]).toEqual(expect.arrayContaining([
      TENANT_ID,
      'act-1',
      'fad',
      'fad_global_ask_friday',
      'create_task',
      'low',
      false,
      'pending',
    ]));
  });

  test('rejects disallowed actions before writing', async () => {
    query.mockResolvedValueOnce({ rows: [surfaceRow({ allowed_actions: ['request_approval'] })] });

    await expect(recordActionRequest({
      tenantId: TENANT_ID,
      action: {
        sourceSystem: 'fad',
        surfaceId: 'fad_global_ask_friday',
        actionType: 'create_task',
        payload: { title: 'Check AC' },
      },
    })).rejects.toThrow('actionType is not allowed');

    expect(query).toHaveBeenCalledTimes(1);
  });

  test('writes approval-routed reservation calendar shell actions', async () => {
    query
      .mockResolvedValueOnce({
        rows: [surfaceRow({
          surface_id: 'fad_reservations_calendar_assistant',
          allowed_actions: [
            'request_booking_quote',
            'request_reservation_mutation',
            'request_channel_visible_block',
          ],
        })],
      })
      .mockResolvedValueOnce({ rows: [{ action_id: 'act-quote-1' }] });

    const result = await recordActionRequest({
      tenantId: TENANT_ID,
      action: {
        actionId: 'act-quote-1',
        sourceSystem: 'fad',
        surfaceId: 'fad_reservations_calendar_assistant',
        requestedBy: { identityType: 'staff', identityKey: 'ishant', authenticated: true },
        actionType: 'request_booking_quote',
        riskClass: 'approval',
        payload: {
          propertyCode: 'GBH-C3',
          dateWindow: { from: '2026-07-10', to: '2026-07-12' },
          sourceFreshnessRequired: true,
        },
        reason: 'Ask Friday should queue a source-dated quote draft for review.',
        approvalRequired: true,
        status: 'pending',
      },
    });

    expect(result).toEqual({ actionId: 'act-quote-1', written: true });
    expect(query).toHaveBeenCalledTimes(2);
    expect(query.mock.calls[1][1]).toEqual(expect.arrayContaining([
      TENANT_ID,
      'act-quote-1',
      'fad',
      'fad_reservations_calendar_assistant',
      'request_booking_quote',
      'approval',
      true,
      'pending',
    ]));
  });
});
