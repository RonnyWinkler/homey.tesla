const { OAuth2Device, OAuth2Util } = require('homey-oauth2app');

module.exports = class TeslaOAuth2Device extends OAuth2Device {

  async onOAuth2Init() {
  }

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