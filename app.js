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

    this.homey.flow.getActionCard('car_doors_lock')
    .registerRunListener(async (args, state) => {
				await args.device.flowActionDoorLock(true);
		});

    this.homey.flow.getActionCard('car_doors_unlock')
    .registerRunListener(async (args, state) => {
				await args.device.flowActionDoorLock(false);
		});

    this.homey.flow.getActionCard('car_sentry_mode_on')
    .registerRunListener(async (args, state) => {
				await args.device.flowActionSentryMode(true);
		});

    this.homey.flow.getActionCard('car_sentry_mode_off')
    .registerRunListener(async (args, state) => {
				await args.device.flowActionSentryMode(false);
		});

    this.homey.flow.getActionCard('car_flash_lights')
		.registerRunListener(async (args, state) => {
				await args.device.flowActionFlashLights();
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
}
