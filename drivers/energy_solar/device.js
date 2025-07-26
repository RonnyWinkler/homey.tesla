"use strict";
const Homey = require('homey');

const CONSTANTS = require('../../lib/constants');
const ChildDevice = require('../energy_site_child_device');

module.exports = class EnergySolarDevice extends ChildDevice {

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
        if (energySite["liveStatus"] != undefined && energySite["liveStatus"].solar_power != undefined) {
            this.setCapabilityValue('measure_power', energySite["liveStatus"].solar_power);
        }

        // Meter data
        if (energySite.currentMeter != undefined && energySite.currentMeter.solar_energy_exported != undefined) {
            this.setCapabilityValue("meter_power.solar_exported", energySite.currentMeter.solar_energy_exported/1000);
        }

        // Energy today
        if (energySite.todayMeter != undefined && energySite.todayMeter.solar_energy_exported != undefined) {
            this.setCapabilityValue("meter_power_solar_exported", energySite.todayMeter.solar_energy_exported/1000);
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