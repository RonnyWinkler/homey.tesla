'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');

const TeslaFleetAuth = require('./TeslaFleetAuth');

test('token URL is the documented fleet-auth endpoint', () => {
  assert.equal(
    TeslaFleetAuth.FLEET_AUTH_TOKEN_URL,
    'https://fleet-auth.prd.vn.cloud.tesla.com/oauth2/v3/token'
  );
});

test('normalizeAudience strips trailing slashes and whitespace', () => {
  assert.equal(
    TeslaFleetAuth.normalizeAudience('https://fleet-api.prd.eu.vn.cloud.tesla.com/'),
    'https://fleet-api.prd.eu.vn.cloud.tesla.com'
  );
  assert.equal(
    TeslaFleetAuth.normalizeAudience('  https://fleet-api.prd.na.vn.cloud.tesla.com//  '),
    'https://fleet-api.prd.na.vn.cloud.tesla.com'
  );
});

test('only documented regional base URLs are valid audiences', () => {
  assert.equal(
    TeslaFleetAuth.isValidAudience('https://fleet-api.prd.eu.vn.cloud.tesla.com/'),
    true
  );
  assert.equal(
    TeslaFleetAuth.isValidAudience('https://fleet-api.prd.na.vn.cloud.tesla.com'),
    true
  );
  assert.equal(
    TeslaFleetAuth.isValidAudience('https://fleet-api.prd.cn.vn.cloud.tesla.cn'),
    true
  );
  assert.equal(
    TeslaFleetAuth.isValidAudience('https://auth.tesla.com'),
    false
  );
  assert.equal(
    TeslaFleetAuth.isValidAudience('https://fleet-api.prd.eu.vn.cloud.tesla.com/api'),
    false
  );
});

test('audienceForRegion maps Tesla region aliases without a trailing slash', () => {
  assert.equal(
    TeslaFleetAuth.audienceForRegion('eu'),
    'https://fleet-api.prd.eu.vn.cloud.tesla.com'
  );
  assert.equal(
    TeslaFleetAuth.audienceForRegion('EMEA'),
    'https://fleet-api.prd.eu.vn.cloud.tesla.com'
  );
  assert.equal(
    TeslaFleetAuth.audienceForRegion('unknown'),
    'https://fleet-api.prd.na.vn.cloud.tesla.com'
  );
});

test('Homey EU languages pick the EU audience', () => {
  assert.equal(TeslaFleetAuth.inferRegionFromLanguage('de'), 'eu');
  assert.equal(TeslaFleetAuth.inferRegionFromLanguage('nl-NL'), 'eu');
  assert.equal(TeslaFleetAuth.inferRegionFromLanguage('en'), 'na');
  assert.equal(
    TeslaFleetAuth.audienceForLanguage('da'),
    'https://fleet-api.prd.eu.vn.cloud.tesla.com'
  );
});

test('authorization-code body is form-urlencoded and has no trailing slash', () => {
  const body = TeslaFleetAuth.buildAuthorizationCodeTokenBody({
    code: 'abc',
    clientId: 'client',
    clientSecret: 'secret',
    redirectUri: 'https://callback.athom.com/oauth2/callback',
    audience: 'https://fleet-api.prd.eu.vn.cloud.tesla.com/',
  });
  const params = new URLSearchParams(body);
  assert.equal(params.get('grant_type'), 'authorization_code');
  assert.equal(params.get('audience'), 'https://fleet-api.prd.eu.vn.cloud.tesla.com');
  assert.equal(params.get('code'), 'abc');
  assert.equal(body.includes('%2F'), true);
  assert.equal(body.endsWith('/'), false);
  assert.equal(body.includes('{'), false);
});

test('partner token body matches Tesla client_credentials docs', () => {
  const body = TeslaFleetAuth.buildPartnerTokenBody({
    clientId: 'client',
    clientSecret: 'secret',
    audience: 'https://fleet-api.prd.na.vn.cloud.tesla.com/',
  });
  const params = new URLSearchParams(body);
  assert.equal(params.get('grant_type'), 'client_credentials');
  assert.equal(params.get('audience'), 'https://fleet-api.prd.na.vn.cloud.tesla.com');
  assert.ok(params.get('scope').includes('vehicle_device_data'));
});

test('refresh token body stays form-urlencoded without audience', () => {
  const body = TeslaFleetAuth.buildRefreshTokenBody({
    clientId: 'client',
    clientSecret: 'secret',
    refreshToken: 'refresh',
  });
  const params = new URLSearchParams(body);
  assert.equal(params.get('grant_type'), 'refresh_token');
  assert.equal(params.get('refresh_token'), 'refresh');
  assert.equal(params.get('audience'), null);
});

test('invalid_audience is detected from Tesla error text', () => {
  assert.equal(
    TeslaFleetAuth.isInvalidAudienceError(
      new Error('400 Bad Request: {"error":"invalid_audience"}')
    ),
    true
  );
  assert.equal(
    TeslaFleetAuth.isInvalidAudienceError(new Error('login_required')),
    false
  );
});
