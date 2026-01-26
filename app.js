'use strict';

const Homey = require('homey');
const TeslaOAuth2App = require('./lib/TeslaOAuth2App');

module.exports = class TeslaApp extends TeslaOAuth2App {

  async onOAuth2Init() {
    if (process.env.DEBUG === '1') {
      if (this.homey.platform == "local") {
        try {
          require('inspector').waitForDebugger();
        }
        catch (error) {
          require('inspector').open(9902, '0.0.0.0', true);
        }
      }
    }
    
    await super.onOAuth2Init();

    await this._initFlowActions();
    await this._initFlowTriggers();
    await this._initFlowConditions();

    await this._initWidgets();
    // this.homey.notifications.createNotification({excerpt: this.homey.__('app.update.update_message')}).catch(error => {this.error('Error sending notification: '+error.message)});

    // await this._initTeslaTelemetryServer();

    this.log('TeslaApp is running...');
  }

  // TELEMETRY SERVER ==============================================================================
  // getTelemetrySettings(){
  //   let telemetrySettings = this.homey.settings.get("telemetry") || {};
  //   if (!telemetrySettings.port_internal) telemetrySettings.port_internal = "8443";
  //   if (!telemetrySettings.server) telemetrySettings.server = "homeyId.telemetry.rwdevelopment.de";
  //   if (!telemetrySettings.port) telemetrySettings.port = "8443";
  //   if (!telemetrySettings.ca) telemetrySettings.ca = '';
  //   if (!telemetrySettings.server_active) telemetrySettings.server_active = false;
  //   if (this._teslaTelemetryServer){
  //     telemetrySettings.status = this._teslaTelemetryServer.getStatus();
  //   }
  //   else{
  //     telemetrySettings.status = null;
  //   }
  //   return telemetrySettings;
  // }

  getTelemetrySettings(){
    const telemetrySettings = {
      ttsHost:              Homey.env.TELEMETRY_TTS_HOST,
      ttsPort:              Homey.env.TELEMETRY_TTS_PORT,
      ttsCa:                Homey.env.TELEMETRY_TTS_CA,
      mqttHost:             Homey.env.TELEMETRY_MQTT_HOST,
      mqttPort:             Homey.env.TELEMETRY_MQTT_PORT,
      // mqttCa:               Homey.env.TELEMETRY_MQTT_CA,
      mqttTopicRoot:        Homey.env.TELEMETRY_MQTT_TOPIC_ROOT,
      mqttTopicVehicle:     Homey.env.TELEMETRY_MQTT_TOPIC_VEHICLE,
      mqttTopicConnection:  Homey.env.TELEMETRY_MQTT_TOPIC_CONNECTION
    }
    return telemetrySettings;
  }

  // async setTelemetrySettings(settings){
  //   let oldSettings = this.getTelemetrySettings();
  //   await this.homey.settings.set("telemetry", settings);
  //   if (oldSettings.server != settings.server || oldSettings.port_internal != settings.port_internal || oldSettings.server_active != settings.server_active){
  //     await this._initTeslaTelemetryServer(true);
  //   }
  // }

  // getTelemetryCa(){
  //   return this.homey.settings.get("telemetry_ca");
  // }

  // async setTelemetryCa(privateCert, caCert){
  //   let ca = {privateCert, caCert};
  //   await this.homey.settings.set("telemetry_ca", ca);
  // }

  // async _initTeslaTelemetryServer(createNewCertificate = false){

  //   let telemetrySettings = this.getTelemetrySettings();

  //   let ca = this.getTelemetryCa();
  //   if (!ca || !ca.privateCert || !ca.caCert || createNewCertificate == true){
  //     const crypt = require('./lib/crypt');
  //     ca = crypt.generateX509(telemetrySettings.server);
  //     await this.setTelemetryCa(ca.privateCert, ca.caCert);
  //   }
  //   try{
  //     if (this._teslaTelemetryServer){
  //       await this._teslaTelemetryServer.stopServer();
  //     }
  //     if (!telemetrySettings.server_active){
  //       this.log("TeslaTelemetryServer disabled");
  //       return;
  //     }
  //     const { TeslaTelemetryServer } = require('./lib/TeslaTelemetryServer.js');
  //     this._teslaTelemetryServer = await new TeslaTelemetryServer(ca.privateCert, ca.caCert);
  //     if (this._teslaTelemetryServer){
  //       this._teslaTelemetryServer.onTelemetryMessage.subscribe(this.onTelemetryMessage.bind(this));
  //       this._teslaTelemetryServer.onTelemetryDisconnect.subscribe(this.onTelemetryDisconnect.bind(this));
  //     }
  //     this.log("TeslaTelemetryServer active: "+ JSON.stringify(this._teslaTelemetryServer.getStatus()));
  //   }
  //   catch(error){
  //     this.error("App._initTeslaTelemetryServer(): Error creating TeslaTelemetryServer: "+error);
  //   }
  // }
  
  // async onTelemetryMessage(message){
  //   // this.log("Telemetra message from VIN "+message.vin+": \n",message.data);
  //   let car = this.homey.drivers.getDriver('car').getDevices().filter(e=>{ return ( e.getData().id == message.vin ) })[0];
  //   if (car){
  //     await car.updateDeviceTelemetry(message.data);
  //   }
  // }

  // async onTelemetryDisconnect(message){
  //   // this.log("Telemetra message from VIN "+message.vin+": \n",message.data);
  //   let car = this.homey.drivers.getDriver('car').getDevices().filter(e=>{ return ( e.getData().id == message.vin ) })[0];
  //   if (car){
  //     await car.updateDeviceTelemetryDisconnect();
  //   }
  // }

  // FLOW ACTIONS ==============================================================================
  async _initFlowActions(){

    // TEST TEST TEST 
    try{
      this.homey.flow.getActionCard('location_set_location')
      .registerRunListener(async (args, state) => {
          await args.device.flowActionSetLocation(args.latitude, args.longitude);
      })
    }    
    catch(error){
      this.log("Flow action [location_set_location] not active for test.");
    }

    // API
    this.homey.flow.getActionCard('api_set_online_interval')
		.registerRunListener(async (args, state) => {
				await args.device.flowActionSetOnlineInterval(args.interval, args.unit);
		});

    this.homey.flow.getActionCard('api_get_costs')
		.registerRunListener(async (args, state) => {
				return await args.device.flowActionApiGetCosts();
		});

    this.homey.flow.getActionCard('api_set_ble_active')
		.registerRunListener(async (args, state) => {
				await args.device.flowActionSetBleActive(args.state);
		});

    // Car
    this.homey.flow.getActionCard('car_ping')
		.registerRunListener(async (args, state) => {
				await args.device.flowActionPing();
		});

    this.homey.flow.getActionCard('car_refresh')
		.registerRunListener(async (args, state) => {
				await args.device.flowActionRefresh();
		});

    this.homey.flow.getActionCard('car_wake_up')
		.registerRunListener(async (args, state) => {
				await args.device.flowActionWakeUp( (args.wait=='wait') );
		});

    this.homey.flow.getActionCard('car_doors')
    .registerRunListener(async (args, state) => {
				await args.device.flowActionDoorLock(args.action == 'lock');
		});

    this.homey.flow.getActionCard('car_door_action')
    .registerRunListener(async (args, state) => {
				await args.device.flowActionDoorAction(args.door, 'open');
		});

    this.homey.flow.getActionCard('car_sentry_mode')
    .registerRunListener(async (args, state) => {
				await args.device.flowActionSentryMode(args.action == 'on');
		});

    this.homey.flow.getActionCard('car_flash_lights')
		.registerRunListener(async (args, state) => {
				await args.device.flowActionFlashLights();
		});

    this.homey.flow.getActionCard('car_honk_horn')
		.registerRunListener(async (args, state) => {
				await args.device.flowActionHonkHorn();
		});

    this.homey.flow.getActionCard('car_trunk')
		.registerRunListener(async (args, state) => {
				await args.device.flowActionTrunk(args.trunk);
		});

    this.homey.flow.getActionCard('car_trunk_front')
		.registerRunListener(async (args, state) => {
				await args.device.flowActionTrunkFront();
		});

    this.homey.flow.getActionCard('car_trunk_rear')
		.registerRunListener(async (args, state) => {
				await args.device.flowActionTrunkRear(args.action);
		});

    this.homey.flow.getActionCard('car_window_position')
		.registerRunListener(async (args, state) => {
				await args.device.flowActionWindowPosition(args.position);
		});

    this.homey.flow.getActionCard('car_schedule_software_update')
		.registerRunListener(async (args, state) => {
				await args.device.flowActionScheduleSoftwareUpdate(args.minutes);
		});

    this.homey.flow.getActionCard('climate_preconditioning')
    .registerRunListener(async (args, state) => {
				await args.device.flowActionPreconditioning(args.action == 'on');
		});

    this.homey.flow.getActionCard('climate_overheat_protection_mode')
    .registerRunListener(async (args, state) => {
				await args.device.flowActionOverheatprotectionMode(args.mode);
		});

    this.homey.flow.getActionCard('climate_overheat_protection_level')
    .registerRunListener(async (args, state) => {
				await args.device.flowActionOverheatprotectionLevel(args.level);
		});

    this.homey.flow.getActionCard('climate_keeper_mode')
    .registerRunListener(async (args, state) => {
				await args.device.flowActionClimateKeeperMode(args.mode);
		});

    this.homey.flow.getActionCard('climate_steering_wheel_heat_level')
    .registerRunListener(async (args, state) => {
				await args.device.flowActionSteeringWheelHeatLevel(args.level);
		});

    this.homey.flow.getActionCard('climate_steering_wheel_heat')
    .registerRunListener(async (args, state) => {
				await args.device.flowActionSteeringWheelHeat(args.level);
		});

    this.homey.flow.getActionCard('climate_seat_heat_level')
    .registerRunListener(async (args, state) => {
				await args.device.flowActionSeatHeatLevel(args.level, args.seat);
		});

    this.homey.flow.getActionCard('climate_defrost')
    .registerRunListener(async (args, state) => {
				await args.device.flowActionDefrost(args.action == 'on');
		});

    this.homey.flow.getActionCard('climate_temperature')
    .registerRunListener(async (args, state) => {
				await args.device.flowActionTemperature(args.temp_driver, args.temp_passenger);
		});

    this.homey.flow.getActionCard('charging_port')
    .registerRunListener(async (args, state) => {
				await args.device.flowActionChargePort(args.action == 'open');
		});

    this.homey.flow.getActionCard('charging_port_unlock')
    .registerRunListener(async (args, state) => {
				await args.device.flowActionChargePortUnlock();
		});

    this.homey.flow.getActionCard('charging_on')
    .registerRunListener(async (args, state) => {
				await args.device.flowActionChargeOn(args.action == 'start');
		});

    this.homey.flow.getActionCard('charge_limit')
    .registerRunListener(async (args, state) => {
				await args.device.flowActionChargeLimit(args.limit);
		});

    this.homey.flow.getActionCard('charge_current')
    .registerRunListener(async (args, state) => {
				await args.device.flowActionChargeCurrent(args.current);
		});

    this.homey.flow.getActionCard('charge_schedule_charging')
    .registerRunListener(async (args, state) => {
				await args.device.flowActionChargeScheduleCharging({action: args.action,hh: args.hh, mm: args.mm});
		});

    this.homey.flow.getActionCard('charge_schedule_departure')
    .registerRunListener(async (args, state) => {
				await args.device.flowActionChargeScheduleDeparture({
          action: args.action,
          hh: args.hh,
          mm: args.mm,
          op_hh: args.op_hh,
          op_mm: args.op_mm,
          preconditioning_enabled: args.preconditioning_enabled,
          preconditioning_weekdays_only: args.preconditioning_weekdays_only,
          off_peak_charging_enabled: args.off_peak_charging_enabled,
          off_peak_charging_weekdays_only: args.off_peak_charging_weekdays_only
        });
		});

    this.homey.flow.getActionCard('charge_deactivate_scheduled_charging')
    .registerRunListener(async (args, state) => {
				await args.device.flowActionChargeDeactivateScheduledCharging();
		});

    this.homey.flow.getActionCard('charge_deactivate_scheduled_departure')
    .registerRunListener(async (args, state) => {
				await args.device.flowActionChargeDeactivateScheduledDeparture();
		});

      // TEST TEST TEST 
    try{
      this.homey.flow.getActionCard('charging_history_suc')
      .registerRunListener(async (args, state) => {
          let result = await args.device.flowActionChargingHistorySuc(args.days);
          return result;
      });
    }    
    catch(error){
      this.log("Flow action [charging_history] not active for test.");
    }

    this.homey.flow.getActionCard('charge_power_meter')
    .registerRunListener(async (args, state) => {
				await args.device.flowActionChargePowerMeter(args.power);
		});

    this.homey.flow.getActionCard('location_navigate_to_location')
    .registerRunListener(async (args, state) => {
				await args.device.flowActionNavigateToLocation(args);
		})
    .registerArgumentAutocompleteListener('location', async (query, args) => {
      const locationList = args.device.getAutocompleteLocationList();
      return locationList.filter((result) => { 
        return result.name.toLowerCase().includes(query.toLowerCase());
      });
    });

    this.homey.flow.getActionCard('location_navigate_to_coordinates')
    .registerRunListener(async (args, state) => {
				await args.device.flowActionNavigateToCoordinates(args);
		})

    this.homey.flow.getActionCard('location_navigation_request')
    .registerRunListener(async (args, state) => {
				await args.device.flowActionNavigationRequest(args.location);
		});
    // .registerArgumentAutocompleteListener('location', async (query, args) => {
    //   const locationList = args.device.getAutocompleteLocationList();
    //   return locationList.filter((result) => { 
    //     return result.name.toLowerCase().includes(query.toLowerCase());
    //   });
    // });

    this.homey.flow.getActionCard('location_navigate_to_nearby_suc')
    .registerRunListener(async (args, state) => {
				await args.device.flowActionNavigateToSuc(args.suc.id);
		})
    .registerArgumentAutocompleteListener('suc', async (query, args) => {
      const nearbySucList = await args.device.getAutocompleteNearbySucList();
      return nearbySucList.filter((result) => { 
        return result.name.toLowerCase().includes(query.toLowerCase());
      });
    });

    this.homey.flow.getActionCard('media_next_fav')
    .registerRunListener(async (args, state) => {
				await args.device.flowActionMediaNextFav();
		});

    this.homey.flow.getActionCard('media_prev_fav')
    .registerRunListener(async (args, state) => {
				await args.device.flowActionMediaPrevFav();
		});

  }

  // FLOW TRIGGER ======================================================================================
  async _initFlowTriggers(){
    this._flowTriggerLocationChanged = this.homey.flow.getDeviceTriggerCard('location_changed');

    this.homey.flow.getDeviceTriggerCard('location_coordinates_left_or_reached')
    .registerRunListener(async (args, state) => {
      return (await args.device.flowTriggerLocationCoordinatesRunListener(args, state) == args.action);
    });

    this.homey.flow.getDeviceTriggerCard('location_left_or_reached')
    .registerRunListener(async (args, state) => {
      return (await args.device.flowTriggerLocationRunListener(args, state) == args.action);
    })
    .registerArgumentAutocompleteListener('location', async (query, args) => {
      const locationList = args.device.getAutocompleteLocationList();
      return locationList.filter((result) => { 
        return result.name.toLowerCase().includes(query.toLowerCase());
      });
    });

    // this._flowTriggerCarSoftwareUpdateAvailable = this.homey.flow.getDeviceTriggerCard('car_software_update_available');

  }

  // FLOW CONDITIONS ==============================================================================
  async _initFlowConditions(){
    this.homey.flow.getConditionCard('alarm_api_error')
		.registerRunListener(async (args, state) => {
			return (args.device.getCapabilityValue('alarm_api_error'));
		})

    this.homey.flow.getConditionCard('api_costs_daily_average')
    .registerRunListener(async (args, state) => {
      return (await args.device.flowConditionApiCostsDailyAverageRunListener(args));
    });

    this.homey.flow.getConditionCard('api_costs_daily_average_percentage')
    .registerRunListener(async (args, state) => {
      return (await args.device.flowConditionApiCostsDailyAveragePercentageRunListener(args));
    });


    this.homey.flow.getConditionCard('battery_heater')
    .registerRunListener(async (args, state) => {
      return (args.device.getCapabilityValue('battery_heater'));
    })

    this.homey.flow.getConditionCard('charging_state')
    .registerRunListener(async (args, state) => {
      if (args.state == 'Connected'){
        return (args.device.getCapabilityValue('charging_state') != 'Disconnected');
      }
      else{
        return (args.device.getCapabilityValue('charging_state') == args.state);
      }
    })

    this.homey.flow.getConditionCard('charging_port')
    .registerRunListener(async (args, state) => {
      return (args.device.getCapabilityValue('charging_port'));
    })

    this.homey.flow.getConditionCard('climate_overheat_protection_mode')
    .registerRunListener(async (args, state) => {
      return (args.device.getCapabilityValue('climate_overheat_protection_mode') == args.mode);
    })

    this.homey.flow.getConditionCard('climate_overheat_protection_level')
    .registerRunListener(async (args, state) => {
      return (args.device.getCapabilityValue('climate_overheat_protection_level') == args.level);
    })

    this.homey.flow.getConditionCard('climate_keeper_mode')
    .registerRunListener(async (args, state) => {
      return (args.device.getCapabilityValue('climate_keeper_mode') == args.mode);
    })

    this.homey.flow.getConditionCard('climate_preconditioning')
    .registerRunListener(async (args, state) => {
      return (args.device.getCapabilityValue('climate_preconditioning'));
    })

    this.homey.flow.getConditionCard('climate_defrost')
    .registerRunListener(async (args, state) => {
      return (args.device.getCapabilityValue('climate_defrost'));
    })

    this.homey.flow.getConditionCard('climate_window_vent')
    .registerRunListener(async (args, state) => {
      return (args.device.getCapabilityValue('climate_window_vent'));
    })

    this.homey.flow.getConditionCard('car_software_update_state')
    .registerRunListener(async (args, state) => {
      return (args.device.getCapabilityValue('car_software_update_state') == args.state);
    })

    this.homey.flow.getConditionCard('car_state')
    .registerRunListener(async (args, state) => {
      return (args.device.getCapabilityValue('car_state') == args.state);
    })

    this.homey.flow.getConditionCard('car_shift_state')
    .registerRunListener(async (args, state) => {
      return (args.device.getCapabilityValue('car_shift_state') == args.state);
    })

    this.homey.flow.getConditionCard('car_doors_locked')
    .registerRunListener(async (args, state) => {
      return (!args.device.getCapabilityValue('car_doors_locked'));
    })

    this.homey.flow.getConditionCard('car_sentry_mode')
    .registerRunListener(async (args, state) => {
      return (args.device.getCapabilityValue('car_sentry_mode'));
    })

    this.homey.flow.getConditionCard('car_user_present')
    .registerRunListener(async (args, state) => {
      return (args.device.getCapabilityValue('car_user_present'));
    })

    this.homey.flow.getConditionCard('climate_steering_wheel_heat_level')
    .registerRunListener(async (args, state) => {
      return (args.device.getCapabilityValue('climate_steering_wheel_heat_level') == args.level);
    })

    this.homey.flow.getConditionCard('location_on_site')
    .registerRunListener(async (args, state) => {
      return (await args.device.flowConditionLocationOnSiteRunListener(args));
    })
    .registerArgumentAutocompleteListener('location', async (query, args) => {
      const locationList = args.device.getAutocompleteLocationList();
      return locationList.filter((result) => { 
        return result.name.toLowerCase().includes(query.toLowerCase());
      });
    });

    this.homey.flow.getConditionCard('location_on_the_way')
    .registerRunListener(async (args, state) => {
      return (await args.device.flowConditionLocationOnTheWayRunListener(args));
    });

  }

  // WIDGETS ==============================================================================
  async _initWidgets(){
    this.homey.dashboards.getWidget('car_main').registerSettingAutocompleteListener('device', async (query, settings) => {
      let cars = [];

      let devices = this.homey.drivers.getDriver('car').getDevices();
      devices.forEach(device => {
          cars.push({
            name: device.getName(),
            id: device.getData().id
          })
      });
      return cars.filter((item) => item.name.toLowerCase().includes(query.toLowerCase()));
    });
  }

  // WIDGET API ============================================================================

  async apiGetCar(){
    let car = this.homey.drivers.getDriver('car').getDevices()[0];
    if (car == undefined){
      throw new Error('No car device found.');
    }
    return car.getData().id;
  }

  async apiGetCarData(id){
    let data = { };
    let car = this.homey.drivers.getDriver('car').getDevices().filter(e=>{ return ( e.getData().id == id ) })[0];
    if (car == undefined){
      throw new Error('No car device found.');
    }
    data['car'] = { };
    data.car.id = car.getData().id;
    data.car.name = car.getName();
    data.car.car_state = car.getCapabilityValue('car_state');

    let carStateList = this.manifest.capabilities.car_state.values;
    let carState = carStateList.find(state => state.id == data.car.car_state);
    let lang = this.homey.i18n.getLanguage();
    data.car.car_state_text = "";
    if (carState && carState.title[lang]){
      data.car.car_state_text = carState.title[lang];
    }
    else if (carState && carState.title['en']){
      data.car.car_state_text = carState.title['en'];
    }

    data.car.last_online = car.getCapabilityValue('last_online');
    data.car.car_doors_locked = car.getCapabilityValue('car_doors_locked');
    data.car.car_sentry_mode = car.getCapabilityValue('car_sentry_mode');
    data.car.meter_car_odo = car.getCapabilityValue('meter_car_odo');
    data.car.meter_car_odo_unit = car.getCapabilityOptions('meter_car_odo').units;
    data.car.measure_car_tpms_pressure_fl = car.getCapabilityValue('measure_car_tpms_pressure_fl');
    data.car.measure_car_tpms_pressure_fr = car.getCapabilityValue('measure_car_tpms_pressure_fr');
    data.car.measure_car_tpms_pressure_rl = car.getCapabilityValue('measure_car_tpms_pressure_rl');
    data.car.measure_car_tpms_pressure_rr = car.getCapabilityValue('measure_car_tpms_pressure_rr');
    data.car.measure_car_tpms_pressure_unit = car.getCapabilityOptions('measure_car_tpms_pressure_fl').units;

    let battery = this.homey.drivers.getDriver('battery').getDevices().filter(e => {return (e.getData().id == id)})[0];
    if (battery){
      data['battery'] = { };
      data.battery.measure_soc_level = battery.getCapabilityValue('measure_soc_level');
      data.battery.measure_soc_usable = battery.getCapabilityValue('measure_soc_usable');
      data.battery.measure_soc_range_estimated = Math.round(battery.getCapabilityValue('measure_soc_range_estimated'));
      data.battery.measure_soc_range_estimated_unit = battery.getCapabilityOptions('measure_soc_range_estimated').units;
      data.battery.battery_heater = battery.getCapabilityValue('battery_heater');
      data.battery.measure_io_battery_power = battery.getCapabilityValue('measure_io_battery_power');
      data.battery.measure_charge_limit_soc = battery.getCapabilityValue('measure_charge_limit_soc');
      data.battery.measure_charge_energy_added = battery.getCapabilityValue('measure_charge_energy_added');
      data.battery.charging_state = battery.getCapabilityValue('charging_state');

      let chargingStateList = this.manifest.capabilities.charging_state.values;
      let chargingState = chargingStateList.find(state => state.id == data.battery.charging_state);
      let lang = this.homey.i18n.getLanguage();
      data.battery.charging_state_text = "";
      if (chargingState && chargingState.title[lang]){
        data.battery.charging_state_text = chargingState.title[lang];
      }
      else if (chargingState && chargingState.title['en']){
        data.car.charging_state_text = chargingState.title['en'];
      }
  
      data.battery.measure_charge_minutes_to_full_charge = battery.getCapabilityValue('measure_charge_minutes_to_full_charge');
      data.battery.measure_charge_power = battery.getCapabilityValue('measure_charge_power');
      data.battery.measure_charge_current = battery.getCapabilityValue('measure_charge_current');
      data.battery.measure_charge_current_max = battery.getCapabilityValue('measure_charge_current_max');
      data.battery.measure_charge_voltage = battery.getCapabilityValue('measure_charge_voltage');
      data.battery.measure_charge_phases = battery.getCapabilityValue('measure_charge_phases');
      data.battery.charging_port = battery.getCapabilityValue('charging_port');
      data.battery.charging_on = battery.getCapabilityValue('charging_on');
      data.battery.charging_port_cable = battery.getCapabilityValue('charging_port_cable');
    }

    let climate = this.homey.drivers.getDriver('climate').getDevices().filter(e => {return (e.getData().id == id)})[0];
    if (climate){
      data['climate'] = { };
      data.climate.target_temperature = climate.getCapabilityValue('target_temperature');
      data.climate.measure_temperature = climate.getCapabilityValue('measure_temperature');
      data.climate.measure_temperature_unit = climate.getCapabilityOptions("measure_climate_temperature_in").units;
      data.climate.climate_ac = climate.getCapabilityValue('climate_ac');
      data.climate.climate_preconditioning = climate.getCapabilityValue('climate_preconditioning');
      data.climate.climate_defrost = climate.getCapabilityValue('climate_defrost');
      data.climate.target_temperature = climate.getCapabilityValue('target_temperature');
      data.climate.target_temperature = climate.getCapabilityValue('target_temperature');
      data.climate.target_temperature = climate.getCapabilityValue('target_temperature');
      data.climate.target_temperature = climate.getCapabilityValue('target_temperature');

    }

    return data;
  }

  async apiRefreshData(id){
    let car = this.homey.drivers.getDriver('car').getDevices().filter(e=>{ return ( e.getData().id == id ) })[0];
    if (car == undefined){
      throw new Error('No car device found.');
    }
    await car.flowActionRefresh();
  }

  async apiSetCarSentry(id, state){
    let car = this.homey.drivers.getDriver('car').getDevices().filter(e=>{ return ( e.getData().id == id ) })[0];
    if (car == undefined){
      throw new Error('No car device found.');
    }
    await car.flowActionSentryMode(state);
  }

  async apiSetClimatePreconditioning(id, state){
    let climateDevice = this.homey.drivers.getDriver('climate').getDevices().filter(e => {return (e.getData().id == id)})[0];
    if (climateDevice == undefined){
      throw new Error('No car device found.');
    }
    await climateDevice.flowActionPreconditioning(state);
  }

  async apiSetClimateDefrost(id, state){
    let climateDevice = this.homey.drivers.getDriver('climate').getDevices().filter(e => {return (e.getData().id == id)})[0];
    if (climateDevice == undefined){
      throw new Error('No car device found.');
    }
    await climateDevice.flowActionDefrost(state);
  }

  async apiSetChargingPort(id, state){
    let batteryDevice = this.homey.drivers.getDriver('battery').getDevices().filter(e => {return (e.getData().id == id)})[0];
    if (batteryDevice == undefined){
      throw new Error('No car device found.');
    }
    await batteryDevice.flowActionChargePort(state);
  }


}
