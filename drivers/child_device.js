"use strict";
const Homey = require('homey');

const CAPABILITY_DEBOUNCE = 500;

module.exports = class ChildDevice extends Homey.Device {

  async onInit() {
    this.log("onInit()");
    await this._updateCapabilities();

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
          try{
            await this.removeCapability(deviceCapabilities[i]);
          }
          catch(error){}
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


  // SETTINGS =======================================================================================
  async onSettings({ oldSettings, newSettings, changedKeys }) {
    this.log(`[Device] ${this.getName()}: settings where changed: ${changedKeys}`);
    this._settings = newSettings;
  }

  // Read car data. Car must be awake.
  async updateDevice(data){

    // redefine in subclasses

  }

  // CAPABILITIES =======================================================================================

  async _onCapability( capabilityValues, capabilityOptions){
    this.log("_onCapability(): ", capabilityValues, capabilityOptions);

        // redefine in subclasses

  }

  // FLOW ACTIONS =======================================================================================


}