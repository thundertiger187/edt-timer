# EDT Timer – Escalating Density Training mit Cluster-Sätzen

**App:** https://thundertiger187.github.io/edt-timer/
(Die alte Adresse https://thundertiger187.github.io/repzeit/ leitet hierher weiter; gespeicherte Daten werden übernommen.)

![QR-Code zur App](qr.png)

Ziel: maximale Wiederholungen in einem Zeitlimit. Das Workout läuft in Blöcken: Satz (z. B. 10 Liegestütze) → feste Pause (z. B. 15 s) → nächster Satz … Nach N Sätzen wechselt die Phase automatisch (längere Pause oder weniger Wiederholungen). Standard sind 3 Phasen, abgeleitet aus einem Fitnesstest.

PWA: installierbar (iOS Safari: Teilen → „Zum Home-Bildschirm“, Android Chrome: „App installieren“), offline nutzbar, kein Server, kein Konto, keine Tracker. Alle Daten bleiben im Browser (localStorage).

## Funktionen

- **Übungen:** 8 Grundübungen als Kacheln auf der Startseite (Liegestütze, Kniebeugen, Dips, Klimmzüge, Ausfallschritte, Beckenheben, Superman, Sit-ups), dahinter eigene Übungen als eigene Kacheln (seit v1.8.0).
- **Fitnesstest (Setup beim ersten Start):** Übung wählen → Anleitung „So viele saubere Wiederholungen wie möglich bis zum Muskelversagen“ → Countdown 3, 2, 1 mit Ton und Ansage → „Start“, große laufende Zeit → „Stopp“ → Anzahl eingeben (Stepper oder Zahlenfeld) → Plan-Vorschau mit 3 Phasen → speichern → nächste Übung testen oder „Fertig“. Gespeichert werden Maximum, Datum und Testdauer (ergibt das Tempo in s/Wdh. für die Zeitschätzung). „Ohne Test: Maximum eingeben“ und „Überspringen“ sind möglich.
- **Fitnesstest wiederholen:** jederzeit über „Fitnesstest wiederholen“ auf der Startseite, im Editor und unter „Mehr → Fitnesstest“ (je Übung). Ein neuer Wert berechnet die Phasen neu; gespeicherte Anpassungen werden proportional umgerechnet.
- **EDT-Plan aus Fitnesstest** (abschaltbar, Formel im Editor sichtbar, Satzgröße, Phasenzahl 2/3 und Variante der letzten Phase einstellbar; manuelle Phasenänderung schaltet die Automatik ab). Die Plan-Vorschau zeigt die Herkunft, z. B. „Aus Fitnesstest: max 25 Liegestütze am 30.10.2026 · Stufe Mittel“.
- **Workout-Editor:** Zeitlimit 1–60 min, bis zu 4 Phasen mit Zeitraum je Phase (Wdh. pro Satz, Pause, Sätze; letzte Phase „bis Zeitende“), Zählweise (Satz bestätigen / jede Wdh. tippen), Auto-Anpassung während des Trainings (Wdh. senken, Pause verlängern oder beides, mit Mindest-Wdh.).
- **Vorlagen (3 Phasen):** Liegestütz-EDT 5 min, Liegestütze 5 min – Pausen steigen, Kniebeugen-EDT 10 min, Dips-EDT 6 min, Klimmzug-EDT 8 min, Ausfallschritte-EDT 5 min, Beckenheben-EDT 5 min, Superman-EDT 5 min, Sit-up-EDT 5 min.
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

## Satz-Ansicht ohne Überlappung (v1.8.1)

- **Fehler:** Auf Android (Chrome mit Adressleiste, ≈ 412×780 CSS-px) lagen im Kombi-Satz „Runde 1 · Schritt 1/2 · gesamt 1“ und „10 Liegestütze“ übereinander, und „Danach: …“ verschwand unter dem grünen Knopf. Ursache: Der mittlere Bereich (`.work`) durfte kleiner werden als sein Inhalt (`flex-basis:0`, `min-height:0`, zentriert), während „Satz geschafft“ fest 38 % der Höhe belegte. Bei wenig Höhe lief der Inhalt nach oben und unten über. Der normale EDT-Satz hatte denselben Fehler ab etwa 720 px Höhe.
- **Lösung:** Reiner Fluss ohne absolute Positionen. `.work` ist nie kleiner als sein Inhalt (`flex:1 0 auto`) und zentriert nur im übrigen Platz. „Satz geschafft“ hat eine feste Höhe von `clamp(88px, 13dvh, 110px)`, bei ≤ 700 px Höhe 80–96 px. Bei „Tippen“-Zählung ist der Knopf mit 120–200 px absichtlich größer, „Stopp“ im Fitnesstest ist 96–130 px hoch. Reicht der Platz trotzdem nicht (z. B. große Systemschrift), scrollt die Ansicht, statt zu überlappen. Im Querformat steht der Knopf mittig in der rechten Spalte und ist höchstens 200 px hoch.
- **Tests:** `tests/e2e-layout.mjs` läuft zusätzlich auf 412×780 und 412×720. Für den Kombi-Satz prüft der Test die Reihenfolge Positionszeile → Übung → „tatsächlich geschafft“ → Zähler → „Danach“ → Knopf, dass nichts verdeckt ist (`elementFromPoint`), die Knopfhöhe (80–112 px) und dass nicht gescrollt werden muss. Das gilt auch für den normalen Satz. Screenshots: `screens/90_kombi_training_fix.png` (412×915), `screens/91_kombi_training_360.png`.

## Neue Grundübungen und eigene Übungen als Kacheln (v1.8.0)

- **Neue Grundübungen:** Ausfallschritte, Beckenheben, Superman, Sit-ups. Jede hat eine Muskelgruppe, ein Strichmännchen (Kachel, Panel, Fitnesstest-Anleitung), eine 5-min-Vorlage (Auto-Plan aus), Level-Schwellen für den Fitnesstest und ein Tempo für die Zeitschätzung. Sie funktionieren überall wie die bisherigen vier: Erholung, Fitnesstest, Phasen, Rekorde, Diagramm, Wochenplan, Kombi.
  - Muskelgruppen: Ausfallschritte = Beine + Gesäß, Beckenheben = Gesäß/hinterer Oberschenkel, Superman = Unterer Rücken, Sit-ups = Bauch. Überschneidungen für die Erholung: Kniebeugen ↔ Ausfallschritte (Beine), Ausfallschritte ↔ Beckenheben (Gesäß). Kniebeugen und Beckenheben teilen sich keine Gruppe.
  - Ausfallschritte: Gezählt wird jeder Schritt, links und rechts im Wechsel (steht in der Fitnesstest-Anleitung).
- **Startseite „Übungen“:** Kompakte Kacheln in 2 Spalten (Figur links neben dem Namen, darunter „Max am Stück“ und „Rekord 5 min“ als Zeilen). Reihenfolge: Liegestütze | Kniebeugen, Dips | Klimmzüge, Ausfallschritte | Beckenheben, Superman | Sit-ups, danach die eigenen Übungen in Anlege-Reihenfolge und ganz unten „+ Eigene Übung“. Lange Namen werden weich getrennt („Ausfall-schritte“) und höchstens zweizeilig gesetzt. Geprüft auf 360×640, 375×667, 390×844, 412×915 und 844×390 (`tests/e2e-layout.mjs`).
- **Eigene Übungen als Kacheln:** Jede eigene Übung hat eine eigene Kachel mit Namen. Statt Figur steht ein neutrales Kürzel (Anfangsbuchstaben, gestrichelter Rahmen). Tippen öffnet dasselbe Panel wie bei Grundübungen: Fitnesstest-Box, Workouts, „+ Neues Workout“ und zusätzlich die Zeile „Eigene Übung · …“ mit „Übung bearbeiten“. Anders als bei Grundübungen wird beim ersten Öffnen kein Fitnesstest erzwungen.
  - **Anlegen:** „+ Eigene Übung“ → Name (max. 40 Zeichen) und Muskelgruppe (Brust/Trizeps/Schulter, Rücken/Bizeps, Beine, Gesäß/hint. Oberschenkel, Unterer Rücken, Bauch oder „Nur diese Übung“). Abgelehnt werden: leerer Name, Namen von Grundübungen (auch „Situps“, „Glute Bridge“ …), doppelte Namen, Namen ohne Buchstaben. Alternativ entsteht eine eigene Übung weiterhin im Workout-Editor über „Neue …“.
  - **Bearbeiten:** Umbenennen ändert auch Workouts, Kombis, Verlauf, Fitnesstest-Werte und Phasen-Anpassungen. Die Muskelgruppe gilt auch für die Workouts der Übung.
  - **Löschen:** nur, wenn keine Kombi die Übung nutzt (sonst Hinweis mit Kombi-Name). Nach Rückfrage werden die Übung, ihre Workouts und deren Wochenplan-Einträge entfernt. Verlauf und Fitnesstest-Werte bleiben.
  - Gespeichert unter `edt.exercises` (`{id, name, muscle}`), enthalten in Export/Import.
- **Eigene Übungen in der Kombi:** Im Kombi-Editor stehen alle Grund- und eigenen Übungen als Chips (eigene gestrichelt). Training, Ansage („Pause 20 Sekunden. Nächster Satz: 5 Burpees“), Ergebnis, Verlauf (Kombi-Filter) und Erholung funktionieren damit. Eine eigene Übung mit „Nur diese Übung“ bekommt eine eigene Erholungsgruppe, blockiert also keine andere Übung.
- **Migration:** Beim ersten Start von 1.8.0 werden alle `edt.*`-Daten einmal nach `edt.backup-1.8.0` gesichert (nur wenn schon Workouts existieren). Danach:
  - Eigene Übungen, die einer neuen Grundübung entsprechen, werden umbenannt („Situps“/„Sit ups“ → Sit-ups, „Glute Bridge“ → Beckenheben, „Lunges“/„Ausfallschritt“ → Ausfallschritte), in Workouts, Verlauf, Maxima, Anpassungen und Kombis. Gleichnamige Maxima werden zusammengeführt. Die App meldet das einmal („Jetzt Grundübung: Situps → Sit-ups“).
  - Alle übrigen eigenen Übungen aus Workouts und Kombis werden zu Kacheln (`edt.exercises`), mit der Muskelgruppe aus dem Workout.
  - Fehlende Vorlagen der vier neuen Übungen werden ergänzt. Vorhandene Workouts bleiben unverändert.
  - Die frühere Zeile „Eigene Übungen“ (`exSel: '__own'`) gibt es nicht mehr.
- **Weitere Änderungen:** Die Rekord-Zeile auf den Workout-Karten eigener Übungen entfällt, weil Rekord und Erholung jetzt auf der Kachel stehen. Der Erholungstext unter „Mehr“ nennt die neuen Überschneidungen.
- **Tests:** `tests/store.test.mjs` (Upgrade, Sicherung, Umbenennen, Export/Import), neue Fälle in `tests/engine.test.mjs` und `tests/week.test.mjs` (Segmentlängen der neuen Figuren). E2E: `tests/e2e-uebungen.mjs` (Kacheln, Panels, Anlegen/Umbenennen/Löschen, Migration aus 1.7.0, Screenshots 80–85), `tests/e2e-combo.mjs` (eigene Übung als Kombi-Schritt), `tests/e2e-layout.mjs` (Startseite auf allen Größen).

## Kombi-Training und Diagramm Regulär/Kombi/Gesamt (v1.7.0)

- **Wo:** Startseite „Training“, Abschnitt **Kombi** direkt unter „Übungen“. Ohne Kombi steht dort ein leerer Zustand mit „Kombi anlegen“, sonst eine Karte je Kombi (Schritte, Dauer, Bestwert, Erholung) mit „Bearbeiten“ und „Start“ sowie „+ Kombi“ in der Überschrift.
- **Anlegen/Bearbeiten:** Bottom-Sheet wie die übrigen Editoren, keine neue Seite. Name, 2–4 Schritte in fester Reihenfolge (Übung als Chip, Wiederholungen, Pause danach in Sekunden, ↑ zum Verschieben, ✕ zum Löschen, „+ Schritt“), Dauer als Chip 5/10/15/20 min oder „Ohne Limit“ mit Rundenzahl. Darunter eine Schätzung (Dauer einer Runde, Runden bzw. Gesamtdauer). Gespeichert in `localStorage` unter `edt.combos`, enthalten in Export/Import.
- **Vorgabe:** Wiederholungen = 40 % des Fitnesstest-Max (`edt.maxes`), gerundet, mindestens 1, ohne Test 5. Eine neue Kombi startet als „Push & Pull“ (Liegestütze + Klimmzüge, 20 s Pause, 10 min). Es gibt keine gespeicherte Vorlage, weil Kombis nicht im Vorlagen-Speicher der Workouts liegen.
- **Training:** derselbe Timer und dieselbe Engine (Vorlauf, „Satz geschafft“, Pausenring, Überspringen, Abbrechen, Teil-Satz bei Zeitende, Ergebnis). Die aktuelle Übung steht groß („12 Liegestütze“), darunter der nächste Schritt. In der Pause steht „Als Nächstes: 4 Klimmzüge“. Ansagen: „Pause 20 Sekunden. Nächster Satz: 4 Klimmzüge“, dann 3-2-1 und „Los: 4 Klimmzüge“. Bei „Ohne Limit“ läuft die Uhr hoch, nach der letzten Runde ist ohne weitere Pause Schluss (Sicherheitsgrenze 4 h). Der Fortschrittsbalken zeigt dann die Sätze.
- **Erholung:** Vor dem Start erscheint die Erholungswarnung für alle beteiligten Muskelgruppen (eine Uhr je Gruppe). „Trotzdem starten“ verkleinert die Sätze der betroffenen Schritte. Nach dem Training läuft die Erholung für jede beteiligte Gruppe. Mehrere Erholungs-Erinnerungen können gleichzeitig laufen.
- **Verlauf:** ein Eintrag je Einheit mit `type: 'combo'`, `comboId`, `name`, `perEx` (Wdh. je Übung), `steps` und `sets` (jeder Satz mit `ex`). `exercise` ist `null`. Dadurch zählen Kombis **nicht** für „Rekord 5 min“, Bestwerte und Tempo der einzelnen Übungen. „Zuletzt“ und der Verlauf zeigen den Namen mit dem Etikett „Kombi“. Das Ergebnis zeigt Summen je Übung und gesamt.
- **Diagramm:** Umschalter **Regulär | Kombi | Gesamt**, Standard Regulär.
  - **Regulär:** wie bisher, nur Einzel-Einheiten.
  - **Kombi:** nur Kombi-Einheiten. Übungsfilter: „Alle“ ergibt Summe pro Tag, eine einzelne Übung deren Wdh. pro Kombi-Einheit. Dauer-Chips inkl. „Ohne Limit“.
  - **Gesamt:** Einzel- und Kombi-Einheiten. Die **Dauer wird ignoriert** und die Wiederholungen je Tag werden addiert (bei gewählter Übung nur deren Wdh.). Grund: Eine 5-min-Einzel-Einheit und eine 10-min-Kombi lassen sich nicht pro Einheit vergleichen, die Tagessumme beschreibt das Volumen aber für beide.
  - Jeder Modus hat einen eigenen leeren Zustand und Wochenvergleich.
- **Wochenplan:** Kombis lassen sich als Plan-Eintrag wählen (Gruppe „Kombi“). Die Abstandsprüfung nutzt alle Muskelgruppen der Kombi.
- **Tests:** `tests/e2e-combo.mjs` (Anlegen über die UI, Ablauf mit Fake-Clock, Ansagen, Pausen, Zeitende, Verlauf, Kacheln, Diagramm, Erholung). `tests/e2e-layout.mjs` prüft zusätzlich Kombi-Satz und -Pause auf allen Größen.

## Pause-Layout, Animationen-Einstellung und Updates (v1.6.1)

- **Pause-Ring ohne Überlappung:** Der Ring sitzt in einer eigenen Fläche (`.ringbox`, Container-Query) und nimmt nur den Platz, der nach Statistik, Bewertung, „Letzter Satz“ und Buttons übrig bleibt (`width: min(60vw, 240px, 100cqh, 100cqw)`). Alle anderen Elemente bleiben im normalen Fluss. Bei niedrigen Bildschirmen (≤ 700 px) wird kompakter gesetzt. Im Querformat (Höhe ≤ 520 px) zeigt der Timer drei Spalten. Getestet auf 360×640, 375×667, 390×844, 412×915 und 844×390, jeweils für Vorlauf, Satz, Pause mit Hochrechnung und Fitnesstest (`tests/e2e-layout.mjs`, prüft, dass sich keine `getBoundingClientRect` überschneiden).
- **Mehr → Animationen:** Automatisch / An / Aus, Standard **An**. Grund für „An“: Energiesparmodi sowie „Animationen entfernen“ (Android) und „Bewegung reduzieren“ (iOS) setzen `prefers-reduced-motion` oft, ohne dass man es merkt. Dann waren in 1.6.0 alle Effekte aus. „Automatisch“ folgt der Systemeinstellung. Ist sie aktiv, gibt es nur sanfte Überblendungen (Deckkraft) ohne Bewegung: keine Verschiebung, kein Skalieren, keine Ziffern-Animation, und die Figuren bleiben statisch. „Aus“ schaltet alle Animationen ab. Technisch: `html[data-motion=full|gentle|off]`. Ohne JS greift die Media-Query.
- **Updates:** Der Service Worker lädt Seitenaufrufe zuerst aus dem Netz (`no-cache`, nach 4 s Fallback auf den Cache). Die Dateien sind über den Build-Hash versioniert (`app.js?v=HASH`, auch alle Modul-Importe) und werden beim Installieren mit `cache: 'reload'` am HTTP-Cache vorbei geholt. Außerdem nutzt er `skipWaiting` und `clients.claim`. Kommt eine neue Version, lädt die App automatisch neu. Läuft gerade ein Training, erscheint stattdessen „Neue Version verfügbar“ mit „Neu laden“. Beim Zurückkehren in die App (auch iOS-Homescreen, `pageshow`) wird nach Updates gesucht. Die Version steht unter Mehr → Installieren, daneben „Nach neuer Version suchen“.
- **Sichtbarere Effekte:** Glow mit größerem Radius und höherer Deckkraft (0,46–0,72, 0,6 s). Hintergrund kräftiger, aber dunkel: Der Kontrast von gedämpftem Text liegt überall bei ≥ 4,5:1 (WCAG AA, gemessen 4,66–4,81). Einblenden über 20 px, Ziffern-Animation 1,2 s.

## Bewegung und Effekte (v1.6.0)

Alles in reinem CSS/JS (`src/fx.js`), nur `transform`/`opacity`, gesteuert über `requestAnimationFrame` bzw. CSS-Animationen. Bei „Bewegung reduzieren“ im System ist alles aus oder statisch.

- **Leuchtpunkt beim Tippen:** Ein runder Schein erscheint an der Tippposition auf Kacheln, Karten und Buttons und verblasst in rund 0,5 s. Er ist auf Karten cyan, auf Start-Buttons grün. Er liegt in einer eigenen Ebene ohne Zeigerereignisse (`.fx-layer`, `pointer-events:none`), Tippen und Scrollen bleiben unverändert.
- **Ziffern-Effekt im Ergebnis:** Gesamtwiederholungen, Sätze, Wdh./Minute und Dauer zeigen beim Öffnen rund 1 s Zufallsziffern und rasten dann von links nach rechts auf den echten Wert ein. Der echte Wert steht die ganze Zeit im Text, die Zufallsziffern sind nur ein Pseudo-Inhalt ohne Alternativtext. Screenreader und Kopieren liefern deshalb sofort den richtigen Wert.
- **„Neuer Rekord“:** Ist eine 5-min-Einheit besser als alle früheren 5-min-Einheiten der Übung, steht „Neuer Rekord · 5 min · vorher X“ über der Zahl. Ein anderer neuer Bestwert im Workout zeigt weiter „Neuer Bestwert“. Nach dem Einrasten leuchtet die Zahl kurz auf.
- **Einblenden beim Scrollen:** Abschnitte und Karten auf Start, Woche und Verlauf gleiten beim Öffnen der Ansicht mit 14 px Versatz und Überblendung, 40–50 ms gestaffelt, ein (IntersectionObserver, einmal pro Ansichtswechsel). Der sichtbare Bereich ist nach höchstens rund 300 ms vollständig da. Versteckt wird nur über die Klasse `.rv`, die das Skript setzt. Ohne JS oder ohne IntersectionObserver bleibt alles sichtbar.
- **Fließender Hintergrund:** Hinter dem Kopf der Startseite und hinter dem laufenden Timer bewegen sich sehr dunkle Farbflächen in 24–37 s langen Schleifen. Sie sind im Satz grünlich und in der Pause cyan, mit 1,2 s Überblendung beim Phasenwechsel. Ist die Seite verborgen, wird pausiert. Die Timer-Uhr bleibt davon unberührt.
- **Tests:** `tests/e2e-fx.mjs` prüft u. a. das Glow-Element bei `pointerdown`, das exakte Endergebnis und den aria-Wert des Ziffern-Effekts, das Abschalten bei reduzierter Bewegung und die Sichtbarkeit ohne IntersectionObserver. Mit `--video` entsteht zusätzlich `screens/1.6.0_demo.mp4`.

## Startseite „Training“ und Entwicklung im Verlauf (v1.5.0)
- Startseite mit drei Bereichen: **Heute** (Karte für die nächste Einheit mit einem Start-Button, weitere Einheiten des Tages als Zeilen, Woche als Punkte; ohne Wochenplan das zuletzt trainierte Workout und „Wochenplan anlegen“), **Übungen** (2×2 Kacheln + „Eigene Übungen“; Tippen klappt darunter ein Panel mit Fitnesstest, Workouts und „+ Neues Workout“ auf, erneutes Tippen klappt zu, nur eines offen) und **Zuletzt** (zwei letzte Einheiten).
- Kacheln: „Max am Stück“ (Fitnesstest) und „Rekord 5 min“ (beste abgeschlossene 5-min-Einheit, auch mit verkürzter Erholung; „–“ wenn keine). „Erholung noch m:ss“ nur solange nötig.
- Tabs: Training / Woche / Verlauf / Mehr. Timer: grünliche Tönung im Satz, cyan in der Pause; Hochrechnung ab Satz 3.
- Verlauf → „Entwicklung · 30 Tage“: Wdh. pro Einheit (beste Einheit je Tag) für die gewählte Übung oder „Alle“ (Summe je Tag). Es werden nur Einheiten mit **gleicher Zeitvorgabe** verglichen (Standard: häufigste Dauer im Zeitraum, Auswahl per Chip). Fitnesstests als cyan Rauten auf eigener rechter Achse, Trend = gleitender Durchschnitt über 3 Punkte. Die Zeile „±x % Wdh. ggü. erster Woche“ vergleicht den Durchschnitt der ersten 7 Tage mit dem der letzten 7 Tage, nur wenn sich beide Wochen nicht überschneiden.

## Wochenplan und Erinnerungen (v1.4.0)

- **Tab „Wochenplan“:** pro Wochentag beliebig viele Einträge (Uhrzeit + Workout). Vorlagen: „Täglich 3×“ (08:00 Liegestütze, 13:00 Kniebeugen, 19:00 Klimmzüge) und „Mo/Mi/Fr 3×“. „Kopieren“ übernimmt einen Tag auf andere Tage (Zieltage werden ersetzt).
- **Abstandsprüfung:** Einträge am selben Tag mit gleicher oder überlappender Muskelgruppe brauchen nach dem Ende der ersten Einheit mindestens „Pause zwischen EDTs“ (Standard 10 min, unter Mehr → Erholung). Beispiel: 08:00 Liegestütz-EDT 5 min und 08:10 Dips → „nur 5 min Pause“.
- **Startseite „Heute“:** Einträge des Tages mit Erholungsstatus, nächste Einheit hervorgehoben, „Start“ öffnet den Plan und startet sofort (bei laufender Erholung erscheint der Warndialog). Erledigte Einträge werden automatisch abgehakt: eine gespeicherte Einheit desselben Workouts (oder derselben Übung) am selben Tag zählt für den frühesten noch offenen Eintrag. Darunter die Woche Mo–So mit erledigt/geplant.
- **Kalender (.ics):** „In den Kalender übernehmen“ teilt die Datei (Web Share) oder lädt `edt-wochenplan.ics` herunter. Pro Eintrag ein wöchentlich wiederkehrender Termin (`RRULE:FREQ=WEEKLY;BYDAY=…`) in `TZID=Europe/Berlin` (mit VTIMEZONE), Dauer = Zeitlimit + 5 min, Erinnerung zur Startzeit und optional 5/10/15/30 min vorher, Link `…/edt-timer/?w=<Workout>` öffnet direkt den Plan. Jeder Eintrag behält seine UID (`edt-<id>@edt-timer`), der Export zählt `SEQUENCE` hoch: erneuter Import aktualisiert die Termine statt sie zu verdoppeln; gelöschte Einträge werden als `STATUS:CANCELLED` mitgeschickt. Nach Änderungen zeigt die App „Neu exportieren“.
- **In-App-Erinnerung** (abschaltbar): Toast, Ton und Ansage zur Startzeit und X min vorher; mit Erlaubnis zusätzlich System-Benachrichtigung über den Service Worker (Erlaubnis wird erst beim Tippen angefragt). Funktioniert nur, solange die App offen ist oder im Hintergrund läuft – ohne Server gibt es keinen Push. Für Erinnerungen bei geschlossener App: In den Kalender übernehmen.
- Der Wochenplan ist im JSON-Export/Import enthalten (`plan`).

## Strichmännchen (v1.4.0)

Animierte SVG-Figuren für Liegestütze, Kniebeugen, Dips (Barren/Stühle) und Klimmzüge (Stange) in den Übungskacheln, groß im Fitnesstest-Anleitungsscreen und klein im Plan und im Wochenplan. Pose aus Gelenkwinkeln mit festen Segmentlängen (Oberarm, Unterarm, Oberschenkel, Unterschenkel, Rumpf), Arme über Zwei-Gelenk-IK an Boden/Barren/Stange fixiert; eine Wiederholung ≈ 2 s (ab- und aufwärts, Kosinus-Verlauf), Endlosschleife per `requestAnimationFrame`, läuft nur, solange Figuren angezeigt werden (im Hintergrund pausiert der Browser sie). Bei `prefers-reduced-motion: reduce` statisch: Startposition blass, Endposition kräftig. Eigene Übungen: neutrales Hantel-Icon. Frames: `screens/fig_<übung>_start.png` / `_ende.png`.

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
- `src/week.js` – Wochenplan, Abstandsprüfung, Kalender-Export (.ics), ohne DOM
- `src/figures.js` – Strichmännchen (SVG, Gelenk-Keyframes, eigene Animation ohne Bibliothek)
- `src/sw.js` – Offline-Cache, Klick auf Benachrichtigung öffnet die App

```
npm run build        # dist/ bauen
npm test             # Unit-Tests (node:test)
npm run test:e2e     # E2E (Playwright, Fake-Clock); optional URL: node tests/e2e.mjs <URL>
node tests/e2e-week.mjs [URL]   # E2E Wochenplan, Kalender, Erinnerung, Strichmännchen
node tests/e2e-combo.mjs [URL]  # E2E Kombi-Training
npm run icons        # PNG-Icons aus icon.svg erzeugen
```

Deployment: Inhalt von `dist/` im Branch `gh-pages` (GitHub Pages).

## Auf dem echten Handy prüfen

- iOS: Sprachausgabe erst nach erstem Tippen („Start“); im Home-Bildschirm-Modus testen. Stummschalter kann Töne unterdrücken (ab iOS 17 wird `audioSession` auf „playback“ gesetzt).
- iOS: Vibration nicht verfügbar (Safari unterstützt `navigator.vibrate` nicht).
- Wake Lock: iOS ab 16.4, Android Chrome. Bei Display-Sperre pausiert der Browser Ansagen; der Timer rechnet nach dem Entsperren korrekt weiter.
