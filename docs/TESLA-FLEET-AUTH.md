# Tesla Fleet Auth — Abgleich mit der Tesla-Doku

Stand: 2026-08-14, gegen Tesla Fleet API Docs und App 4.4.5.

## Doku (Tesla)

Token-Endpoint (Partner und Third-Party):

`POST https://fleet-auth.prd.vn.cloud.tesla.com/oauth2/v3/token`

Content-Type: `application/x-www-form-urlencoded`

Audience muss eine regionale Fleet-API-Base-URL **ohne** trailing slash sein:

- NA/APAC: `https://fleet-api.prd.na.vn.cloud.tesla.com`
- EU/EMEA: `https://fleet-api.prd.eu.vn.cloud.tesla.com`
- CN: `https://fleet-api.prd.cn.vn.cloud.tesla.cn`

## Was 4.4.5 schon richtig machte

`registerDomain()` in `TeslaOAuth2Driver.js` (der `invalid_audience`-Pfad nach Client-ID/Secret):

- fleet-auth Token-URL
- form-urlencoded
- NA- und EU-Audience ohne Slash

Deshalb funktionierte 4.4.4/4.4.5 im Forum für neue EU-Registrierungen.

## Was noch falsch war

`TeslaOAuth2Client.onGetTokenByCode` (User-Login nach Tesla-Consent):

- Audience fest auf NA
- Body als JSON statt form-urlencoded
- Region-Lookup immer gegen die NA-API

Authorization-Codes sind einmalig. Deshalb keine Retry-Schleife über NA+EU mit demselben Code.

## Änderung in diesem Branch

- Gemeinsames Modul `lib/TeslaFleetAuth.js`
- User-Token: form-urlencoded, Audience aus Homey-Sprache (de/nl/da/… → EU)
- Refresh-Token: form-urlencoded, ohne Audience (laut Doku)
- Partner-Registrierung nutzt dieselben Konstanten
- `fleet_api_base_url` wird immer ohne Slash gespeichert
