this.universalMessageDomain
const CarDevice = require("../drivers/car/device.js");
// const protobuf = require("protobufjs");
const protobuf = require("./protobufjs.js");

const { Signer } = require('./Signer.js');
const { randomBytes } = require('crypto');
// const crypto = require('crypto')

const EXPIRES_IN = 20; // default 5 sec
const DOMAIN_INFOTAINMENT = 'DOMAIN_INFOTAINMENT';
const DOMAIN_VEHICLE_SECURITY = 'DOMAIN_VEHICLE_SECURITY';
const AUTH_TYPE_HMAC_SHA256 = 'HMAC-SHA256';
const AUTH_TYPE_AES_GCM = 'AES-GCM';


class TeslaCommandApi {
    // constructor(fleetApi, vin, privateKey) {
    constructor(apiCallback, vin, privateKey, authType = AUTH_TYPE_HMAC_SHA256) {
      return (async () => {

          // this.api = fleetApi;
          this.apiCallback = apiCallback;
          this.authType = authType;
          this.vin = vin;
          this.privateKey = privateKey;
          this.signer = {};

          this.protoKeys = await protobuf.load('proto/keys.proto');
          this.protoSignatures = await protobuf.load('proto/signatures.proto');
          this.protoUniversalMessage = await protobuf.load('proto/universal_message.proto');
          this.protoCarServer = await protobuf.load('proto/car_server.proto');
          this.protoVcsec = await protobuf.load('proto/vcsec.proto');

          this.keysRole = this.protoKeys.lookupEnum("Role").values;
          this.universalMessageDomain = this.protoUniversalMessage.lookupEnum("UniversalMessage.Domain").values;
          this.universalMessageFlags = this.protoUniversalMessage.lookupEnum("UniversalMessage.Flags").values;
          this.universaMessageOperationStatus = this.protoUniversalMessage.lookupEnum("UniversalMessage.OperationStatus_E").values;
          this.universalMessageMessageFault = this.protoUniversalMessage.lookupEnum("UniversalMessage.MessageFault_E").values;
          this.universalMessageRoutableMessage = this.protoUniversalMessage.lookupType("UniversalMessage.RoutableMessage");

          this.signaturesSessionInfo = this.protoSignatures.lookupType("Signatures.SessionInfo");
          this.signaturesSessionInfoStatus = this.protoSignatures.lookupEnum('Signatures.Session_Info_Status').values;

          this.carServerResponse = this.protoCarServer.lookupType('CarServer.Response');
          this.carServerAction = this.protoCarServer.lookupType("CarServer.Action");
          this.carServerOperationStatus = this.protoCarServer.lookupEnum('CarServer.OperationStatus_E').values;

          this.vcsecUnsignedMessage = this.protoVcsec.lookupType("VCSEC.UnsignedMessage");
          this.vcsecFromVCSECMessage = this.protoVcsec.lookupType("VCSEC.FromVCSECMessage");
          this.vcsecCommandStatus = this.protoVcsec.lookupType("VCSEC.CommandStatus");
          this.vcsecInformationRequestType = this.protoVcsec.lookupEnum("VCSEC.InformationRequestType").values;
          this.vcsecToVCSECMessage = this.protoVcsec.lookupType("VCSEC.ToVCSECMessage");
          this.vcsecKeyFormFactor = this.protoVcsec.lookupEnum("VCSEC.KeyFormFactor");
          this.vcsecSignatureType = this.protoVcsec.lookupEnum("VCSEC.SignatureType").values;

          const Domain = this.protoUniversalMessage.lookupEnum("UniversalMessage.Domain").values;

          // this.vcsecResult = this.protoVcsec.lookupEnum('VCSEC.OperationStatus_E').values;

          return this;
      })();
    }

    async #sendRequest(req) {

        const message = this.universalMessageRoutableMessage.create(req);
        const buffer = this.universalMessageRoutableMessage.encode(message).finish();
        const test = this.universalMessageRoutableMessage.decode(buffer);

        const bufResp = await this.apiCallback(buffer, req);

        const res = this.universalMessageRoutableMessage.decode(bufResp);
        // Check destination, domain and address
        if (!res.hasOwnProperty('fromDestination')) 
            throw new Error('Missing response source');
        if (!res.fromDestination.hasOwnProperty('domain') || res.fromDestination.domain != req.toDestination.domain)
            throw new Error('Invalid source domain');
        if (!res.hasOwnProperty('toDestination')) 
            throw new Error('Missing response destination');
        if (!res.toDestination.hasOwnProperty('routingAddress') 
            || Buffer.compare(res.toDestination.routingAddress, req.fromDestination.routingAddress) != 0)
            throw new Error('Invalid destination address');
        if (!res.hasOwnProperty('requestUuid'))
            throw new Error('Missing request UUID');

        // Update session
        if (res.hasOwnProperty('sessionInfo')) {
            const sessionInfo = this.signaturesSessionInfo.decode(res.sessionInfo);
            if (sessionInfo.status != this.signaturesSessionInfoStatus.SESSION_INFO_STATUS_OK) {
                throw new Error('Signed message error: ' + this.signaturesSessionInfoStatus[sessionInfo.status]);
            }
            
            // this.api.log("CarServer.#sendRequest() SessionInfo: "+JSON.stringify(sessionInfo));
            if (!res.signatureData.hasOwnProperty('sessionInfoTag') || !res.signatureData.sessionInfoTag.hasOwnProperty('tag'))
                throw new Error('Missing sessionInfo tag');
            // this.api.log("CarServer.#sendRequest() SessionsignatureData : "+JSON.stringify(res.signatureData));
            if (! res.hasOwnProperty('signatureData')){
                throw new Error('Missing signatureData');
            }
            this.signer[req.toDestination.domain] = await new Signer(this.privateKey, this.vin, sessionInfo);
            if (!this.signer[req.toDestination.domain].validateSessionInfo(res.sessionInfo, res.requestUuid, res.signatureData.sessionInfoTag.tag)) {
                this.signer[req.toDestination.domain] = null;
                throw new Error("Session info hmac invalid");
            }
            // Return error if request timed out
            if (res.hasOwnProperty('signedMessageStatus') && res.signedMessageStatus.hasOwnProperty('operationStatus')){
                if (res.signedMessageStatus.operationStatus != this.carServerOperationStatus.OPERATIONSTATUS_OK){
                    throw new Error("Signed message error: "+this.universalMessageMessageFault[res.signedMessageStatus.signedMessageFault]);
                }
            }
            return sessionInfo;
        }
        // Return response payload
        else if ( res.hasOwnProperty('signedMessageStatus') && res.signedMessageStatus.hasOwnProperty('operationStatus')){
            if (res.signedMessageStatus.operationStatus != this.carServerOperationStatus.OPERATIONSTATUS_OK ){
              // Return error
              throw new Error("Signed message error: "+this.universalMessageMessageFault[res.signedMessageStatus.signedMessageFault]);
            }
        }
        else{
          return res;
        }
        // else if (res.hasOwnProperty('protobufMessageAsBytes')) {
        //   // return this.carServerResponse.decode(res.protobufMessageAsBytes);
        //   // Return the whole routeableMessage response. Message check and optional decryption is done in the caller function.s
        //   return res;
        // }
        // else {
        //     // Domain VCSEC has no result payload
        //     return;
        //     // throw new Error("Invalid response");
        // }
    }

    async startSession(domain) {
        await this.#sendRequest({
            // toDestination: { domain: this.universalMessageDomain.DOMAIN_INFOTAINMENT }, // DOMAIN_VEHICLE_SECURITY, DOMAIN_INFOTAINMENT
            toDestination: { domain: domain }, // DOMAIN_VEHICLE_SECURITY, DOMAIN_INFOTAINMENT
            fromDestination: { routingAddress: randomBytes(16) },
            sessionInfoRequest: { publicKey: this.privateKey.publicKey },
            uuid: randomBytes(16),
            flags: this.authType == AUTH_TYPE_AES_GCM ? this.universalMessageFlags.FLAG_ENCRYPT_RESPONSE : 0
        });
    }

    #decodeError(resultReason) {
        if (resultReason.hasOwnProperty('plainText')) return resultReason.plainText;
        throw new Error('Unknown result Reason');
    }

    async #requestAction(json, domain, options) {
        // if (!json['WhitelistOperation']){
          if ( !this.signer[domain]) await this.startSession(domain);
          if ( !this.signer[domain]) throw new Error('Session not started');
        // this.api.log("CarServer.#requestAction() Signed message payload: "+JSON.stringify( json ));
        // }

        let payload, encodedPayload;
        switch (domain){
            case this.universalMessageDomain.DOMAIN_INFOTAINMENT:
                payload = this.carServerAction.create( json );
                encodedPayload = this.carServerAction.encode(payload).finish();
                break;
            case this.universalMessageDomain.DOMAIN_VEHICLE_SECURITY:
                payload = this.vcsecUnsignedMessage.create( json );
                encodedPayload = this.vcsecUnsignedMessage.encode(payload).finish();
                break;
            default:
                throw new Error('Invalid domain');
        }
 
        let response;
        let signature;
        let routeableMessageBody;
        // HMAC Signature only - used for online request via FleetAPI
        if (this.authType == AUTH_TYPE_HMAC_SHA256) {
          if (this.signer[domain]){
            signature = this.signer[domain].generateSignatureHMAC(encodedPayload, domain, EXPIRES_IN);
          }
          routeableMessageBody = {
              toDestination: { domain: domain }, 
              fromDestination: { routingAddress: randomBytes(16) },
              protobufMessageAsBytes: encodedPayload,
              signatureData: signature.signatureData,
              uuid: randomBytes(16),
              flags: this.universalMessageFlags.FLAG_USER_COMMAND
          };
        }
        // AES-GCM Signature & Encryption - used for offline request via BLE API
        else if (this.authType == AUTH_TYPE_AES_GCM) {
          let flags = ( 1 << this.universalMessageFlags.FLAG_USER_COMMAND );
          if (options.requestEncryptedResponse){
            flags = flags + ( 1 << this.universalMessageFlags.FLAG_ENCRYPT_RESPONSE );
          }
          if (this.signer[domain]){
            signature = this.signer[domain].generateSignatureAESGCM(encodedPayload, domain, EXPIRES_IN, flags);
          }
          routeableMessageBody = {
              toDestination: { domain: domain }, 
              fromDestination: { routingAddress: randomBytes(16) },
              protobufMessageAsBytes: signature.encryptedPayload,
              signatureData: signature.signatureData,
              uuid: randomBytes(16),
              flags: flags
          };
        }
        else {
          throw new Error('Invalid authType');
        }

        // Send request to API. #sendRequest() will decode the response and check for errors.
        response = await this.#sendRequest(routeableMessageBody);

        // Response message decoding/decryption
        let protobufBytes;

        if (response.hasOwnProperty('protobufMessageAsBytes')){
          if (response.signatureData && response.signatureData.AES_GCM_ResponseData){
            let fault = 0;
            if (response.signedMessageStatus && response.signedMessageStatus.signedMessageFault){
              fault = response.signedMessageStatus.signedMessageFault;
            }
            protobufBytes = this.signer[domain].decodeResponseAESGCM(
              response.protobufMessageAsBytes, 
              domain,
              response.signatureData.AES_GCM_ResponseData.nonce, 
              response.signatureData.AES_GCM_ResponseData.counter, 
              response.signatureData.AES_GCM_ResponseData.tag, 
              response.flags,
              fault
            );
          }
          else{
            protobufBytes = response.protobufMessageAsBytes;
          }

          response = this.carServerResponse.decode(protobufBytes);
        }
        else{
          response = {};
        }

        switch (domain){
            case this.universalMessageDomain.DOMAIN_INFOTAINMENT:
                if (response && response.hasOwnProperty('actionStatus') && ( response.actionStatus.hasOwnProperty('result') || response.actionStatus.result != undefined) ) {
                    switch(response.actionStatus.result) {
                        case this.carServerOperationStatus.OPERATIONSTATUS_OK:
                            return response;
                        case this.carServerOperationStatus.OPERATIONSTATUS_ERROR:
                            if (response.actionStatus.hasOwnProperty('resultReason')){
                                // if (response.actionStatus.resultReason.plainText == 'already_set'){
                                //     // If error message is a value in whitelits, it's not an error!
                                //     return;
                                // }
                                throw new Error(this.#decodeError(response.actionStatus.resultReason));
                            }
                            else
                                throw new Error('Unknown error');
                        default:
                            throw new Error('Invalid CarServer action result');
                    }
                }
                break;
            case this.universalMessageDomain.DOMAIN_VEHICLE_SECURITY:
                // no rersponse expected
                return;
        }
    }

    async sendSignedCommand(command, params, domain = DOMAIN_INFOTAINMENT, options = {}) {
        let requestDomain;
        let payload = {};

        switch (domain){
            case DOMAIN_INFOTAINMENT:
                requestDomain = this.universalMessageDomain.DOMAIN_INFOTAINMENT;
                let body = {};
                body[command] = params;
                payload = { vehicleAction: body };
                break;
            case DOMAIN_VEHICLE_SECURITY:
                requestDomain = this.universalMessageDomain.DOMAIN_VEHICLE_SECURITY;
                payload[command] = params ;
                break;
            default:
                throw new Error('Invalid domain');
        }

        return await this.#requestAction(payload, requestDomain, options);
    }
   
    encodeWhitelistMessageRequest(publicKey) {
      // Step 1: Construct UnsignedMessage with addKeyToWhitelistAndAddPermissions
      const unsignedMessagePayload = {
        WhitelistOperation: {
          addKeyToWhitelistAndAddPermissions: {
            key: {
              PublicKeyRaw: publicKey,
            },
            // secondsToBeActive: 20,
            keyRole: this.keysRole.ROLE_OWNER, // Example, replace if needed
          },
          metadataForKey: {
            keyFormFactor: this.vcsecKeyFormFactor.values.KEY_FORM_FACTOR_IOS_DEVICE,
          },
        },
      };

      const unsignedMessage = this.vcsecUnsignedMessage.create(unsignedMessagePayload);
      const unsignedMessageBytes = this.vcsecUnsignedMessage.encode(unsignedMessage).finish();

      const toVCSECMessagePayload = {
        signedMessage: {
          protobufMessageAsBytes: unsignedMessageBytes,
          signatureType: this.vcsecSignatureType.SIGNATURE_TYPE_PRESENT_KEY // SIGNATURE_TYPE_NONE = 0; SIGNATURE_TYPE_PRESENT_KEY  = 2;
        }
      }
      const toVcsecMessage = this.vcsecToVCSECMessage.create(toVCSECMessagePayload);
      const toVcsecMessageBytes = this.vcsecToVCSECMessage.encode(toVcsecMessage).finish();

      // // Step 2: Wrap inside SignedMessage and RoutableMessage
      const routableMessagePayload = {
          toDestination: { domain: this.universalMessageDomain.DOMAIN_VEHICLE_SECURITY }, 
          fromDestination: { routingAddress: randomBytes(16) },
          
          // protobufMessageAsBytes: unsignedMessageBytes,
          protobufMessageAsBytes: toVcsecMessageBytes,

          // signatureData: signature,
          uuid: randomBytes(16),
          // flags: 0
      }
      const routableMessage = this.universalMessageRoutableMessage.create(routableMessagePayload);
      const routableMessageBytes = this.universalMessageRoutableMessage.encode(routableMessage).finish();

      // Debug message content
      const debugRoutableMessage = this.universalMessageRoutableMessage.decode(routableMessageBytes);
      const debugToVCSECMessage = this.vcsecToVCSECMessage.decode(debugRoutableMessage.protobufMessageAsBytes);
      const debugUnsignedMessage = this.vcsecUnsignedMessage.decode(debugToVCSECMessage.signedMessage.protobufMessageAsBytes);

      // Step 4; Send to BLE API
      // const buffer = routableMessageBytes;
      // const buffer = toVcsecMessageBytes;
      // const bufResp = await apiCallback(buffer, statusCallback);
      return toVcsecMessageBytes
    }

    encodeInformationRequestRequest(publicKey) {
      const publicKeyBytes = Array.from(publicKey);
      const unsignedMessagePayload = {
        InformationRequest: {
          // INFORMATION_REQUEST_TYPE_GET_STATUS = 0;
          // INFORMATION_REQUEST_TYPE_GET_WHITELIST_INFO = 5;
          // INFORMATION_REQUEST_TYPE_GET_WHITELIST_ENTRY_INFO = 6;
          informationRequestType: this.vcsecInformationRequestType.INFORMATION_REQUEST_TYPE_GET_WHITELIST_ENTRY_INFO,
          publicKey: publicKeyBytes
        }
      }

      const unsignedMessage = this.vcsecUnsignedMessage.create(unsignedMessagePayload);
      const unsignedMessageBytes = this.vcsecUnsignedMessage.encode(unsignedMessage).finish();

      // // Step 2: Wrap inside SignedMessage and RoutableMessage
      const routableMessagePayload = {
          toDestination: { domain: this.universalMessageDomain.DOMAIN_VEHICLE_SECURITY }, 
          fromDestination: { routingAddress: randomBytes(16) },
          protobufMessageAsBytes: unsignedMessageBytes,
          // signatureData: signature,
          uuid: randomBytes(16),
          flags: 0
      }
      const routableMessage = this.universalMessageRoutableMessage.create(routableMessagePayload);
      const routableMessageBytes = this.universalMessageRoutableMessage.encode(routableMessage).finish();

      // Step 4; Send to BLE API
      // const buffer = routableMessageBytes;
      // return await apiCallback(buffer, statusCallback);
      return routableMessageBytes;
    }

    decodeUnsignedMessage(buffer) {
      let response;
      response = this.vcsecUnsignedMessage.decode(buffer);
      return response;
    }

    decodeRouteableMessage(buffer) {
      let response = {};
      try{
        response = this.universalMessageRoutableMessage.decode(buffer);
      }
      catch(error){
        console.log("Error decoding routeable message: "+error.message);
      }
      return response;
    }

    decodeWhitelistMessageResponse(buffer) {
      let fromVCSECMessageMsg = this.vcsecFromVCSECMessage.decode(buffer);
      let routableMsg = this.universalMessageRoutableMessage.decode(buffer);
      let commandStatusMsg = this.vcsecCommandStatus.decode(routableMsg.protobufMessageAsBytes);
      return commandStatusMsg;
    }

    decodeInformationRequestResponse(buffer) {
      let routableMsg = this.universalMessageRoutableMessage.decode(buffer);
      let fromVCSECMessageMsg = this.vcsecFromVCSECMessage.decode(routableMsg.protobufMessageAsBytes);

      // Example for INFORMATION_REQUEST_TYPE_GET_STATUS request:
      // FromVCSECMessage {
      //   vehicleStatus: VehicleStatus {
      //     vehicleLockState: 1,
      //     vehicleSleepStatus: 2,
      //     userPresence: 1
      //   }
      // }

      // Example for INFORMATION_REQUEST_TYPE_GET_WHITELIST_ENTRY_INFO
      // FromVCSECMessage { nominalError: NominalError { genericError: 8 } } 

      // Exampele for INFORMATION_REQUEST_TYPE_GET_WHITELIST_INFO
      // FromVCSECMessage {
      //   whitelistInfo: WhitelistInfo {
      //     whitelistEntries: [
      //       [KeyIdentifier],
      //       [KeyIdentifier],
      //       [KeyIdentifier],
      //       [KeyIdentifier],
      //       [KeyIdentifier],
      //       [KeyIdentifier],
      //       [KeyIdentifier],
      //       [KeyIdentifier],
      //       [KeyIdentifier]
      //     ],
      //     numberOfEntries: 9,
      //     slotMask: 511
      //   }
      // }
      return fromVCSECMessageMsg;
    }

    isRouteableMessage(buffer) {
      let response = this.decodeRouteableMessage(buffer);
      // if (response.hasOwnProperty('protobufMessageAsBytes') || response.hasOwnProperty('sessionInfo') || response.hasOwnProperty('signedMessageStatus')) {
      if (response.hasOwnProperty('fromDestination') && response.hasOwnProperty('toDestination')) {
        if (response.toDestination.hasOwnProperty('domain') && response.toDestination.domain == this.universalMessageDomain.DOMAIN_BROADCAST) {
          // let message = this.decodeFromVCSECMessage(response.protobufMessageAsBytes);
          // console.log("Broadcast message FromVCSECMessage: ",message);
          return false;
        }
        else{
          return true;
        }
      } else {
        return false;
      }
    }

    isFromVCSECMessage(buffer) {
      let response = this.decodeFromVCSECMessage(buffer);
      // if (response.hasOwnProperty('protobufMessageAsBytes') || response.hasOwnProperty('sessionInfo') || response.hasOwnProperty('signedMessageStatus')) {
      if (response.hasOwnProperty('vehicleStatus') || 
          response.hasOwnProperty('commandStatus') ||
          response.hasOwnProperty('whitelistInfo') ||
          response.hasOwnProperty('whitelistEntryInfo') ||
          response.hasOwnProperty('whitelistEntryInfo')
        ) {
        return true;
      } else {
        return false;
      }
    }

    decodeFromVCSECMessage(buffer) {
      let response;
      response = this.vcsecFromVCSECMessage.decode(buffer);
      return response;
    }

}

module.exports = { TeslaCommandApi };