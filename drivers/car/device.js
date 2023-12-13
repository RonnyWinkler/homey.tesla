const TeslaOAuth2Device = require('../../lib/TeslaOAuth2Device');

const CAPABILITY_DEBOUNCE = 500;
const DEFAULT_SYNC_INTERVAL = 1000 * 60 * 10; // 10 min
const WAIT_ON_WAKE_UP = 30; // 30 sec

const CONSTANTS = require('../../lib/constants');

module.exports = class CarDevice extends TeslaOAuth2Device {

  async onOAuth2Init() {
    this.log("onOAuth2Saved()");
    await super.onOAuth2Init();
    
    await this._updateCapabilities();

    this.registerMultipleCapabilityListener(this.getCapabilities(), async (capabilityValues, capabilityOptions) => {
      try{
          await this._onCapability( capabilityValues, capabilityOptions);
      }
      catch(error){
          this.log("_onCapability() Error: ",error);
      }
  }, CAPABILITY_DEBOUNCE);


    this._settings = this.getSettings(),
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
        // add missing capabilities
        let capabilities = [];
        try{
            capabilities = this.homey.app.manifest.drivers.filter((e) => {return (e.id == this.driver.id);})[0].capabilities;
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
    if (this.isOnline()){
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

  // Read cas status (onlien or not)
  async getCarState(){
    let oldState = this.getCapabilityValue('state');
    let vehicle = await this.oAuth2Client.getVehicle(this.getData().id);

    // If state changed, then adjust sync interval
    if (vehicle.state != oldState){
      await this.setCapabilityValue('state', vehicle.state);
      let time = this._getLocalTimeString(new Date());
      await this.setCapabilityValue('last_update', time);

      // From online to offline or back?
      if (
          ( vehicle.state == CONSTANTS.STATE_ONLINE && oldState != CONSTANTS.STATE_ONLINE )
            ||
          ( vehicle.state != CONSTANTS.STATE_ONLINE && oldState == CONSTANTS.STATE_ONLINE )
      ){
        this._startSync();
      }
    }
  }

  // Read car data. Car must be awake.
  async getCarData(){

    let data = await this.oAuth2Client.getVehicleData(this.getData().id);    
    
    // Battery
    if (this.hasCapability('measure_battery') && data.charge_state && data.charge_state.battery_level != undefined){
      this.setCapabilityValue('measure_battery', data.charge_state.battery_level);
    }
    if (this.hasCapability('measure_battery_level') && data.charge_state && data.charge_state.battery_level != undefined){
      this.setCapabilityValue('measure_battery_level', data.charge_state.battery_level);
    }
    if (this.hasCapability('measure_battery_usable') && data.charge_state && data.charge_state.usable_battery_level != undefined){
      this.setCapabilityValue('measure_battery_usable', data.charge_state.usable_battery_level);
    }
    if (this.hasCapability('measure_battery_range_estimated') && data.charge_state && data.charge_state.est_battery_range != undefined){
      this.setCapabilityValue('measure_battery_range_estimated', data.charge_state.est_battery_range * CONSTANTS.MILES_TO_KM);
    }
    if (this.hasCapability('measure_battery_range_ideal') && data.charge_state && data.charge_state.ideal_battery_range  != undefined){
      this.setCapabilityValue('measure_battery_range_ideal', data.charge_state.ideal_battery_range * CONSTANTS.MILES_TO_KM);
    }
    if (this.hasCapability('battery_heater') && data.charge_state && data.charge_state.battery_heater_on != undefined){
      this.setCapabilityValue('battery_heater', data.charge_state.battery_heater_on);
    }

    // Charging
    if (this.hasCapability('measure_charge_limit_soc') && data.charge_state && data.charge_state.charge_limit_soc != undefined){
      this.setCapabilityValue('measure_charge_limit_soc', data.charge_state.charge_limit_soc);
    }
    if (this.hasCapability('measure_charge_energy_added') && data.charge_state && data.charge_state.charge_energy_added != undefined){
      this.setCapabilityValue('measure_charge_energy_added', data.charge_state.charge_energy_added);
    }
    if (this.hasCapability('charging_state') && data.charge_state && data.charge_state.charging_state != undefined){
      this.setCapabilityValue('charging_state', data.charge_state.charging_state);
    }
    if (this.hasCapability('measure_charge_minutes_to_full_charge') && data.charge_state && data.charge_state.minutes_to_full_charge != undefined){
      this.setCapabilityValue('measure_charge_minutes_to_full_charge', data.charge_state.minutes_to_full_charge);
    }
    if (this.hasCapability('measure_charge_power') && data.charge_state && data.charge_state.charger_power != undefined){
      this.setCapabilityValue('measure_charge_power', data.charge_state.charger_power);
    }
    if (this.hasCapability('measure_charge_current') && data.charge_state && data.charge_state.charger_actual_current != undefined){
      this.setCapabilityValue('measure_charge_current', data.charge_state.charger_actual_current);
    }
    if (this.hasCapability('measure_charge_current_max') && data.charge_state && data.charge_state.charge_amps != undefined){
      this.setCapabilityValue('measure_charge_current_max', data.charge_state.charge_amps);
    }
    if (this.hasCapability('measure_charge_voltage') && data.charge_state && data.charge_state.charger_voltage != undefined){
      this.setCapabilityValue('measure_charge_voltage', data.charge_state.charger_voltage);
    }
    if (this.hasCapability('measure_charge_phases') && data.charge_state && data.charge_state.charger_phases != undefined){
      switch (data.charge_state.charger_phases){
        case 1:
          this.setCapabilityValue('measure_charge_phases', 1);
          break;
        case 2:
          this.setCapabilityValue('measure_charge_phases', 3);
          break;
        default:
          this.setCapabilityValue('measure_charge_phases', 0);

      }
    }

    

    let time = this._getLocalTimeString(new Date());
    await this.setCapabilityValue('last_update', time);
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
          return true;
        }
      }
    }
    this.log("Wake up the car...Car is not online yet.");
    return false;
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