# Gartentagebuch Cards

Home-Assistant-Lovelace-Cards fuer das [Garden Journal HA-Add-on](https://github.com/Shadowlord31/shadows-ha-addons).
Ab v2.0.0 reine Add-on-Karten - keine eigenstaendige Datenhaltung, keine feste
IP/URL noetig. Alle Karten loesen ihre Verbindung automatisch ueber die
Ingress-URL des Add-ons auf (`hass.connection.sendMessagePromise` gegen
`supervisor/api`).

## Enthaltene Karten

| Karte | Beschreibung |
|---|---|
| `gartentagebuch-felder-card` | Standorte/Felder mit Belegung, Ernte- und Pflanzen-Modal, uebernimmt Planungen direkt ins Tagebuch |
| `gartentagebuch-gehoelze-card` | Liste der Gehoelze mit Alter/Standort, Ernte-Modal (Teilernte/Roden) |
| `gartentagebuch-uebersicht-card` | Anzahl Gepflanzt/Dauerbepflanzung/Gehoelze + Kosten des Jahres |
| `gartentagebuch-kosten-card` | Jahresuebersicht der Ausgaben nach Kategorie, Modal zum Erfassen |

Jede Karte hat einen visuellen Editor (Titel, Add-on Slug, Design Hell/Dunkel).

## Konfiguration

```yaml
type: custom:gartentagebuch-felder-card
title: Garten
addon_slug: 3744e95d_garden_journal   # Slug des installierten Add-ons
design: dark                          # hell/dunkel, optional
```

Den `addon_slug` findest du z.B. in Einstellungen -> Add-ons -> Garden Journal
in der URL, oder ueber `ha_get_addon` wenn du per MCP arbeitest.

## Installation

Als Dashboard-Resource einbinden (Typ: JavaScript-Modul), z.B. ueber HACS als
benutzerdefiniertes Repository.

## Voraussetzung

Das [Garden Journal Add-on](https://github.com/Shadowlord31/shadows-ha-addons)
muss installiert und gestartet sein.
