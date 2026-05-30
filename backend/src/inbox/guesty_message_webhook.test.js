'use strict';

jest.mock('../database/client', () => ({
  query: jest.fn(),
}));

jest.mock('./draft_generator', () => ({
  triggerDraftGeneration: jest.fn(),
}));

jest.mock('../realtime', () => ({
  notifyUsers: jest.fn(),
  publishFadEvent: jest.fn(),
  resolveGmWatchers: jest.fn(),
}));

const { __test } = require('./guesty_message_webhook');

describe('Guesty message webhook classifiers', () => {
  test('classifies Guesty owner booking alerts as system notifications', () => {
    const body = [
      'New Booking Alert from Friday.mu',
      'Property: Modern Sea View Apt with Pool, 4 Min to Beach',
      'Dates: May 28th, 2026 - Jun 7th, 2026',
      'Guest Name: Ranika',
      "Owner's Name: Friday Owner",
      'Owner portal link: https://friday.guestyowners.com',
    ].join(' ');

    expect(__test.isOwnerBookingAlert(body)).toBe(true);
    expect(__test.isSystemNotification(body)).toBe(true);
    expect(__test.extractOwnerAlertProperty(body)).toBe('Modern Sea View Apt with Pool, 4 Min to Beach');
    expect(__test.extractOwnerAlertName(body)).toBe('Friday Owner');
  });

  test('does not classify ordinary guest booking text as an owner alert', () => {
    const body = 'New booking question from the guest: can we check in early?';
    expect(__test.isOwnerBookingAlert(body)).toBe(false);
    expect(__test.isSystemNotification(body)).toBe(false);
  });
});
