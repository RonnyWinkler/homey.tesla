
// const protobuf = require("protobufjs");
const protobuf = require("./protobufjs.js");

const { Signer } = require('./Signer.js');
const { randomBytes } = require('crypto');

const EXPIRES_IN = 15; // default 5 sec

class CarServer {
    constructor(fleetApi, vin, privateKey) {
        return (async () => {

            this.api = fleetApi;
            this.vin = vin;
            this.privateKey = privateKey;
            this.signer = null;

            this.protoSignatures = await protobuf.load('proto/signatures.proto');
            this.protoMessage = await protobuf.load('proto/universal_message.proto');
            this.protoCarServer = await protobuf.load('proto/car_server.proto');
            this.Domain = this.protoMessage.lookupEnum("UniversalMessage.Domain").values;
            this.MessageOperationStatus = this.protoMessage.lookupEnum("UniversalMessage.OperationStatus_E").values;
            this.MessageFault = this.protoMessage.lookupEnum("UniversalMessage.MessageFault_E").values;
            this.msgProto = this.protoMessage.lookupType("UniversalMessage.RoutableMessage");
            this.sessionInfoProto = this.protoSignatures.lookupType("Signatures.SessionInfo");
            this.carServerResponseProto = this.protoCarServer.lookupType('CarServer.Response');
            this.actionProto = this.protoCarServer.lookupType("CarServer.Action");
            this.ActionResult = this.protoCarServer.lookupEnum('CarServer.OperationStatus_E').values;
            
            return this;
        })();
    }

    async #sendRequest(req) {
        const message = this.msgProto.create(req);
        const buffer = this.msgProto.encode(message).finish();
        const bufResp = await this.api.signedCommand(this.vin, buffer);
        const res = this.msgProto.decode(bufResp);
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
        if (res.hasOwnProperty('sessionInfo') && res.hasOwnProperty('signatureData')) {
            if (!res.signatureData.hasOwnProperty('sessionInfoTag') || !res.signatureData.sessionInfoTag.hasOwnProperty('tag'))
                throw new Error('Missing sessionInfo tag');
            const sessionInfo = this.sessionInfoProto.decode(res.sessionInfo);
            this.signer = await new Signer(this.privateKey, this.vin, sessionInfo);
            if (!this.signer.validateSessionInfo(res.sessionInfo, res.requestUuid, res.signatureData.sessionInfoTag.tag)) {
                this.signer = null;
                throw new Error("Session info hmac invalid");
            }
            // Return error if frequest timed out
            if (res.hasOwnProperty('signedMessageStatus') && res.signedMessageStatus.hasOwnProperty('operationStatus')){
                if (res.signedMessageStatus.operationStatus != this.ActionResult.OPERATIONSTATUS_OK){
                    throw new Error("Signed message error: "+this.MessageFault[res.signedMessageStatus.signedMessageFault]);
                }
            }
            return sessionInfo;
        }
        // Return response payload
        else if (res.hasOwnProperty('protobufMessageAsBytes')) {
            return this.carServerResponseProto.decode(res.protobufMessageAsBytes);
        }
        else {
            throw new Error("Invalid response");
        }
    }

    async startSession() {
        await this.#sendRequest({
            toDestination: { domain: this.Domain.DOMAIN_INFOTAINMENT }, 
            fromDestination: { routingAddress: randomBytes(16) },
            sessionInfoRequest: { publicKey: this.privateKey.publicKey },
            uuid: randomBytes(16)
        });
    }

    #decodeError(resultReason) {
        if (resultReason.hasOwnProperty('plainText')) return resultReason.plainText;
        throw new Error('Unknown result Reason');
    }

    async #requestAction(action) {
        if (this.signer == null) await this.startSession();
        if (this.signer == null) throw new Error('Session not started');
        const payload = this.actionProto.create({ vehicleAction: action });
        const encodedPayload = this.actionProto.encode(payload).finish();
        const signature = this.signer.generateSignature(encodedPayload, this.Domain.DOMAIN_INFOTAINMENT, EXPIRES_IN); // default: 5 sec
        const response = await this.#sendRequest({
            toDestination: { domain: this.Domain.DOMAIN_INFOTAINMENT }, 
            fromDestination: { routingAddress: randomBytes(16) },
            protobufMessageAsBytes: encodedPayload,
            signatureData: signature,
            uuid: randomBytes(16),
            flags: 0
        });
        if (response.hasOwnProperty('actionStatus') && ( response.actionStatus.hasOwnProperty('result') || response.actionStatus.result != undefined) ) {
            switch(response.actionStatus.result) {
                case this.ActionResult.OPERATIONSTATUS_OK:
                    return;
                case this.ActionResult.OPERATIONSTATUS_ERROR:
                    if (response.actionStatus.hasOwnProperty('resultReason')){
                        if (response.actionStatus.resultReason.plainText == 'already_set'){
                            // If value was already set, it's not an error!
                            return;
                        }
                        throw new Error(this.#decodeError(response.actionStatus.resultReason));
                    }
                    else
                        throw new Error('Unknown error');
                default:
                    throw new Error('Invalid CarServer action result');
            }
        }
    }

    async sendSignedCommand(command, params) {
        let body = {};
        body[command] = params;
        await this.#requestAction(body);
    }

    // async chargingSetLimit(percent) {
    //     await this.#requestAction({ chargingSetLimitAction: { percent } });
    // }
}

module.exports = { CarServer };