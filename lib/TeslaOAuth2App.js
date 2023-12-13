'use strict';

const { OAuth2App } = require('homey-oauth2app');
const OAuth2Client = require('./TeslaOAuth2Client');

module.exports = class TeslaOAuth2App extends OAuth2App {

  static OAUTH2_CLIENT = OAuth2Client; // Default: OAuth2Client
  static OAUTH2_DEBUG = true; // Default: false
  static OAUTH2_MULTI_SESSION = true; // Default: false
  static OAUTH2_DRIVERS = [ 'car' ]; // Default: all drivers

  async onOAuth2Init() {
    this.log('App has been initialized');

  }

}
