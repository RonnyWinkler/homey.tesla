"use strict";
const Homey = require('homey');
const CONSTANTS = require('../../lib/constants');

module.exports = class LocationDriver extends Homey.Driver {

  onPair(session) {
    this.log("onPair()");

    session.setHandler("list_devices", async () => {
        return await this.onPairListDevices(session);
    });
} // end onPair

  async onRepair(session, device) {
    this.log("onRepair()");

    session.setHandler("get_nearest_suc_list", async () => {
        return await this.getNearestSucList(session, device);
    });

    session.setHandler("navigate_to_suc", async (id) => {
      return await this.onNavigateToSuc(session, device, id);
    });
  } // end onPair

  async onPairListDevices(session) {
    this.log("onPairListDevices()" );
    let devices = [];
    let cars = this.homey.drivers.getDriver('car').getDevices();
    for (let i=0; i<cars.length; i++){
        devices.push(
        {
            name: cars[i].getName() + " " + this.homey.__('pair.location.name'),
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

  async getNearestSucList(session, device) {
    let result = [];
    let list = [];
    try{
      list = await device.getNearbyChargingSites(50, 200);
    }
    catch(eror){
      return result;
    };
    for (let i=0; i<list.superchargers.length; i++){
      let distance = Math.round( list.superchargers[i].distance_miles * CONSTANTS.MILES_TO_KM *10)/10;
      let compass = device.getCoordinatesBearing( 
        list.superchargers[i].location.lat, 
        list.superchargers[i].location.long,
        device.getCapabilityValue('measure_location_latitude'),
        device.getCapabilityValue('measure_location_longitude')
      );
      result.push({
        nr: i+1,
        id: list.superchargers[i].id,
        name: list.superchargers[i].name,
        distance:  distance,
        stalls: (list.superchargers[i].available_stalls == undefined? '?' : list.superchargers[i].available_stalls) + '/' + (list.superchargers[i].total_stalls == undefined? '?' : list.superchargers[i].total_stalls),
        compass: compass
      });
    }
    return result;
  }

  async onNavigateToSuc(session, device, id) {
    let result = false;
    try{
      result = await device.navigateToSuc(id);
    }
    catch(error){
      this.log("Error navigating to supercharger: " + error);
      throw error;
    }
    return result;
  }
}