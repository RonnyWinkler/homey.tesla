const { OAuth2Device, OAuth2Util } = require('homey-oauth2app');

module.exports = class TeslaOAuth2Device extends OAuth2Device {

  // async onInit() {
  //   // Migrate
  //   if (typeof this.onOAuth2Migrate === 'function') {
  //     try {
  //       const {
  //         OAuth2SessionId,
  //         OAuth2ConfigId,
  //       } = this.getStore();

  //       if (!OAuth2SessionId || !OAuth2ConfigId) {
  //         this.log('Starting migration...');
  //         const result = await this.onOAuth2Migrate();
  //         if (!result) {
  //           throw new OAuth2Error('Migration Failed');
  //         }

  //         const {
  //           sessionId,
  //           configId,
  //           token,
  //           title = null,
  //         } = result;

  //         let client;
  //         const hasClient = this.homey.app.hasOAuth2Client({
  //           sessionId,
  //           configId,
  //         });
  //         if (!hasClient) {
  //           client = this.homey.app.createOAuth2Client({
  //             sessionId,
  //             configId
  //           });
  //           client.setToken({ token });
  //           client.setTitle({ title });
  //           client.save();
  //         }

  //         this.setStoreValue('OAuth2SessionId', sessionId);
  //         this.setStoreValue('OAuth2ConfigId', configId);

  //         if (typeof this.onOAuth2MigrateSuccess === 'function') {
  //           await this.onOAuth2MigrateSuccess();
  //         }

  //         this.log('Migration success!');
  //       }
  //     } catch (err) {
  //       await this.setUnavailable('Migration failed. Please re-authorize.');
  //       this.error(err);
  //       return;
  //     }
  //   }

  //   // Init
  //   const {
  //     OAuth2SessionId,
  //     OAuth2ConfigId,
  //   } = this.getStore();

  //   if (!OAuth2ConfigId) {
  //     throw new OAuth2Error('Missing OAuth2ConfigId');
  //   }

  //   if (!OAuth2SessionId) {
  //     throw new OAuth2Error('Missing OAuth2SessionId');
  //   }

  //   this.oAuth2Client = this.homey.app.getOAuth2Client({
  //     sessionId: OAuth2SessionId,
  //     configId: OAuth2ConfigId
  //     // ,
  //     // optionalClientId: this.homey.settings.get('client_id') || '',
  //     // optionalClientSecret: this.homey.settings.get('client_secret') || ''
  //   });
  //   this.oAuth2Client.on('save', () => {
  //     this.onOAuth2Saved().catch(this.error);
  //   });
  //   this.oAuth2Client.on('destroy', () => {
  //     this.onOAuth2Destroyed().catch(this.error);
  //   });
  //   this.oAuth2Client.on('expired', () => {
  //     this.onOAuth2Expired().catch(this.error);
  //   });

  //   await this.onOAuth2Init();
  // }

  async onOAuth2Deleted() {
  }

  async _wait(delay){
    await OAuth2Util.wait(delay);
  }

  _getLocalTimeString(time){
    let tz  = this.homey.clock.getTimezone();
    let now = new Date(time).toLocaleString(this.homey.i18n.getLanguage(), 
    { 
        hour12: false, 
        timeZone: tz,
        hour: "2-digit",
        minute: "2-digit",
        day: "2-digit",
        month: "2-digit",
        year: "numeric"
    });
    return now.replace(',', '');
  }

}