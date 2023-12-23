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
            ''  
            );
            let address = {
                street: result.address.cycleway || result.address.road || result.address.retail || result.address.footway || result.address.address29 || result.address.path || result.address.pedestrian || '', //|| result.address[Object.keys(result.address)[0]],
                house: result.address.house_number || '',
                postcode: result.address.postcode || '',
                city: result.address.city || result.address.town || result.address.village || '', //|| result.address[Object.keys(result.address)[1]]
                country: result.address.country || '',
                country_code: result.address.country_code || '',
                display_name: ''
            }
            address.display_name = address.city;
            if (address.street && address.house){
                address.display_name = address.street +' '+ address.house +', '+ address.city;
            }
            else if (address.street){
                address.display_name = address.street +' '+ address.city;
            }
            else{
                address.display_name = address.city;
            }
            return address;
        }
        catch(error){
            return ({ 
                display_name: '',
                street: '',
                house: '',
                postcode: '', 
                city: '', 
                country: '', 
                country_code: '' 
            });
        }  
    }
};