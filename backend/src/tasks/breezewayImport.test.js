'use strict';

const { extractPropertyCode, previewBreezewayCsv, previewBreezewayBundle } = require('./breezewayImport');

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

  test('skips Breezeway admin and aggregate property rows by default', async () => {
    const csvText = [
      'Department,Task ID,Property,Property ID,Status,Priority,Task title,Due date',
      'Office,1,Office / Store / Admin,1099484,Not Started,Medium,Office admin,2026-05-22',
      'Inspection,2,GBH,1268645,Not Started,Medium,Aggregate task,2026-05-22',
      'Inspection,3,GBH-B4,1055,Not Started,Medium,Inspect unit,2026-05-22',
    ].join('\n');

    const { report } = await previewBreezewayCsv({
      csvText,
      fileName: 'sample.csv',
      tenantId: '00000000-0000-0000-0000-000000000001',
      db: null,
    });

    expect(report.totalRows).toBe(3);
    expect(report.validRows).toBe(1);
    expect(report.policySkippedRows).toBe(2);
    expect(report.skippedRows.map((row) => row.reason)).toEqual(['admin_property', 'aggregate_property']);
  });

  test('previews uploaded Breezeway bundle files without filesystem reads', async () => {
    const summary = [
      'Department,Task ID,Property,Property ID,Status,Priority,Task title,Created date,Last updated date,Due date,Currency',
      'Inspection,12345,GBH-B4,1055,Finished,High,Inspect unit,2026-05-20,2026-05-21,2026-05-22,MUR',
    ].join('\n');
    const custom = [
      'Task title,Property,Department,Due date,Created date,Last updated date,Task report link',
      'Inspect unit,GBH-B4 - Geranium Road,Inspection,2026-05-22,2026-05-20,2026-05-21,https://example.test/report/12345',
    ].join('\n');
    const cost = [
      'Department,Task ID,Property,Status,Priority,Task title,Cost type,Cost description,Cost amount,Cost bill to,Currency',
      'Inspection,12345,GBH-B4,Finished,High,Inspect unit,Materials,Paint,100.00,Owner,MUR',
    ].join('\n');
    const payroll = [
      'Department,Task ID,Property,Task title,Assignee,Rate paid,Rate type',
      'Inspection,12345,GBH-B4,Inspect unit,Bryan,50.00,Hour',
    ].join('\n');
    const supplies = [
      'Department,Task ID,Property,Task title,Supply ID,Supply name,Supply quantity,Supply unit cost,Supply unit type,Supply is billable,Supply bill to',
      'Inspection,12345,GBH-B4,Inspect unit,s-1,Soap,2,10.00,ea,Yes,Owner',
    ].join('\n');

    const { report } = await previewBreezewayBundle({
      fileTexts: { summary, custom, cost, payroll, supplies },
      tenantId: '00000000-0000-0000-0000-000000000001',
      db: null,
    });

    expect(report.validRows).toBe(1);
    expect(report.supplemental.custom.joinable).toBe(true);
    expect(report.supplemental.cost.lineRows).toBe(1);
    expect(report.supplemental.supplies.lineRows).toBe(1);
  });
});
