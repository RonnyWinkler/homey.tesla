const TeslaOAuth2Device = require('../../lib/TeslaOAuth2Device');
const Homey = require('homey');
const { CarServer } = require('../../lib/CarServer.js');
const Eckey = require('eckey-utils');
const crypt = require('../../lib/crypt');
// const SlidingWindowLog = require('../../lib/SlidingWindowLog.js');

const CAPABILITY_DEBOUNCE = 500;
const DEFAULT_SYNC_INTERVAL = 1000 * 60 * 10; // 10 min
const WAIT_ON_WAKE_UP = 30; // 20 sec
const RETRY_ON_WAKE_UP = 10; // Retry wakeup every 10 seconds
const RETRY_COUNT = 3; // number of retries sending commands
const RETRY_DELAY = 5; // xx seconds delay between retries sending commands

const CONSTANTS = require('../../lib/constants');

module.exports = class CarDevice extends TeslaOAuth2Device {

  async onOAuth2Init() {
    this.log("onOAuth2Init()");
    await super.onOAuth2Init();

    // Update device
    await this._updateCapabilities();
    await this._updateSettings();
    await this._updateDeviceConfig();
    
    this.registerMultipleCapabilityListener(this.getCapabilities(), async (capabilityValues, capabilityOptions) => {
      // try{
          await this._onCapability( capabilityValues, capabilityOptions);
      // }
      // catch(error){
      //     this.log("_onCapability() Error: ",error.message);
      //     throw error;
      // }
    }, CAPABILITY_DEBOUNCE);

    // Rate limit log
    // this.rateLimitLog = new SlidingWindowLog();

    this._settings = this.getSettings();
    await this._startApiCounterResetTimer();


    try{
      let proxyKey = this.homey.settings.get("private_key");
      let key = Eckey.parsePem(proxyKey);
      this.commandApi = await new CarServer(this.oAuth2Client, this.getData().id, key);
    }
    catch(error){
      this.log("onOAuth2Init() Create CarServerError: ",error.message);
    }

    if (!this.homey.settings.get('client_id') || this.homey.settings.get('client_id') == '' || 
        !this.homey.settings.get('client_secret') || this.homey.settings.get('client_secret') == '') {
      this.log("onOAuth2Init() => Client ID or Client Secret not set.");
      this.setUnavailable(this.homey.__('devices.car.api_client_id_not_set')).catch(this.error);
      // throw new Error(this.homey.__('devices.car.api_client_id_not_set'));
      return;
    }
    else{
      await this.setAvailable();
    }

    await this._startSync();
    this._sync();
  }

  async onOAuth2Uninit(){
    await this._stopSync();
    await this._stopApiCounterResetTimer();
  }

  async onOAuth2Deleted() {
  }

  async onOAuth2Saved() {
    // check if settings are already read. If not, device is not initialized yet after pairing
    if (!this._settings) return;

    this.log("onOAuth2Saved()");
    this._startSync();
    this._sync();
  }

  // Device handling =======================================================================================
  async _updateCapabilities(){
    let capabilities = [];
    try{
      capabilities = this.homey.app.manifest.drivers.filter((e) => {return (e.id == this.driver.id);})[0].capabilities;
      // remove capabilities
      let deviceCapabilities = this.getCapabilities();
      for (let i=0; i<deviceCapabilities.length; i++){
        let filter = capabilities.filter((e) => {return (e == deviceCapabilities[i]);});
        if (filter.length == 0 ){
          try{
            await this.removeCapability(deviceCapabilities[i]);
          }
          catch(error){}
        }
      }
      // add missing capabilities
      for (let i=0; i<capabilities.length; i++){
        if (!this.hasCapability(capabilities[i])){
          try{
            await this.addCapability(capabilities[i]);
          }
          catch(error){}
        }
      }
    }
    catch (error){
      this.error(error.message);
    }
  }

  async _updateSettings(){
    // replace command API (proxy) with tvcp API (direct encrypted commands) 
    let settings = this.getSettings();
    let oldSettings = JSON.parse(JSON.stringify(settings)); // clone settings;
    if (settings['command_api'] == 'command'){
      settings['command_api'] = 'tvcp';
    }
    // remove deprecated settings
    if (settings.api_rate_limit){
      settings.api_rate_limit = null;
    }
    if (settings.api_command_wakes_rate_limit_reset != undefined ){
      settings.api_command_wakes_rate_limit_reset = null;
    }
    if (settings.api_command_wakes_limit != undefined){
      settings.api_command_wakes_limit = null;
    }
    if (settings.api_command_charge_rate_limit_reset != undefined){
      settings.api_command_charge_rate_limit_reset = null;
    }
    if (settings.api_command_charge_limit != undefined){
      settings.api_command_charge_limit = null;
    }
    if (settings.api_command_charge_count != undefined){
      settings.api_command_charge_count = null;
    }
    if (settings.api_command_charge_state != undefined){
      settings.api_command_charge_state = null;
    }
    if (settings.api_command_rate_limit_reset != undefined){
      settings.api_command_rate_limit_reset = null;
    }
    if (settings.api_command_limit != undefined){
      settings.api_command_limit = null;
    }
    if (settings.api_rate_limit_limit != undefined){
      settings.api_rate_limit_limit = null;
    }
    if (settings.api_rate_limit_reset != undefined){
      settings.api_rate_limit_reset = null;
    }
    if (settings.api_request_limit != undefined){
      settings.api_request_limit = null;
    }

    if (JSON.stringify(settings) != JSON.stringify(oldSettings)){
      await this.setSettings(settings);
    }
  }

  async _updateDeviceConfig(){
    // update device class
    if (this.getClass() != 'car'){
      await this.setClass('car');  
    }
  }

  async handleApiOk(type = CONSTANTS.API_ERROR_READ){
    try{
      switch (type){
        case CONSTANTS.API_ERROR_READ:
          await this.setSettings({ api_state: 'OK' });
          break;
        case CONSTANTS.API_ERROR_COMMAND:
          await this.setSettings({ api_command_state: 'OK' });
          break;
      }
      let oldState = this.getCapabilityValue('alarm_api_error');
      await this.setCapabilityValue('api_error', null);
      await this.setCapabilityValue('alarm_api_error', false);
      if (oldState != false){
        await this.homey.flow.getDeviceTriggerCard('alarm_api_error_off').trigger(this);
      }
    }
    catch(error){
      this.log(error);
    }
  }

  async handleApiError(error, type = CONSTANTS.API_ERROR_READ){
    try{
      let apiState = 'Error';
      switch (error.constructor.name){
        case 'FetchError':
          this.log("API Error: "+ error.type);
          apiState = error.type;
          break;
        // case 'Error':
        //   if (error.status != undefined && error.statusText != undefined){
        //     this.log("API Error: "+ error.status + ' ' + error.statusText);
        //   }
        //   else{
        //     this.log("API Error: "+ error.message);
        //   }
        //   break;
        default:
          this.log("API Error: "+ error.message);
          apiState = error.message;
      }
      switch (type){
        case CONSTANTS.API_ERROR_READ:
          await this.setSettings({ api_state: apiState });
          break;
        case CONSTANTS.API_ERROR_COMMAND:
          await this.setSettings({ api_command_state: apiState });
          break;
      }
      let oldState = this.getCapabilityValue('alarm_api_error');
      await this.setCapabilityValue('api_error', apiState);
      await this.setCapabilityValue('alarm_api_error', true);
      if (oldState != true){
        let tokens = {
          error: apiState
        };
        await this.homey.flow.getDeviceTriggerCard('alarm_api_error_on').trigger(this, tokens);
      }
      // // Add readable message for http-426 (update required)
      // if (error.status == 426 || error.status == 412){
      //   error.message = 'App update required. Please update the app in the Homey app store or enable automatic updates.';
      // }
    }
    catch(error){
      this.log(error);
    }
  }

  isPollingLocationActive(){
    let result = false;
    let device = this.homey.drivers.getDriver('location').getDevices().filter(e=>{ return ( e.getData().id == this.getData().id ) })[0];
    if (device != undefined){
      result = true;
    }

    return result;
  }

  getLocationDevice(){
    let device = this.homey.drivers.getDriver('location').getDevices().filter(e=>{ return ( e.getData().id == this.getData().id ) })[0];
    if (device == undefined){
      throw new Error('No location device found.');
    }
    return device; 
  }

  // SETTINGS =======================================================================================

  async onSettings({ oldSettings, newSettings, changedKeys }) {
    this.log(`[Device] ${this.getName()}: settings where changed: ${changedKeys}`);
    this._settings = newSettings;

    if (changedKeys['api_costs_unit']){
      this.setCapabilityOptions('measure_api_costs', { unit: newSettings['api_costs_unit'] });
    }

    this.homey.setTimeout(async() => {
      await this._calculateApiCosts();
      this._startSync();
      this._sync();
      }, 1000);
  }

  getCommandApi(){
    return this._settings.command_api;
  }

  // API statistics =======================================================================================
  async _countApiRequest(type = CONSTANTS.API_REQUEST_COUNTER_READ){
    let counter = 0;
    switch (type){
      case CONSTANTS.API_REQUEST_COUNTER_READ:
        counter = this.getCapabilityValue('measure_api_request_count');
        break;
      case CONSTANTS.API_REQUEST_COUNTER_COMMAND:
        counter = this.getCapabilityValue('measure_api_command_count');
        break;
      case CONSTANTS.API_REQUEST_COUNTER_COMMAND_WAKES:
        counter = this.getCapabilityValue('measure_api_command_wakes_count');
        break;
    }

    if (!counter){
      counter = 0;
    }
    counter = counter + 1;
    this.log("API counter: type: " + type + " conter: " + counter);

    // Update counter
    switch (type){
      case CONSTANTS.API_REQUEST_COUNTER_READ:
        await this.setCapabilityValue('measure_api_request_count', counter);
        await this.setSettings({ api_request_count: counter.toString() });
        break;
      case CONSTANTS.API_REQUEST_COUNTER_COMMAND:
        await this.setCapabilityValue('measure_api_command_count', counter);
        await this.setSettings({ api_command_count: counter.toString() });
        break;
      case CONSTANTS.API_REQUEST_COUNTER_COMMAND_WAKES:
        await this.setCapabilityValue('measure_api_command_wakes_count', counter);
        await this.setSettings({ api_command_wakes_count: counter.toString() });
        break;
    }

    await this._calculateApiCosts();

    // this.log("API counter updated.");
  }

  async _calculateApiCosts(){
    // Calculate costs
    let costs = 0;
    let costsData, costsCommands, costsWakes;
    try{
      if (this.getSetting('api_costs_data') > 0){
        costsData = this.getCapabilityValue('measure_api_request_count') / this.getSetting('api_costs_data');  
      }
      else{
        costsData = 0;
      }
      if (this.getSetting('api_costs_commands') > 0){
        costsCommands = this.getCapabilityValue('measure_api_command_count') / this.getSetting('api_costs_commands');
      }
      else{
        costsCommands = 0;
      }
      if (this.getSetting('api_costs_wakes') > 0){
        costsWakes = this.getCapabilityValue('measure_api_command_wakes_count') / this.getSetting('api_costs_wakes');
      }
      else{
        costsWakes = 0;
      }
      costs = costsData + costsCommands + costsWakes;
    }
    catch(error){
      costs = 0;
    }

    costs = Math.round(costs * 100) / 100;

    if (this.hasCapability('measure_api_costs')){
      await this.setCapabilityValue('measure_api_costs', costs);
    }
    await this.setSettings({ api_costs: costs.toString() + " " + this.getSetting('api_costs_unit') });
  }

  async _startApiCounterResetTimer(){
    await this._stopApiCounterResetTimer();

    // Reset every day at 0:00
    // let d;
    // try{
    //   // reset al local 0:00 h
    //   d = this._getLocalTime();
    // }
    // catch (error){
    //   // reset at 0:00 UTC
    //   d = new Date();      
    // }
    // let h = d.getHours();
    // let m = d.getMinutes();
    // let s = d.getSeconds();
    // let interval = (24*60*60) - (h*60*60) - (m*60) - s;
    // this.log("_startApiCounterResetTimer(): "+ d + " h:mm:ss: "+ h+":"+m+":"+s + " interval: "+interval);
    // this._apiCounterResetInterval = this.homey.setTimeout(() => this._resetApiCounter(), interval * 1000);

    // Reset every 1st of new month at 0:00
    let now;
    try{
      // reset al local 0:00 h
      now = this._getLocalTime();
    }
    catch (error){
      // reset at 0:00 UTC
      now = new Date();      
    }
    let nextMonth = new Date(now.getFullYear(), now.getMonth()+1, 1);
    let interval = nextMonth - now;
    this.log("_startApiCounterResetTimer(): "+ nextMonth + " interval: "+interval);
    if (interval < 2147483647){
      this._apiCounterResetInterval = this.homey.setTimeout(() => this._resetApiCounter(), interval);
    }
    else{
      // timer > signed int32: Try again in 24h
      this.log("_startApiCounterResetTimer(): Timeout too big. Try again in 24h.");
      this.homey.setTimeout(() => this._startApiCounterResetTimer(), 86400*1000);
    }
  }

  async _stopApiCounterResetTimer(){
    if (this._apiCounterResetInterval) {
      this.homey.clearTimeout(this._apiCounterResetInterval);
    }
  }

  async _resetApiCounter(){ 
    if (this.hasCapability('measure_api_request_count')){
      await this.setCapabilityValue('measure_api_request_count', 0);
    }
    await this.setSettings({ api_request_count: '0' });
    if (this.hasCapability('measure_api_command_count')){
      await this.setCapabilityValue('measure_api_command_count', 0);
    }
    await this.setSettings({ api_command_count: '0' });
    if (this.hasCapability('measure_api_command_wakes_count')){
      await this.setCapabilityValue('measure_api_command_wakes_count', 0);
    }
    await this.setSettings({ api_command_wakes_count: '0' });
    if (this.hasCapability('measure_api_costs')){
      await this.setCapabilityValue('measure_api_costs', 0);
    }
    await this.setSettings({ api_costs: '0' });
    // Start new timer
    await this._startApiCounterResetTimer();
  }

  // SYNC Logic =======================================================================================
  async _startSync(){
    await this._stopSync();
    if (!this._settings || !this._settings.polling_active){
      return;
    }
    // Interval settings is in minutes, convert to milliseconds.
    let interval = DEFAULT_SYNC_INTERVAL;
    if (!this.isAsleep()){
      if (this._settings.polling_interval_online > 0){
        interval = this._settings.polling_interval_online * 1000;
      }
      if (this._settings.polling_unit_online == 'min'){
        interval = interval * 60;
      }
      this.log(`[Device] ${this.getName()}: Start ONLINE Poll interval: ${interval} msec.`);
    }
    else{
      if (this._settings.polling_interval_offline > 0){
        interval = this._settings.polling_interval_offline * 1000;
      }
      if (this._settings.polling_unit_offline == 'min'){
        interval = interval * 60;
      }
      this.log(`[Device] ${this.getName()}: Start OFFLINE Poll interval: ${interval} msec.`);
    }

    this._syncInterval = this.homey.setInterval(() => this._sync(), interval);
    // this._sync();

    // read app registry state
    await this.isAppRegistered();
  }

  async _stopSync(){
    if (this._syncInterval) {
      this.homey.clearInterval(this._syncInterval);
      this._syncInterval = undefined;
    }
  }

  // SYNC =======================================================================================
  async _sync() {
    this.log("Car sync...");
    try{    
      // update the device
      await this.getCarData();
      await this.handleApiOk();
      await this.setAvailable();
      this.log("Car sync done.");

      // Update rate limit state
      // this.rateLimitLog.refresh();
      // await this.setSettings({
      //   api_rate_limit: this.rateLimitLog.getState() + ' %'
      // });
      // if (this.hasCapability('measure_api_rate_limit')){
      //   this.setCapabilityValue('measure_api_rate_limit', this.rateLimitLog.getState());
      // }

    }
    catch(error){
      this.log("Device update error (getState): ID: "+this.getData().id+" Name: "+this.getName()+" Error: "+error.message);

      this.setUnavailable(error.message).catch(this.error);
      await this.handleApiError(error);
    };
  }

  async getCarState(){
    let vehicle = await this.oAuth2Client.getVehicle(this.getData().id);
    this.log("Car state: ", vehicle.state);
    return vehicle.state;
  }

  // Read car data. Car must be awake.
  async getCarData(){
    // Get car state
    let oldState = this.getCapabilityValue('car_state');

    // get buffered car state
    let vehicle = await this.oAuth2Client.getVehicle(this.getData().id);
    this.log("Car state: ", vehicle.state); 

    // Workaround for missing asleep state since Softwware 2024.14.x
    // if (vehicle.state == CONSTANTS.STATE_ASLEEP){
    if (vehicle.state != CONSTANTS.STATE_ONLINE){

      await this.setCapabilityValue('car_state', vehicle.state);
      await this.setDeviceState(false);
      let time = this._getLocalTimeString(new Date());
      await this.setCapabilityValue('last_update', time);
      // From asleep to online/offline or back?
      // Change Sync only if state changed from online/offline to asleep or from asleep to online/offline

      // Workaround for missing asleep state since Softwware 2024.14.x
      // if ( oldState != CONSTANTS.STATE_ASLEEP ){
      if ( oldState == CONSTANTS.STATE_ONLINE ){
        this._startSync();
      }
      return vehicle;
    }

    // car data
    let query = ['charge_state', 'climate_state', 'closures_state', 'drive_state', 'gui_settings', 'vehicle_config', 'vehicle_state'];
    // if (this._settings.polling_location){
    if (this.isPollingLocationActive()){
      query.push('location_data');
    }
    let data = {};
    try{
      // Count API statistics
      await this._countApiRequest( CONSTANTS.API_REQUEST_COUNTER_READ );
      // Get car data
      data = await this.oAuth2Client.getVehicleData(this.getData().id, query);

      this.log("Car data request state: ", data.state);
      // Update car state to ONLINE if request was successful
      await this.setCapabilityValue('car_state', data.state);
      await this.setDeviceState(true);

      let time = this._getLocalTimeString(new Date());
      await this.setCapabilityValue('last_update', time);
      if (oldState != CONSTANTS.STATE_ONLINE){
        // From asleep to online?
        // Change Sync only is asleep state is changed to continue short interval check is car is temporary offline
        this._startSync();
      }

      await this._updateDevice(data);
      return data;
    }
    catch(error){
      // Check for "Offline" errors (408)
      // Set car state to "offline"
      // Forward all other errors
      if (error.status && ( error.status == 408 || error.status == 429 ) ){
        this.log("Car data request error: ", error.status);
        this.log("Error details: ", error)
        let oldState = this.getCapabilityValue('car_state');

        if (error.status == 408){
          await this.setCapabilityValue('car_state', CONSTANTS.STATE_OFFLINE);
        }
        if (error.status == 429){
          await this.setCapabilityValue('car_state', CONSTANTS.STATE_RATE_LIMIT);
        }
        await this.setDeviceState(false);
        let time = this._getLocalTimeString(new Date());
        await this.setCapabilityValue('last_update', time);
        // state change from asleep to offline => Start new sync interval
        if (oldState == CONSTANTS.STATE_ONLINE){
          // From asleep to offline?
          // Change Sync only is asleep state is changed to continue short interval check is car is temporary offline
          this._startSync();
        }
        return {};
      }
      else{
        throw error;
      }
    }
  }

  async _updateDevice(data){
    this.log("Update device data...");

    // last online timestamp
    if (this.hasCapability('last_online') && data != undefined){
      let time = this._getLocalTimeString(new Date());
      await this.setCapabilityValue('last_online', time);
    }

    // Car state
    if (this.hasCapability('car_doors_locked') && data.vehicle_state.locked != undefined){
      await this.setCapabilityValue('car_doors_locked', !data.vehicle_state.locked);
    }
    if (this.hasCapability('car_sentry_mode') && data.vehicle_state.sentry_mode != undefined){
      await this.setCapabilityValue('car_sentry_mode', data.vehicle_state.sentry_mode);
    }

    // User prersent?
    if (this.hasCapability('car_user_present') && data.vehicle_state.is_user_present != undefined){
      await this.setCapabilityValue('car_user_present', data.vehicle_state.is_user_present);
    }

    // Battery
    if (this.hasCapability('measure_battery') && data.charge_state && data.charge_state.battery_level != undefined){
      await this.setCapabilityValue('measure_battery', data.charge_state.battery_level);
    }

    // Meter Odo
    if (this.hasCapability('meter_car_odo') && data.vehicle_state && data.vehicle_state.odometer != undefined){
      await this.setCapabilityValue('meter_car_odo', data.gui_settings.gui_distance_units == 'km/hr' ? data.vehicle_state.odometer * CONSTANTS.MILES_TO_KM : data.vehicle_state.odometer);
      // Capability units
      let co = {};
      try{
        co = this.getCapabilityOptions("meter_car_odo");
      }
      catch(error){}
      let distUnit = data.gui_settings.gui_distance_units == 'km/hr' ? 'km' : 'mi';
      if (!co || !co.units || co.units != distUnit){
        co['units'] = distUnit;
        this.setCapabilityOptions('meter_car_odo', co);
      }
    }

    // Drive state
    if (this.hasCapability('car_shift_state') && data.drive_state && (data.drive_state.shift_state != undefined || data.drive_state.shift_state == null)){
      let previousShiftState = this.getCapabilityValue('car_shift_state');
      if (data.drive_state.shift_state == null || data.drive_state.shift_state == 'P'){
        await this.setCapabilityValue('car_shift_state', 'P');
      }
      else{
        await this.setCapabilityValue('car_shift_state', data.drive_state.shift_state);
      }

      // add driving history to location device if driving state has changed
      let shiftState = this.getCapabilityValue('car_shift_state');
      if (previousShiftState != shiftState
          &&
        (
          previousShiftState == 'P' && shiftState != 'P'
          ||
          previousShiftState != 'P' && shiftState == 'P'
        )){
        try{
          this.getLocationDevice().addDrivingHistory(data);
        }
        catch(error){ }
      }

      // states:
      // R
      // D
      // null = P
    }
    if (this.hasCapability('measure_car_drive_speed') && data.drive_state && ( data.drive_state.speed != undefined || data.drive_state.speed == null)){
      let speed = data.drive_state.speed == null ? 0 : data.drive_state.speed;
      await this.setCapabilityValue('measure_car_drive_speed', Math.round( data.gui_settings.gui_distance_units == 'km/hr' ? speed * CONSTANTS.MILES_TO_KM :  speed ) );
      // Capability units
      let co = {};
      try{
        co = this.getCapabilityOptions("measure_car_drive_speed");
      }
      catch(error){}
      let speedUnit = data.gui_settings.gui_distance_units == 'km/hr' ? 'km/h' : 'mi/h';
      if (!co || !co.units || co.units != speedUnit){
        co['units'] = speedUnit;
        this.setCapabilityOptions('measure_car_drive_speed', co);
      }
    }

    // Tires/TPMS
    if (this.hasCapability('measure_car_tpms_pressure_fl') && data.vehicle_state && data.vehicle_state.tpms_pressure_fl != undefined){
      await this.setCapabilityValue('measure_car_tpms_pressure_fl', data.gui_settings.gui_tirepressure_units == 'Bar'? data.vehicle_state.tpms_pressure_fl : data.vehicle_state.tpms_pressure_fl * 14,5038);
      // Capability units
      let co = {};
      try{
        co = this.getCapabilityOptions("measure_car_tpms_pressure_fl");
      }
      catch(error){}
      if (!co || !co.units || co.units != data.gui_settings.gui_tirepressure_units){
        co['units'] = data.gui_settings.gui_tirepressure_units;
        this.setCapabilityOptions('measure_car_tpms_pressure_fl', co);
      }
    }
    if (this.hasCapability('measure_car_tpms_pressure_fr') && data.vehicle_state && data.vehicle_state.tpms_pressure_fr != undefined){
      await this.setCapabilityValue('measure_car_tpms_pressure_fr', data.gui_settings.gui_tirepressure_units == 'Bar'? data.vehicle_state.tpms_pressure_fr : data.vehicle_state.tpms_pressure_fr * 14,5038);
      // Capability units
      let co = {};
      try{
        co = this.getCapabilityOptions("measure_car_tpms_pressure_fr");
      }
      catch(error){}
      if (!co || !co.units || co.units != data.gui_settings.gui_tirepressure_units){
        co['units'] = data.gui_settings.gui_tirepressure_units;
        this.setCapabilityOptions('measure_car_tpms_pressure_fr', co);
      }
    }
    if (this.hasCapability('measure_car_tpms_pressure_rl') && data.vehicle_state && data.vehicle_state.tpms_pressure_rl != undefined){
      await this.setCapabilityValue('measure_car_tpms_pressure_rl', data.gui_settings.gui_tirepressure_units == 'Bar'? data.vehicle_state.tpms_pressure_rl : data.vehicle_state.tpms_pressure_rl * 14,5038);
      // Capability units
      let co = {};
      try{
        co = this.getCapabilityOptions("measure_car_tpms_pressure_rl");
      }
      catch(error){}
      if (!co || !co.units || co.units != data.gui_settings.gui_tirepressure_units){
        co['units'] = data.gui_settings.gui_tirepressure_units;
        this.setCapabilityOptions('measure_car_tpms_pressure_rl', co);
      }
    }
    if (this.hasCapability('measure_car_tpms_pressure_rr') && data.vehicle_state && data.vehicle_state.tpms_pressure_rr != undefined){
      await this.setCapabilityValue('measure_car_tpms_pressure_rr', data.gui_settings.gui_tirepressure_units == 'Bar'? data.vehicle_state.tpms_pressure_rr : data.vehicle_state.tpms_pressure_rr * 14,5038);
      // Capability units
      let co = {};
      try{
        co = this.getCapabilityOptions("measure_car_tpms_pressure_rr");
      }
      catch(error){}
      if (!co || !co.units || co.units != data.gui_settings.gui_tirepressure_units){
        co['units'] = data.gui_settings.gui_tirepressure_units;
        this.setCapabilityOptions('measure_car_tpms_pressure_rr', co);
      }
    }

    // Trunk
    if (this.hasCapability('car_trunk_front') && data.vehicle_state && data.vehicle_state.ft != undefined){
      //ft==0: closed
      await this.setCapabilityValue('car_trunk_front', data.vehicle_state.ft != 0);
    }
    if (this.hasCapability('car_trunk_rear') && data.vehicle_state && data.vehicle_state.rt != undefined){
      //rt==0: closed
      await this.setCapabilityValue('car_trunk_rear', data.vehicle_state.rt != 0);
    }

    // Software
    if (this.hasCapability('car_software_version') && data.vehicle_state && data.vehicle_state.car_version != undefined){
      await this.setCapabilityValue('car_software_version', data.vehicle_state.car_version.split(' ')[0]);
    }
    if (this.hasCapability('car_software_update_version') && data.vehicle_state && data.vehicle_state.software_update && data.vehicle_state.software_update.version != undefined){
      await this.setCapabilityValue('car_software_update_version', data.vehicle_state.software_update.version);
    }

    if (this.hasCapability('car_software_update_state') && data.vehicle_state && data.vehicle_state.software_update && data.vehicle_state.software_update.status != undefined){
      if (  this.getCapabilityValue('car_software_update_state') != data.vehicle_state.software_update.status &&
            data.vehicle_state.software_update.status == 'available'){
        // Trigger software available flow
        let tokens = {
          car_software_update_state: data.vehicle_state.software_update.status,
          car_software_version: data.vehicle_state.car_version.split(' ')[0],
          car_software_update_version: data.vehicle_state.software_update.version
        }
        await this.homey.flow.getDeviceTriggerCard('car_software_update_available').trigger(this, tokens);
      }

      await this.setCapabilityValue('car_software_update_state', data.vehicle_state.software_update.status);
      // Possible states:
      // available
      // scheduled
      // installing
      // downloading
      // downloading_wifi_wait
    }

    // Update child devices
    let batteryDevice = this.homey.drivers.getDriver('battery').getDevices().filter(e => {return (e.getData().id == this.getData().id)})[0];
    if (batteryDevice){
      this.log("Update battery device...");
      await batteryDevice.updateDevice(data);
    }
    let climateDevice = this.homey.drivers.getDriver('climate').getDevices().filter(e => {return (e.getData().id == this.getData().id)})[0];
    if (climateDevice){
      this.log("Update climate device...");
      await climateDevice.updateDevice(data);
    }
    let locationDevice = this.homey.drivers.getDriver('location').getDevices().filter(e => {return (e.getData().id == this.getData().id)})[0];
    if (locationDevice){
      this.log("Update location device...");
      await locationDevice.updateDevice(data);
    }
    let mediaDevice = this.homey.drivers.getDriver('media').getDevices().filter(e => {return (e.getData().id == this.getData().id)})[0];
    if (mediaDevice){
      this.log("Update media device...");
      await mediaDevice.updateDevice(data);
    }

    // Realtime event - Widget update
    this.log("Update widgets (realtime event)...");
    await this.homey.api.realtime("car_data_changed", {id: this.getData().id} );

  }

  // State checks =======================================================================================

  isOnline(){
    if (this.getCapabilityValue('car_state') == CONSTANTS.STATE_ONLINE){
      return true;
    }
    else{
      return false;
    }
  }

  isAsleep(){
    if (this.getCapabilityValue('car_state') != CONSTANTS.STATE_ONLINE){
      return true;
    }
    else{
      return false;
    }
  }

  // Set device tile state. true=online, false=asleep/offline
  async setDeviceState(state){
    try{
      await this.setCapabilityValue('device_state_insights', state);

      // Update child devices
      let batteryDevice = this.homey.drivers.getDriver('battery').getDevices().filter(e => {return (e.getData().id == this.getData().id)})[0];
      if (batteryDevice){
        await batteryDevice.setCapabilityValue('device_state', state);
      }
      let climateDevice = this.homey.drivers.getDriver('climate').getDevices().filter(e => {return (e.getData().id == this.getData().id)})[0];
      if (climateDevice){
        await climateDevice.setCapabilityValue('device_state', state);
      }
      let locationDevice = this.homey.drivers.getDriver('location').getDevices().filter(e => {return (e.getData().id == this.getData().id)})[0];
      if (locationDevice){
        await locationDevice.setCapabilityValue('device_state', state);
      }
      let mediaDevice = this.homey.drivers.getDriver('media').getDevices().filter(e => {return (e.getData().id == this.getData().id)})[0];
      if (mediaDevice){
        await mediaDevice.setCapabilityValue('device_state', state);
        if (!state){
          await mediaDevice.setCapabilityValue('speaker_playing', false);
        }
      }
    }
    catch(error){
      this.log("setDeviceState error: ",error.message);
    }

  }

  async isAppRegistered(){
    // Get car app registry state
    try{
      let carRegistry = await this.oAuth2Client.getVehicleAppRegistry(this.getData().id);
      this.log("Car/app registry state: ", carRegistry);
      if (carRegistry.key_paired_vins.length > 0){
        await this.setSettings({ command_pair_state: this.homey.__('devices.car.command_pair_state_paired') }); 
        return true;
      }
      else{
        await this.setSettings({ command_pair_state: this.homey.__('devices.car.command_pair_state_unpaired') });
        return false;
      }
    }
    catch(error){
      try{
        await this.setSettings({ command_pair_state: this.homey.__('devices.car.command_pair_state_undefined') });
      }
      catch(error){}
      return true;
    }
  }

  // API Requests ===================================================================================
  async getRequest(apiFunction, params){
    this.log("Send REST request: API function: "+apiFunction+"; Parameter: ",params);
    let result = await this.oAuth2Client[apiFunction](this.getData().id, params);
    this.log("Send REST request: Success");
    return result;
  }

  // Commands =======================================================================================
  async _wakeUp(wait=true){
    this.log("Wake up the car...");
    let state = await this.getCarState();
    if (state == CONSTANTS.STATE_ONLINE){
      this.log("Car is already online.");
      return state;
    }
    // await this.oAuth2Client.commandWakeUp(this.getData().id);
    await this._sendCommand( 'commandWakeUp', {} );
    if (wait){
      let state;
      for (let i=0; i<WAIT_ON_WAKE_UP; i++){
        this.log("Wake up the car...Online-Check "+i);
        await this._wait();
        state = await this.getCarState();
        if (state == CONSTANTS.STATE_ONLINE){
          this.log("Wake up the car...Car is online now");
          // automatically sync data after wake up
          await this._sync()
          return state;
        }
        // Send wake up call again every 10 seconds
        if ( ((i+1) % RETRY_ON_WAKE_UP) == 0 ){
          this.log("Wake up the car again...");
          // await this.oAuth2Client.commandWakeUp(this.getData().id);
          await this._sendCommand( 'commandWakeUp', {} );
        }
      }
    }
    else{
      // return state retrieved by first check (without waiting for result)
      return state;
    }
    this.log("Wake up the car...Car is not online yet.");
    let error = new Error("Waking up the vehicle was not successful.");
    await this.handleApiError(error);
    throw error;
  }

  async wakeUpIfNeeded(){
    if (this.getSetting('command_wake_up')){
      // return state retrieved by wakeUp()
      return await this._wakeUp(true);
    }
    else{
      // return undefined as car state (not)
      return undefined;
    }
  }

  getCommandType(apiFunction){
    switch (apiFunction) {
      case 'commandWakeUp':
        return CONSTANTS.API_COMMAND_TYPE_COMMAND_WAKES;
      default:
        return CONSTANTS.API_COMMAND_TYPE_COMMAND;
    }
  }

  async sendCommand(apiFunction, params){
    try{
      // try{
      //   this.rateLimitLog.add();
      //   this.log("RateLimit: "+this.rateLimitLog.getState()+"%");
      //   await this.setSettings({
      //     api_rate_limit: this.rateLimitLog.getState() + ' %'
      //   });
      //   if (this.hasCapability('measure_api_rate_limit')){
      //     this.setCapabilityValue('measure_api_rate_limit', this.rateLimitLog.getState());
      //   }
      // }
      // catch(error){
      //   this.log("RateLimit exeeded: "+this.rateLimitLog.getState()+"%");
      //   await this.setSettings({
      //     api_rate_limit: this.rateLimitLog.getState() + ' %'
      //   });
      //   if (this.hasCapability('measure_api_rate_limit')){
      //     this.setCapabilityValue('measure_api_rate_limit', this.rateLimitLog.getState());
      //   }
      //   throw error;
      // }

      // Wake up the car if needed
      let state = await this.wakeUpIfNeeded();
      // If wakeUp is processed, the car state is returned. If not, "undefined" is returned.
      // Check online state if not already done.
      if ( state == undefined){
        state = await this.getCarState();
      }
      if (state != CONSTANTS.STATE_ONLINE){
        throw new Error("Car is offline. Sending commands is not possible.");
      }

      let retryCount = 0;
      if (this._settings.command_retry){
        retryCount = RETRY_COUNT - 1;
      }
      for (let i=0; i<=retryCount; i++){
        try{
          await this._sendCommand(apiFunction, params);
          await this.handleApiOk(CONSTANTS.API_ERROR_COMMAND);
          // Get new states after command execution
          // await this._sync();
        }
        catch(error){
          if (i==retryCount){
            this.log("sendCommand() error: ",error.message);
            throw error;
          }
          else{
            this.log("Retry in "+RETRY_DELAY+" sec...");
            await this._wait(RETRY_DELAY * 1000);
          }
        }
      }
    }
    catch(error){
      await this.handleApiError(error, CONSTANTS.API_ERROR_COMMAND);

      // if (error.status == 429){
      //   // set API state in device settings
      //   let settings = {};
      //   settings['api_command_state'] = error.statusText;
      //   await this.setSettings( settings );
      // }

      throw error;
    }
  }

  async _sendCommand(apiFunction, params){
    // Use direct Command Protocol?
    if (  this.getCommandApi() == CONSTANTS.COMMAND_API_CMD 
          &&
          // Endpoints that will only work with REST API: 
          apiFunction != 'commandNavigateGpsRequest' &&
          apiFunction != 'commandNavigationRequest' &&
          apiFunction != 'commandNavigateScRequest' &&
          apiFunction != 'commandTrunk' &&

          // apiFunction != 'commandMediaNextTrack' &&
          // apiFunction != 'commandMediaPrevTrack' &&
          // apiFunction != 'commandMediaTogglePlayback' && 

          apiFunction != 'commandWakeUp'
        ){
      if (!await this.isAppRegistered()){
        try{
          await this.homey.notifications.createNotification({excerpt: this.homey.__("devices.car.app_not_registered")});
        }
        catch(error){
          this.log('Error sending notification: '+error.message)
        }
        throw new Error(this.homey.__("devices.car.app_not_registered"));
      }
      await this._sendSignedCommand(apiFunction, params);
    }
    else{
      if (apiFunction == 'ping'){
        throw new Error("Command "+apiFunction+" not supported for REST or Proxy API.");
      }
      if ( this.getCommandApi() == CONSTANTS.COMMAND_API_PROXY && !await this.isAppRegistered()){
        throw new Error(this.homey.__("devices.car.app_not_registered"));
      }
      this.log("Send REST command: API: "+this.getCommandApi()+"; API function: "+apiFunction+"; Parameter: ",params);
      switch (this.getCommandType(apiFunction)) {
        case CONSTANTS.API_COMMAND_TYPE_COMMAND_WAKES:
          await this._countApiRequest( CONSTANTS.API_REQUEST_COUNTER_COMMAND_WAKES );
          break;
        default:
          await this._countApiRequest( CONSTANTS.API_REQUEST_COUNTER_COMMAND );
      }
      // await this._countApiRequest( CONSTANTS.API_REQUEST_COUNTER_COMMAND );
      let result = await this.oAuth2Client[apiFunction](this.getCommandApi(), this.getData().id, params);
      this.log("Send REST command: Success API: "+this.getCommandApi());
      return result;
    }
  }

  async _sendSignedCommand(apiFunction, apiParams){
    if (!this.commandApi){
      throw new Error("Command API is only for test purposes.");
    }
    let {command, params, domain} = this._getSignedCommand(apiFunction, apiParams);
    this.log("Send signed command: API function: "+apiFunction+"; Command: "+command+"; Parameter: ",params);
    switch (this.getCommandType(apiFunction)) {
      case CONSTANTS.API_COMMAND_TYPE_COMMAND_WAKES:
        await this._countApiRequest( CONSTANTS.API_REQUEST_COUNTER_COMMAND_WAKES );
        break;
      default:
        await this._countApiRequest( CONSTANTS.API_REQUEST_COUNTER_COMMAND );
    }
    try{
      await this.commandApi.sendSignedCommand(command, params, domain);
    }
    catch(error){
      if (CONSTANTS.API_ERRORS_WHITELIST.indexOf(error.message) > -1){
        // If error message is a value in whitelits, the ignore the error!
        this.log("Send signed command: Success API function: "+apiFunction+"; Command: "+command+"; Whitelist error: "+error.message);
        return;
      }
      this.log("Send signed command: Error: "+error.message);
      throw error;
    }
    this.log("Send signed command: Success API function: "+apiFunction+"; Command: "+command);
  }

  _getSignedCommand(apiFunction, params){
    let result = {
      command: null,
      params: {}
    };
    switch (apiFunction) {
      // car actions
      case 'ping':
        result.command = 'ping';
        result.params = { };
        break;

      case 'commandDoorLock':
        result.domain = CONSTANTS.DOMAIN_VEHICLE_SECURITY;
        result.command = 'RKEAction';
        result.params = params.locked? 1 : 0; //0 = unlock, 1=lock
        break;

      case 'commandTrunkFront':
        result.domain = CONSTANTS.DOMAIN_VEHICLE_SECURITY;
        // Front trunk can only be opened
        result.command = 'closureMoveRequest';
        result.params = { frontTrunk: 3};
        break;

      case 'commandTrunkRear':
        // CLOSURE_MOVE_TYPE_NONE = 0;
        // CLOSURE_MOVE_TYPE_MOVE = 1;
        // CLOSURE_MOVE_TYPE_STOP = 2;
        // CLOSURE_MOVE_TYPE_OPEN = 3;
        // CLOSURE_MOVE_TYPE_CLOSE = 4;
        result.domain = CONSTANTS.DOMAIN_VEHICLE_SECURITY;
        // Front trunk can only be opened
        result.command = 'closureMoveRequest';
        if (params.action == 'open'){
          result.params = { rearTrunk: 3};
        }
        else if (params.action == 'close'){
          result.params = { rearTrunk: 4};
        }
        else{
          throw new Error("Trunk action not set");
        }
        break;
  
      case 'commandSentryMode':
        result.command = 'vehicleControlSetSentryModeAction';
        result.params = { on: params.state};
        break;

      case 'commandFlashLights':
        result.command = 'vehicleControlFlashLightsAction';
        result.params = {};
        break;
  
      case 'commandHonkHorn':
        result.command = 'vehicleControlHonkHornAction';
        result.params = {};
        break;
  
      case 'commandWindowPosition':       // car and climate
        result.command = 'vehicleControlWindowAction';
        if (params.position == 'vent'){
          result.params = { vent : {}};
        }
        else{
          result.params = { close : {}};
        }
        break;

      case 'commandScheduleSoftwareUpdate':
        result.command = 'vehicleControlScheduleSoftwareUpdateAction';
        result.params = { offsetSec: params.minutes * 60};
        break;
  
      // charging actions
      case 'commandChargeLimit':
        result.command = 'chargingSetLimitAction';
        result.params = { percent: params.limit};
        break;

      case 'commandChargeCurrent':
        result.command = 'setChargingAmpsAction';
        result.params = { chargingAmps : params.current};
        break;
  
      case 'commandChargePort':
        if (params.state){
          result.command = 'chargePortDoorOpen';
        }
        else{
          result.command = 'chargePortDoorClose';
        }
        result.params = { };
        break;

      case 'commandChargeOn':
        if (params.state){
          result.command = 'chargingStartStopAction';
          result.params = { start: true };
        }
        else{
          result.command = 'chargingStartStopAction';
          result.params = { stop: true };
        }
        break;

      case 'commandScheduleCharging':
        result.command = 'scheduledChargingAction';
        result.params = { 
          enabled: params.action == 'on' ? true : false,
          chargingTime : (params.hh * 60 + params.mm)
        };
        break;

      case 'commandDeactivateScheduledCharging':
        // deprecated, commandScheduleCharging with [action] should be used
        result.command = 'scheduledChargingAction';
        result.params = { 
          enabled: false,
          chargingTime : 0
        };
        break;
  
      case 'commandScheduleDeparture':
        result.command = 'scheduledDepartureAction';
        result.params = { 
          enabled: params.action == 'on' ? true : false,
          departureTime: (params.hh * 60 + params.mm),
          offPeakHoursEndTime: (params.op_hh * 60 + params.op_mm)
        };
        if (params.preconditioning_enabled){
          if (params.preconditioning_weekdays_only){
            result.params['preconditioningTimes'] = {'weekdays': {}};
          }
          else{
            result.params['preconditioningTimes'] = {'allWeek': {}};
          }
        }
        if (params.off_peak_charging_enabled){
          if (params.off_peak_charging_weekdays_only){
            result.params['offPeakChargingTimes'] = {'weekdays': {}};
          }
          else{
            result.params['offPeakChargingTimes'] = {'allWeek': {}};
          }
        }
        break;

      case 'commandDeactivateScheduledDeparture':
        // deprecated, commandScheduleCharging with [action] should be used
        result.command = 'scheduledDepartureAction';
        result.params = { 
          enabled: false,
          departureTime: 0,
          offPeakHoursEndTime: 0,
          preconditioningTimes: {},
          offPeakChargingTimes: {}
        };
        break;
    
      // climate actions
      case 'commandSetTemperature':
        result.command = 'hvacTemperatureAdjustmentAction';
        result.params = { 
          driverTempCelsius : params.driverTemperature,
          passengerTempCelsius : params.passengerTemperature
        };
        break;

      case 'commandPreconditioning':
        result.command = 'hvacAutoAction';
        result.params = { 
          powerOn : params.on
          // manual_override: true
        };
        break;

      case 'commandOverheatprotectionMode':
        result.command = 'setCabinOverheatProtectionAction';
        result.params = {
          on: (params.mode != 'off'),
          fanOnly: (params.mode == 'fan_only')
         };
        break;

      case 'commandOverheatprotectionLevel':
        let cop_temp = 1;
        if (params.level == 'low'){
          cop_temp = 1;
        }
        else if (params.level == 'medium'){
          cop_temp = 2;
        }
        else if (params.level == 'high'){
          cop_temp = 3;
        }
    
        result.command = 'setCopTempAction';
        result.params = {
          copActivationTemp: cop_temp
        };
        break;
  
      case 'commandDefrost':
        result.command = 'hvacSetPreconditioningMaxAction';
        result.params = {
          on: params.on
        };
        break;

      case 'commandClimateKeeperMode':
        result.command = 'hvacClimateKeeperAction';
        switch (params.mode){
          case 'off':
            result.params = {
              ClimateKeeperAction: 0
            };
            break;
          case 'on':
            result.params = {
              ClimateKeeperAction: 1
            };
            break;
          case 'dog':
            result.params = {
              ClimateKeeperAction: 2
            };
            break;
          case 'camp':
            result.params = {
              ClimateKeeperAction: 3
            };
            break;
        }
        // result.params['manualOverride'] = true;
        break;
  
      // case 'commandSteeringWheelHeatLevel':
      //   result.command = 'hvacSteeringWheelHeaterAction';
      //   result.params = {
      //     powerOn: (params.level != 0)
      //   };
      //   break;

      case 'commandSteeringWheelHeat':
        result.command = 'hvacSteeringWheelHeaterAction';
        result.params = {
          powerOn: (params.level != 'off')
        };
        break;
  
      case 'commandSeatHeatLevel':
        if (params.level == 'auto'){
          result.command = 'autoSeatClimateAction';
          result.params['carseat'] = []
          let entry = {};
          if (params.seat == 0){
            // driver seat
            entry['seatPosition'] = 1;
            entry['on'] = true;
          }
          else if (params.seat == 1){
            // driver seat
            entry['seatPosition'] = 2;
            entry['on'] = true;
          }
          else{
            // unknown
            entry['seatPosition'] = 0;
            entry['on'] = true;
          }
          result.params['carseat'] .push(entry);
        }
        else{
          result.command = 'hvacSeatHeaterActions';
          result.params['hvacSeatHeaterAction'] = [];
          let entry ={};
          switch (params.level){
            case '0':
              entry['SEAT_HEATER_OFF'] = {};
              break;
            case '1':
              entry['SEAT_HEATER_LOW'] = {};
              break;
            case '2':
              entry['SEAT_HEATER_MED'] = {};
              break;
            case '3':
              entry['SEAT_HEATER_HIGH'] = {};
              break;
            default:
              entry['SEAT_HEATER_UNKNOWN'] = {};
          }
          switch (params.seat){
            case '0':
              entry['CAR_SEAT_FRONT_LEFT'] = {};
              break;
            case '1':
              entry['CAR_SEAT_FRONT_RIGHT'] = {};
              break;
            case '2':
              entry['CAR_SEAT_REAR_LEFT'] = {};
              break;
            case '4':
              entry['CAR_SEAT_REAR_CENTER'] = {};
              break;
            case '5':
              entry['CAR_SEAT_REAR_RIGHT'] = {};
              break;
            default:
              entry['CAR_SEAT_UNKNOWN'] = {};
          }
          result.params['hvacSeatHeaterAction'].push(entry);
        }
        break;
          
      // Media actions
      case 'commandMediaNextTrack':
        result.command = 'mediaNextTrack';
        result.params = { };
        break;

      case 'commandMediaPrevTrack':
        result.command = 'mediaPreviousTrack';
        result.params = { };
        break;
  
      case 'commandMediaNextFav':
        result.command = 'mediaNextFavorite';
        result.params = { };
        break;
        
      case 'commandMediaPrevFav':
        result.command = 'mediaPreviousFavorite';
        result.params = { };
        break;

      case 'commandMediaTogglePlayback':
        result.command = 'mediaPlayAction';
        result.params = { };
        break;
        
      case 'commandMediaAdjustVolume':
        result.command = 'mediaUpdateVolume';
        result.params = { 
          volumeAbsoluteFloat: params.volume
          // volumeDelta
        };
        break;
  
      // error if not valid
      default:
        throw new Error("REST command "+apiFunction+" not supported yet for CommandProtocol");
    }
    return result;
  }

  async _commandPing(){
    await this.sendCommand('ping', {});
  }

  async _commandSentryMode(state){
    await this.sendCommand('commandSentryMode', {state});
  }

  async _commandDoorLock(locked){
    await this.sendCommand('commandDoorLock', {locked});
  }

  async _commandFlashLights(){
    await this.sendCommand('commandFlashLights', {});
  }

  async _commandHonkHorn(){
    await this.sendCommand('commandHonkHorn', {});
  }

  async _commandWindowPosition(position){
    await this.sendCommand('commandWindowPosition', {position});
  }

  async _commandScheduleSoftwareUpdate(minutes){
    await this.sendCommand('commandScheduleSoftwareUpdate', {minutes});
  }

  async _commandTrunk(trunk){
    await this.sendCommand('commandTrunk', {trunk});
  }

  async _commandTrunkFront(){
    await this.sendCommand('commandTrunkFront', {});
  }

  async _commandTrunkRear(action){
    await this.sendCommand('commandTrunkRear', {action});
  }

  // CAPABILITIES =======================================================================================

  async _onCapability( capabilityValues, capabilityOptions){
    this.log("_onCapability(): ", capabilityValues, capabilityOptions);

    if( capabilityValues["car_refresh"] != undefined){
      await this._sync();      
    }

    if( capabilityValues["car_wake_up"] != undefined){
      await this._wakeUp(true);
    }

    if( capabilityValues["car_doors_locked"] != undefined){
      await this._commandDoorLock(!capabilityValues["car_doors_locked"]);
    }

    if( capabilityValues["car_sentry_mode"] != undefined){
      await this._commandSentryMode(capabilityValues["car_sentry_mode"]);
    }

    if( capabilityValues["car_trunk_front"] != undefined){
      if (this._settings.car_trunk){
        await this.setCapabilityValue("car_trunk_front", true);
        // await this._commandTrunk(CONSTANTS.TRUNK_FRONT);
        await this._commandTrunkFront();
      }
      else{
        throw new Error(this.homey.__('devices.car.trunk_not_allowed'));
      }
    }

    if( capabilityValues["car_trunk_rear"] != undefined){
      if (this._settings.car_trunk){
        await this.setCapabilityValue("car_trunk_rear", !this.getCapabilityValue("car_trunk_rear"));
        // await this._commandTrunk(CONSTANTS.TRUNK_REAR);
        const action = this.getCapabilityValue("car_trunk_rear") ? 'open' : 'close';
        await this._commandTrunkRear( action );
      }
      else{
        throw new Error(this.homey.__('devices.car.trunk_not_allowed'));
      }
    }

  }

  // FLOW ACTIONS =======================================================================================

  async flowActionSetOnlineInterval(interval = 5, unit = 'min'){
    await this.setSettings(
      {
        polling_interval_online: interval,
        polling_unit_online: unit
      }
    );
    // this._settings.polling_interval_online = interval;
    // this._settings.polling_unit_online = unit;
    this._settings = this.getSettings();
    await this._startSync();
  }

  async flowActionPing(){
    await this._commandPing();
  }

  async flowActionRefresh(){
    await this._sync();
  }

  async flowActionWakeUp(wait=true){
    return await this._wakeUp(wait);
  }

  async flowActionDoorLock(locked){
    await this._commandDoorLock(locked);
    this.setCapabilityValue('car_doors_locked', !locked);
  }

  async flowActionSentryMode(state){
    await this._commandSentryMode(state);
    this.setCapabilityValue('car_sentry_mode', state);
  }

  async flowActionFlashLights(){
    await this._commandFlashLights();
  }

  async flowActionHonkHorn(){
    await this._commandHonkHorn();
  }

  async flowActionWindowPosition(position){
    await this._commandWindowPosition(position);
  }

  async flowActionScheduleSoftwareUpdate(minutes){
    await this._commandScheduleSoftwareUpdate(minutes);
  }

  async flowActionTrunk(trunk){
    await this._commandTrunk(trunk);
  }

  async flowActionTrunkFront(){
    await this._commandTrunkFront();
  }

  async flowActionTrunkRear(action){
    await this._commandTrunkRear(action);
  }

  // FLOW CONDITIONS =======================================================================================
  async flowConditionApiCostsDailyAverageRunListener(args){
    let costs = this.getCapabilityValue('measure_api_costs');
    let time = this._getLocalTime();
    let days = time.getDate() + time.getHours()/24;
    let result = (costs / days).toFixed(2); 
    return ( result > args.value );
  }
}