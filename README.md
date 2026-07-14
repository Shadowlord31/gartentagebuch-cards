# Gartentagebuch Felder-Card

Home-Assistant-Lovelace-Card fuer das Gartentagebuch: zeigt Standorte und Felder mit
aktueller Belegung, oeffnet ein Ernte-Modal (Teilernte / Endgueltig ernten) und ein
Pflanzen-Modal direkt aus dem Dashboard heraus. Spricht direkt mit der
Gartentagebuch-App-API (`/garten/api`), keine eigene Datenhaltung.

## Voraussetzung

CORS muss in der Gartentagebuch-App aktiviert sein (`app.use(require("cors")())` in
`server.js`).

## Installation

Als Dashboard-Resource einbinden (Typ: JavaScript-Modul), z.B. ueber HACS als
benutzerdefiniertes Repository oder manuell in `/config/www/`.

## Verwendung

```yaml
type: custom:gartentagebuch-felder-card
title: Garten
api_base: http://192.168.178.114:3002/garten/api
standort_id: 21   # optional, nur einen Standort anzeigen
```
