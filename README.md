# EDT Timer – Escalating Density Training mit Cluster-Sätzen

**App:** https://thundertiger187.github.io/edt-timer/
(Die alte Adresse https://thundertiger187.github.io/repzeit/ leitet hierher weiter; gespeicherte Daten werden übernommen.)

![QR-Code zur App](qr.png)

Ziel: maximale Wiederholungen in einem Zeitlimit. Das Workout läuft in Blöcken: Satz (z. B. 10 Liegestütze) → feste Pause (z. B. 15 s) → nächster Satz … Nach N Sätzen wechselt die Phase automatisch (längere Pause oder weniger Wiederholungen). Standard sind 3 Phasen, abgeleitet aus einem Fitnesstest.

PWA: installierbar (iOS Safari: Teilen → „Zum Home-Bildschirm“, Android Chrome: „App installieren“), offline nutzbar, kein Server, kein Konto, keine Tracker. Alle Daten bleiben im Browser (localStorage).

## Funktionen

- **Übungen:** Liegestütze, Kniebeugen, Dips, Klimmzüge als Hauptauswahl auf der Startseite; eigene Übungen als Nebenoption.
- **Fitnesstest (Setup beim ersten Start):** Übung wählen → Anleitung „So viele saubere Wiederholungen wie möglich bis zum Muskelversagen“ → Countdown 3, 2, 1 mit Ton und Ansage → „Start“, große laufende Zeit → „Stopp“ → Anzahl eingeben (Stepper oder Zahlenfeld) → Plan-Vorschau mit 3 Phasen → speichern → nächste Übung testen oder „Fertig“. Gespeichert werden Maximum, Datum und Testdauer (ergibt das Tempo in s/Wdh. für die Zeitschätzung). „Ohne Test: Maximum eingeben“ und „Überspringen“ sind möglich.
- **Fitnesstest wiederholen:** jederzeit über „Fitnesstest wiederholen“ auf der Startseite, im Editor und unter „Mehr → Fitnesstest“ (je Übung). Ein neuer Wert berechnet die Phasen neu; gespeicherte Anpassungen werden proportional umgerechnet.
- **EDT-Plan aus Fitnesstest** (abschaltbar, Formel im Editor sichtbar, Satzgröße, Phasenzahl 2/3 und Variante der letzten Phase einstellbar; manuelle Phasenänderung schaltet die Automatik ab). Die Plan-Vorschau zeigt die Herkunft, z. B. „Aus Fitnesstest: max 25 Liegestütze am 30.10.2026 · Stufe Mittel“.
- **Workout-Editor:** Zeitlimit 1–60 min, bis zu 4 Phasen mit Zeitraum je Phase (Wdh. pro Satz, Pause, Sätze; letzte Phase „bis Zeitende“), Zählweise (Satz bestätigen / jede Wdh. tippen), Auto-Anpassung während des Trainings (Wdh. senken, Pause verlängern oder beides, mit Mindest-Wdh.).
- **Vorlagen (3 Phasen):** Liegestütz-EDT 5 min, Liegestütze 5 min – Pausen steigen, Kniebeugen-EDT 10 min, Dips-EDT 6 min, Klimmzug-EDT 8 min.
- **Training:** großer Gesamt-Countdown mit Fortschrittsbalken und Phasenmarken, „Phase 1/3 · Satz 2/4 · gesamt 2“, Ziel-Wdh., Knopf „Satz geschafft“ über das untere Drittel, +/- für Teilsätze, danach Pausen-Countdown mit Ring. Letzten Satz in der Pause korrigierbar und bewertbar, Pause überspringbar. Gesamt-Wdh., Hochrechnung aufs Zeitende und Vergleich mit dem Bestwert. Endet die Zeit während eines Satzes, wird der Teilsatz abgefragt.
- **Audio/Haptik:** deutsche Sprachansagen („3, 2, 1“, „Start“, „Pause 15 Sekunden“, „Neue Phase …“, „Noch eine Minute“), Pieptöne (WebAudio), Vibration (wo verfügbar), Wake Lock.
- **Ergebnis & Verlauf:** Gesamt-Wdh., Sätze, Wdh./Minute, Balkendiagramm pro Satz, Bestwert je Workout, Fortschrittskurve, Maximalwerte je Übung. Fitnesstest-Empfehlung, wenn der Bestwert um ≥ 10 % steigt oder der letzte Test älter als 4 Wochen ist. Export/Import als JSON (auch alte RepZeit-Exporte).
- **Robustheit:** Timer rechnet mit Zeitstempeln (`Date.now()`) – kein Drift, korrekt nach Tab im Hintergrund oder Display-Sperre. Laufendes Training wird nach Neuladen fortgesetzt.

## Phasen-Zeiträume und Optimierung

- **Plan-Vorschau** (nach „Start“, vor dem Countdown): jede Phase mit Zeitraum, z. B. `Phase 1 · 0:00–2:20 · 10 Wdh / 15 s Pause, Sätze 1–4`. Zeitleiste oben, Phasen-Editor darunter: Phasen hinzufügen/entfernen (max. 4), je Phase „Start ab Satz“, Wdh. und Pause per Stepper; Zeiträume aktualisieren sich sofort. Geänderte Phasen werden beim Start pro Übung gespeichert.
- **Tempo:** Satzdauer = Wdh. × Tempo + Pause. Reihenfolge: gemessen aus den letzten Einheiten (Median, ab 3 vollen Sätzen) → aus dem Fitnesstest (Testdauer / Wdh., 0,8–8 s) → Schätzung (Liegestütze 2 s, Kniebeugen 2 s, Dips 2,5 s, Klimmzüge 3 s, eigene 2,5 s).
- **Satz-Bewertung** in jeder Pause: geschafft / knapp / nicht geschafft.
- **Anpassungsregel** nach dem Training (`suggestTune`), „Übernehmen“ speichert pro Übung (`localStorage` `edt.tunes`):
  - Erster nicht geschaffter Satz X (Phase k): Phase k+1 ab Satz X−1, alternativ Wdh. in Phase k −10 % (mind. −1). In der letzten Phase: Wdh. dort senken.
  - Alle Sätze „geschafft“: Phase 2 startet 2 Sätze später, alternativ Pause Phase 2 −5 s. Phase 2 nicht erreicht: Pause Phase 1 −5 s.
  - Einzelne „knapp“: Plan bleibt. Abgebrochen oder < 3 Sätze: kein Vorschlag.

## EDT-Plan aus dem Fitnesstest: Formel

```
Satzgröße   = 40 % × Maximum (einstellbar 20–80 %), mindestens 1
Stufe       = nach Maximum je Übung:
              Liegestütze  Mittel ab 15, Fortgeschritten ab 35
              Kniebeugen   Mittel ab 25, Fortgeschritten ab 50
              Dips         Mittel ab 8,  Fortgeschritten ab 20
              Klimmzüge    Mittel ab 5,  Fortgeschritten ab 12
Pause P1    = Einsteiger 25 s · Mittel 15 s · Fortgeschritten 10 s       × Übungsfaktor  (frisch, kurz)
Pause P2    = Pause P1 + Schritt (Einsteiger 10 s, sonst 5 s)            × Übungsfaktor
Phase 3     = „Weniger Wdh.“ (Standard): 80 % der Satzgröße bei Pause P2
              oder „Pause länger“: gleiche Satzgröße, Pause P1 + 2 × Schritt
Sätze       = Phase 1 ≈ 45 %, Phase 2 ≈ 30 %, Phase 3 ≈ 25 % des Zeitlimits
              (Satzdauer = Wdh. × Tempo + Pause), mind. 1 Satz je Phase → alle 3 Phasen werden erreicht
Übungsfaktor= Klimmzüge 1,5 · Dips 1,25 · sonst 1; Pausen auf 5 s gerundet
2 Phasen    = optional: Phase 1 ≈ 60 %, Phase 2 = Variante bis Zeitende
```

Beispiel: Fitnesstest 25 Liegestütze (Stufe Mittel), 5 min, 2 s/Wdh.:

```
Phase 1 · 0:00–2:20 · 10 Wdh / 15 s Pause, Sätze 1–4
Phase 2 · 2:20–3:40 · 10 Wdh / 20 s Pause, Sätze 5–6
Phase 3 · 3:40–5:00 · 8 Wdh / 20 s Pause, Sätze 7–9
```

Begründung (Praxisregeln, keine Studienwerte): Viele Sätze deutlich unter dem Maximum halten die Wiederholungsqualität über die ganze Zeit; 40–50 % des Maximums ist eine verbreitete Faustregel. Phase 1 nutzt die frische Phase mit kurzer Pause, Phase 2 und 3 fangen die Ermüdung mit längerer Pause bzw. kleineren Sätzen ab. Klimmzüge und Dips belasten pro Wiederholung mehr, daher der Pausenfaktor. Alle Werte sind Startpunkte und im Editor überschreibbar.

## Erholung je Muskelgruppe (v1.3.0)

Das Maximum aus dem Fitnesstest gilt für **erholte** Muskeln. Direkt nach einem Satz bis zum Muskelversagen sind die beteiligten Muskeln ermüdet; ein EDT mit Satzgrößen aus dem Maximum würde dann zu früh scheitern.

| Abstand (gleiche oder überlappende Muskelgruppe) | Standard |
|---|---|
| Fitnesstest → erstes EDT | 10 min |
| EDT → EDT | 10 min |
| Fitnesstest → Fitnesstest | 10 min |

Alle Werte sind unter **Mehr → Erholung** änderbar (0–60 min).

**Begründung:** Nach einem Satz bis zum Versagen ist ein großer Teil der Kraft nach wenigen Minuten zurück, die volle Wiederholungszahl aber erst nach längerer Pause. 10 min sind ein praxistauglicher Mindestabstand innerhalb einer Einheit. Die beste Grundlage ist ein Fitnesstest am Vortag, vor allem vor intensiven Trainingstagen.

**Muskelgruppen:** Liegestütze und Dips = Brust/Trizeps/Schulter (überlappen), Kniebeugen = Beine, Klimmzüge = Rücken/Bizeps. Eigene Übungen: Gruppe im Editor wählbar, Standard „eigene“ (keine Überlappung mit anderen Übungen). Andere Gruppen sind sofort frei, z. B. morgens Liegestütze, mittags Kniebeugen, abends Klimmzüge.

**Anzeige:** Hinweis mit Countdown nach dem Fitnesstest (zeitstempelbasiert, übersteht Neuladen), Status „erholt“/„Erholung noch m:ss“ auf Startseite und Plan, optional Meldung per Ton + Sprache und, falls erlaubt, Benachrichtigung, sobald die Gruppe erholt ist.

**Trotzdem starten:** Satzgrößen werden nur für diese Einheit reduziert:

```
Faktor = 1 − 0,20 × min(1, Restzeit / Erholungszeit)
Wdh. pro Satz = max(1, runden(Wdh. × Faktor))
```

Beispiel: 8 von 10 min fehlen → −16 % → 10 → 8 Wdh. Die Einheit wird als „verkürzte Erholung“ markiert, zählt nicht für die Phasen-Anpassung und ändert weder Maximum noch gespeicherte Anpassung.

## Umbenennung RepZeit → EDT Timer (v1.2.0)

- Repository `thundertiger187/repzeit` → `thundertiger187/edt-timer`. Unter `thundertiger187/repzeit` liegt nur noch eine Weiterleitung (`index.html`, `404.html` für Unterpfade, `sw.js` zum Abmelden des alten Service Workers).
- Daten: alte Schlüssel `repzeit.*` werden beim ersten Start nach `edt.*` kopiert (gleiche Origin `thundertiger187.github.io`); die alten Einträge bleiben als Sicherung erhalten.

## Technik

Vanilla JS (ES-Module), keine Abhängigkeiten zur Laufzeit. `src/` → `node tools/build.mjs` → `dist/` (Version-Stempel für Service-Worker-Cache).

- `src/engine.js` – reine Ablauf-Logik (Phasen, Sätze, Zeitende, Auto-Anpassung, Fitnesstest-Plan), ohne DOM
- `src/app.js` – Oberfläche, `src/audio.js` – Ton/Sprache/Vibration/Wake Lock, `src/store.js` – Speicherung
- `src/sw.js` – Offline-Cache

```
npm run build        # dist/ bauen
npm test             # Unit-Tests (node:test)
npm run test:e2e     # E2E (Playwright, Fake-Clock); optional URL: node tests/e2e.mjs x run icons        # PNG-Icons aus icon.svg erzeugen
```

Deployment: Inhalt von `dist/` im Branch `gh-pages` (GitHub Pages).

## Auf dem echten Handy prüfen

- iOS: Sprachausgabe erst nach erstem Tippen („Start“); im Home-Bildschirm-Modus testen. Stummschalter kann Töne unterdrücken (ab iOS 17 wird `audioSession` auf „playback“ gesetzt).
- iOS: Vibration nicht verfügbar (Safari unterstützt `navigator.vibrate` nicht).
- Wake Lock: iOS ab 16.4, Android Chrome. Bei Display-Sperre pausiert der Browser Ansagen; der Timer rechnet nach dem Entsperren korrekt weiter.
