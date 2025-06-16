const { OAuth2Driver } = require('homey-oauth2app');

const OAuth2Util = require('../node_modules/homey-oauth2app/lib/OAuth2Util');
const crypt = require('./crypt');
const https = require('./https');
const fs = require('fs');

module.exports = class TeslaOAuth2Driver extends OAuth2Driver {

  async onOAuth2Init() {
    // Register Flow Cards etc.
  }

  onPair(socket) {
    // let OAuth2SessionId = '$new';
    // let currentViewId = 'list_sessions';
    // let client = undefined;
    // const OAuth2ConfigId = this.getOAuth2ConfigId();

    // // const onShowViewLoginCredentials = () => {
    // //   if (OAuth2SessionId !== '$new') {
    // //     socket.nextView().catch(this.error);
    // //   }
    // // };

    // const onLogin = async ({ clientId, clientSecret }) => {
    // };    
    // // const onLogin = async ({ clientId, clientSecret }) => {
    // //   if (  clientId == undefined || clientId == '' ||
    // //         clientSecret == undefined || clientSecret == '' ) {
    // //     return false;
    // //   }
    
    // //   // const config = this.homey.app.getConfig({
    // //   //   configId: OAuth2ConfigId,
    // //   // });
    // //   // config.clientId = username;
    // //   // config.clientSecret = password;
    // //   // this.homey.app.setOAuth2Config(config);

    // //   // client.CLIENT_ID = username;
    // //   // client.CLIENT_SECRET = password;

    // //   client = this.homey.app.createOAuth2Client({
    // //     sessionId: OAuth2Util.getRandomId(),
    // //     configId: OAuth2ConfigId,
    // //     optionalClientId: clientId,
    // //     optionalClientSecret: clientSecret
    // //   });
  
    // //   const OAuth2Config = this.homey.app.getConfig({
    // //     configId: OAuth2ConfigId,
    // //   });
    // //   const { allowMultiSession } = OAuth2Config;
    // //   if (!allowMultiSession) {
    // //     const savedSessions = this.homey.app.getSavedOAuth2Sessions();
    // //     if (Object.keys(savedSessions).length) {
    // //       OAuth2SessionId = Object.keys(savedSessions)[0];
    // //       try {
    // //         client = this.homey.app.getOAuth2Client({
    // //           configId: OAuth2ConfigId,
    // //           sessionId: OAuth2SessionId,
    // //         });
    // //         this.log(`Multi-Session disabled. Selected ${OAuth2SessionId} as active session.`);
    // //       } catch (err) {
    // //         this.error(err);
    // //       }
    // //     }
    // //   }    
    // //   return true;
    // // };

    // /**
    //  * @returns {Promise<void>}
    //  */
    // const onShowViewLoginOAuth2 = async () => {
    //   if (OAuth2SessionId !== '$new') {
    //     socket.emit('authorized').catch(this.error);
    //     return;
    //   }

    //   try {

    //     // Create client with optional clientId and clientSecret
    //     client = this.homey.app.createOAuth2Client({
    //       sessionId: OAuth2Util.getRandomId(),
    //       configId: OAuth2ConfigId
    //       // ,
    //       // optionalClientId: this.homey.settings.get('client_id') || '',
    //       // optionalClientSecret: this.homey.settings.get('client_secret') || ''
    //     });
    
    //     const OAuth2Config = this.homey.app.getConfig({
    //       configId: OAuth2ConfigId,
    //     });
    //     const { allowMultiSession } = OAuth2Config;
    //     if (!allowMultiSession) {
    //       const savedSessions = this.homey.app.getSavedOAuth2Sessions();
    //       if (Object.keys(savedSessions).length) {
    //         OAuth2SessionId = Object.keys(savedSessions)[0];
    //         try {
    //           client = this.homey.app.getOAuth2Client({
    //             configId: OAuth2ConfigId,
    //             sessionId: OAuth2SessionId,
    //           });
    //           this.log(`Multi-Session disabled. Selected ${OAuth2SessionId} as active session.`);
    //         } catch (err) {
    //           this.error(err);
    //         }
    //       }
    //     }    


    //     const oAuth2AuthorizationUrl = client.getAuthorizationUrl();
    //     const oAuth2Callback = await this.homey.cloud.createOAuth2Callback(oAuth2AuthorizationUrl);
    //     oAuth2Callback
    //       .on('url', url => {
    //         socket.emit('url', url).catch(this.error);
    //       })
    //       .on('code', code => {
    //         client.getTokenByCode({ code })
    //           .then(async () => {
    //             // get the client's session info
    //             const session = await client.onGetOAuth2SessionInformation();
    //             OAuth2SessionId = session.id;
    //             const token = client.getToken();
    //             const { title } = session;
    //             client.destroy();

    //             // replace the temporary client by the final one and save it
    //             client = this.homey.app.createOAuth2Client({
    //               sessionId: session.id,
    //               configId: OAuth2ConfigId
    //               // ,
    //               // optionalClientId: this.homey.settings.get('client_id') || '',
    //               // optionalClientSecret: this.homey.settings.get('client_secret') || ''
    //             });
    //             client.setTitle({ title });
    //             client.setToken({ token });

    //             socket.emit('authorized').catch(this.error);
    //           })
    //           .catch(err => {
    //             socket.emit('error', err.message || err.toString()).catch(this.error);
    //           });
    //       });
    //   } catch (err) {
    //     socket.emit('error', err.message || err.toString()).catch(this.error);
    //   }
    // };

    const OAuth2ConfigId = this.getOAuth2ConfigId();
    let OAuth2SessionId = '$new';
    let currentViewId = 'list_sessions';
    let client = this.homey.app.createOAuth2Client({
      sessionId: OAuth2Util.getRandomId(),
      configId: OAuth2ConfigId,
    });

    const OAuth2Config = this.homey.app.getConfig({
      configId: OAuth2ConfigId,
    });
    const { allowMultiSession } = OAuth2Config;
    if (!allowMultiSession) {
      const savedSessions = this.homey.app.getSavedOAuth2Sessions();
      if (Object.keys(savedSessions).length) {
        OAuth2SessionId = Object.keys(savedSessions)[0];
        try {
          client = this.homey.app.getOAuth2Client({
            configId: OAuth2ConfigId,
            sessionId: OAuth2SessionId,
          });
          this.log(`Multi-Session disabled. Selected ${OAuth2SessionId} as active session.`);
        } catch (err) {
          this.error(err);
        }
      }
    }

    const onShowViewLoginCredentials = () => {
      if (OAuth2SessionId !== '$new') {
        socket.nextView().catch(this.error);
      }
    };

    const onLogin = async ({ username, password }) => {
      await client.getTokenByCredentials({ username, password });
      const session = await client.onGetOAuth2SessionInformation();

      OAuth2SessionId = session.id;
      const token = client.getToken();
      const { title } = session;
      client.destroy();

      // replace the temporary client by the final one and save it
      client = this.homey.app.createOAuth2Client({
        sessionId: session.id,
        configId: OAuth2ConfigId,
      });
      client.setTitle({ title });
      client.setToken({ token });

      return true;
    };

    /**
     * @returns {Promise<void>}
     */
    const onShowViewLoginOAuth2 = async () => {
      if (OAuth2SessionId !== '$new') {
        socket.emit('authorized').catch(this.error);
        return;
      }

      try {
        const oAuth2AuthorizationUrl = client.getAuthorizationUrl();
        const oAuth2Callback = await this.homey.cloud.createOAuth2Callback(oAuth2AuthorizationUrl);
        oAuth2Callback
          .on('url', url => {
            socket.emit('url', url).catch(this.error);
          })
          .on('code', code => {
            client.getTokenByCode({ code })
              .then(async () => {
                // get the client's session info
                const session = await client.onGetOAuth2SessionInformation();
                OAuth2SessionId = session.id;
                const token = client.getToken();
                const { title } = session;
                client.destroy();

                // replace the temporary client by the final one and save it
                client = this.homey.app.createOAuth2Client({
                  sessionId: session.id,
                  configId: OAuth2ConfigId,
                });
                client.setTitle({ title });
                client.setToken({ token });

                socket.emit('authorized').catch(this.error);
              })
              .catch(err => {
                socket.emit('error', err.message || err.toString()).catch(this.error);
              });
          });
      } catch (err) {
        socket.emit('error', err.message || err.toString()).catch(this.error);
      }
    };

    const onShowView = async viewId => {
      currentViewId = viewId;
      if (viewId === 'login_oauth2') {
        onShowViewLoginOAuth2();
      } else if (viewId === 'login_credentials') {
        onShowViewLoginCredentials();
      }
      else if (viewId === 'pair_step_03') {
        try{
          await this.getCertificate();
          await this.registerDomain();
          await socket.nextView();
        }
        catch(error){
          this.log("Error on writing public key or domain registration: " + error.message);
          this.errorMessage = error.message;
          await socket.showView('error');
        }
      }
    };

    const onListSessions = async () => {
      if (!allowMultiSession) {
        throw new Error('Multi-Session is disabled.\nPlease remove the list_devices from your App\'s manifest or allow Multi-Session support.');
      }

      const savedSessions = this.homey.app.getSavedOAuth2Sessions();
      const result = Object.keys(savedSessions).map((sessionId, i) => {
        const session = savedSessions[sessionId];
        return {
          name: session.title || `Saved User ${i + 1}`,
          data: { id: sessionId },
        };
      });

      result.push({
        name: 'New User',
        data: {
          id: '$new',
        },
      });

      return result;
    };

    const onListSessionsSelection = async ([selection]) => {
      if (!allowMultiSession) {
        throw new Error('Multi-Session is disabled.');
      }

      const { id } = selection.data;

      OAuth2SessionId = id;
      this.log(`Selected session ${OAuth2SessionId}`);

      if (OAuth2SessionId !== '$new') {
        client = this.homey.app.getOAuth2Client({
          configId: OAuth2ConfigId,
          sessionId: OAuth2SessionId,
        });
      }
    };

    const onListDevices = async data => {
      if (currentViewId === 'list_sessions') {
        return onListSessions(data);
      }

      const devices = await this.onPairListDevices({
        oAuth2Client: client,
      });

      return devices.map(device => {
        return {
          ...device,
          store: {
            ...device.store,
            OAuth2SessionId,
            OAuth2ConfigId,
          },
        };
      });
    };

    const onAddDevice = async () => {
      this.log('At least one device has been added, saving the client...');
      client.save();
    };

    const onDisconnect = async () => {
      this.log('Pair Session Disconnected');
    };

    const onGetErrorMessage = async () => {
      return {message: this.errorMessage};
    };

    const onGetCarRegistrationUrl = async () => {
      let domain = await this.homey.cloud.getHomeyId() + '.tesla.rwdevelopment.de';
      return 'https://www.tesla.com/_ak/' + domain;
    }

    socket
      .setHandler('getErrorMessage', onGetErrorMessage)
      .setHandler('getCarRegistrationUrl', onGetCarRegistrationUrl)
      .setHandler('showView', onShowView)
      .setHandler('login', onLogin)
      .setHandler('list_sessions', onListSessions)
      .setHandler('list_sessions_selection', onListSessionsSelection)
      .setHandler('list_devices', onListDevices)
      .setHandler('add_device', onAddDevice)
      .setHandler('disconnect', onDisconnect);
  }

  onRepair(socket, device) {
    let client;

    let {
      OAuth2SessionId,
      OAuth2ConfigId,
    } = device.getStore();

    if (!OAuth2SessionId) {
      OAuth2SessionId = OAuth2Util.getRandomId();
    }

    if (!OAuth2ConfigId) {
      OAuth2ConfigId = this.getOAuth2ConfigId();
    }

    // Get the Device's OAuth2Client
    // Or create it when it doesn't exist
    try {
      client = this.homey.app.getOAuth2Client({
        sessionId: OAuth2SessionId,
        configId: OAuth2ConfigId
      });
    } catch (err) {
      client = this.homey.app.createOAuth2Client({
        sessionId: OAuth2SessionId,
        configId: OAuth2ConfigId
      });
    }

    const onShowViewLoginOAuth2 = async () => {
      try {

        // // Re-Create client to use the correct client_id set in previous repair view
        // client = this.homey.app.createOAuth2Client({
        //   sessionId: OAuth2Util.getRandomId(),
        //   configId: OAuth2ConfigId
        //   // ,
        //   // optionalClientId: this.homey.settings.get('client_id') || '',
        //   // optionalClientSecret: this.homey.settings.get('client_secret') || ''
        // });
        
        const oAuth2AuthorizationUrl = client.getAuthorizationUrl();
        const oAuth2Callback = await this.homey.cloud.createOAuth2Callback(oAuth2AuthorizationUrl);
        oAuth2Callback
          .on('url', url => {
            socket.emit('url', url).catch(this.error);
          })
          .on('code', code => {
            client.getTokenByCode({ code })
              .then(async () => {
                await device.onOAuth2Uninit();
                await device.setStoreValue('OAuth2SessionId', OAuth2SessionId);
                await device.setStoreValue('OAuth2ConfigId', OAuth2ConfigId);
                await client.save();
                device.oAuth2Client = client;
                await device.onOAuth2Init();

                socket.emit('authorized').catch(this.error);
              })
              .catch(err => {
                socket.emit('error', err.message || err.toString()).catch(this.error);
              });
          });
      } catch (err) {
        socket.emit('error', err.message || err.toString()).catch(this.error);
      }
    };

    const onShowView = async viewId => {
      if (viewId === 'login_oauth2') {
        await onShowViewLoginOAuth2();
      }
      else if (viewId === 'pair_step_03') {
        try{
          await this.getCertificate();
          await this.registerDomain();
          await socket.nextView();
        }
        catch(error){
          this.log("Error on writing public key or domain registration: " + error.message);
          this.errorMessage = error.message;
          await socket.showView('error');
        }
      }
    };

    const onDisconnect = async () => {
      this.log('Pair Session Disconnected');
    };

    const onGetErrorMessage = async () => {
      return {message: this.errorMessage};
    };

    const onGetCarRegistrationUrl = async () => {
      return await this.getCarRegistrationUrl();
    }

    socket
      .setHandler('getErrorMessage', onGetErrorMessage)
      .setHandler('getCarRegistrationUrl', onGetCarRegistrationUrl)
      .setHandler('showView', onShowView)
      .setHandler('disconnect', onDisconnect);
  }

  async getCertificate(forceCreate=false) {
    let publicKey = this.homey.settings.get("public_key") || '';
    let privateKey = this.homey.settings.get("private_key") || '';
    
    if (publicKey === '' || privateKey === '' || forceCreate){
      try{
        this.log("getCertificate() => generate certificate");
        let keys = crypt.generateEcKeys();
        privateKey = keys.privateKey;
        publicKey = keys.publicKey;
      }
      catch(error){
        this.log("getCertificate() => generateEcKeys() Error: ",error.message);
        privateKey = '';
        publicKey = '';
      }
    }
    // Store in app settings
    await this.homey.settings.set("public_key", publicKey);
    await this.homey.settings.set("private_key", privateKey);
    // store public key as file
    try{
      this.log("getCertificate() => write public key to file...");
      fs.writeFileSync('/userdata/public.pem', publicKey , {encoding: 'utf8', flag: 'w'});
      this.log("getCertificate() => write public key to file...success");
    }
    catch(error){
      this.log("getCertificate() => fs.writeFileSync() Error: ",error.message);
    }
    return ({publicKey: publicKey, privateKey: privateKey});
  }

  async getCertificateBle(forceCreate=false) {
    let publicKey = this.homey.settings.get("public_key_ble") || '';
    let privateKey = this.homey.settings.get("private_key_ble") || '';
    
    if (publicKey === '' || privateKey === '' || forceCreate){
      try{
        this.log("getCertificateBle() => generate certificate");
        let keys = crypt.generateEcKeys();
        privateKey = keys.privateKey;
        publicKey = keys.publicKey;
        // Store in app settings
        await this.homey.settings.set("public_key_ble", publicKey);
        await this.homey.settings.set("private_key_ble", privateKey);
      }
      catch(error){
        this.log("getCertificateBle() => generateEcKeys() Error: ",error.message);
        privateKey = '';
        publicKey = '';
      }
    }
    return ({publicKey: publicKey, privateKey: privateKey});
  }

  async getCarRegistrationUrl(){
    let domain = await this.homey.cloud.getHomeyId() + '.tesla.rwdevelopment.de';
    return 'https://www.tesla.com/_ak/' + domain;
  }

  async registerDomain(){
    let domain = await this.homey.cloud.getHomeyId() + '.tesla.rwdevelopment.de';
    this.log("registerDomain() => domain: " + domain);

    let clientId = this.homey.settings.get('client_id') || '';
    let clientSecret = this.homey.settings.get('client_secret') || '';

    // Get partner token for NA region
    this.log("registerDomain() => get partner token for NA region");
    let body = {
      grant_type: 'client_credentials',
      client_id: clientId,
      client_secret: clientSecret,
      audience: 'https://fleet-api.prd.na.vn.cloud.tesla.com',
      scope: 'openid user_data vehicle_device_data vehicle_cmds vehicle_charging_cmds vehicle_location offline_access'
    };
    body = JSON.stringify( body );

    let token = await https.request( 
      'POST', 
      'https://auth.tesla.com/oauth2/v3/token',
      {
        cache: 'no-cache',
        headers: {
          'Content-Type': 'application/json'
        }
      },
      body
    );

    // Register domain
    this.log("registerDomain() => register domain for NA region");
    body = {
      "domain": domain
    };
    body = JSON.stringify( body );

    let result = await https.request( 
      'POST', 
      'https://fleet-api.prd.na.vn.cloud.tesla.com/api/1/partner_accounts',
      {
        cache: 'no-cache',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': 'Bearer ' + token.access_token
        }
      },
      body
    );

    // Get partner token for EU region
    this.log("registerDomain() => get partner token for EU region");
    body = {
      grant_type: 'client_credentials',
      client_id: clientId,
      client_secret: clientSecret,
      audience: 'https://fleet-api.prd.eu.vn.cloud.tesla.com',
      scope: 'openid user_data vehicle_device_data vehicle_cmds vehicle_charging_cmds vehicle_location offline_access'
    };
    body = JSON.stringify( body );

    token = await https.request( 
      'POST', 
      'https://auth.tesla.com/oauth2/v3/token',
      {
        cache: 'no-cache',
        headers: {
          'Content-Type': 'application/json'
        }
      },
      body
    );

    // Register domain
    this.log("registerDomain() => register domain for EU region");
    body = {
      "domain": domain
    };
    body = JSON.stringify( body );

    result = await https.request( 
      'POST', 
      'https://fleet-api.prd.eu.vn.cloud.tesla.com/api/1/partner_accounts',
      {
        cache: 'no-cache',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': 'Bearer ' + token.access_token
        }
      },
      body
    );
  }  
}