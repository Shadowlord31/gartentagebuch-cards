# Gartentagebuch Cards

Sammlung von Home-Assistant-Lovelace-Cards fuer das Gartentagebuch. Aktuell enthalten:

## gartentagebuch-felder-card

Zeigt Standorte und Felder mit aktueller Belegung, oeffnet ein Ernte-Modal
(Teilernte / Endgueltig ernten) und ein Pflanzen-Modal direkt aus dem Dashboard heraus.
Spricht direkt mit der Gartentagebuch-App-API (`/garten/api`), keine eigene Datenhaltung.

Voraussetzung: CORS muss in der Gartentagebuch-App aktiviert sein
(`app.use(require("cors")())` in `server.js`).

```yaml
type: custom:gartentagebuch-felder-card
title: Garten
api_base: http://DEINE-IP-ODER-DOMAIN:3002/garten/api
standort_id: 21   # optional, nur einen Standort anzeigen
```

Weitere Karten kommen als zusaetzliche `customElements.define(...)`-Bloecke in
`gartentagebuch-cards.js` dazu.

## Installation

Als Dashboard-Resource einbinden (Typ: JavaScript-Modul), z.B. ueber HACS als
benutzerdefiniertes Repository oder manuell in `/config/www/`.
