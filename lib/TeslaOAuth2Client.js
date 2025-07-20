const { OAuth2Client, OAuth2Error, OAuth2Token } = require('homey-oauth2app');
// const fetch = require('node-fetch');

const dns = require('dns');
// const {Agent} = require('undici');
const https = require('./https');

const { API_URL } = require('homey-oauth2app/lib/OAuth2Client');
const TeslaOAuth2Token = require('./TeslaOAuth2Token');
const HTTP_TIMEOUT = 15000; // xx sec Timeout
const CONSTANTS = require('./constants');

// const COMMAND_API_URL = 'https://teslaproxy.rwdevelopment.de';
// const COMMAND_API_URL = 'https://teslaproxy2.rwdevelopment.de';
// const COMMAND_API_URL_TEST = 'https://teslaproxy2.rwdevelopment.de';

module.exports = class TeslaOAuth2Client extends OAuth2Client {
  // Required:
  // Regional requirements
  // North America, Asia-Pacific (excluding China): https://fleet-api.prd.na.vn.cloud.tesla.com
  // Europe, Middle East, Africa:                   https://fleet-api.prd.eu.vn.cloud.tesla.com

  static API_URL = 'https://fleet-api.prd.na.vn.cloud.tesla.com';
  static TOKEN_URL = 'https://auth.tesla.com/oauth2/v3/token';
  static AUTHORIZATION_URL = 'https://auth.tesla.com/oauth2/v3/authorize?prompt_missing_scopes=true';
  static SCOPES = [ 
    'openid', 
    'offline_access', 
    'vehicle_device_data', 
    'vehicle_location',
    'vehicle_cmds', 
    'vehicle_charging_cmds',
    'energy_device_data',
    'energy_cmds'
  ];

  __clientId = '';
  get _clientId() {
    if (this.__clientId == ''){
      this.__clientId = this.homey.settings.get('client_id') || '';
    }
    return this.__clientId;
  }

  set _clientId(value) {
    this.__clientId = value;
  }

  __clientSecret = '';
  get _clientSecret() {
    if (this.__clientSecret == ''){
      this.__clientSecret = this.homey.settings.get('client_secret') || '';
    }
    return this.__clientSecret;
  }

  set _clientSecret(value) {
    this.__clientSecret = value;
  }


  // Optional:
  static TOKEN = TeslaOAuth2Token; // Default: OAuth2Token
  static REDIRECT_URL = 'https://callback.athom.com/oauth2/callback'; // Default: 'https://callback.athom.com/oauth2/callback'

  // Overload what needs to be overloaded here

  async onInit(){
    dns.setDefaultResultOrder('ipv4first');

    await super.onInit();
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

      if (!region || !region.region){
        region = { 
          region: 'na', 
          fleet_api_base_url: 'https://fleet-api.prd.na.vn.cloud.tesla.com' };
      };

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

    this.debug('Refreshing token... client:_id: '+this._clientId);

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
    // result.opts.agent = new Agent({
    //   connect: {
    //     lookup: (hostname, options, callback) => {
    //       console.log('lookup', hostname, options);
    //       return dns.resolve4(hostname, options, callback);
    //     },
    //   },
    // });
    return result;
  }

  async onHandleResult({
    result,
    status,
    statusText,
    headers,
  }){
    if (status != 200){
      this.log('[result]', {
        status: status, statusText: statusText
      });
    }
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

  async onIsRateLimited({ status, headers }) {
    // Ignore rate limit error. Handle in onHandleNotOK
    return false;
  }

  async onHandleNotOK({
    body,
    status,
    statusText,
    headers,
  }) {
    if (status == 426){
      const message = this.homey.__('devices.car.command_error_426');
      const err = new Error(message);
      err.status = status;
      err.statusText = statusText;
      return err;
    }
    else if (status == 429){
      let message = statusText;
      const err = new Error(message);
      err.status = status;
      err.statusText = statusText;
      return err;

      // let retryInSeconds = 0;
      // if (headers.get('retry-after')){
      //   retryInSeconds = headers.get('retry-after');
      // }
      // else{
      //   retryInSeconds = Number(body.split("Retry in ")[1].split(" seconds")[0]);
      // }
      // message = message + '. Retry in ' + Math.round(Number(retryInSeconds) / 60 ) + ' minutes.';
      // const err = new Error(message);
      // err.status = status;
      // err.statusText = statusText;
      // err.ratelimitLimit = headers.get('ratelimit-limit');
      // err.ratelimitRemaining = headers.get('ratelimit-remaining');
      // err.ratelimitReset = headers.get('ratelimit-reset');
      // err.rateLimitRetryAfter = retryInSeconds;
      // this.log("RateLimit data: ratelimitLimit:", err.ratelimitLimit, " ratelimitRemaining:", err.ratelimitRemaining, " ratelimitReset:", err.ratelimitReset, " rateLimitRetryAfter:", err.rateLimitRetryAfter);
      // try{
      //   if (headers.get('ratelimit-limit')){
      //     this.ratelimit['limit'] = Number(headers.get('ratelimit-limit'));
      //     this.ratelimit['remaining'] = Number(headers.get('ratelimit-remaining'));
      //     this.ratelimit['reset'] = Number(headers.get('ratelimit-reset'));
      //     this.ratelimit['retryAfter'] = Number(headers.get('ratelimit-retry-after'));
      //   }
      //   else{
      //     this.ratelimit = null;
      //   }
      // }
      // catch(error){
      // }
      // return err;
    }
    else{
      let message = `${status} ${statusText || 'Unknown Error'}`;
      if (body.error){
        message = message + ': ' + body.error;
      }
      const err = new Error(message);
      err.status = status;
      err.statusText = statusText;
      return err;
      // return super.onHandleNotOK({
      //   body,
      //   status,
      //   statusText,
      //   headers,
      // });  
    }
  }

  // API HANDLING =======================================================================================
  async getCommandUrl({host, path, api='command'}){
    let result = path;
    if (api == 'rest'){
      if (host != undefined){
        result = host + path;
      }
    }
    else if ( api == 'command'){
      throw new Error('Command Proxy deprecated.');
      // if (process.env.DEBUG === '1') {
      //   result = COMMAND_API_URL_TEST + path;
      // }
      // else{
      //   result = COMMAND_API_URL + path;
      // }
      // // check redirect URL to prevent FETCH error on POST request
      // try{
      //   let redirectUrl = await https.getRedirectUrl( 
      //     result,
      //     {}
      //   );
      //   result = redirectUrl + path;
      // }
      // catch(error){
      //   // keep original URL
      //   this.log("getCommandUrl error: "+error.message);
      // }
    }

    return result;
  }

  getCommandHeaders(){
    let appVersion = this.homey.app.manifest.version.split('.');
    let version = appVersion[0]*10000 + appVersion[1]*100 + appVersion[2]*1; 
    version = version.toString();
    if (version.length < 6){
      version = '0' + version;
    }
    return {
      'X-Homey-App-Version': version
    }
  }

  // RESULT HANDLING =======================================================================================
  async _checkResult(result){
    let content = {};
    switch (typeof result){
      case 'string':
        try{
          if (result.length > 0){
            content = JSON.parse(result);
          }
          else{
            content = result;
          }
        }
        catch(error){
          content = {};
        }
        break;
      case 'object':
        content = result;
    }
    if (content.response != undefined){
      content = content.response;
    }
    if (content.result || content.totalResults || content == ''){
      return true;
    }
    else{
      // Sometimes, the error code is present in content.reason
      if (content.reason && CONSTANTS.API_ERRORS_WHITELIST.indexOf(content.reason) > -1){
        // ignore errors that aor in the whitelist (e.g. 'already_set')
        return true;
      }
      // Sometimes, the error code is a substring of content.string
      if (content.string && content.string.length > 0){
        for (let i=0; i<CONSTANTS.API_ERRORS_WHITELIST.length; i++){
          if (content.string.indexOf(CONSTANTS.API_ERRORS_WHITELIST[i]) > -1){
            // ignore errors that aor in the whitelist (e.g. 'already_set')
            return true;
          }
        }
      }

      let message = content.reason || content.string || content || '';
      throw new Error(message);
    }
  }

  // API APP Registration ================================================================================
  // async getPartnerToken(){
  //   // let body = 'grant_type=client_credentials&client_id='+this._clientId+'&client_secret='+this._clientSecret+'&audience=https://fleet-api.prd.na.vn.cloud.tesla.com&scope=openid user_data vehicle_device_data vehicle_cmds vehicle_charging_cmds vehicle_location offline_access';

  //   let body = {
  //     grant_type: 'client_credentials',
  //     client_id: this._clientId,
  //     client_secret: this._clientSecret,
  //     audience: 'https://fleet-api.prd.na.vn.cloud.tesla.com',
  //     scope: 'openid user_data vehicle_device_data vehicle_cmds vehicle_charging_cmds vehicle_location offline_access'
  //   };
  //   body = JSON.stringify( body );

  //   let token = await https.request( 
  //     'POST', 
  //     this._tokenUrl,
  //     {
  //       cache: 'no-cache',
  //       headers: {
  //         'Content-Type': 'application/json'
  //       }
  //     },
  //     body
  //   );

  //   return token;
  // }

  // async registerPartnerAccount(){
  //   let token = await this.getPartnerToken();

  //   let body = {
  //     "domain": this._clientId + '.' + PARTNER_ACCOUNT_DOMAIN
  //   };
  //   body = JSON.stringify( body );

  //   let result = await https.request( 
  //     'POST', 
  //     this._apiUrl + '/api/1/partner_accounts',
  //     {
  //       cache: 'no-cache',
  //       headers: {
  //         'Content-Type': 'application/json',
  //         'Authorization': 'Bearer ' + token.access_token
  //       }
  //     },
  //     body
  //   );

  // }

  // API ENDPOINTS =======================================================================================
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

  async getVehicleAppRegistry(id) {
    return await this.post({
      path: this.getToken().fleet_api_base_url+'/api/1/vehicles/fleet_status',
      json: {
        vins:[ id ]
      }
    });
  }

  async commandWakeUp(api, id, {}) {
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
    return Buffer.from(result, 'base64');
    // return await this._checkResult(Buffer.from(result, 'base64'));
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
      path: await this.getCommandUrl({
        host: this.getToken().fleet_api_base_url,
        path: endpoint,
        api: api}),
      headers: this.getCommandHeaders()
    });
    await this._checkResult(result);
  }

  async commandSentryMode(api, id, {state}){
    let result = await this.post({
      // path: this.getToken().fleet_api_base_url+'/api/1/vehicles/'+id+'/command/set_sentry_mode',
      path: await this.getCommandUrl({
        host: this.getToken().fleet_api_base_url,
        path: '/api/1/vehicles/'+id+'/command/set_sentry_mode',
        api: api}),
      headers: this.getCommandHeaders(),
      json: {"on": state}
    });
    await this._checkResult(result);
  }

  async commandFlashLights(api, id, {}) {
    let result = await this.post({
      // path: this.getToken().fleet_api_base_url+'/api/1/vehicles/'+id+'/command/flash_lights'
      path: await this.getCommandUrl({
        host: this.getToken().fleet_api_base_url,
        path: '/api/1/vehicles/'+id+'/command/flash_lights',
        api: api}),
      headers: this.getCommandHeaders()
    });
    await this._checkResult(result);
  }

  async commandHonkHorn(api, id, {}) {
    let result = await this.post({
      // path: this.getToken().fleet_api_base_url+'/api/1/vehicles/'+id+'/command/honk_horn'
      path: await this.getCommandUrl({
        host: this.getToken().fleet_api_base_url,
        path: '/api/1/vehicles/'+id+'/command/honk_horn',
        api: api}),
      headers: this.getCommandHeaders()
    });
    await this._checkResult(result);
  }

  async commandTrunk(api, id, {trunk}) {
    let result = await this.post({
      path: await this.getCommandUrl({
        host: this.getToken().fleet_api_base_url,
        path: '/api/1/vehicles/'+id+'/command/actuate_trunk',
        api: api}),
      headers: this.getCommandHeaders(),
      json:{"which_trunk": trunk}
    });
    await this._checkResult(result);
  }

  async commandWindowPosition(api, id, {position}) {
    let result = await this.post({
      // path: this.getToken().fleet_api_base_url+'/api/1/vehicles/'+id+'/command/window_control',
      path: await this.getCommandUrl({
        host: this.getToken().fleet_api_base_url,
        path: '/api/1/vehicles/'+id+'/command/schedule_software_update',
        api: api}),
      headers: this.getCommandHeaders(),
      json:{"command": position}
    });
    await this._checkResult(result);
  }

  async commandScheduleSoftwareUpdate(api, id, {minutes}) {
    let result = await this.post({
      path: await this.getCommandUrl({
        host: this.getToken().fleet_api_base_url,
        path: '/api/1/vehicles/'+id+'/command/schedule_software_update',
        api: api}),
      headers: this.getCommandHeaders(),
      json:{"offset_sec": minutes * 60}
    });
    await this._checkResult(result);
  }

  async commandSetTemperature(api, id, {driverTemperature, passengerTemperature}) {
    let result = await this.post({
      // path: this.getToken().fleet_api_base_url+'/api/1/vehicles/'+id+'/command/set_temps',
      path: await this.getCommandUrl({
        host: this.getToken().fleet_api_base_url,
        path: '/api/1/vehicles/'+id+'/command/set_temps',
        api: api}),
      headers: this.getCommandHeaders(),
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
        path: await this.getCommandUrl({
          host: this.getToken().fleet_api_base_url,
          path: endpoint,
          api: api}),
        headers: this.getCommandHeaders()
      });
      await this._checkResult(result);
  }

  async commandOverheatprotectionMode(api, id, {mode}){
    let result = await this.post({
      // path: this.getToken().fleet_api_base_url+'/api/1/vehicles/'+id+'/command/set_cabin_overheat_protection',
      path: await this.getCommandUrl({
        host: this.getToken().fleet_api_base_url,
        path: '/api/1/vehicles/'+id+'/command/set_cabin_overheat_protection',
        api: api}),
      headers: this.getCommandHeaders(),
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
      path: await this.getCommandUrl({
        host: this.getToken().fleet_api_base_url,
        path: '/api/1/vehicles/'+id+'/command/set_cop_temp',
        api: api}),
      headers: this.getCommandHeaders(),
      json:{
        "cop_temp": cop_temp
      }
    });
    await this._checkResult(result);
  }

  async commandClimateKeeperMode(api, id, {mode}){
    let mode_int = 0;
    switch ( mode ) {
      case 'off':
        mode_int = 0;
        break;
      case 'on':
        mode_int = 1;
        break;
      case 'dog':
        mode_int = 2;
        break;
      case 'camp':
        mode_int = 3;
        break;
    }
    let result = await this.post({
      path: await this.getCommandUrl({
        host: this.getToken().fleet_api_base_url,
        path: '/api/1/vehicles/'+id+'/command/set_climate_keeper_mode',
        api: api}),
      headers: this.getCommandHeaders(),
      json:{
        "climate_keeper_mode": mode_int
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
      path: await this.getCommandUrl({
        host: this.getToken().fleet_api_base_url,
        path: '/api/1/vehicles/'+id+'/command/'+command,
        api: api}),
      headers: this.getCommandHeaders(),
      json: json
    });
    await this._checkResult(result);
  }

  async commandSteeringWheelHeat(api, id, {level}){
    let command = 'remote_steering_wheel_heater_request';
    let json = {
      "on": (level == 'on')
    }
    let result = await this.post({
      path: await this.getCommandUrl({
        host: this.getToken().fleet_api_base_url,
        path: '/api/1/vehicles/'+id+'/command/'+command,
        api: api}),
      headers: this.getCommandHeaders(),
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
      path: await this.getCommandUrl({
        host: this.getToken().fleet_api_base_url,
        path: '/api/1/vehicles/'+id+'/command/'+command,
        api: api}),
      headers: this.getCommandHeaders(),
      json: json
    });
    await this._checkResult(result);
  }

  async commandDefrost(api, id, {on}){
    let result = await this.post({
      // path: this.getToken().fleet_api_base_url+'/api/1/vehicles/'+id+'/command/set_preconditioning_max',
      path: await this.getCommandUrl({
        host: this.getToken().fleet_api_base_url,
        path: '/api/1/vehicles/'+id+'/command/set_preconditioning_max',
        api: api}),
      headers: this.getCommandHeaders(),
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
      path: await this.getCommandUrl({
        host: this.getToken().fleet_api_base_url,
        path: endpoint,
        api: api}),
      headers: this.getCommandHeaders()
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
      path: await this.getCommandUrl({
        host: this.getToken().fleet_api_base_url,
        path: endpoint,
        api: api}),
      headers: this.getCommandHeaders()
    });
    await this._checkResult(result);
  }

  async commandChargeLimit(api, id, {limit}){
    let result = await this.post({
      path: await this.getCommandUrl({
        host: this.getToken().fleet_api_base_url,
        path: '/api/1/vehicles/'+id+'/command/set_charge_limit',
        api: api}),
      headers: this.getCommandHeaders(),
      json: {
        "percent": limit
      }
    });
    await this._checkResult(result);
  }

  async commandChargeCurrent(api, id, {current}){
    let result = await this.post({
      path: await this.getCommandUrl({
        host: this.getToken().fleet_api_base_url,
        path: '/api/1/vehicles/'+id+'/command/set_charging_amps',
        api: api}),
      headers: this.getCommandHeaders(),
      json: {
        "charging_amps": current
      }
    });
    await this._checkResult(result);
  }

  async commandScheduleCharging(api, id, args){
    let result = await this.post({
      path: await this.getCommandUrl({
        host: this.getToken().fleet_api_base_url,
        path: '/api/1/vehicles/'+id+'/command/set_scheduled_charging',
        api: api}),
      headers: this.getCommandHeaders(),
      json: {
        "enable": true,
        "time": (args.hh * 60 + args.mm)
      }
    });
    await this._checkResult(result);
  }

  async commandDeactivateScheduledCharging(api, id, {}){
    let result = await this.post({
      path: await this.getCommandUrl({
        host: this.getToken().fleet_api_base_url,
        path: '/api/1/vehicles/'+id+'/command/set_scheduled_charging',
        api: api}),
      headers: this.getCommandHeaders(),
      json: {
        "enable": false,
        "time": 0
      }
    });
    await this._checkResult(result);
  }

  async commandScheduleDeparture(api, id, args){
    let result = await this.post({
      path: await this.getCommandUrl({
        host: this.getToken().fleet_api_base_url,
        path: '/api/1/vehicles/'+id+'/command/set_scheduled_departure',
        api: api}),
      headers: this.getCommandHeaders(),
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
      path: await this.getCommandUrl({
        host: this.getToken().fleet_api_base_url,
        path: '/api/1/vehicles/'+id+'/command/set_scheduled_departure',
        api: api}),
      headers: this.getCommandHeaders(),
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

  async commandNavigateGpsRequest(api, id, {latitude, longitude, order=1, locale, time}){
    // This endpoint only supports REST API
    // let result = await this.post({
    //   path: await this.getCommandUrl({
    //     host: this.getToken().fleet_api_base_url,
    //     path: '/api/1/vehicles/'+id+'/command/navigation_gps_request',
    //     api: 'rest'}), // force REST API
    //   json: {
    //     "lat": latitude,
    //     "lon": longitude,
    //     "order": order
    //   }
    // });
    let result = await this.post({
      path: await this.getCommandUrl({
        host: this.getToken().fleet_api_base_url,
        path: '/api/1/vehicles/'+id+'/command/navigation_request',
        api: 'rest'}), // force REST API
      headers: this.getCommandHeaders(),
      json: {
        "type": "share_dest_content_coords",
        "locale": locale,
        "timestamp_ms": time,
        // "value": request
        "value": {
          lat: latitude,
          long: longitude
    // "android.intent.extra.TEXT": request
        }
      }
    });
    await this._checkResult(result);
  }

  async commandNavigationRequest(api, id, {request, locale, time}){
    // This endpoint only supports REST API
    let result = await this.post({
      path: await this.getCommandUrl({
        host: this.getToken().fleet_api_base_url,
        path: '/api/1/vehicles/'+id+'/command/navigation_request',
        api: 'rest'}), // force REST API
      headers: this.getCommandHeaders(),
      json: {
        "type": "share_ext_content_raw",
        "locale": locale,
        "timestamp_ms": time,
        // "value": request
        "value": {
          "android.intent.extra.TEXT": request
        }
      }
    });
    await this._checkResult(result);
  }

  async commandNavigateScRequest(api, id, {sucId, order=1}){
    // This endpoint only supports REST API
    let result = await this.post({
      path: await this.getCommandUrl({
        host: this.getToken().fleet_api_base_url,
        path: '/api/1/vehicles/'+id+'/command/navigation_sc_request',
        api: 'rest'}), // force REST API
      headers: this.getCommandHeaders(),
      json: {
        "id": sucId,
        "order": order
      }
    });
    await this._checkResult(result);
  }

  async commandMediaNextTrack(api, id, {}){
    let result = await this.post({
      path: await this.getCommandUrl({
        host: this.getToken().fleet_api_base_url,
        path: '/api/1/vehicles/'+id+'/command/media_next_track',
        api: api}),
      headers: this.getCommandHeaders(),
      json:{}
    });
    await this._checkResult(result);
  }

  async commandMediaPrevTrack(api, id, {}){
    let result = await this.post({
      path: await this.getCommandUrl({
        host: this.getToken().fleet_api_base_url,
        path: '/api/1/vehicles/'+id+'/command/media_prev_track',
        api: api}),
      headers: this.getCommandHeaders(),
      json:{}
    });
    await this._checkResult(result);
  }

  async commandMediaTogglePlayback(api, id, {}){
    let result = await this.post({
      path: await this.getCommandUrl({
        host: this.getToken().fleet_api_base_url,
        path: '/api/1/vehicles/'+id+'/command/media_toggle_playback',
        api: api}),
      headers: this.getCommandHeaders(),
      json:{}
    });
    await this._checkResult(result);
  }

  async commandMediaAdjustVolume(api, id, {volume}){
    let result = await this.post({
      path: await this.getCommandUrl({
        host: this.getToken().fleet_api_base_url,
        path: '/api/1/vehicles/'+id+'/command/adjust_volume',
        api: api}),
      headers: this.getCommandHeaders(),
      json:{
        volume: volume
      }
    });
    await this._checkResult(result);
  }

  async commandMediaNextFav(api, id, {}){
    let result = await this.post({
      path: await this.getCommandUrl({
        host: this.getToken().fleet_api_base_url,
        path: '/api/1/vehicles/'+id+'/command/media_next_fav',
        api: api}),
      headers: this.getCommandHeaders(),
      json:{}
    });
    await this._checkResult(result);
  }

  async commandMediaPrevFav(api, id, {}){
    let result = await this.post({
      path: await this.getCommandUrl({
        host: this.getToken().fleet_api_base_url,
        path: '/api/1/vehicles/'+id+'/command/media_prev_fav',
        api: api}),
      headers: this.getCommandHeaders(),
      json:{}
    });
    await this._checkResult(result);
  }

  // CHARGING ENDPOINTS =======================================================================================
  async getChargingHistory(id, {startTime}) {  
    let json = {
      id: id,
      sortBy: 'chargeStartDateTime',
      sortOrder: 'DESC'
    };
    if (startTime != undefined){
      json['startTime'] = startTime;
    }

    let result = await this.get({
      path: '/api/1/dx/charging/history',
      json: json
    });
    await this._checkResult(result);
    return result.data;
  }

  async getNearbyChargingSites(id, {count, radius}) {  
    let json = {
      detail: true
    };
    if (count != undefined){
      json['count'] = count;
    }
    if (radius != undefined){
      json['radius'] = radius;
    }

    return await this.get({
      path: this.getToken().fleet_api_base_url+'/api/1/vehicles/'+id+'/nearby_charging_sites',
      query: json
      // json: json
    });
  }

  // ENERGY SITE ENDPOINTS =======================================================================================
  async getProducts() {    
    return await this.get({
      path: this.getToken().fleet_api_base_url + '/api/1/products'
    });
  }

  async getEnergySiteInfo(id) {    
    return await this.get({
      path: this.getToken().fleet_api_base_url + '/api/1/energy_sites/'+id+'/site_info'
    });
  }

  async getEnergySiteLiveStatus(id) {    
    return await this.get({
      path: this.getToken().fleet_api_base_url + '/api/1/energy_sites/'+id+'/live_status'
    });
  }

}