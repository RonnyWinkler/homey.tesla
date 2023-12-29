const TeslaOAuth2Device = require('../../lib/TeslaOAuth2Device');

const CAPABILITY_DEBOUNCE = 500;
const DEFAULT_SYNC_INTERVAL = 1000 * 60 * 10; // 10 min
const WAIT_ON_WAKE_UP = 20; // 20 sec

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
          await this.removeCapability(deviceCapabilities[i]);
        }
      }
      // add missing capabilities
      for (let i=0; i<capabilities.length; i++){
        if (!this.hasCapability(capabilities[i])){
            await this.addCapability(capabilities[i]);
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
      await this.setCapabilityValue('measure_api_error', null);
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
      await this.setCapabilityValue('measure_api_error', apiState);
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
    let oldState = this.getCapabilityValue('state');
    let vehicle = await this.oAuth2Client.getVehicle(this.getData().id);

    // If state changed, then adjust sync interval
    if (vehicle.state != oldState){
      await this.setCapabilityValue('state', vehicle.state);
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
    let data = await this.oAuth2Client.getVehicleData(this.getData().id, query);    

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
    if (this.hasCapability('meter_odo') && data.vehicle_state && data.vehicle_state.odometer != undefined){
      await this.setCapabilityValue('meter_odo', data.vehicle_state.odometer * CONSTANTS.MILES_TO_KM);
    }

    // Drive state
    if (this.hasCapability('measure_drive_shift_state') && data.drive_state && data.drive_state.shift_state != undefined){
      await this.setCapabilityValue('measure_drive_shift_state', data.drive_state.shift_state);
    }
    if (this.hasCapability('measure_drive_speed') && data.drive_state && data.drive_state.speed != undefined){
      await this.setCapabilityValue('measure_drive_speed', data.drive_state.speed * CONSTANTS.MILES_TO_KM);
    }
    if (this.hasCapability('measure_drive_power') && data.drive_state && data.drive_state.power != undefined){
      await this.setCapabilityValue('measure_drive_power', data.drive_state.power);
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
    if (this.hasCapability('measure_car_software_version') && data.vehicle_state && data.vehicle_state.car_version != undefined){
      await this.setCapabilityValue('measure_car_software_version', data.vehicle_state.car_version.split(' ')[0]);
    }
    if (this.hasCapability('measure_car_software_update_version') && data.vehicle_state && data.vehicle_state.software_update != undefined){
      await this.setCapabilityValue('measure_car_software_update_version', data.vehicle_state.software_update.version);
    }
    if (this.hasCapability('software_update_state') && data.vehicle_state && data.vehicle_state.software_update != undefined){
      await this.setCapabilityValue('software_update_state', data.vehicle_state.software_update.status);
      // Possible states:
      // available
      // scheduled
      // installing

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
    if (this.getCapabilityValue('state') == CONSTANTS.STATE_ONLINE){
      return true;
    }
    else{
      return false;
    }
  }

  isAsleep(){
    if (this.getCapabilityValue('state') == CONSTANTS.STATE_ASLEEP){
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

  async _commandDoorLock(locked){
    try{
      await this.wakeUpIfNeeded();
      await this.oAuth2Client.commandDoorLock(this.getCommandApi(), this.getData().id, locked);
      await this.handleApiOk();
    }
    catch(error){
      await this.handleApiError(error);
      throw error;
    }
  }

  async _commandSentryMode(state){
    try{
      await this.wakeUpIfNeeded();
      await this.oAuth2Client.commandSentryMode(this.getCommandApi(), this.getData().id, state);
      await this.handleApiOk();
    }
    catch(error){
      await this.handleApiError(error);
      throw error;
    }
  }

  async _commandFlashLights(){
    try{
      await this.wakeUpIfNeeded();
      await this.oAuth2Client.commandFlashLights(this.getCommandApi(), this.getData().id);
      await this.handleApiOk();
    }
    catch(error){
      await this.handleApiError(error);
      throw error;
    }
  }

  async _commandHonkHorn(){
    try{
      await this.wakeUpIfNeeded();
      await this.oAuth2Client.commandHonkHorn(this.getCommandApi(), this.getData().id);
      await this.handleApiOk();
    }
    catch(error){
      await this.handleApiError(error);
      throw error;
    }
  }

  async _commandWindowPosition(position){
    try{
      await this.wakeUpIfNeeded();
      await this.oAuth2Client.commandWindowPosition(this.getCommandApi(), this.getData().id, position);
      await this.handleApiOk();
    }
    catch(error){
      await this.handleApiError(error);
      throw error;
    }
  }

  // CAPABILITIES =======================================================================================

  async _onCapability( capabilityValues, capabilityOptions){
    this.log("_onCapability(): ", capabilityValues, capabilityOptions);

    if( capabilityValues["refresh"] != undefined){
      await this._sync();      
    }

    if( capabilityValues["wake_up"] != undefined){
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