
const schorr = require('./Schorr.js');


// base64url helpers (Node.js)
function base64UrlEncode(input) {
  // input: Buffer or string
  const buf = Buffer.isBuffer(input) ? input : Buffer.from(String(input), 'utf8');
  return buf.toString('base64')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/g, '');
}

function base64UrlDecode(b64url) {
  // returns a Buffer
  let b = String(b64url)
    .replace(/-/g, '+')
    .replace(/_/g, '/');
  // pad with '=' to make length a multiple of 4
  const pad = (4 - (b.length % 4)) % 4;
  if (pad) b += '='.repeat(pad);
  return Buffer.from(b, 'base64');
}
// ✅ Equivalent to jwt.New(&tss256).SignedString(privateKey)
exports.generateTeslaJWT = function (privKeyBytes, pubKeyBytes, claims, audience) {


  // Header
  const header = {
    alg: 'Tesla.SS256',
    typ: 'JWT',
    kid: pubKeyBytes.toString('base64') // standard Base64
  };

  // Payload
  const payload = {
    ...claims,
    aud: audience,
    iss: pubKeyBytes.toString('base64') // standard Base64
  };

  // Encode header & payload
  const encodedHeader = base64UrlEncode(JSON.stringify(header));
  const encodedPayload = base64UrlEncode(JSON.stringify(payload));
  const signingInput = `${encodedHeader}.${encodedPayload}`;
  const signingBuffer = Buffer.from(signingInput, 'utf8');
  // Sign
  const signature = schorr.schnorrSign(privKeyBytes, signingBuffer, pubKeyBytes);
  console.log('signature (hex):', signature.toString('hex'));
  console.log('signature length:', signature.length); // should be 96

  const encodedSignature = base64UrlEncode(signature);

  // verify
  const ok = schorr.schnorrVerify(pubKeyBytes, signingBuffer, signature);
  console.log('signature valid?', ok);

  return `${signingInput}.${encodedSignature}`;
}



