const TeslaOAuth2Device = require('../../lib/TeslaOAuth2Device');
const Homey = require('homey');
const { CarServer } = require('../../lib/CarServer.js');
const Eckey = require('eckey-utils');

const CAPABILITY_DEBOUNCE = 500;
const DEFAULT_SYNC_INTERVAL = 1000 * 60 * 10; // 10 min
const WAIT_ON_WAKE_UP = 20; // 20 sec
const RETRY_COUNT = 3; // number of retries sending commands
const RETRY_DELAY = 5; // xx seconds delay between retries sending commands

const CONSTANTS = require('../../lib/constants');

module.exports = class CarDevice extends TeslaOAuth2Device {

  async onOAuth2Init() {
    this.log("onOAuth2Init()");
    await super.onOAuth2Init();
    
    await this._updateCapabilities();

    this.registerMultipleCapabilityListener(this.getCapabilities(), async (capabilityValues, capabilityOptions) => {
      // try{
          await this._onCapability( capabilityValues, capabilityOptions);
      // }
      // catch(error){
      //     this.log("_onCapability() Error: ",error.message);
      //     throw error;
      // }
  }, CAPABILITY_DEBOUNCE);


    this._settings = this.getSettings();
    this._startSync();
    this._sync();

    // Init Tesla Vehicle COmmand Protocol
    let keyFile = Homey.env.APP_PRIV_KEY;
    let key = Eckey.parsePem(keyFile);
    this.commandApi = await new CarServer(this.oAuth2Client, this.getData().id, key);
  }

  async onOAuth2Deleted() {
    await super.onOAuth2Deleted();
    await _stopSync();
  }

  async onDeleted(){
    await _stopSync();
    await super.onDeleted();
  }

  async onOAuth2Saved() {
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

  async handleApiOk(){
    try{
      await this.setSettings({
        api_state: 'OK' 
      }); 
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

  async handleApiError(error){
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
      await this.setSettings({
        api_state: apiState 
      });
      let oldState = this.getCapabilityValue('alarm_api_error');
      await this.setCapabilityValue('api_error', apiState);
      await this.setCapabilityValue('alarm_api_error', true);
      if (oldState != true){
        let tokens = {
          error: apiState
        };
        await this.homey.flow.getDeviceTriggerCard('alarm_api_error_on').trigger(this, tokens);
      }
    }
    catch(error){
      this.log(error);
    }
  }

  // SETTINGS =======================================================================================

  async onSettings({ oldSettings, newSettings, changedKeys }) {
    this.log(`[Device] ${this.getName()}: settings where changed: ${changedKeys}`);
    this._settings = newSettings;
    this._startSync();
    this._sync();
  }

  getCommandApi(){
    return this._settings.command_api;
  }

  // SYNC Logic =======================================================================================

  async _startSync(){
    await this._stopSync();
    if (!this._settings.polling_active){
      return;
    }
    // Interval settings is in minutes, convert to milliseconds.
    let interval = DEFAULT_SYNC_INTERVAL;
    if (!this.isAsleep()){
      interval = this._settings.polling_interval_online * 1000;
      if (this._settings.polling_unit_online == 'min'){
        interval = interval * 60;
      }
      this.log(`[Device] ${this.getName()}: Start ONLINE Poll interval: ${interval} sec.`);
    }
    else{
      interval = this._settings.polling_interval_offline * 1000;
      if (this._settings.polling_unit_offline == 'min'){
        interval = interval * 60;
      }
      this.log(`[Device] ${this.getName()}: Start OFFLINE Poll interval: ${interval} sec.`);
    }

    this._syncInterval = this.homey.setInterval(() => this._sync(), interval);
    // this._sync();
  }

  async _stopSync(){
    if (this._syncInterval) {
      this.homey.clearInterval(this._syncInterval);
    }
  }

  // SYNC =======================================================================================

  async _sync() {
    // Step 1: Get car status (online/offline/asleep) and check device availability
    try{
      // get current device state
      await this.getCarState();
      this.setAvailable();
    }
    catch(error){
      this.log("Device update error (getState): ID: "+this.getData().id+" Name: "+this.getName()+" Error: "+error.message);
      this.setUnavailable(error.message).catch(this.error);
      await this.handleApiError(error);
    };

    // Step 2: Get car data
    if (this.isOnline()){
      try{
        // update the device
        await this.getCarData();
        await this.handleApiOk();
      }
      catch(error){
        this.log("Device update error (getData): ID: "+this.getData().id+" Name: "+this.getName()+" Error: "+error.message);
        await this.handleApiError(error);
      }
    }
    else{
      await this.handleApiOk();
    }
  }

  // Read cas status (onlien or not)
  async getCarState(){
    let oldState = this.getCapabilityValue('car_state');
    let vehicle = await this.oAuth2Client.getVehicle(this.getData().id);

    // If state changed, then adjust sync interval
    if (vehicle.state != oldState){
      await this.setCapabilityValue('car_state', vehicle.state);
      let time = this._getLocalTimeString(new Date());
      await this.setCapabilityValue('last_update', time);

      // From asleep to online/offline or back?
      // Change Sync only is asleep state is changed to continue short interval check is car is temporary offline
      if (
          ( vehicle.state == CONSTANTS.STATE_ASLEEP && oldState != CONSTANTS.STATE_ASLEEP )
            ||
          ( vehicle.state != CONSTANTS.STATE_ASLEEP && oldState == CONSTANTS.STATE_ASLEEP )
      ){
        this._startSync();
      }
    }
  }

  // Read car data. Car must be awake.
  async getCarData(){
    let query = ['charge_state', 'climate_state', 'closures_state', 'drive_state', 'gui_settings', 'vehicle_config', 'vehicle_state'];
    if (this._settings.polling_location){
      query.push('location_data');
    }
    let data = {};
    try{
      data = await this.oAuth2Client.getVehicleData(this.getData().id, query);
    }
    catch(error){
      // Check for "Offline" errors (408)
      // Set car state to "offline"
      // Forward all other errors
      if (error.status && error.status == 408){
        let oldState = this.getCapabilityValue('car_state');
        await this.setCapabilityValue('car_state', CONSTANTS.STATE_OFFLINE);
        let time = this._getLocalTimeString(new Date());
        await this.setCapabilityValue('last_update', time);
        // state change from asleep to offline => Start new sync interval
        if (oldState == CONSTANTS.STATE_ASLEEP){
          // From asleep to offline?
          // Change Sync only is asleep state is changed to continue short interval check is car is temporary offline
          this._startSync();
        }
        return;
      }
      else{
        throw error;
      }
    }

    // Car state
    if (this.hasCapability('car_doors_locked') && data.charge_state && data.vehicle_state.locked != undefined){
      await this.setCapabilityValue('car_doors_locked', data.vehicle_state.locked);
    }
    if (this.hasCapability('car_sentry_mode') && data.charge_state && data.vehicle_state.sentry_mode != undefined){
      await this.setCapabilityValue('car_sentry_mode', data.vehicle_state.sentry_mode);
    }

    // Battery
    if (this.hasCapability('measure_battery') && data.charge_state && data.charge_state.battery_level != undefined){
      await this.setCapabilityValue('measure_battery', data.charge_state.battery_level);
    }

    // Meter
    if (this.hasCapability('meter_car_odo') && data.vehicle_state && data.vehicle_state.odometer != undefined){
      await this.setCapabilityValue('meter_car_odo', data.vehicle_state.odometer * CONSTANTS.MILES_TO_KM);
    }

    // Drive state
    if (this.hasCapability('car_shift_state') && data.drive_state && data.drive_state.shift_state != undefined){
      await this.setCapabilityValue('car_shift_state', data.drive_state.shift_state);
    }
    if (this.hasCapability('measure_car_drive_speed') && data.drive_state && data.drive_state.speed != undefined){
      await this.setCapabilityValue('measure_car_drive_speed', data.drive_state.speed * CONSTANTS.MILES_TO_KM);
    }

    // Tires/TPMS
    if (this.hasCapability('measure_car_tpms_pressure_fl') && data.vehicle_state && data.vehicle_state.tpms_pressure_fl != undefined){
      await this.setCapabilityValue('measure_car_tpms_pressure_fl', data.vehicle_state.tpms_pressure_fl);
    }
    if (this.hasCapability('measure_car_tpms_pressure_fr') && data.vehicle_state && data.vehicle_state.tpms_pressure_fr != undefined){
      await this.setCapabilityValue('measure_car_tpms_pressure_fr', data.vehicle_state.tpms_pressure_fr);
    }
    if (this.hasCapability('measure_car_tpms_pressure_rl') && data.vehicle_state && data.vehicle_state.tpms_pressure_rl != undefined){
      await this.setCapabilityValue('measure_car_tpms_pressure_rl', data.vehicle_state.tpms_pressure_rl);
    }
    if (this.hasCapability('measure_car_tpms_pressure_rr') && data.vehicle_state && data.vehicle_state.tpms_pressure_rr != undefined){
      await this.setCapabilityValue('measure_car_tpms_pressure_rr', data.vehicle_state.tpms_pressure_rr);
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

    
      

    let time = this._getLocalTimeString(new Date());
    await this.setCapabilityValue('last_update', time);

    // Update child devices
    let batteryDevice = this.homey.drivers.getDriver('battery').getDevices().filter(e => {return (e.getData().id == this.getData().id)})[0];
    if (batteryDevice){
      await batteryDevice.updateDevice(data);
    }
    let climateDevice = this.homey.drivers.getDriver('climate').getDevices().filter(e => {return (e.getData().id == this.getData().id)})[0];
    if (climateDevice){
      await climateDevice.updateDevice(data);
    }
    let locationDevice = this.homey.drivers.getDriver('location').getDevices().filter(e => {return (e.getData().id == this.getData().id)})[0];
    if (locationDevice){
      await locationDevice.updateDevice(data);
    }

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
    if (this.getCapabilityValue('car_state') == CONSTANTS.STATE_ASLEEP){
      return true;
    }
    else{
      return false;
    }
  }

  // Commands =======================================================================================
  async _wakeUp(wait=true){
    this.log("Wake up the car...");
    await this.getCarState();
    if (this.isOnline()){
      this.log("Car is already online.");
      return true;
    }
    await this.oAuth2Client.commandWakeUp(this.getData().id);
    if (wait){
      for (let i=0; i<WAIT_ON_WAKE_UP; i++){
        this.log("Wake up the car...Online-Check "+i);
        await this._wait();
        await this.getCarState();
        if (this.isOnline()){
          this.log("Wake up the car...Car is online now");
          // automatically sync data after wake up
          await this._sync()
          return true;
        }
      }
    }
    this.log("Wake up the car...Car is not online yet.");
    let error = new Error("Waking up the vehicle was not successful.");
    await this.handleApiError(error);
    throw error;
  }

  async wakeUpIfNeeded(){
    if (this.getSetting('command_wake_up')){
      await this._wakeUp(true);
    }
  }

  async sendCommand(apiFunction, params){
    try{
      await this.wakeUpIfNeeded();
      let retryCount = 0;
      if (this._settings.command_retry){
        retryCount = RETRY_COUNT - 1;
      }
      for (let i=0; i<=retryCount; i++){
        try{
          await this._sendCommand(apiFunction, params);
          break;
        }
        catch(error){
          if (i==retryCount){
            throw error;
          }
          else{
            this.log("Retry in "+RETRY_DELAY+" sec...");
            await this._wait(RETRY_DELAY * 1000);
          }
        }
      }
      await this.handleApiOk();
    }
    catch(error){
      await this.handleApiError(error);
      throw error;
    }
  }

  async _sendCommand(apiFunction, params){
    // Use direct Command Protocol?
    if ( this.getCommandApi() == CONSTANTS.COMMAND_API_CMD){
      await this._sendSignedCommand(apiFunction, params);
    }
    else{
      await this.oAuth2Client[apiFunction](this.getCommandApi(), this.getData().id, params);
    }
  }

  async _sendSignedCommand(apiFunction, apiParams){
    let {command, params} = this._getSignedCommand(apiFunction, apiParams);
    this.log("Send signed command: API function: "+apiFunction+"; Command: "+command+"; Parameter: ",params);
    await this.commandApi.sendSignedCommand(command, params);
    this.log("Send signed command: Success");
  }

  _getSignedCommand(apiFunction, params){
    let result = {
      command: null,
      params: {}
    };
    switch (apiFunction) {
      // car actions
      case 'commandSentryMode':
        result.command = 'vehicleControlSetSentryModeAction';
        result.params = { on: params.state};
        break;

      // case 'commandDoorLock':
      //   if (params.locked){
      //     result.command = 'RKE_ACTION_LOCK';
      //   }
      //   else{
      //     result.command = 'RKE_ACTION_UNLOCK';
      //   }
      //   result.params = {};
      //   break;

      case 'commandFlashLights':
        result.command = 'vehicleControlFlashLightsAction';
        result.params = {};
        break;
      
      case 'commandHonkHorn':
        result.command = 'vehicleControlHonkHornAction';
        result.params = {};
        break;
  
      case 'commandWindowPosition':       // car and climate
        if (params.position == 'vent'){
          result.command = 'vehicleControlWindowActionVent';
        }
        else{
          result.command = 'vehicleControlWindowActionClose';
        }
        result.params = { action : 3};
        break;
          
      // charging actions
      case 'commandChargeLimit':
        result.command = 'chargingSetLimitAction';
        result.params = { percent: params.limit};
        break;

      case 'commandChargeCurrent':
        result.command = 'setChargingAmpsAction';
        result.params = { charging_amps : params.current};
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
          result.command = 'chargingStartStopActionStart';
        }
        else{
          result.command = 'chargingStartStopActionStop';
        }
        params.state = {};
        break;

      case 'commandScheduleCharging':
        result.command = 'scheduledChargingAction';
        result.params = { 
          enabled: (params.action == 'on'),
          charging_time : (params.hh * 60 + params.mm)
        };
        break;

      case 'commandScheduleDeparture':

      // preconditioning_times   : "preconditioning_enabled", "preconditioning_weekdays_only"
        result.command = 'scheduledDepartureAction';
        result.params = { 
          enabled: (params.action == 'on'),
          departure_time: (params.hh * 60 + params.mm)
          // preconditioning_times: 
          // off_peak_charging_times:
          // off_peak_hours_end_time: 0
        };
        break;
  
      // location actions
      // case 'commandNavigateGpsRequest':
      //   result.command = 'chargingSetLimitAction';
      //   result.params = { percent: params.limit};
      //   break;

      // climate actions
      case 'commandSetTemperature':
        result.command = 'hvacTemperatureAdjustmentAction';
        result.params = { 
          driver_temp_celsius : params.driverTemperature,
          passenger_temp_celsius : params.passengerTemperature
        };
        break;

      case 'commandPreconditioning':
        result.command = 'hvacAutoAction';
        result.params = { 
          power_on : params.on
          // manual_override: true
        };
        break;

      case 'commandOverheatprotectionMode':
        result.command = 'setCabinOverheatProtectionAction';
        result.params = {
          on: (params.mode != 'off'),
          fan_only: (params.mode == 'fan_only')
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

      case 'commandSteeringWheelHeatLevel':
        result.command = 'hvacSteeringWheelHeaterAction';
        result.params = {
          power_on: (params.level != 0)
        };
        break;

      // case 'commandSeatHeatLevel':
      //   if (params.level == 'auto'){
      //     result.command = 'autoSeatClimateAction';
      //     result.params = {
      //       on: true,
      //       seat_position : params.seat
      //     };
      //   }
      //   else{
      //     result.command = 'hvacSeatHeaterActions';
      //     result.params = {
      //       on: true,
      //       seat_position : params.seat
      //     };
      //   }
      //   break;
          

      // error if not valid
      default:
        throw new Error("REST command "+apiFunction+" not supported yet for direct CommandProtocol");
    }
    return result;
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
      await this._commandDoorLock(capabilityValues["car_doors_locked"]);
    }

    if( capabilityValues["car_sentry_mode"] != undefined){
      await this._commandSentryMode(capabilityValues["car_sentry_mode"]);
    }
  }

  // FLOW ACTIONS =======================================================================================

  async flowActionRefresh(wait=true){
    await this._sync();
  }

  async flowActionWakeUp(wait=true){
    return await this._wakeUp(wait);
  }

  async flowActionDoorLock(locked){
    await this._commandDoorLock(locked);
    this.setCapabilityValue('car_doors_locked', locked);
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

}