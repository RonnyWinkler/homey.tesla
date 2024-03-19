"use strict";
const Homey = require('homey');

module.exports = class BatteryDriver extends Homey.Driver {

  onPair(session) {
    this.log("onPair()");

    session.setHandler("list_devices", async () => {
        return await this.onPairListDevices(session);
    });
  } // end onPair

  async onRepair(session, device) {
    this.log("onRepair()");

    session.setHandler("get_charging_history", async () => {
        return await this.getChargingHistory(session, device);
    });

    session.setHandler("clear_charging_history", async () => {
      return await this.clearChargingHistory(session, device);
    });

    session.setHandler("get_charging_history_suc", async () => {
      return await this.getChargingHistorySuc(session, device);
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

  async getChargingHistory(session, device) {
    return device.getChargingHistory();
  }

  async getChargingHistorySuc(session, device) {
    let hist =  await device.getChargingHistorySuc();
    return hist;
  }

  async clearChargingHistory(session, device) {
    return device.setStoreValue('charging_history', []);
  }
}