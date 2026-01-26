const EventHandler = require('./EventHandler');
const MqttMini = require('./MqttMini.js');

class TeslaTelemetryMqtt {
    constructor(mqttParameters) {
        if (!mqttParameters) {
            throw new Error('mqttParameters is required');
        }
        this._mqttParameters = mqttParameters;
        this._mqttClient = null;

        this.onTelemetryMessage = new EventHandler('telemetryMessage');
        this.onTelemetryConnectionStatus = new EventHandler('telemetryConnectionStatus');
    }

    /**
     * @param {string} vin
     * @param {string|function} token
     *   - string: static token
     *   - function: () => string | Promise<string> (dynamic token provider)
     * @param {string} clientId
     */
    async connect(vin, token, clientId) {
        if (!vin || !token) {
            throw new Error('VIN and token are required');
        }

        // close existing client if any
        if (this._mqttClient) {
            try {
                await this._mqttClient.close();
            } catch (e) {
                console.log("MQTT previous client close error:", e.message);
            }
        }

        this._mqttRootTopic = this._mqttParameters.mqttTopicRoot + "/" + vin;

        // Decide between static password and dynamic getPassword
        let password = undefined;
        let getPassword = undefined;

        if (typeof token === 'function') {
            // dynamic token provider
            getPassword = async () => {
                const t = await token();
                return t;
            };
        } else {
            // static token
            password = token;
        }

        this._mqttClient = new MqttMini({
            host: this._mqttParameters.mqttHost,
            port: this._mqttParameters.mqttPort,
            tls: true,
            tlsOptions: {
                // ca: this._mqttParameters.mqttCa,          // trust store (if needed)
                // cert: fs.readFileSync("client.crt"),    // for mTLS
                // key: fs.readFileSync("client.key"),     // for mTLS
                // servername: "your-broker-dns-name",     // SNI, sometimes needed
                rejectUnauthorized: false,                // default true; set false only for testing
            },
            topic: this._mqttParameters.mqttTopicRoot + "/" + vin + "/#",
            clientId: clientId,
            username: vin,
            password,          // static password if provided
            getPassword,       // dynamic password callback (if token was a function)
        });

        this._mqttClient
            .onStatus((s, extra) => this._onMqttStatus(s, extra))
            .onMessage((t, p) => this._onMqttMessage(t, p));

        try {
            await this._mqttClient.connect();
        } catch (error) {
            console.log("MQTT Connect error: ", error.message);
            throw error;
        }
    }

    async disconnect() {
        if (!this._mqttClient) return;
        await this._mqttClient.close();
        this._mqttClient = null;
    }

    isConnected() {
        return this._mqttClient ? this._mqttClient.isReady() : false;
    }

    getStatus() {
        return this._mqttClient ? this._mqttClient.getStatus() : null;
    }

    async _onMqttStatus(status, extra) {
        console.log("MQTT [status]", status, extra || "");
        // you can emit connection status here if you want (ready/disconnected/reconnect_scheduled, etc.)
    }

    async _onMqttMessage(topic, value) {
        console.log("MQTT [msg]", topic, value);

        const subTopic = topic.replace(this._mqttRootTopic + "/", "");
        const topicParts = subTopic.split("/");

        if (topicParts[0] == this._mqttParameters.mqttTopicVehicle) {
            const field = topicParts[1];
            const vehicleData = this._convertMessage({
                field: field,
                value: value
            });
            this.onTelemetryMessage.emit({
                field: field,
                value: value,
                vehicleData: vehicleData
            }).catch(error => console.log("MQTT message error", error.message));
        }
        else if (topicParts[0] == this._mqttParameters.mqttTopicConnection) {
            const status = value.Status;
            this.onTelemetryConnectionStatus.emit({
                status: status
            }).catch(error => console.log("MQTT message error", error.message));
        }
    }

    _convertMessage(message) {
        let json = {
            "telemetry": {
                "field": message.field,
                "value": message.value,
            },
            "charge_state": {}, 
            "drive_state": {}, 
            "vehicle_state": {}, 
            "climate_state": {},
            "powertrain_state": {},
        };
        switch (message.field) {
            // Telemetry specific data
            // Settimngs
            case 'SettingDistanceUnit':
                if (!json.gui_settings){
                    json["gui_settings"] = {};
                }
                switch (message.value) {
                    case 'DistanceUnitKilometers':
                        json["gui_settings"]["gui_distance_units"] = 'km/hr';
                        break;
                    case 'DistanceUnitMiles':
                        json["gui_settings"]["gui_distance_units"] = 'mi/hr';
                        break;
                }                
                break;
            case 'SettingTemperatureUnit':
                if (!json.gui_settings){
                    json["gui_settings"] = {};
                }
                switch (message.value) {
                    case 'TemperatureUnitCelsius':
                        json["charge_state"]["gui_temperature_units"] = 'C';
                        break;
                    case 'TemperatureUnitFahrenheit':
                        json["gui_settings"]["gui_distance_units"] = 'F';
                        break;
                }                
                break;
            case 'SettingTirePressureUnit':
                if (!json.gui_settings){
                    json["gui_settings"] = {};
                }
                switch (message.value) {
                    case 'PressureUnitBar':
                        json["charge_state"]["gui_tirepressure_units"] = 'Bar';
                        break;
                    case 'PressureUnitPsi':
                        json["gui_settings"]["gui_tirepressure_units"] = 'Psi';
                        break;
                }                
                json["charge_state"]["gui_tirepressure_units"] = message.value;
                break;
            // Charger
            case 'DCChargingPower':
                json["charge_state"]["charger_power_dc"] = message.value;
                break;
            case 'ACChargingPower':
                json["charge_state"]["charger_power_ac"] = message.value;
                break;
            case 'ModuleTempMax':
                json["charge_state"]["module_temp_max"] = message.value;
                break;
            case 'ModuleTempMin':
                json["charge_state"]["module_temp_min"] = message.value;
                break;
            case 'BmsFullchargecomplete':
                json["charge_state"]["bms_full_charge_complete"] = message.value;
                break;
            case 'BMSState':
                switch (message.value) {
                    case 'BMSStateUnknown':
                        json["charge_state"]["bms_state"] = "Unknown";
                        break;
                    case 'BMSStateStandby':
                        json["charge_state"]["bms_state"] = "Standby";
                        break;
                    case 'BMSStateDrive':
                        json["charge_state"]["bms_state"] = "Drive";
                        break;
                    case 'BMSStateSupport':
                        json["charge_state"]["bms_state"] = "Support";
                        break;
                    case 'BMSStateCharge':
                        json["charge_state"]["bms_state"] = "Charge";
                        break;
                    case 'BMSStateFEIM':
                        json["charge_state"]["bms_state"] = "FEIM";
                        break;
                    case 'BMSStateClearFault':
                        json["charge_state"]["bms_state"] = "ClearFault";
                        break;
                    case 'BMSStateFault':
                        json["charge_state"]["bms_state"] = "Fault";
                        break;
                    case 'BMSStateWeld':
                        json["charge_state"]["bms_state"] = "Weld";
                        break;
                    case 'BMSStateTest':
                        json["charge_state"]["bms_state"] = "Test";
                        break;
                    case 'BMSStateSNA':
                        json["charge_state"]["bms_state"] = "SNA";
                        break;
                }
                break;
            // Powertrain
            case 'DiHeatsinkTF':
                json["powertrain_state"]["inverter_temp_heatsink_f"] = message.value;
                break;
            case 'DiHeatsinkTR':
                json["powertrain_state"]["inverter_temp_heatsink_r"] = message.value;
                break;
            case 'DiStatorTempF':
                json["powertrain_state"]["inverter_temp_stator_f"] = message.value;
                break;
            case 'DiStatorTempR':
                json["powertrain_state"]["inverter_temp_stator_r"] = message.value;
                break;
            case 'DiMotorCurrentF':
                json["powertrain_state"]["inverter_current_f"] = message.value;
                break;
            case 'DiMotorCurrentR':
                json["powertrain_state"]["inverter_current_r"] = message.value;
                break;
            case 'DiVBatF':
                json["powertrain_state"]["inverter_voltage_f"] = message.value;
                break;
            case 'DiVBatR':
                json["powertrain_state"]["inverter_voltage_r"] = message.value;
                break;


            // Charge State
            case 'Soc':
                json["charge_state"]["usable_battery_level"] = message.value;
                break;
            case 'BatteryLevel':
                json["charge_state"]["battery_level"] = message.value;
                break;
            case 'IdealBatteryRange':
                json["charge_state"]["ideal_battery_range"] = message.value;
                break;
            case 'EstBatteryRange':
                json["charge_state"]["est_battery_range"] = message.value;
                break;
            case 'ChargeCurrentRequest':
                json["charge_state"]["charge_current_request"] = message.value;
                break;
            case 'ChargeAmps':
                json["charge_state"]["charger_actual_current"] = message.value;
                break;
            case 'ChargerVoltage':
                json["charge_state"]["charger_voltage"] = message.value;
                break;
            case 'ChargerPhases':
                json["charge_state"]["charger_phases"] = message.value;
                break;
            case 'ChargeLimitSoc':
                json["charge_state"]["charge_limit_soc"] = message.value;
                break;
            // Charged energy measured at battery, used for AC and DC charging
            case 'DCChargingEnergyIn':
                json["charge_state"]["charge_energy_added"] = message.value;
                break;
            // Charged energy measured at charger, used for AC only, ignore for DC charging
            case 'ACChargingEnergyIn':
                json["charge_state"]["charge_energy_added_ac"] = message.value;
                break;
            case 'TimeToFullCharge':
                json["charge_state"]["minutes_to_full_charge"] = message.value === null ? null : Math.round( message.value * 60 ); // hh => mm
                break;
            case 'BatteryHeaterOn':
                json["charge_state"]['battery_heater_on'] = message.value;
                break;
            case 'DetailedChargeState':
                switch (message.value) {
                    case 'DetailedChargeStateUnknown':
                        json["charge_state"]["charging_state"] = "Unknown";
                        break;
                    case 'DetailedChargeStateDisconnected':
                        json["charge_state"]["charging_state"] = "Disconnected";
                        break;
                    case 'DetailedChargeStateNoPower':
                        json["charge_state"]["charging_state"] = "NoPower";
                        break;
                    case 'DetailedChargeStateStarting':
                        json["charge_state"]["charging_state"] = "Starting";
                        break;
                    case 'DetailedChargeStateCharging':
                        json["charge_state"]["charging_state"] = "Charging";
                        break;
                    case 'DetailedChargeStateComplete':
                        json["charge_state"]["charging_state"] = "Complete";
                        break;
                    case 'DetailedChargeStateStopped':
                        json["charge_state"]["charging_state"] = "Stopped";
                        break;
                }
                break;
            case 'ChargePortDoorOpen':
                json["charge_state"]["charge_port_door_open"] = message.value;
                break;
            case 'ChargingCableType':
                switch (message.value) {
                    case 'CableTypeIEC':
                        json["charge_state"]["conn_charge_cable"] = "IEC";   
                        break;
                    case 'CableTypeSAE':
                        json["charge_state"]["conn_charge_cable"] = "SAE";   
                        break;
                    case 'CableTypeGB_AC':
                        json["charge_state"]["conn_charge_cable"] = "GB_AC";   
                        break;
                    case 'CableTypeGB_DC':
                        json["charge_state"]["conn_charge_cable"] = "GB_DC";   
                        break;
                    case 'CableTypeSNA':
                        json["charge_state"]["conn_charge_cable"] = "SNA";   
                        break;
                }
                // "IEC"
                // "SAE"
                // "SNA"
                // "GB_AC"
                // "GB_DC"
                break;

            // Climate
            case 'InsideTemp':
                json["climate_state"]['inside_temp'] = message.value === null ? null : Math.round(message.value *100)/100;
                break;
            case 'OutsideTemp':
                json["climate_state"]['outside_temp'] = message.value === null ? null : Math.round(message.value *100)/100;
                break;
            case 'DefrostMode':
                switch (message.value) {
                    case 'DefrostModeStateOff':
                        json["climate_state"]['defrost_mode'] = false;
                        break;
                    case 'DefrostModeStateNormal':
                        json["climate_state"]['defrost_mode'] = true;
                        break;
                    case 'DefrostModeStateMax':
                        json["climate_state"]['defrost_mode'] = true;
                        break;
                    case 'DefrostModeStateAutoDefog': 
                        json["climate_state"]['defrost_mode'] = true;
                        break;
                }
                break;
            case 'HvacPower':
                switch (message.value) {
                    case 'HvacPowerStateOff':
                        json["climate_state"]['is_climate_on'] = false;
                        break;
                    case 'HvacPowerStateOn':
                        json["climate_state"]['is_climate_on'] = true;
                        break;
                    case 'HvacPowerStatePrecondition':
                        json["climate_state"]['is_climate_on'] = true;
                        break;
                    case 'HvacPowerStateOverheatProtect':
                        json["climate_state"]['is_climate_on'] = true;
                        break;
                }
                break;
            case 'HvacAutoMode':
                switch (message.value) {
                    case 'HvacAutoModeStateUnknown':
                        json["climate_state"]['is_auto_conditioning_on'] = false;
                        break;
                    case 'HvacAutoModeStateOn':
                        json["climate_state"]['is_auto_conditioning_on'] = true;
                        break;
                    case 'HvacAutoModeStateOverride':
                        json["climate_state"]['is_auto_conditioning_on'] = true;
                        break;
                    case null:
                        json["climate_state"]['is_auto_conditioning_on'] = false; // ? is this value null if A/C auto is off?
                        break;
                }
                break;
            case 'AutoSeatClimateLeft':
                json["climate_state"]['auto_seat_climate_left'] = message.value;
                break;
            case 'AutoSeatClimateRight':
                json["climate_state"]['auto_seat_climate_right'] = message.value;
                break;
            case 'SeatHeaterLeft':
                json["climate_state"]['seat_heater_left'] = message.value;
                break;
            case 'SeatHeaterRight':
                json["climate_state"]['seat_heater_right'] = message.value;
                break;
            case 'HvacSteeringWheelHeatAuto':
                json["climate_state"]['auto_steering_wheel_heat'] = message.value;
                break;
            case 'HvacSteeringWheelHeatLevel':
                json["climate_state"]['steering_wheel_heat_level'] = message.value;
                break;

                

            // Drive State
            case 'VehicleSpeed':
                json["drive_state"]['speed'] = message.value === null ? null : Math.round(message.value *100)/100;
                break;
            case 'GpsHeading':
                json["drive_state"]['heading'] = message.value;
                break;
            case 'Location':
                let latitude = message.value.latitude;
                let longitude = message.value.longitude;
                if (latitude != null && longitude != null){
                    json["drive_state"]['latitude'] = latitude;
                    json["drive_state"]['longitude'] = longitude;
                }
                else{
                    json["drive_state"]['latitude'] = null;
                    json["drive_state"]['longitude'] = null;
                }
                break;
            case 'Gear':
                if (message.value == null){
                    // json["drive_state"]["shift_state"] = "P";                            
                }
                else{
                    switch (message.value) {
                        case 'ShiftStateP':
                            json["drive_state"]["shift_state"] = "P";
                            break;
                        case 'ShiftStateR':
                            json["drive_state"]["shift_state"] = "R";
                            break;
                        case 'ShiftStateN':
                            json["drive_state"]["shift_state"] = "N";
                            break;
                        case 'ShiftStateD':
                            json["drive_state"]["shift_state"] = "D";
                            break;
                    }
                }
                break;
            case 'MilesToArrival':
                json["drive_state"]['active_route_miles_to_arrival'] = message.value;
                break;
            case 'MinutesToArrival':
                json["drive_state"]['active_route_minutes_to_arrival'] = message.value;
                break;
            case 'ExpectedEnergyPercentAtTripArrival':
                json["drive_state"]['active_route_energy_at_arrival'] = message.value;
                break;
            case 'DestinationName':
                json["drive_state"]['active_route_destination'] = message.value;
                break;
            case 'DestinationLocation':
                let latitudeDest = message.value.latitude;
                let longitudeDest = message.value.longitude;
                if (latitudeDest != null && longitudeDest != null){
                    json["drive_state"]['active_route_latitude'] = latitudeDest;
                    json["drive_state"]['active_route_longitude'] = longitudeDest;
                }
                else{
                    json["drive_state"]['active_route_latitude'] = null;
                    json["drive_state"]['active_route_longitude'] = null;
                }
                break;
                // json["drive_state"]['active_route_latitude'] = datum.value.locationValue.latitude;
                // json["drive_state"]['active_route_longitude'] = datum.value.locationValue.longitude;
                // break;

            // Vehicle State
            case 'Odometer':
                json["vehicle_state"]['odometer'] = message.value;
                break;

            case 'DriverSeatOccupied':
                json["vehicle_state"]['is_user_present'] = message.value;
                break;
            case 'Locked':
                json["vehicle_state"]['locked'] = message.value;
                break;
            case 'SentryMode':
                switch (message.value) {
                    case 'SentryModeStateOff':
                        json["vehicle_state"]['sentry_mode'] = false;
                        break;
                    case 'SentryModeStateIdle':
                        // json["vehicle_state"]['sentry_mode'] = false;
                        break;
                    case 'SentryModeStateArmed':
                        json["vehicle_state"]['sentry_mode'] = true;
                        break;
                    case 'SentryModeStateAware':
                        // json["vehicle_state"]['sentry_mode'] = false;
                        break;
                    case 'SentryModeStatePanic':
                        // json["vehicle_state"]['sentry_mode'] = false;
                        break;
                    case 'SentryModeStateQuiet':
                        // json["vehicle_state"]['sentry_mode'] = false;
                        break;
                }
                break;
            case 'TpmsPressureFl':
                json["vehicle_state"]['tpms_pressure_fl'] = message.value;
                break;
            case 'TpmsPressureFr':
                json["vehicle_state"]['tpms_pressure_fr'] = message.value;
                break;
            case 'TpmsPressureRl':
                json["vehicle_state"]['tpms_pressure_rl'] = message.value;
                break;
            case 'TpmsPressureRr':
                json["vehicle_state"]['tpms_pressure_rr'] = message.value;
                break;
            case 'DoorState':
                let doorState = message.value;
                if (doorState.DriverFront !== undefined){
                    json["vehicle_state"]['df'] = doorState.DriverFront === true? 1 : 0;
                }
                if (doorState.DriverRear !== undefined){
                    json["vehicle_state"]['dr'] = doorState.DriverRear === true? 1 : 0;
                }
                if (doorState.PassengerFront !== undefined){
                    json["vehicle_state"]['pf'] = doorState.PassengerFront === true? 1 : 0;
                }
                if (doorState.PassengerRear !== undefined){
                    json["vehicle_state"]['pr'] = doorState.PassengerRear === true? 1 : 0;
                }
                if (doorState.TrunkFront !== undefined){
                    json["vehicle_state"]['ft'] = doorState.TrunkFront === true? 1 : 0;
                }
                if (doorState.TrunkRear !== undefined){
                    json["vehicle_state"]['rt'] = doorState.TrunkRear === true? 1 : 0;
                }
                break;
            case 'SoftwareUpdateVersion':
                json["vehicle_state"]['software_update'] = {"version": message.value};
                break;
            case 'Version':
                json["vehicle_state"]['car_version'] = message.value;
                break;

            // Media
            case 'MediaAudioVolume':
                if (!json["vehicle_state"]['media_info']){
                    json["vehicle_state"]['media_info'] = {};
                }
                json["vehicle_state"]['media_info']['audio_volume'] = message.value;
                break;
            case 'MediaAudioVolumeMax':
                if (!json["vehicle_state"]['media_info']){
                    json["vehicle_state"]['media_info'] = {};
                }
                json["vehicle_state"]['media_info']['audio_volume_max'] = message.value;
                break;
            case 'MediaNowPlayingAlbum':
                if (!json["vehicle_state"]['media_info']){
                    json["vehicle_state"]['media_info'] = {};
                }
                json["vehicle_state"]['media_info']['now_playing_album'] = message.value;
                break;
            case 'MediaNowPlayingArtist':
                if (!json["vehicle_state"]['media_info']){
                    json["vehicle_state"]['media_info'] = {};
                }
                json["vehicle_state"]['media_info']['now_playing_artist'] = message.value;
                break;
            case 'MediaNowPlayingTitle':
                if (!json["vehicle_state"]['media_info']){
                    json["vehicle_state"]['media_info'] = {};
                }
                json["vehicle_state"]['media_info']['now_playing_title'] = message.value;
                break;
            case 'MediaNowPlayingTitle':
                if (!json["vehicle_state"]['media_info']){
                    json["vehicle_state"]['media_info'] = {};
                }
                json["vehicle_state"]['media_info']['now_playing_title'] = message.value;
                break;
            case 'MediaNowPlayingDuration':
                if (!json["vehicle_state"]['media_info']){
                    json["vehicle_state"]['media_info'] = {};
                }
                json["vehicle_state"]['media_info']['now_playing_duration'] = message.value;
                break;
            case 'MediaNowPlayingElapsed':
                if (!json["vehicle_state"]['media_info']){
                    json["vehicle_state"]['media_info'] = {};
                }
                json["vehicle_state"]['media_info']['now_playing_elapsed'] = message.value;
                break;
            case 'MediaPlaybackStatus':
                if (!json["vehicle_state"]['media_info']){
                    json["vehicle_state"]['media_info'] = {};
                }
                switch (message.value) {
                    case 'MediaStatusUnknown':
                    case 'MediaStatusStopped':
                    case 'MediaStatusPaused':
                        json["vehicle_state"]['media_info']['media_playback_status'] = 'Stopped';
                        break;
                    case 'MediaStatusPlaying':
                        json["vehicle_state"]['media_info']['media_playback_status'] = 'Playing';
                        break;
                }
                break;
        }
        return json;


        // Missing fields in Telemetry:
        // vehicle_state.software_update.status
        // drive_state.power
    }

}

module.exports = TeslaTelemetryMqtt