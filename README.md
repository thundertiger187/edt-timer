# RepZeit – Density-/EDT-Timer mit Cluster-Sätzen

**App:** https://thundertiger187.github.io/repzeit/

Ziel: maximale Wiederholungen in einem Zeitlimit. Das Workout läuft in Blöcken: Satz (z. B. 10 Liegestütze) → feste Pause (z. B. 15 s) → nächster Satz … Nach N Runden wechselt die Phase automatisch (längere Pause oder weniger Wiederholungen). Optional passt die App die folgenden Sätze an, wenn ein Satz nicht geschafft wird.

PWA: installierbar (iOS Safari: Teilen → „Zum Home-Bildschirm“, Android Chrome: „App installieren“), offline nutzbar, kein Server, kein Konto, keine Tracker. Alle Daten bleiben im Browser (localStorage).

## Funktionen

- **Übungen:** Liegestütze, Kniebeugen, Dips, Klimmzüge als Hauptauswahl auf der Startseite; eigene Übungen als Nebenoption.
- **Einstufung:** Pro Übung beim ersten Mal die Frage „Wie viele … schaffst du maximal am Stück?“ – Zahl eingeben oder geführter Maximaltest mit Zählknopf. Jederzeit neu testbar. Maximalwerte werden gespeichert und im Verlauf gezeigt.
- **Plan aus Maximum** (abschaltbar, Formel im Editor sichtbar, Satzgröße überschreibbar; manuelle Phasenänderung schaltet die Automatik ab).
- **Workout-Editor:** Zeitlimit 1–60 min, bis zu 4 Phasen mit Zeitraum je Phase (Wdh. pro Satz, Pause, Runden; letzte Phase „bis Zeitende“), Zählweise (Satz bestätigen / jede Wdh. tippen), Auto-Anpassung (Wdh. um X senken, Pause um Y s verlängern oder beides, mit Mindest-Wdh.). Planwert-Simulation mit dem Tempo der Übung (gemessen oder Schätzung).
- **Vorlagen:** Liegestütz-Dichte 5 min (10 Wdh./15 s ×6, dann 10 Wdh./20 s bis Ende), Liegestütze 5 min – Wdh. sinken, Kniebeugen-Dichte 10 min, Dips-Dichte 6 min, Klimmzug-EDT 8 min.
- **Training:** großer Gesamt-Countdown mit Fortschrittsbalken, Phase/Runde/Satz, Ziel-Wdh., Knopf „Satz geschafft“ über das untere Drittel, +/- für Teilsätze, danach automatisch Pausen-Countdown mit Ring. Letzten Satz in der Pause korrigierbar, Pause überspringbar. Gesamt-Wdh., Hochrechnung aufs Zeitende und Vergleich mit dem Bestwert zum gleichen Zeitpunkt. Endet die Zeit während eines Satzes, wird der Teilsatz abgefragt (große Zahlentasten).
- **Audio/Haptik:** deutsche Sprachansagen (SpeechSynthesis: „Los“, „Pause 15 Sekunden“, „Noch 3, 2, 1“, „Neue Phase: 20 Sekunden Pause“, „Noch eine Minute“), Pieptöne (WebAudio), Vibration (wo verfügbar), Wake Lock. Ton im Training direkt an/aus.
- **Ergebnis & Verlauf:** Gesamt-Wdh., Sätze, Wdh./Minute, Balkendiagramm pro Satz, Bestwert je Workout, Fortschrittskurve, Maximalwerte je Übung. Nach dem Training Vorschlag für einen Neutest, wenn der Bestwert um ≥ 10 % steigt oder der letzte Test älter als 4 Wochen ist. Export/Import als JSON.
- **Robustheit:** Timer rechnet mit Zeitstempeln (`Date.now()`), nicht durch Zählen von Intervallen – kein Drift, korrekt nach Tab im Hintergrund oder Display-Sperre. Laufendes Training wird gespeichert und nach Neuladen fortgesetzt.

## Phasen-Zeiträume und Optimierung

- **Plan-Vorschau** (nach „Start“, vor dem Countdown): jede Phase mit Zeitraum, z. B. `Phase 1 · 0:00–3:30 · 10 Wdh / 15 s Pause, Runden 1–6`. Zeitleiste oben, Phasen-Editor darunter: Phasen hinzufügen/entfernen (max. 4), je Phase „Start ab Runde“, Wdh. und Pause per Stepper; Zeiträume aktualisieren sich sofort. Geänderte Phasen werden beim Start pro Übung gespeichert.
- **Schätzung:** Satzdauer = Wdh. × Tempo + Pause. Tempo: Liegestütze 2 s, Kniebeugen 2 s, Dips 2,5 s, Klimmzüge 3 s, eigene 2,5 s pro Wdh. (`SEC_PER_REP` in `engine.js`). Sobald aus den letzten 3 Einheiten der Übung mindestens 3 volle Sätze vorliegen, gilt der Median der gemessenen Satzdauer pro Wdh. Die letzte erreichte Phase endet beim Zeitlimit; Phasen, die im Limit nicht beginnen, sind „nicht erreicht“.
- **Im Training:** Phasenmarken im Fortschrittsbalken und Zeiträume P1/P2 …, live aus den bisherigen Satzzeiten neu geschätzt.
- **Satz-Bewertung** in jeder Pause: geschafft / knapp / nicht geschafft (Standard: weniger Wdh. als Ziel = nicht geschafft).
- **Anpassungsregel** nach dem Training (`suggestTune`), Vorschlag auf dem Ergebnis-Screen, „Übernehmen“ speichert pro Übung (`localStorage` `repzeit.tunes`):
  - Erster nicht geschaffter Satz in Runde X (Phase k; Teilsatz am Zeitende zählt nicht): Phase k+1 ab Runde X−1, alternativ Wdh. in Phase k −10 % (mind. −1). In der letzten Phase: Wdh. dort senken. Nur eine Phase: ab Runde X−1 neue Phase 2 mit 80 % Wdh.
  - Alle Sätze „geschafft“: Phase 2 startet 2 Runden später, alternativ Pause Phase 2 −5 s (nicht unter Pause Phase 1). Phase 2 nicht erreicht: Pause Phase 1 −5 s (mind. 5 s).
  - Einzelne „knapp“: Plan bleibt. Abgebrochen oder < 3 Sätze: kein Vorschlag.
  - Bei neuem Maximum werden die Wdh. der gespeicherten Anpassung proportional umgerechnet.

## Einstufung: Formel und Begründung

```
Satzgröße   = Satzgröße-% × Maximum (Standard 40 %, einstellbar 20–80 %), mindestens 1
Stufe       = nach Maximum je Übung:
              Liegestütze  Mittel ab 15, Fortgeschritten ab 35
              Kniebeugen   Mittel ab 25, Fortgeschritten ab 50
              Dips         Mittel ab 8,  Fortgeschritten ab 20
              Klimmzüge    Mittel ab 5,  Fortgeschritten ab 12
              eigene       Mittel ab 10, Fortgeschritten ab 25
Pause Ph. 1 = Einsteiger 25 s · Mittel 15 s · Fortgeschritten 10 s  × Übungsfaktor
Runden Ph.1 = Einsteiger 5 · Mittel 6 · Fortgeschritten 8
Phase 2     = „Pause länger“: +10 s (Einsteiger) bzw. +5 s, × Übungsfaktor
              oder „Weniger Wdh.“: 80 % der Satzgröße bei gleicher Pause
Übungsfaktor= Klimmzüge 1,5 · Dips 1,25 · sonst 1; Pausen auf 5 s gerundet
```

Beispiel: Maximum 25 Liegestütze → Stufe Mittel → 10 Wdh., 15 s Pause ×6, danach 20 s bis Zeitende.

Begründung (Praxisregeln, keine Studienwerte): Bei Dichte-Training sollen viele Sätze deutlich unter dem Maximum bleiben, damit die Wiederholungsqualität über die ganze Zeit hält; 40–50 % des Maximums ist eine verbreitete Faustregel für Cluster-/„Grease the Groove“-artige Sätze. Wer weniger kann, braucht relativ mehr Erholung pro Satz (längere Pause, weniger Runden vor dem Phasenwechsel); Fortgeschrittene kommen mit kürzeren Pausen aus. Klimmzüge und Dips belasten pro Wiederholung mehr (größerer Anteil des Körpergewichts), daher der Pausenfaktor. Die 2. Phase fängt die Ermüdung ab. Alle Werte sind Startpunkte – im Editor überschreibbar.

## Technik

Vanilla JS (ES-Module), keine Abhängigkeiten zur Laufzeit. `src/` → `node tools/build.mjs` → `dist/` (Version-Stempel für Service-Worker-Cache).

- `src/engine.js` – reine Ablauf-Logik (Phasen, Runden, Zeitende, Auto-Anpassung, Einstufung), ohne DOM
- `src/app.js` – Oberfläche, `src/audio.js` – Ton/Sprache/Vibration/Wake Lock, `src/store.js` – Speicherung
- `src/sw.js` – Offline-Cache

```
npm run build        # dist/ bauen
npm test             # Unit-Tests (node:test)
npm run test:e2e     # E2E (Playwright, Fake-Clock); optional URL: node tests/e2e.mjs https://thundertiger187.github.io/repzeit/
npm run icons        # PNG-Icons aus icon.svg erzeugen
```

Deployment: Inhalt von `dist/` im Branch `gh-pages` (GitHub Pages).

## Auf dem echten Handy prüfen

- iOS: Sprachausgabe erst nach erstem Tippen („Start“); im Home-Bildschirm-Modus testen. Stummschalter kann Töne unterdrücken (ab iOS 17 wird `audioSession` auf „playback“ gesetzt).
- iOS: Vibration nicht verfügbar (Safari unterstützt `navigator.vibrate` nicht).
- Wake Lock: iOS ab 16.4, Android Chrome. Bei Display-Sperre pausiert der Browser Ansagen; der Timer rechnet nach dem Entsperren korrekt weiter.
