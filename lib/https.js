const http = require('https');

const request = async function(method='GET', url, options={}, body) {
  return new Promise((resolve, reject) => {
    if (method == 'POST'){
      options.headers["Content-Length"] = Buffer.byteLength(body);
    }
    options.method = method;

    // Force IPv$ DNS resolution
    options['family'] = 4;

    options['timeout'] = 1000;
    let req = http.request(url, options, res => {
      if (res.statusCode !== 200) {
          // console.log('Failed to POST to url:' + url +' status code: '+res.statusCode);
          reject( new Error(res.statusCode + ' '  + res.statusMessage));
      }
      res.setEncoding('utf8');
      let data = [];
      let resHeaders = res.headers;

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

const requestStream = async function(method='GET', url, options={}, body) {
  return new Promise((resolve, reject) => {
    if (method == 'POST'){
      options.headers["Content-Length"] = Buffer.byteLength(body);
    }
    options.method = method;

    // Force IPv$ DNS resolution
    options['family'] = 4;

    options['timeout'] = 1000;
    let req = http.request(url, options, res => {
      if (res.statusCode !== 200) {
          // console.log('Failed to POST to url:' + url +' status code: '+res.statusCode);
          reject( new Error(res.statusCode + ' '  + res.statusMessage));
      }
      res.setEncoding('utf8');
      let data = [];
      let resHeaders = res.headers;
      let result = res;

      res.on('data', chunk => data.push(chunk));
      res.on('end', async (res) => {
        try{
          // let result = data;
          // if (resHeaders["content-type"].startsWith("application/json")){
          //   result = JSON.parse(data.join('')); 
          //   if (result.response){
          //     result = result.response;
          //   }
          // }
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


const getRedirectUrl = async function(url, options={}) {
  return new Promise((resolve, reject) => {
    options['method'] = 'GET';
    options['timeout'] = 1000;
    options['headers'] = {
      maxRedirects: 1
    };
    // Force IPv$ DNS resolution
    options['family'] = 4;

    let req = http.get(url, options, res => {
      if (res.statusCode == 302) {
          resolve(res.headers.location);
      }
      else{
        reject( new Error('No valid redirect URL found.'));
      }
    });

    req.on('error', (error) => 
      // reject(new Error('Failed to '+method+' to url:' + url +' with body:'+ JSON.stringify(body) +' '+ error))
      reject(new Error('Failed to '+options['method']+' to url:' + url +' error: ' + error.message ))
    );
  });
}

exports.request = request;
exports.requestStream = requestStream;
exports.getRedirectUrl = getRedirectUrl;