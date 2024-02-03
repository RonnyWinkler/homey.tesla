"use strict";
const Homey = require('homey');
// const CONSTANTS = require('../../lib/constants');
const ChildDevice = require('../child_device');

module.exports = class MediaDevice extends ChildDevice {

  async onInit() {
    await super.onInit();
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
  // Read car data. Car must be awake.
  async updateDevice(data){
    await super.updateDevice(data);

  }

  // CAPABILITIES =======================================================================================

  async _onCapability( capabilityValues, capabilityOptions){
    await super. _onCapability( capabilityValues, capabilityOptions);

  }

	// FLOW TRIGGER ======================================================================================

	// FLOW CONDITIONS ======================================================================================

  // Device =======================================================================================
  // async onSettings({ oldSettings, newSettings, changedKeys }) {
  //   this.log(`[Device] ${this.getName()}: settings where changed: ${changedKeys}`);
  //   this._settings = newSettings;

  // }


  // HELPERS =======================================================================================

  // Commands =======================================================================================
  // async _commandNavigateGpsRequest(latitude, longitude, order){
  //   await this.getCarDevice().sendCommand('commandNavigateGpsRequest', {latitude, longitude, order, locale, time});
  // }

  // FLOW ACTIONS =======================================================================================
  // async flowActionNavigationRequest(request){
  //   await this._commandNavigationRequest(request);
  // }

}