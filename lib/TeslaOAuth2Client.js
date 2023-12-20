const { OAuth2Client, OAuth2Error, OAuth2Token } = require('homey-oauth2app');
// const fetch = require('node-fetch');
const https = require('./https');
const { API_URL } = require('homey-oauth2app/lib/OAuth2Client');
const TeslaOAuth2Token = require('./TeslaOAuth2Token');

module.exports = class TesladOAuth2Client extends OAuth2Client {
  // Required:
  // Regional requirements
  // North America, Asia-Pacific (excluding China): https://fleet-api.prd.na.vn.cloud.tesla.com
  // Europe, Middle East, Africa:                   https://fleet-api.prd.eu.vn.cloud.tesla.com

  static API_URL = 'https://fleet-api.prd.na.vn.cloud.tesla.com';
  static TOKEN_URL = 'https://auth.tesla.com/oauth2/v3/token';
  static AUTHORIZATION_URL = 'https://auth.tesla.com/oauth2/v3/authorize';
  static SCOPES = [ 
    'openid', 
    'offline_access', 
    'vehicle_device_data', 
    'vehicle_cmds', 
    'vehicle_charging_cmds' 
  ];

// Optional:
  static TOKEN = TeslaOAuth2Token; // Default: OAuth2Token
  static REDIRECT_URL = 'https://callback.athom.com/oauth2/callback'; // Default: 'https://callback.athom.com/oauth2/callback'

  // Overload what needs to be overloaded here

  async onInit(){
    await super.onInit();
    this.region = null;
  }  

  async onGetTokenByCode({ code }) {
    // return super.onGetTokenByCode({code});

    try{
      let body = {
          code: code,
          grant_type: 'authorization_code',
          client_id: this._clientId,
          client_secret: this._clientSecret,
          redirect_uri: this._redirectUrl,
          audience: 'https://fleet-api.prd.na.vn.cloud.tesla.com'
      };
      body = JSON.stringify( body );

      let response = await https.request( 
        'POST', 
        this._tokenUrl,
        {
          cache: 'no-cache',
          headers: {
            'Content-Type': 'application/json'
          }
        },
        body
      );

      let region = await https.request( 
        'GET', 
        this._apiUrl + '/api/1/users/region',
        {
          cache: 'no-cache',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': 'Bearer ' + response.access_token
          }
        },
        ''
      );

      const token = new this._tokenConstructor({
        access_token: response.access_token,
        refresh_token: response.refresh_token,
        token_type: response.token_type,
        expires_in: response.expires_in,
        region: region.region,
        fleet_api_base_url: region.fleet_api_base_url
      });
      return token;      
      // return new OAuth2Token(response);
    }
    catch(error){
      this.log("onGetTokenByCode error: "+error.message);
      throw error;
    }
  }

  async onRefreshToken() {
    const token = this.getToken();
    if (!token) {
      throw new OAuth2Error('Missing Token');
    }

    this.debug('Refreshing token...');

    if (!token.isRefreshable()) {
      throw new OAuth2Error('Token cannot be refreshed');
    }

    // const body = new URLSearchParams();
    // body.append('grant_type', 'refresh_token');
    // body.append('client_id', this._clientId);
    // body.append('client_secret', this._clientSecret);
    // body.append('refresh_token', token.refresh_token);

    // const response = await fetch(this._tokenUrl, {
    //   body,
    //   method: 'POST',
    // });
    // if (!response.ok) {
    //   return this.onHandleRefreshTokenError({ response });
    // }
    let response = {};
    try{
      let body = {
        grant_type: 'refresh_token',
        client_id: this._clientId,
        client_secret: this._clientSecret,
        refresh_token: token.refresh_token
      };
      body = JSON.stringify( body );

      response = await https.request( 
        'POST', 
        this._tokenUrl,
        {
          cache: 'no-cache',
          headers: {
            'Content-Type': 'application/json'
          }
        },
        body  
      );

      this._token = await this.onHandleRefreshTokenResponse(response);

      this.debug('Refreshed token!', this._token);
      this.save();

      return this.getToken();
    }
    catch (error){
      this.log("onRefreshToken error: "+error.message);
      throw new OAuth2Error(error.message);
    }
  }

  async onHandleRefreshTokenResponse(response) {
    const json = response;
    const token = new this._tokenConstructor({
      ...this._token, // merge with old token for properties such as refresh_token
      ...json,
    });
    return token;
  }

  async onHandleNotOK({ body }) {
      throw new OAuth2Error(body.error);
  }

  // async onBuildRequest(req){
  //   if (req.path != '/api/1/users/region'){
  //     let regionUrl = this.getToken().fleet_api_base_url; 
  //     if (regionUrl){
  //       req.path = regionUrl + req.path;
  //     }
  //   }
  //   return await super.onBuildRequest(req);
  // }

  async onHandleResult({
    result,
    status,
    statusText,
    headers,
  }){
    if (result.response){
      this.debug('[res JSON]', {
        result: result.response
      });
      return result.response;
    }
    else{
      this.debug('[res]', {
        result
      });
      return result;
    } 
  }

  // RESULT HANDLING =======================================================================================
  async _checkResult(result){
    if (result.result){
      return true;
    }
    else{
      throw new Error(result.reason);
    }
  }

  // CHARGING ENDPOINTS =======================================================================================
  async getApiStatus() {
    return await this.get({
      path: '/status'
    });
  }

  // USER ENDPOINTS ==========================================================================================
  async getUserRegion() {
    return await this.get({
      path: '/api/1/users/region'
    });
  }


  
  // VEHICLE ENDPOINTS =======================================================================================
  async getVehicles() {    
    return await this.get({
      path: this.getToken().fleet_api_base_url + '/api/1/vehicles'
    });
  }

  async getVehicle(id) {
    return await this.get({
      path: this.getToken().fleet_api_base_url+'/api/1/vehicles/'+id
    });
  }

  async getVehicleData(id, endpoints = []) {
    let query = '';
    for (let i=0; i<endpoints.length; i++){
      if (query == ''){
      }
      else{
        query = query + ';';
      }
      query = query + endpoints[i];
    }
    query = encodeURIComponent(query);
    if (query != ''){
      query = '?endpoints=' + query;
    }
    return await this.get({
      path: this.getToken().fleet_api_base_url+'/api/1/vehicles/'+id+'/vehicle_data' + query
    });
  }

  async commandWakeUp(id) {
    await this.post({
      path: this.getToken().fleet_api_base_url+'/api/1/vehicles/'+id+'/wake_up'
    });
  }

  // VEHICLE COMMAND ENDPOINTS =======================================================================================
  async commandDoorLock(id, locked){
    let endpoint;
    if (locked){
      endpoint = '/api/1/vehicles/'+id+'/command/door_lock';
    }
    else{
      endpoint = '/api/1/vehicles/'+id+'/command/door_unlock';
    }
    let result = await this.post({
      path: this.getToken().fleet_api_base_url + endpoint
    });
    await this._checkResult(result);
  }

  async commandSentryMode(id, state){
    let result = await this.post({
      path: this.getToken().fleet_api_base_url+'/api/1/vehicles/'+id+'/command/set_sentry_mode',
      json: {"on": state}
    });
    await this._checkResult(result);
  }

  async commandFlashLights(id) {
    let result = await this.post({
      path: this.getToken().fleet_api_base_url+'/api/1/vehicles/'+id+'/command/flash_lights'
    });
    await this._checkResult(result);
  }

  async commandHonkHorn(id) {
    let result = await this.post({
      path: this.getToken().fleet_api_base_url+'/api/1/vehicles/'+id+'/command/honk_horn'
    });
    await this._checkResult(result);
  }

  async commandWindowPosition(id, position) {
    let result = await this.post({
      path: this.getToken().fleet_api_base_url+'/api/1/vehicles/'+id+'/command/window_control',
      json:{"command": position}
    });
    await this._checkResult(result);
  }


  // CHARGING ENDPOINTS =======================================================================================
  async getChargingHistory() {    
    return this.get({
      path: '/api/1/dx/charging/history'
    });
  }


}