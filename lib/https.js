const http = require('https');

const request = async function(method='GET', url, options={}, body) {
    return new Promise((resolve, reject) => {
      if (method == 'POST'){
        options.headers["Content-Length"] = Buffer.byteLength(body);
      }
      options.method = method;
      options['timeout'] = 1000;
      const req = http.request(url, options, res => {
        if (res.statusCode !== 200) {
            // console.log('Failed to POST to url:' + url +' status code: '+res.statusCode);
            reject( new Error(res.statusCode + ' '  + res.statusMessage));
        }
        res.setEncoding('utf8');
        const data = [];
        const resHeaders = res.headers;

        res.on('data', chunk => data.push(chunk));
        res.on('end', async (res) => {
          try{
            let result = data;
            if (resHeaders["content-type"].startsWith("application/json")){
              result = JSON.parse(data.join('')); 
              if (result.response){
                result = result.response;
              }
            }
            resolve(result);
          }
          catch(error){
            reject( new Error('Failed to '+method+' to url:' + url +' error: ' + error.message ));
          }
        });
      });

    req.on('error', (error) => 
        // reject(new Error('Failed to '+method+' to url:' + url +' with body:'+ JSON.stringify(body) +' '+ error))
        reject(new Error('Failed to '+method+' to url:' + url +' error: ' + error.message ))
      );

      if (method == 'POST'){
        req.write(body);
      }
      req.end();
    });
  }

exports.request = request;