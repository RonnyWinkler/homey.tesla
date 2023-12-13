const https = require('./https');

module.exports = class OpenStreetMap {

    async getAddress(lat, lon, language) {
        if (!language) {
            language = 'en';
        }
        try{
            let result = await https.request( 
            'GET', 
            'https://nominatim.openstreetmap.org/reverse?format=json&lat='+lat+'&lon='+lon,
            {
                cache: 'no-cache',
                headers: {
                    'User-Agent': 'Homey Tesla app',
                    'Accept-Language': language.toLowerCase()
                }
            },
            body  
            );
            return {
                place: result.address.cycleway || result.address.road || result.address.retail || result.address.footway || result.address.address29 || result.address.path || result.address.pedestrian || result.address[Object.keys(result.address)[0]],
                city: result.address.city || result.address.town || result.address.village || result.address[Object.keys(result.address)[1]]
            }
        }
        catch(error){
            return ({ place: 'Unknown', city: 'Unknown' });
        }  
    }
};