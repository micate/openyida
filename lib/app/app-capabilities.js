'use strict';

const { httpGet, requestWithAutoLogin } = require('../core/utils');
const { createAuthRef } = require('../core/yida-client');
const { throwCommandError } = require('../core/command-errors');

const ENDPOINT = '/query/app/getAppCreationCapability.json';

function unwrapCapabilityResponse(response) {
  const content = response && response.success === true ? response.content : response;
  if (!content || !content.canAccessYida || !content.canCreateApp) {
    const error = new Error('Invalid application capability response');
    error.code = 'APP_CAPABILITY_INVALID_RESPONSE';
    throw error;
  }
  return content;
}

async function fetchAppCreationCapability(authRef = createAuthRef()) {
  const response = await requestWithAutoLogin(
    auth => httpGet(auth.baseUrl, ENDPOINT, null),
    authRef
  );
  return unwrapCapabilityResponse(response);
}

function capabilityError(capability) {
  const error = new Error(capability.reasonMessage || capability.reasonCode || 'Application creation is unavailable');
  error.code = capability.reasonCode || 'APP_CREATE_CAPABILITY_DENIED';
  error.capabilityState = capability.state;
  return error;
}

async function assertAppCreationAllowed(authRef = createAuthRef()) {
  const result = await fetchAppCreationCapability(authRef);
  if (result.canAccessYida.state !== 'allowed') {
    throw capabilityError(result.canAccessYida);
  }
  if (result.canCreateApp.state !== 'allowed') {
    throw capabilityError(result.canCreateApp);
  }
  return result;
}

async function run() {
  try {
    const result = await fetchAppCreationCapability();
    console.log(JSON.stringify(result, null, 2));
    if (result.canAccessYida.state !== 'allowed' || result.canCreateApp.state !== 'allowed') {
      const failed = result.canAccessYida.state !== 'allowed' ? result.canAccessYida : result.canCreateApp;
      throwCommandError(`${failed.reasonCode}: ${failed.reasonMessage}`);
    }
  } catch (error) {
    if (error && error.exitCode) { throw error; }
    const state = error && error.capabilityState === 'denied' ? 'denied' : 'unknown';
    console.log(JSON.stringify({
      schemaVersion: 1,
      canAccessYida: { state: 'unknown', reasonCode: error.code || 'CAPABILITY_REQUEST_FAILED', reasonMessage: error.message },
      canCreateApp: { state, reasonCode: error.code || 'CAPABILITY_REQUEST_FAILED', reasonMessage: error.message },
    }, null, 2));
    throwCommandError(error.message);
  }
}

module.exports = {
  ENDPOINT,
  run,
  unwrapCapabilityResponse,
  fetchAppCreationCapability,
  assertAppCreationAllowed,
};
