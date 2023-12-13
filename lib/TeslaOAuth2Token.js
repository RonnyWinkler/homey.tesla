'use strict';

const { OAuth2Token } = require('homey-oauth2app');

module.exports = class TeslaOAuth2Token extends OAuth2Token {

  constructor({ region, fleet_api_base_url, ...props }) {
    super({ ...props });

    this.region = region || null;
    this.fleet_api_base_url = fleet_api_base_url || null;

  }

  toJSON() {
    return {
      ...super.toJSON(),
      region: this.region,
      fleet_api_base_url: this.fleet_api_base_url
    }
  }

}