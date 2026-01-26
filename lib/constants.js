'use strict';

const API_RATELIMIT_LIMIT = 300;

const API_COMMAND_TYPE_COMMAND = 'command';
const API_COMMAND_TYPE_COMMAND_WAKES = 'command_wakes';

const API_REQUEST_COUNTER_READ = 'api_read';
const API_REQUEST_COUNTER_COMMAND = 'api_command';
const API_REQUEST_COUNTER_COMMAND_WAKES = 'api_command_wakes';
const API_REQUEST_COUNTER_BLE_SUCCESS = 'api_ble_success';
const API_REQUEST_COUNTER_BLE_ERROR = 'api_ble_error';

const API_ERROR_READ = 'api_error_read';
const API_ERROR_COMMAND = 'api_error_command';
const API_ERROR_BLE = 'api_error_ble';

const COMMAND_API_REST = 'rest';
const COMMAND_API_PROXY = 'command';
const COMMAND_API_CMD = 'tvcp';

const DOMAIN_INFOTAINMENT = 'DOMAIN_INFOTAINMENT';
const DOMAIN_VEHICLE_SECURITY = 'DOMAIN_VEHICLE_SECURITY';

const STATE_ONLINE = 'online';
const STATE_OFFLINE = 'offline';
const STATE_ASLEEP = 'asleep';
const STATE_RATE_LIMIT = 'ratelimit';

const CHARGING_STATE_DISCONNECTED = 'Disconnected';
const CHARGING_STATE_CALIBRATING = 'Calibrating';
const CHARGING_STATE_COMPLETE = 'Complete';
const CHARGING_STATE_NOPOWER = 'NoPower';
const CHARGING_STATE_STOPPED = 'Stopped';
const CHARGING_STATE_UNKNOWN = 'Unknown';
const CHARGING_STATE_STARTING = 'Starting';
const CHARGING_STATE_CHARGING = 'Charging';

const SOFTWARE_UPDATE_STATE_AVAILABLE = 'available';
const SOFTWARE_UPDATE_STATE_SCHEDULEDE = 'scheduled';
const SOFTWARE_UPDATE_STATE_INSTALLING = 'installing';
const SOFTWARE_UPDATE_STATE_DOWNLOADING = 'downloading';
const SOFTWARE_UPDATE_STATE_DOWNLOADING_WIFI_WAIT = 'downloading_wifi_wait';

const MEDIA_PLAYBACK_STATE_PLAYING = 'Playing';
const MEDIA_PLAYBACK_STATE_STOPPED = 'Stopped';

const WINDOW_POSITION_VENT = 'vent';
const WINDOW_POSITION_CLOSE = 'close';
const TRUNK_FRONT = 'front';
const TRUNK_REAR = 'rear';

const MILES_TO_KM = 1.609344;

const API_ERRORS_WHITELIST = [
    'already_set',
    'not_charging',
    'is_charging',
    'requested',
    'complete'
];

const AUTH_TYPE_HMAC_SHA256 = 'HMAC-SHA256';
const AUTH_TYPE_AES_GCM = 'AES-GCM';

const BLE_ON = 'ble_on';
const BLE_OFF = 'ble_off';
const BLE_ONLY = 'ble_only'; 

const SOURCE_BLE = 'ble';
const SOURCE_TELEMETRY = 'telemetry';
const SOURCE_FLEETAPI = 'api';

const TELEMETRY_STATUS_CONNECTED = 'CONNECTED';
const TELEMETRY_STATUS_DISCONNECTED = 'DISCONNECTED';

const TELEMETRY_FIELDS_DEFAULT = [
      // Settings
      {
        field: "SettingDistanceUnit",
        active: true,
        interval: 1,
        resendInterval: 0
      },
      {
        field: "SettingTemperatureUnit",
        active: true,
        interval: 1,
        resendInterval: 0
      },
      {
        field: "SettingTirePressureUnit",
        active: true,
        interval: 1,
        resendInterval: 0
      },

      // Powertrain
      {
        field: "DiHeatsinkTF",
        active: true,
        interval: 10,
        resendInterval: 0,
        minimumDelta: 0.1
      },
      {
        field: "DiHeatsinkTR",
        active: true,
        interval: 10,
        resendInterval: 0,
        minimumDelta: 0.1
      },
      {
        field: "DiStatorTempF",
        active: true,
        interval: 10,
        resendInterval: 0,
        minimumDelta: 0.1
      },
      {
        field: "DiStatorTempR",
        active: true,
        interval: 10,
        resendInterval: 0,
        minimumDelta: 0.1
      },
      {
        field: "DiMotorCurrentF",
        active: true,
        interval: 10,
        resendInterval: 0,
        minimumDelta: 0.1
      },
      {
        field: "DiMotorCurrentR",
        active: true,
        interval: 10,
        resendInterval: 0,
        minimumDelta: 0.1
      },
      {
        field: "DiVBatF",
        active: true,
        interval: 10,
        resendInterval: 0,
        minimumDelta: 0.1
      },
      {
        field: "DiVBatR",
        active: true,
        interval: 10,
        resendInterval: 0,
        minimumDelta: 0.1
      },



      // Battery
      {
        field: "DetailedChargeState",
        active: true,
        interval: 1,
        resendInterval: 0
      },
      {
        field: "Soc",
        active: true,
        interval: 30,
        resendInterval: 0,
        minimumDelta: 0.01
      },
      {
        field: "BatteryLevel",
        active: true,
        interval: 30,
        resendInterval: 0,
        minimumDelta: 0.01
      },
      {
        field: "ChargeLimitSoc",
        active: true,
        interval: 1,
        resendInterval: 0
      },
      {
        field: "DCChargingPower",
        active: true,
        interval: 1,
        resendInterval: 0,
        minimumDelta: 0.1
      },
      {
        field: "ACChargingPower",
        active: true,
        interval: 1,
        resendInterval: 0,
        minimumDelta: 0.1
      },
      {
        field: "ChargeCurrentRequest",
        active: true,
        interval: 1,
        resendInterval: 0,
        minimumDelta: 0.1
      },
      {
        field: "ChargeAmps",
        active: true,
        interval: 1,
        resendInterval: 0,
        minimumDelta: 0.1
      },
      {
        field: "ChargerVoltage",
        active: true,
        interval: 30,
        resendInterval: 0,
        minimumDelta: 1
      },
      {
        field: "ChargerPhases",
        active: true,
        interval: 1,
        resendInterval: 0
      },
      {
        field: "DCChargingEnergyIn",
        active: true,
        interval: 30,
        resendInterval: 0
      },
      {
        field: "ACChargingEnergyIn",
        active: true,
        interval: 30,
        resendInterval: 0
      },
      {
        field: "ChargePortDoorOpen",
        active: true,
        interval: 1,
        resendInterval: 0
      },
      {
        field: "ChargingCableType",
        active: true,
        interval: 1,
        resendInterval: 0
      },
      {
        field: "BatteryHeaterOn",
        active: true,
        interval: 1,
        resendInterval: 0
      },
      {
        field: "EstBatteryRange",
        active: true,
        interval: 30,
        resendInterval: 0,
        minimumDelta: 0.01
      },
      {
        field: "IdealBatteryRange",
        active: true,
        interval: 30,
        resendInterval: 0,
        minimumDelta: 0.01
      },
      {
        field: "TimeToFullCharge",
        active: true,
        interval: 30,
        resendInterval: 0
      },
      {
        field: "ModuleTempMax",
        active: true,
        interval: 10,
        resendInterval: 0
      },
      {
        field: "ModuleTempMin",
        active: true,
        interval: 10,
        resendInterval: 0
      },
      {
        field: "BmsFullchargecomplete",
        active: true,
        interval: 1,
        resendInterval: 0
      },
      {
        field: "BMSState",
        active: true,
        interval: 1,
        resendInterval: 0
      },

      // Car
      {
        field: "Gear",
        active: true,
        interval: 1,
        resendInterval: 0
      },
      {
        field: "VehicleSpeed",
        active: true,
        interval: 15,
        resendInterval: 0
      },
      {
        field: "DriverSeatOccupied",
        active: true,
        interval: 1,
        resendInterval: 0
      },
      {
        field: "SentryMode",
        active: true,
        interval: 1,
        resendInterval: 0
      },
      {
        field: "Locked",
        active: true,
        interval: 1,
        resendInterval: 0
      },
      {
        field: "DoorState",
        active: true,
        interval: 1,
        resendInterval: 0
      },
      {
        field: "Odometer",
        active: true,
        interval: 60,
        resendInterval: 0,
        minimumDelta: 0.1
      },
      {
        field: "SoftwareUpdateDownloadPercentComplete",
        active: true,
        interval: 1,
        resendInterval: 0,
        minimumDelta: 0.1
      },
      {
        field: "SoftwareUpdateInstallationPercentComplete",
        active: true,
        interval: 1,
        resendInterval: 0,
        minimumDelta: 0.1
      },
      {
        field: "SoftwareUpdateExpectedDurationMinutes",
        active: true,
        interval: 1,
        resendInterval: 0,
        minimumDelta: 0.01
      },
      {
        field: "SoftwareUpdateVersion",
        active: true,
        interval: 1,
        resendInterval: 0
      },
      {
        field: "Version",
        active: true,
        interval: 1,
        resendInterval: 0
      },
      {
        field: "TpmsPressureFl",
        active: true,
        interval: 1,
        resendInterval: 0,
        minimumDelta: 1
      },
      {
        field: "TpmsPressureFr",
        active: true,
        interval: 1,
        resendInterval: 0,
        minimumDelta: 1
      },
      {
        field: "TpmsPressureRl",
        active: true,
        interval: 1,
        resendInterval: 0,
        minimumDelta: 1
      },
      {
        field: "TpmsPressureRr",
        active: true,
        interval: 1,
        resendInterval: 0,
        minimumDelta: 1
      },
      // Location
      {
        field: "Location",
        active: true,
        interval: 15,
        resendInterval: 0
      },
      {
        field: "GpsHeading",
        active: true,
        interval: 15,
        resendInterval: 0
      },
      {
        field: "MilesToArrival",
        active: true,
        interval: 30,
        resendInterval: 0
      },
      {
        field: "MinutesToArrival",
        active: true,
        interval: 30,
        resendInterval: 0
      },
      {
        field: "ExpectedEnergyPercentAtTripArrival",
        active: true,
        interval: 30,
        resendInterval: 0
      },
      {
        field: "DestinationName",
        active: true,
        interval: 1,
        resendInterval: 0
      },
      {
        field: "DestinationLocation",
        active: true,
        interval: 1,
        resendInterval: 0
      },
      // Climate
      {
        field: "OutsideTemp",
        active: true,
        interval: 30,
        resendInterval: 0,
        minimumDelta: 0.1
      },
      {
        field: "InsideTemp",
        active: true,
        interval: 30,
        resendInterval: 0,
        minimumDelta: 0.1
      },
      {
        field: "DefrostMode",
        active: true,
        interval: 1,
        resendInterval: 0
      },
      {
        field: "HvacPower",
        active: true,
        interval: 1,
        resendInterval: 0
      },
      {
        field: "HvacAutoMode",
        active: true,
        interval: 1,
        resendInterval: 0
      },
      {
        field: "AutoSeatClimateLeft",
        active: true,
        interval: 1,
        resendInterval: 0
      },
      {
        field: "AutoSeatClimateRight",
        active: true,
        interval: 1,
        resendInterval: 0
      },
      {
        field: "SeatHeaterLeft",
        active: true,
        interval: 1,
        resendInterval: 0
      },
      {
        field: "SeatHeaterRight",
        active: true,
        interval: 1,
        resendInterval: 0
      },      
      {
        field: "HvacSteeringWheelHeatAuto",
        active: true,
        interval: 1,
        resendInterval: 0
      },      
      {
        field: "HvacSteeringWheelHeatLevel",
        active: true,
        interval: 1,
        resendInterval: 0
      },      
      // Media
      {
        field: "MediaAudioVolume",
        active: true,
        interval: 1,
        resendInterval: 0
      },
      {
        field: "MediaAudioVolumeMax",
        active: true,
        interval: 1,
        resendInterval: 0
      },
      {
        field: "MediaNowPlayingAlbum",
        active: true,
        interval: 1,
        resendInterval: 0
      },
      {
        field: "MediaNowPlayingArtist",
        active: true,
        interval: 1,
        resendInterval: 0
      },
      {
        field: "MediaNowPlayingTitle",
        active: true,
        interval: 1,
        resendInterval: 0
      },
      {
        field: "MediaPlaybackStatus",
        active: true,
        interval: 1,
        resendInterval: 0
      },
      {
        field: "MediaNowPlayingDuration",
        active: false,
        interval: 1,
        resendInterval: 0
      },
      {
        field: "MediaNowPlayingElapsed",
        active: false,
        interval: 10,
        resendInterval: 0
      },



    ];

module.exports = Object.freeze({
    API_RATELIMIT_LIMIT,
    API_COMMAND_TYPE_COMMAND,
    API_COMMAND_TYPE_COMMAND_WAKES,
    API_REQUEST_COUNTER_READ,
    API_REQUEST_COUNTER_COMMAND,
    API_REQUEST_COUNTER_COMMAND_WAKES,
    API_REQUEST_COUNTER_BLE_SUCCESS,
    API_REQUEST_COUNTER_BLE_ERROR,
    API_ERROR_READ,
    API_ERROR_COMMAND,
    API_ERROR_BLE,
    STATE_ONLINE,
    STATE_OFFLINE,
    STATE_ASLEEP,
    STATE_RATE_LIMIT,
    MILES_TO_KM,
    WINDOW_POSITION_VENT,
    WINDOW_POSITION_CLOSE,
    COMMAND_API_REST,
    COMMAND_API_PROXY,
    COMMAND_API_CMD,
    DOMAIN_INFOTAINMENT,
    DOMAIN_VEHICLE_SECURITY,
    TRUNK_FRONT,
    TRUNK_REAR,
    CHARGING_STATE_DISCONNECTED,
    CHARGING_STATE_CALIBRATING,
    CHARGING_STATE_COMPLETE,
    CHARGING_STATE_NOPOWER,
    CHARGING_STATE_STOPPED,
    CHARGING_STATE_UNKNOWN,
    CHARGING_STATE_STARTING,
    CHARGING_STATE_CHARGING,
    SOFTWARE_UPDATE_STATE_AVAILABLE,
    SOFTWARE_UPDATE_STATE_SCHEDULEDE,
    SOFTWARE_UPDATE_STATE_INSTALLING,
    SOFTWARE_UPDATE_STATE_DOWNLOADING,
    SOFTWARE_UPDATE_STATE_DOWNLOADING_WIFI_WAIT,
    MEDIA_PLAYBACK_STATE_PLAYING,
    MEDIA_PLAYBACK_STATE_STOPPED,
    API_ERRORS_WHITELIST,
    AUTH_TYPE_HMAC_SHA256,
    AUTH_TYPE_AES_GCM,
    BLE_ON,
    BLE_OFF,
    BLE_ONLY,
    SOURCE_BLE,
    SOURCE_FLEETAPI,
    SOURCE_TELEMETRY,
    TELEMETRY_STATUS_CONNECTED,
    TELEMETRY_STATUS_DISCONNECTED,
    TELEMETRY_FIELDS_DEFAULT
})