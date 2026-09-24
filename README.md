# Milenas Mirror – Deployment auf Cloudflare Pages

## Wichtiger Hinweis zum Login

Cloudflare Access (die Zugriffskontrolle) funktioniert **nicht** mit einem frei
wählbaren Namen + Passwort. Es gibt zwei Möglichkeiten:

- **E-Mail-Code (Standard, kostenlos):** Du hinterlegst deine E-Mail-Adresse.
  Beim Öffnen der Seite bekommst du einen Code per Mail, den du eingibst.
  Kein Passwort zum Merken, aber ein zusätzlicher Schritt pro Login.
- **Google/GitHub-Login:** Du meldest dich mit einem bestehenden Google- oder
  GitHub-Konto an. Auch kostenlos, ein Klick, kein Code nötig.

Ein klassisches "Name: ... / Passwort: ..." bietet Cloudflare Access nicht an.
Du richtest in beiden Fällen genau **deine** E-Mail-Adresse (oder dein
Google-Konto) als einzigen erlaubten Zugang ein — niemand sonst kommt rein.

---

## 1. Voraussetzungen

- Ein kostenloser Account auf https://dash.cloudflare.com
- Node.js auf deinem Rechner installiert (https://nodejs.org)
- Diese Projektdateien entpackt in einem Ordner

## 2. Projekt lokal vorbereiten

Im Projektordner, per Terminal:

```
npm install
npm run build
```

Das erzeugt einen `dist`-Ordner mit der fertigen Website.

## 3. Bei Cloudflare hochladen

Am einfachsten über das Cloudflare-Dashboard (kein Kommandozeilen-Tool nötig):

1. Gehe zu https://dash.cloudflare.com → **Workers & Pages** → **Erstellen**
2. Wähle **Pages** → **Projekt direkt hochladen**
3. Lade den Inhalt des `dist`-Ordners hoch
4. Projektname vergeben (z.B. `my-mirror`) → **Bereitstellen**

Du bekommst eine URL wie `my-mirror.pages.dev` — die App läuft.

**Wichtig:** Die Functions (`functions/api/analyze.js`) werden bei "Projekt
direkt hochladen" nicht automatisch mit übernommen. Für die KI-Funktion ist
die Git-Anbindung der zuverlässigere Weg:

1. Lade das ganze Projekt (nicht nur `dist`) in ein GitHub-Repository hoch
2. In Cloudflare: **Workers & Pages** → **Erstellen** → **Pages** →
   **Git-Repository verbinden**
3. Build-Einstellungen: Build-Befehl `npm run build`, Ausgabe-Verzeichnis `dist`
4. Bereitstellen — Cloudflare baut die Seite und bindet die Functions automatisch mit ein

## 4. AI-Bindung

Gute Nachricht: Die AI-Bindung ist jetzt direkt in `wrangler.jsonc` hinterlegt
(`"ai": { "binding": "AI" }`). Cloudflare richtet sie beim Deployment
automatisch ein — der frühere manuelle Schritt im Dashboard entfällt.

Damit funktioniert `/api/analyze` und alle KI-Auswertungen in der App —
komplett kostenlos im Rahmen des täglichen Freikontingents (10.000 "Neurons"
pro Tag), ganz ohne eigenen API-Key.

## 5. Zugriffsschutz mit Cloudflare Access einrichten

1. Im Cloudflare-Dashboard: **Zero Trust** (linke Seitenleiste) öffnen —
   beim ersten Mal wirst du durch eine kurze kostenlose Einrichtung geführt
2. **Access** → **Applications** → **Add an application** → **Self-hosted**
3. Domain auswählen: deine `*.pages.dev`-Adresse (oder eigene Domain, falls
   verbunden)
4. Bei **Policies**: neue Policy erstellen, z.B. "Nur ich"
   - Include: **Emails** → deine eigene E-Mail-Adresse eintragen
5. Bei **Login methods**: **One-time PIN** ist meist schon aktiv (E-Mail-Code).
   Für Google-Login zusätzlich unter **Settings → Authentication** den
   Google-Login als Identity Provider hinzufügen
6. Speichern

Ab jetzt verlangt die Seite bei jedem Aufruf eine Anmeldung mit genau der
E-Mail-Adresse, die du eingetragen hast.

## 6. Fertig — als "App" nutzen

Öffne die `.pages.dev`-URL (oder deine eigene Domain) auf dem Handy im
Browser und wähle "Zum Home-Bildschirm hinzufügen" — dann hast du ein
eigenes App-Icon.

---

## Was sich gegenüber der Claude-Artefakt-Version geändert hat

- Speicherung läuft jetzt über den Browser (`localStorage`) statt über
  Claude — deine Daten bleiben lokal auf dem jeweiligen Gerät/Browser.
- Die KI-Auswertungen laufen über ein offenes Modell (Llama 4) via
  Cloudflare Workers AI statt über Claude — Qualität und Tonfall können
  dadurch etwas anders ausfallen.
- Updates an der App bekommst du weiterhin über den Chat mit Claude — ich
  aktualisiere dann diese Dateien, du lädst sie erneut hoch (bzw. pusht sie
  bei Git-Anbindung, dann baut Cloudflare automatisch neu).
