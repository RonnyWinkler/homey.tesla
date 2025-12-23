const crypto = require('crypto');
const selfsigned = require('selfsigned');
const Homey = require('homey');
const { createSign } = require('crypto');
// const { p256 } = require('@noble/curves');

const generateKeys = function generateRsaKeys() { 
    const keyPair = crypto.generateKeyPairSync('rsa', {
        modulusLength: 2048,
        publicKeyEncoding: {
            type: 'spki',
            format: 'pem'
        },
        privateKeyEncoding: {
            type: 'pkcs8',
            format: 'pem',
            cipher: 'aes-256-cbc',
            passphrase: 'com.tesla.car'
        }
    });
 
    // Creating public and private key file
    return {
        "public_key": keyPair.publicKey,
        "private_key": keyPair.privateKey
    };
}

const privateDecrypt = function(ciphertext, privateKey){
    // const privateKey = Homey.env.PRIV_KEY;
    const decrypted = crypto.privateDecrypt(
        {
            key: privateKey,
            passphrase: 'com.tesla.car',
            padding: crypto.constants.RSA_PKCS1_OAEP_PADDING,
            oaepHash: "sha256",
        },
        Buffer.from(ciphertext, "base64")
    );
    return decrypted.toString("utf8");
}

const publicEncrypt = function(plaintext, publicKey){
    // const publicKey = Homey.env.PUBLIC_KEY;
    const encrypted = crypto.publicEncrypt(
        {
            key: publicKey,
            padding: crypto.constants.RSA_PKCS1_OAEP_PADDING,
            oaepHash: "sha256",
          },
        Buffer.from(plaintext));
    return encrypted.toString("base64");
}

exports.encryptSymmetric = function(key, plaintext){
    const iv = crypto.randomBytes(12).toString('base64');
    const cipher = crypto.createCipheriv(
      "aes-256-gcm", 
      Buffer.from(key, 'base64'), 
      Buffer.from(iv, 'base64')
    );
    let ciphertext = cipher.update(plaintext, 'utf8', 'base64');
    ciphertext += cipher.final('base64');
    const tag = cipher.getAuthTag().toString('base64');
    
    return { ciphertext, iv, tag }
  }

exports.decryptSymmetric = function(key, ciphertext, iv, tag){
    const decipher = crypto.createDecipheriv(
        "aes-256-gcm", 
        Buffer.from(key, 'base64'),
        Buffer.from(iv, 'base64')
    );

    decipher.setAuthTag(Buffer.from(tag, 'base64'));

    let plaintext = decipher.update(ciphertext, 'base64', 'utf8');
    plaintext += decipher.final('utf8');

    return plaintext;
}

exports.generateSymmetricKey = function(){
    return crypto.randomBytes(32).toString('base64');
}

exports.generateEcKeys = function(){
    // let curves = crypto.getCurves();
    // let ecdh = crypto.createECDH('prime256v1');
    // let publicKey = ecdh.generateKeys('base64', 'uncompressed');
    // publicKey = '-----BEGIN PUBLIC KEY-----'+'\n'+publicKey+'\n'+'-----END PUBLIC KEY-----';
    // let privateKey = ecdh.getPrivateKey('base64');
    // privateKey = '-----BEGIN EC PRIVATE KEY-----'+'\n'+privateKey+'\n'+'-----END EC PRIVATE KEY-----';

    // Schlüsselpaar generieren
    const { privateKey, publicKey } = crypto.generateKeyPairSync('ec', {
        namedCurve: 'prime256v1',
        publicKeyEncoding: {
        type: 'spki',
        format: 'pem'
        },
        privateKeyEncoding: {
        type: 'sec1',
        format: 'pem'
        }
    });

    return {publicKey: publicKey, privateKey: privateKey};
}

exports.generateX509 = function(hostname = 'telemetry_direct.rwdevelopment.de'){

    const attrs = [{ name: 'commonName', value: 'telemetry.rwdevelopment.de' }];

    const options = {
        days: 365,
        keySize: 2048,
        algorithm: 'sha256',
        extensions: [
            {
                name: 'subjectAltName',
                altNames: [
                    { type: 2, value: hostname }, // DNS name
                ]
            }
        ]
    };

    const pems = selfsigned.generate(attrs, options);
    return { privateCert: pems.private, caCert: pems.cert };

}

exports.generateJWS = async function (privateKey, publicKey, payload, audience) {
    const jwt = await import('./TeslaJwt.js');
    const token = jwt.generateTeslaJWT(privateKey, publicKey, payload, audience);
    // console.log(token);
    return token;
}

exports.generateKeys = generateKeys;
exports.privateDecrypt = privateDecrypt;
exports.publicEncrypt = publicEncrypt;
exports.generateKeys = generateKeys;
