"use strict";
const Homey = require('homey');

const CONSTANTS = require('../../lib/constants');
const ChildDevice = require('../child_device');

module.exports = class ClimateDevice extends ChildDevice {

  async onInit() {
    await super.onInit();
  }

  // Read car data. Car must be awake.
  async updateDevice(data){
    await super.updateDevice(data);

  }

  // Device handling =======================================================================================
  getCarDevice(){
    let device = this.homey.drivers.getDriver('car').getDevices().filter(e=>{ return ( e.getData().id == this.getData().id ) })[0];
    if (device == undefined){
      throw new Error('No car device found.');
    }
    return device; 
  }

  // SYNC =======================================================================================
  async updateDevice(data){
    await super.updateDevice(data);

    // window state
    // vent mode is not direclty readable. Only windows open/closed can be checked.
    if (this.hasCapability('climate_window_vent') && data.vehicle_state && 
        data.vehicle_state.fd_window == 0 && // front driver window 0=clodes
        data.vehicle_state.rd_window == 0 && // read driver window 0=clodes
        data.vehicle_state.fp_window == 0 && // front passenger window 0=clodes
        data.vehicle_state.rp_window == 0    // rear passenger window 0=clodes
      ){
      await this.setCapabilityValue('climate_window_vent', false);
    }
    else{
      await this.setCapabilityValue('climate_window_vent', true);
    }    

    // Temperatures
    if (this.hasCapability('target_temperature') && data.climate_state && data.climate_state.driver_temp_setting != undefined){
      await this.setCapabilityValue('target_temperature', data.climate_state.driver_temp_setting );
    }
    if (this.hasCapability('measure_temperature') && data.climate_state && data.climate_state.inside_temp ){
      await this.setCapabilityValue('measure_temperature', data.climate_state.inside_temp );
    }
    if (this.hasCapability('measure_climate_temperature_in') && data.climate_state && data.climate_state.inside_temp != undefined){
      await this.setCapabilityValue('measure_climate_temperature_in', data.climate_state.inside_temp );
    }
    if (this.hasCapability('measure_climate_temperature_out') && data.climate_state && data.climate_state.outside_temp != undefined){
      await this.setCapabilityValue('measure_climate_temperature_out', data.climate_state.outside_temp );
    }

    // Adjust temperature capabilities
    if (this.hasCapability('target_temperature')){
      let options = this.getCapabilityOptions('target_temperature');
      if (options.min != data.climate_state.min_avail_temp){
        options.min = data.climate_state.min_avail_temp;
        this.setCapabilityOptions('target_temperature', options );
      }
      if (options.max != data.climate_state.max_avail_temp){
        options.max = data.climate_state.max_avail_temp;
        this.setCapabilityOptions('target_temperature', options );
      }
    }

    // A/C
    if (this.hasCapability('climate_ac') && data.climate_state && data.climate_state.is_climate_on != undefined){
      await this.setCapabilityValue('climate_ac', data.climate_state.is_climate_on );
    }
    if (this.hasCapability('climate_ac_auto') && data.climate_state && data.climate_state.is_auto_conditioning_on != undefined){
      await this.setCapabilityValue('climate_ac_auto', data.climate_state.is_auto_conditioning_on );
    }

    // Preconditioning
    if (this.hasCapability('climate_preconditioning') && data.climate_state && data.climate_state.is_preconditioning != undefined){
      await this.setCapabilityValue('climate_preconditioning', data.climate_state.is_preconditioning );
    }
    if (this.hasCapability('climate_defrost') && data.climate_state && data.climate_state.defrost_mode != undefined){
      await this.setCapabilityValue('climate_defrost', (data.climate_state.defrost_mode != 0) );
    }

    // Overheat protection
    if (this.hasCapability('climate_overheat_protection_mode') && data.climate_state && data.climate_state.cabin_overheat_protection != undefined){
      if (data.climate_state.cabin_overheat_protection == 'FanOnly'){
        await this.setCapabilityValue('climate_overheat_protection_mode', 'fan_only' );
      }
      else if (data.climate_state.cabin_overheat_protection == 'On'){
        await this.setCapabilityValue('climate_overheat_protection_mode', 'on' );
      }
      else if (data.climate_state.cabin_overheat_protection == 'Off'){
        await this.setCapabilityValue('climate_overheat_protection_mode', 'off' );
      }
    }
    if (this.hasCapability('climate_overheat_protection_level') && data.climate_state && data.climate_state.cop_activation_temperature != undefined){
      if (data.climate_state.cop_activation_temperature == 'Low'){
        await this.setCapabilityValue('climate_overheat_protection_level', 'low' );
      }
      else if (data.climate_state.cop_activation_temperature == 'Medium'){
        await this.setCapabilityValue('climate_overheat_protection_level', 'medium' );
      }
      else if (data.climate_state.cop_activation_temperature == 'High'){
        await this.setCapabilityValue('climate_overheat_protection_level', 'high' );
      }
    }

  }

  // Commands =======================================================================================
  async _commandWindowPosition(position){
    await this.getCarDevice().wakeUpIfNeeded();
    await this.getCarDevice().oAuth2Client.commandWindowPosition(this.getData().id, position);
  }

  async _commandSetTemperature(driverTemperature, passengerTemperature){
    await this.getCarDevice().wakeUpIfNeeded();
    await this.getCarDevice().oAuth2Client.commandSetTemperature(this.getData().id, driverTemperature, passengerTemperature);
  }

  async _commandPreconditioning(on){
    await this.getCarDevice().wakeUpIfNeeded();
    await this.getCarDevice().oAuth2Client.commandPreconditioning(this.getData().id, on);
  }

  async _commandPreconditioningMode(mode){
    await this.getCarDevice().wakeUpIfNeeded();
    await this.getCarDevice().oAuth2Client.commandPreconditioningMode(this.getData().id, mode);
  }

  async _commandPreconditioningLevel(level){
    await this.getCarDevice().wakeUpIfNeeded();
    await this.getCarDevice().oAuth2Client.commandPreconditioningLevel(this.getData().id, level);
  }

  async _commandDefrost(on){
    await this.getCarDevice().wakeUpIfNeeded();
    await this.getCarDevice().oAuth2Client.commandDefrost(this.getData().id, on);
  }

  // CAPABILITIES =======================================================================================

  async _onCapability( capabilityValues, capabilityOptions){
    await super._onCapability( capabilityValues, capabilityOptions);

    if( capabilityValues["climate_window_vent"] != undefined){
      if (capabilityValues["climate_window_vent"]){
        await this._commandWindowPosition(CONSTANTS.WINDOW_POSITION_VENT);
      }
      else{
        await this._commandWindowPosition(CONSTANTS.WINDOW_POSITION_CLOSE);
      }
    }

    if( capabilityValues["target_temperature"] != undefined){
      await this._commandSetTemperature(
        capabilityValues["target_temperature"], // driver temp
        capabilityValues["target_temperature"]  // passenger temp
      );
    }

    if( capabilityValues["climate_preconditioning"] != undefined){
      await this._commandPreconditioning(
        capabilityValues["climate_preconditioning"]
      );
      if (!capabilityValues["climate_preconditioning"]){
        await this.setCapabilityValue('climate_defrost', false );
      }
    }

    if( capabilityValues["climate_overheat_protection_mode"] != undefined){
      await this._commandPreconditioningMode(
        capabilityValues["climate_overheat_protection_mode"]
      );
    }

    if( capabilityValues["climate_overheat_protection_level"] != undefined){
      await this._commandPreconditioningLevel(
        capabilityValues["climate_overheat_protection_level"]
      );
    }

    if( capabilityValues["climate_defrost"] != undefined){
      await this._commandDefrost(
        capabilityValues["climate_defrost"]
      );
      if (capabilityValues["climate_defrost"]){
        await this.setCapabilityValue('climate_preconditioning', true );
      }
    }

  }

  // FLOW ACTIONS =======================================================================================

  async flowActionWindowPosition(position){
    await this._commandWindowPosition(position);
    await this.setCapabilityValue('climate_window_vent', (position == CONSTANTS.WINDOW_POSITION_VENT) );
  }

  async flowActionPreconditioning(on){
    await this._commandPreconditioning(on);
    await this.setCapabilityValue('climate_preconditioning', on );
    if (!on){
      await this.setCapabilityValue('climate_defrost', false );
    }
  }

  async flowActionPreconditioningMode(mode){
    await this._commandPreconditioningMode(mode);
    await this.setCapabilityValue('climate_overheat_protection_mode', mode );
  }

  async flowActionPreconditioningLevel(level){
    await this._commandPreconditioningLevel(level);
    await this.setCapabilityValue('climate_overheat_protection_level', level );
  }

  async flowActionDefrost(on){
    await this._commandDefrost(on);
    await this.setCapabilityValue('climate_defrost', on );
    if (on){
      await this.setCapabilityValue('climate_preconditioning', true );
    }
  }

  async flowActionTemperature(temp_driver, temp_passenger){
    if (temp_passenger == undefined || temp_passenger == null){
      temp_passenger = temp_driver;
    }
    await this._commandSetTemperature(
      temp_driver, // driver temp
      temp_passenger  // passenger temp
    );
  }

}