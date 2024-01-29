'use strict';

const TeslaOAuth2App = require('./lib/TeslaOAuth2App');

module.exports = class TeslaApp extends TeslaOAuth2App {

  async onOAuth2Init() {
    if (process.env.DEBUG === '1') {
      if (this.homey.platform == "local") {
        try {
          require('inspector').waitForDebugger();
        }
        catch (error) {
          require('inspector').open(9251, '0.0.0.0', true);
        }
      }
    }
    
    await super.onOAuth2Init();

    await this._initFlowActions();
    await this._initFlowTriggers();
    await this._initFlowConditions();

    // this.homey.notifications.createNotification({excerpt: this.homey.__('app.update.update_message')}).catch(error => {this.error('Error sending notification: '+error.message)});

  }

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

    this.homey.flow.getActionCard('climate_steering_wheel_heat_level')
    .registerRunListener(async (args, state) => {
				await args.device.flowActionSteeringWheelHeatLevel(args.level);
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
				await args.device.flowActionChargeScheduleCharging({hh: args.hh, mm: args.mm});
		});

    this.homey.flow.getActionCard('charge_schedule_departure')
    .registerRunListener(async (args, state) => {
				await args.device.flowActionChargeScheduleDeparture({
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

    this.homey.flow.getActionCard('location_navigation_request')
    .registerRunListener(async (args, state) => {
				await args.device.flowActionNavigationRequest(args);
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

}
