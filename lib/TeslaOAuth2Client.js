const { OAuth2Client, OAuth2Error, OAuth2Token } = require('homey-oauth2app');
// const fetch = require('node-fetch');
const https = require('./https');

const { API_URL } = require('homey-oauth2app/lib/OAuth2Client');
const TeslaOAuth2Token = require('./TeslaOAuth2Token');
const HTTP_TIMEOUT = 15000; // xx sec Timeout
const COMMAND_API_URL = 'https://teslaproxy.hpwinkler.de';

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

  // async onHandleNotOK({ body }) {
  //     throw new OAuth2Error(body.error);
  // }

  // Set a default timeout for reuqests
  async onBuildRequest(req){
    let result = await super.onBuildRequest(req);
    result.opts.timeout = HTTP_TIMEOUT;
    return result;
  }

  async onHandleResult({
    result,
    status,
    statusText,
    headers,
  }){
    this.log('[result]', {
      status: status, statusText: statusText 
    });
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

  // Turn a fetch error into standard error containing only the error type as message
  async onRequestError({
    req,
    url,
    opts,
    err,
  }){
    // this.debug('onRequestError', err);
    this.log('onRequestError', err);
    if (err.constructor.name == 'FetchError'){
      throw new Error(err.type);
    }
    throw err;
  }

  // API HANDLING =======================================================================================
  getCommandUrl({host, path, api='command'}){
    let result = path;
    if (api == 'rest'){
      if (host != undefined){
        result = host + path;
      }
    }
    else if ( api == 'command'){
      result = COMMAND_API_URL + path;
    }

    return result;
  }


  // RESULT HANDLING =======================================================================================
  async _checkResult(result){
    if (result.result || result == ''){
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

  // VEHICLE SIGNED COMMAND ENDPOINTS ================================================================================
  async signedCommand(id, buffer){
    let body = buffer.toString('base64'); 
    let result = await this.post({
      path: this.getToken().fleet_api_base_url+'/api/1/vehicles/'+id+'/signed_command',
      json: { "routable_message": body }
    });
    // await this._checkResult(result);
    return Buffer.from(result, 'base64');
  }

  // VEHICLE COMMAND ENDPOINTS =======================================================================================
  async commandDoorLock(api, id, {locked}){
    let endpoint;
    if (locked){
      endpoint = '/api/1/vehicles/'+id+'/command/door_lock';
    }
    else{
      endpoint = '/api/1/vehicles/'+id+'/command/door_unlock';
    }
    let result = await this.post({
      path: this.getCommandUrl({
        host: this.getToken().fleet_api_base_url,
        path: endpoint,
        api: api})
      });
    await this._checkResult(result);
  }

  async commandSentryMode(api, id, {state}){
    let result = await this.post({
      // path: this.getToken().fleet_api_base_url+'/api/1/vehicles/'+id+'/command/set_sentry_mode',
      path: this.getCommandUrl({
        host: this.getToken().fleet_api_base_url,
        path: '/api/1/vehicles/'+id+'/command/set_sentry_mode',
        api: api}),
      json: {"on": state}
    });
    await this._checkResult(result);
  }

  async commandFlashLights(api, id, {}) {
    let result = await this.post({
      // path: this.getToken().fleet_api_base_url+'/api/1/vehicles/'+id+'/command/flash_lights'
      path: this.getCommandUrl({
        host: this.getToken().fleet_api_base_url,
        path: '/api/1/vehicles/'+id+'/command/flash_lights',
        api: api})
    });
    await this._checkResult(result);
  }

  async commandHonkHorn(api, id, {}) {
    let result = await this.post({
      // path: this.getToken().fleet_api_base_url+'/api/1/vehicles/'+id+'/command/honk_horn'
      path: this.getCommandUrl({
        host: this.getToken().fleet_api_base_url,
        path: '/api/1/vehicles/'+id+'/command/honk_horn',
        api: api})
    });
    await this._checkResult(result);
  }

  async commandWindowPosition(api, id, {position}) {
    let result = await this.post({
      // path: this.getToken().fleet_api_base_url+'/api/1/vehicles/'+id+'/command/window_control',
      path: this.getCommandUrl({
        host: this.getToken().fleet_api_base_url,
        path: '/api/1/vehicles/'+id+'/command/schedule_software_update',
        api: api}),
      json:{"command": position}
    });
    await this._checkResult(result);
  }

  async commandScheduleSoftwareUpdate(api, id, {minutes}) {
    let result = await this.post({
      // path: this.getToken().fleet_api_base_url+'/api/1/vehicles/'+id+'/command/window_control',
      path: this.getCommandUrl({
        host: this.getToken().fleet_api_base_url,
        path: '/api/1/vehicles/'+id+'/command/window_control',
        api: api}),
      json:{"offset_sec": minutes * 60}
    });
    await this._checkResult(result);
  }

  async commandSetTemperature(api, id, {driverTemperature, passengerTemperature}) {
    let result = await this.post({
      // path: this.getToken().fleet_api_base_url+'/api/1/vehicles/'+id+'/command/set_temps',
      path: this.getCommandUrl({
        host: this.getToken().fleet_api_base_url,
        path: '/api/1/vehicles/'+id+'/command/set_temps',
        api: api}),
      json:{
        "driver_temp": driverTemperature,
        "passenger_temp": passengerTemperature
      }
    });
    await this._checkResult(result);
  }

  async commandPreconditioning(api, id, {on}){
      let endpoint;
      if(on){
        endpoint = '/api/1/vehicles/'+id+'/command/auto_conditioning_start';
      } 
      else{
        endpoint = '/api/1/vehicles/'+id+'/command/auto_conditioning_stop';
      }
      let result = await this.post({
        // path: endpoint
        path: this.getCommandUrl({
          host: this.getToken().fleet_api_base_url,
          path: endpoint,
          api: api})
      });
      await this._checkResult(result);
  }

  async commandOverheatprotectionMode(api, id, {mode}){
    let result = await this.post({
      // path: this.getToken().fleet_api_base_url+'/api/1/vehicles/'+id+'/command/set_cabin_overheat_protection',
      path: this.getCommandUrl({
        host: this.getToken().fleet_api_base_url,
        path: '/api/1/vehicles/'+id+'/command/set_cabin_overheat_protection',
        api: api}),
      json:{
        "on": (mode != 'off'),
        "fan_only": (mode == 'fan_only')
      }
    });
    await this._checkResult(result);
  }

  async commandOverheatprotectionLevel(api, id, {level}){
    let cop_temp;
    if (level == 'low'){
      cop_temp = 1;
    }
    else if (level == 'medium'){
      cop_temp = 2;
    }
    else if (level == 'high'){
      cop_temp = 3;
    }
    let result = await this.post({
      // path: this.getToken().fleet_api_base_url+'/api/1/vehicles/'+id+'/command/set_cop_temp',
      path: this.getCommandUrl({
        host: this.getToken().fleet_api_base_url,
        path: '/api/1/vehicles/'+id+'/command/set_cop_temp',
        api: api}),
      json:{
        "cop_temp": cop_temp
      }
    });
    await this._checkResult(result);
  }

  async commandSteeringWheelHeatLevel(api, id, {level}){
    let command;
    let json;
    if (level == 'auto'){
      command = 'remote_auto_steering_wheel_heat_climate_request';
      json = {
        "on": true
      }
    }
    else{
      command = 'remote_steering_wheel_heat_level_request';
      json = {
        "level": level
      }
    }
    let result = await this.post({
      path: this.getCommandUrl({
        host: this.getToken().fleet_api_base_url,
        path: '/api/1/vehicles/'+id+'/command/'+command,
        api: api}),
      json: json
    });
    await this._checkResult(result);
  }

  async commandSeatHeatLevel(api, id, {level, seat}){
    let command;
    let json;
    if (level == 'auto'){
      command = 'remote_auto_seat_climate_request';
      json = {
        "auto_seat_position": seat,
        "auto_climate_on": true
      }
    }
    else{
      command = 'remote_seat_heater_request';
      json = {
        "level": level,
        "heater": seat
      }
    }
    let result = await this.post({
      path: this.getCommandUrl({
        host: this.getToken().fleet_api_base_url,
        path: '/api/1/vehicles/'+id+'/command/'+command,
        api: api}),
      json: json
    });
    await this._checkResult(result);
  }

  async commandDefrost(api, id, {on}){
    let result = await this.post({
      // path: this.getToken().fleet_api_base_url+'/api/1/vehicles/'+id+'/command/set_preconditioning_max',
      path: this.getCommandUrl({
        host: this.getToken().fleet_api_base_url,
        path: '/api/1/vehicles/'+id+'/command/set_preconditioning_max',
        api: api}),
      json: {
        "on": on
      }
    });
    await this._checkResult(result);
  }

  async commandChargePort(api, id, {state}){
    let endpoint;
    if(state){
      endpoint = '/api/1/vehicles/'+id+'/command/charge_port_door_open';
    } 
    else{
      endpoint = '/api/1/vehicles/'+id+'/command/charge_port_door_close';
    }
    let result = await this.post({
      // path: endpoint
      path: this.getCommandUrl({
        host: this.getToken().fleet_api_base_url,
        path: endpoint,
        api: api})
    });
    await this._checkResult(result);
  }

  async commandChargeOn(api, id, {state}){
    let endpoint;
    if(state){
      endpoint = '/api/1/vehicles/'+id+'/command/charge_start';
    } 
    else{
      endpoint = '/api/1/vehicles/'+id+'/command/charge_stop';
    }
    let result = await this.post({
      // path: endpoint
      path: this.getCommandUrl({
        host: this.getToken().fleet_api_base_url,
        path: endpoint,
        api: api})
    });
    await this._checkResult(result);
  }

  async commandChargeLimit(api, id, {limit}){
    let result = await this.post({
      path: this.getCommandUrl({
        host: this.getToken().fleet_api_base_url,
        path: '/api/1/vehicles/'+id+'/command/set_charge_limit',
        api: api}),
      json: {
        "percent": limit
      }
    });
    await this._checkResult(result);
  }

  async commandChargeCurrent(api, id, {current}){
    let result = await this.post({
      path: this.getCommandUrl({
        host: this.getToken().fleet_api_base_url,
        path: '/api/1/vehicles/'+id+'/command/set_charging_amps',
        api: api}),
      json: {
        "charging_amps": current
      }
    });
    await this._checkResult(result);
  }

  async commandScheduleCharging(api, id, args){
    let result = await this.post({
      path: this.getCommandUrl({
        host: this.getToken().fleet_api_base_url,
        path: '/api/1/vehicles/'+id+'/command/set_scheduled_charging',
        api: api}),
      json: {
        "enable": true,
        "time": (args.hh * 60 + args.mm)
      }
    });
    await this._checkResult(result);
  }

  async commandDeactivateScheduledCharging(api, id, {}){
    let result = await this.post({
      path: this.getCommandUrl({
        host: this.getToken().fleet_api_base_url,
        path: '/api/1/vehicles/'+id+'/command/set_scheduled_charging',
        api: api}),
      json: {
        "enable": false,
        "time": 0
      }
    });
    await this._checkResult(result);
  }

  async commandScheduleDeparture(api, id, args){
    let result = await this.post({
      path: this.getCommandUrl({
        host: this.getToken().fleet_api_base_url,
        path: '/api/1/vehicles/'+id+'/command/set_scheduled_departure',
        api: api}),
      json: {
        "enable": true,
        "departure_time": (args.hh * 60 + args.mm),
        "preconditioning_enabled": args.preconditioning_enabled,
        "preconditioning_weekdays_only": args.preconditioning_weekdays_only,
        "off_peak_charging_enabled": args.off_peak_charging_enabled,
        "off_peak_charging_weekdays_only": args.off_peak_charging_weekdays_only,
        "end_off_peak_time": (args.op_hh * 60 + args.op_mm)
      }
    });
    await this._checkResult(result);
  }

  async commandDeactivateScheduledDeparture(api, id, {}){
    let result = await this.post({
      path: this.getCommandUrl({
        host: this.getToken().fleet_api_base_url,
        path: '/api/1/vehicles/'+id+'/command/set_scheduled_departure',
        api: api}),
      json: {
        "enable": false,
        "departure_time": 0,
        "preconditioning_enabled": false,
        "preconditioning_weekdays_only": false,
        "off_peak_charging_enabled": false,
        "off_peak_charging_weekdays_only": false,
        "end_off_peak_time": 0
      }
    });
    await this._checkResult(result);
  }

  async commandNavigateGpsRequest(api, id, {latitude, longitude, order=1}){
    // This endpoint only supports REST API
    let result = await this.post({
      path: this.getCommandUrl({
        host: this.getToken().fleet_api_base_url,
        path: '/api/1/vehicles/'+id+'/command/navigation_gps_request',
        api: api}),
      json: {
        "lat": latitude,
        "lon": longitude,
        "order": order
      }
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