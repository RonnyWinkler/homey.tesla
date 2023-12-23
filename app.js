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
  }

  // FLOW ACTIONS ==============================================================================
  async _initFlowActions(){

    this.homey.flow.getActionCard('refresh')
		.registerRunListener(async (args, state) => {
				await args.device.flowActionRefresh();
		});

    this.homey.flow.getActionCard('wake_up')
		.registerRunListener(async (args, state) => {
				await args.device.flowActionWakeUp( (args.wait=='wait') );
		});

    this.homey.flow.getActionCard('set_location')
    .registerRunListener(async (args, state) => {
				await args.device.flowActionSetLocation(args.latitude, args.longitude);
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

    this.homey.flow.getActionCard('car_window_position')
		.registerRunListener(async (args, state) => {
				await args.device.flowActionWindowPosition(args.position);
		});

    this.homey.flow.getActionCard('climate_preconditioning')
    .registerRunListener(async (args, state) => {
				await args.device.flowActionPreconditioning(args.action == 'on');
		});

    this.homey.flow.getActionCard('climate_overheat_protection_mode')
    .registerRunListener(async (args, state) => {
				await args.device.flowActionPreconditioningMode(args.mode);
		});

    this.homey.flow.getActionCard('climate_overheat_protection_level')
    .registerRunListener(async (args, state) => {
				await args.device.flowActionPreconditioningLevel(args.level);
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

    this.homey.flow.getActionCard('charging_on')
    .registerRunListener(async (args, state) => {
				await args.device.flowActionChargeOn(args.action == 'start');
		});

  }

  // FLOW TRIGGER ======================================================================================
  async _initFlowTriggers(){
    this._flowTriggerLocationChanged = this.homey.flow.getDeviceTriggerCard('location_changed');

    this.homey.flow.getDeviceTriggerCard('location_coordinates_left_or_reached')
    .registerRunListener(async (args, state) => {
      return (await args.device.flowTriggerLocationCoordinatesRunListener(args) == args.action);
    });

    this.homey.flow.getDeviceTriggerCard('location_left_or_reached')
    .registerRunListener(async (args, state) => {
      return (await args.device.flowTriggerLocationRunListener(args) == args.action);
    })
    .registerArgumentAutocompleteListener('location', async (query, args) => {
      const locationList = args.device.getAutocompleteLocationList();
      return locationList.filter((result) => { 
        return result.name.toLowerCase().includes(query.toLowerCase());
      });
    });

  }

  // FLOW CONDITIONS ==============================================================================
  async _initFlowConditions(){
  
  }

}
