# Smart Meter Texas

## Überblick

Diese Integration verbindet Gladys mit [Smart Meter Texas](https://www.smartmetertexas.com),
dem Portal, in dem die texanischen Netzbetreiber (Oncor, CenterPoint, AEP Texas, TNMP) die
Daten der intelligenten Stromzähler des ERCOT-Marktes veröffentlichen. Es ist eine
**Cloud**-Integration, nur in den **Vereinigten Staaten** (Texas) verfügbar.

Für jeden Zähler Ihres Kontos erhält Gladys ein Gerät mit drei schreibgeschützten Funktionen:

- **Zählerstand** (kWh), aus einer Ablesung auf Anfrage;
- **Verbrauch von gestern** (kWh), aus den 15-Minuten-Daten;
- **Erzeugungsüberschuss von gestern** (kWh): die von Ihrer Solaranlage ins Netz eingespeiste
  Energie.

Außerdem bietet sie:

- **Szenen-Auslöser**: _Neuer Zählerstand_ (mit dem Verbrauch seit der letzten Ablesung),
  _Tagesverbrauch verfügbar_ und _Ablesung fehlgeschlagen_;
- **Szenen-Aktionen**: _Zähler ablesen_ und _Verbrauch eines vergangenen Tages abrufen_,
  deren Ergebnisse die folgenden Aktionen der Szene nutzen können;
- **Ein Dashboard-Widget**: Zählerstand, Verbrauch von gestern, Stundendiagramm und ein
  Knopf **Jetzt ablesen**.

## Voraussetzungen

- Gladys Assistant 5.3.0 oder neuer.
- Ein Smart-Meter-Texas-Konto (kostenlos, auf smartmetertexas.com mit der ESI ID und der
  Zählernummer Ihrer Stromrechnung angelegt). Die Zugangsdaten Ihres Stromanbieters
  funktionieren hier **nicht**.

## Konfiguration

1. Öffnen Sie **Integrationen → Smart Meter Texas → Konfiguration**.
2. Geben Sie **Benutzername** und **Passwort** Ihres Smart-Meter-Texas-Kontos ein.
3. Ändern Sie bei Bedarf das **Ableseintervall** (standardmäßig 60 Minuten, mindestens 30)
   und die Option **Verbrauch von gestern**.
4. Klicken Sie auf **Verbindung testen**: die Anzahl der gefundenen Zähler wird angezeigt.
5. Öffnen Sie den Tab **Entdecken** und fügen Sie Ihre Zähler hinzu.

Eine Ablesung auf Anfrage dauert einige Sekunden bis fünf Minuten, und Smart Meter Texas
erlaubt **zwei Ablesungen pro Zähler und Stunde**: eine zweite Ablesung innerhalb von
30 Minuten lehnt die Integration ab. Die 15-Minuten-Daten eines Tages erscheinen meist am
nächsten, manchmal erst am übernächsten Tag.

## Fehlerbehebung

- **„Smart Meter Texas hat Benutzername oder Passwort abgelehnt“**: melden Sie sich mit
  denselben Daten auf smartmetertexas.com an; das Portal sperrt das Konto nach mehreren
  Fehlversuchen.
- **„Smart Meter Texas begrenzt die Anfragen“**: zu viele Anmeldungen oder Ablesungen;
  warten Sie eine Stunde.
- **Kein Wert nach 5 Minuten**: der Zähler hat nicht geantwortet; die nächste geplante
  Ablesung versucht es erneut. Der Auslöser _Ablesung fehlgeschlagen_ kann Sie benachrichtigen.
- **Der Verbrauch von gestern bleibt leer**: der Netzbetreiber hat die Daten noch nicht
  veröffentlicht; die Integration versucht es bei jedem Intervall erneut.
- Ihr Passwort wird von Gladys als Geheimnis gespeichert und nie in die Protokolle geschrieben.
