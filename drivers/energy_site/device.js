const TeslaOAuth2Device = require('../../lib/TeslaOAuth2Device');
const Homey = require('homey');
const CAPABILITY_DEBOUNCE = 500;
const DEFAULT_SYNC_INTERVAL = 1000 * 60 * 10; // 10 min

module.exports = class EnergySiteDevice extends TeslaOAuth2Device {

    async onOAuth2Init() {
        this.log("onOAuth2Init()");
        await super.onOAuth2Init();

        // Update device
        await this._updateCapabilities();
        await this._updateDeviceConfig();
        
        this.registerMultipleCapabilityListener(this.getCapabilities(), async (capabilityValues, capabilityOptions) => {
            await this._onCapability( capabilityValues, capabilityOptions);
        }, CAPABILITY_DEBOUNCE);

        this._settings = this.getSettings();

        await this._startSync();
        this._sync();
    }

    async onOAuth2Uninit(){
        await this._stopSync();
        await this._stopApiCounterResetTimer();
    }

    async onOAuth2Deleted() {
    }

    async onOAuth2Saved() {
        // check if settings are already read. If not, device is not initialized yet after pairing
        if (!this._settings) return;

        this.log("onOAuth2Saved()");
        this._startSync();
        this._sync();
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

    async _updateDeviceConfig(){
        // Energy settings
        let energy = JSON.parse(JSON.stringify(this.getEnergy())) || {};
        energy = this.homey.app.manifest.drivers.filter((e) => {return (e.id == this.driver.id);})[0].energy;
        await this.setEnergy( energy );
    }

    // SYNC Logic =======================================================================================
    async _startSync(){
        await this._stopSync();
        if (!this._settings || !this._settings.polling_active){
        return;
        }
        let interval = DEFAULT_SYNC_INTERVAL;
        if (this._settings.polling_interval > 0){
            interval = this._settings.polling_interval * 1000;
        }
        if (this._settings.polling_unit == 'min'){
            interval = interval * 60;
        }
        this.log(`[Device] ${this.getName()}: Start Poll interval: ${interval} msec.`);

        this._syncInterval = this.homey.setInterval(() => this._sync(), interval);
    }

    async _stopSync(){
        if (this._syncInterval) {
        this.homey.clearInterval(this._syncInterval);
        this._syncInterval = undefined;
        }
    }

    // SYNC =======================================================================================
    async _sync() {
        this.log("EnergySite sync...");
        try{
            // update the device
            await this.getEnergySiteData();
            await this.setAvailable();
            this.log("EnergySite sync done.");
        }
        catch(error){
            this.log("Device update error (EnergySite._sync()): ID: "+this.getData().id+" Name: "+this.getName()+" Error: "+error.message);
            await this.setUnavailable(error.message);
        }
    }

    async getEnergySiteData(){
        let energySite = {};
        energySite["siteInfo"] = await this.oAuth2Client.getEnergySiteInfo(this.getData().id);
        energySite["liveStatus"] = await this.oAuth2Client.getEnergySiteLiveStatus(this.getData().id);
        // this.log("EnergySite data: ", energySite);

        // Device Update
        if (energySite["liveStatus"] != undefined && energySite["liveStatus"].grid_power != undefined) {
            this.setCapabilityValue('measure_power', energySite["liveStatus"].grid_power);
        }
        if (energySite["liveStatus"] != undefined && energySite["liveStatus"].load_power != undefined) {
            this.setCapabilityValue('measure_power_load', energySite["liveStatus"].load_power);
        }

        // Update child devices
        let batteryDevice = this.homey.drivers.getDriver('energy_battery').getDevices().filter(e => {return (e.getData().id == this.getData().id)})[0];
        if (batteryDevice){
            this.log("Update energy battery device...");
            await batteryDevice.updateDevice(energySite);
        }

        let solarDevice = this.homey.drivers.getDriver('energy_solar').getDevices().filter(e => {return (e.getData().id == this.getData().id)})[0];
        if (solarDevice){
            this.log("Update energy solar device...");
            await solarDevice.updateDevice(energySite);
        }

    }
}