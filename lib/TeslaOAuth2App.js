'use strict';

const { OAuth2App } = require('homey-oauth2app');
const OAuth2Client = require('./TeslaOAuth2Client');
const sClients = Symbol('clients');

module.exports = class TeslaOAuth2App extends OAuth2App {

  static OAUTH2_CLIENT = OAuth2Client; // Default: OAuth2Client
  static OAUTH2_DEBUG = false; // Default: false
  static OAUTH2_MULTI_SESSION = true; // Default: false
  static OAUTH2_DRIVERS = [ 'car' ]; // Default: all drivers

  async onOAuth2Init() {
    this.log('App has been initialized');
  } 
  
  getOAuth2Client({
    sessionId,
    configId = 'default'
    // ,
    // optionalClientId,
    // optionalClientSecret
  } = {}){
    let client = super.getOAuth2Client({ sessionId, configId });
    client._clientId = this.homey.settings.get('client_id') || '';
    client._clientSecret = this.homey.settings.get('client_secret') || '';
    return client;
  }

  createOAuth2Client({
    sessionId,
    configId = 'default'
    // ,
    // optionalClientId,
    // optionalClientSecret
  } = {}){
    let client = super.createOAuth2Client({ sessionId, configId });
    client._clientId = this.homey.settings.get('client_id') || '';
    client._clientSecret = this.homey.settings.get('client_secret') || '';
    return client;
  }
}
