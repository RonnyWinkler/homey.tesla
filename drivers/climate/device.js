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

  // CAPABILITIES =======================================================================================

  async _onCapability( capabilityValues, capabilityOptions){
    await super. _onCapability( capabilityValues, capabilityOptions);

  }

  // FLOW ACTIONS =======================================================================================


}