"use strict";
const Homey = require('homey');

const CONSTANTS = require('../../lib/constants');
const ChildDevice = require('../child_device');

module.exports = class BatteryDevice extends ChildDevice {

  async onInit() {
    await super.onInit();
    this._settings = this.getSettings();
  }

  // Device handling =======================================================================================
  getCarDevice(){
    let device = this.homey.drivers.getDriver('car').getDevices().filter(e=>{ return ( e.getData().id == this.getData().id ) })[0];
    if (device == undefined){
      throw new Error('No car device found.');
    }
    return device; 
  }
  getLocationDevice(){
    let device = this.homey.drivers.getDriver('location').getDevices().filter(e=>{ return ( e.getData().id == this.getData().id ) })[0];
    if (device == undefined){
      throw new Error('No location device found.');
    }
    return device; 
  }

  // SYNC =======================================================================================
  async updateDevice(data){
    await super.updateDevice(data);

    if (!data.charge_state){
      return;
    }

    // Battery
    if (this.hasCapability('measure_soc_level') && data.charge_state && data.charge_state.battery_level != undefined){
      this.setCapabilityValue('measure_soc_level', data.charge_state.battery_level);
    }
    if (this.hasCapability('measure_soc_usable') && data.charge_state && data.charge_state.usable_battery_level != undefined){
      this.setCapabilityValue('measure_soc_usable', data.charge_state.usable_battery_level);
    }

    if (this.hasCapability('measure_soc_range_estimated') && data.charge_state && data.charge_state.est_battery_range != undefined && data.gui_settings){
      this.setCapabilityValue('measure_soc_range_estimated', data.gui_settings.gui_distance_units == 'km/hr' ? data.charge_state.est_battery_range * CONSTANTS.MILES_TO_KM : data.charge_state.est_battery_range);
      // Capability units
      let co = {};
      try{
        co = this.getCapabilityOptions("measure_soc_range_estimated");
      }
      catch(error){}
      let distUnit = data.gui_settings.gui_distance_units == 'km/hr' ? 'km' : 'mi';
      if (!co || !co.units || co.units != distUnit){
        co['units'] = distUnit;
        this.setCapabilityOptions('measure_soc_range_estimated', co);
      }
    }
    if (this.hasCapability('measure_soc_range_ideal') && data.charge_state && data.charge_state.ideal_battery_range  != undefined && data.gui_settings){
      this.setCapabilityValue('measure_soc_range_ideal', data.gui_settings.gui_distance_units == 'km/hr' ? data.charge_state.ideal_battery_range * CONSTANTS.MILES_TO_KM : data.charge_state.ideal_battery_range);
      // Capability units
      let co = {};
      try{
        co = this.getCapabilityOptions("measure_soc_range_ideal");
      }
      catch(error){}
      let distUnit = data.gui_settings.gui_distance_units == 'km/hr' ? 'km' : 'mi';
      if (!co || !co.units || co.units != distUnit){
        co['units'] = distUnit;
        this.setCapabilityOptions('measure_soc_range_ideal', co);
      }
    }

    if (this.hasCapability('battery_heater') && data.charge_state && data.charge_state.battery_heater_on != undefined){
      this.setCapabilityValue('battery_heater', data.charge_state.battery_heater_on);
    }
    if (this.hasCapability('measure_io_battery_power') && data.drive_state && data.drive_state.power != undefined){
      await this.setCapabilityValue('measure_io_battery_power', data.drive_state.power);
    }

    // Charging
    if (this.hasCapability('measure_charge_limit_soc') && data.charge_state && data.charge_state.charge_limit_soc != undefined){
      await this.setCapabilityValue('measure_charge_limit_soc', data.charge_state.charge_limit_soc);
    }
    if (this.hasCapability('measure_charge_energy_added') && data.charge_state && data.charge_state.charge_energy_added != undefined){
      await this.setCapabilityValue('measure_charge_energy_added', data.charge_state.charge_energy_added);
    }
    if (this.hasCapability('charging_state') && data.charge_state && data.charge_state.charging_state != undefined){
      // "Disconnected"
      // "Calibrating"
      // "Complete"
      // "NoPower"
      // "Stopped"
      // "Unknown"
      // "Starting"
      // "Charging"

      // add current added energy to power meter 
      await this.addChargingPowerMeter(data.charge_state);
      // add charging session to history
      // call async function without await
      await this.addChargingHistory(data.charge_state);

      await this.setCapabilityValue('charging_state', data.charge_state.charging_state);

    }
    if (this.hasCapability('measure_charge_minutes_to_full_charge') && data.charge_state && data.charge_state.minutes_to_full_charge != undefined){
      this.setCapabilityValue('measure_charge_minutes_to_full_charge', data.charge_state.minutes_to_full_charge);
    }
    if (data.charge_state && data.charge_state.charger_power != undefined){
      if (this.hasCapability('measure_charge_power')){
        this.setCapabilityValue('measure_charge_power', data.charge_state.charger_power);
      }
      if (this.hasCapability('measure_power')){
        // Optional: Add location based power handling
        if (this._settings.battery_charge_power_location == -1){
          this.setCapabilityValue('measure_power', data.charge_state.charger_power * 1000); // kW => W
        }
        else{
          try{
            let device = this.getLocationDevice();
            if ( await device.isAtLocation(this._settings.battery_charge_power_location)){
              this.setCapabilityValue('measure_power', data.charge_state.charger_power * 1000); // kW => W
            }
            else{
              this.setCapabilityValue('measure_power', 0);
            }
          }
          catch(error){
            this.setCapabilityValue('measure_power', 0);
          }
        }
      }
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
    if (this.hasCapability('measure_charge_phases') && data.charge_state && (data.charge_state.charger_phases != undefined || data.charge_state.charger_phases == null)){
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

    if (this.hasCapability('charging_port') && data.charge_state && data.charge_state.charge_port_door_open != undefined){
      this.setCapabilityValue('charging_port', data.charge_state.charge_port_door_open);
    }
    if (this.hasCapability('charging_on') && data.charge_state && data.charge_state.charging_state != undefined){
      this.setCapabilityValue('charging_on', data.charge_state.charging_state == CONSTANTS.CHARGING_STATE_CHARGING);
    }
    if (this.hasCapability('charging_port_cable') && data.charge_state && data.charge_state.conn_charge_cable != undefined){
      this.setCapabilityValue('charging_port_cable', data.charge_state.conn_charge_cable == '<invalid>' ? '' : data.charge_state.conn_charge_cable );
      // "IEC"
      // "SAE"
      // "SNA"
      // "GB_AC"
      // "GB_DC"
    }

    // off_peak_charging_times:
    // "all_week"
    // "weekdays"

    // scheduled_charging_mode:
    // "Off"
    // "StartAt"
    // "DepartBy"

  }

  async addChargingPowerMeter(chargeState){
    if (
      this.hasCapability('meter_charge_power')
      &&
      chargeState.charging_state == CONSTANTS.CHARGING_STATE_DISCONNECTED 
      &&
      this.getCapabilityValue('charging_state') != CONSTANTS.CHARGING_STATE_DISCONNECTED 
      &&
      chargeState.charge_energy_added > 0
    ){
      let oldValue = this.getCapabilityValue('meter_charge_power');
      await this.setCapabilityValue('meter_charge_power', oldValue + chargeState.charge_energy_added);
      if (this.hasCapability('meter_power')){
        await this.setCapabilityValue('meter_power', oldValue + chargeState.charge_energy_added);
      }
    }
  }

  async addChargingHistory(chargeState){
    // check state change
    let action;
    if (chargeState.charging_state == CONSTANTS.CHARGING_STATE_DISCONNECTED 
      &&
      this.getCapabilityValue('charging_state') != CONSTANTS.CHARGING_STATE_DISCONNECTED 
      // &&
      // data.charge_state.charge_energy_added > 0
    ){
      action = 'stopped';
    }
    if (chargeState.charging_state == CONSTANTS.CHARGING_STATE_CHARGING
      &&
      this.getCapabilityValue('charging_state') != CONSTANTS.CHARGING_STATE_CHARGING 
    ){
      action = 'started';
    }
    if (!action){
      return;
    }

    // read history
    let hist = this.getStoreValue('charging_history');
    if (hist == undefined){
      hist = [];
    }
    // get location
    let locationName = '';
    try{
      let device = this.getLocationDevice();
      if (device && device.getCapabilityValue('location_name')){

        locationName = device.getCapabilityValue('location_name');
      }
    }
    catch (error){}
    // get time
    let tz = this.homey.clock.getTimezone();
    let timeUtc = new Date();
    let timeUtcString = timeUtc.toLocaleString(this.homey.i18n.getLanguage(), 
    { 
        hour12: false, 
        timeZone: tz,
        hour: "2-digit",
        minute: "2-digit",
        second: "2-digit",
        day: "2-digit",
        month: "2-digit",
        year: "numeric"
    });

    let entry = {};
    switch (action){
      case 'started':
        entry = hist[hist.length - 1];
        if(entry && entry['state'] == 'started'){
          this.log("Charging history entry already existing: ", entry);
        }
        else{
          entry = {
            state: 'started',
            timeStarted: timeUtcString, 
            timeStopped : '',
            socStart: chargeState.battery_level,
            socStop: 0,
            energyAdded: 0,
            location: locationName
          }
          hist.push(entry);
          this.log("Added charging history entry: ", entry);
        }
        break;

      case 'stopped':
        entry = hist[hist.length - 1];
        if(!entry){
          entry = {
            state: 'stopped',
            timeStarted: '', 
            timeStopped : timeUtcString,
            socStart: 0,
            socStop: chargeState.battery_level,
            energyAdded: chargeState.charge_energy_added,
            location: locationName
          };
          hist.push(entry);
          this.log("Added charging history entry: ", entry);
        }
        else{
          entry['state'] = 'stopped';
          entry['timeStopped'] = timeUtcString;
          entry['socStop'] = chargeState.battery_level;
          entry['energyAdded'] = chargeState.charge_energy_added;
          hist[hist.length - 1] = entry;
          this.log("Updated charging history entry: ", entry);
        }
        break;
    }

    await this.setStoreValue('charging_history', hist);

    // trigger flow for history entry
    if (action == 'stopped'){
      let tokens = {
        started: entry['timeStarted'],
        stopped: entry['timeStopped'],
        soc_start: entry['socStart'],
        soc_stop: entry['socStop'],
        energy: entry['energyAdded'],
        location: entry['location']
      }
      if (!tokens.energy){
        tokens.energy = 0;
      }
      if (!tokens.soc_start){
        tokens.soc_start = 0;
      }
      if (!tokens.soc_stop){
        tokens.soc_stop = 0;
      }
      // trigger flow
      await this.homey.flow.getDeviceTriggerCard('charging_history_entry_added').trigger(this, tokens);

    }
  }

  // Commands =======================================================================================
  async _commandChargePort(state){
    await this.getCarDevice().sendCommand('commandChargePort', {state});
  }

  async _commandChargeOn(state){
    await this.getCarDevice().sendCommand('commandChargeOn', {state});
  }

  async _commandChargeLimit(limit){
    await this.getCarDevice().sendCommand('commandChargeLimit', {limit});
  }

  async _commandChargeCurrent(current){
    await this.getCarDevice().sendCommand('commandChargeCurrent', {current});
  }

  async _commandScheduleCharging(args){
    await this.getCarDevice().sendCommand('commandScheduleCharging', args);
  }

  async _commandScheduleDeparture(args){
    await this.getCarDevice().sendCommand('commandScheduleDeparture', args);
  }

  async _commandDeactivateScheduledCharging(){
    await this.getCarDevice().sendCommand('commandDeactivateScheduledCharging', {});
  }

  async _commandDeactivateScheduledDeparture(){
    await this.getCarDevice().sendCommand('commandDeactivateScheduledDeparture', {});
  }

  async _getChargingHistorySuc(days){

    let startTimeString;
    if (days != undefined){
      // let time = new Date().getTime();
      // startTime = new Date(time - (days * 24 * 60 * 60 * 1000));
      // startTime.setHours(0, 0, 0, 0);

      let tz  = this.homey.clock.getTimezone();
      let timeUtc = new Date();
      let timeUtcString = timeUtc.toLocaleString('en-US', 
      { 
          hour12: false, 
          timeZone: tz,
          hour: "2-digit",
          minute: "2-digit",
          second: "2-digit",
          day: "2-digit",
          month: "2-digit",
          year: "numeric"
      });
      let timeLocale = new Date(timeUtcString);

      let startTimeLocale = new Date(timeLocale.getTime() - (days * 24 * 60 * 60 * 1000));
      startTimeLocale.setHours(0, 0, 0, 0);

      let diff = timeLocale.getTime() - timeUtc.getTime();
      diff = diff / 1000 / 60 / 60;
      let sign = '+';
      if (diff < 0){
        sign = '-';
      }
      diff = Math.round(Math.abs(diff)).toString();
      if (diff.length == 1){
        diff = '0' + diff;
      }

      startTimeString = startTimeLocale.toISOString();
      startTimeString = startTimeString.split('.')[0]+sign+diff+':00';
      this.log(startTimeString);

    }

    return await this.getCarDevice().getRequest('getChargingHistory', {startTime: startTimeString});
  }

  // Helpers =======================================================================================
  _getLocalTimeString(){
    let tz  = this.homey.clock.getTimezone();
    let now = new Date().toLocaleString(this.homey.i18n.getLanguage(), 
    { 
        hour12: false, 
        timeZone: tz,
        hour: "2-digit",
        minute: "2-digit",
        day: "2-digit",
        month: "2-digit",
        year: "numeric"
    });
    return now.replace(',', '');
  }

  // CAPABILITIES =======================================================================================

  async _onCapability( capabilityValues, capabilityOptions){
    await super. _onCapability( capabilityValues, capabilityOptions);

    if( capabilityValues["charging_port"] != undefined){
      await this._commandChargePort(capabilityValues["charging_port"]);
    }

    if( capabilityValues["charging_port_unlock"] != undefined){
      await this._commandChargePort(true);
    }

    if( capabilityValues["charging_on"] != undefined){
      await this._commandChargeOn(capabilityValues["charging_on"]);
      // set charging state directly to have current state availabe as condition until next sync
      if (capabilityValues["charging_on"]){
        await this.setCapabilityValue('charging_state', CONSTANTS.CHARGING_STATE_CHARGING );
      }
      else{
        await this.setCapabilityValue('charging_state', CONSTANTS.CHARGING_STATE_STOPPED );
      }
    }

  }

  // FLOW ACTIONS =======================================================================================

  async flowActionChargePort(state){
    await this._commandChargePort(state);
    await this.setCapabilityValue('charging_port', state );
  }

  async flowActionChargePortUnlock(){
    await this._commandChargePort(true);
    await this.setCapabilityValue('charging_port', true );
  }

  async flowActionChargeOn(state){
    await this._commandChargeOn(state);
    await this.setCapabilityValue('charging_on', state );
    // set charging state directly to have current state availabe as condition until next sync
    if (state){
      await this.setCapabilityValue('charging_state', CONSTANTS.CHARGING_STATE_CHARGING );
    }
    else{
      await this.setCapabilityValue('charging_state', CONSTANTS.CHARGING_STATE_STOPPED );
    }
  }

  async flowActionChargeLimit(limit){
    await this._commandChargeLimit(limit);
    await this.setCapabilityValue('measure_charge_limit_soc', limit );
  }

  async flowActionChargeCurrent(current){
    await this._commandChargeCurrent(current);
    await this.setCapabilityValue('measure_charge_current_max', current );
  }

  async flowActionChargeScheduleCharging(args){
    await this._commandScheduleCharging(args);
  }

  async flowActionChargeScheduleDeparture(args){
    await this._commandScheduleDeparture(args);
  }

  async flowActionChargeDeactivateScheduledCharging(){
    await this._commandDeactivateScheduledCharging();
  }

  async flowActionChargeDeactivateScheduledDeparture(){
    await this._commandDeactivateScheduledDeparture();
  }

  async flowActionChargingHistorySuc(days){
    let hist = await this._commandChargingHistorySuc(days);
    return {
      history_json: JSON.stringify(hist),
      history_count: hist.length
    }
  }

  async flowActionChargePowerMeter(power){
    if (this.hasCapability('meter_charge_power')){
      await this.setCapabilityValue('meter_charge_power', power );
    }
    if (this.hasCapability('meter_power')){
      await this.setCapabilityValue('meter_power', power );
    }
  }

  // Device =======================================================================================

  async getChargingHistorySuc(days){
    let hist = await this._getChargingHistorySuc(days);
    let tz  = this.homey.clock.getTimezone();
    let result = [];
    for (let i=0; i<hist.length; i++){

      let entry = hist[i];
      let newEntry = {};

      newEntry['id'] = i+1;
      newEntry['chargeStopDateTime'] = entry.chargeStopDateTime;
      newEntry['chargeStartDateTime'] = new Date(entry.chargeStartDateTime).toLocaleString(this.homey.i18n.getLanguage(), 
      { 
          hour12: false, 
          timeZone: tz,
          hour: "2-digit",
          minute: "2-digit",
          second: "2-digit",
          day: "2-digit",
          month: "2-digit",
          year: "numeric"
      });
      newEntry['chargeStopDateTime'] = new Date(entry.chargeStopDateTime).toLocaleString(this.homey.i18n.getLanguage(), 
      { 
          hour12: false, 
          timeZone: tz,
          hour: "2-digit",
          minute: "2-digit",
          second: "2-digit",
          day: "2-digit",
          month: "2-digit",
          year: "numeric"
      });

      newEntry['siteLocationName'] = entry.siteLocationName;

      for (let j=0; j<entry.fees.length; j++){
        if (entry.fees[j].feeType == 'CHARGING'){
          newEntry['energyAdded'] = entry.fees[j].usageBase;
          newEntry['chargingGrossAmount'] = entry.fees[j].totalDue;
        }
        if (entry.fees[j].feeType == 'PARKING'){
          newEntry['parkingGrossAmount'] = entry.fees[j].totalDue;
        }
      }


      result.push( newEntry );
    }
    return result;
  }

  getChargingHistory(){
    let hist = this.getStoreValue('charging_history');
    let result = [];
    for (let i=hist.length-1; i>=0; i--){
      hist[i]['id'] = hist.length -i;
      result.push(hist[i]);
    }
    return hist;
  }

  async onSettings({ oldSettings, newSettings, changedKeys }) {
    this.log(`[Device] ${this.getName()}: settings where changed: ${changedKeys}`);
    this._settings = newSettings;
    try {
      if (changedKeys.indexOf('battery_charge_power') > -1){
          if (newSettings['battery_charge_power']){
            if (!this.hasCapability('measure_power')){
              this.log("onSettings(): Add measure_power");
              await this.addCapability('measure_power');
            }
          }
          else{
              if (this.hasCapability('measure_power')){
                this.log("onSettings(): Remove measure_power");
                await this.removeCapability('measure_power');
              }
            } 
      }
      if (changedKeys.indexOf('battery_charge_power_meter') > -1){
        if (newSettings['battery_charge_power_meter']){
          if (!this.hasCapability('meter_power')){
            this.log("onSettings(): Add meter_power");
            await this.addCapability('meter_power');
            if (this.hasCapability('meter_charge_power')){
              await this.setCapabilityValue('meter_power', this.getCapabilityValue('meter_charge_power'));
            }
                }
        }
        else{
            if (this.hasCapability('meter_power')){
              this.log("onSettings(): Remove meter_power");
              await this.removeCapability('meter_power');
            }
          } 
    }
  }
    catch(error){
      this.log("Error onSettings(): " + error.message);
    }
}


}