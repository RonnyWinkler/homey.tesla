const TeslaOAuth2Driver = require('../../lib/TeslaOAuth2Driver');

module.exports = class CarDriver extends TeslaOAuth2Driver {

  async onOAuth2Init() {
    // Register Flow Cards etc.
    await super.onOAuth2Init();
  }

  async onPair(session){

    session.setHandler("getClientId", async () => {
      return {
        clientId: this.homey.settings.get('client_id') || '',
        clientSecret: this.homey.settings.get('client_secret') || ''
      };
    });

    session.setHandler("setClientId", async (data) => {
      this.log("setClientId() => ", data.clientId);
      // Clear certificate is client_id changed
      if (data.clientId != this.homey.settings.get('client_id') ||
          data.clientSecret != this.homey.settings.get('client_secret') ){
            this.log("setClientId() => client credentials changed, Clear certificate");
          await this.homey.settings.set("public_key", '');
          await this.homey.settings.set("private_key", '');
      }
      await this.homey.settings.set("client_id", data.clientId);
      await this.homey.settings.set("client_secret", data.clientSecret);
    });


    // session.setHandler("getCertificate", async (forceCreate) => {
    //   return await this.getCertificate(session, forceCreate);
    // });

    // session.setHandler("getDomain", () => {
    //   return this.homey.settings.get("domain") || '';
    // });

    // session.setHandler("setDomain", async (domain) => {
    //   return await this.homey.settings.set("domain", domain);
    // });

    // session.setHandler("registerDomain", async (domain) => {
    //   await this.homey.settings.set("domain", domain);
    //   return await this.registerDomain(domain);
    // });

    super.onPair(session);

  }

  
  async onRepair(session, device) {

    this.log("onRepair()");
    let installed = false;

    session.setHandler('getDeviceData', async (view) => {
        return await this.onGetDeviceData(session, view, device);
    });

    session.setHandler("getClientId", async () => {
      return {
        clientId: this.homey.settings.get('client_id') || '',
        clientSecret: this.homey.settings.get('client_secret') || ''
      };
    });

    session.setHandler("setClientId", async (data) => {
      await this.homey.settings.set("client_id", data.clientId);
      await this.homey.settings.set("client_secret", data.clientSecret);
      // this.setClientId({ clientId: data.clientId, clientSecret: data.clientSecret });
    });

    session.setHandler("getCertificate", async (forceCreate) => {
      return await this.getCertificate(session, forceCreate);
    });

    session.setHandler("getDomain", () => {
      return this.homey.settings.get("domain") || '';
    });

    session.setHandler("setDomain", async (domain) => {
      return await this.homey.settings.set("domain", domain);
    });

    session.setHandler("registerDomain", async (domain) => {
      await this.homey.settings.set("domain", domain);
      return await this.registerDomain(domain);
    });
    
    super.onRepair(session, device);

  }

  async onPairListDevices({ oAuth2Client }) {

    let devices = [];

    let data = await oAuth2Client.getVehicles();

    for (let i=0; i<data.length; i++){
      devices.push({
        data: {
          id: data[i].vin,
        },
        name: data[i].display_name,
        settings: {
          car_data_vin: data[i].vin
        }
      });
    }
    return devices;
  }

  // onFilterDevice(device) {
  // }

  async onGetDeviceData(session, view, device){
    return device.getCarData();
  }

}
