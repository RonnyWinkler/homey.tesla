const DEBUG_MODE = false; // Activate for extended BLE logging

const crypto = require('crypto')
const EventHandler = require('./EventHandler');
const { EventEmitter } = require('stream');

// const CONNECT_TIMEOUT =  1000*4; // 4 seconds. Max allowed error when syncing vehicle clock

const MAX_BLE_MESSAGE_SIZE = 1024;
const RX_TIMEOUT = 1*1000;

const SERVICE_VEHICLE_UUID = '00000211b2d143f09b88960cebf8b91e';

const CHARACTERISTIC_TO_VEHICLE_UUID = '00000212b2d143f09b88960cebf8b91e'; // Write
const CHARACTERISTIC_FROM_VEHICLE_UUID = '00000213b2d143f09b88960cebf8b91e'; // Notify
// const CHARACTERISTIC_READ_UUID = '00000214b2d143f09b88960cebf8b91e'; // Read version info?


class TeslaBleApi{
  constructor(carDevice) {
    this.busy = false;
    this.carDevice = carDevice;
    this.homey = carDevice.homey;
    this.inputBuffer = Buffer.alloc(0);
    this.inbox = [];
    this.lastRx = Date.now();
    this.advertisementId = this._getVinAdvertisementName(this.carDevice.getData().id);
    this.lock = Promise.resolve(); // simple mutex via Promise chaining
    this.onCarMessage = new EventHandler('carMessage');
    this.onInit();
  }

  async onInit() {
  }

  _getVinAdvertisementName(vin){
    // * BLE advertisement local name: `S + <ID> + C`, where `<ID>` is the
    //  lower-case hex-encoding of the first eight bytes of the SHA1 digest of the
    //  Vehicle Identification Number (VIN). For example, If the VIN is
    //  `5YJS0000000000000`, then the BLE advertisement Local Name is
    //  `S1a87a5a75f3df858C`.
    
    const shasum = crypto.createHash('sha1');
    shasum.update(vin);
    let vin_sha1 = shasum.digest('hex');

    // let vin_length = 17; // Assuming standard VIN length
    if (!vin_sha1)
    {
      this.carDevice.log("Failed to calculate SHA1 of VIN");
      throw new Error("Failed to calculate SHA1 of VIN");
    }
    // 'S' + 16 hex chars + 'C' 
    let result = 'S' + vin_sha1.substring(0, 16).toLowerCase() + 'C'; 

    this.carDevice.log("BTLEServer: Advertisement name: "+ result);
    return result;
  }

  isConnected() {
    return this.peripheral && this.peripheral.connected;
  }

  async _discoverAdvertisement() {
    // TEST: Discover every time to update advertisement list
    // await this.homey.ble.discover();

    // Workaround for Bridge BLE satellite: connect does not update peripherals cache. 
    // find() must be used for every connect do start discover if needed.
    // if (!this.advertisement){
      this.carDevice.log("BLEServer: Get BTLE device "+ this.advertisementId + "...");

      if (!this.carDevice.getStore().peripheralUuid) {
        if (DEBUG_MODE) {
          this.carDevice.log("BLEServer: No peripheralUuid found. Discovering BTLE devices...");
        }
        // const advertisements = await this.homey.ble.discover([SERVICE_VEHICLE_UUID]);
        const advertisements = await this.homey.ble.discover();
        this.advertisement = advertisements.filter(advertisement => advertisement.localName && advertisement.localName === this.advertisementId )[0];
        if (! this.advertisement){
          throw new Error("BLEServer: Failed to find advertisement with ID: "+ this.advertisementId);
        }
        this.carDevice.log("BLEServer: Found BTLE device: "+ this.advertisement.uuid);
        this.carDevice.setStoreValue( 'peripheralUuid', this.advertisement.uuid );
      }
      else {
        this.carDevice.log("BLEServer: peripheralUuid found. Find BTLE device...");
        try{
          this.advertisement = await this.homey.ble.find(this.carDevice.getStore().peripheralUuid );
        } catch (error) {
          // Fallback for HP23 issue where no discovery is done if peripheral is not found oin local cache.
          this.carDevice.log("BLEServer: Failed to find BTLE device: "+ error.message);
          this.carDevice.log("BLEServer: Start discovery... ");
          const advertisements = await this.homey.ble.discover();
          this.advertisement = advertisements.filter(advertisement => advertisement.localName && advertisement.localName === this.advertisementId )[0];
          if (! this.advertisement){
            throw new Error("BLEServer: Failed to find advertisement with ID: "+ this.advertisementId);
          }
        }
        this.carDevice.log("BLEServer: Found BTLE device: "+ this.advertisement.uuid);
      }
    // }
    return this.advertisement;
  }

  async _connectAdvertisement() {

    try{
      await this._discoverAdvertisement();
      // if (!this.advertisement) {
      //   this.carDevice.log("BTLEServer:  Find BLE device: "+ this.advertisementId);
      //   if (!this.advertisementId) {
      //     this.carDevice.log("BTLEServer:  No advertisement ID found.");
          
      //   }
      //   this.advertisement = await this.homey.ble.find(this.advertisementId, 10000 );
      // }
      this.carDevice.log("BLEServer: Connect to BLE device.");
      this.peripheral = await this.advertisement.connect();
      this.carDevice.log("BLEServer: Connected.");
      return this.peripheral;
    } catch (error) {
      this.carDevice.log("BLEServer: Failed to connect to BLE device: "+ error.message);
      throw error;
    }
  }

  async disconnect() {
    if (this.peripheral) {
      if (this.rxCharacteristic) {
        try{
          await this.rxCharacteristic.unsubscribeFromNotifications();
        }
        catch(error){
          this.carDevice.log("BTLEServer: Error unsubscribing from notifications: "+ error.message);
        }
        this.rxCharacteristic = null;
        this.txCharacteristic = null;
      }
      try{
        await this.peripheral.disconnect();
      }
      catch(error){
        this.carDevice.log("BTLEServer: Error disconnecting from BLE device: "+ error.message);
      }
      this.peripheral = null;
    }
  }

  async connect(){
    const peripheral = await this._connectAdvertisement();
    this.carDevice.log("BTLEServer: connecting to BTLE service");
    const service = await peripheral.getService(SERVICE_VEHICLE_UUID);
    this.carDevice.log("BTLEServer: Get characteristics");
    this.txCharacteristic = await service.getCharacteristic(CHARACTERISTIC_TO_VEHICLE_UUID);
    this.rxCharacteristic = await service.getCharacteristic(CHARACTERISTIC_FROM_VEHICLE_UUID);
    this.carDevice.log("BTLEServer: Subscribe to notifications");
    this.rxCharacteristic.subscribeToNotifications( (data) => {
      this.rx(data);
    }, error => {
      this.carDevice.log("BTLEServer: Error subscribing to notifications: ", error);
      throw error;
    });
  }

  _flush() {
    if (this.inputBuffer.length >= 2) {
        let msgLength = 256 * this.inputBuffer[0] + this.inputBuffer[1];
        if (DEBUG_MODE) {
          this.carDevice.log(`BLEServer: Input buffer length: ${this.inputBuffer.length}, Message length: ${msgLength}`);
          this.carDevice.log(`BLEServer: InputBuffer: ${this.inputBuffer.toString('hex')}`);
        }
        if (msgLength > MAX_BLE_MESSAGE_SIZE) {
          if (DEBUG_MODE) {
            this.carDevice.log(`BTLEServer: Message too long: ${msgLength}`);
          }
          this.inputBuffer = Buffer.alloc(0);
          return false;
        }
        if (this.inputBuffer.length >= 2 + msgLength) {
          let buffer = this.inputBuffer.subarray(2, 2 + msgLength);
          this.carDevice.log(`BLEServer RX: Message complete: length: ${msgLength}`);
          if (DEBUG_MODE) {
            this.carDevice.log(`BTLEServer RX: Message: ${buffer.toString('hex')}`);
          }
          // this.inputBuffer = this.inputBuffer.subarray(2 + msgLength);
          if (buffer.length > 31) {
            this.inbox.push( buffer );
            this.onCarMessage.emit(buffer).catch(error => Log.error(error));
          }
          // if (this.inbox.length < 5) {
          //     this.inbox.push(buffer);
          //     this.carDevice.log(`BTLEServer: Inbox: ${this.inbox.length} messages &{this.inbox.map((msg) => msg.toString('hex')).join(', ')}`);
          // } else {
          //   this.carDevice.log(`BTLEServer: Inbox full, dropping message: ${buffer.toString('hex')}`);
          //   return false;
          // }
          this.inputBuffer = Buffer.alloc(0);
          return true;
        }
    }
    return false;
  }

  rx(buffer) {
    if (this.rxLastBuffer == undefined) {
      this.rxLastBuffer = Buffer.alloc(0);
    }
    if (this.rxLastBuffer && this.rxLastBuffer.equals(buffer)) {
      if (DEBUG_MODE) {
        this.carDevice.log(`BLEServer RX: duplicated message received. Skip message.`);
      }
      return;
    }
    this.rxLastBuffer = Buffer.from(buffer);

    if (DEBUG_MODE) {
      this.carDevice.log(`BLEServer RX: ${Buffer.from(buffer).toString('hex')}`);
    }
    if (Date.now() - this.lastRx > RX_TIMEOUT) {
      if (DEBUG_MODE) {
        this.carDevice.log("BLEServer: RX timeout, clearing input buffer");
      }
      this.inputBuffer = Buffer.alloc(0);
    }
    this.lastRx = Date.now();
    this.inputBuffer = Buffer.concat([this.inputBuffer, buffer]);
    // this.carDevice.log(`BTLEServer: Input buffer: ${this.inputBuffer.length} bytes`);
    this._flush();
  }

  async tx(buffer) {
    this.carDevice.log(`BLEServer TX: length: ${buffer.length}`);
    if (DEBUG_MODE) {
      this.carDevice.log(`BLEServer TX: ${Buffer.from(buffer).toString('hex')}`);
    }

    try {
      // console.debug("TX:", buffer.toString('hex'));

      const length = buffer.length;
      if (DEBUG_MODE) {
        this.carDevice.log(`BLEServer: TX length: ${length}`);
      }
      const out = Buffer.alloc(2 + length);
      out[0] = length >> 8;
      out[1] = length & 0xff;
      buffer.copy(out, 2);

      let remaining = out;

      const blockLength = 20;
      while (remaining.length > 0) {
        const chunk = remaining.subarray(0, blockLength);
        if (DEBUG_MODE) {
          this.carDevice.log(`TX chunk: ${Buffer.from(chunk).toString('hex')}`);          
        }
        await this.txCharacteristic.write(Buffer.from(chunk));
        remaining = remaining.subarray(chunk.length);
      }
    } catch (err) {
      throw err;
    }

  }

  // async write(buffer){
  //   if (this.busy) {
  //     this.carDevice.log("BTLEServer:  Busy, cannot write to BLE device.");
  //     throw new Error("BTLEServer:  Busy, cannot write to BLE device.");
  //   }
  //   this.busy = true;
  //   try{
  //     await this.connect();
  //     if (!this.txCharacteristic) {
  //       this.carDevice.log("BTLEServer:  Failed to connect TX characteristic.");
  //       throw new Error("BTLEServer:  Failed to connect TX characteristic.");
  //     }
  //     this.inputBuffer = Buffer.alloc(0);
  //     this.inbox = [];
  //     // this.carDevice.log(`BTLEServer TX: ${Buffer.from(buffer).toString('hex')}`);
  //     await this.tx(buffer);
  //     await this.wait(1000);
  //     let data = this.read();
  //     if (!data || data.length == 0) {
  //       this.carDevice.log("BTLEServer: No data received from BLE device.");
  //       throw new Error("BTLEServer: No data received from BLE device.");
  //     }
  //     this.carDevice.log("BTLEServer: write response data: ", data[0].toString('hex'));
  //     return data[0];
  //   }
  //   catch(error){
  //     this.carDevice.log("BTLEServer: Error writing to BLE device: "+ error.message);
  //     throw error;
  //   } 
  //   finally{
  //     await this.disconnect();
  //     this.busy = false;
  //   }
  // }

  async writeAsync(buffer){
    try{
      // await this.connect();
      if (!this.txCharacteristic) {
        this.carDevice.log("BTLEServer:  Failed to connect TX characteristic.");
        throw new Error("BTLEServer:  Failed to connect TX characteristic.");
      }
      this.inputBuffer = Buffer.alloc(0);
      this.inbox = [];
      await this.tx(buffer);
    }
    catch(error){
      this.carDevice.log("BTLEServer: Error writing to BLE device: "+ error.message);
      throw error;
    } 
    finally{
      // await this.disconnect();
    }
  }


  read() {
    return this.inbox;
  }

  async _getService(peripheral, serviceUuid) {
    return new Promise(function(resolve, reject) {
        let service;
        let promiseTimeout = setTimeout(function() {
            if (!service) {
                reject(new Error('BTLE service timeout'));
            }
        }, 5000);

        peripheral.getService(serviceUuid).then(service =>{
          resolve(service);
          clearTimeout(promiseTimeout);
        });
    });
  }

  async wait(ms) {
    return new Promise((resolve) => {
      setTimeout(resolve, ms);
    });
  }
}

module.exports = { TeslaBleApi };