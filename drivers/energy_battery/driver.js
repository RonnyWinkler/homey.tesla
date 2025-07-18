"use strict";
const Homey = require('homey');

module.exports = class EnergyBatteryDriver extends Homey.Driver {

  onPair(session) {
    this.log("onPair()");

    session.setHandler("list_devices", async () => {
        return await this.onPairListDevices(session);
    });
  } // end onPair

  async onPairListDevices(session) {
    this.log("onPairListDevices()" );
    let devices = [];
    let energy_sites = this.homey.drivers.getDriver('energy_site').getDevices();
    for (let i=0; i<energy_sites.length; i++){
        devices.push(
        {
            name: energy_sites[i].getName() + " " + this.homey.__('pair.energy_battery.name'),
            data: {
                id: energy_sites[i].getData().id
            }
        }
        );
    }
    this.log("Found devices:");
    this.log(devices);
    return devices;
  }
}