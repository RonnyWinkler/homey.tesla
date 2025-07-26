"use strict";
const Homey = require('homey');

const CAPABILITY_DEBOUNCE = 500;

module.exports = class EnergySiteChildDevice extends Homey.Device {

  async onInit() {
    this.log("onInit()");
    await this._updateCapabilities();
    await this._updateDeviceConfig();

    this.registerMultipleCapabilityListener(this.getCapabilities(), async (capabilityValues, capabilityOptions) => {
      // try{
          await this._onCapability( capabilityValues, capabilityOptions);
      // }
      // catch(error){
      //     this.log("_onCapability() Error: ",error);
      // }
    }, CAPABILITY_DEBOUNCE);

    this._settings = this.getSettings();
  }

  // Helpers =======================================================================================
  _getLocalTimeString(time){
    let tz  = this.homey.clock.getTimezone();
    let now = new Date(time).toLocaleString(this.homey.i18n.getLanguage(), 
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

  // Device handling =======================================================================================
  async _updateCapabilities(){
    let capabilities = [];
    try{
      capabilities = this.homey.app.manifest.drivers.filter((e) => {return (e.id == this.driver.id);})[0].capabilities;
      // remove capabilities
      let deviceCapabilities = this.getCapabilities();
      for (let i=0; i<deviceCapabilities.length; i++){
        let filter = capabilities.filter((e) => {return (e == deviceCapabilities[i]);});
        if (filter.length == 0 ){
          // exclude dynamic capabilities
          if (deviceCapabilities[i] != 'measure_power' && deviceCapabilities[i] != 'meter_power'){
            try{
              await this.removeCapability(deviceCapabilities[i]);
            }
            catch(error){}
          }
        }
      }
      // add missing capabilities
      for (let i=0; i<capabilities.length; i++){
        if (!this.hasCapability(capabilities[i])){
          try{
            await this.addCapability(capabilities[i]);
          }
          catch(error){}
        }
      }
    }
    catch (error){
      this.error(error.message);
    }
  }

  async _updateDeviceConfig(){
    // Energy settings
    let energy = JSON.parse(JSON.stringify(this.getEnergy())) || {};
    energy = this.homey.app.manifest.drivers.filter((e) => {return (e.id == this.driver.id);})[0].energy;
    await this.setEnergy( energy );

    this.setClass(this.homey.app.manifest.drivers.filter((e) => {return (e.id == this.driver.id);})[0].class);
  }


  // SETTINGS =======================================================================================
  async onSettings({ oldSettings, newSettings, changedKeys }) {
    this.log(`[Device] ${this.getName()}: settings where changed: ${changedKeys}`);
    this._settings = newSettings;
  }

  // Read car data. Car must be awake.
  async updateDevice(energySite){

    // redefine in subclasses

  }

  // CAPABILITIES =======================================================================================

  async _onCapability( capabilityValues, capabilityOptions){
    this.log("_onCapability(): ", capabilityValues, capabilityOptions);

        // redefine in subclasses

  }

  // FLOW ACTIONS =======================================================================================


}