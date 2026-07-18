"use strict";
const Homey = require('homey');

const CONSTANTS = require('../../lib/constants');
const ChildDevice = require('../energy_site_child_device');

module.exports = class EnergyHomeDevice extends ChildDevice {

    async onInit() {
        await super.onInit();
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
        if (energySite.liveStatus != undefined && energySite.liveStatus.load_power != undefined) {
            this.setCapabilityValue('measure_power', energySite.liveStatus.load_power);
        }

        // Meter data
        if (energySite.currentMeter != undefined && energySite.currentMeter.consumer_energy_imported != undefined) {
            this.setCapabilityValue("meter_power", energySite.currentMeter.consumer_energy_imported/1000);
        }

        // Energy today
        if (energySite.todayMeter != undefined && energySite.todayMeter.consumer_energy_imported_from_grid != undefined) {
            this.setCapabilityValue("meter_power_from_grid", energySite.todayMeter.consumer_energy_imported_from_grid/1000);
        }
        if (energySite.todayMeter != undefined && energySite.todayMeter.consumer_energy_imported_from_solar != undefined) {
            this.setCapabilityValue("meter_power_from_solar", energySite.todayMeter.consumer_energy_imported_from_solar/1000);
        }
        if (energySite.todayMeter != undefined && energySite.todayMeter.consumer_energy_imported_from_battery != undefined) {
            this.setCapabilityValue("meter_power_from_battery", energySite.todayMeter.consumer_energy_imported_from_battery/1000);
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