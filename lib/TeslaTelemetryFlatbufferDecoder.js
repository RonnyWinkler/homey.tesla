//
// Tesla FlatbuffersStream decoder (auto string conversion)
//

//
// Flatbuffers low-level helpers
//
function u16(buf, pos) {
  return buf[pos] | (buf[pos + 1] << 8);
}

function u32(buf, pos) {
  return (
    buf[pos] |
    (buf[pos + 1] << 8) |
    (buf[pos + 2] << 16) |
    (buf[pos + 3] << 24)
  );
}

function u64(buf, pos) {
  const lo = u32(buf, pos);
  const hi = u32(buf, pos + 4);
  return hi * 0x100000000 + lo;
}

function readByteVector(buf, pos) {
  if (!pos) return new Uint8Array();
  const vecStart = pos + u32(buf, pos);
  const len = u32(buf, vecStart);
  return buf.slice(vecStart + 4, vecStart + 4 + len);
}

function getTableFieldPositions(buf, tablePos, count) {
  const vtableOffset = tablePos - u16(buf, tablePos);
  const fields = [];
  for (let i = 0; i < count; i++) {
    fields.push(u16(buf, vtableOffset + 4 + i * 2));
  }
  return fields;
}

const textDecoder = new TextDecoder();

//
// -------------------------------
// Envelope decoder
// -------------------------------
function decodeEnvelope(buf) {
  const root = u32(buf, 0);
  const tablePos = root;

  const fieldOffsets = getTableFieldPositions(buf, tablePos, 5);
  const abs = off => (off === 0 ? 0 : tablePos + off);

  const txidPos = abs(fieldOffsets[0]);
  const topicPos = abs(fieldOffsets[1]);
  const typePos = abs(fieldOffsets[2]);
  const msgPos = abs(fieldOffsets[3]);
  const msgIdPos = abs(fieldOffsets[4]);

  return {
    tablePos,
    txid: readByteVector(buf, txidPos),
    topic: readByteVector(buf, topicPos),
    messageType: typePos ? buf[typePos] : 0,
    messageTablePos: msgPos ? msgPos + u32(buf, msgPos) : 0,
    messageId: readByteVector(buf, msgIdPos),
  };
}

//
// -------------------------------
// FlatbuffersStream decoder
// -------------------------------
function decodeStream(buf, tablePos) {
  const fieldOffsets = getTableFieldPositions(buf, tablePos, 6);
  const abs = off => (off === 0 ? 0 : tablePos + off);

  const senderIdPos = abs(fieldOffsets[0]);
  const createdAtPos = abs(fieldOffsets[1]);
  const payloadPos = abs(fieldOffsets[2]);
  const deviceTypePos = abs(fieldOffsets[3]);
  const deviceIdPos = abs(fieldOffsets[4]);
  const deliveredAtPos = abs(fieldOffsets[5]);

  return {
    senderId: readByteVector(buf, senderIdPos),
    createdAt: createdAtPos ? u32(buf, createdAtPos) : 0,
    payload: readByteVector(buf, payloadPos),
    deviceType: readByteVector(buf, deviceTypePos),
    deviceId: readByteVector(buf, deviceIdPos),
    deliveredAtEpochMs: deliveredAtPos ? u64(buf, deliveredAtPos) : 0,
  };
}

//
// -------------------------------
// Combined Tesla StreamMessage decoder
// Automatically converts text fields to strings
// -------------------------------
function decodeTeslaStreamMessage(bytes) {
  const buf = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
  const env = decodeEnvelope(buf);

  if (!env.messageTablePos)
    throw new Error("Envelope does not contain a Stream message table");

  const stream = decodeStream(buf, env.messageTablePos);

  // Convert all byte arrays representing text to UTF-8 strings
  const msg = {
    MessageTopic: textDecoder.decode(env.topic),
    TXID: textDecoder.decode(env.txid),
    SenderID: textDecoder.decode(stream.senderId),
    DeviceType: textDecoder.decode(stream.deviceType),
    DeviceID: textDecoder.decode(stream.deviceId),
    DeliveredAtEpochMs: stream.deliveredAtEpochMs,
    CreatedAt: stream.createdAt,
    Payload: stream.payload, // keep raw bytes
    EnvMessageID: textDecoder.decode(env.messageId),
  };

  return msg;
}

module.exports = { decodeTeslaStreamMessage };