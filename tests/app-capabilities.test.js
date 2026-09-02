'use strict';

jest.mock('../lib/core/utils', () => ({
  httpGet: jest.fn(),
  requestWithAutoLogin: jest.fn(async fn => fn({ baseUrl: 'https://example.test' })),
}));
jest.mock('../lib/core/yida-client', () => ({
  createAuthRef: jest.fn(() => ({ baseUrl: 'https://example.test' })),
}));

const utils = require('../lib/core/utils');
const {
  ENDPOINT,
  unwrapCapabilityResponse,
  fetchAppCreationCapability,
  assertAppCreationAllowed,
} = require('../lib/app/app-capabilities');

const allowed = {
  schemaVersion: 1,
  canAccessYida: { state: 'allowed', reasonCode: 'OK', reasonMessage: 'ok' },
  canCreateApp: { state: 'allowed', reasonCode: 'OK', reasonMessage: 'ok' },
};

describe('application creation capability preflight', () => {
  beforeEach(() => jest.clearAllMocks());

  test('calls the read-only server endpoint and unwraps standard responses', async () => {
    utils.httpGet.mockResolvedValue({ success: true, content: allowed });

    await expect(fetchAppCreationCapability()).resolves.toEqual(allowed);
    expect(utils.httpGet).toHaveBeenCalledWith('https://example.test', ENDPOINT, null);
  });

  test('preserves denied reason codes', async () => {
    utils.httpGet.mockResolvedValue({
      success: true,
      content: {
        ...allowed,
        canCreateApp: {
          state: 'denied',
          reasonCode: 'APP_CREATE_PERMISSION_DENIED',
          reasonMessage: 'not allowed',
        },
      },
    });

    await expect(assertAppCreationAllowed()).rejects.toMatchObject({
      code: 'APP_CREATE_PERMISSION_DENIED',
      capabilityState: 'denied',
    });
  });

  test('rejects malformed responses as unknown instead of permission denied', () => {
    expect(() => unwrapCapabilityResponse({ success: true, content: {} })).toThrow(
      expect.objectContaining({ code: 'APP_CAPABILITY_INVALID_RESPONSE' })
    );
  });
});
