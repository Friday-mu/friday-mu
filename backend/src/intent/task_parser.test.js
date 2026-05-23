'use strict';

const { _test } = require('./task_parser');

describe('intent/parse-task helpers', () => {
  describe('sanitizeProperties', () => {
    test('keeps valid entries, drops codeless, caps length', () => {
      const out = _test.sanitizeProperties([
        { code: 'GBH-C8', name: 'Grand Baie House C8', zone: 'North' },
        { code: '', name: 'oops' },
        { name: 'missing code' },
        ...Array.from({ length: 100 }, (_, i) => ({ code: `T-${i}`, name: 'Test' })),
      ]);
      expect(out.length).toBeLessThanOrEqual(80);
      expect(out[0]).toEqual({ code: 'GBH-C8', name: 'Grand Baie House C8', zone: 'North' });
      expect(out.some((p) => !p.code)).toBe(false);
    });
  });

  describe('sanitizeAssignees', () => {
    test('keeps valid entries, drops nameless/idless', () => {
      const out = _test.sanitizeAssignees([
        { id: 'u-bryan', name: 'Bryan Lin', role: 'field', skills: ['maintenance', 'plumbing'] },
        { id: '', name: 'no id' },
        { id: 'u-other', name: '' },
      ]);
      expect(out).toEqual([
        { id: 'u-bryan', name: 'Bryan Lin', role: 'field', skills: ['maintenance', 'plumbing'] },
      ]);
    });
  });

  describe('sanitizeHistory', () => {
    test('caps to last 8 turns and trims content', () => {
      const turns = Array.from({ length: 15 }, (_, i) => ({
        role: i % 2 === 0 ? 'user' : 'assistant',
        content: `turn-${i}`,
      }));
      const out = _test.sanitizeHistory(turns);
      expect(out.length).toBe(8);
      expect(out[0].content).toBe('turn-7');
      expect(out[7].content).toBe('turn-14');
    });
    test('drops empty content + collapses junk roles', () => {
      expect(_test.sanitizeHistory([
        { role: 'user', content: '' },
        { role: 'noise', content: 'noise' },
        { role: 'user', content: '   ' },
      ])).toEqual([
        { role: 'user', content: 'noise' },
      ]);
    });
  });

  describe('sanitizeFocus', () => {
    test('returns null on empty input', () => {
      expect(_test.sanitizeFocus(null)).toBeNull();
      expect(_test.sanitizeFocus({})).toBeNull();
    });
    test('preserves known fields + upper-cases property code', () => {
      expect(_test.sanitizeFocus({
        module: 'inbox',
        threadId: 'web-8b8914d9',
        propertyCode: 'gbh-c8',
      })).toEqual({
        module: 'inbox',
        threadId: 'web-8b8914d9',
        reservationId: null,
        propertyCode: 'GBH-C8',
      });
    });
  });

  describe('shapeProposed', () => {
    const reference = {
      properties: [{ code: 'GBH-C8' }, { code: 'RC-16' }],
      assignees: [{ id: 'u-bryan' }, { id: 'u-mary' }],
    };

    test('keeps allowed fields, normalizes case, capitalizes title', () => {
      expect(_test.shapeProposed({
        title: 'check low water pressure',
        description: 'Guest reports pressure drop after 2 min',
        propertyCode: 'gbh-c8',
        department: ' Maintenance ',
        subdepartment: 'plumbing',
        priority: 'High Priority',
        assigneeIds: ['u-bryan'],
        dueDate: '2026-05-24',
        dueTime: '09:00',
        estimatedMinutes: 45,
        tags: ['Owner-Billable', 'access'],
      }, reference)).toEqual({
        title: 'Check low water pressure',
        description: 'Guest reports pressure drop after 2 min',
        propertyCode: 'GBH-C8',
        department: 'maintenance',
        subdepartment: 'plumbing',
        priority: 'high',
        assigneeIds: ['u-bryan'],
        dueDate: '2026-05-24',
        dueTime: '09:00',
        estimatedMinutes: 45,
        tags: ['owner-billable', 'access'],
      });
    });

    test('truncates an over-length title to <=72 chars at the last word boundary, adding ellipsis', () => {
      // Gemini occasionally ignores the <=72 chars directive in the
      // system prompt — Franny reported a verbatim 100+ char AI message
      // ending up as a task title 2026-05-23 (feedback 12728dbe). The
      // truncation is a backend guard so the UI never sees an over-long
      // title regardless of model compliance.
      const longRaw = 'when creating a new task from reported issues we are using the AI draft note to summarised what needs to be done';
      const result = _test.shapeProposed({ title: longRaw }, reference);
      expect(result.title).toBeDefined();
      expect(result.title.length).toBeLessThanOrEqual(73); // 72 + the ellipsis
      expect(result.title.endsWith('…')).toBe(true);
      // Last word boundary should win — no broken word like "summari…"; the
      // truncation cuts at the last space before char 72, so the final
      // character before the ellipsis is the END of a word (a word char
      // is fine; what we want to AVOID is the inverse, e.g. "summari…"
      // where "summarised" got cut mid-stem).
      expect(result.title).toMatch(/draft…$/);
    });

    test('passes through a short title unchanged (no ellipsis)', () => {
      const result = _test.shapeProposed({ title: 'Refill linen at GBH-C8' }, reference);
      expect(result.title).toBe('Refill linen at GBH-C8');
      expect(result.title.endsWith('…')).toBe(false);
    });

    test('drops property codes not in the reference list', () => {
      expect(_test.shapeProposed({ propertyCode: 'INVALID-1' }, reference)).toEqual({});
    });

    test('drops assignee ids not in the reference list', () => {
      expect(_test.shapeProposed({ assigneeIds: ['u-stranger', 'u-bryan'] }, reference)).toEqual({
        assigneeIds: ['u-bryan'],
      });
    });

    test('rejects bad date and time formats', () => {
      expect(_test.shapeProposed({
        dueDate: '24/05/2026',
        dueTime: '9am',
        estimatedMinutes: 'a lot',
      }, reference)).toEqual({});
    });

    test('rejects out-of-range estimated minutes', () => {
      expect(_test.shapeProposed({ estimatedMinutes: 99999 }, reference)).toEqual({});
      expect(_test.shapeProposed({ estimatedMinutes: 0 }, reference)).toEqual({});
      expect(_test.shapeProposed({ estimatedMinutes: 90 }, reference)).toEqual({ estimatedMinutes: 90 });
    });

    test('drops unknown department / priority values', () => {
      expect(_test.shapeProposed({
        department: 'janitorial',
        priority: 'super urgent',
      }, reference)).toEqual({});
    });
  });

  describe('buildSystemPrompt', () => {
    test('encodes the JSON contract + key rules', () => {
      const prompt = _test.buildSystemPrompt();
      expect(prompt).toContain('"proposed"');
      expect(prompt).toContain('"clarifyingQuestion"');
      expect(prompt).toContain('reference.properties');
      expect(prompt).toContain('reference.assignees');
      expect(prompt.toLowerCase()).toContain('mauritius');
      expect(prompt).toContain('Return ONLY the JSON');
    });
  });

  describe('buildUserPrompt', () => {
    test('packages instruction + history + reference into JSON', () => {
      const payload = JSON.parse(_test.buildUserPrompt({
        text: 'Assign Bryan to check water pressure at GBH-C8 tomorrow morning',
        history: [{ role: 'user', content: 'earlier turn' }],
        focus: { module: 'operations' },
        reference: {
          today: '2026-05-23',
          properties: [{ code: 'GBH-C8' }],
          assignees: [{ id: 'u-bryan', name: 'Bryan' }],
        },
      }));
      expect(payload.instruction).toContain('Bryan');
      expect(payload.history).toEqual([{ role: 'user', content: 'earlier turn' }]);
      expect(payload.focus.module).toBe('operations');
      expect(payload.reference.today).toBe('2026-05-23');
      expect(payload.reference.properties[0].code).toBe('GBH-C8');
    });
  });
});
