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

    session.setHandler("get_nearest_dest_list", async () => {
      return await this.getNearestDestList(session, device);
    });

    session.setHandler("navigate_to_suc", async (id) => {
      return await this.onNavigateToSuc(session, device, id);
    });

    session.setHandler("navigate_to_dest", async (id) => {
      return await this.onNavigateToDest(session, device, id);
    });

    session.setHandler("get_driving_history", async () => {
      return await this.getDrivingHistory(session, device);
    });

    session.setHandler("get_driving_history_data", async () => {
      return await this.getDrivingHistoryData(session, device);
    });

    session.setHandler("update_driving_history_data", async (data) => {
      return await this.updateDrivingHistoryData(session, device, data);
    });

    session.setHandler("clear_driving_history", async () => {
      return await this.clearDrivingHistory(session, device);
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
        compass: compass,
        latitude: list.superchargers[i].location.lat,
        longitude: list.superchargers[i].location.long,
        coordinates: list.superchargers[i].location.lat+','+list.superchargers[i].location.long
      });
    }
    return result;
  }

  async getNearestDestList(session, device) {
    let result = [];
    let list = [];
    try{
      list = await device.getNearbyChargingSites(50, 200);
    }
    catch(eror){
      return result;
    };

    for (let i=0; i<list.destination_charging.length; i++){
      let distance = Math.round( list.destination_charging[i].distance_miles * CONSTANTS.MILES_TO_KM *10)/10;
      let compass = device.getCoordinatesBearing( 
        list.destination_charging[i].location.lat, 
        list.destination_charging[i].location.long,
        device.getCapabilityValue('measure_location_latitude'),
        device.getCapabilityValue('measure_location_longitude')
      );
      result.push({
        nr: i+1,
        id: list.destination_charging[i].id,
        name: list.destination_charging[i].name,
        distance:  distance,
        compass: compass,
        latitude: list.destination_charging[i].location.lat,
        longitude: list.destination_charging[i].location.long,
        coordinates: list.destination_charging[i].location.lat+','+list.destination_charging[i].location.long
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

  async onNavigateToDest(session, device, id) {
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

  async getDrivingHistory(session, device) {
    return device.getDrivingHistory();
  }

  async getDrivingHistoryData(session, device) {
    return device.getStoreValue('driving_history');
  }

  async updateDrivingHistoryData(session, device, json) {
    await device.setStoreValue('driving_history', json);
  }

  async clearDrivingHistory(session, device) {
    return device.setStoreValue('driving_history', []);
  }

}