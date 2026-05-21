'use strict';

const {
  buildApiEnrichment,
  summarizeApiTask,
} = require('./breezewayEnrichment');

describe('breezewayEnrichment', () => {
  test('summarizes API-only task detail without preserving photo URLs', () => {
    const summary = summarizeApiTask({
      id: 123,
      description: 'Replace balcony bulb',
      report_url: 'https://example.test/report',
      updated_at: '2026-05-20T10:15:00Z',
      scheduled_date: '2026-05-21',
      scheduled_time: '09:30',
      total_time: '01:45:00',
      type_task_status: { code: 'finished', name: 'Finished', stage: 'done' },
      type_priority: { code: 'high', name: 'High' },
      type_department: { code: 'maintenance', name: 'Maintenance' },
      assignments: [{
        id: 10,
        assignee_id: 20,
        employee_code: 'EMP-20',
        name: 'Asha Doe',
        type_task_user_status: { code: 'accepted' },
      }],
      photos: [{ id: 44, url: 'https://signed.example.test/private-photo.jpg' }],
      comments: [{ id: 55, comment: 'Done', comment_by: 'Asha Doe', created_at: '2026-05-20T11:00:00Z' }],
      costs: [{ id: 66, cost: 250, type_cost: { code: 'material' }, description: 'Bulb' }],
      supplies: [{ id: 77, name: 'LED bulb', quantity: 1, unit_cost: 250 }],
      linked_reservation: { id: 88, external_reservation_id: 'g-123' },
      reported_tasks: [99],
    });

    expect(summary.totalMinutes).toBe(105);
    expect(summary.assignments).toEqual([expect.objectContaining({ employeeCode: 'EMP-20' })]);
    expect(summary.photos).toEqual([{ id: '44', hasUrl: true, createdAt: null, updatedAt: null }]);
    expect(summary.comments).toHaveLength(1);
    expect(summary.costs).toHaveLength(1);
    expect(summary.supplies).toHaveLength(1);
    expect(summary.linkedReservationExternalId).toBe('g-123');
    expect(summary.reportedTasks).toEqual(['99']);

    const enrichment = buildApiEnrichment({ id: 123, photos: [{ id: 44, url: 'private' }] }, summary, '2026-05-21T00:00:00Z');
    expect(enrichment.photos[0]).not.toHaveProperty('url');
    expect(enrichment.photoCount).toBe(1);
    expect(enrichment.commentsCount).toBe(1);
    expect(enrichment.linkedReservation.externalReservationId).toBe('g-123');
  });
});
