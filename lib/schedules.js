'use strict';

const DAY_BITS = {
  sunday: 1,
  monday: 2,
  tuesday: 4,
  wednesday: 8,
  thursday: 16,
  friday: 32,
  saturday: 64,
};

const DAY_KEYS = Object.keys(DAY_BITS); // index matches JS getDay()

function daysToBitmask(days) {
  if (days === 'all') return 127;
  if (days === 'weekdays') return 62;
  if (days === 'weekends') return 65;
  if (Object.prototype.hasOwnProperty.call(DAY_BITS, days)) return DAY_BITS[days];
  throw new Error(`Unknown days value: ${days}`);
}

function daysToRest(days) {
  if (days === 'all') return 'All';
  if (days === 'weekdays') return 'Weekdays';
  if (days === 'weekends') return 'Saturday,Sunday';
  if (Object.prototype.hasOwnProperty.call(DAY_BITS, days)) {
    return days.charAt(0).toUpperCase() + days.slice(1);
  }
  throw new Error(`Unknown days value: ${days}`);
}

function timeToMinutes(time) {
  if (typeof time !== 'string' || !/^\d{1,2}:\d{2}$/.test(time)) {
    throw new Error(`Invalid time: ${time}`);
  }
  const [h, m] = time.split(':').map(Number);
  if (h > 23 || m > 59) throw new Error(`Invalid time: ${time}`);
  return h * 60 + m;
}

function isTimeSet(time) {
  return typeof time === 'string' && time.trim().length > 0;
}

function nextWeekday(time, timezone, now = new Date()) {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: timezone,
    weekday: 'long',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(now);
  const get = type => parts.find(p => p.type === type).value;
  const today = get('weekday').toLowerCase();
  const nowMinutes = Number(get('hour')) * 60 + Number(get('minute'));
  if (timeToMinutes(time) > nowMinutes) return today;
  return DAY_KEYS[(DAY_KEYS.indexOf(today) + 1) % 7];
}

function isFirmwareSupported(version) {
  if (typeof version !== 'string') return null;
  const match = version.trim().match(/^(\d+)\.(\d+)/);
  if (!match) return null;
  const year = Number(match[1]);
  const minor = Number(match[2]);
  return year > 2024 || (year === 2024 && minor >= 26);
}

function validLocation(loc) {
  return !!loc
    && Number.isFinite(loc.lat)
    && Number.isFinite(loc.lon)
    && !(loc.lat === 0 && loc.lon === 0);
}

function resolveLocation(source, car, homey) {
  if (source === 'car' && validLocation(car)) return { lat: car.lat, lon: car.lon };
  if (validLocation(homey)) return { lat: homey.lat, lon: homey.lon };
  return null;
}

function scheduleKey(kind, name) {
  const n = typeof name === 'string' ? name.trim().toLowerCase() : '';
  return `${kind}:${n}`;
}

function reserveScheduleId(ids, key, nowSec) {
  if (Object.prototype.hasOwnProperty.call(ids, key)) return { id: ids[key], ids: { ...ids } };
  const used = new Set(Object.values(ids));
  let id = nowSec;
  while (used.has(id)) id++;
  return { id, ids: { ...ids, [key]: id } };
}

function listScheduleIds(ids, kind) {
  return Object.keys(ids)
    .filter(k => k.startsWith(`${kind}:`))
    .map(k => ids[k]);
}

function withoutScheduleIds(ids, kind) {
  const out = {};
  for (const k of Object.keys(ids)) {
    if (!k.startsWith(`${kind}:`)) out[k] = ids[k];
  }
  return out;
}

function withoutScheduleIdValue(ids, id) {
  const out = {};
  for (const k of Object.keys(ids)) {
    if (ids[k] !== id) out[k] = ids[k];
  }
  return out;
}

function buildPreconditionSchedule({ id, name, time, days, oneTime, location }) {
  return {
    id,
    name,
    days,
    preconditionTime: timeToMinutes(time),
    oneTime,
    enabled: true,
    lat: location.lat,
    lon: location.lon,
  };
}

function buildChargeSchedule({ id, name, startTime, endTime, days, location }) {
  const startEnabled = isTimeSet(startTime);
  const endEnabled = isTimeSet(endTime);
  if (!startEnabled && !endEnabled) throw new Error('SCHEDULE_NO_TIME');
  return {
    id,
    name,
    days,
    startEnabled,
    startTime: startEnabled ? timeToMinutes(startTime) : 0,
    endEnabled,
    endTime: endEnabled ? timeToMinutes(endTime) : 0,
    oneTime: false,
    enabled: true,
    lat: location.lat,
    lon: location.lon,
  };
}

function toSignedPrecondition(s) {
  return {
    id: s.id,
    name: s.name,
    daysOfWeek: daysToBitmask(s.days),
    preconditionTime: s.preconditionTime,
    oneTime: s.oneTime,
    enabled: s.enabled,
    latitude: s.lat,
    longitude: s.lon,
  };
}

function toRestPrecondition(s) {
  return {
    id: s.id,
    days_of_week: daysToRest(s.days),
    precondition_time: s.preconditionTime,
    one_time: s.oneTime,
    enabled: s.enabled,
    lat: s.lat,
    lon: s.lon,
  };
}

function toSignedCharge(s) {
  return {
    id: s.id,
    name: s.name,
    daysOfWeek: daysToBitmask(s.days),
    startEnabled: s.startEnabled,
    startTime: s.startTime,
    endEnabled: s.endEnabled,
    endTime: s.endTime,
    oneTime: s.oneTime,
    enabled: s.enabled,
    latitude: s.lat,
    longitude: s.lon,
  };
}

function toRestCharge(s) {
  return {
    id: s.id,
    days_of_week: daysToRest(s.days),
    start_enabled: s.startEnabled,
    start_time: s.startTime,
    end_enabled: s.endEnabled,
    end_time: s.endTime,
    one_time: s.oneTime,
    enabled: s.enabled,
    lat: s.lat,
    lon: s.lon,
  };
}

function batchFlags(which) {
  return {
    home: which === 'home' || which === 'all',
    work: which === 'work' || which === 'all',
    other: which === 'other' || which === 'all',
  };
}

module.exports = {
  DAY_BITS,
  daysToBitmask,
  daysToRest,
  timeToMinutes,
  isTimeSet,
  nextWeekday,
  isFirmwareSupported,
  resolveLocation,
  scheduleKey,
  reserveScheduleId,
  listScheduleIds,
  withoutScheduleIds,
  withoutScheduleIdValue,
  buildPreconditionSchedule,
  buildChargeSchedule,
  toSignedPrecondition,
  toRestPrecondition,
  toSignedCharge,
  toRestCharge,
  batchFlags,
};
