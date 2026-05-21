'use strict';

const { extractPropertyCode, previewBreezewayCsv } = require('./breezewayImport');

describe('breezeway import preview', () => {
  test('extracts Friday property codes from Breezeway property labels', () => {
    expect(extractPropertyCode('VA-4')).toBe('VA-4');
    expect(extractPropertyCode('GBH-B4 - Geranium Road')).toBe('GBH-B4');
    expect(extractPropertyCode('NYH-A2 - Avenue Des Perruches')).toBe('NYH-A2');
    expect(extractPropertyCode('Office / Store / Admin')).toBeNull();
  });

  test('uses extracted property code in transformed task preview', async () => {
    const csvText = [
      'Department,Task ID,Property,Status,Priority,Task title,Due date',
      'Inspection,12345,GBH-B4 - Geranium Road,Not Started,Medium,Inspect unit,2026-05-22',
    ].join('\n');

    const { report } = await previewBreezewayCsv({
      csvText,
      fileName: 'sample.csv',
      tenantId: '00000000-0000-0000-0000-000000000001',
      db: null,
    });

    expect(report.validRows).toBe(1);
    expect(report.unknownProperties).toHaveLength(0);
    expect(report.sampleTransformedRecords[0]).toMatchObject({
      externalRef: 'breezeway:12345',
      propertyCode: 'GBH-B4',
      status: 'scheduled',
    });
  });
});
