const crypto = require('crypto');
const BN = require('bn.js');
const { ec: EC } = require('elliptic');
const ec = new EC('p256'); // NIST P-256

const SCALAR_LEN = 32;
const SIG_LEN = 3 * SCALAR_LEN;
const curveN = ec.curve.n; // BN
const G_POINT = ec.curve.g; // base point

function toBufferBE(bn, len = SCALAR_LEN) {
  return Buffer.from(bn.toArrayLike(Buffer, 'be', len));
}

function bnFromBuffer(buf) {
  return new BN(buf.toString('hex'), 16);
}

function sha256(buf) {
  return crypto.createHash('sha256').update(buf).digest();
}

function hmacSha256(key, data) {
  return crypto.createHmac('sha256', key).update(data).digest();
}

// RFC6979 deterministic k generation (hash = SHA-256)
// xBN is BN, h1 is Buffer
function rfc6979_k(xBN, h1) {
  const x = toBufferBE(xBN, SCALAR_LEN); // int2octets(x)
  // bits2octets(h1) = int(h1) mod q as 32-octet string
  const h1bn = new BN(h1.toString('hex'), 16);
  const bits2octets_bn = h1bn.mod(curveN);
  const bits2octets = toBufferBE(bits2octets_bn, SCALAR_LEN);

  let V = Buffer.alloc(32, 0x01);
  let K = Buffer.alloc(32, 0x00);

  K = hmacSha256(K, Buffer.concat([V, Buffer.from([0x00]), x, bits2octets]));
  V = hmacSha256(K, V);
  K = hmacSha256(K, Buffer.concat([V, Buffer.from([0x01]), x, bits2octets]));
  V = hmacSha256(K, V);

  while (true) {
    let T = Buffer.alloc(0);
    while (T.length < SCALAR_LEN) {
      V = hmacSha256(K, V);
      T = Buffer.concat([T, V]);
    }
    const kbn = new BN(T.slice(0, SCALAR_LEN).toString('hex'), 16);
    if (kbn.cmpn(0) > 0 && kbn.cmp(curveN) < 0) {
      return kbn;
    }
    K = hmacSha256(K, Buffer.concat([V, Buffer.from([0x00])]));
    V = hmacSha256(K, V);
  }
}

// write length-value like Go writeLengthValue (4-byte big-endian length then bytes)
function writeLengthValue(buf) {
  const lenBuf = Buffer.alloc(4);
  lenBuf.writeUInt32BE(buf.length, 0);
  return Buffer.concat([lenBuf, buf]);
}

function pointToUncompressed(point) {
  const x = point.getX();
  const y = point.getY();
  return Buffer.concat([Buffer.from([0x04]), toBufferBE(x, SCALAR_LEN), toBufferBE(y, SCALAR_LEN)]);
}

// privKeyBuf: 32-byte Buffer (big-endian private scalar)
// message: Buffer or string
// senderPublicBytes: 65-byte uncompressed public key (0x04||X||Y)
function schnorrSign(privKeyBuf, message, senderPublicBytes) {
  if (!Buffer.isBuffer(privKeyBuf) || privKeyBuf.length !== SCALAR_LEN) {
    throw new Error('privKeyBuf must be 32-byte Buffer');
  }
  if (!Buffer.isBuffer(message)) message = Buffer.from(String(message), 'utf8');
  if (!Buffer.isBuffer(senderPublicBytes) || senderPublicBytes.length !== 65 || senderPublicBytes[0] !== 0x04) {
    throw new Error('senderPublicBytes must be 65-byte uncompressed public key starting with 0x04');
  }

  const privBN = new BN(privKeyBuf.toString('hex'), 16);
  const h1 = sha256(message);
  const kBN = rfc6979_k(privBN, h1);

  // R = k * G
  const R = G_POINT.mul(kBN);
  const R_uncompressed = pointToUncompressed(R);
  const Rx = toBufferBE(R.getX(), SCALAR_LEN);
  const Ry = toBufferBE(R.getY(), SCALAR_LEN);

  // Build challenge input (same as Go): writeLengthValue(G) || writeLengthValue(R_uncompressed) || writeLengthValue(senderPublicBytes) || writeLengthValue(message)
  const G_uncompressed = pointToUncompressed(G_POINT);
  const challengeInput = Buffer.concat([
    writeLengthValue(G_uncompressed),
    writeLengthValue(R_uncompressed),
    writeLengthValue(senderPublicBytes),
    writeLengthValue(message),
  ]);

  const cHash = sha256(challengeInput);
  const cBN = new BN(cHash.toString('hex'), 16).mod(curveN);

  // s = k - c * sk (mod n)
  const sBN = kBN.sub(cBN.mul(privBN)).umod(curveN);
  const sBuf = toBufferBE(sBN, SCALAR_LEN);

  return Buffer.concat([Rx, Ry, sBuf]); // 96 bytes R.x||R.y||s
}

// publicKeyBytes: 65-byte uncompressed key (0x04||X||Y)
// message: Buffer or string
// signature: 96-byte Buffer (R.x||R.y||s)
function schnorrVerify(publicKeyBytes, message, signature) {
  if (!Buffer.isBuffer(publicKeyBytes) || publicKeyBytes.length !== 65 || publicKeyBytes[0] !== 0x04) {
    throw new Error('publicKeyBytes must be 65-byte uncompressed key starting with 0x04');
  }
  if (!Buffer.isBuffer(signature) || signature.length !== SIG_LEN) {
    throw new Error('signature must be 96 bytes');
  }
  if (!Buffer.isBuffer(message)) message = Buffer.from(String(message), 'utf8');

  const Rx = signature.slice(0, SCALAR_LEN);
  const Ry = signature.slice(SCALAR_LEN, 2 * SCALAR_LEN);
  const sBuf = signature.slice(2 * SCALAR_LEN);

  const RxBN = new BN(Rx.toString('hex'), 16);
  const RyBN = new BN(Ry.toString('hex'), 16);
  const Rpoint = ec.curve.point(RxBN, RyBN);

  const pubX = new BN(publicKeyBytes.slice(1, 1 + SCALAR_LEN).toString('hex'), 16);
  const pubY = new BN(publicKeyBytes.slice(1 + SCALAR_LEN).toString('hex'), 16);
  const P = ec.curve.point(pubX, pubY);

  const G_uncompressed = pointToUncompressed(G_POINT);
  const publicNonce = Buffer.concat([Buffer.from([0x04]), Rx, Ry]);
  const challengeInput = Buffer.concat([
    writeLengthValue(G_uncompressed),
    writeLengthValue(publicNonce),
    writeLengthValue(publicKeyBytes),
    writeLengthValue(message),
  ]);

  const cHash = sha256(challengeInput);
  const cBN = new BN(cHash.toString('hex'), 16).mod(curveN);
  const sBN = new BN(sBuf.toString('hex'), 16);

  // computed = s*G + c*P
  const sG = G_POINT.mul(sBN);
  const cP = P.mul(cBN);
  const computed = sG.add(cP);

  return computed.getX().eq(Rpoint.getX()) && computed.getY().eq(Rpoint.getY());
}

module.exports = {
  schnorrSign,
  schnorrVerify,
};