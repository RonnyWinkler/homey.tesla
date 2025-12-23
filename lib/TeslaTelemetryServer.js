const { time } = require('console');
const https = require('https');
const { WebSocketServer } = require('ws');

const protobuf = require("./protobufjs.js");

const EventHandler = require('./EventHandler');
const TeslaTelemetryFlatbuffer = require('./TeslaTelemetryFlatbufferDecoder.js');

const PORT = 8443;

class TeslaTelemetryServer {
    constructor(key, certificate) {
        return (async () => {
            // Load TLS key and certificate
            this._serverOptions = {
                key: key,
                cert: certificate,
            };

            // Load Protobuf definition and comnvert field definition into JSON Object
            this.ProtoVehicleData = await protobuf.load('proto/telemetry/vehicle_data.proto');
            this.ProtoVehicleDataPayload = this.ProtoVehicleData.lookupType('Payload');
            this.ProtoVehicleDataFields = this.ProtoVehicleData.lookupEnum("Field").values;

            this.onTelemetryMessage = new EventHandler('telemetryMessage');
            this.onTelemetryDisconnect = new EventHandler('telemetryDisconnect');

            this._init();
            return this;
        })();
    }

    _init() {        
        // Create a basic HTTPS server
        this.server = https.createServer(this._serverOptions, (req, res) => {
            res.writeHead(200);
            console.log("HTTPS Request: ", req.url);
            res.end('Hello from Telemetry server (HTTPS + WebSocket)\n');
        });

        // Attach a WebSocket server to the HTTPS server
        this.wss = new WebSocketServer({ server: this.server });

        // Handle incoming WebSocket connections
        this.wss.on('connection', (ws, req) => {
            const ip = req.socket.remoteAddress;
            let vin = null;
            console.log(`WS Client connected: ${ip}`);

            ws.send('Welcome to Tesla Telemetry server!');

            ws.on('message', async (msg) => {
                // console.log(`WS Received from ${ip}: ${msg}`);

                let result = await this.decodeMessage(msg);
                if (vin){
                  vin = result.vin;
                }

                // ws.send(`Echo: ${msg}`);
            });

            ws.on('close', () => {
                console.log(`WS Client disconnected: ${ip}, VIN: ${vin}`);
                
                if (vin){
                    this.onTelemetryDisconnect.emit({
                        vin: vin
                    }).catch(error => Log.error(error));
                }
            });
        });

        // Start listening
        this.server.listen(PORT, () => {
            let address = this.server.address();
            console.log("HTTPS Server running at https: ", address);
            console.log("Websocket server running at https: ", address);
        });
       
    }

    getStatus(){
        if (this.wss?._server){
            return this.wss._server.address();
        }
        else{
            return null;
        }
    }

    getCertificate(){
        return this._serverOptions.cert;
    }


    async stopServer() {
        return new Promise((resolve, reject) => {
            // Stop accepting new HTTPS connections
            this.server.close(() => {
                console.log('HTTPS server stopped');
                if (timeout) clearTimeout(timeout);
                resolve();
            });

            // Close all WebSocket connections and stop WSS
            this.wss.clients.forEach(client => client.close());
            this.wss.close(() => {
                console.log('WebSocket server stopped');
            });
            const timeout = setTimeout(
                () => reject(new Error('Timeout closing https server.') ), 
                10000
            );
        });
    }

    async decodeMessage(buffer){
        const bytes = Uint8Array.from(buffer);
        const msg = TeslaTelemetryFlatbuffer.decodeTeslaStreamMessage(bytes);
        // console.log(msg);

        if (msg.MessageTopic == 'V' && msg.DeviceID != undefined){
            let payload = this.ProtoVehicleDataPayload.decode(msg.Payload);
            let payloadString = JSON.stringify(payload, null, 2); 
            console.log("Telemetry Proto Message:");
            console.log(payloadString);
            let json = { "charge_state": {}, "drive_state": {}, "vehicle_state": {}, "climate_state": {} };
            // Convert Protof data into JSON (manually)
            payload.data.forEach(datum => {
                if (datum.value && datum.value.invalid != true) {
                    switch (datum.key) {

                        // Telemetry specific data
                        case this.ProtoVehicleDataFields.ModuleTempMax:
                            json["charge_state"]["module_temp_max"] = datum.value.doubleValue;
                            break;
                        case this.ProtoVehicleDataFields.ModuleTempMin:
                            json["charge_state"]["module_temp_min"] = datum.value.doubleValue;
                            break;

                        // Charge State
                        case this.ProtoVehicleDataFields.Soc:
                            json["charge_state"]["usable_battery_level"] = datum.value.doubleValue;
                            break;
                        case this.ProtoVehicleDataFields.BatteryLevel:
                            json["charge_state"]["battery_level"] = datum.value.doubleValue;
                            break;
                        case this.ProtoVehicleDataFields.IdealBatteryRange:
                            json["charge_state"]["ideal_battery_range"] = datum.value.doubleValue;
                            break;
                        case this.ProtoVehicleDataFields.EstBatteryRange:
                            json["charge_state"]["est_battery_range"] = datum.value.doubleValue;
                            break;
                        case this.ProtoVehicleDataFields.ChargeAmps:
                            json["charge_state"]["charger_actual_current"] = datum.value.doubleValue;
                            break;
                        case this.ProtoVehicleDataFields.ChargerVoltage:
                            json["charge_state"]["charger_voltage"] = datum.value.doubleValue;
                            break;
                        case this.ProtoVehicleDataFields.ChargeLimitSoc:
                            json["charge_state"]["charge_limit_soc"] = datum.value.intValue;
                            break;
                        case this.ProtoVehicleDataFields.ChargerPhases:
                            json["charge_state"]["charger_phases"] = datum.value.intValue;
                            break;
                        case this.ProtoVehicleDataFields.DCChargingEnergyIn:
                            json["charge_state"]["charge_energy_added"] = datum.value.doubleValue;
                            break;
                        case this.ProtoVehicleDataFields.TimeToFullCharge:
                            json["charge_state"]["minutes_to_full_charge"] = Math.round( datum.value.doubleValue * 60 ); // hh => mm
                            break;
                        case this.ProtoVehicleDataFields.BatteryHeaterOn:
                            json["charge_state"]['battery_heater_on'] = datum.value.booleanValue;
                            break;
                        case this.ProtoVehicleDataFields.DetailedChargeState:
                            switch (datum.value.detailedChargeStateValue) {
                                case 0:
                                    json["charge_state"]["charging_state"] = "Unknown";
                                    break;
                                case 1:
                                    json["charge_state"]["charging_state"] = "Disconnected";
                                    break;
                                case 2:
                                    json["charge_state"]["charging_state"] = "NoPower";
                                    break;
                                case 3:
                                    json["charge_state"]["charging_state"] = "Starting";
                                    break;
                                case 4:
                                    json["charge_state"]["charging_state"] = "Charging";
                                    break;
                                case 5:
                                    json["charge_state"]["charging_state"] = "Complete";
                                    break;
                                case 6:
                                    json["charge_state"]["charging_state"] = "Stopped";
                                    break;
                                case 2:
                                    json["charge_state"]["charging_state"] = "NoPower";
                                    break;
                            }
                            break;
                        case this.ProtoVehicleDataFields.ChargePortDoorOpen:
                            json["charge_state"]["charge_port_door_open"] = datum.value.booleanValue;
                            break;
                        case this.ProtoVehicleDataFields.ChargingCableType:
                            switch (datum.value.CableTypeValue) {
                                case 1:
                                    json["charge_state"]["conn_charge_cable"] = "IEC";   
                                    break;
                                case 2:
                                    json["charge_state"]["conn_charge_cable"] = "SAE";   
                                    break;
                                case 3:
                                    json["charge_state"]["conn_charge_cable"] = "GB_AC";   
                                    break;
                                case 4:
                                    json["charge_state"]["conn_charge_cable"] = "GB_DC";   
                                    break;
                                case 5:
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
                        case this.ProtoVehicleDataFields.InsideTemp:
                            json["climate_state"]['inside_temp'] = Math.round(datum.value.doubleValue *100)/100;
                            break;
                        case this.ProtoVehicleDataFields.OutsideTemp:
                            json["climate_state"]['outside_temp'] = Math.round(datum.value.doubleValue *100)/100;
                            break;
                        case this.ProtoVehicleDataFields.DefrostMode:
                            switch (datum.value.defrostModeValue) {
                                case 1: // DefrostModeStateOff
                                    json["climate_state"]['defrost_mode'] = false;
                                    break;
                                case 2: // DefrostModeStateNormal
                                    // json["climate_state"]['defrost_mode'] = true;
                                    break;
                                case 3: // DefrostModeStateMax
                                    json["vehicle_state"]['sentry_mode'] = true;
                                    break;
                                case 4: // DefrostModeStateAutoDefog
                                    // json["drive_state"]["shift_state"] = "R";
                                    break;
                            }
                            break;
                        case this.ProtoVehicleDataFields.HvacPower:
                            switch (datum.value.hvacPowerValue) {
                                case 1: // 'HvacPowerStateOff': // Off
                                    json["climate_state"]['is_climate_on'] = false;
                                    break;
                                case 2: // On
                                    json["climate_state"]['is_climate_on'] = true;
                                    break;
                                case 3: // Preconditioning
                                    json["vehicle_state"]['is_climate_on'] = true;
                                    break;
                                case 4: // OverheatProtection
                                    json["vehicle_state"]['is_climate_on'] = true;
                                    break;
                            }
                            break;

                            

                        // Drive State
                        case this.ProtoVehicleDataFields.VehicleSpeed:
                            json["drive_state"]['speed'] = Math.round(datum.value.doubleValue *100)/100;
                            break;
                        case this.ProtoVehicleDataFields.GpsHeading:
                            json["drive_state"]['heading'] = datum.value.doubleValue;
                            break;
                        case this.ProtoVehicleDataFields.Location:
                            json["drive_state"]['latitude'] = datum.value.locationValue.latitude;
                            json["drive_state"]['longitude'] = datum.value.locationValue.longitude;
                            break;
                        case this.ProtoVehicleDataFields.Gear:
                            if (datum.value?.invalid == true){
                                // json["drive_state"]["shift_state"] = "P";                            
                            }
                            else{
                                switch (datum.value.shiftStateValue) {
                                    case 2: // P
                                        json["drive_state"]["shift_state"] = "P";
                                        break;
                                    case 3: // R
                                        json["drive_state"]["shift_state"] = "R";
                                        break;
                                    case 4: // N
                                        json["drive_state"]["shift_state"] = "N";
                                        break;
                                    case 5: // D
                                        json["drive_state"]["shift_state"] = "D";
                                        break;
                                }
                            }
                            break;
                        case this.ProtoVehicleDataFields.MilesToArrival:
                            json["drive_state"]['active_route_miles_to_arrival'] = datum.value.doubleValue;
                            break;
                        case this.ProtoVehicleDataFields.MinutesToArrival:
                            json["drive_state"]['active_route_minutes_to_arrival'] = datum.value.doubleValue;
                            break;
                        case this.ProtoVehicleDataFields.ExpectedEnergyPercentAtTripArrival:
                            json["drive_state"]['active_route_energy_at_arrival'] = datum.value.intValue;
                            break;
                        case this.ProtoVehicleDataFields.DestinationName:
                            json["drive_state"]['active_route_destination'] = datum.value.stringValue;
                            break;
                        case this.ProtoVehicleDataFields.DestinationLocation:
                            json["drive_state"]['active_route_latitude'] = datum.value.locationValue.latitude;
                            json["drive_state"]['active_route_longitude'] = datum.value.locationValue.longitude;
                            break;

                        // Vehicle State
                        case this.ProtoVehicleDataFields.DriverSeatOccupied:
                            json["vehicle_state"]['is_user_present'] = datum.value.booleanValue;
                            break;
                        case this.ProtoVehicleDataFields.Locked:
                            json["vehicle_state"]['locked'] = datum.value.booleanValue;
                            break;
                        case this.ProtoVehicleDataFields.SentryMode:
                            switch (datum.value.sentryModeStateValue) {
                                case 1: // Off
                                    json["vehicle_state"]['sentry_mode'] = false;
                                    break;
                                case 2: // Idle
                                    // json["vehicle_state"]['sentry_mode'] = false;
                                    break;
                                case 3: // Armed
                                    json["vehicle_state"]['sentry_mode'] = true;
                                    break;
                                case 4: // Aware
                                    // json["drive_state"]["shift_state"] = "R";
                                    break;
                                case 5: // Panic
                                    // json["drive_state"]["shift_state"] = "N";
                                    break;
                                case 6: // Quite
                                    json["drive_state"]["shift_state"] = "D";
                                    break;
                            }
                            break;
                        case this.ProtoVehicleDataFields.TpmsPressureFl:
                            json["vehicle_state"]['tpms_pressure_fl'] = datum.value.doubleValue;
                            break;
                        case this.ProtoVehicleDataFields.TpmsPressureFr:
                            json["vehicle_state"]['tpms_pressure_fr'] = datum.value.doubleValue;
                            break;
                        case this.ProtoVehicleDataFields.TpmsPressureRl:
                            json["vehicle_state"]['tpms_pressure_rl'] = datum.value.doubleValue;
                            break;
                        case this.ProtoVehicleDataFields.TpmsPressureRr:
                            json["vehicle_state"]['tpms_pressure_rr'] = datum.value.doubleValue;
                            break;
                        case this.ProtoVehicleDataFields.DoorState: // String value, Mapping values unknown
                            if (datum.value.doorValue.DriverFront !== undefined){
                                json["vehicle_state"]['df'] = datum.value.doorValue.DriverFront === true? 1 : 0;
                            }
                            if (datum.value.doorValue.DriverRear !== undefined){
                                json["vehicle_state"]['dr'] = datum.value.doorValue.DriverRear === true? 1 : 0;
                            }
                            if (datum.value.doorValue.PassengerFront !== undefined){
                                json["vehicle_state"]['pf'] = datum.value.doorValue.PassengerFront === true? 1 : 0;
                            }
                            if (datum.value.doorValue.PassengerRear !== undefined){
                                json["vehicle_state"]['pr'] = datum.value.doorValue.PassengerRear === true? 1 : 0;
                            }
                            if (datum.value.doorValue.TrunkFront !== undefined){
                                json["vehicle_state"]['ft'] = datum.value.doorValue.TrunkFront === true? 1 : 0;
                            }
                            if (datum.value.doorValue.TrunkRear !== undefined){
                                json["vehicle_state"]['rt'] = datum.value.doorValue.TrunkRear === true? 1 : 0;
                            }
                            break;
                        case this.ProtoVehicleDataFields.SoftwareUpdateVersion:
                            json["vehicle_state"]['software_update'] = {"version": datum.value.stringValue};
                            break;
                        case this.ProtoVehicleDataFields.Version:
                            json["vehicle_state"]['car_version'] = datum.value.stringValue;
                            break;

                        // Media
                        case this.ProtoVehicleDataFields.MediaAudioVolume:
                            if (!json["vehicle_state"]['media_info']){
                                json["vehicle_state"]['media_info'] = {};
                            }
                            json["vehicle_state"]['media_info']['audio_volume'] = datum.value.doubleValue;
                            break;
                        case this.ProtoVehicleDataFields.MediaAudioVolumeMax:
                            if (!json["vehicle_state"]['media_info']){
                                json["vehicle_state"]['media_info'] = {};
                            }
                            json["vehicle_state"]['media_info']['audio_volume_max'] = datum.value.doubleValue;
                            break;
                        case this.ProtoVehicleDataFields.MediaNowPlayingAlbum:
                            if (!json["vehicle_state"]['media_info']){
                                json["vehicle_state"]['media_info'] = {};
                            }
                            json["vehicle_state"]['media_info']['now_playing_album'] = datum.value.stringValue;
                            break;
                        case this.ProtoVehicleDataFields.MediaNowPlayingArtist:
                            if (!json["vehicle_state"]['media_info']){
                                json["vehicle_state"]['media_info'] = {};
                            }
                            json["vehicle_state"]['media_info']['now_playing_artist'] = datum.value.stringValue;
                            break;
                        case this.ProtoVehicleDataFields.MediaNowPlayingTitle:
                            if (!json["vehicle_state"]['media_info']){
                                json["vehicle_state"]['media_info'] = {};
                            }
                            json["vehicle_state"]['media_info']['now_playing_title'] = datum.value.stringValue;
                            break;
                        case this.ProtoVehicleDataFields.MediaNowPlayingTitle:
                            if (!json["vehicle_state"]['media_info']){
                                json["vehicle_state"]['media_info'] = {};
                            }
                            json["vehicle_state"]['media_info']['now_playing_title'] = datum.value.stringValue;
                            break;
                        case this.ProtoVehicleDataFields.MediaNowPlayingDuration:
                            if (!json["vehicle_state"]['media_info']){
                                json["vehicle_state"]['media_info'] = {};
                            }
                            json["vehicle_state"]['media_info']['now_playing_duration'] = datum.value.intValue;
                            break;
                        case this.ProtoVehicleDataFields.MediaNowPlayingElapsed:
                            if (!json["vehicle_state"]['media_info']){
                                json["vehicle_state"]['media_info'] = {};
                            }
                            json["vehicle_state"]['media_info']['now_playing_elapsed'] = datum.value.intValue;
                            break;
                        case this.ProtoVehicleDataFields.MediaPlaybackStatus:
                            if (!json["vehicle_state"]['media_info']){
                                json["vehicle_state"]['media_info'] = {};
                            }
                            switch (datum.value.mediaStatusValue) {
                                case 0: //MediaStatusUnknown
                                case 1: //MediaStatusStopped
                                case 3: //MediaStatusPaused
                                    json["vehicle_state"]['media_info']['media_playback_status'] = 'Stopped';
                                    break;
                                case 2: //MediaStatusPlaying
                                    json["vehicle_state"]['media_info']['media_playback_status'] = 'Playing';
                                    break;
                            }
                            break;
                    }
                }

                // Check for invalid values (reset Homey capabilities)
                if (datum.value && datum.value.invalid == true) {
                    switch (datum.key) {
                        case this.ProtoVehicleDataFields.MilesToArrival:
                            json["drive_state"]['active_route_miles_to_arrival'] = null;
                            break;
                        case this.ProtoVehicleDataFields.MinutesToArrival:
                            json["drive_state"]['active_route_minutes_to_arrival'] = null;
                            break;
                        case this.ProtoVehicleDataFields.ExpectedEnergyPercentAtTripArrival:
                            json["drive_state"]['active_route_energy_at_arrival'] = null;
                            break;
                        case this.ProtoVehicleDataFields.DestinationName:
                            json["drive_state"]['active_route_destination'] = null;
                            break;
                        case this.ProtoVehicleDataFields.DestinationLocation:
                            json["drive_state"]['active_route_latitude'] = null;
                            json["drive_state"]['active_route_longitude'] = null;
                            break;
                    }                
                }
            });

            console.log("Telemetry message from VIN "+msg.DeviceID+":\n", json);
            
            // Insert proto payload to data JSON to pass it to the device and its log
            json.proto = payloadString;

            this.onTelemetryMessage.emit({
                vin: msg.DeviceID,
                data: json
            }).catch(error => Log.error(error));

            return { vin: msg.DeviceID };
        }
    }

}

module.exports = { TeslaTelemetryServer };