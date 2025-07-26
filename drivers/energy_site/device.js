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

        this.setClass(this.homey.app.manifest.drivers.filter((e) => {return (e.id == this.driver.id);})[0].class);
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
        // energySite["siteInfo"] = await this.oAuth2Client.getEnergySiteInfo(this.getData().id);
        energySite["liveStatus"] = await this.oAuth2Client.getEnergySiteLiveStatus(this.getData().id);
        energySite["historyDays"] = await this.oAuth2Client.getEnergySiteHistoryDays(this.getData().id);
        // this.log("EnergySite data: ", energySite);

        // Device Update
        if (energySite["liveStatus"] != undefined && energySite["liveStatus"].grid_power != undefined) {
            this.setCapabilityValue('measure_power', energySite["liveStatus"].grid_power);
        }
        if (energySite["liveStatus"] != undefined && energySite["liveStatus"].load_power != undefined) {
            this.setCapabilityValue('measure_power_load', energySite["liveStatus"].load_power);
        }

        // Device meter update
        if (energySite["historyDays"] != undefined) {
            let yesterday = energySite["historyDays"].time_series[0];
            let today = energySite["historyDays"].time_series[1];
            if (yesterday != undefined && today != undefined) {
                let lastMeter = this.getStoreValue('energy_meter_yesterday') || {};
                if (lastMeter.timestamp != yesterday.timestamp) {
                    // new day, add yester consumption to history and save
                    if (lastMeter.timestamp == undefined){
                        // Initial object, copy yesterday data
                        lastMeter = JSON.parse(JSON.stringify(yesterday)) || {};
                    }
                    else{
                        // Add yesterday data to history
                        lastMeter["timestamp"] = yesterday.timestamp;
                        lastMeter["solar_energy_exported"] += yesterday.solar_energy_exported;
                        lastMeter["generator_energy_exported"] += yesterday.generator_energy_exported;
                        lastMeter["grid_energy_imported"] += yesterday.grid_energy_imported;
                        lastMeter["grid_services_energy_imported"] += yesterday.grid_services_energy_imported;
                        lastMeter["grid_services_energy_exported"] += yesterday.grid_services_energy_exported;
                        lastMeter["grid_energy_exported_from_solar"] += yesterday.grid_energy_exported_from_solar;
                        lastMeter["grid_energy_exported_from_generator"] += yesterday.grid_energy_exported_from_generator;
                        lastMeter["grid_energy_exported_from_battery"] += yesterday.grid_energy_exported_from_battery;
                        lastMeter["battery_energy_exported"] += yesterday.battery_energy_exported;
                        lastMeter["battery_energy_imported_from_grid"] += yesterday.battery_energy_imported_from_grid;
                        lastMeter["battery_energy_imported_from_solar"] += yesterday.battery_energy_imported_from_solar;
                        lastMeter["battery_energy_imported_from_generator"] += yesterday.battery_energy_imported_from_generator;
                        lastMeter["consumer_energy_imported_from_grid"] += yesterday.consumer_energy_imported_from_grid;
                        lastMeter["consumer_energy_imported_from_solar"] += yesterday.consumer_energy_imported_from_solar;
                        lastMeter["consumer_energy_imported_from_battery"] += yesterday.consumer_energy_imported_from_battery;
                        lastMeter["consumer_energy_imported_from_generator"] += yesterday.consumer_energy_imported_from_generator;
                    }

                    this.setStoreValue('energy_meter_yesterday', lastMeter);
                }
                // now add today usage to history, to get current meter values
                let currentMeter = JSON.parse(JSON.stringify(today)) || {};;
                currentMeter["solar_energy_exported"] += lastMeter.solar_energy_exported;
                currentMeter["generator_energy_exported"] += lastMeter.generator_energy_exported;
                currentMeter["grid_energy_imported"] += lastMeter.grid_energy_imported;
                currentMeter["grid_services_energy_imported"] += lastMeter.grid_services_energy_imported;
                currentMeter["grid_services_energy_exported"] += lastMeter.grid_services_energy_exported;
                currentMeter["grid_energy_exported_from_solar"] += lastMeter.grid_energy_exported_from_solar;
                currentMeter["grid_energy_exported_from_generator"] += lastMeter.grid_energy_exported_from_generator;
                currentMeter["grid_energy_exported_from_battery"] += lastMeter.grid_energy_exported_from_battery;
                currentMeter["battery_energy_exported"] += lastMeter.battery_energy_exported;
                currentMeter["battery_energy_imported_from_grid"] += lastMeter.battery_energy_imported_from_grid;
                currentMeter["battery_energy_imported_from_solar"] += lastMeter.battery_energy_imported_from_solar;
                currentMeter["battery_energy_imported_from_generator"] += lastMeter.battery_energy_imported_from_generator;
                currentMeter["consumer_energy_imported_from_grid"] += lastMeter.consumer_energy_imported_from_grid;
                currentMeter["consumer_energy_imported_from_solar"] += lastMeter.consumer_energy_imported_from_solar;
                currentMeter["consumer_energy_imported_from_battery"] += lastMeter.consumer_energy_imported_from_battery;
                currentMeter["consumer_energy_imported_from_generator"] += lastMeter.consumer_energy_imported_from_generator;
                // calculated summary values
                currentMeter['grid_energy_exported'] =      currentMeter['grid_energy_exported_from_solar'] + 
                                                            currentMeter['grid_energy_exported_from_generator'] + 
                                                            currentMeter['grid_energy_exported_from_battery'];
                currentMeter['battery_energy_imported'] =   currentMeter['battery_energy_imported_from_grid'] + 
                                                            currentMeter['battery_energy_imported_from_solar'] + 
                                                            currentMeter['battery_energy_imported_from_generator'];

                currentMeter['consumer_energy_imported'] =  currentMeter['consumer_energy_imported_from_grid'] + 
                                                            currentMeter['consumer_energy_imported_from_solar'] + 
                                                            currentMeter['consumer_energy_imported_from_battery'] + 
                                                            currentMeter['consumer_energy_imported_from_generator'];
                // calculate today summary values
                today['grid_energy_exported'] =             today['grid_energy_exported_from_solar'] + 
                                                            today['grid_energy_exported_from_generator'] + 
                                                            today['grid_energy_exported_from_battery'];
                today['battery_energy_imported'] =          today['battery_energy_imported_from_grid'] + 
                                                            today['battery_energy_imported_from_solar'] + 
                                                            today['battery_energy_imported_from_generator'];

                today['consumer_energy_imported'] =         today['consumer_energy_imported_from_grid'] + 
                                                            today['consumer_energy_imported_from_solar'] + 
                                                            today['consumer_energy_imported_from_battery'] + 
                                                            today['consumer_energy_imported_from_generator'];
                
                this.log("Energy meter:", currentMeter);
                this.log("Energy today:", today);
                this.log("Energy yesterday:", yesterday);
                energySite["currentMeter"] = currentMeter;
                energySite["todayMeter"] = today;
                energySite["yesterdayMeter"] = yesterday;

                // main meter (hidden) for HomeyEnergy
                this.setCapabilityValue("meter_power.grid_imported", currentMeter["grid_energy_imported"]/1000);
                this.setCapabilityValue("meter_power.grid_exported", currentMeter["grid_energy_exported"]/1000);
                
                // Energy today
                this.setCapabilityValue("meter_power_grid_imported", today["grid_energy_imported"]/1000);
                this.setCapabilityValue("meter_power_grid_exported", today["grid_energy_exported"]/1000);
            }
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