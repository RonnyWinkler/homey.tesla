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
  }

  // FLOW ACTIONS ==============================================================================
  async _initFlowActions(){

    this._flowActionRefresh = this.homey.flow.getActionCard('refresh');
		this._flowActionRefresh.registerRunListener(async (args, state) => {
				await args.device.flowActionRefresh();
		});

    this._flowActionWakeUp = this.homey.flow.getActionCard('wake_up');
		this._flowActionWakeUp.registerRunListener(async (args, state) => {
				await args.device.flowActionWakeUp( (args.wait=='wait') );
		});

    this._flowActionFlashLights = this.homey.flow.getActionCard('flash_lights');
		this._flowActionFlashLights.registerRunListener(async (args, state) => {
				await args.device.flowActionFlashLights();
		});

  }

}
