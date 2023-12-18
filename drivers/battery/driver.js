"use strict";
const Homey = require('homey');

module.exports = class BatteryDriver extends Homey.Driver {

  onPair(session) {
    this.log("onPair()");

    session.setHandler("list_devices", async () => {
        return await this.onPairListDevices(session);
    });
  } // end onPair

  async onPairListDevices(session) {
    this.log("onPairListDevices()" );
    let devices = [];
    let cars = this.homey.drivers.getDriver('car').getDevices();
    for (let i=0; i<cars.length; i++){
        devices.push(
        {
            name: cars[i].getName() + " " + this.homey.__('pair.battery.name'),
            data: {
                id: cars[i].getData().id
            },
            settings:{
              car_data_vin: cars[i].getData().id
            }
        }
        );
    }
    this.log("Found devices:");
    this.log(devices);
    return devices;
  }
}