"use strict";
const Homey = require('homey');
const https = require('../../lib/https');
const CONSTANTS = require('../../lib/constants');
const ChildDevice = require('../child_device');
const OpenStreetMap = require('../../lib/OpenStreetMap'); 
const SETTINGS_LOCATIONS_NR = 5;

module.exports = class LocationDevice extends ChildDevice {

  async onInit() {
    await super.onInit();
    this._osm = new OpenStreetMap();
    this.updateLastLocation();

  }

  updateLastLocation(){
    if (this._lastLocation == undefined){
      this._lastLocation = {
        latitude: null,
        longitude: null
      };
    }
    if (this.hasCapability('measure_location_latitude')){
      this._lastLocation.latitude = this.getCapabilityValue('measure_location_latitude');
    }
    if (this.hasCapability('measure_location_longitude')){
      this._lastLocation.longitude = this.getCapabilityValue('measure_location_longitude');
    }
  }

  // SYNC =======================================================================================
  // Read car data. Car must be awake.
  async updateDevice(data){
    await super.updateDevice(data);

    let locationChanged = false;

    // Location
    if (this.hasCapability('location_last_update') && data.drive_state && data.drive_state.timestamp != undefined){
      let time = this._getLocalTimeString(data.drive_state.timestamp);
      await this.setCapabilityValue('location_last_update', time);
    }
    if (this.hasCapability('measure_location_heading') && data.drive_state && data.drive_state.heading != undefined){
      await this.setCapabilityValue('measure_location_heading', data.drive_state.heading);
    }
    if (this.hasCapability('measure_location_latitude') && data.drive_state && data.drive_state.latitude != undefined){
      if (this.getCapabilityValue('measure_location_latitude') != data.drive_state.latitude){
        locationChanged = true;
      }
      await this.setCapabilityValue('measure_location_latitude', data.drive_state.latitude);
    }
    if (this.hasCapability('measure_location_longitude') && data.drive_state && data.drive_state.longitude != undefined){
      if (this.getCapabilityValue('measure_location_longitude') != data.drive_state.longitude){
        locationChanged = true;
      }
      await this.setCapabilityValue('measure_location_longitude', data.drive_state.longitude);
    }
    if (locationChanged){
      let address = await this._osm.getAddress( 
        data.drive_state.latitude, 
        data.drive_state.longitude, 
        this.homey.i18n.getLanguage()
        );
      if (this.hasCapability('location_name')){
        await this.setCapabilityValue('location_name', address.display_name);
      }
      // Trigger Location changed flow
      let tokens = {
        location_latitude: data.drive_state.latitude,
        location_longitude: data.drive_state.longitude,
        location_name: address.display_name,
        location_street: address.street,
        location_city: address.city,
        location_postcode: address.postcode,
        location_country: address.country
      }
      this._flowTriggerLocationChanged.trigger(this, tokens);   

      // Trigger reached/left coordinates flow
      await this.homey.flow.getDeviceTriggerCard('location_coordinates_left_or_reached').trigger(this, tokens);

      // Trigger reached/left Location flow
      if (this.getLocations().length > 0){
        await this.homey.flow.getDeviceTriggerCard('location_left_or_reached').trigger(this, tokens);
      }
    }
    this.updateLastLocation();
  }

  // CAPABILITIES =======================================================================================

  async _onCapability( capabilityValues, capabilityOptions){
    await super. _onCapability( capabilityValues, capabilityOptions);

  }

	// FLOW TRIGGER ======================================================================================
  getAutocompleteLocationList(){
    return this.getLocations();
  }

  async flowTriggerLocationCoordinatesRunListener(args){
    this.log("flowTriggerLocationCoordinatesReachedRunListener()");
    let state = await this._checkFlowTriggerCoordinatesCoordinates(args.latitude, args.longitude, args.url, args.distance);
    return state;
  }

  async flowTriggerLocationRunListener(args){
    this.log("flowTriggerLocationCoordinatesReachedRunListener()");
    // Get settings for argument location.
    let location = this.getLocations().filter(e => {return (e.id == args.location.id)})[0];
    if (location.latitude == 0 || location.latitude == ''){
      location.latitude = undefined;
    }
    if (location.longitude == 0 || location.longitude == ''){
      location.longitude = undefined;
    }
    if (location != undefined && ((location.latitude != undefined && location.longitude != undefined) || location.url != '')){
      let state = await this._checkFlowTriggerCoordinatesCoordinates(location.latitude, location.longitude, location.url, args.distance);
      return state;
    }
    return 'unknown';
  }

  async _checkFlowTriggerCoordinatesCoordinates(latitude, longitude, url, distance){
    if (distance == undefined){
      distance = 100;
    }
    let coord = {};
    if (latitude != undefined && longitude != undefined ){
      coord = {latitude: latitude, longitude: longitude};
    }
    else if (latitude == undefined && longitude == undefined && url != undefined){
      coord = await this.getGoogleMapsCoordinates(url);
    }
    else{
      throw new Error("args not set");
    }
    let distNew = this.getCoordinatesDistance(coord.latitude, coord.longitude, this.getCapabilityValue('measure_location_latitude'), this.getCapabilityValue('measure_location_longitude'));
    let distOld = this.getCoordinatesDistance(coord.latitude, coord.longitude, this._lastLocation.latitude, this._lastLocation.longitude);


    if (distNew > distance && distOld <= distance){
      return 'left';
    }
    if (distNew <= distance && distOld > distance){
      return 'reached';
    }
    if (distNew <= distance && distOld <= distance){
      return 'at_location';
    }
    if (distNew > distance && distOld > distance){
      return 'off_location';
    }
  }
  // FLOW ACTIONS =======================================================================================
  
  // Test for changing coordinates 
  async flowActionSetLocation(latitude, longitude){

    if (this.hasCapability('measure_location_latitude') && latitude != undefined){
      await this.setCapabilityValue('measure_location_latitude', latitude);
    }
    if (this.hasCapability('measure_location_longitude') && longitude != undefined){
      await this.setCapabilityValue('measure_location_longitude', longitude);
    }

    // Trigger reached/left Location flow;
    let address = await this._osm.getAddress( 
      this.getCapabilityValue('measure_location_latitude'), 
      this.getCapabilityValue('measure_location_longitude'), 
      this.homey.i18n.getLanguage()
      );

    let tokens = {
      location_latitude: this.getCapabilityValue('measure_location_latitude'),
      location_longitude: this.getCapabilityValue('measure_location_longitude'),
      location_name: address.display_name,
      location_street: address.street,
      location_city: address.city,
      location_postcode: address.postcode,
      location_country: address.country

    }
    // let args = await this._flowTriggerLocationCoordinatesLeftOrReached.getArgumentValues(this);
    // if (args != undefined && args.length > 0){
      await this.homey.flow.getDeviceTriggerCard('location_coordinates_left_or_reached').trigger(this, tokens);
    // }

    // Trigger reached/left Location flow
    if (this.getLocations().length > 0){
      await this.homey.flow.getDeviceTriggerCard('location_left_or_reached').trigger(this, tokens);
    }
    
    this.updateLastLocation();
  }

  // Device =======================================================================================
  getLocations(){
    let settings = this.getSettings();
    let locations = [];
    for(let i=0; i<SETTINGS_LOCATIONS_NR; i++){
      if (settings['location_0'+i+'_name'] != undefined && 
          settings['location_0'+i+'_name'] != '' &&
          ((
            settings['location_0'+i+'_latitude'] != '' &&
            settings['location_0'+i+'_longitude'] != '' &&
            settings['location_0'+i+'_latitude'] != 0 &&
            settings['location_0'+i+'_longitude'] != 0
          )
          ||
          (
            settings['location_0'+i+'_url'] != ''
          ))
          ){
        let location = {
          id: i,
          name: settings['location_0'+i+'_name'],
          latitude: settings['location_0'+i+'_latitude'],
          longitude: settings['location_0'+i+'_longitude'],
          url: settings['location_0'+i+'_url']
        }
        locations.push(location);
      }
    }
    return locations;
  }

  async onSettings({ oldSettings, newSettings, changedKeys }) {
    this.log(`[Device] ${this.getName()}: settings where changed: ${changedKeys}`);
    this._settings = newSettings;

    if (changedKeys.filter( (e) => { return (e.startsWith('location_')) } )[0].length > 0){
      this.homey.setTimeout( async ()=>{await this._updateLocationSettings();}, 1000 );
    }
  }

  async _updateLocationSettings(){
    let settings = this.getSettings();
    for(let i=0; i<SETTINGS_LOCATIONS_NR; i++){
      if (  settings['location_0'+i+'_url'] != '' && 
            ( settings['location_0'+i+'_latitude'] == '' ||
              settings['location_0'+i+'_latitude'] == 0 )
            &&
            ( settings['location_0'+i+'_longitude'] == '' ||
              settings['location_0'+i+'_longitude'] == 0 )
      ){
        let coord = await this.getGoogleMapsCoordinates(settings['location_0'+i+'_url']);
        let newSettings = {};
        newSettings['location_0'+i+'_latitude'] = Number(coord.latitude);
        newSettings['location_0'+i+'_longitude'] = Number(coord.longitude);
        await this.setSettings(newSettings);
      }
    }
  }

  // HELPERS =======================================================================================
  // From https://www.geodatasource.com/developers/javascript
  getCoordinatesDistance(lat1, lon1, lat2, lon2){
    if (!lat1 || !lon1 || !lat2 || !lon2) {
        return 0;
    }
    var radlat1 = Math.PI * lat1 / 180;
    var radlat2 = Math.PI * lat2 / 180;
    var theta = lon1 - lon2;
    var radtheta = Math.PI * theta / 180;
    var dist = Math.sin(radlat1) * Math.sin(radlat2) + Math.cos(radlat1) * Math.cos(radlat2) * Math.cos(radtheta);
    dist = Math.acos(dist);
    dist = dist * 180 / Math.PI;
    dist = dist * 60 * 1.1515 * 1.609344 * 1000; // result in meters
    dist = dist < 1 ? 0 : Math.round(dist);
    return dist;
  }

  async getGoogleMapsCoordinates(url){

    // unshorten Link
    try{
      // let response = await https.request( 
      //   'GET',
      //   url,
      //   {},
      //   ''
      // );
      this.log("Converting GoogleMaps URL to Lan/Lon: ", url);
      let response = await https.getRedirectUrl( 
        url,
        {}
      );
      this.log("Short URL: ", response);
      let regex = /([-+]?\d{1,2}([.]\d+)?),\s*([-+]?\d{1,3}([.]\d+)?)/;
      let coordinates = regex.exec(response)[0];
      this.log("Coordinates: ", coordinates);
      return {
        latitude: coordinates.split(',')[0],
        longitude: coordinates.split(',')[1]
      }
    }
    catch(error){
      throw Error('Google URL is invalid.')
    }

  }

}