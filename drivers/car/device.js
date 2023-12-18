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
      try{
          await this._onCapability( capabilityValues, capabilityOptions);
      }
      catch(error){
          this.log("_onCapability() Error: ",error.message);
          throw error;
      }
  }, CAPABILITY_DEBOUNCE);


    this._settings = this.getSettings();
    this._startSync();
    this._sync();
  }

  async onOAuth2Deleted() {
    await super.onOAuth2Deleted();
    await _stopSync();
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

  // SETTINGS =======================================================================================

  async onSettings({ oldSettings, newSettings, changedKeys }) {
    this.log(`[Device] ${this.getName()}: settings where changed: ${changedKeys}`);
    this._settings = newSettings;
    this._startSync();
    this._sync();
  }

  // SYNC =======================================================================================

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

    this._syncInterval = setInterval(() => this._sync(), interval);
    // this._sync();
  }

  async _stopSync(){
    if (this._syncInterval) {
      clearInterval(this._syncInterval);
    }
  }

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
    };

    // Step 2: Get car data
    if (this.isOnline()){
      try{
        // update the device
        await this.getCarData();
      }
      catch(error){
        this.log("Device update error (getData): ID: "+this.getData().id+" Name: "+this.getName()+" Error: "+error.message);
      }
    }
  }

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
    
    // Battery
    if (this.hasCapability('measure_battery') && data.charge_state && data.charge_state.battery_level != undefined){
      await this.setCapabilityValue('measure_battery', data.charge_state.battery_level);
    }

    // Meter
    if (this.hasCapability('meter_odo') && data.vehicle_state && data.vehicle_state.odometer != undefined){
      await this.setCapabilityValue('meter_odo', data.vehicle_state.odometer);
    }

    // Drive state
    if (this.hasCapability('measure_drive_shift_state') && data.drive_state && data.drive_state.shift_state != undefined){
      await this.setCapabilityValue('measure_drive_shift_state', data.drive_state.shift_state);
    }
    if (this.hasCapability('measure_drive_speed') && data.drive_state && data.drive_state.speed != undefined){
      await this.setCapabilityValue('measure_drive_speed', data.drive_state.speed);
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
    if (this.hasCapability('measure_car_software_version.') && data.vehicle_state && data.vehicle_state.car_version != undefined){
      await this.setCapabilityValue('measure_car_software_version.', data.vehicle_state.car_version.split(' ')[0]);
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

  async wakeUp(wait=true){
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
    throw new Error("Waking up the vehicle was not successful.");
  }

  // CAPABILITIES =======================================================================================

  async _onCapability( capabilityValues, capabilityOptions){
    this.log("_onCapability(): ", capabilityValues, capabilityOptions);

    if( capabilityValues["refresh"] != undefined){
      await this._sync();      
    }

    if( capabilityValues["wake_up"] != undefined){
      await this.wakeUp(true);
    }

  }

  // FLOW ACTIONS =======================================================================================

  async flowActionRefresh(wait=true){
    await this._sync();
  }

  async flowActionWakeUp(wait=true){
    return await this.wakeUp(wait);
  }


  async flowActionFlashLights(){
    return await this.oAuth2Client.commandFlashLights(this.getData().id);
  }

}