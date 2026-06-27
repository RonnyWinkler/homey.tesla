const http = require('https');

const DEFAULT_TIMEOUT_MS = 15000;

function resolveTimeoutMs(options) {
  const timeout = options?.timeout;
  if (typeof timeout === 'number' && timeout > 0) {
    return timeout;
  }
  return DEFAULT_TIMEOUT_MS;
}

function parseResponseBody(data, contentType) {
  if (contentType && contentType.startsWith('application/json')) {
    const result = JSON.parse(data.join(''));
    if (result.response) {
      return result.response;
    }
    return result;
  }
  return data;
}

const request = async function(method='GET', url, options={}, body) {
  return new Promise((resolve, reject) => {
    if (method == 'POST'){
      options.headers["Content-Length"] = Buffer.byteLength(body);
    }
    options.method = method;

    // Force IPv4 DNS resolution
    options['family'] = 4;
    options['timeout'] = resolveTimeoutMs(options);

    let req = http.request(url, options, res => {
      res.setEncoding('utf8');
      let data = [];
      let resHeaders = res.headers;

      res.on('data', chunk => data.push(chunk));
      res.on('end', () => {
        try{
          if (res.statusCode !== 200) {
            reject(new Error(res.statusCode + ' ' + res.statusMessage + ': ' + data.join('')));
            return;
          }

          const result = parseResponseBody(data, resHeaders['content-type']);
          resolve(result);
        }
        catch(error){
          reject( new Error('Failed to '+method+' to url:' + url +' error: ' + error.message ));
        }
      });
    });

    req.on('error', (error) => 
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

    // Force IPv4 DNS resolution
    options['family'] = 4;
    options['timeout'] = resolveTimeoutMs(options);

    let req = http.request(url, options, res => {
      if (res.statusCode !== 200) {
          reject( new Error(res.statusCode + ' '  + res.statusMessage));
          return;
      }
      res.setEncoding('utf8');
      let data = [];
      let result = res;

      res.on('data', chunk => data.push(chunk));
      res.on('end', async (res) => {
        try{
          resolve(result);
        }
        catch(error){
          reject( new Error('Failed to '+method+' to url:' + url +' error: ' + error.message ));
        }
      });
    });

  req.on('error', (error) => 
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
    options['timeout'] = resolveTimeoutMs(options);
    options['headers'] = {
      maxRedirects: 1
    };
    // Force IPv4 DNS resolution
    options['family'] = 4;

    let req = http.get(url, options, res => {
      if (res.statusCode == 302) {
          resolve(res.headers.location);
          return;
      }
      reject( new Error('No valid redirect URL found.'));
    });

    req.on('error', (error) => 
      reject(new Error('Failed to '+options['method']+' to url:' + url +' error: ' + error.message ))
    );
  });
}

exports.request = request;
exports.requestStream = requestStream;
exports.getRedirectUrl = getRedirectUrl;