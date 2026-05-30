'use strict';

const { MODULES, alwaysOnModuleKeys, defaultSignupModuleKeys } = require('./modules');

describe('tenant module registry', () => {
  test('keeps Manage baseline modules always available', () => {
    expect(alwaysOnModuleKeys().sort()).toEqual(['billing', 'tenant-settings']);
    expect(defaultSignupModuleKeys()).toEqual(expect.arrayContaining(['billing', 'tenant-settings']));
    expect(MODULES['tenant-settings'].always_on).toBe(true);
    expect(MODULES.billing.always_on).toBe(true);
  });
});
