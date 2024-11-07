"use strict";
const Homey = require('homey');
const https = require('../../lib/https');
const CONSTANTS = require('../../lib/constants');
const ChildDevice = require('../child_device');
const OpenStreetMap = require('../../lib/OpenStreetMap'); 
const SETTINGS_LOCATIONS_NR = 5;
const LOCATION_DISTANCE_DEFAULT = 100; // 100 m default distance

module.exports = class LocationDevice extends ChildDevice {

  async onInit() {
    await super.onInit();
    this._osm = new OpenStreetMap();
    // this.updateLastLocation();

  }

  // Device handling =======================================================================================
  getCarDevice(){
    let device = this.homey.drivers.getDriver('car').getDevices().filter(e=>{ return ( e.getData().id == this.getData().id ) })[0];
    if (device == undefined){
      throw new Error('No car device found.');
    }
    return device; 
  }
  
  // updateLastLocation(){
  //   if (this._lastLocation == undefined){
  //     this._lastLocation = {
  //       latitude: null,
  //       longitude: null
  //     };
  //   }
  //   if (this.hasCapability('measure_location_latitude')){
  //     this._lastLocation.latitude = this.getCapabilityValue('measure_location_latitude');
  //   }
  //   if (this.hasCapability('measure_location_longitude')){
  //     this._lastLocation.longitude = this.getCapabilityValue('measure_location_longitude');
  //   }
  // }

  // SYNC =======================================================================================
  // Read car data. Car must be awake.
  async updateDevice(data){
    await super.updateDevice(data);

    let locationChanged = false;
    // this.updateLastLocation();

    let longitude_prev = this.getCapabilityValue('measure_location_longitude');
    if (!longitude_prev){
      longitude_prev = data.drive_state.longitude;
    }
    let latitude_prev = this.getCapabilityValue('measure_location_latitude');
    if (!latitude_prev){
      latitude_prev = data.drive_state.latitude;
    }

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

    if (this.hasCapability('measure_location_distance_from_home')){
      let distance = this.getCoordinatesDistance(data.drive_state.latitude, data.drive_state.longitude, this.homey.geolocation.getLatitude(), this.homey.geolocation.getLongitude());
      distance = Math.round(distance / 10) / 100;
      await this.setCapabilityValue('measure_location_distance_from_home', data.gui_settings.gui_distance_units == 'km/hr' ? distance : distance / CONSTANTS.MILES_TO_KM);
      // Capability units
      let co = {};
      try{
        co = this.getCapabilityOptions("measure_location_distance_from_home");
      }
      catch(error){}
      let distUnit = data.gui_settings.gui_distance_units == 'km/hr' ? 'km' : 'mi';
      if (!co || !co.units || co.units != distUnit){
        co['units'] = distUnit;
        this.setCapabilityOptions('measure_location_distance_from_home', co);
      }

      // Route destination
      if (this.hasCapability('location_route_destination_distance') && 
        data.drive_state && 
        data.drive_state.active_route_destination != undefined &&
        data.drive_state.active_route_miles_to_arrival != undefined){
        await this.setCapabilityValue('location_route_destination_distance', data.gui_settings.gui_distance_units == 'km/hr' ? data.drive_state.active_route_miles_to_arrival : data.drive_state.active_route_miles_to_arrival / CONSTANTS.MILES_TO_KM );
        // Capability units
        let co = {};
        try{
          co = this.getCapabilityOptions("location_route_destination_distance");
        }
        catch(error){}
        let distUnit = data.gui_settings.gui_distance_units == 'km/hr' ? 'km' : 'mi';
        if (!co || !co.units || co.units != distUnit){
          co['units'] = distUnit;
          this.setCapabilityOptions('location_route_destination_distance', co);
        }
      }
      else{
        await this.setCapabilityValue('location_route_destination_distance', null );
      }
      if (this.hasCapability('location_route_destination_time') && 
        data.drive_state && 
        data.drive_state.active_route_destination != undefined &&
        data.drive_state.active_route_minutes_to_arrival != undefined){
        let hh = Math.floor(data.drive_state.active_route_minutes_to_arrival / 60);
        let mm = Math.floor(data.drive_state.active_route_minutes_to_arrival % 60);
        await this.setCapabilityValue('location_route_destination_time', hh + ':' + mm);
      }
      else{
        await this.setCapabilityValue('location_route_destination_time', null);
      }
      if (this.hasCapability('location_route_destination_energy') && 
        data.drive_state && 
        data.drive_state.active_route_destination != undefined &&
        data.drive_state.active_route_energy_at_arrival != undefined){
        await this.setCapabilityValue('location_route_destination_energy', data.drive_state.active_route_energy_at_arrival);
      }
      else{
        await this.setCapabilityValue('location_route_destination_energy', null);
      }
      if (this.hasCapability('location_route_destination_address') && 
        data.drive_state && 
        data.drive_state.active_route_destination != undefined && 
        data.drive_state.active_route_latitude != undefined && 
        data.drive_state.active_route_longitude != undefined){
        let destination_address = await this._osm.getAddress( 
          data.drive_state.active_route_latitude, 
          data.drive_state.active_route_longitude, 
          this.homey.i18n.getLanguage()
        );
        await this.setCapabilityValue('location_route_destination_address', destination_address.display_name);
      }
      else{
        await this.setCapabilityValue('location_route_destination_address', null);
      }
      if (this.hasCapability('location_route_destination_name') && data.drive_state && data.drive_state.active_route_destination != undefined){
        await this.setCapabilityValue('location_route_destination_name', data.drive_state.active_route_destination);
      }
      else{
        await this.setCapabilityValue('location_route_destination_name', null);
      }

    }

    if (locationChanged){

      // let distance = this.getCoordinatesDistance(data.drive_state.latitude, data.drive_state.longitude, this.homey.geolocation.getLatitude(), this.homey.geolocation.getLongitude());
      // await this.setCapabilityValue('measure_location_distance_from_home', distance);

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
      this.homey.flow.getDeviceTriggerCard('location_changed').trigger(this, tokens);
        // .catch(error => {this.log("Error running trigger: location_changed", error.message)} );

      let state = {
        latitude: data.drive_state.latitude,
        longitude: data.drive_state.longitude,
        latitude_prev: latitude_prev,
        longitude_prev: longitude_prev
      }
      // Trigger reached/left coordinates flow
      this.homey.flow.getDeviceTriggerCard('location_coordinates_left_or_reached').trigger(this, tokens, state);
        // .catch(error => {this.log("Error running trigger: location_coordinates_left_or_reached", error.message)} );

      // Trigger reached/left Location flow
      if (this.getLocations().length > 0){
        this.homey.flow.getDeviceTriggerCard('location_left_or_reached').trigger(this, tokens, state);
          // .catch(error => {this.log("Error running trigger: location_left_or_reached", error.message)} );
      }
    }
  }

  // CAPABILITIES =======================================================================================

  async _onCapability( capabilityValues, capabilityOptions){
    await super._onCapability( capabilityValues, capabilityOptions);

  }

  // HISTORY =======================================================================================
  async addDrivingHistory(data){
    let action = 'started';
    if (data.drive_state.shift_state == null || data.drive_state.shift_state == 'P'){
        action = 'stopped';
    }
    let distanceUnit = data.gui_settings.gui_distance_units == 'km/hr' ? 'km' : 'mi';
    let odo = data.gui_settings.gui_distance_units == 'km/hr' ? data.vehicle_state.odometer * CONSTANTS.MILES_TO_KM : data.vehicle_state.odometer;

    // read history
    let hist = this.getStoreValue('driving_history');
    if (hist == undefined){
      hist = [];
    }

    // get location
    let locationName = '';
    try{
      let address = await this._osm.getAddress( 
        data.drive_state.latitude, 
        data.drive_state.longitude, 
        this.homey.i18n.getLanguage()
        );
        if (address.display_name != undefined){
          locationName = address.display_name;
        }
      }
    catch (error){}

    // get time
    let tz = this.homey.clock.getTimezone();
    let timeUtc = new Date();
    let timeUtcString = timeUtc.toLocaleString(this.homey.i18n.getLanguage(), 
    { 
        hour12: false, 
        timeZone: tz,
        hour: "2-digit",
        minute: "2-digit",
        second: "2-digit",
        day: "2-digit",
        month: "2-digit",
        year: "numeric"
    });

    let entry = {};
    switch (action){
      case 'started':
        entry = hist[hist.length - 1];
        if(entry && entry['state'] == 'started'){
          this.log("Driving history entry already existing: ", entry);
        }
        else{
          entry = {
            state: 'started',
            timeStarted: timeUtcString, 
            timeStopped : '',
            socStart: data.charge_state.battery_level,
            socStop: 0,
            socUsed: 0,
            odoStart: odo,
            odoStop: 0,
            distance: 0,
            distanceUnit: distanceUnit,
            locationStart: locationName,
            locationStop: ''
          }
          hist.push(entry);
          this.log("Added driving history entry: ", entry);
        }
        break;

      case 'stopped':
        entry = hist[hist.length - 1];
        if(!entry){
          entry = {
            state: 'stopped',
            timeStarted: '', 
            timeStopped : timeUtcString,
            socStart: 0,
            socStop: data.charge_state.battery_level,
            socUsed: 0,
            odoStart: 0,
            odoStop: odo,
            distance: 0,
            distanceUnit: distanceUnit,
            locationStart: '',
            locationStop: locationName
          }
          hist.push(entry);
          this.log("Added charging history entry: ", entry);
        }
        else{
          entry['state'] = 'stopped';
          entry['timeStopped'] = timeUtcString;
          entry['socStop'] = data.charge_state.battery_level;
          entry['socUsed'] = Math.round(( entry['socStart'] - entry['socStop'] ) * 100)/100;
          entry['odoStop'] = odo;
          entry['distance'] = entry['odoStop'] - entry['odoStart'];
          entry['distanceUnit'] = entry['distanceUnit'];
          entry['locationStop'] = locationName;
          hist[hist.length - 1] = entry;
          this.log("Updated driving history entry: ", entry);
        }
        break;
    }

    await this.setStoreValue('driving_history', hist);

    // trigger flow for history entry
    if (action == 'stopped'){
      let tokens = {
        started: entry['timeStarted'],
        stopped: entry['timeStopped'],
        soc_start: entry['socStart'],
        soc_stop: entry['socStop'],
        soc_used: entry['socUsed'],
        odo_start: entry['odoStart'],
        odo_stop: entry['odoStop'],
        distance: entry['distance'], 
        distance_unit: entry['distanceUnit'], 
        location_start: entry['locationStart'],
        location_stop: entry['locationStop']
      }
      await this.homey.flow.getDeviceTriggerCard('driving_history_entry_added').trigger(this, tokens);
    }
  }


	// FLOW TRIGGER ======================================================================================
  getAutocompleteLocationList(){
    return this.getLocations();
  }

  async getAutocompleteNearbySucList(){
    let result = [];
    let list = await this._getNearbyChargingSites();
    for (let i=0; i<list.superchargers.length; i++){
      result.push({
        id: list.superchargers[i].id,
        name: list.superchargers[i].name, 
        description: list.superchargers[i].available_stalls + '/' + list.superchargers[i].total_stalls + ', '+
              Math.round( list.superchargers[i].distance_miles * CONSTANTS.MILES_TO_KM *10)/10+ ' km',
        
      });
    }
    return result;
  }

  async flowTriggerLocationCoordinatesRunListener(args, state){
    this.log("flowTriggerLocationCoordinatesReachedRunListener()...");
    let locationState = await this._checkFlowTriggerCoordinates(args.latitude, args.longitude, args.url, args.distance, state);
    this.log("flowTriggerLocationReachedRunListener() Previous coordinates: "+ state.longitude_prev +', '+ state.latitude_prev);
    this.log("flowTriggerLocationReachedRunListener() Current coordinates:  "+ state.longitude +', '+ state.latitude) 
    this.log("flowTriggerLocationCoordinatesReachedRunListener() Coordinates: "+args.latitude+", "+args.longitude+" "+args.url+" "+args.distance+"m - State: "+ locationState);
    return locationState;
  }

  async flowTriggerLocationRunListener(args, state){
    this.log("flowTriggerLocationReachedRunListener()...");

    // use current coordinates if not passes as parameter
    if (state == undefined){
      state = {
        latitude: this.getCapabilityValue('measure_location_latitude'),
        longitude: this.getCapabilityValue('measure_location_longitude'),
        latitude_prev: this.getCapabilityValue('measure_location_latitude'),
        longitude_prev: this.getCapabilityValue('measure_location_longitude')
      };
    }

    // Get settings for argument location.
    let location = this.getLocations().filter(e => {return (e.id == args.location.id)})[0];
    if (location.latitude == 0 || location.latitude == ''){
      location.latitude = undefined;
    }
    if (location.longitude == 0 || location.longitude == ''){
      location.longitude = undefined;
    }
    if (location != undefined && ((location.latitude != undefined && location.longitude != undefined) || location.url != '')){
      let locationState = await this._checkFlowTriggerCoordinates(location.latitude, location.longitude, location.url, args.distance, state);
      this.log("flowTriggerLocationReachedRunListener() Previous coordinates: "+ state.longitude_prev +', '+ state.latitude_prev);
      this.log("flowTriggerLocationReachedRunListener() Current coordinates:  "+ state.longitude +', '+ state.latitude) 
      this.log("flowTriggerLocationReachedRunListener() Location: "+location.name+" Coordinates: "+location.latitude+", "+location.longitude+" "+location.url+" "+args.distance+" m - State: "+ locationState);
      return locationState;
    }
    return 'unknown';
  }

  async _checkFlowTriggerCoordinates(latitude, longitude, url, distance, state){
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
    let distNew = this.getCoordinatesDistance(coord.latitude, coord.longitude, state.latitude, state.longitude);
    let distOld = this.getCoordinatesDistance(coord.latitude, coord.longitude, state.latitude_prev, state.longitude_prev);


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

	// FLOW CONDITIONS ======================================================================================
  async flowConditionLocationOnSiteRunListener(args){
    let state = await this.flowTriggerLocationRunListener(args);
    return (state  == 'at_location');
  }

  async flowConditionLocationOnTheWayRunListener(args){
    
    // use current coordinates as parameter
    let locationState = {
        latitude: this.getCapabilityValue('measure_location_latitude'),
        longitude: this.getCapabilityValue('measure_location_longitude'),
        latitude_prev: this.getCapabilityValue('measure_location_latitude'),
        longitude_prev: this.getCapabilityValue('measure_location_longitude')
    };

    let locations = this.getLocations();
    for (let i=0; i<locations.length; i++){
      let location = locations[i];
      let state = await this._checkFlowTriggerCoordinates(location.latitude, location.longitude, location.url, LOCATION_DISTANCE_DEFAULT, locationState);
      this.log("flowConditionLocationOnTheWayRunListener() Coordinates: "+location.latitude+","+location.longitude+" "+location.url+" "+args.distance+"m - State: "+ state);
      if (state == 'at_location'){
        return false;
      }
    }
    
    return true;
  }

  // Device =======================================================================================
  async isAtLocation(id){
    let args = {
      location:{
        id: id
      }
     };
    let state = await this.flowTriggerLocationRunListener(args);
    return (state  == 'at_location');
  }

  getLocations(){
    let settings = this.getSettings();
    let locations = [];

    // Add Homey location aas default, needs location permission
    try{
      let location = {
        id: 0,
        name: this.homey.__('devices.location.homey_location_name'),
        latitude: this.homey.geolocation.getLatitude(),
        longitude: this.homey.geolocation.getLongitude(),
        url: ''
      }
      locations.push(location);
    }
    catch(error){
      this.log("Error reading Homey location: ", error.message);
    };

    for(let i=1; i<=SETTINGS_LOCATIONS_NR; i++){
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

  async getNearbyChargingSites(count, radius){
    return await this._getNearbyChargingSites(count, radius);
  }

  async navigateToSuc(sucId){
    await this._commandNavigateScRequest(sucId);
  }

  async onSettings({ oldSettings, newSettings, changedKeys }) {
    this.log(`[Device] ${this.getName()}: settings where changed: ${changedKeys}`);
    this._settings = newSettings;

    for(let i=0; i<SETTINGS_LOCATIONS_NR; i++){
      let updated = false;
      for (let j=0; j<changedKeys.length; j++){
        if (changedKeys[j] == 'location_0'+(i+1)+'_url'){
          this.homey.setTimeout( async ()=>{await this._updateLocationSetting(i+1);}, 1000 );
          updated = true;
        }
      }
      if (!updated){
        if (
          newSettings['location_0'+(i+1)+'_url'] != '' &&
          ( newSettings['location_0'+(i+1)+'_latitude'] == '' || newSettings['location_0'+(i+1)+'_latitude'] == 0 ||
            newSettings['location_0'+(i+1)+'_longitude'] == '' || newSettings['location_0'+(i+1)+'_longitude'] == 0 )
        ){
          this.homey.setTimeout( async ()=>{await this._updateLocationSetting(i+1);}, 1000 );
        }
      }
    }

    // if (changedKeys.filter( (e) => { return (e.startsWith('location_')) } )[0].length > 0){
    //   this.homey.setTimeout( async ()=>{await this._updateLocationSettings();}, 1000 );
    // }
  }

  async _updateLocationSettings(){
    for(let i=1; i<=SETTINGS_LOCATIONS_NR; i++){
      if (  settings['location_0'+i+'_url'] != '' && 
            ( settings['location_0'+i+'_latitude'] == '' ||
              settings['location_0'+i+'_latitude'] == 0 )
            &&
            ( settings['location_0'+i+'_longitude'] == '' ||
              settings['location_0'+i+'_longitude'] == 0 )
      ){
        try{
          let coord = await this.getGoogleMapsCoordinates(settings['location_0'+i+'_url']);
          let newSettings = {};
          newSettings['location_0'+i+'_latitude'] = Number(coord.latitude);
          newSettings['location_0'+i+'_longitude'] = Number(coord.longitude);
          await this.setSettings(newSettings);
        }
        catch(error){
          this.log("Error updating settings coordinates by Google URL");
        }
      }
    }
  }

  async _updateLocationSetting(id){
    let settings = this.getSettings();
    if (  settings['location_0'+id+'_url'] != ''){
      try{
        let coord = await this.getGoogleMapsCoordinates(settings['location_0'+id+'_url']);
        let newSettings = {};
        newSettings['location_0'+id+'_latitude'] = Number(coord.latitude);
        newSettings['location_0'+id+'_longitude'] = Number(coord.longitude);
        await this.setSettings(newSettings);
      }
      catch(error){
        this.log("Error updating settings coordinates by Google URL");
      }
    }
  }

  getDrivingHistory(){
    let hist = this.getStoreValue('driving_history');
    let result = [];
    for (let i=hist.length-1; i>=0; i--){
      hist[i]['id'] = hist.length -i;
      hist[i]['distance'] = Math.round(hist[i]['distance'] * 10) / 10;
      result.push(hist[i]);
    }
    return hist;
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

  getCoordinatesBearing(lat1, lon1, lat2, lon2) {
    var radians = getAtan2((lon1 - lon2), (lat1 - lat2));

    function getAtan2(y, x) {
        return Math.atan2(y, x);
    };

    var compassReading = radians * (180 / Math.PI);

    var coordNames = ["N", "NE", "E", "SE", "S", "SW", "W", "NW", "N"];
    var coordIndex = Math.round(compassReading / 45);
    if (coordIndex < 0) {
        coordIndex = coordIndex + 8
    };

    return coordNames[coordIndex]; // returns the coordinate value
  }

  async getGoogleMapsCoordinates(url){

    // unshorten Link
    try{
      let coordinates;
      // let regex = /([-+]?\d{1,2}([.]\d+)?),\s*([-+]?\d{1,3}([.]\d+)?)/;
      let regex = /(?<=[\/|\/@])([-+]?\d{1,2}([.]\d+)?),\s*([-+]?\d{1,3}([.]\d+)?)/;

      // try to read long URL (including coordinates)
      let coordinatesArray = regex.exec(url);
      if (coordinatesArray && coordinatesArray[0]){
        coordinates = coordinatesArray[0];
        this.log("Coordinates: ", coordinates);
        if (coordinates.split(',')[0] != undefined && coordinates.split(',')[1] != undefined){
          return {
            latitude: coordinates.split(',')[0],
            longitude: coordinates.split(',')[1]
          }
        }
      }

      // If not found, try to read/convert short link
      this.log("Converting GoogleMaps URL to Lan/Lon: ", url);
      let response = await https.getRedirectUrl( 
        url,
        {}
      );
      this.log("Short URL: ", response);
      coordinates = regex.exec(response)[0];
      this.log("Coordinates: ", coordinates);
      return {
        latitude: coordinates.split(',')[0],
        longitude: coordinates.split(',')[1]
      }
    }
    catch(error){
      this.log(error.message);
      throw Error('Google URL is invalid.')
    }

  }

  // Commands =======================================================================================
  async _commandNavigateGpsRequest(latitude, longitude, order){
    // locale: like 'de-DE'
    // time: Unix epoch time in ms
    let locale = this.homey.i18n.getLanguage();
    let time = Date.now().toString();
    await this.getCarDevice().sendCommand('commandNavigateGpsRequest', {latitude, longitude, order, locale, time});
  }

  async _commandNavigationRequest(request){
    // locale: like 'de-DE'
    // time: Unix epoch time in ms
    let locale = this.homey.i18n.getLanguage();
    let time = Date.now().toString();
    await this.getCarDevice().sendCommand('commandNavigationRequest', {request, locale, time});
  }

  async _commandNavigateScRequest(sucId, order){
    await this.getCarDevice().sendCommand('commandNavigateScRequest', {sucId, order});
  }
  
  async _getNearbyChargingSites(count = 20, radius = Math.round(100/CONSTANTS.MILES_TO_KM)){
    await this.getCarDevice().wakeUpIfNeeded();
    return await this.getCarDevice().getRequest('getNearbyChargingSites', {count, radius});
  }

  // FLOW ACTIONS =======================================================================================

  // // Test for changing coordinates 
  async flowActionSetLocation(latitude, longitude){

    let longitude_prev = this.getCapabilityValue('measure_location_longitude');
    let latitude_prev = this.getCapabilityValue('measure_location_latitude');

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

    let state = {
      latitude: latitude,
      longitude: longitude,
      latitude_prev: latitude_prev,
      longitude_prev: longitude_prev
    }

    // let args = await this._flowTriggerLocationCoordinatesLeftOrReached.getArgumentValues(this);
    // if (args != undefined && args.length > 0){
      await this.homey.flow.getDeviceTriggerCard('location_coordinates_left_or_reached').trigger(this, tokens, state);
    // }

    // Trigger reached/left Location flow
    if (this.getLocations().length > 0){
      await this.homey.flow.getDeviceTriggerCard('location_left_or_reached').trigger(this, tokens, state);
    }
  }

  async flowActionNavigateToLocation(args){
    let coordinates = {};
    let location = this.getLocations().filter(e => {return (e.id == args.location.id)})[0];
    if (location.latitude == 0 || location.latitude == ''){
      location.latitude = undefined;
    }
    if (location.longitude == 0 || location.longitude == ''){
      location.longitude = undefined;
    }
    if (location.longitude != undefined && location.latitude != undefined ){
      coordinates['longitude'] = location.longitude;
      coordinates['latitude'] = location.latitude;
    }
    else if (location.url != undefined){
      coordinates = await this.getGoogleMapsCoordinates(location.url)
    }
    if (coordinates.longitude == undefined || coordinates.latitude == undefined){
      throw new Error('No coordinates set');
    }
    if (typeof coordinates.latitude == 'string'){
      coordinates.latitude = Number(coordinates.latitude);
    }
    if (typeof coordinates.longitude == 'string'){
      coordinates.longitude = Number(coordinates.longitude);
    }
    await this._commandNavigateGpsRequest(coordinates.latitude, coordinates.longitude);
  }

  async flowActionNavigateToCoordinates(args){
    let coordinates = {
      latitude: args.latitude,
      longitude: args.longitude
    };
    if (args.latitude == 0 || args.latitude == ''){
      coordinates.latitude = undefined;
    }
    if (args.longitude == 0 || args.longitude == ''){
      coordinates.longitude = undefined;
    }
    if ( (coordinates.longitude == undefined || coordinates.latitude == undefined) && args.url != undefined ){
      coordinates = await this.getGoogleMapsCoordinates(args.url)
    }
    if (coordinates.longitude == undefined || coordinates.latitude == undefined){
      throw new Error('No coordinates set');
    }
    if (typeof coordinates.latitude == 'string'){
      coordinates.latitude = Number(coordinates.latitude);
    }
    if (typeof coordinates.longitude == 'string'){
      coordinates.longitude = Number(coordinates.longitude);
    }
    await this._commandNavigateGpsRequest(coordinates.latitude, coordinates.longitude, args.order);
  }

  async flowActionNavigationRequest(request){
    await this._commandNavigationRequest(request);
  }

  async flowActionNavigateToSuc(sucId, order){
    await this._commandNavigateScRequest(sucId, order);
  }

}