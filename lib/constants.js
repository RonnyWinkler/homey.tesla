'use strict';

const COMMAND_API_REST = 'rest';
const COMMAND_API_PROXY = 'command';
const COMMAND_API_CMD = 'tvcp';

const STATE_ONLINE = 'online';
const STATE_OFFLINE = 'offline';
const STATE_ASLEEP = 'asleep';
const WINDOW_POSITION_VENT = 'vent';
const WINDOW_POSITION_CLOSE = 'close';
const MILES_TO_KM = 1.609344;

module.exports = Object.freeze({
    STATE_ONLINE,
    STATE_OFFLINE,
    STATE_ASLEEP,
    MILES_TO_KM,
    WINDOW_POSITION_VENT,
    WINDOW_POSITION_CLOSE,
    COMMAND_API_REST,
    COMMAND_API_PROXY,
    COMMAND_API_CMD
})