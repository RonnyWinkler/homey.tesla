'use strict';

// Tesla Fleet API token/audience rules:
// https://developer.tesla.com/docs/fleet-api/authentication/partner-tokens
// https://developer.tesla.com/docs/fleet-api/authentication/third-party-tokens
// https://developer.tesla.com/docs/fleet-api/getting-started/regions-countries
// Audience must be a regional Fleet API base URL without a trailing slash.

const FLEET_AUTH_TOKEN_URL = 'https://fleet-auth.prd.vn.cloud.tesla.com/oauth2/v3/token';

const FLEET_API_BASE_URLS = Object.freeze({
  na: 'https://fleet-api.prd.na.vn.cloud.tesla.com',
  eu: 'https://fleet-api.prd.eu.vn.cloud.tesla.com',
  cn: 'https://fleet-api.prd.cn.vn.cloud.tesla.cn',
});

const PARTNER_REGISTRATION_REGIONS = Object.freeze(['na', 'eu']);

const PARTNER_TOKEN_SCOPE = [
  'openid',
  'user_data',
  'vehicle_device_data',
  'vehicle_cmds',
  'vehicle_charging_cmds',
  'vehicle_location',
  'offline_access',
].join(' ');

const EU_HOMEY_LANGUAGES = new Set([
  'de', 'nl', 'fr', 'it', 'sv', 'no', 'nb', 'nn', 'es', 'da', 'pl', 'ru', 'fi',
  'pt', 'el', 'cs', 'sk', 'hu', 'ro', 'bg', 'hr', 'sl', 'et', 'lv', 'lt', 'uk',
]);

function stripTrailingSlash(url) {
  return String(url || '').trim().replace(/\/+$/, '');
}

function normalizeAudience(url) {
  return stripTrailingSlash(url);
}

function isValidAudience(url) {
  const audience = normalizeAudience(url);
  return Object.values(FLEET_API_BASE_URLS).includes(audience);
}

function audienceForRegion(region) {
  const key = String(region || '').trim().toLowerCase();
  if (key === 'emea' || key === 'europe') {
    return FLEET_API_BASE_URLS.eu;
  }
  return FLEET_API_BASE_URLS[key] || FLEET_API_BASE_URLS.na;
}

function inferRegionFromLanguage(language) {
  const lang = String(language || '').trim().toLowerCase().split(/[-_]/)[0];
  if (lang === 'zh') {
    return 'cn';
  }
  if (EU_HOMEY_LANGUAGES.has(lang)) {
    return 'eu';
  }
  return 'na';
}

function audienceForLanguage(language) {
  return audienceForRegion(inferRegionFromLanguage(language));
}

function tokenRequestHeaders() {
  return {
    'Content-Type': 'application/x-www-form-urlencoded',
    Accept: 'application/json',
  };
}

function buildAuthorizationCodeTokenBody({
  code,
  clientId,
  clientSecret,
  redirectUri,
  audience,
}) {
  return new URLSearchParams({
    grant_type: 'authorization_code',
    client_id: clientId,
    client_secret: clientSecret,
    code,
    audience: normalizeAudience(audience),
    redirect_uri: redirectUri,
  }).toString();
}

function buildRefreshTokenBody({ clientId, clientSecret, refreshToken }) {
  const params = {
    grant_type: 'refresh_token',
    client_id: clientId,
    refresh_token: refreshToken,
  };
  if (clientSecret) {
    params.client_secret = clientSecret;
  }
  return new URLSearchParams(params).toString();
}

function buildPartnerTokenBody({ clientId, clientSecret, audience, scope }) {
  return new URLSearchParams({
    grant_type: 'client_credentials',
    client_id: clientId,
    client_secret: clientSecret,
    audience: normalizeAudience(audience),
    scope: scope || PARTNER_TOKEN_SCOPE,
  }).toString();
}

function isInvalidAudienceError(error) {
  const message = String(error && error.message ? error.message : error || '');
  return /invalid_audience/i.test(message);
}

module.exports = {
  FLEET_AUTH_TOKEN_URL,
  FLEET_API_BASE_URLS,
  PARTNER_REGISTRATION_REGIONS,
  PARTNER_TOKEN_SCOPE,
  stripTrailingSlash,
  normalizeAudience,
  isValidAudience,
  audienceForRegion,
  inferRegionFromLanguage,
  audienceForLanguage,
  tokenRequestHeaders,
  buildAuthorizationCodeTokenBody,
  buildRefreshTokenBody,
  buildPartnerTokenBody,
  isInvalidAudienceError,
};
