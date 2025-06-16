// import elliptic from 'elliptic';
// import crypto from 'crypto';
// import protobuf from "protobufjs";

const elliptic = require('elliptic');
const crypto = require('crypto');
const protobuf = require("./protobufjs.js");

const EPOCH_LENGTH = (1 << 30);

// const protoSignatures = await protobuf.load('proto/signatures.proto');
// const Tags = protoSignatures.lookupEnum("Signatures.Tag").values;
// const SignatureTypes = protoSignatures.lookupEnum("Signatures.SignatureType").values;

class Metadata {
    constructor(context) {
        this.context = context;
        this.fields = {};
        this.last = 0;            
    }
  
    add(tag, value) {
        if (tag < this.last) throw new Error("metadata items need to be added in increasing tag order");
        if (value === null) return;
        if (value.length > 255) throw new Error("metadata fields can't be more than 255 bytes long");
        
        this.last = tag;
        this.context.update(Buffer.from([tag]));
        this.context.update(Buffer.from([value.length]));
        this.context.update(value);
        this.fields[tag] = true;
    }
  
    addUint32(tag, value) {
        let buffer = Buffer.alloc(4);
        buffer.writeUInt32BE(value);
        this.add(tag, buffer);
    }

    // addUint32LE(tag, value) {
    //   let buffer = Buffer.alloc(4);
    //   buffer.writeUInt32LE(value);
    //   this.add(tag, buffer);
    // }

    checksum(message) {
        this.context.update(Buffer.from([255])); // signatures.Tag_TAG_END
        if (message != undefined){
          this.context.update(message);
        }
        return this.context.digest();
    }
}

class AuthSession {
    constructor(key, serverPublicKey) {
        // Generates the shared secret
        const ec = new elliptic.ec('p256');
        const privateKey = ec.keyFromPrivate(key.privateKey);
        const publicKey = ec.keyFromPublic(serverPublicKey);
        const sharedSecret = privateKey.derive(publicKey.getPublic());

        // SHA1 is used to maintain compatibility with existing vehicle code, and is safe to use in this context 
        // since we're just mapping a pseudo-random curve point into a pseudo-random bit string.  
        // Collision resistance isn't needed.    
        const hash = crypto.createHash('sha1');
        hash.update(Buffer.from(sharedSecret.toString(16), 'hex'));
        this.key = hash.digest().subarray(0, 16);
        // this.gcm = crypto.createCipheriv('aes-128-gcm', this.key, Buffer.alloc(12,0));
        this.localPublic = key.publicKey;
    }

    newHMAC(label) {
        const kdf = crypto.createHmac('sha256', this.key);
        kdf.update(Buffer.from(label, 'utf8'));
        return crypto.createHmac('sha256', kdf.digest());        
    }

    newSHA256() {
      return crypto.createHash('sha256');    
  }
}

class Signer {
    constructor(key, verifierName, verifierSessionInfo) {
        return (async () => {
            this.protoSignatures = await protobuf.load('proto/signatures.proto');
            this.Tags = this.protoSignatures.lookupEnum("Signatures.Tag").values;
            this.SignatureTypes = this.protoSignatures.lookupEnum("Signatures.SignatureType").values;

            this.session = new AuthSession(key, verifierSessionInfo.publicKey);
            this.verifierName = verifierName;
            let now = Date.now();
            // now = now + 3600000;
            this.timeZero = Math.floor(now / 1000) - verifierSessionInfo.clockTime;
            this.epoch = Buffer.from(verifierSessionInfo.epoch, 0, 16);
            this.counter = verifierSessionInfo.counter;
            this.key = key;

            // The client and the vehicle derive a shared 128-bit AES-GCM key K using ECDH:
            // Create ECDH instance
            const clientECDH = crypto.createECDH('prime256v1');
            // Set the private key from Eckey (key.private is a Buffer)
            clientECDH.setPrivateKey(this.key.privateKey);
            const sharedSecretClient = clientECDH.computeSecret(verifierSessionInfo.publicKey); // S = (Sx, Sy)
            // Now extract the X coordinate (first 32 bytes) → BIG_ENDIAN
            const sx = sharedSecretClient.slice(0, 32); // only Sx
            // Create the AES-GCM key K = SHA1(Sx)[0:16]
            const sha1 = crypto.createHash('sha1');
            sha1.update(sx);
            const hash = sha1.digest(); // 20 Bytes SHA1
            this.aesKey = hash.slice(0, 16); // only the first 16 Bytes for AES-128-GCM
            return this;
        })();
    }

    validateSessionInfo(encodedSessionInfo, challenge, tag) {
        const meta = new Metadata(this.session.newHMAC('session info'));
        meta.add(this.Tags.TAG_SIGNATURE_TYPE, Buffer.from([this.SignatureTypes.SIGNATURE_TYPE_HMAC]));
        meta.add(this.Tags.TAG_PERSONALIZATION, Buffer.from(this.verifierName));
        meta.add(this.Tags.TAG_CHALLENGE, challenge);
        const validTag = meta.checksum(encodedSessionInfo);
        return crypto.timingSafeEqual(validTag, tag);
    }

    generateSignatureHMAC(encodedPayload, domain, expiresIn) {
        this.counter++;

        const meta = new Metadata(this.session.newHMAC('authenticated command'));
        meta.add(this.Tags.TAG_SIGNATURE_TYPE, Buffer.from([this.SignatureTypes.SIGNATURE_TYPE_HMAC_PERSONALIZED]));
        meta.add(this.Tags.TAG_DOMAIN, Buffer.from([domain]));
        meta.add(this.Tags.TAG_PERSONALIZATION, Buffer.from(this.verifierName));
        
        let now = Date.now();
        // now = now + 3600000;
        const expiresAt = Math.floor(now / 1000) + expiresIn - this.timeZero;
        // Bounds check ensures: (1) we can encode in a 4-byte buffer and (2)
        // will not overflow time.Duration.
        if (expiresAt > EPOCH_LENGTH || expiresAt < 0) throw new Error("out of bounds expiration time");

        meta.add(this.Tags.TAG_EPOCH, this.epoch);
        meta.addUint32(this.Tags.TAG_EXPIRES_AT, expiresAt);
        meta.addUint32(this.Tags.TAG_COUNTER, this.counter);
    
        //return signatureDataProto.create({
        return {
          signatureData: {
            signerIdentity: {
                publicKey: this.session.localPublic
            },
            HMAC_PersonalizedData: {
                epoch:     this.epoch,
                counter:   this.counter,
                expiresAt: expiresAt,
                tag:       meta.checksum(encodedPayload)
            }
          }
        };
    }


  generateSignatureAESGCM(encodedPayload, domain, expiresIn, flags) {
    this.counter++;

    const now = Date.now();
    const expiresAt = Math.floor(now / 1000) + expiresIn - this.timeZero;
    if (expiresAt > EPOCH_LENGTH || expiresAt < 0)
        throw new Error("out of bounds expiration time");

    const meta = new Metadata(this.session.newSHA256());
    meta.add(this.Tags.TAG_SIGNATURE_TYPE, Buffer.from([this.SignatureTypes.SIGNATURE_TYPE_AES_GCM_PERSONALIZED]));
    meta.add(this.Tags.TAG_DOMAIN, Buffer.from([domain]));
    meta.add(this.Tags.TAG_PERSONALIZATION, Buffer.from(this.verifierName));
    meta.add(this.Tags.TAG_EPOCH, this.epoch);
    meta.addUint32(this.Tags.TAG_EXPIRES_AT, expiresAt);
    meta.addUint32(this.Tags.TAG_COUNTER, this.counter);
    // For backwards compatibility, message flags are only explicitly added to
    // the metadata hash if at least one of them is set. (If a MITM
    // clears these bits, the hashes will not match, as desired).
    if (flags > 0) {
      meta.addUint32(this.Tags.TAG_FLAGS, flags);
    }
    const aad = meta.checksum();

    // Generate a random 12-byte IV (GCM standard)
    const iv = crypto.randomBytes(12);

    // AES-GCM encryption
    const cipher = crypto.createCipheriv("aes-128-gcm", this.aesKey, iv);
    cipher.setAAD(aad);
    const encrypted = Buffer.concat([cipher.update(encodedPayload), cipher.final()]);
    const tag = cipher.getAuthTag(); // 16-byte authentication tag

    return {
      signatureData: {
        signerIdentity: {
            // publicKey: this.session.localPublic
            publicKey: this.key.publicKey 
        },
        AES_GCM_PersonalizedData: {
            epoch:      this.epoch,
            nonce:      iv,
            counter:    this.counter,
            expiresAt:  expiresAt,
            tag:        tag
        }
      },
      encryptedPayload: encrypted
    };
  }

  decodeResponseAESGCM(encodedPayload, domain, nonce, counter, tag, flags, fault) {
    const cipher = crypto.createDecipheriv("aes-128-gcm", this.aesKey, nonce);
    cipher.setAuthTag(tag);

    const meta = new Metadata(this.session.newSHA256());
    meta.add(this.Tags.TAG_SIGNATURE_TYPE, Buffer.from([this.SignatureTypes.SIGNATURE_TYPE_AES_GCM_PERSONALIZED]));
    meta.add(this.Tags.TAG_DOMAIN, Buffer.from([domain]));
    meta.add(this.Tags.TAG_PERSONALIZATION, Buffer.from(this.verifierName));
    meta.addUint32(this.Tags.TAG_COUNTER, counter);
    // Note that the Flags field is always included in the response metadata, 
    // whereas for outgoing requests the flags are only included if non-zero. 
    // Encode the fault as a 32-bit big-endian integer.
    if (flags > 0) {
      meta.addUint32(this.Tags.TAG_FLAGS, flags);
    }
    else{
      meta.addUint32(this.Tags.TAG_FLAGS, 0);
    }
    meta.add(this.Tags.TAG_REQUEST_HASH, tag);
    meta.addUint32(this.Tags.TAG_FAULT, fault);
    const aad = meta.checksum();


    cipher.setAAD(aad);
    return cipher.update(encodedPayload);
  }
}

module.exports =  { Signer };