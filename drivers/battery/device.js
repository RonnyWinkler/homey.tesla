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

    // Battery
    if (this.hasCapability('measure_soc_level') && data.charge_state && data.charge_state.battery_level != undefined){
      this.setCapabilityValue('measure_soc_level', data.charge_state.battery_level);
    }
    if (this.hasCapability('measure_soc_usable') && data.charge_state && data.charge_state.usable_battery_level != undefined){
      this.setCapabilityValue('measure_soc_usable', data.charge_state.usable_battery_level);
    }
    if (this.hasCapability('measure_soc_range_estimated') && data.charge_state && data.charge_state.est_battery_range != undefined){
      this.setCapabilityValue('measure_soc_range_estimated', data.charge_state.est_battery_range * CONSTANTS.MILES_TO_KM);
    }
    if (this.hasCapability('measure_soc_range_ideal') && data.charge_state && data.charge_state.ideal_battery_range  != undefined){
      this.setCapabilityValue('measure_soc_range_ideal', data.charge_state.ideal_battery_range * CONSTANTS.MILES_TO_KM);
    }
    if (this.hasCapability('battery_heater') && data.charge_state && data.charge_state.battery_heater_on != undefined){
      this.setCapabilityValue('battery_heater', data.charge_state.battery_heater_on);
    }
    if (this.hasCapability('measure_io_battery_power') && data.drive_state && data.drive_state.power != undefined){
      await this.setCapabilityValue('measure_io_battery_power', data.drive_state.power);
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
      // Values:
      // Charging
      // Complete
      // Disconnected
      // NoPower 
      // Starting 
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
          this.setCapabilityValue('measure_power', data.charge_state.charger_power);
        }
        else{
          try{
            let device = this.getLocationDevice();
            if ( await device.isAtLocation(this._settings.battery_charge_power_location)){
              this.setCapabilityValue('measure_power', data.charge_state.charger_power);
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
      this.setCapabilityValue('charging_on', data.charge_state.charging_state == 'Charging');
    }
    if (this.hasCapability('charging_port_cable') && data.charge_state && data.charge_state.conn_charge_cable != undefined){
      this.setCapabilityValue('charging_port_cable', data.charge_state.conn_charge_cable == '<invalid>' ? '' : data.charge_state.conn_charge_cable );
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

  async _commandScheduleCharging(action, hh, mm){
    await this.getCarDevice().sendCommand('commandScheduleCharging', {action, hh, mm});
  }

  async _commandScheduleDeparture(action, hh, mm){
    await this.getCarDevice().sendCommand('commandScheduleDeparture', {action, hh, mm});
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
  }

  async flowActionChargeLimit(limit){
    await this._commandChargeLimit(limit);
    await this.setCapabilityValue('measure_charge_limit_soc', limit );
  }

  async flowActionChargeCurrent(current){
    await this._commandChargeCurrent(current);
    await this.setCapabilityValue('measure_charge_current_max', current );
  }

  async flowActionChargeScheduleCharging(action, hh, mm){
    await this._commandScheduleCharging(action, hh, mm);
  }

  async flowActionChargeScheduleDeparture(action, hh, mm){
    await this._commandScheduleDeparture(action, hh, mm);
  }

  // Device =======================================================================================

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
    }
    catch(error){
      this.log("Error onSettings(): " + error.message);
    }
}


}