const TeslaOAuth2Driver = require('../../lib/TeslaOAuth2Driver');

module.exports = class CarDriver extends TeslaOAuth2Driver {

  async onOAuth2Init() {
    // Register Flow Cards etc.
    await super.onOAuth2Init();
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

  async onRepair(session, device) {

    this.log("onRepair()");
    let installed = false;

    session.setHandler('getDeviceData', async (view) => {
        return await this.onGetDeviceData(session, view, device);
    });

    super.onRepair(session, device);

  }
  // onFilterDevice(device) {
  // }

  // async onPairListDevices({ oAuth2Client }) {
  //   const things = await oAuth2Client.getThings({ color: 'red' });
  //   return things.map(thing => {
  //     return {
  //       name: thing.name,
  //       data: {
  //         id: thing.id,
  //       },
  //     }
  //   });
  // }

  async onGetDeviceData(session, view, device){
    return device.getCarData();
  }

}

// "use strict";
// const Homey = require('homey');

// const API_URL = "https://auth.tesla.com/oauth2/v3/authorize?response_type=code";
// const CALLBACK_URL = "https://callback.athom.com/oauth2/callback";
// const CLIENT_ID = Homey.env.CLIENT_ID;
// const OAUTH_URL = `${API_URL}&client_id=${CLIENT_ID}&redirect_uri=${CALLBACK_URL}&scope=openid%20vehicle_device_data%20offline_access%20vehicle_cmds%20vehicle_charging_cmd`;

// class accountDriver extends Homey.Driver {
//     async onPair(session) {
//         this.log("onPair()");

//         const myOAuth2Callback = await this.homey.cloud.createOAuth2Callback(OAUTH_URL);

//         myOAuth2Callback
//             .on("url", (url) => {
//                 // dend the URL to the front-end to open a popup
//                 session.emit("url", url);
//             })
//             .on("code", (code) => {
//                 // ... swap your code here for an access token
        
//                 // tell the front-end we're done
//                 session.emit("authorized");
//             });
    
//         session.setHandler("list_devices", async () => {
//             return await this.onPairListDevices(session);
//         });
      
//     } // end onPair

//     async onPairListDevices(session) {
//         this.log("onPairListDevices()" );
//         let devices = [];
//         devices.push(
//             {
//                 name: "Tesla Account",
//                 data: {
//                     id: this.getUIID()
//                 }
//             }
//         );
//         this.log("Found devices:");
//         this.log(devices);
//         return devices;
//     }

//     getUIID() {
//         function s4() {
//             return Math.floor((1 + Math.random()) * 0x10000)
//             .toString(16)
//             .substring(1);
//         }
//         return `${s4() + s4()}-${s4()}-${s4()}-${s4()}-${s4()}${s4()}${s4()}`;
//     }

// }
// module.exports = accountDriver;