"use strict";
const Homey = require('homey');

const CONSTANTS = require('../../lib/constants');
const ChildDevice = require('../child_device');

module.exports = class BatteryDevice extends ChildDevice {

  async onInit() {
    await super.onInit();
  }

  // Read car data. Car must be awake.
  async updateDevice(data){
    await super.updateDevice(data);

    // Battery
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
      // Values:
      // Charging
      // Complete
      // Disconnected
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

  }

  // CAPABILITIES =======================================================================================

  async _onCapability( capabilityValues, capabilityOptions){
    await super. _onCapability( capabilityValues, capabilityOptions);

  }

  // FLOW ACTIONS =======================================================================================


}