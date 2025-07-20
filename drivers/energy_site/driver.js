const TeslaOAuth2Driver = require('../../lib/TeslaOAuth2Driver');

module.exports = class EnergySiteDriver extends TeslaOAuth2Driver {

    async onOAuth2Init() {
        // Register Flow Cards etc.
        await super.onOAuth2Init();
    }

    async onPair(session){
        this.log("onPair()");

        session.setHandler("getClientId", async () => {
        return {
            clientId: this.homey.settings.get('client_id') || '',
            clientSecret: this.homey.settings.get('client_secret') || ''
        };
        });

        session.setHandler("setClientId", async (data) => {
        this.log("setClientId() => ", data.clientId);
        await this.homey.settings.set("client_id", data.clientId);
        await this.homey.settings.set("client_secret", data.clientSecret);
        });

        super.onPair(session);
    }

    async onRepair(session, device) {
        this.log("onRepair()");

        session.setHandler("getClientId", async () => {
        return {
            clientId: this.homey.settings.get('client_id') || '',
            clientSecret: this.homey.settings.get('client_secret') || ''
        };
        });

        session.setHandler("setClientId", async (data) => {
        this.log("setClientId() => ", data.clientId);
        await this.homey.settings.set("client_id", data.clientId);
        await this.homey.settings.set("client_secret", data.clientSecret);
        });

        super.onRepair(session, device);
    }

    async onPairListDevices({ oAuth2Client }) {
        let devices = [];
        let data = await oAuth2Client.getProducts();

        for (let i=0; i<data.length; i++){
            if (data[i].energy_site_id != undefined){
                devices.push({
                    data: {
                    id: data[i].energy_site_id,
                    },
                    name: data[i].site_name,
                });
            }
        }
        return devices;
    }


}