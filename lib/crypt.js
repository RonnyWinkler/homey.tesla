const crypto = require('crypto');
const Homey = require('homey');

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

exports.generateKeys = generateKeys;
exports.privateDecrypt = privateDecrypt;
exports.publicEncrypt = publicEncrypt;