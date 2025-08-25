"use strict";
const Homey = require('homey');

const CONSTANTS = require('../../lib/constants');
const ChildDevice = require('../energy_site_child_device');

module.exports = class EnergyBatteryDevice extends ChildDevice {

    async onInit() {
        await super.onInit();

        // local buffer
        this._maxVolume = 11; // max. allowed volume
    }

    // Device handling =======================================================================================
    getEnergySiteDevice(){
        let device = this.homey.drivers.getDriver('energy_site').getDevices().filter(e=>{ return ( e.getData().id == this.getData().id ) })[0];
        if (device == undefined){
        throw new Error('No energy site device found.');
        }
        return device; 
    }
    
    // SYNC =======================================================================================
    // Read car data. Car must be awake.
    async updateDevice(energySite){
        await super.updateDevice(energySite);

        // Device Update

        // Live data
        if (energySite["liveStatus"] != undefined && energySite["liveStatus"].battery_power != undefined) {
            this.setCapabilityValue('measure_power', -1 * energySite["liveStatus"].battery_power);
        }
        if (energySite["liveStatus"] != undefined && energySite["liveStatus"].percentage_charged != undefined) {
            this.setCapabilityValue('measure_battery', energySite["liveStatus"].percentage_charged);
        }

        // Meter data
        if (energySite.currentMeter != undefined && energySite.currentMeter.grid_energy_imported != undefined) {
            this.setCapabilityValue("meter_power.battery_charged", energySite.currentMeter.battery_energy_imported/1000);
        }
        if (energySite.currentMeter != undefined && energySite.currentMeter.grid_energy_exported != undefined) {
            this.setCapabilityValue("meter_power.battery_discharged", energySite.currentMeter.battery_energy_exported/1000);
        }

        // Energy today
        if (energySite.todayMeter != undefined && energySite.todayMeter.battery_energy_exported != undefined) {
            this.setCapabilityValue("meter_power_battery_discharged", energySite.todayMeter.battery_energy_exported/1000);
        }
        if (energySite.todayMeter != undefined && energySite.todayMeter.battery_energy_imported != undefined) {
            this.setCapabilityValue("meter_power_battery_charged", energySite.todayMeter.battery_energy_imported/1000);
        }

    }

    // Commands =======================================================================================

    // CAPABILITIES =======================================================================================
    async _onCapability( capabilityValues, capabilityOptions){
        await super. _onCapability( capabilityValues, capabilityOptions);
    }

    // FLOW TRIGGER ======================================================================================

    // FLOW CONDITIONS ======================================================================================

    // FLOW ACTIONS =======================================================================================

    // Device =======================================================================================

    // HELPERS =======================================================================================


}