'use strict';


function _getInitialCarDataFleetApi(){
  return {
    charge_state: {},
    drive_state: {},
    vehicle_state: {},
    climate_state: {},
  }
}

function mapCarDataBle2FleetApi(carDataBle, carDataFleetApi = _getInitialCarDataFleetApi()){
  if (carDataBle.chargeState){
    if (!carDataFleetApi['charge_state']){
      carDataFleetApi['charge_state'] = {}
    }
    carDataFleetApi.charge_state.battery_level              = carDataBle.chargeState.batteryLevel;
    carDataFleetApi.charge_state.ideal_battery_range        = carDataBle.chargeState.idealBatteryRange;
    carDataFleetApi.charge_state.est_battery_range          = carDataBle.chargeState.estBatteryRange;
    carDataFleetApi.charge_state.charge_limit_soc           = carDataBle.chargeState.chargeLimitSoc;
    carDataFleetApi.charge_state.charge_energy_added        = Math.round(carDataBle.chargeState.chargeEnergyAdded *100)/100;
    carDataFleetApi.charge_state.charging_state             = carDataBle.chargeState.chargingState != undefined ? Object.keys(carDataBle.chargeState.chargingState)[0] : null; // BLE: JSON, API: string
    carDataFleetApi.charge_state.charger_power              = carDataBle.chargeState.chargerPower;
    carDataFleetApi.charge_state.charger_actual_current     = carDataBle.chargeState.chargerActualCurrent;
    carDataFleetApi.charge_state.charge_amps                = carDataBle.chargeState.chargingAmps;
    carDataFleetApi.charge_state.charger_voltage            = carDataBle.chargeState.chargerVoltage;
    carDataFleetApi.charge_state.charger_phases             = carDataBle.chargeState.chargerPhases;
    carDataFleetApi.charge_state.charge_port_door_open      = carDataBle.chargeState.chargePortDoorOpen;
    carDataFleetApi.charge_state.conn_charge_cable          = carDataBle.chargeState.connChargeCable != undefined ? Object.keys(carDataBle.chargeState.connChargeCable)[0] : null; // BLE: JSON element, API: string
  }

      // Not used in device:
      // battery_heater_on: null,
      // battery_range:                    carDataBle.chargeState.batteryRange,
      // charge_current_request:           carDataBle.chargeState.chargeCurrentRequest,
      // charge_current_request_max:       carDataBle.chargeState.chargeCurrentRequestMax, 
      // charge_enable_request:            carDataBle.chargeState.chargeEnableRequest,
      // charge_limit_soc_max:             carDataBle.chargeState.chargeLimitSocMax,
      // charge_limit_soc_min:             carDataBle.chargeState.chargeLimitSocMin,
      // charge_limit_soc_std:             carDataBle.chargeState.chargeLimitSocStd,
      // charge_miles_added_ideal:         carDataBle.chargeState.chargeMilesAddedIdeal,
      // charge_miles_added_rated:         carDataBle.chargeState.chargeMilesAddedRated,
      // charge_port_cold_weather_mode:    carDataBle.chargeState.chargePortColdWeatherMode,
      // charge_port_color:                carDataBle.chargeState.chargePortColor, // BLE: number, API: string, Mapping unknown
      // charge_port_latch:                carDataBle.chargeState.chargePortLatch != undefined ? Object.keys(carDataBle.chargeState.chargePortLatch)[0] : null, // BLE: JSON element, API: string
      // charge_rate: null,
      // charger_pilot_current:            carDataBle.chargeState.chargerPilotCurrent,
      // fast_charger_brand: null,
      // fast_charger_present:             carDataBle.chargeState.fastChargerPresent,
      // fast_charger_type: null,
      // max_range_charge_counter:         carDataBle.chargeState.maxRangeChargeCounter,
      // minutes_to_full_charge: null,
      // not_enough_power_to_heat: null,
      // off_peak_charging_enabled: false,
      // off_peak_charging_times: null,    // BLE: JSON element, API: string
      // preconditioning_enabled:          carDataBle.chargeState.preconditioningEnabled,
      // preconditioning_times: null,      // BLE: JSON element, API: string  
      // scheduled_charging_mode:          carDataBle.chargeState.scheduledChargingMode != undefined ? Object.keys(carDataBle.chargeState.scheduledChargingMode)[0] : null, // BLE: JSON element, API: string
      // scheduled_charging_pending:       carDataBle.chargeState.scheduledChargingPending,
      // scheduled_charging_start_time:    carDataBle.chargeState.scheduledChargingStartTimeApp, // ???
      // scheduled_departure_time:         carDataBle.chargeState.scheduledDepartureTime.seconds,
      // supercharger_session_trip_planner:  carDataBle.chargeState.superchargerSessionTripPlanner,
      // time_to_full_charge: null,
      // timestamp:                        carDataBle.chargeState.timestamp.seconds,
      // trip_charging:                    carDataBle.chargeState.tripCharging,
      // usable_battery_level:             carDataBle.chargeState.usableBatteryLevel,
      // user_charge_enable_request: null,

  if (carDataBle.locationState){
    if (!carDataFleetApi['drive_state']){
      carDataFleetApi['drive_state'] = {}
    }
    carDataFleetApi.drive_state['timestamp'] = carDataBle.locationState.timestamp.seconds;
    carDataFleetApi.drive_state['heading'] = carDataBle.locationState.heading;
    carDataFleetApi.drive_state['latitude'] = carDataBle.locationState.latitude;
    carDataFleetApi.drive_state['longitude'] = carDataBle.locationState.longitude;
  }

  if (carDataBle.closuresState){
    if (!carDataFleetApi['vehicle_state']){
      carDataFleetApi['vehicle_state'] = {}
    }
    carDataFleetApi.vehicle_state['locked'] = carDataBle.closuresState.locked;
    if (carDataBle.closuresState.sentryModeState != undefined){
      carDataFleetApi.vehicle_state['sentry_mode'] = (Object.keys(carDataBle.closuresState.sentryModeState)[0] == 'Armed') ? true : false; // BLE: JSON element, API: boolean
    } 
    carDataFleetApi.vehicle_state['is_user_present'] = carDataBle.closuresState.isUserPresent;
    carDataFleetApi.vehicle_state['ft'] = carDataBle.closuresState.doorOpenTrunkFront;
    carDataFleetApi.vehicle_state['rt'] = carDataBle.closuresState.doorOpenTrunkRear;
    // Climate device data:
    carDataFleetApi.vehicle_state['fd_window'] = carDataBle.closuresState.windowOpenDriverFront;
    carDataFleetApi.vehicle_state['rd_window'] = carDataBle.closuresState.windowOpenDriverRear;
    carDataFleetApi.vehicle_state['fp_window'] = carDataBle.closuresState.windowOpenPassengerFront;
    carDataFleetApi.vehicle_state['rp_window'] = carDataBle.closuresState.windowOpenPassengerRear;
    
  }

  if (carDataBle.tirePressureState){
    if (!carDataFleetApi['vehicle_state']){
      carDataFleetApi['vehicle_state'] = {}
    }
    carDataFleetApi.vehicle_state['tpms_pressure_fl'] = carDataBle.tirePressureState.tpmsPressureFl;
    carDataFleetApi.vehicle_state['tpms_pressure_fr'] = carDataBle.tirePressureState.tpmsPressureFr;
    carDataFleetApi.vehicle_state['tpms_pressure_rl'] = carDataBle.tirePressureState.tpmsPressureRl;
    carDataFleetApi.vehicle_state['tpms_pressure_rr'] = carDataBle.tirePressureState.tpmsPressureRr;
  }

  if (carDataBle.climateState){
    if (!carDataFleetApi['climate_state']){
      carDataFleetApi['climate_state'] = {}
    }
    carDataFleetApi.climate_state['driver_temp_setting'] = carDataBle.climateState.driverTempSetting;
    carDataFleetApi.climate_state['inside_temp'] = Math.round(carDataBle.climateState.insideTempCelsius *100)/100;
    carDataFleetApi.climate_state['outside_temp'] = Math.round(carDataBle.climateState.outsideTempCelsius *100)/100; 
    carDataFleetApi.climate_state['min_avail_temp'] = carDataBle.climateState.minAvailTempCelsius;
    carDataFleetApi.climate_state['max_avail_temp'] = carDataBle.climateState.maxAvailTempCelsius;
    carDataFleetApi.climate_state['is_climate_on'] = carDataBle.climateState.isClimateOn;
    carDataFleetApi.climate_state['is_auto_conditioning_on'] = carDataBle.climateState.isAutoConditioningOn;
    carDataFleetApi.climate_state['is_preconditioning'] = carDataBle.climateState.isPreconditioning;
    if (carDataBle.climateState.defrostMode != undefined){
      carDataFleetApi.climate_state['defrost_mode'] = (Object.keys(carDataBle.climateState.defrostMode)[0] == 'Off') ? false : true; // BLE: JSON element, API: boolean
    }     
    carDataFleetApi.climate_state['cabin_overheat_protection'] = carDataBle.climateState.cabinOverheatProtection;
    carDataFleetApi.climate_state['cop_activation_temperature'] = carDataBle.climateState.copActivationTemperature;
    // if (carDataBle.climateState.climateKeeperMode != undefined){
    //   let mode = (Object.keys(carDataBle.climateState.climateKeeperMode)[0];
    //   carDataFleetApi.climate_state['climate_keeper_mode'] = ...
    // } 
    carDataFleetApi.climate_state['auto_steering_wheel_heat'] = carDataBle.climateState.autoSteeringWheelHeat;
    carDataFleetApi.climate_state['steering_wheel_heat_level'] = carDataBle.climateState.steeringWheelHeatLevel;
    carDataFleetApi.climate_state['auto_seat_climate_left'] = carDataBle.climateState.autoSeatClimateLeft;
    carDataFleetApi.climate_state['auto_seat_climate_right'] = carDataBle.climateState.autoSeatClimateRight;
    carDataFleetApi.climate_state['seat_heater_left'] = carDataBle.climateState.seatHeaterLeft;
    carDataFleetApi.climate_state['seat_heater_right'] = carDataBle.climateState.seatHeaterRight;
  }

  // Software state has no useful data. Status in unknown. Version is empty...
  // if (carDataBle.softwareUpdateState){
  //   if (!carDataFleetApi['vehicle_state']){
  //     carDataFleetApi['vehicle_state'] = {}
  //   }
  //   if (carDataBle.softwareUpdateState.status != undefined){
  //     let status = (Object.keys(carDataBle.softwareUpdateState.status)[0];
  //     switch (status) {
  //       case 'Unknown':
  //         break;     
  //       default:
  //         break;
  //     }
  //   } 
  // }

  return carDataFleetApi;
}

module.exports = { 
  mapCarDataBle2FleetApi
};
