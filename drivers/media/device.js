"use strict";
const Homey = require('homey');

const CONSTANTS = require('../../lib/constants');
const ChildDevice = require('../child_device');

module.exports = class MediaDevice extends ChildDevice {

  async onInit() {
    await super.onInit();

    // local buffer
    this._maxVolume = 11; // max. allowed volume
  }

  // Device handling =======================================================================================
  getCarDevice(){
    let device = this.homey.drivers.getDriver('car').getDevices().filter(e=>{ return ( e.getData().id == this.getData().id ) })[0];
    if (device == undefined){
      throw new Error('No car device found.');
    }
    return device; 
  }
  
  // SYNC =======================================================================================
  // Read car data. Car must be awake.
  async updateDevice(data){
    await super.updateDevice(data);

    if (!data.vehicle_state){
      return;
    }

    // Media information
    if (this.hasCapability('speaker_playing') && data.vehicle_state && data.vehicle_state.media_info && data.vehicle_state.media_info.media_playback_status != undefined){
      await this.setCapabilityValue('speaker_playing', ( data.vehicle_state.media_info.media_playback_status == CONSTANTS.MEDIA_PLAYBACK_STATE_PLAYING ));
      // states:
      // Playing
      // Stopped
      // ...?
    }
    if (this.hasCapability('speaker_artist') && data.vehicle_state && data.vehicle_state.media_info && data.vehicle_state.media_info.now_playing_artist != undefined){
      await this.setCapabilityValue('speaker_artist', data.vehicle_state.media_info.now_playing_artist);
    }
    if (this.hasCapability('speaker_album') && data.vehicle_state && data.vehicle_state.media_info && data.vehicle_state.media_info.now_playing_album != undefined){
      await this.setCapabilityValue('speaker_album', data.vehicle_state.media_info.now_playing_album);
    }
    if (this.hasCapability('speaker_track') && data.vehicle_state && data.vehicle_state.media_info && data.vehicle_state.media_info.now_playing_title != undefined){
      await this.setCapabilityValue('speaker_track', data.vehicle_state.media_info.now_playing_title);
    }
    if (this.hasCapability('speaker_duration') && data.vehicle_state && data.vehicle_state.media_info && data.vehicle_state.media_info.now_playing_duration != undefined){
      await this.setCapabilityValue('speaker_duration', data.vehicle_state.media_info.now_playing_duration);
    }
    if (this.hasCapability('speaker_position') && data.vehicle_state && data.vehicle_state.media_info && data.vehicle_state.media_info.now_playing_elapsed != undefined){
      await this.setCapabilityValue('speaker_position', data.vehicle_state.media_info.now_playing_elapsed);
    }
    
    // Volume
    if (this.hasCapability('volume_set') && data.vehicle_state && data.vehicle_state.media_info && data.vehicle_state.media_info.audio_volume != undefined){
      let volume = data.vehicle_state.media_info.audio_volume / data.vehicle_state.media_info.audio_volume_max;
      this._maxVolume = data.vehicle_state.media_info.audio_volume_max;
      await this.setCapabilityValue('volume_set', volume);
    }
  }

  // Commands =======================================================================================
  async _commandMediaNextTrack(){
    await this.getCarDevice().sendCommand('commandMediaNextTrack', {});
  }
  async _commandMediaPrevTrack(){
    await this.getCarDevice().sendCommand('commandMediaPrevTrack', {});
  }
  async _commandMediaTogglePlayback(){
    await this.getCarDevice().sendCommand('commandMediaTogglePlayback', {});
  }
  async _commandMediaAdjustVolume(volume){
    await this.getCarDevice().sendCommand('commandMediaAdjustVolume', {volume});
  }
  async _commandMediaNextFav(){
    await this.getCarDevice().sendCommand('commandMediaNextFav', {});
  }
  async _commandMediaPrevFav(){
    await this.getCarDevice().sendCommand('commandMediaPrevFav', {});
  }

  // CAPABILITIES =======================================================================================
  async _onCapability( capabilityValues, capabilityOptions){
    await super. _onCapability( capabilityValues, capabilityOptions);

    if( capabilityValues["speaker_next"] != undefined){
      await this._commandMediaNextTrack();
    }
    if( capabilityValues["speaker_prev"] != undefined){
      await this._commandMediaPrevTrack();
    }
    if( capabilityValues["speaker_playing"] != undefined){
      await this._commandMediaTogglePlayback();
      this.setCapabilityValue('speaker_playing', !capabilityValues["speaker_playing"]);
    }
    if( capabilityValues["volume_set"] != undefined){
      let volume = capabilityValues["volume_set"] * this._maxVolume;
      await this._commandMediaAdjustVolume(volume);
    }


  }

	// FLOW TRIGGER ======================================================================================

	// FLOW CONDITIONS ======================================================================================

  // Device =======================================================================================
  // async onSettings({ oldSettings, newSettings, changedKeys }) {
  //   this.log(`[Device] ${this.getName()}: settings where changed: ${changedKeys}`);
  //   this._settings = newSettings;

  // }


  // HELPERS =======================================================================================

  // Commands =======================================================================================
  // async _commandNavigateGpsRequest(latitude, longitude, order){
  //   await this.getCarDevice().sendCommand('commandNavigateGpsRequest', {latitude, longitude, order, locale, time});
  // }

  // FLOW ACTIONS =======================================================================================
  async flowActionMediaNextFav(){
    await this._commandMediaNextFav();
  }

  async flowActionMediaPrevFav(){
    await this._commandMediaPrevFav();
  }

}