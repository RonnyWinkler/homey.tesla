'use strict';

module.exports = {

    async getCar({ homey, query }) {
        return await homey.app.apiGetCar( );
    },

    async getCarData({ homey, query }) {
        return await homey.app.apiGetCarData( query.id );
    },

    async refreshData({ homey, query, body }) {
        return await homey.app.apiRefreshData( query.id );
    },

    async setCarSentry({ homey, query, body }) {
        return await homey.app.apiSetCarSentry( query.id, body.state );
    },

    async setClimatePreconditioning({ homey, query, body }) {
        return await homey.app.apiSetClimatePreconditioning( query.id, body.state );
    },

    async setClimateDefrost({ homey, query, body }) {
        return await homey.app.apiSetClimateDefrost( query.id, body.state );
    },

    async setChargingPort({ homey, query, body }) {
        return await homey.app.apiSetChargingPort( query.id, body.state );
    }

};