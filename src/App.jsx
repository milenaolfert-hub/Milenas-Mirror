import { useState, useEffect, useMemo, useRef } from "react";
import {
  BookOpen, Activity, Dumbbell, CheckSquare, Square, TrendingUp, ArrowUp, ArrowDown, Scale, Sun, Moon, Heart, ChevronLeft, ChevronRight, ChevronDown, ChevronUp,
  Upload, Trash2, Sparkles, Plus, RefreshCw, Footprints, Calendar, Target, MapPin, MoreVertical,
} from "lucide-react";
import {
  ResponsiveContainer, BarChart, Bar, XAxis, YAxis, CartesianGrid,
  LineChart, Line, Tooltip,
} from "recharts";

// ---------- helpers ----------

// Liefert das heutige Datum in der lokalen Zeitzone des Nutzers, nicht in UTC
// (toISOString() würde je nach Zeitzone einen Tag zu früh/spät liefern).
const todayISO = () => {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
};
// Neue IDs bevorzugen crypto.randomUUID (kollisionssicherer); bestehende, bereits
// gespeicherte IDs bleiben davon unberührt, da sie nie neu erzeugt werden.
const uid = () =>
  (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function")
    ? crypto.randomUUID()
    : Math.random().toString(36).slice(2) + Date.now().toString(36);
const DAY = 24 * 3600 * 1000;

function formatDateLong(iso) {
  const d = new Date(iso);
  return d.toLocaleDateString("de-DE", { weekday: "long", day: "2-digit", month: "long", year: "numeric" });
}
function formatDateShort(iso) {
  const d = new Date(iso);
  return d.toLocaleDateString("de-DE", { day: "2-digit", month: "2-digit", year: "2-digit" });
}
function formatDateTime(iso) {
  const d = new Date(iso);
  return d.toLocaleDateString("de-DE", { day: "2-digit", month: "2-digit" }) + ", " + d.toLocaleTimeString("de-DE", { hour: "2-digit", minute: "2-digit" });
}
function formatDuration(sec) {
  if (!sec || sec <= 0) return "–";
  const h = Math.floor(sec / 3600);
  const m = Math.floor((sec % 3600) / 60);
  const s = Math.round(sec % 60);
  if (h > 0) return `${h}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
  return `${m}:${String(s).padStart(2, "0")}`;
}
function paceMinPerKm(distanceKm, durationSec) {
  if (!distanceKm || !durationSec) return null;
  return durationSec / 60 / distanceKm;
}
function formatPace(pace) {
  if (pace == null || !isFinite(pace)) return "–";
  const m = Math.floor(pace);
  const s = Math.round((pace - m) * 60);
  return `${m}:${String(s).padStart(2, "0")} min/km`;
}
function parseDurationInput(str) {
  // Erlaubt ausschließlich "MM:SS" oder "H:MM:SS" mit Sekunden/Minuten 0–59,
  // keine Buchstaben, keine negativen Werte, keine zusätzlichen Bestandteile.
  if (typeof str !== "string") return null;
  const mmss = /^(\d{1,3}):([0-5]\d)$/.exec(str.trim());
  if (mmss) {
    const minutes = parseInt(mmss[1], 10);
    const seconds = parseInt(mmss[2], 10);
    return minutes * 60 + seconds;
  }
  const hmmss = /^(\d{1,2}):([0-5]\d):([0-5]\d)$/.exec(str.trim());
  if (hmmss) {
    const hours = parseInt(hmmss[1], 10);
    const minutes = parseInt(hmmss[2], 10);
    const seconds = parseInt(hmmss[3], 10);
    return hours * 3600 + minutes * 60 + seconds;
  }
  return null;
}
function readFileAsText(file) {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(r.result);
    r.onerror = () => reject(r.error);
    r.readAsText(file);
  });
}
// ---------- Validierung ----------
// Zentrale, wiederverwendbare Hilfsfunktionen. Wandeln ungültige Eingaben NICHT
// stillschweigend in 0 um, sondern geben null zurück, damit der aufrufende Code
// selbst entscheiden kann, ob ein Wert übernommen oder abgelehnt wird.

function parsePositiveNumber(value, { max } = {}) {
  if (value === "" || value === null || value === undefined) return null;
  const n = parseFloat(String(value).replace(",", "."));
  if (!isFinite(n) || n <= 0) return null;
  if (max != null && n > max) return null;
  return n;
}

function parseNonNegativeNumber(value, { max } = {}) {
  if (value === "" || value === null || value === undefined) return null;
  const n = parseFloat(String(value).replace(",", "."));
  if (!isFinite(n) || n < 0) return null;
  if (max != null && n > max) return null;
  return n;
}

function parseIntegerInRange(value, min, max) {
  if (value === "" || value === null || value === undefined) return null;
  const n = parseInt(value, 10);
  if (!Number.isFinite(n)) return null;
  if (min != null && n < min) return null;
  if (max != null && n > max) return null;
  return n;
}

function clampNumber(n, min, max) {
  return Math.min(max, Math.max(min, n));
}

function validateDate(dateStr) {
  // Strikt für das Format "YYYY-MM-DD" (so wie es <input type="date"> liefert).
  // new Date("2026-02-31") würde von JS stillschweigend in den März überlaufen —
  // das wird hier bewusst abgelehnt, statt es als gültig durchzulassen.
  if (typeof dateStr !== "string") return false;
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(dateStr);
  if (!m) return false;
  const year = parseInt(m[1], 10);
  const month = parseInt(m[2], 10);
  const day = parseInt(m[3], 10);
  if (month < 1 || month > 12) return false;
  const daysInMonth = new Date(year, month, 0).getDate();
  if (day < 1 || day > daysInMonth) return false;
  return true;
}

function combineDateAndTime(dateStr, timeStr) {
  // Baut aus "YYYY-MM-DD" + "HH:MM" ein lokales Date-Objekt (kein UTC-Sprung).
  const dt = new Date(`${dateStr}T${timeStr}`);
  return isNaN(dt.getTime()) ? null : dt;
}

// ---------- Storage-Abstraktion ----------
// Bündelt den Zugriff auf window.storage (die in dieser Umgebung bereitgestellte
// Speicher-API) an einer Stelle, statt window.storage.get/set über die ganze App
// verteilt aufzurufen. Fehler werden geloggt und als Ergebnis zurückgegeben, statt
// sie in einem leeren catch{} zu verschlucken. localStorage dient nur als Fallback,
// falls window.storage in einer Umgebung einmal nicht existiert.
const storage = {
  // Hosting-Version: läuft über localStorage (window.storage gibt es nur in Claude-Artefakten).
  async get(key) {
    try {
      if (typeof localStorage === "undefined") return null;
      const v = localStorage.getItem(key);
      return v !== null ? { key, value: v } : null;
    } catch (error) {
      console.error(`Storage-Lesefehler für "${key}":`, error);
      return null;
    }
  },
  async set(key, value) {
    try {
      if (typeof localStorage === "undefined") {
        console.error(`Kein Speicher verfügbar, um "${key}" zu sichern.`);
        return false;
      }
      localStorage.setItem(key, value);
      return true;
    } catch (error) {
      console.error(`Storage-Schreibfehler für "${key}":`, error);
      return false;
    }
  },
};

// Bündelt "Wert holen + JSON parsen" für alle Ladevorgänge beim Start. Beschädigte
// oder nicht mehr lesbare gespeicherte Daten führen zu einer Konsolenmeldung und
// einem sicheren Fallback statt zu einem Absturz.
async function loadJSON(key, fallback) {
  const res = await storage.get(key);
  if (!res) return fallback;
  try {
    return JSON.parse(res.value);
  } catch (error) {
    console.error(`Gespeicherte Daten für "${key}" sind beschädigt und werden ignoriert:`, error);
    return fallback;
  }
}

// Bündelt "JSON serialisieren + speichern" für alle persistX-Funktionen.
// Gibt true/false zurück, damit der Aufrufer einen Fehler sichtbar machen kann.
async function saveJSON(key, value) {
  return storage.set(key, JSON.stringify(value));
}

async function askClaude(prompt, maxTokens) {
  // Ruft den eigenen Cloudflare-Worker auf (worker/index.js) — kein API-Key im Frontend.
  const response = await fetch("/api/analyze", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ prompt, maxTokens }),
  });
  if (!response.ok) {
    console.error(`KI-Anfrage fehlgeschlagen: HTTP ${response.status}`);
    throw new Error(`KI-Anfrage fehlgeschlagen (${response.status})`);
  }
  const data = await response.json();
  return data.text || "";
}

const CATEGORIES = [
  { key: "Reflexion", color: "var(--forest)" },
  { key: "Ziel", color: "var(--ochre)" },
  { key: "Notiz", color: "var(--muted)" },
];

function colorVar(name) {
  return { muted: "var(--muted)", green: "var(--forest)", amber: "var(--ochre)", red: "var(--red)" }[name] || "var(--muted)";
}

// Einklapp- und löschbare Anzeige für KI-Kurzanalysen — überall im Dashboard gleich,
// damit sich die Texte nicht auftürmen, wenn viele davon existieren.
// Zählt eine Zahl beim Erscheinen/Ändern sanft von ihrem letzten Wert zum neuen hoch,
// statt sie abrupt hinzuklatschen. formatter bekommt den aktuellen (gerundeten) Wert.
function AnimatedNumber({ value, formatter = (n) => n, duration = 600 }) {
  const [display, setDisplay] = useState(value);
  const fromRef = useRef(value);

  useEffect(() => {
    if (value == null) { setDisplay(value); return; }
    const from = fromRef.current ?? value;
    const start = performance.now();
    let raf;
    function tick(now) {
      const t = Math.min(1, (now - start) / duration);
      const eased = 1 - Math.pow(1 - t, 3);
      setDisplay(from + (value - from) * eased);
      if (t < 1) raf = requestAnimationFrame(tick);
      else fromRef.current = value;
    }
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value]);

  if (value == null) return null;
  return <>{formatter(Math.round(display))}</>;
}

function AnalysisDisplay({ text, generatedAt, busy, onRefresh, onDelete }) {
  const [open, setOpen] = useState(false);
  return (
    <div style={{ marginTop: 10 }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8, flexWrap: "wrap" }}>
        <button className="dash-btn dash-btn-sm" onClick={() => setOpen((v) => !v)}>
          {open ? <ChevronUp size={13} /> : <ChevronDown size={13} />} Kurzanalyse
        </button>
        <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
          {onRefresh && (
            <button className="dash-btn dash-btn-sm" onClick={onRefresh} disabled={busy}>
              <RefreshCw size={13} /> {busy ? "…" : "Aktualisieren"}
            </button>
          )}
          <button className="dash-del" onClick={onDelete} title="Kurzanalyse löschen"><Trash2 size={14} /></button>
        </div>
      </div>
      {busy && <SkeletonLines />}
      <div className={`dash-collapse${open ? " dash-collapse-open" : ""}`}>
        <div className="dash-collapse-inner">
          <div className="dash-analysis">{text}</div>
          {generatedAt && <div style={{ fontSize: 12, color: "var(--muted)", marginTop: 6 }}>Stand {formatDateTime(generatedAt)}</div>}
        </div>
      </div>
    </div>
  );
}

// ---------- Trainingsstatus ----------
// Ersetzt die frühere "Formkurve"-Prozentzahl. Statt einer einzigen, schwer erklärbaren
// Zahl werden nur Aussagen gebildet, für die tatsächlich Daten vorhanden sind — jede
// Aussage zeigt die Zahlen, auf denen sie beruht. Fehlen Daten, wird das offen gesagt
// statt geschätzt. Kein medizinischer oder physiologischer Messwert.

const HR_EASY_MAX = 0.80; // Ø-Puls unter 80 % des höchsten gemessenen Pulses = locker
const HR_HARD_MIN = 0.88; // Ø-Puls über 88 % = hart (dazwischen: mittel)

function runTime(r) {
  const t = new Date(r.date).getTime();
  return isNaN(t) ? null : t;
}
function isValidRun(r) {
  return !!r && r.distanceKm > 0 && r.durationSec > 0 && runTime(r) != null;
}
function avgOf(values) {
  return values.length ? values.reduce((s, v) => s + v, 0) / values.length : null;
}
function fmtMinutes(min) {
  const h = Math.floor(min / 60);
  const m = Math.round(min % 60);
  return h ? `${h} h ${m} min` : `${m} min`;
}
function fmtNum(n, digits = 1) {
  return n.toFixed(digits).replace(".", ",");
}

// Wie viel des Wochenziels aus dem Trainingsplan diese Woche erreicht ist.
function computePlanAdherence(runs, plan) {
  if (!plan || !(plan.targetKmPerWeek > 0 || plan.targetRunsPerWeek > 0)) return null;
  const w = weekWindow(0, new Date());
  const weekRuns = runs.filter(isValidRun).filter((r) => { const d = new Date(r.date); return d >= w.start && d < w.end; });
  const weekKm = weekRuns.reduce((s, r) => s + r.distanceKm, 0);
  const ratios = [];
  if (plan.targetKmPerWeek > 0) ratios.push(Math.min(1, weekKm / plan.targetKmPerWeek));
  if (plan.targetRunsPerWeek > 0) ratios.push(Math.min(1, weekRuns.length / plan.targetRunsPerWeek));
  return { score: Math.round(avgOf(ratios) * 100), weekKm, weekRuns: weekRuns.length };
}

function computeTrainingStatus({ runs = [], gymSessions = [], sleepEntries = [], plan = null }) {
  const now = Date.now();
  const ago = (t) => now - t;
  const valid = runs.filter(isValidRun).filter((r) => runTime(r) <= now);
  const between = (list, fromDays, toDays) =>
    list.filter((r) => { const a = ago(runTime(r)); return a >= fromDays * DAY && a < toDays * DAY; });
  const last7 = between(valid, 0, 7);
  const last28 = between(valid, 0, 28);
  const findings = [];
  const missing = [];

  // 1. Regelmäßigkeit
  const lastRun = valid.reduce((m, r) => (!m || runTime(r) > runTime(m) ? r : m), null);
  // Kalendertage (nicht 24-h-Blöcke): ein Lauf von vorgestern Abend ist "vor 2 Tagen".
  const startOfDay = (t) => { const d = new Date(t); d.setHours(0, 0, 0, 0); return d.getTime(); };
  const daysSinceRun = lastRun ? Math.round((startOfDay(now) - startOfDay(runTime(lastRun))) / DAY) : null;
  if (lastRun) {
    findings.push({
      key: "rhythm", label: "Regelmäßigkeit", tone: "neutral",
      value: `${fmtNum(last28.length / 4)} Läufe/Woche`,
      detail: `Letzte 4 Wochen: ${last28.length} Läufe · letzter Lauf vor ${daysSinceRun} ${daysSinceRun === 1 ? "Tag" : "Tagen"}`,
    });
  } else {
    missing.push("Noch keine Läufe erfasst");
  }

  // 2. Umfang: Laufminuten der letzten 7 Tage vs. Wochenschnitt der letzten 4 Wochen
  let volume = null;
  const weeksActive = [0, 1, 2, 3].filter((w) => between(valid, w * 7, w * 7 + 7).length > 0).length;
  const min7 = last7.reduce((s, r) => s + r.durationSec, 0) / 60;
  const km7 = last7.reduce((s, r) => s + r.distanceKm, 0);
  const minWeek28 = last28.reduce((s, r) => s + r.durationSec, 0) / 60 / 4;
  const kmWeek28 = last28.reduce((s, r) => s + r.distanceKm, 0) / 4;
  if (last28.length >= 3 && weeksActive >= 2 && minWeek28 > 0) {
    const ratio = min7 / minWeek28;
    const level = ratio > 1.5 ? "sprung" : ratio > 1.25 ? "steigend" : ratio >= 0.8 ? "stabil" : ratio > 0 ? "ruhiger" : "pause";
    volume = { ratio, level };
    findings.push({
      key: "volume", label: "Umfang (7 Tage)",
      tone: level === "sprung" ? "warn" : level === "stabil" ? "good" : "neutral",
      value: { sprung: "deutlich mehr als üblich", steigend: "etwas mehr als üblich", stabil: "im gewohnten Rahmen", ruhiger: "weniger als üblich", pause: "keine Läufe" }[level],
      detail: `${fmtMinutes(min7)} · ${fmtNum(km7)} km — Schnitt der letzten 4 Wochen: ${fmtMinutes(minWeek28)} · ${fmtNum(kmWeek28)} km pro Woche`,
    });
  } else if (valid.length) {
    missing.push("Umfang-Vergleich: braucht mindestens 3 Läufe verteilt auf 2 der letzten 4 Wochen");
  }

  // 3. Intensität: Einordnung jedes Laufs über seinen Ø-Puls, gewichtet nach Laufzeit
  const hrValues = valid.flatMap((r) => [r.hrMax, r.hrAvg]).filter((v) => typeof v === "number" && v > 60 && v < 240);
  const hrRef = hrValues.length ? Math.max(...hrValues) : null;
  const hr28 = last28.filter((r) => typeof r.hrAvg === "number" && r.hrAvg > 0);
  let intensity = null;
  if (hrRef && hr28.length >= 2) {
    let easy = 0, mid = 0, hard = 0;
    hr28.forEach((r) => {
      const m = r.durationSec / 60;
      const p = r.hrAvg / hrRef;
      if (p < HR_EASY_MAX) easy += m; else if (p <= HR_HARD_MIN) mid += m; else hard += m;
    });
    const total = easy + mid + hard;
    intensity = { easy: easy / total, mid: mid / total, hard: hard / total };
    findings.push({
      key: "intensity", label: "Intensität (4 Wochen)",
      tone: intensity.hard >= 0.5 ? "warn" : intensity.easy >= 0.6 ? "good" : "neutral",
      value: `${Math.round(intensity.hard * 100)} % hart`,
      detail: `Nach Laufzeit, aus ${hr28.length} Läufen mit Herzfrequenz · Bezug: dein höchster gemessener Puls (${hrRef} bpm)`,
      bar: intensity,
    });
  } else {
    missing.push(hrRef
      ? "Intensität: braucht mindestens 2 Läufe mit Herzfrequenz in den letzten 4 Wochen"
      : "Keine Herzfrequenzdaten — Intensität nicht bewertbar");
  }

  // 4. Effizienz: Meter pro Herzschlag bei ruhigen/mittleren Läufen ab 3 km.
  // Harte Läufe bleiben bewusst außen vor, weil der Wert sonst vor allem das Tempo misst.
  const efRuns = hrRef
    ? valid.filter((r) => typeof r.hrAvg === "number" && r.hrAvg > 0 && r.distanceKm >= 3 && r.hrAvg / hrRef <= HR_HARD_MIN)
    : [];
  const ef = (r) => (r.distanceKm * 1000) / (r.durationSec / 60) / r.hrAvg;
  const efRecent = efRuns.filter((r) => ago(runTime(r)) < 28 * DAY);
  const efEarlier = efRuns.filter((r) => { const a = ago(runTime(r)); return a >= 28 * DAY && a < 84 * DAY; });
  if (efRecent.length >= 2 && efEarlier.length >= 2) {
    const a = avgOf(efRecent.map(ef));
    const b = avgOf(efEarlier.map(ef));
    const change = a / b - 1;
    findings.push({
      key: "efficiency", label: "Laufeffizienz",
      tone: change > 0.03 ? "good" : change < -0.03 ? "warn" : "neutral",
      value: change > 0.03 ? "verbessert" : change < -0.03 ? "gesunken" : "unverändert",
      detail: `${fmtNum(a, 2)} m pro Herzschlag (letzte 4 Wochen, ${efRecent.length} Läufe) vs. ${fmtNum(b, 2)} davor (${efEarlier.length} Läufe) · ${change >= 0 ? "+" : ""}${Math.round(change * 100)} % — Wärme, Gelände und Tagesform beeinflussen den Wert`,
    });
  } else {
    missing.push("Laufeffizienz: braucht je 2 ruhige Läufe ab 3 km mit Herzfrequenz — in den letzten 4 Wochen und in den 8 Wochen davor");
  }

  // 5. Gefühlte Anstrengung (nur wenn eingetragen)
  const rpe28 = last28.filter((r) => typeof r.rpe === "number" && r.rpe >= 1 && r.rpe <= 5);
  if (rpe28.length >= 2) {
    const rpeAvg = avgOf(rpe28.map((r) => r.rpe));
    findings.push({
      key: "rpe", label: "Gefühlte Anstrengung", tone: rpeAvg >= 4 ? "warn" : "neutral",
      value: `Ø ${fmtNum(rpeAvg)} / 5`, detail: `Aus ${rpe28.length} Läufen der letzten 4 Wochen, bei denen du sie eingetragen hast`,
    });
  }

  // 6. Krafttraining
  const gymValid = gymSessions.filter((s) => s && !isNaN(new Date(s.date).getTime()) && new Date(s.date).getTime() <= now);
  const gymIn = (from, to) => gymValid.filter((s) => { const a = ago(new Date(s.date).getTime()); return a >= from * DAY && a < to * DAY; });
  const gym7 = gymIn(0, 7).length;
  const gym28 = gymIn(0, 28).length;
  if (gym28 > 0) {
    const rated = gymIn(0, 28).filter((g) => typeof g.difficulty === "number");
    const bad = gymIn(0, 28).filter((g) => g.feeling === "schlecht").length;
    const extra = (rated.length ? ` · Anstrengung Ø ${fmtNum(avgOf(rated.map((g) => g.difficulty)))} / 5 (${rated.length} bewertet)` : "")
      + (bad ? ` · ${bad}× schlechtes Befinden` : "");
    findings.push({
      key: "gym", label: "Krafttraining", tone: bad >= 2 ? "warn" : "neutral",
      value: `${gym7} in 7 Tagen`, detail: `Ø ${fmtNum(gym28 / 4)} Trainings pro Woche in den letzten 4 Wochen${extra}`,
    });
  } else {
    missing.push(gymValid.length ? "Kein Krafttraining in den letzten 4 Wochen erfasst" : "Noch kein Krafttraining erfasst");
  }

  // 7. Schlaf
  const nights = sleepEntries
    .filter((e) => e && e.type !== "nap" && e.bedTime && e.wakeTime && ago(new Date(e.wakeTime).getTime()) < 7 * DAY)
    .map((e) => ({ dur: sleepDurationSec(e), fit: e.fitness }))
    .filter((n) => n.dur);
  let sleepShort = false;
  if (nights.length >= 2) {
    const hours = avgOf(nights.map((n) => n.dur)) / 3600;
    const fits = nights.map((n) => n.fit).filter((f) => typeof f === "number");
    sleepShort = hours < 6.5;
    findings.push({
      key: "sleep", label: "Schlaf (7 Tage)", tone: sleepShort ? "warn" : hours >= 7 ? "good" : "neutral",
      value: `Ø ${fmtNum(hours)} h`,
      detail: `${nights.length} Nächte erfasst${fits.length ? ` · Fitness nach dem Aufwachen Ø ${fmtNum(avgOf(fits))} / 5` : ""}`,
    });
  } else {
    missing.push("Schlaf: weniger als 2 Nächte in den letzten 7 Tagen erfasst");
  }

  // 8. Trainingsplan
  const planAdherence = computePlanAdherence(runs, plan);
  if (planAdherence) {
    findings.push({
      key: "plan", label: "Trainingsplan (diese Woche)", tone: "neutral",
      value: `${planAdherence.score} % erfüllt`, detail: `${planAdherence.weekRuns} Läufe · ${fmtNum(planAdherence.weekKm)} km bisher`,
    });
  }

  // Überschrift: die wichtigste zutreffende Aussage — nur aus vorhandenen Daten
  let headline, tone;
  if (!valid.length && !gymValid.length) { headline = "Noch keine Trainingsdaten"; tone = "muted"; }
  else if (daysSinceRun != null && daysSinceRun >= 10 && gym7 === 0) { headline = `Trainingspause seit ${daysSinceRun} Tagen`; tone = "neutral"; }
  else if (volume && volume.level === "sprung") { headline = "Umfang steigt sprunghaft — Verletzungsrisiko beachten"; tone = "warn"; }
  else if (intensity && intensity.hard >= 0.5) { headline = "Viele harte Einheiten, wenig lockeres Training"; tone = "warn"; }
  else if (sleepShort) { headline = "Wenig Schlaf bei laufendem Training"; tone = "warn"; }
  else if (volume && volume.level === "stabil") { headline = "Ausgewogener Rhythmus"; tone = "good"; }
  else if (volume && volume.level === "steigend") { headline = "Umfang steigt moderat"; tone = "neutral"; }
  else if (volume && (volume.level === "ruhiger" || volume.level === "pause")) { headline = "Ruhigere Phase als sonst"; tone = "neutral"; }
  else { headline = "Noch zu wenig Daten für eine Einordnung"; tone = "muted"; }

  return { headline, tone, findings, missing, planAdherence };
}

// Kompakte Textfassung für KI-Anfragen — damit die KI mit denselben, belegten Zahlen
// arbeitet und nichts dazu erfindet.
function trainingStatusText(status) {
  const lines = [`Einordnung: ${status.headline}`];
  status.findings.forEach((f) => lines.push(`- ${f.label}: ${f.value} (${f.detail})`));
  if (status.missing.length) lines.push(`Nicht bewertbar (keine ausreichenden Daten — bitte nichts dazu annehmen): ${status.missing.join("; ")}`);
  return lines.join("\n");
}

function weeklyKmSeries(runs, weekCount) {
  const weeks = [];
  const now = new Date();
  for (let i = weekCount - 1; i >= 0; i--) {
    const ws = new Date(now);
    const dow = (ws.getDay() + 6) % 7;
    ws.setDate(ws.getDate() - dow - i * 7);
    ws.setHours(0, 0, 0, 0);
    const we = new Date(ws);
    we.setDate(we.getDate() + 7);
    const km = runs.filter((r) => { const d = new Date(r.date); return d >= ws && d < we; }).reduce((s, r) => s + r.distanceKm, 0);
    weeks.push({ label: ws.toLocaleDateString("de-DE", { day: "2-digit", month: "2-digit" }), km: Math.round(km * 10) / 10 });
  }
  return weeks;
}

// Jeder Schuh deckt den Zeitraum von seinem Startdatum bis zum Start des nächstjüngeren
// Schuhs ab (oder bis heute, falls er der aktuellste ist) — so reicht ein Datum pro Schuh.
function computeShoeStats(shoes, runs) {
  const sorted = [...shoes].sort((a, b) => new Date(a.startDate) - new Date(b.startDate));
  const now = new Date();
  return sorted.map((shoe, i) => {
    const windowStart = new Date(shoe.startDate);
    const windowEnd = sorted[i + 1] ? new Date(sorted[i + 1].startDate) : now;
    const km = runs
      .filter((r) => { const d = new Date(r.date); return d >= windowStart && d < windowEnd; })
      .reduce((s, r) => s + r.distanceKm, 0);
    const totalKm = (shoe.startingKm || 0) + km;
    const lifespan = shoe.lifespanKm || 600;
    const percent = Math.min(100, Math.round((totalKm / lifespan) * 100));
    return { ...shoe, totalKm, percent, windowStart, windowEnd, isActive: i === sorted.length - 1 };
  });
}

function weekWindow(offsetWeeks, now) {
  const ws = new Date(now);
  const dow = (ws.getDay() + 6) % 7;
  ws.setDate(ws.getDate() - dow - offsetWeeks * 7);
  ws.setHours(0, 0, 0, 0);
  const we = new Date(ws);
  we.setDate(we.getDate() + 7);
  return { start: ws, end: we };
}

// ---------- shared styles ----------

function GlobalStyles() {
  return (
    <style>{`
      @import url('https://fonts.googleapis.com/css2?family=Sora:wght@500;600&family=Inter:wght@400;500;600&family=Baloo+2:wght@500;600;700;800&display=swap');

      @keyframes fadeInUp { from { opacity: 0; transform: translateY(16px) scale(0.97); } to { opacity: 1; transform: translateY(0) scale(1); } }
      @keyframes fadeIn { from { opacity: 0; } to { opacity: 1; } }
      @keyframes scaleIn { from { opacity: 0; transform: scale(0.96); } to { opacity: 1; transform: scale(1); } }
      @media (prefers-reduced-motion: reduce) {
        *, *::before, *::after { animation-duration: 0.001ms !important; transition-duration: 0.001ms !important; }
      }

      .dash-app {
        --paper: #F2F1E7; --card: #FBFAF4; --ink: #23281F; --muted: #6B7062;
        --forest: #2F5D45; --forest-dim: #DCE6DE; --ochre: #A9781F; --ochre-dim: #EFE2C4;
        --line: #DEDACB; --red: #B0402E; --red-dim: #F1DBD5; --surface: #FFFFFF; --sky: #4E7598;
        --c-run: #2F5D45; --c-gym: #A9781F; --c-sleep: #4E7598; --int-easy: #2F5D45; --int-mid: #A9781F; --int-hard: #B0402E;
        font-family: 'Inter', -apple-system, sans-serif; color: var(--ink); background: var(--paper);
        min-height: 100%; font-variant-numeric: tabular-nums; position: relative;
      }
      .dash-app[data-theme="pink"] {
        --paper: #FFE3F3; --card: #FFF3FA; --ink: #7A1656; --muted: #B24E90;
        --forest: #FF2E93; --forest-dim: #FFD3EC; --ochre: #FF7EC4; --ochre-dim: #FFE0F2;
        --line: #FFC2E6; --red: #E6357A; --red-dim: #FFD9E8; --surface: #FFFFFF; --sky: #C084FC;
        --c-run: #FF2E93; --c-gym: #FF7EC4; --c-sleep: #C084FC; --int-easy: #FF2E93; --int-mid: #FF7EC4; --int-hard: #E6357A;
        font-family: 'Baloo 2', 'Inter', -apple-system, sans-serif;
        background-image:
          radial-gradient(circle at 10% 15%, rgba(255,255,255,0.55) 0 3px, transparent 4px),
          radial-gradient(circle at 85% 25%, rgba(255,255,255,0.55) 0 3px, transparent 4px),
          radial-gradient(circle at 50% 80%, rgba(255,255,255,0.5) 0 3px, transparent 4px),
          radial-gradient(circle at 25% 55%, rgba(255,255,255,0.45) 0 3px, transparent 4px),
          radial-gradient(circle at 75% 65%, rgba(255,255,255,0.45) 0 3px, transparent 4px);
        background-size: 220px 220px;
      }
      .dash-app[data-theme="pink"] .dash-title,
      .dash-app[data-theme="pink"] .dash-area-head h2,
      .dash-app[data-theme="pink"] .dash-area-card h3,
      .dash-app[data-theme="pink"] .dash-score-name,
      .dash-app[data-theme="pink"] .dash-score-value,
      .dash-app[data-theme="pink"] .dash-card-title,
      .dash-app[data-theme="pink"] .dash-compare-current,
      .dash-app[data-theme="pink"] .dash-shoe-name,
      .dash-app[data-theme="pink"] .dash-stat-val {
        font-family: 'Baloo 2', cursive; font-weight: 700;
      }
      .dash-app[data-theme="pink"] .dash-title { text-shadow: 2px 2px 0 #fff, 4px 4px 0 rgba(255, 46, 147, 0.25); }
      .dash-app[data-theme="pink"] .dash-title::after { content: " 💕"; }
      .dash-app[data-theme="pink"] .dash-area-card,
      .dash-app[data-theme="pink"] .dash-score-card,
      .dash-app[data-theme="pink"] .dash-card,
      .dash-app[data-theme="pink"] .dash-stat,
      .dash-app[data-theme="pink"] .dash-shoe-item {
        border-radius: 18px; border-width: 2px;
        box-shadow: 0 3px 0 var(--line);
      }
      .dash-app[data-theme="pink"] .dash-btn { border-radius: 20px; border-width: 2px; }
      .dash-app[data-theme="pink"] .dash-btn-primary { box-shadow: 0 2px 0 #B0155E; }
      .dash-app[data-theme="pink"] .dash-theme-toggle { border-radius: 50%; border-width: 2px; color: var(--forest); }
      .dash-app[data-theme="pink"] .dash-area-icon { border-radius: 50%; }
      /* Weiches Press-Feedback für alles Tippbare — leichtes Skalieren mit dezentem
         Überschwingen beim Loslassen, kein Ripple/Kreis-Effekt (wirkte künstlich).
         :not() schließt Elemente aus, die ihre eigene position: absolute brauchen
         (Theme-Toggle, Wetter-Widget), damit die nicht aus ihrer festen Position
         gerissen werden. */
      .dash-app button:not(.dash-theme-toggle):not(.dash-weather),
      .dash-app [role="button"] {
        position: relative;
      }
      .dash-app button, .dash-app [role="button"] {
        transition: transform 0.3s cubic-bezier(0.33, 1.15, 0.55, 1);
      }
      .dash-app button:active:not(:disabled):not(.dash-theme-toggle), .dash-app [role="button"]:active {
        transform: scale(0.96);
      }
      .dash-input, .dash-select, .dash-textarea {
        transition: border-color 0.2s cubic-bezier(0.22, 1, 0.36, 1);
      }
      .dash-theme-toggle {
        position: absolute; top: 18px; right: 16px; width: 34px; height: 34px;
        display: flex; align-items: center; justify-content: center;
        border: 1px solid var(--line); background: var(--card); color: var(--ink);
        border-radius: 8px; cursor: pointer; z-index: 5; transition: transform 0.25s cubic-bezier(0.22, 1, 0.36, 1), border-color 0.2s;
      }
      .dash-theme-toggle:active { transform: scale(0.9) rotate(-8deg); }
      .dash-theme-toggle:hover { border-color: var(--forest); }
      .dash-weather {
        position: absolute; top: 18px; right: 58px; height: 34px; padding: 0 10px;
        display: flex; align-items: center; gap: 5px; font-size: 13.5px; font-family: inherit;
        border: 1px solid var(--line); background: var(--card); color: var(--ink);
        border-radius: 8px; z-index: 5; font-variant-numeric: tabular-nums; cursor: pointer;
      }
      .dash-weather:hover { border-color: var(--forest); }
      .dash-weather-backdrop {
        position: fixed; inset: 0; background: rgba(0,0,0,0.45); z-index: 20;
        display: flex; align-items: flex-start; justify-content: center; padding: 70px 16px 16px;
        animation: fadeIn 0.3s cubic-bezier(0.22, 1, 0.36, 1) both;
      }
      .dash-weather-overlay {
        position: relative; width: 100%; max-width: 420px; background: var(--card);
        border: 1px solid var(--line); border-radius: 8px; padding: 20px;
        font-variant-numeric: tabular-nums; animation: scaleIn 0.4s cubic-bezier(0.22, 1.08, 0.36, 1) both;
      }
      .dash-weather-pill {
        border: 1px solid var(--line); border-radius: 20px; padding: 5px 12px;
        font-size: 12.5px; color: var(--muted); display: inline-flex; align-items: center; gap: 4px;
      }
      .dash-weather-run {
        margin-top: 12px; border: 1px solid var(--forest); background: var(--forest-dim);
        color: var(--forest); border-radius: 20px; padding: 8px 14px; font-size: 13.5px;
        font-weight: 500; display: inline-flex; align-items: center; gap: 6px;
      }
      .dash-save-error {
        max-width: 900px; margin: 0 auto; padding: 10px 16px; border-radius: 8px;
        background: var(--red-dim); color: var(--red); border: 1px solid var(--red);
        font-size: 13.5px; display: flex; justify-content: space-between; align-items: center; gap: 10px;
      }
      .dash-app * { box-sizing: border-box; }
      .dash-inner { max-width: 900px; margin: 0 auto; padding: 20px 16px 48px; }
      .dash-title { font-family: 'Sora', sans-serif; font-weight: 600; font-size: 28px; letter-spacing: -0.01em; margin: 0; }
      .dash-sub { color: var(--muted); font-size: 14px; margin: 4px 0 22px; }

      .dash-back { display: inline-flex; align-items: center; gap: 4px; background: none; border: none; color: var(--muted); font-family: inherit; font-size: 13.5px; cursor: pointer; padding: 0; margin-bottom: 18px; }
      .dash-back:hover { color: var(--ink); }
      .dash-area-head { display: flex; align-items: center; gap: 10px; margin-bottom: 22px; }
      .dash-area-head h2 { font-family: 'Sora', sans-serif; font-size: 24px; font-weight: 600; margin: 0; }
      .dash-area-icon { width: 36px; height: 36px; display: flex; align-items: center; justify-content: center; background: var(--forest-dim); color: var(--forest); flex-shrink: 0; }

      .dash-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(200px, 1fr)); gap: 14px; margin-top: 4px; }
      .dash-area-card { text-align: left; background: var(--card); border: 1px solid var(--line); border-radius: 8px; padding: 20px; cursor: pointer; font-family: inherit; display: flex; flex-direction: column; gap: 10px; animation: fadeInUp 0.5s cubic-bezier(0.22, 1.08, 0.36, 1) both; transition: transform 0.3s cubic-bezier(0.22, 1.08, 0.36, 1), border-color 0.2s; }
      .dash-area-card:active { transform: scale(0.98); }
      .dash-grid .dash-area-card:nth-of-type(1) { animation-delay: 0.02s; }
      .dash-grid .dash-area-card:nth-of-type(2) { animation-delay: 0.06s; }
      .dash-grid .dash-area-card:nth-of-type(3) { animation-delay: 0.10s; }
      .dash-grid .dash-area-card:nth-of-type(4) { animation-delay: 0.14s; }
      .dash-grid .dash-area-card:nth-of-type(5) { animation-delay: 0.18s; }
      .dash-grid .dash-area-card:nth-of-type(6) { animation-delay: 0.22s; }
      .dash-area-card:hover { border-color: var(--forest); }
      .dash-area-card-top { display: flex; align-items: center; justify-content: space-between; }
      .dash-area-card h3 { font-family: 'Sora', sans-serif; font-size: 19px; font-weight: 600; margin: 0; }
      .dash-area-card p { font-size: 13px; color: var(--muted); margin: 0; }
      .dash-area-card.disabled { cursor: default; border-style: dashed; opacity: 0.6; }
      .dash-area-card.disabled:hover { border-color: var(--line); }

      .dash-score-card { background: var(--card); border: 1px solid var(--line); border-radius: 8px; padding: 20px; margin-bottom: 16px; animation: fadeInUp 0.5s cubic-bezier(0.22, 1.08, 0.36, 1) both; }
      .dash-score-top { display: flex; align-items: baseline; justify-content: space-between; flex-wrap: wrap; gap: 8px; }
      .dash-score-name { font-family: 'Sora', sans-serif; font-size: 18px; font-weight: 600; margin: 0; }
      .dash-score-value { font-family: 'Sora', sans-serif; font-size: 40px; font-weight: 600; line-height: 1; }
      .dash-score-status { font-size: 13.5px; margin-top: 2px; }
      .dash-score-bar-track { height: 8px; background: var(--line); border-radius: 6px; margin: 14px 0 10px; overflow: hidden; }
      .dash-score-bar-fill { height: 100%; transition: width 0.6s cubic-bezier(0.22, 1, 0.36, 1); }
      .dash-score-meta { font-size: 12.5px; color: var(--muted); }
      .dash-score-note { font-size: 12px; color: var(--muted); margin-top: 12px; font-style: italic; }
      .dash-score-breakdown { display: flex; gap: 18px; font-size: 12.5px; color: var(--muted); margin-top: 2px; }

      .dash-compare-row { display: flex; gap: 24px; flex-wrap: wrap; }
      .dash-compare-col { flex: 1; min-width: 140px; }
      .dash-compare-label { font-size: 13px; color: var(--muted); margin-bottom: 4px; }
      .dash-compare-current { font-family: 'Sora', sans-serif; font-size: 22px; font-weight: 600; display: block; }
      .dash-compare-prev { font-size: 12px; color: var(--muted); }
      .dash-compare-delta { display: flex; align-items: center; gap: 3px; font-size: 13px; font-weight: 500; margin-top: 4px; }

      .dash-progress-row { display: flex; justify-content: space-between; align-items: baseline; font-size: 13px; }
      .dash-progress-pct { font-family: 'Sora', sans-serif; font-weight: 600; font-size: 15px; }
      .dash-month-strip { display: flex; gap: 3px; margin: 8px 0 4px; }
      .dash-month-seg { flex: 1; height: 6px; background: var(--line); border-radius: 4px; overflow: hidden; }
      .dash-month-fill { height: 100%; background: var(--forest); transition: width 0.6s ease; }

      .dash-cal-nav { display: flex; align-items: center; justify-content: space-between; margin-top: 18px; }
      .dash-cal-grid { display: grid; grid-template-columns: repeat(7, 1fr); gap: 3px; }
      .dash-cal-weekday { font-size: 11px; color: var(--muted); text-align: center; padding-bottom: 2px; }
      .dash-cal-cell { position: relative; aspect-ratio: 1; display: flex; align-items: center; justify-content: center; font-size: 12.5px; font-family: inherit; border: 1px solid transparent; background: none; color: var(--ink); cursor: pointer; border-radius: 2px; }
      .dash-cal-cell:hover { border-color: var(--line); }
      .dash-cal-cell.empty { visibility: hidden; cursor: default; }
      .dash-cal-cell.today { font-weight: 600; color: var(--forest); }
      .dash-cal-cell.selected { background: var(--forest); color: #fff; }
      .dash-cal-cell .dot { position: absolute; bottom: 3px; width: 4px; height: 4px; border-radius: 50%; background: var(--ochre); }
      .dash-cal-cell.selected .dot { background: #fff; }

      .dash-badge { background: var(--red); color: #fff; font-size: 12px; font-weight: 600; min-width: 22px; height: 22px; border-radius: 11px; display: inline-flex; align-items: center; justify-content: center; padding: 0 6px; flex-shrink: 0; }

      .dash-stats { display: grid; grid-template-columns: repeat(auto-fit, minmax(130px, 1fr)); gap: 12px; margin-bottom: 22px; }
      .dash-stat { background: var(--card); border: 1px solid var(--line); border-radius: 8px; padding: 14px 16px; }
      .dash-stat-val { font-family: 'Sora', sans-serif; font-size: 24px; font-weight: 600; }
      .dash-stat-label { font-size: 12.5px; color: var(--muted); margin-top: 2px; }

      .dash-card { background: var(--card); border: 1px solid var(--line); border-radius: 8px; padding: 18px 20px; margin-bottom: 18px; animation: fadeInUp 0.5s cubic-bezier(0.22, 1.08, 0.36, 1) both; }
      .dash-card-title { font-family: 'Sora', sans-serif; font-size: 17px; font-weight: 600; margin: 0 0 14px; }
      .dash-empty { color: var(--muted); font-size: 13.5px; padding: 18px 12px; margin: 4px 0; text-align: center; border: 1px dashed var(--line); border-radius: 8px; display: flex; flex-direction: column; align-items: center; gap: 8px; line-height: 1.45; animation: fadeIn 0.4s cubic-bezier(0.22, 1, 0.36, 1) both; }
      .dash-empty::before { content: "✦"; width: 32px; height: 32px; border-radius: 50%; background: var(--forest-dim); color: var(--forest); display: flex; align-items: center; justify-content: center; font-size: 14px; font-style: normal; }
      .dash-reveal { animation: fadeInUp 0.45s cubic-bezier(0.22, 1.08, 0.36, 1) both; }
      /* Echtes, weiches Auf-/Zuklappen: der Inhalt bleibt immer im DOM, nur die
         Grid-Zeile wächst/schrumpft von 0fr auf 1fr — kein harter Höhensprung mehr. */
      .dash-collapse {
        display: grid; grid-template-rows: 0fr;
        transition: grid-template-rows 0.45s cubic-bezier(0.22, 1, 0.36, 1);
      }
      .dash-collapse.dash-collapse-open { grid-template-rows: 1fr; }
      .dash-collapse-inner { overflow: hidden; min-height: 0; }

      .dash-app { background-image: radial-gradient(130% 55% at 50% -12%, var(--mood-glow, transparent), transparent 70%); background-repeat: no-repeat; }
      .dash-app[data-daytime="morning"] { --mood-glow: rgba(255, 190, 130, 0.30); }
      .dash-app[data-daytime="day"] { --mood-glow: rgba(214, 170, 70, 0.16); }
      .dash-app[data-daytime="evening"] { --mood-glow: rgba(230, 120, 90, 0.24); }
      .dash-app[data-daytime="night"] { --mood-glow: rgba(80, 110, 180, 0.22); }
      .dash-app[data-weather="cloud"] { --mood-glow: rgba(140, 146, 152, 0.20); }
      .dash-app[data-weather="rain"] { --mood-glow: rgba(100, 125, 150, 0.28); }
      .dash-app[data-weather="snow"] { --mood-glow: rgba(190, 215, 235, 0.35); }

      .dash-greeting { font-family: 'Sora', sans-serif; font-size: 15px; color: var(--muted); margin-top: 4px; }

      @keyframes dashShimmer { 0% { background-position: -300px 0; } 100% { background-position: 300px 0; } }
      .dash-skeleton { display: flex; flex-direction: column; gap: 9px; margin-top: 12px; }
      .dash-skeleton-line { height: 11px; border-radius: 6px; background: linear-gradient(90deg, var(--line) 0%, var(--card) 50%, var(--line) 100%); background-size: 600px 100%; animation: dashShimmer 1.3s ease-in-out infinite; }

      .dash-rings { display: flex; align-items: center; gap: 20px; flex-wrap: wrap; }
      .dash-ring-legend { flex: 1; min-width: 160px; display: flex; flex-direction: column; gap: 11px; }
      .dash-ring-row { display: flex; align-items: center; gap: 8px; font-size: 13.5px; }
      .dash-ring-dot { width: 10px; height: 10px; border-radius: 50%; flex-shrink: 0; }
      .dash-streak { font-size: 12.5px; padding: 4px 10px; border-radius: 20px; background: var(--ochre-dim); color: var(--ochre); font-weight: 500; animation: fadeIn 0.5s ease both; }

      .dash-swipe { position: relative; overflow: hidden; border-radius: 6px; transition: opacity 0.3s ease; }
      .dash-swipe-removing { opacity: 0; }
      .dash-swipe-bg { position: absolute; inset: 0; display: flex; align-items: center; justify-content: flex-end; gap: 6px; padding-right: 16px; color: var(--red); background: var(--red-dim); font-size: 13px; font-weight: 500; }
      .dash-swipe-fg { position: relative; background: var(--card); touch-action: pan-y; }

      .dash-status-headline { font-family: 'Sora', sans-serif; font-size: 16px; font-weight: 600; margin-top: 4px; }
      .dash-status-list { display: flex; flex-direction: column; gap: 14px; margin-top: 16px; }
      .dash-status-row { display: flex; gap: 10px; align-items: flex-start; }
      .dash-status-dot { width: 8px; height: 8px; border-radius: 50%; margin-top: 7px; flex-shrink: 0; }
      .dash-status-top { display: flex; justify-content: space-between; gap: 10px; font-size: 14px; flex-wrap: wrap; }
      .dash-intensity-bar { display: flex; height: 8px; border-radius: 6px; overflow: hidden; margin-top: 8px; background: var(--line); }
      .dash-intensity-bar > div { transition: width 0.8s cubic-bezier(0.22, 1, 0.36, 1); }
      .dash-intensity-legend { display: flex; justify-content: space-between; font-size: 11.5px; color: var(--muted); margin-top: 4px; }
      /* Innenabstand über ein Pseudo-Element statt padding-bottom: so wird er beim
         Zuklappen mit abgeschnitten und blitzt nicht mehr unter dem Kopf durch. */
      .dash-collapse-inner.dash-session-body { padding-bottom: 0; }
      .dash-collapse-inner.dash-session-body::after { content: ""; display: block; height: 18px; }

      .dash-rate { margin-bottom: 12px; }
      .dash-rate-label { font-size: 12.5px; color: var(--muted); margin-bottom: 6px; }
      .dash-rate-hint { font-size: 11.5px; color: var(--muted); margin-top: 4px; }
      .dash-chips { display: flex; gap: 6px; flex-wrap: wrap; }
      .dash-chip { font-family: inherit; font-size: 14px; min-width: 40px; padding: 7px 12px; border: 1px solid var(--line); border-radius: 20px; background: var(--surface); color: var(--ink); cursor: pointer; transition: background 0.2s, border-color 0.2s, color 0.2s; }
      .dash-chip-active { background: var(--forest); border-color: var(--forest); color: #fff; }

      .dash-ex-list { margin-top: 4px; }
      .dash-ex-row { padding: 12px 0; border-top: 1px solid var(--line); }
      .dash-ex-head { display: flex; justify-content: space-between; align-items: center; gap: 8px; }
      .dash-ex-name { font-size: 14.5px; font-weight: 500; }
      .dash-ex-fields { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 8px; margin-top: 8px; }
      .dash-ex-field { display: flex; flex-direction: column; gap: 4px; font-size: 11.5px; color: var(--muted); }
      .dash-num { width: 100%; min-width: 0; text-align: center; font-size: 16px; }
      .dash-ex-add { display: flex; flex-direction: column; gap: 8px; margin-top: 14px; padding-top: 14px; border-top: 1px solid var(--line); }
      .dash-ex-add .dash-ex-fields { margin-top: 0; }

      .dash-entry-body { min-width: 0; overflow-wrap: anywhere; }
      .dash-status-missing { margin-top: 16px; padding: 10px 12px; border: 1px dashed var(--line); border-radius: 8px; font-size: 12.5px; color: var(--muted); line-height: 1.5; }

      .dash-view-fade { animation: fadeIn 0.35s cubic-bezier(0.22, 1, 0.36, 1) both; }

      .dash-splash {
        position: fixed; inset: 0; background: var(--paper); z-index: 50;
        display: flex; flex-direction: column; align-items: center; justify-content: center;
        padding: 24px; transition: opacity 0.4s ease; opacity: 1;
      }
      .dash-splash-hide { opacity: 0; pointer-events: none; }
      .dash-splash-title {
        font-family: 'Sora', sans-serif; font-weight: 600; font-size: 34px; color: var(--ink);
        transition: transform 0.95s cubic-bezier(0.22, 1, 0.36, 1), margin-bottom 0.95s ease;
      }
      .dash-splash-title-top { transform: translateY(-170px); margin-bottom: 18px; }
      .dash-splash-ring {
        width: 56px; height: 56px; border-radius: 50%; border: 2px solid var(--line);
        display: flex; align-items: center; justify-content: center; margin: 0 auto 16px;
        color: var(--ochre); animation: dashSpin 3s linear infinite;
      }
      @keyframes dashSpin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }
      .dash-splash-heading { font-family: 'Sora', sans-serif; font-weight: 600; font-size: 17px; text-align: center; margin: 0 0 14px; }
      .dash-splash-checklist { margin-top: 22px; border: 1px solid var(--line); border-radius: 8px; padding: 4px 16px; }
      .dash-splash-item { display: flex; align-items: center; gap: 10px; padding: 10px 0; border-top: 1px solid var(--line); font-size: 13.5px; }
      .dash-splash-item:first-child { border-top: none; }
      .dash-splash-item-icon { width: 28px; height: 28px; border-radius: 50%; background: var(--forest-dim); color: var(--forest); display: flex; align-items: center; justify-content: center; flex-shrink: 0; }
      .dash-splash-spinner { width: 12px; height: 12px; border-radius: 50%; border: 2px dotted var(--ochre); animation: dashSpin 1s linear infinite; }

      .dash-form-row { display: flex; gap: 10px; flex-wrap: wrap; margin-bottom: 10px; align-items: center; }
      .dash-input, .dash-select, .dash-textarea { font-family: inherit; font-size: 14px; padding: 8px 10px; border: 1px solid var(--line); border-radius: 6px; background: var(--surface); color: var(--ink); }
      .dash-textarea { width: 100%; min-height: 80px; resize: vertical; }
      .dash-btn { font-family: inherit; font-size: 14px; font-weight: 500; padding: 9px 16px; border: 1px solid var(--line); border-radius: 6px; background: var(--surface); color: var(--ink); cursor: pointer; display: inline-flex; align-items: center; gap: 6px; transition: transform 0.18s cubic-bezier(0.22, 1, 0.36, 1), border-color 0.2s; }
      .dash-btn:active { transform: scale(0.96); }
      .dash-btn:hover { border-color: var(--forest); }
      .dash-btn-primary { background: var(--forest); border-color: var(--forest); color: #fff; }
      .dash-btn-primary:hover { background: #264C39; border-color: #264C39; }
      .dash-btn-sm { font-size: 12.5px; padding: 5px 10px; }
      .dash-btn:disabled { opacity: 0.5; cursor: not-allowed; }

      .dash-entry { padding: 14px 0; border-top: 1px solid var(--line); display: flex; gap: 14px; animation: fadeIn 0.4s cubic-bezier(0.22, 1, 0.36, 1) both; }
      .dash-entry:first-child { border-top: none; }
      .dash-entry-date { font-family: 'Sora', sans-serif; font-style: italic; font-size: 13px; color: var(--muted); width: 76px; flex-shrink: 0; padding-top: 2px; }
      .dash-entry-body { flex: 1; }
      .dash-tag { display: inline-block; font-size: 11.5px; font-weight: 500; padding: 2px 8px; border-radius: 6px; margin-bottom: 6px; }
      .dash-entry-text { font-size: 14.5px; line-height: 1.5; margin: 0; }
      .dash-del { background: none; border: none; color: var(--muted); cursor: pointer; padding: 4px; align-self: flex-start; display: inline-flex; align-items: center; gap: 4px; font-family: inherit; font-size: 12.5px; }
      .dash-del:hover { color: var(--red); }

      .dash-table { width: 100%; border-collapse: collapse; font-size: 14px; }
      .dash-table th { text-align: left; font-weight: 500; color: var(--muted); font-size: 12.5px; padding: 6px 8px; border-bottom: 1px solid var(--line); }
      .dash-table td { padding: 9px 8px; border-bottom: 1px solid var(--line); vertical-align: top; }
      .dash-table tr:last-child td { border-bottom: none; }
      .dash-run-note { font-size: 13px; color: var(--muted); font-style: italic; padding: 0 8px 12px; line-height: 1.4; }

      .dash-shoe-item { border: 1px solid var(--line); border-radius: 8px; padding: 16px; margin-bottom: 14px; }
      .dash-shoe-head { display: flex; align-items: center; gap: 12px; margin-bottom: 14px; }
      .dash-shoe-icon-badge { width: 38px; height: 38px; border-radius: 8px; background: var(--forest-dim); color: var(--forest); display: flex; align-items: center; justify-content: center; flex-shrink: 0; }
      .dash-shoe-name { font-family: 'Sora', sans-serif; font-size: 16.5px; font-weight: 600; flex: 1; }
      .dash-pill-active { background: var(--forest-dim); color: var(--forest); font-size: 12px; font-weight: 500; padding: 3px 10px; border-radius: 20px; }
      .dash-shoe-body { display: flex; gap: 22px; align-items: flex-start; border-top: 1px solid var(--line); padding-top: 16px; flex-wrap: wrap; }
      .dash-shoe-ring-wrap { display: flex; flex-direction: column; align-items: center; flex-shrink: 0; }
      .dash-shoe-info { flex: 1; min-width: 150px; display: flex; flex-direction: column; gap: 12px; padding-left: 18px; border-left: 1px solid var(--line); }
      .dash-shoe-info-row { display: flex; align-items: flex-start; gap: 8px; font-size: 13.5px; line-height: 1.4; }
      .dash-shoe-info-row .lbl { color: var(--muted); font-size: 11.5px; }
      @media (max-width: 420px) {
        .dash-shoe-info { border-left: none; padding-left: 0; border-top: 1px solid var(--line); padding-top: 12px; }
      }

      .dash-import-msg { font-size: 13px; color: var(--muted); margin-top: 8px; }

      .dash-analysis { background: var(--forest-dim); border-left: 3px solid var(--forest); border-radius: 6px; padding: 16px 18px; margin-top: 14px; font-size: 14.5px; line-height: 1.6; white-space: pre-wrap; }
      .dash-analysis-meta { display: flex; justify-content: space-between; align-items: center; gap: 10px; flex-wrap: wrap; }
      .dash-checkbox { display: flex; align-items: center; gap: 8px; font-size: 13.5px; color: var(--muted); margin: 10px 0; }

      .dash-session { border-top: 1px solid var(--line); }
      .dash-session:first-child { border-top: none; }
      .dash-session-header { width: 100%; display: flex; justify-content: space-between; align-items: center; background: none; border: none; padding: 14px 4px; cursor: pointer; font-family: inherit; text-align: left; color: var(--ink); }
      .dash-session-header:hover { background: rgba(0,0,0,0.02); }
      .dash-session-date { font-family: 'Sora', sans-serif; font-style: italic; font-size: 12.5px; color: var(--muted); }
      .dash-session-name { font-size: 15px; font-weight: 500; margin-top: 2px; }
      .dash-session-count { font-size: 12.5px; color: var(--muted); }
      .dash-session-body { padding: 0 4px 18px; animation: fadeInUp 0.45s cubic-bezier(0.22, 1.08, 0.36, 1) both; }

      @media (max-width: 480px) {
        .dash-title { font-size: 23px; }
        .dash-entry { flex-wrap: wrap; gap: 6px 12px; }
        .dash-entry-date { width: auto; flex-basis: 100%; }
        .dash-score-value { font-size: 34px; }
      }
    `}</style>
  );
}

// ---------- Kalender: Jahr, Lebensjahr & Tagesansicht ----------

function toDateKey(d) {
  if (!d) return null;
  // Reine Datumsangaben (z.B. aus <input type="date">, "YYYY-MM-DD") wörtlich übernehmen —
  // alles andere über lokale Datumsanteile bestimmen, nicht über UTC (toISOString), sonst
  // verschiebt sich der Tag je nach Zeitzone um +/-1.
  if (typeof d === "string" && !d.includes("T")) return d.slice(0, 10);
  const dateObj = typeof d === "string" ? new Date(d) : d;
  const y = dateObj.getFullYear();
  const m = String(dateObj.getMonth() + 1).padStart(2, "0");
  const day = String(dateObj.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function monthGridCells(viewDate) {
  const year = viewDate.getFullYear();
  const month = viewDate.getMonth();
  const first = new Date(year, month, 1);
  const startOffset = (first.getDay() + 6) % 7;
  const total = new Date(year, month + 1, 0).getDate();
  const cells = [];
  for (let i = 0; i < startOffset; i++) cells.push(null);
  for (let d = 1; d <= total; d++) cells.push(new Date(year, month, d));
  return cells;
}

const WEEKDAY_LABELS = ["Mo", "Di", "Mi", "Do", "Fr", "Sa", "So"];

function CalendarProgressCard({ profile, journal, runs, gymSessions, todos, sleepEntries }) {
  const now = new Date();
  const [expanded, setExpanded] = useState(false);
  const [viewDate, setViewDate] = useState(new Date(now.getFullYear(), now.getMonth(), 1));
  const [selectedDate, setSelectedDate] = useState(null);

  const startY = new Date(now.getFullYear(), 0, 1);
  const endY = new Date(now.getFullYear() + 1, 0, 1);
  const yearFrac = (now - startY) / (endY - startY);
  const dayOfYear = Math.floor((now - startY) / DAY) + 1;
  const totalDays = Math.round((endY - startY) / DAY);

  function dayHasData(dateKey) {
    return (
      journal.some((e) => toDateKey(e.date) === dateKey) ||
      runs.some((r) => toDateKey(r.date) === dateKey) ||
      gymSessions.some((s) => toDateKey(s.date) === dateKey) ||
      todos.some((t) => toDateKey(t.createdAt) === dateKey || (t.doneAt && toDateKey(t.doneAt) === dateKey)) ||
      (profile?.weightEntries || []).some((w) => toDateKey(w.date) === dateKey) ||
      sleepEntries.some((e) => toDateKey(e.date) === dateKey)
    );
  }

  const cells = useMemo(() => monthGridCells(viewDate), [viewDate]);

  const dayItems = useMemo(() => {
    if (!selectedDate) return null;
    return {
      journal: journal.filter((e) => toDateKey(e.date) === selectedDate),
      runs: runs.filter((r) => toDateKey(r.date) === selectedDate),
      gym: gymSessions.filter((s) => toDateKey(s.date) === selectedDate),
      todosCreated: todos.filter((t) => toDateKey(t.createdAt) === selectedDate),
      todosDone: todos.filter((t) => t.doneAt && toDateKey(t.doneAt) === selectedDate),
      weight: (profile?.weightEntries || []).find((w) => toDateKey(w.date) === selectedDate) || null,
      sleep: sleepEntries.filter((e) => toDateKey(e.date) === selectedDate),
    };
  }, [selectedDate, journal, runs, gymSessions, todos, profile, sleepEntries]);

  const dayIsEmpty = dayItems && !dayItems.journal.length && !dayItems.runs.length && !dayItems.gym.length && !dayItems.todosCreated.length && !dayItems.todosDone.length && !dayItems.weight && !dayItems.sleep.length;

  return (
    <div className="dash-card">
      <button
        onClick={() => setExpanded((v) => !v)}
        style={{ width: "100%", display: "flex", justifyContent: "space-between", alignItems: "center", background: "none", border: "none", cursor: "pointer", padding: 0, font: "inherit", color: "inherit", marginBottom: expanded ? 14 : 0 }}
      >
        <h3 className="dash-card-title" style={{ margin: 0 }}>Kalender</h3>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <span style={{ fontSize: 13, color: "var(--muted)" }}>Jahr {Math.round(yearFrac * 100)}%</span>
          {expanded ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
        </div>
      </button>

      <div className={`dash-collapse${expanded ? " dash-collapse-open" : ""}`}>
        <div className="dash-collapse-inner">
          <div className="dash-progress-row">
            <span>Jahr {now.getFullYear()} · Tag {dayOfYear} von {totalDays}</span>
            <span className="dash-progress-pct">{Math.round(yearFrac * 100)}%</span>
          </div>
          <div className="dash-month-strip">
            {Array.from({ length: 12 }, (_, m) => {
              const mStart = new Date(now.getFullYear(), m, 1);
              const mEnd = new Date(now.getFullYear(), m + 1, 1);
              let frac;
              if (now >= mEnd) frac = 1; else if (now < mStart) frac = 0; else frac = (now - mStart) / (mEnd - mStart);
              return <div className="dash-month-seg" key={m}><div className="dash-month-fill" style={{ width: `${frac * 100}%` }} /></div>;
            })}
          </div>

          <div className="dash-cal-nav">
            <button className="dash-btn dash-btn-sm" onClick={() => setViewDate(new Date(viewDate.getFullYear(), viewDate.getMonth() - 1, 1))}><ChevronLeft size={14} /></button>
            <span style={{ fontSize: 13.5, fontWeight: 500 }}>{viewDate.toLocaleDateString("de-DE", { month: "long", year: "numeric" })}</span>
            <button className="dash-btn dash-btn-sm" onClick={() => setViewDate(new Date(viewDate.getFullYear(), viewDate.getMonth() + 1, 1))}><ChevronRight size={14} /></button>
          </div>
          <div className="dash-cal-grid" style={{ marginTop: 8 }}>
            {WEEKDAY_LABELS.map((w) => <div key={w} className="dash-cal-weekday">{w}</div>)}
            {cells.map((d, i) => {
              if (!d) return <div key={i} className="dash-cal-cell empty" />;
              const key = toDateKey(d);
              const isSelected = key === selectedDate;
              const isToday = key === toDateKey(now);
              return (
                <button
                  key={i}
              className={`dash-cal-cell${isSelected ? " selected" : ""}${isToday ? " today" : ""}`}
              onClick={() => setSelectedDate(isSelected ? null : key)}
            >
              {d.getDate()}
              {dayHasData(key) && <span className="dot" />}
            </button>
          );
        })}
      </div>

      {selectedDate && (
        <div style={{ marginTop: 16, borderTop: "1px solid var(--line)", paddingTop: 14 }}>
          <h4 style={{ fontFamily: "'Sora', sans-serif", fontSize: 15, fontWeight: 600, margin: "0 0 10px" }}>
            {new Date(selectedDate).toLocaleDateString("de-DE", { weekday: "long", day: "2-digit", month: "long" })}
          </h4>
          {dayIsEmpty ? (
            <p className="dash-empty">Keine Einträge an diesem Tag.</p>
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: 10, fontSize: 13.5 }}>
              {dayItems.journal.map((e) => (
                <div key={e.id}><span className="dash-tag" style={{ background: CATEGORIES.find((c) => c.key === e.category)?.color, color: e.category === "Ziel" ? "var(--ink)" : "#fff" }}>{e.category}</span> {e.text}</div>
              ))}
              {dayItems.runs.map((r) => (
                <div key={r.id}>🏃 {r.name} — {fmtNum(r.distanceKm, 2)} km, {formatPace(paceMinPerKm(r.distanceKm, r.durationSec))}</div>
              ))}
              {dayItems.gym.map((s) => (
                <div key={s.id}>🏋️ {s.name} — {s.exercises.length} Übung{s.exercises.length === 1 ? "" : "en"}</div>
              ))}
              {dayItems.weight && <div>⚖️ Gewicht: {fmtNum(dayItems.weight.weightKg, 1)} kg</div>}
              {dayItems.sleep.map((e) => <div key={e.id}>😴 Schlaf: {formatTimeShort(e.bedTime)}–{formatTimeShort(e.wakeTime)}{e.fitness ? `, Fitness ${e.fitness}/5` : ""}</div>)}
              {dayItems.todosCreated.map((t) => <div key={t.id}>☐ To-Do erstellt: {t.text}</div>)}
              {dayItems.todosDone.map((t) => <div key={t.id}>✓ To-Do erledigt: {t.text}</div>)}
            </div>
          )}
        </div>
      )}
        </div>
      </div>
    </div>
  );
}

// ---------- Gewicht ----------

function WeightCard({ profile, addWeightEntry, onOpen }) {
  const [cardOpen, setCardOpen] = useState(false);
  const [showForm, setShowForm] = useState(false);
  const [wDate, setWDate] = useState(todayISO());
  const [wValue, setWValue] = useState("");

  const entries = useMemo(() => [...(profile?.weightEntries || [])].sort((a, b) => new Date(b.date) - new Date(a.date)), [profile]);
  const latest = entries[0];
  const chartData = useMemo(
    () => [...entries].sort((a, b) => new Date(a.date) - new Date(b.date)).map((e) => ({ label: formatDateShort(e.date), kg: e.weightKg })),
    [entries]
  );

  function submit(e) {
    e.preventDefault();
    const v = parsePositiveNumber(wValue, { max: 400 });
    if (v === null) return;
    addWeightEntry({ id: uid(), date: wDate, weightKg: v });
    setWValue(""); setShowForm(false);
  }

  return (
    <div className="dash-card">
      <button
        onClick={() => setCardOpen((v) => !v)}
        style={{ width: "100%", display: "flex", justifyContent: "space-between", alignItems: "center", background: "none", border: "none", cursor: "pointer", padding: 0, font: "inherit", color: "inherit", marginBottom: cardOpen ? 14 : 0 }}
      >
        <h3 className="dash-card-title" style={{ margin: 0 }}>Gewicht</h3>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          {latest && <span style={{ fontSize: 13, color: "var(--muted)" }}>{fmtNum(latest.weightKg, 1)} kg</span>}
          {cardOpen ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
        </div>
      </button>

      <div className={`dash-collapse${cardOpen ? " dash-collapse-open" : ""}`}>
        <div className="dash-collapse-inner">
          {latest ? (
            <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", flexWrap: "wrap", gap: 8 }}>
              <div>
                <span className="dash-score-value" style={{ fontSize: 28 }}>{fmtNum(latest.weightKg, 1)} kg</span>
                <div className="dash-score-meta">Stand {formatDateShort(latest.date)}</div>
              </div>
              <button className="dash-btn dash-btn-sm" onClick={() => setShowForm((v) => !v)}>Aktualisieren</button>
            </div>
          ) : (
            <button className="dash-btn dash-btn-sm" onClick={() => setShowForm((v) => !v)}>Gewicht eintragen</button>
          )}
          {showForm && (
            <form onSubmit={submit} className="dash-form-row" style={{ marginTop: 12 }}>
              <input type="date" className="dash-input" value={wDate} onChange={(e) => setWDate(e.target.value)} />
              <input type="text" className="dash-input" placeholder="Gewicht in kg" value={wValue} onChange={(e) => setWValue(e.target.value)} style={{ width: 140 }} />
              <button type="submit" className="dash-btn dash-btn-primary">Speichern</button>
            </form>
          )}
          {chartData.length >= 2 && (
            <div style={{ width: "100%", height: 140, marginTop: 14 }}>
              <ResponsiveContainer>
                <LineChart data={chartData}>
                  <CartesianGrid vertical={false} stroke="var(--line)" />
                  <XAxis dataKey="label" tick={{ fontSize: 11, fill: "var(--muted)" }} axisLine={{ stroke: "var(--line)" }} tickLine={false} />
                  <YAxis tick={{ fontSize: 11, fill: "var(--muted)" }} axisLine={false} tickLine={false} width={36} domain={["dataMin - 1", "dataMax + 1"]} />
                  <Tooltip formatter={(v) => [`${v} kg`, "Gewicht"]} contentStyle={{ fontSize: 12, fontFamily: "Inter" }} />
                  <Line type="monotone" dataKey="kg" stroke="var(--forest)" strokeWidth={2} dot={{ r: 3 }} />
                </LineChart>
              </ResponsiveContainer>
            </div>
          )}
          <button className="dash-btn dash-btn-sm" style={{ marginTop: 12 }} onClick={() => onOpen("gewicht")}>Kompletten Verlauf öffnen</button>
        </div>
      </div>
    </div>
  );
}

// ---------- Gewicht: eigener Bereich ----------

function WeightArea({ profile, addWeightEntry, deleteWeightEntry }) {
  const [wDate, setWDate] = useState(todayISO());
  const [wValue, setWValue] = useState("");
  const [wError, setWError] = useState("");

  const entries = useMemo(() => [...(profile?.weightEntries || [])].sort((a, b) => new Date(b.date) - new Date(a.date)), [profile]);
  const ascending = useMemo(() => [...entries].sort((a, b) => new Date(a.date) - new Date(b.date)), [entries]);
  const chartData = useMemo(() => ascending.map((e) => ({ label: formatDateShort(e.date), kg: e.weightKg })), [ascending]);
  const latest = entries[0];
  const first = ascending[0];

  const stats = useMemo(() => {
    if (!latest || !first || entries.length < 2) return null;
    const change = latest.weightKg - first.weightKg;
    const highest = entries.reduce((m, e) => (e.weightKg > m.weightKg ? e : m), entries[0]);
    const lowest = entries.reduce((m, e) => (e.weightKg < m.weightKg ? e : m), entries[0]);
    return { change, highest, lowest };
  }, [entries, latest, first]);

  function submit(e) {
    e.preventDefault();
    setWError("");
    const v = parsePositiveNumber(wValue, { max: 400 });
    if (v === null) return setWError("Bitte ein gültiges Gewicht angeben (0–400 kg).");
    addWeightEntry({ id: uid(), date: wDate, weightKg: v });
    setWValue("");
  }

  return (
    <>
      <div className="dash-card">
        <h3 className="dash-card-title">Neuer Wert</h3>
        <form onSubmit={submit} className="dash-form-row">
          <input type="date" className="dash-input" value={wDate} onChange={(e) => setWDate(e.target.value)} />
          <input type="text" className="dash-input" placeholder="Gewicht in kg" value={wValue} onChange={(e) => setWValue(e.target.value)} style={{ width: 140 }} />
          <button type="submit" className="dash-btn dash-btn-primary">Speichern</button>
        </form>
        {wError && <div style={{ color: "var(--red)", fontSize: 13, marginTop: 8 }}>{wError}</div>}
      </div>

      {latest && (
        <div className="dash-stats">
          <div className="dash-stat"><div className="dash-stat-val">{fmtNum(latest.weightKg, 1)}</div><div className="dash-stat-label">aktuell (kg)</div></div>
          {stats && (
            <>
              <div className="dash-stat">
                <div className="dash-stat-val" style={{ color: stats.change > 0 ? "var(--ochre)" : stats.change < 0 ? "var(--forest)" : "var(--ink)" }}>
                  {stats.change > 0 ? "+" : ""}{fmtNum(stats.change, 1)}
                </div>
                <div className="dash-stat-label">seit erstem Eintrag</div>
              </div>
              <div className="dash-stat"><div className="dash-stat-val">{fmtNum(stats.highest.weightKg, 1)}</div><div className="dash-stat-label">höchster Wert</div></div>
              <div className="dash-stat"><div className="dash-stat-val">{fmtNum(stats.lowest.weightKg, 1)}</div><div className="dash-stat-label">niedrigster Wert</div></div>
            </>
          )}
        </div>
      )}

      <div className="dash-card">
        <h3 className="dash-card-title">Verlauf</h3>
        {chartData.length < 2 ? (
          <p className="dash-empty">Noch nicht genug Werte für eine Kurve — trag mindestens zwei Gewichte ein.</p>
        ) : (
          <div style={{ width: "100%", height: 240 }}>
            <ResponsiveContainer>
              <LineChart data={chartData}>
                <CartesianGrid vertical={false} stroke="var(--line)" />
                <XAxis dataKey="label" tick={{ fontSize: 11, fill: "var(--muted)" }} axisLine={{ stroke: "var(--line)" }} tickLine={false} />
                <YAxis tick={{ fontSize: 11, fill: "var(--muted)" }} axisLine={false} tickLine={false} width={40} domain={["dataMin - 1", "dataMax + 1"]} />
                <Tooltip formatter={(v) => [`${v} kg`, "Gewicht"]} contentStyle={{ fontSize: 12, fontFamily: "Inter" }} />
                <Line type="monotone" dataKey="kg" stroke="var(--forest)" strokeWidth={2} dot={{ r: 3 }} />
              </LineChart>
            </ResponsiveContainer>
          </div>
        )}
      </div>

      <div className="dash-card">
        <h3 className="dash-card-title">Alle Einträge</h3>
        {entries.length === 0 ? <p className="dash-empty">Noch keine Einträge vorhanden.</p> : entries.map((e) => (
          <div key={e.id} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", fontSize: 14, padding: "8px 0", borderTop: "1px solid var(--line)" }}>
            <span>{formatDateShort(e.date)}</span>
            <span style={{ display: "flex", alignItems: "center", gap: 10 }}>
              {fmtNum(e.weightKg, 1)} kg
              <button className="dash-del" onClick={() => deleteWeightEntry(e.id)} title="Löschen"><Trash2 size={14} /></button>
            </span>
          </div>
        ))}
      </div>
    </>
  );
}

// ---------- Trainingsstatus (Karte) ----------

function statusToneColor(tone) {
  return { good: "var(--forest)", warn: "var(--ochre)", neutral: "var(--muted)", muted: "var(--muted)" }[tone] || "var(--muted)";
}

function TrainingStatusCard({ runs, gymSessions, sleepEntries, plan }) {
  const status = useMemo(() => computeTrainingStatus({ runs, gymSessions, sleepEntries, plan }), [runs, gymSessions, sleepEntries, plan]);
  const [showInfo, setShowInfo] = useState(false);

  return (
    <div className="dash-score-card">
      <h3 className="dash-score-name">Trainingsstatus</h3>
      <div className="dash-status-headline" style={{ color: statusToneColor(status.tone) }}>{status.headline}</div>

      {status.findings.length > 0 && (
        <div className="dash-status-list">
          {status.findings.map((f) => (
            <div className="dash-status-row" key={f.key}>
              <span className="dash-status-dot" style={{ background: statusToneColor(f.tone) }} />
              <div style={{ flex: 1, minWidth: 0 }}>
                <div className="dash-status-top">
                  <span>{f.label}</span>
                  <span style={{ fontWeight: 600, color: f.tone === "warn" ? "var(--ochre)" : f.tone === "good" ? "var(--forest)" : "var(--ink)" }}>{f.value}</span>
                </div>
                {f.bar && (
                  <>
                    <div className="dash-intensity-bar">
                      <div style={{ width: `${f.bar.easy * 100}%`, background: "var(--int-easy)" }} />
                      <div style={{ width: `${f.bar.mid * 100}%`, background: "var(--int-mid)" }} />
                      <div style={{ width: `${f.bar.hard * 100}%`, background: "var(--int-hard)" }} />
                    </div>
                    <div className="dash-intensity-legend">
                      <span>locker {Math.round(f.bar.easy * 100)} %</span>
                      <span>mittel {Math.round(f.bar.mid * 100)} %</span>
                      <span>hart {Math.round(f.bar.hard * 100)} %</span>
                    </div>
                  </>
                )}
                <div className="dash-score-meta" style={{ marginTop: 3, lineHeight: 1.45 }}>{f.detail}</div>
              </div>
            </div>
          ))}
        </div>
      )}

      {status.missing.length > 0 && (
        <div className="dash-status-missing">
          <div style={{ fontWeight: 500, marginBottom: 4 }}>Nicht bewertbar</div>
          {status.missing.map((m) => <div key={m}>· {m}</div>)}
        </div>
      )}

      <button
        onClick={() => setShowInfo((v) => !v)}
        style={{ marginTop: 12, display: "flex", alignItems: "center", gap: 6, background: "none", border: "none", cursor: "pointer", padding: 0, font: "inherit", fontSize: 13, color: "var(--muted)" }}
      >
        {showInfo ? <ChevronUp size={14} /> : <ChevronDown size={14} />} Wie wird das berechnet?
      </button>
      <div className={`dash-collapse${showInfo ? " dash-collapse-open" : ""}`}>
        <div className="dash-collapse-inner">
          <div className="dash-score-note" style={{ marginTop: 8, lineHeight: 1.55 }}>
            Jede Aussage beruht nur auf deinen eingetragenen Daten — fehlt etwas, steht es unter „Nicht bewertbar“ statt geschätzt zu werden.
            {" "}<strong>Umfang:</strong> Laufminuten der letzten 7 Tage gegen deinen Wochenschnitt der letzten 4 Wochen; über 50 % mehr gilt in der Trainingslehre als großer Sprung.
            {" "}<strong>Intensität:</strong> Jeder Lauf wird über seinen Durchschnittspuls eingeordnet — unter 80 % deines höchsten gemessenen Pulses locker, über 88 % hart. Das ist grob, weil ein einzelner Lauf mehrere Zonen haben kann.
            {" "}<strong>Laufeffizienz:</strong> Meter pro Herzschlag bei ruhigen Läufen ab 3 km, letzte 4 Wochen gegen die 8 Wochen davor. Steigt der Wert, läufst du bei gleichem Puls schneller.
            {" "}Kein medizinischer Messwert.
          </div>
        </div>
      </div>
    </div>
  );
}

// ---------- Gesamtbild ----------

function OverallAnalysisCard({ runs, gymSessions, journal, sleepEntries, trainingPlan, overallAnalysis, setOverallAnalysis }) {
  const [cardOpen, setCardOpen] = useState(false);
  const [includeJournal, setIncludeJournal] = useState(false);
  const [includeSleep, setIncludeSleep] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const hasData = runs.length > 0 || gymSessions.length > 0;

  async function generate() {
    setBusy(true); setError("");
    try {
      const sortedRuns = [...runs].sort((a, b) => new Date(b.date) - new Date(a.date));
      const sortedGym = [...gymSessions].sort((a, b) => new Date(b.date) - new Date(a.date));
      const status = computeTrainingStatus({ runs, gymSessions, sleepEntries, plan: trainingPlan });
      const runsSummary = sortedRuns.slice(0, 20)
        .map((r) => `${formatDateShort(r.date)}: ${fmtNum(r.distanceKm, 2)} km, ${formatDuration(r.durationSec)}, ${formatPace(paceMinPerKm(r.distanceKm, r.durationSec))}`)
        .join("\n") || "keine";
      const gymSummary = sortedGym.slice(0, 15)
        .map((s) => `${formatDateShort(s.date)} ${s.name}: ${s.exercises.length} Übung${s.exercises.length === 1 ? "" : "en"}${s.difficulty ? ` · Anstrengung ${s.difficulty}/5` : ""}${s.feeling ? ` · Befinden ${s.feeling}` : ""}`)
        .join("\n") || "keine";
      let journalSummary = "";
      if (includeJournal) {
        journalSummary = [...journal].sort((a, b) => new Date(b.date) - new Date(a.date)).slice(0, 10)
          .map((e) => `${formatDateShort(e.date)} [${e.category}]: ${e.text}`).join("\n");
      }
      let sleepSummary = "";
      if (includeSleep) {
        sleepSummary = [...sleepEntries].sort((a, b) => new Date(b.date) - new Date(a.date)).slice(0, 10)
          .map((e) => {
            const dur = sleepDurationSec(e);
            return `${formatDateShort(e.date)}: ${formatTimeShort(e.bedTime)}–${formatTimeShort(e.wakeTime)}${dur ? `, ${formatSleepDur(dur)}` : ""}${e.fitness ? `, Fitness ${e.fitness}/5` : ""}`;
          }).join("\n");
      }
      const total = runs.length + gymSessions.length;
      const depthHint = total < 5
        ? "Es gibt erst wenige Einheiten — halte die Analyse entsprechend kurz und vorsichtig, ohne große Trendaussagen."
        : total < 15
        ? "Es gibt eine mittlere Anzahl an Einheiten — geh kurz auf erste erkennbare Muster ein."
        : "Es gibt schon viele Einheiten — geh etwas ausführlicher auf Trends über die Zeit ein (Belastungsaufbau, Regelmäßigkeit, Balance zwischen Laufen und Krafttraining).";
      const prompt =
        `Läufe (Datum, Distanz, Dauer, Pace), neueste zuerst:\n${runsSummary}\n\n` +
        `Krafttraining, neueste zuerst:\n${gymSummary}\n\n` +
        `Trainingsstatus (nur aus vorhandenen Daten berechnet):\n${trainingStatusText(status)}\n\n` +
        (includeJournal && journalSummary ? `Kontext aus meinem Tagebuch:\n${journalSummary}\n\n` : "") +
        (includeSleep && sleepSummary ? `Mein Schlaf zuletzt (Schätzwerte):\n${sleepSummary}\n\n` : "") +
        `Gib mir ein kurzes Gesamtbild meiner Trainingsentwicklung. Wichtig: es soll nicht nur um neue Bestzeiten oder Gewichte gehen, sondern vor allem darum, ob die aktuelle Gesamtbelastung (Laufen + Krafttraining) gesund und nachhaltig ist und wie regelmäßig ich unterwegs bin.${includeSleep && sleepSummary ? " Beziehe auch ein, ob mein Schlaf zu der Belastung passt oder ob ich eher kürzertreten sollte." : ""} ${depthHint} Schließe mit maximal einem kurzen, freundlichen Impuls für die nächsten Tage. Auf Deutsch, in kurzen Absätzen, ohne Aufzählungszeichen-Overkill.`;
      const text = await askClaude(prompt, 900);
      setOverallAnalysis({ text: text || "Keine Auswertung erhalten.", generatedAt: new Date().toISOString(), runCount: runs.length, gymCount: gymSessions.length });
    } catch {
      setError("Die Auswertung konnte nicht geladen werden. Versuch es gleich noch einmal.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="dash-card">
      <button
        onClick={() => setCardOpen((v) => !v)}
        style={{ width: "100%", display: "flex", justifyContent: "space-between", alignItems: "center", background: "none", border: "none", cursor: "pointer", padding: 0, font: "inherit", color: "inherit", marginBottom: cardOpen ? 14 : 0 }}
      >
        <h3 className="dash-card-title" style={{ margin: 0 }}>Gesamtbild</h3>
        {cardOpen ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
      </button>
      <div className={`dash-collapse${cardOpen ? " dash-collapse-open" : ""}`}>
        <div className="dash-collapse-inner">
        {!hasData ? (
          <p className="dash-empty">Sobald du Läufe oder Trainings eingetragen hast, siehst du hier eine kurze Einordnung.</p>
        ) : (
          <div>
            <label className="dash-checkbox">
              <input type="checkbox" checked={includeJournal} onChange={(e) => setIncludeJournal(e.target.checked)} />
              Tagebucheinträge als Kontext einbeziehen
            </label>
            <label className="dash-checkbox">
              <input type="checkbox" checked={includeSleep} onChange={(e) => setIncludeSleep(e.target.checked)} />
              Schlafdaten als Kontext einbeziehen
            </label>
            {!overallAnalysis ? (
              <button className="dash-btn dash-btn-primary" onClick={generate} disabled={busy}>
                <Sparkles size={15} /> {busy ? "Analysiere …" : "Gesamtbild erstellen"}
              </button>
            ) : (
              <AnalysisDisplay
                text={overallAnalysis.text}
                generatedAt={overallAnalysis.generatedAt}
                busy={busy}
                onRefresh={generate}
                onDelete={() => setOverallAnalysis(null)}
              />
            )}
            {busy && !overallAnalysis && <SkeletonLines />}
            {error && <div style={{ color: "var(--red)", fontSize: 13, marginTop: 10 }}>{error}</div>}
          </div>
        )}
        </div>
      </div>
    </div>
  );
}

// ---------- Schlafen ----------

function formatTimeShort(iso) {
  if (!iso) return "–";
  return new Date(iso).toLocaleTimeString("de-DE", { hour: "2-digit", minute: "2-digit" });
}

// Die reine Zeit zwischen Hinlegen und Aufstehen ist nicht gleich Schlafdauer — es
// dauert ja noch etwas, bis man wirklich einschläft. sleepOnsetMin (Minuten bis zum
// Einschlafen) wird davon abgezogen; Standardannahme 15 Min., nachträglich über die
// "+15/+30/+45"-Buttons im Verlauf korrigierbar, falls man länger wach lag.
// Rohe Zeit zwischen Hinlegen und Aufstehen (ohne Einschlafzeit).
function sleepRawSec(entry) {
  if (!entry || !entry.bedTime || !entry.wakeTime) return null;
  const raw = (new Date(entry.wakeTime) - new Date(entry.bedTime)) / 1000;
  return isFinite(raw) ? raw : null;
}
const MAX_PLAUSIBLE_SLEEP_SEC = 16 * 3600;

// "7 h 25 min" statt "7:25:00" — liest sich nicht wie eine Uhrzeit.
function formatSleepDur(sec) {
  if (!sec || sec <= 0) return "–";
  const h = Math.floor(sec / 3600);
  const m = Math.round((sec % 3600) / 60);
  return h ? `${h} h ${m} min` : `${m} min`;
}

function sleepDurationSec(entry) {
  if (!entry.bedTime || !entry.wakeTime) return null;
  const rawSec = (new Date(entry.wakeTime) - new Date(entry.bedTime)) / 1000;
  // Mehr als 16 h ist fast immer ein vergessenes "Aufgestanden" — nicht mitrechnen.
  if (rawSec > MAX_PLAUSIBLE_SLEEP_SEC) return null;
  const onsetSec = (entry.sleepOnsetMin ?? 0) * 60;
  const d = rawSec - onsetSec;
  return d > 0 ? d : null;
}

const DEFAULT_SLEEP_ONSET_MIN = 15;

// Gemeinsam von Home (Schnellzugriff) und SleepArea genutzt, damit dieselbe Logik
// nicht doppelt gepflegt werden muss. Erzeugt bewusst auch ohne erfasste
// Schlafenszeit einen Eintrag (nur mit Aufstehzeit) — das ist kein "vollständiger"
// Datensatz, da sleepDurationSec() ohne bedTime keine Dauer berechnet, sondern
// einfach nur die Aufstehzeit vermerkt.
function createWakeSleepEntry(pendingBedtime) {
  return {
    id: uid(),
    date: pendingBedtime ? toDateKey(pendingBedtime) : todayISO(),
    type: "nacht",
    bedTime: pendingBedtime,
    wakeTime: new Date().toISOString(),
    fitness: null,
    estimated: true,
    sleepOnsetMin: DEFAULT_SLEEP_ONSET_MIN,
  };
}

// Zentrale Schlaf-Aktionen — von Home (Schnellzugriff) und SleepArea gleichermaßen
// genutzt, damit es nur eine einzige Version dieser Logik gibt. finishSleep() lehnt
// bewusst ab, wenn keine Schlafenszeit erfasst wurde (kein "vollständiger" Datensatz
// ohne echte Bettzeit), statt einen Eintrag mit fehlender Schlafenszeit zu erzeugen.
async function startSleep(setPendingBedtime) {
  haptic();
  return setPendingBedtime(new Date().toISOString());
}

async function finishSleep(pendingBedtime, sleepEntries, persistSleepEntries, setPendingBedtime) {
  if (!pendingBedtime) {
    return { ok: false, message: "Bitte zuerst „Schlafengehen“ erfassen." };
  }
  const entry = createWakeSleepEntry(pendingBedtime);
  const saved = await persistSleepEntries([entry, ...sleepEntries]);
  if (saved === false) return { ok: false, message: "Schlaf konnte nicht gespeichert werden." };
  await setPendingBedtime(null);
  haptic(15);
  return { ok: true };
}

function SleepArea({ sleepEntries, persistSleepEntries, pendingBedtime, setPendingBedtime }) {
  const [date, setDate] = useState(todayISO());
  const [type, setType] = useState("nacht");
  const [bedTimeStr, setBedTimeStr] = useState("");
  const [wakeTimeStr, setWakeTimeStr] = useState("");
  const [fitness, setFitness] = useState("");
  const [formError, setFormError] = useState("");
  const [wakeHint, setWakeHint] = useState("");
  const [editingFitnessId, setEditingFitnessId] = useState(null);
  const [expandedDate, setExpandedDate] = useState(null);

  const sorted = useMemo(() => [...sleepEntries].sort((a, b) => new Date(b.date) - new Date(a.date)), [sleepEntries]);
  const grouped = useMemo(() => {
    const byDate = {};
    sorted.forEach((e) => {
      if (!byDate[e.date]) byDate[e.date] = [];
      byDate[e.date].push(e);
    });
    return Object.entries(byDate).sort((a, b) => new Date(b[0]) - new Date(a[0]));
  }, [sorted]);

  function quickBedtime() {
    startSleep(setPendingBedtime);
  }
  async function quickWake() {
    const result = await finishSleep(pendingBedtime, sleepEntries, persistSleepEntries, setPendingBedtime);
    setWakeHint(result.ok ? "" : result.message);
  }

  function addManual(e) {
    e.preventDefault();
    setFormError("");
    if (!validateDate(date)) return setFormError("Bitte ein gültiges Datum angeben.");
    if (!bedTimeStr || !wakeTimeStr) return setFormError("Bitte beide Uhrzeiten angeben.");
    const bed = combineDateAndTime(date, bedTimeStr);
    let wake = combineDateAndTime(date, wakeTimeStr);
    if (!bed || !wake) return setFormError("Bitte gültige Uhrzeiten angeben.");
    if (wake <= bed) wake = new Date(wake.getTime() + DAY); // Schlaf über Mitternacht: Aufstehzeit liegt am Folgetag
    const fitnessVal = fitness ? parseIntegerInRange(fitness, 1, 5) : null;
    const entry = {
      id: uid(),
      date,
      type,
      bedTime: bed.toISOString(),
      wakeTime: wake.toISOString(),
      fitness: fitnessVal,
      estimated: false,
      sleepOnsetMin: type === "nacht" ? DEFAULT_SLEEP_ONSET_MIN : 0,
    };
    persistSleepEntries([entry, ...sleepEntries]);
    setBedTimeStr(""); setWakeTimeStr(""); setFitness(""); setType("nacht");
  }

  function deleteEntry(id) {
    persistSleepEntries(sleepEntries.filter((e) => e.id !== id));
  }
  function setEntryFitness(id, value) {
    const fitnessVal = value ? parseIntegerInRange(value, 1, 5) : null;
    persistSleepEntries(sleepEntries.map((e) => (e.id === id ? { ...e, fitness: fitnessVal } : e)));
    setEditingFitnessId(null);
  }
  function adjustOnset(id, minutes) {
    persistSleepEntries(sleepEntries.map((e) => (e.id === id ? { ...e, sleepOnsetMin: (e.sleepOnsetMin ?? 0) + minutes } : e)));
  }
  function resetOnset(id) {
    persistSleepEntries(sleepEntries.map((e) => (e.id === id ? { ...e, sleepOnsetMin: 0 } : e)));
  }

  return (
    <>
      <div className="dash-card">
        <h3 className="dash-card-title">Schnellerfassung</h3>
        <div style={{ display: "flex", gap: 10, flexWrap: "wrap", alignItems: "center" }}>
          <button className="dash-btn dash-btn-primary" onClick={quickBedtime}>🛌 Schlafengehen jetzt</button>
          <button className="dash-btn dash-btn-primary" onClick={quickWake} disabled={!pendingBedtime} title={!pendingBedtime ? "Bitte zuerst „Schlafengehen“ erfassen" : undefined}>☀️ Aufgestanden jetzt</button>
        </div>
        {pendingBedtime && (
          <div className="dash-score-meta" style={{ marginTop: 10 }}>
            Schlafengehen erfasst um {formatTimeShort(pendingBedtime)} — tippe "Aufgestanden jetzt", sobald du wach bist.
          </div>
        )}
        {wakeHint && <div className="dash-score-meta" style={{ marginTop: 10, color: "var(--ochre)" }}>{wakeHint}</div>}
        <div className="dash-score-note" style={{ marginTop: 12 }}>Alle Zeiten hier sind Schätzwerte — muss nicht auf die Minute genau sein, und wenn du mal nichts einträgst, ist das auch kein Problem.</div>
      </div>

      <div className="dash-card">
        <h3 className="dash-card-title">Manuell eintragen</h3>
        <form onSubmit={addManual}>
          <div className="dash-form-row">
            <input type="date" className="dash-input" value={date} onChange={(e) => setDate(e.target.value)} />
            <select className="dash-select" value={type} onChange={(e) => setType(e.target.value)}>
              <option value="nacht">Nachtschlaf</option>
              <option value="nap">Mittagsschlaf</option>
            </select>
          </div>
          <div className="dash-form-row">
            <input type="time" className="dash-input" value={bedTimeStr} onChange={(e) => setBedTimeStr(e.target.value)} placeholder="Schlafengehen" />
            <input type="time" className="dash-input" value={wakeTimeStr} onChange={(e) => setWakeTimeStr(e.target.value)} placeholder="Aufstehen" />
          </div>
          <div className="dash-form-row">
            <select className="dash-select" value={fitness} onChange={(e) => setFitness(e.target.value)}>
              <option value="">Wie fit fühlst du dich? (1-5) –</option>
              <option value="1">1 – sehr müde</option>
              <option value="2">2 – müde</option>
              <option value="3">3 – ok</option>
              <option value="4">4 – fit</option>
              <option value="5">5 – topfit</option>
            </select>
          </div>
          {formError && <div style={{ color: "var(--red)", fontSize: 13, marginBottom: 8 }}>{formError}</div>}
          <button type="submit" className="dash-btn dash-btn-primary">Speichern</button>
        </form>
      </div>

      <div className="dash-card">
        <h3 className="dash-card-title">Verlauf</h3>
        {grouped.length === 0 ? <p className="dash-empty">Noch keine Einträge vorhanden.</p> : grouped.map(([d, entries]) => {
          const totalSec = entries.reduce((s, e) => s + (sleepDurationSec(e) || 0), 0);
          const isOpen = expandedDate === d;
          return (
            <div key={d} style={{ borderTop: "1px solid var(--line)", paddingTop: 10, marginTop: 10 }}>
              <button
                onClick={() => setExpandedDate(isOpen ? null : d)}
                style={{ width: "100%", display: "flex", justifyContent: "space-between", alignItems: "baseline", background: "none", border: "none", cursor: "pointer", padding: 0, font: "inherit", color: "inherit" }}
              >
                <span style={{ fontFamily: "'Sora', sans-serif", fontSize: 13.5, fontWeight: 600 }}>{formatDateShort(d)}</span>
                <span style={{ display: "flex", alignItems: "center", gap: 8 }}>
                  {totalSec > 0 && <span className="dash-score-meta">{entries.length > 1 ? "Gesamt: " : ""}{formatSleepDur(totalSec)}</span>}
                  {isOpen ? <ChevronUp size={15} /> : <ChevronDown size={15} />}
                </span>
              </button>
              <div className={`dash-collapse${isOpen ? " dash-collapse-open" : ""}`}>
                <div className="dash-collapse-inner">
              {entries.map((e) => {
                const dur = sleepDurationSec(e);
                return (
                  <div className="dash-entry" key={e.id} style={{ padding: "8px 0" }}>
                    <div className="dash-entry-body">
                      <p className="dash-entry-text">
                        {e.type === "nap" ? "Mittagsschlaf: " : ""}
                        {formatTimeShort(e.bedTime)} – {formatTimeShort(e.wakeTime)}
                        {dur && ` · ${formatSleepDur(dur)}`}
                        {e.estimated && <span style={{ color: "var(--muted)", fontStyle: "italic" }}> · geschätzt</span>}
                        {!dur && (sleepRawSec(e) || 0) > MAX_PLAUSIBLE_SLEEP_SEC && <span style={{ color: "var(--ochre)" }}> · über 16 h — vermutlich „Aufgestanden" vergessen, zählt nicht mit</span>}
                      </p>
                      {e.bedTime && (
                        <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap", marginTop: 4 }}>
                          <span className="dash-score-meta">Einschlafzeit angenommen: {e.sleepOnsetMin ?? 0} Min.</span>
                          <button className="dash-btn dash-btn-sm" onClick={() => adjustOnset(e.id, 15)}>+15</button>
                          <button className="dash-btn dash-btn-sm" onClick={() => adjustOnset(e.id, 30)}>+30</button>
                          <button className="dash-btn dash-btn-sm" onClick={() => adjustOnset(e.id, 45)}>+45</button>
                          {(e.sleepOnsetMin ?? 0) > 0 && (
                            <button className="dash-btn dash-btn-sm" onClick={() => resetOnset(e.id)} title="Direkt eingeschlafen — Einschlafzeit auf 0 setzen">0 (weggenickt)</button>
                          )}
                        </div>
                      )}
                      {editingFitnessId === e.id ? (
                        <select className="dash-select" style={{ marginTop: 6 }} autoFocus value={e.fitness || ""} onChange={(ev) => setEntryFitness(e.id, ev.target.value)} onBlur={() => setEditingFitnessId(null)}>
                          <option value="">– keine Angabe –</option>
                          <option value="1">1 – sehr müde</option>
                          <option value="2">2 – müde</option>
                          <option value="3">3 – ok</option>
                          <option value="4">4 – fit</option>
                          <option value="5">5 – topfit</option>
                        </select>
                      ) : (
                        <button className="dash-btn dash-btn-sm" style={{ marginTop: 6 }} onClick={() => setEditingFitnessId(e.id)}>
                          {e.fitness ? `Fitness ${e.fitness}/5 · ändern` : "Fitness nachtragen"}
                        </button>
                      )}
                    </div>
                    <button className="dash-del" onClick={() => deleteEntry(e.id)} title="Löschen"><Trash2 size={15} /></button>
                  </div>
                );
              })}
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </>
  );
}

// ---------- To-Dos-Übersicht (Home) ----------

// Koordinaten für Dützen (Ortsteil von Minden): 52.2711 N, 8.8622 O
const WEATHER_LAT = 52.2711;
const WEATHER_LON = 8.8622;

function weatherEmoji(code) {
  if (code === 0) return "☀️";
  if (code === 1 || code === 2) return "🌤️";
  if (code === 3) return "☁️";
  if (code === 45 || code === 48) return "🌫️";
  if ([51, 53, 55, 56, 57].includes(code)) return "🌦️";
  if ([61, 63, 65, 66, 67, 80, 81, 82].includes(code)) return "🌧️";
  if ([71, 73, 75, 77, 85, 86].includes(code)) return "❄️";
  if ([95, 96, 99].includes(code)) return "⛈️";
  return "🌡️";
}

function weatherDescription(code) {
  const map = {
    0: "Klar", 1: "Überwiegend klar", 2: "Teilweise bewölkt", 3: "Bedeckt",
    45: "Nebel", 48: "Reifnebel",
    51: "Leichter Nieselregen", 53: "Nieselregen", 55: "Starker Nieselregen",
    56: "Gefrierender Nieselregen", 57: "Starker gefrierender Nieselregen",
    61: "Leichter Regen", 63: "Regen", 65: "Starker Regen",
    66: "Gefrierender Regen", 67: "Starker gefrierender Regen",
    71: "Leichter Schneefall", 73: "Schneefall", 75: "Starker Schneefall", 77: "Schneegriesel",
    80: "Leichte Regenschauer", 81: "Regenschauer", 82: "Starke Regenschauer",
    85: "Leichte Schneeschauer", 86: "Starke Schneeschauer",
    95: "Gewitter", 96: "Gewitter mit Hagel", 99: "Starkes Gewitter mit Hagel",
  };
  return map[code] || "Unbekannt";
}

// Sucht im Stundenverlauf ein 2-Stunden-Fenster mit wenig Regenwahrscheinlichkeit
// und angenehmer Temperatur — ein grober, selbst nachvollziehbarer Vorschlag,
// keine Trainingsempfehlung im medizinischen Sinn.
function findRunningWindow(hourly, now) {
  const { time, temperature_2m: temps, precipitation_probability: precip } = hourly;
  for (let i = 0; i < time.length - 1; i++) {
    const t = new Date(time[i]);
    if (t < now) continue;
    if (t - now > 16 * 3600 * 1000) break;
    const p1 = precip?.[i] ?? 100, p2 = precip?.[i + 1] ?? 100;
    const temp1 = temps[i], temp2 = temps[i + 1];
    if (p1 <= 20 && p2 <= 20 && temp1 >= 2 && temp1 <= 26 && temp2 >= 2 && temp2 <= 26) {
      return { start: t, end: new Date(new Date(time[i + 1]).getTime() + 3600000), avgTemp: Math.round((temp1 + temp2) / 2) };
    }
  }
  return null;
}

function formatHour(d) {
  return d.toLocaleTimeString("de-DE", { hour: "2-digit", minute: "2-digit" });
}

function WeatherWidget({ onWeather }) {
  const [weather, setWeather] = useState(null);
  const [error, setError] = useState(false);
  const [overlayOpen, setOverlayOpen] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch(
          `https://api.open-meteo.com/v1/forecast?latitude=${WEATHER_LAT}&longitude=${WEATHER_LON}` +
          `&current=temperature_2m,apparent_temperature,weather_code,wind_speed_10m` +
          `&hourly=temperature_2m,precipitation_probability` +
          `&daily=temperature_2m_max,temperature_2m_min,sunrise,sunset` +
          `&timezone=Europe%2FBerlin`
        );
        if (!res.ok) throw new Error(`Wetter-Anfrage fehlgeschlagen (${res.status})`);
        const data = await res.json();
        if (!cancelled) { setWeather(data); if (onWeather) onWeather(data.current.weather_code); }
      } catch (err) {
        console.error("Wetter konnte nicht geladen werden:", err);
        if (!cancelled) setError(true);
      }
    })();
    return () => { cancelled = true; };
  }, []);

  if (error || !weather) return null;

  return (
    <>
      <button className="dash-weather" title="Wetter in Dützen" onClick={() => setOverlayOpen(true)}>
        <span>{weatherEmoji(weather.current.weather_code)}</span>
        <span><AnimatedNumber value={weather.current.temperature_2m} formatter={(n) => `${n}°`} /></span>
      </button>
      {overlayOpen && <WeatherOverlay weather={weather} onClose={() => setOverlayOpen(false)} />}
    </>
  );
}

function WeatherOverlay({ weather, onClose }) {
  const now = new Date();
  const runWindow = useMemo(() => findRunningWindow(weather.hourly, now), [weather]);
  const chartData = useMemo(() => {
    const { time, temperature_2m } = weather.hourly;
    const nowIdx = time.findIndex((t) => new Date(t) >= now);
    const start = Math.max(0, nowIdx);
    return time.slice(start, start + 24).map((t, i) => ({
      label: new Date(t).toLocaleTimeString("de-DE", { hour: "2-digit" }),
      temp: temperature_2m[start + i],
    }));
  }, [weather]);

  return (
    <div className="dash-weather-backdrop" onClick={onClose}>
      <div className="dash-weather-overlay" onClick={(e) => e.stopPropagation()}>
        <button className="dash-del" onClick={onClose} style={{ position: "absolute", top: 12, right: 12 }} aria-label="Schließen">✕</button>

        <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", flexWrap: "wrap", gap: 10 }}>
          <div>
            <div style={{ fontFamily: "'Sora', sans-serif", fontSize: 34, fontWeight: 600 }}>{nowTickTime(now)}</div>
            <div className="dash-score-meta">{now.toLocaleDateString("de-DE", { weekday: "long", day: "2-digit", month: "2-digit" })}</div>
          </div>
          <div style={{ textAlign: "right" }}>
            <div style={{ display: "flex", alignItems: "center", gap: 8, justifyContent: "flex-end" }}>
              <span style={{ fontSize: 30 }}>{weatherEmoji(weather.current.weather_code)}</span>
              <span style={{ fontFamily: "'Sora', sans-serif", fontSize: 30, fontWeight: 600 }}><AnimatedNumber value={weather.current.temperature_2m} formatter={(n) => `${n}°`} /></span>
            </div>
            <div className="dash-score-meta">gefühlt {Math.round(weather.current.apparent_temperature)}°</div>
          </div>
        </div>
        <div className="dash-score-meta" style={{ marginTop: 4 }}>{weatherDescription(weather.current.weather_code)} · Dützen</div>

        {chartData.length > 1 && (
          <div style={{ width: "100%", height: 90, margin: "14px 0" }}>
            <ResponsiveContainer>
              <LineChart data={chartData}>
                <XAxis dataKey="label" tick={{ fontSize: 10, fill: "var(--muted)" }} axisLine={false} tickLine={false} interval={3} />
                <Tooltip formatter={(v) => [`${Math.round(v)}°`, "Temperatur"]} contentStyle={{ fontSize: 12, fontFamily: "Inter" }} />
                <Line type="monotone" dataKey="temp" stroke="var(--ochre)" strokeWidth={2} dot={false} />
              </LineChart>
            </ResponsiveContainer>
          </div>
        )}

        <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginTop: 4 }}>
          <span className="dash-weather-pill">↑{Math.round(weather.daily.temperature_2m_max[0])}° ↓{Math.round(weather.daily.temperature_2m_min[0])}°</span>
          <span className="dash-weather-pill">💨 {Math.round(weather.current.wind_speed_10m)} km/h</span>
          <span className="dash-weather-pill">🌅 {formatHour(new Date(weather.daily.sunrise[0]))} 🌇 {formatHour(new Date(weather.daily.sunset[0]))}</span>
        </div>

        {runWindow && (
          <div className="dash-weather-run">
            🏃 {formatHour(runWindow.start)}–{formatHour(runWindow.end)} bei {runWindow.avgTemp}°
          </div>
        )}
      </div>
    </div>
  );
}

function nowTickTime(d) {
  return d.toLocaleTimeString("de-DE", { hour: "2-digit", minute: "2-digit" });
}

function SplashScreen({ visible }) {
  const [stage, setStage] = useState("center");
  const [step, setStep] = useState(0);

  useEffect(() => {
    const timers = [
      setTimeout(() => setStage("rising"), 300),
      setTimeout(() => setStep(1), 650),
      setTimeout(() => setStep(2), 900),
      setTimeout(() => setStep(3), 1150),
    ];
    return () => timers.forEach(clearTimeout);
  }, []);

  const items = [
    { icon: <Calendar size={15} />, label: "Kalender wird abgeglichen" },
    { icon: <CheckSquare size={15} />, label: "Einträge werden geladen" },
    { icon: <TrendingUp size={15} />, label: "Formkurve wird berechnet" },
  ];

  return (
    <div className={`dash-splash${visible ? "" : " dash-splash-hide"}`}>
      <div className={`dash-splash-title${stage === "rising" ? " dash-splash-title-top" : ""}`}>My Mirror</div>
      {stage === "rising" && (
        <div className="dash-reveal" style={{ width: "100%", maxWidth: 320 }}>
          <div className="dash-splash-ring"><Sun size={22} /></div>
          <p className="dash-splash-heading">Alles wird zusammengeführt …</p>
          <div className="dash-score-bar-track" style={{ maxWidth: 260, margin: "0 auto" }}>
            <div className="dash-score-bar-fill" style={{ width: `${Math.min(100, step * 30 + 10)}%`, background: "var(--forest)" }} />
          </div>
          <p className="dash-score-meta" style={{ textAlign: "center", marginTop: 6 }}>Deine Daten werden synchronisiert</p>

          <div className="dash-splash-checklist">
            {items.map((it, i) => (
              <div className="dash-splash-item" key={i}>
                <div className="dash-splash-item-icon">{it.icon}</div>
                <span style={{ flex: 1 }}>{it.label}</span>
                {step > i ? <span style={{ color: "var(--forest)" }}>✓</span> : <span className="dash-splash-spinner" />}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

// Dezentes Vibrations-Feedback. Hinweis: iPhones/Safari unterstützen die Vibration-API
// nicht — dort passiert einfach nichts; auf Android-Geräten gibt es einen kurzen Impuls.
function haptic(ms = 10) {
  try {
    if (typeof navigator !== "undefined" && typeof navigator.vibrate === "function") navigator.vibrate(ms);
  } catch (error) {
    // Nicht kritisch — fehlende Vibration beeinträchtigt keine Daten.
  }
}

function greetingFor(date) {
  const h = date.getHours();
  if (h < 5) return "Gute Nacht";
  if (h < 11) return "Guten Morgen";
  if (h < 17) return "Guten Tag";
  if (h < 22) return "Guten Abend";
  return "Gute Nacht";
}

// Pulsierende Platzhalter-Zeilen, solange etwas lädt (z. B. KI-Analysen).
function SkeletonLines({ lines = 3 }) {
  const widths = [94, 80, 62, 88];
  return (
    <div className="dash-skeleton" aria-hidden="true">
      {Array.from({ length: lines }, (_, i) => (
        <div key={i} className="dash-skeleton-line" style={{ width: `${widths[i % widths.length]}%` }} />
      ))}
    </div>
  );
}

// Nach links wischen zum Löschen (Touch). Vertikales Scrollen wird erkannt und nicht
// blockiert; erst ab ~90px Wischweg wird wirklich gelöscht.
function SwipeToDelete({ onDelete, children }) {
  const [dx, setDx] = useState(0);
  const [dragging, setDragging] = useState(false);
  const [removing, setRemoving] = useState(false);
  const startRef = useRef(null);

  function onTouchStart(e) {
    startRef.current = { x: e.touches[0].clientX, y: e.touches[0].clientY, axis: null };
    setDragging(true);
  }
  function onTouchMove(e) {
    const st = startRef.current;
    if (!st) return;
    const mx = e.touches[0].clientX - st.x;
    const my = e.touches[0].clientY - st.y;
    if (st.axis === null && (Math.abs(mx) > 8 || Math.abs(my) > 8)) st.axis = Math.abs(mx) > Math.abs(my) ? "x" : "y";
    if (st.axis === "x") setDx(Math.max(-160, Math.min(0, mx)));
  }
  function onTouchEnd() {
    setDragging(false);
    startRef.current = null;
    if (dx < -90) {
      setRemoving(true);
      haptic(15);
      setTimeout(() => onDelete(), 260);
      setTimeout(() => { setRemoving(false); setDx(0); }, 900);
    } else {
      setDx(0);
    }
  }

  return (
    <div className={`dash-swipe${removing ? " dash-swipe-removing" : ""}`}>
      <div className="dash-swipe-bg" style={{ opacity: Math.min(1, -dx / 90) }}><Trash2 size={15} /> Löschen</div>
      <div
        className="dash-swipe-fg"
        style={{ transform: `translateX(${removing ? -420 : dx}px)`, transition: dragging ? "none" : "transform 0.4s cubic-bezier(0.22, 1, 0.36, 1)" }}
        onTouchStart={onTouchStart}
        onTouchMove={onTouchMove}
        onTouchEnd={onTouchEnd}
      >
        {children}
      </div>
    </div>
  );
}

// Zählt aufeinanderfolgende Wochen mit mindestens einem Lauf oder Gym-Training.
// Bewusst Wochen statt Tage: eine Tages-Serie würde dazu verleiten, Ruhetage
// auszulassen — das passt nicht zum Ziel einer gesunden, nachhaltigen Belastung.
function computeWeekStreak(runs, gymSessions) {
  const dates = [...runs.map((r) => r.date), ...gymSessions.map((s) => s.date)]
    .map((d) => new Date(d))
    .filter((d) => !isNaN(d.getTime()));
  if (!dates.length) return 0;
  const now = new Date();
  const hasActivity = (offset) => {
    const w = weekWindow(offset, now);
    return dates.some((d) => d >= w.start && d < w.end);
  };
  let offset = hasActivity(0) ? 0 : 1; // laufende Woche bricht die Serie noch nicht
  let n = 0;
  while (n < 520 && hasActivity(offset)) { n++; offset++; }
  return n;
}

function WeeklyRingsCard({ runs, gymSessions, sleepEntries, trainingPlan, trainingPlanGym }) {
  const rings = useMemo(() => {
    const w = weekWindow(0, new Date());
    const inWeek = (d) => { const t = new Date(d); return t >= w.start && t < w.end; };
    const km = runs.filter((r) => inWeek(r.date)).reduce((sum, r) => sum + (r.distanceKm || 0), 0);
    const kmTarget = trainingPlan?.targetKmPerWeek > 0 ? trainingPlan.targetKmPerWeek : 15;
    const gym = gymSessions.filter((s) => inWeek(s.date)).length;
    const gymTarget = trainingPlanGym?.targetSessionsPerWeek > 0 ? trainingPlanGym.targetSessionsPerWeek : 3;
    const goodNights = new Set(
      sleepEntries
        .filter((e) => e.type !== "nap" && inWeek(e.date) && (sleepDurationSec(e) || 0) >= 7 * 3600)
        .map((e) => toDateKey(e.date))
    ).size;
    return [
      { key: "run", label: "Laufen", value: km, target: kmTarget, text: `${fmtNum(km, 1)} / ${kmTarget} km`, color: "var(--c-run)" },
      { key: "gym", label: "Gym", value: gym, target: gymTarget, text: `${gym} / ${gymTarget} Trainings`, color: "var(--c-gym)" },
      { key: "sleep", label: "Schlaf ≥ 7 h", value: goodNights, target: 7, text: `${goodNights} / 7 Nächte`, color: "var(--c-sleep)" },
    ];
  }, [runs, gymSessions, sleepEntries, trainingPlan, trainingPlanGym]);
  const streak = useMemo(() => computeWeekStreak(runs, gymSessions), [runs, gymSessions]);

  // Ringe starten bei 0 und füllen sich nach dem ersten Rendern sichtbar auf.
  const [mounted, setMounted] = useState(false);
  useEffect(() => {
    const id = requestAnimationFrame(() => setMounted(true));
    return () => cancelAnimationFrame(id);
  }, []);

  const radii = [52, 40, 28];
  return (
    <div className="dash-card">
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 8, marginBottom: 12, flexWrap: "wrap" }}>
        <h3 className="dash-card-title" style={{ margin: 0 }}>Diese Woche</h3>
        {streak > 0 && <span className="dash-streak">🔥 {streak} {streak === 1 ? "Woche" : "Wochen"} in Folge aktiv</span>}
      </div>
      <div className="dash-rings">
        <svg width="124" height="124" viewBox="0 0 124 124" aria-hidden="true">
          {rings.map((r, i) => {
            const rad = radii[i];
            const c = 2 * Math.PI * rad;
            const frac = mounted ? Math.min(1, r.target > 0 ? r.value / r.target : 0) : 0;
            return (
              <g key={r.key}>
                <circle cx="62" cy="62" r={rad} fill="none" stroke="var(--line)" strokeWidth="9" />
                <circle
                  cx="62" cy="62" r={rad} fill="none" stroke={r.color} strokeWidth="9" strokeLinecap="round"
                  strokeDasharray={c} strokeDashoffset={c * (1 - frac)} transform="rotate(-90 62 62)"
                  style={{ transition: `stroke-dashoffset 1.1s cubic-bezier(0.22, 1, 0.36, 1) ${i * 0.12}s` }}
                />
              </g>
            );
          })}
        </svg>
        <div className="dash-ring-legend">
          {rings.map((r) => (
            <div className="dash-ring-row" key={r.key}>
              <span className="dash-ring-dot" style={{ background: r.color }} />
              <span style={{ flex: 1 }}>{r.label}</span>
              <span className="dash-score-meta" style={{ fontVariantNumeric: "tabular-nums" }}>{r.text}</span>
            </div>
          ))}
        </div>
      </div>
      <div className="dash-score-note" style={{ marginTop: 10 }}>Ziele kommen aus deinen Trainingsplänen — ohne Plan gelten 15 km und 3 Trainings pro Woche.</div>
    </div>
  );
}

const BACKUP_KEYS = [
  "journal-entries", "runs", "gym-sessions", "sleep-entries", "sleep-pending", "training-plan",
  "running-goals", "gym-training-plan", "pullup-entries", "gym-templates", "shoes", "todos",
  "overall-analysis", "week-analysis", "stats-analysis", "profile", "theme",
];
const RAW_STRING_KEYS = ["theme", "sleep-pending"];

function DataBackupCard() {
  const [open, setOpen] = useState(false);
  const [msg, setMsg] = useState("");
  const [err, setErr] = useState("");
  const [lastBackup, setLastBackup] = useState(null);

  useEffect(() => {
    (async () => {
      const r = await storage.get("last-backup");
      if (r && r.value) setLastBackup(r.value);
    })();
  }, []);

  async function exportBackup() {
    setMsg(""); setErr("");
    try {
      const data = {};
      for (const k of BACKUP_KEYS) {
        const r = await storage.get(k);
        if (r && r.value != null) data[k] = r.value;
      }
      const payload = JSON.stringify({ app: "my-mirror", version: 1, exportedAt: new Date().toISOString(), data }, null, 2);
      const blob = new Blob([payload], { type: "application/json" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `my-mirror-backup-${todayISO()}.json`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 2000);
      const nowIso = new Date().toISOString();
      await storage.set("last-backup", nowIso);
      setLastBackup(nowIso);
      setMsg("Backup erstellt — speichere die Datei an einem sicheren Ort (z. B. iCloud Drive).");
    } catch (error) {
      console.error("Backup-Export fehlgeschlagen:", error);
      setErr("Backup konnte nicht erstellt werden.");
    }
  }

  async function importBackup(e) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    setMsg(""); setErr("");
    try {
      const parsed = JSON.parse(await readFileAsText(file));
      if (!parsed || parsed.app !== "my-mirror" || typeof parsed.data !== "object" || parsed.data === null) {
        setErr("Das ist keine gültige My-Mirror-Backup-Datei.");
        return;
      }
      const keys = BACKUP_KEYS.filter((k) => typeof parsed.data[k] === "string");
      if (!keys.length) { setErr("Die Datei enthält keine Daten."); return; }
      // Vor dem Überschreiben prüfen, dass jeder JSON-Bereich auch wirklich lesbar ist.
      for (const k of keys) {
        if (!RAW_STRING_KEYS.includes(k)) JSON.parse(parsed.data[k]);
      }
      const when = parsed.exportedAt ? formatDateShort(parsed.exportedAt) : "unbekanntem Datum";
      if (!window.confirm(`Backup vom ${when} wiederherstellen? Deine aktuellen Daten werden dabei überschrieben.`)) return;
      let failed = 0;
      for (const k of keys) {
        const ok = await storage.set(k, parsed.data[k]);
        if (!ok) failed++;
      }
      if (failed) { setErr(`${failed} Bereich(e) konnten nicht wiederhergestellt werden.`); return; }
      window.location.reload();
    } catch (error) {
      console.error("Backup-Import fehlgeschlagen:", error);
      setErr("Die Datei konnte nicht gelesen werden.");
    }
  }

  const daysSince = lastBackup ? Math.floor((Date.now() - new Date(lastBackup).getTime()) / DAY) : null;

  return (
    <div className="dash-card" style={{ marginTop: 18 }}>
      <button
        onClick={() => setOpen((v) => !v)}
        style={{ width: "100%", display: "flex", justifyContent: "space-between", alignItems: "center", background: "none", border: "none", cursor: "pointer", padding: 0, font: "inherit", color: "inherit" }}
      >
        <h3 className="dash-card-title" style={{ margin: 0 }}>Daten & Backup</h3>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <span style={{ fontSize: 13, color: daysSince == null || daysSince > 14 ? "var(--ochre)" : "var(--muted)" }}>
            {daysSince == null ? "noch kein Backup" : daysSince === 0 ? "heute gesichert" : `vor ${daysSince} ${daysSince === 1 ? "Tag" : "Tagen"}`}
          </span>
          {open ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
        </div>
      </button>
      <div className={`dash-collapse${open ? " dash-collapse-open" : ""}`}>
        <div className="dash-collapse-inner">
          <p className="dash-score-meta" style={{ margin: "14px 0 12px", lineHeight: 1.5 }}>
            Deine Daten liegen nur auf diesem Gerät. Ein Backup sichert alles in einer Datei, die du jederzeit wieder einspielen kannst — z. B. nach dem Löschen der Browserdaten oder auf einem neuen Handy.
          </p>
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            <button className="dash-btn dash-btn-primary" onClick={exportBackup}><Upload size={15} style={{ transform: "rotate(180deg)" }} /> Backup herunterladen</button>
            <label className="dash-btn" style={{ cursor: "pointer" }}>
              <Upload size={15} /> Backup einspielen
              <input type="file" accept="application/json,.json" style={{ display: "none" }} onChange={importBackup} />
            </label>
          </div>
          {msg && <div className="dash-import-msg" style={{ marginTop: 10 }}>{msg}</div>}
          {err && <div style={{ color: "var(--red)", fontSize: 13, marginTop: 10 }}>{err}</div>}
        </div>
      </div>
    </div>
  );
}

function TodosSummaryCard({ todos, onOpen }) {
  const openCount = todos.filter((t) => !t.done).length;
  const doneCount = todos.filter((t) => t.done).length;
  const pct = todos.length === 0 ? null : Math.round((doneCount / todos.length) * 100);

  return (
    <div className="dash-score-card" style={{ cursor: "pointer" }} onClick={() => onOpen("todos")} role="button" tabIndex={0}>
      <div className="dash-score-top">
        <div>
          <h3 className="dash-score-name">To-Dos</h3>
          <div className="dash-score-status" style={{ color: "var(--muted)" }}>
            {todos.length === 0 ? "Noch keine To-Dos" : `${doneCount} von ${todos.length} erledigt`}
          </div>
        </div>
        {openCount > 0 && <span className="dash-badge">{openCount}</span>}
      </div>
      {pct != null && (
        <div className="dash-score-bar-track"><div className="dash-score-bar-fill" style={{ width: `${pct}%`, background: "var(--forest)" }} /></div>
      )}
    </div>
  );
}

// ---------- Home hub ----------

function Home({ runs, gymSessions, journal, todos, sleepEntries, persistSleepEntries, pendingBedtime, setPendingBedtime, trainingPlan, trainingPlanGym, profile, addWeightEntry, overallAnalysis, setOverallAnalysis, onOpen }) {
  const kmTotal = useMemo(() => runs.reduce((s, r) => s + r.distanceKm, 0), [runs]);

  function quickBedtime() {
    startSleep(setPendingBedtime);
  }
  async function quickWake() {
    await finishSleep(pendingBedtime, sleepEntries, persistSleepEntries, setPendingBedtime);
  }

  return (
    <>
      <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap", marginBottom: 16 }}>
        <button className="dash-btn dash-btn-sm" onClick={quickBedtime}>🛌 Schlafengehen</button>
        <button className="dash-btn dash-btn-sm" onClick={quickWake} disabled={!pendingBedtime} title={!pendingBedtime ? "Bitte zuerst „Schlafengehen“ erfassen" : undefined}>☀️ Aufgestanden</button>
        {pendingBedtime && <span className="dash-score-meta">seit {formatTimeShort(pendingBedtime)}</span>}
      </div>
      <CalendarProgressCard profile={profile} journal={journal} runs={runs} gymSessions={gymSessions} todos={todos} sleepEntries={sleepEntries} />
      <TodosSummaryCard todos={todos} onOpen={onOpen} />
      <WeeklyRingsCard runs={runs} gymSessions={gymSessions} sleepEntries={sleepEntries} trainingPlan={trainingPlan} trainingPlanGym={trainingPlanGym} />
      <TrainingStatusCard runs={runs} gymSessions={gymSessions} sleepEntries={sleepEntries} plan={trainingPlan} />
      <OverallAnalysisCard runs={runs} gymSessions={gymSessions} journal={journal} sleepEntries={sleepEntries} trainingPlan={trainingPlan} overallAnalysis={overallAnalysis} setOverallAnalysis={setOverallAnalysis} />
      <WeightCard profile={profile} addWeightEntry={addWeightEntry} onOpen={onOpen} />

      <div className="dash-grid">
        <button className="dash-area-card" onClick={() => onOpen("runs")}>
          <div className="dash-area-card-top"><div className="dash-area-icon"><Activity size={18} /></div><ChevronRight size={16} color="var(--muted)" /></div>
          <h3>Läufe</h3>
          <p>{runs.length === 0 ? "Noch keine Läufe" : `${runs.length} Lauf${runs.length === 1 ? "" : "e"} · ${fmtNum(kmTotal, 1)} km`}</p>
        </button>
        <button className="dash-area-card" onClick={() => onOpen("gym")}>
          <div className="dash-area-card-top"><div className="dash-area-icon"><Dumbbell size={18} /></div><ChevronRight size={16} color="var(--muted)" /></div>
          <h3>Gym</h3>
          <p>{gymSessions.length === 0 ? "Noch keine Trainings" : `${gymSessions.length} Training${gymSessions.length === 1 ? "" : "s"}`}</p>
        </button>
        <button className="dash-area-card" onClick={() => onOpen("weekcompare")}>
          <div className="dash-area-card-top"><div className="dash-area-icon"><TrendingUp size={18} /></div><ChevronRight size={16} color="var(--muted)" /></div>
          <h3>Wochenvergleich</h3>
          <p>Diese Woche im Vergleich zur letzten</p>
        </button>
        <button className="dash-area-card" onClick={() => onOpen("schlafen")}>
          <div className="dash-area-card-top"><div className="dash-area-icon"><Moon size={18} /></div><ChevronRight size={16} color="var(--muted)" /></div>
          <h3>Schlafen</h3>
          <p>{sleepEntries.length === 0 ? "Noch keine Einträge" : `${sleepEntries.length} Eintrag${sleepEntries.length === 1 ? "" : "e"}`}</p>
        </button>
        <button className="dash-area-card" onClick={() => onOpen("journal")}>
          <div className="dash-area-card-top"><div className="dash-area-icon"><BookOpen size={18} /></div><ChevronRight size={16} color="var(--muted)" /></div>
          <h3>Tagebuch</h3>
          <p>{journal.length === 0 ? "Noch keine Einträge" : `${journal.length} Eintrag${journal.length === 1 ? "" : "e"}`}</p>
        </button>
        <div className="dash-area-card disabled">
          <div className="dash-area-card-top"><div className="dash-area-icon" style={{ background: "var(--line)", color: "var(--muted)" }}><Plus size={18} /></div></div>
          <h3 style={{ color: "var(--muted)" }}>Bald mehr</h3>
          <p>Weitere Bereiche kommen hier hin</p>
        </div>
      </div>

      <DataBackupCard />
    </>
  );
}

// ---------- Journal area ----------

function JournalArea({ journal, persistJournal }) {
  const [jDate, setJDate] = useState(todayISO());
  const [jCategory, setJCategory] = useState("Reflexion");
  const [jText, setJText] = useState("");
  const sorted = useMemo(() => [...journal].sort((a, b) => new Date(b.date) - new Date(a.date)), [journal]);

  function addEntry(e) {
    e.preventDefault();
    if (!jText.trim()) return;
    persistJournal([{ id: uid(), date: jDate, category: jCategory, text: jText.trim() }, ...journal]);
    setJText("");
  }
  function deleteEntry(id) { persistJournal(journal.filter((en) => en.id !== id)); }

  return (
    <>
      <div className="dash-card">
        <h3 className="dash-card-title">Neuer Eintrag</h3>
        <form onSubmit={addEntry}>
          <div className="dash-form-row">
            <input type="date" className="dash-input" value={jDate} onChange={(e) => setJDate(e.target.value)} />
            <select className="dash-select" value={jCategory} onChange={(e) => setJCategory(e.target.value)}>
              {CATEGORIES.map((c) => <option key={c.key} value={c.key}>{c.key}</option>)}
            </select>
          </div>
          <textarea className="dash-textarea" placeholder="Was beschäftigt dich? Was willst du erreichen?" value={jText} onChange={(e) => setJText(e.target.value)} />
          <div style={{ marginTop: 10 }}><button type="submit" className="dash-btn dash-btn-primary" disabled={!jText.trim()}><Plus size={15} /> Eintrag speichern</button></div>
        </form>
      </div>
      <div className="dash-card">
        <h3 className="dash-card-title">Alle Einträge</h3>
        {sorted.length === 0 ? <p className="dash-empty">Noch keine Einträge vorhanden.</p> : sorted.map((e) => (
          <SwipeToDelete key={e.id} onDelete={() => deleteEntry(e.id)}><div className="dash-entry">
            <div className="dash-entry-date">{formatDateShort(e.date)}</div>
            <div className="dash-entry-body">
              <span className="dash-tag" style={{ background: CATEGORIES.find((c) => c.key === e.category)?.color, color: e.category === "Ziel" ? "var(--ink)" : "#fff" }}>{e.category}</span>
              <p className="dash-entry-text">{e.text}</p>
            </div>
            <button className="dash-del" onClick={() => deleteEntry(e.id)} title="Löschen"><Trash2 size={15} /></button>
          </div></SwipeToDelete>
        ))}
      </div>
    </>
  );
}

// ---------- Runs area ----------

function RunsArea({ runs, persistRuns, shoes, persistShoes, gymSessions, sleepEntries, trainingPlan, setTrainingPlan, runningGoals, persistRunningGoals }) {
  const [showManualRun, setShowManualRun] = useState(false);
  const [showAllRuns, setShowAllRuns] = useState(false);
  const [showTextImport, setShowTextImport] = useState(false);
  const [textImportValue, setTextImportValue] = useState("");
  const [textImporting, setTextImporting] = useState(false);
  const [textImportMsg, setTextImportMsg] = useState("");
  const [textImportError, setTextImportError] = useState("");
  const [textImportPreview, setTextImportPreview] = useState(null);
  const [showDetails, setShowDetails] = useState(false);
  const [rDate, setRDate] = useState(todayISO());
  const [rName, setRName] = useState("");
  const [rDistance, setRDistance] = useState("");
  const [rDuration, setRDuration] = useState("");
  const [rRpe, setRRpe] = useState("");
  const [rElevationUp, setRElevationUp] = useState("");
  const [rElevationDown, setRElevationDown] = useState("");
  const [rHrAvg, setRHrAvg] = useState("");
  const [rHrMax, setRHrMax] = useState("");
  const [rCadence, setRCadence] = useState("");
  const [rShoeId, setRShoeId] = useState("");
  const [rError, setRError] = useState("");
  const [expandedId, setExpandedId] = useState(null);
  const [noteBusyId, setNoteBusyId] = useState(null);
  const [noteErrors, setNoteErrors] = useState({});

  const sortedRuns = useMemo(() => [...runs].sort((a, b) => new Date(b.date) - new Date(a.date)), [runs]);

  const stats = useMemo(() => {
    const totalKm = runs.reduce((s, r) => s + r.distanceKm, 0);
    const now = new Date();
    const weekStart = new Date(now);
    const dow = (weekStart.getDay() + 6) % 7;
    weekStart.setDate(weekStart.getDate() - dow);
    weekStart.setHours(0, 0, 0, 0);
    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
    const yearStart = new Date(now.getFullYear(), 0, 1);
    const kmThisWeek = runs.filter((r) => new Date(r.date) >= weekStart).reduce((s, r) => s + r.distanceKm, 0);
    const kmThisMonth = runs.filter((r) => new Date(r.date) >= monthStart).reduce((s, r) => s + r.distanceKm, 0);
    const kmThisYear = runs.filter((r) => new Date(r.date) >= yearStart).reduce((s, r) => s + r.distanceKm, 0);
    const totalDur = runs.reduce((s, r) => s + (r.durationSec || 0), 0);
    const over5 = runs.filter((r) => r.distanceKm >= 5).length;
    const over10 = runs.filter((r) => r.distanceKm >= 10).length;
    return { totalKm, kmThisWeek, kmThisMonth, kmThisYear, count: runs.length, over5, over10, avgPace: paceMinPerKm(totalKm, totalDur) };
  }, [runs]);

  const weeklyData = useMemo(() => weeklyKmSeries(runs, 8), [runs]);

  const PACE_BUCKETS = [
    { key: "b1", label: "Bis 2 km", test: (km) => km < 2 },
    { key: "b2", label: "2 bis unter 5 km", test: (km) => km >= 2 && km < 5 },
    { key: "b3", label: "5 bis unter 10 km", test: (km) => km >= 5 && km < 10 },
    { key: "b4", label: "10 bis unter 20 km", test: (km) => km >= 10 && km < 20 },
    { key: "b5", label: "Ab 20 km", test: (km) => km >= 20 },
  ];
  const paceTrendBuckets = useMemo(() => {
    return PACE_BUCKETS.map((b) => ({
      ...b,
      data: [...runs]
        .filter((r) => r.distanceKm && r.durationSec && b.test(r.distanceKm))
        .sort((a, b2) => new Date(a.date) - new Date(b2.date))
        .map((r) => ({ label: formatDateShort(r.date), pace: Math.round(paceMinPerKm(r.distanceKm, r.durationSec) * 100) / 100 })),
    })).filter((b) => b.data.length >= 2);
  }, [runs]);

  function deleteRun(id) { persistRuns(runs.filter((r) => r.id !== id)); }
  function changeRun(updated) { persistRuns(runs.map((r) => (r.id === updated.id ? updated : r))); }

  function addManualRun(e) {
    e.preventDefault();
    setRError("");
    if (!validateDate(rDate)) return setRError("Bitte ein gültiges Datum angeben.");
    const dist = parsePositiveNumber(rDistance, { max: 500 });
    if (dist === null) return setRError("Bitte eine gültige Distanz in km angeben (0–500).");
    const dur = parseDurationInput(rDuration.trim());
    if (!dur || dur <= 0) return setRError("Bitte die Dauer als mm:ss oder h:mm:ss angeben.");
    const rpe = rRpe ? parseIntegerInRange(rRpe, 1, 5) : null;
    if (rRpe && rpe === null) return setRError("Anstrengung (RPE) muss zwischen 1 und 5 liegen.");
    const elevationUp = rElevationUp ? parseNonNegativeNumber(rElevationUp, { max: 15000 }) : null;
    if (rElevationUp && elevationUp === null) return setRError("Höhenmeter aufwärts sind ungültig.");
    const elevationDown = rElevationDown ? parseNonNegativeNumber(rElevationDown, { max: 15000 }) : null;
    if (rElevationDown && elevationDown === null) return setRError("Höhenmeter abwärts sind ungültig.");
    const hrAvg = rHrAvg ? parseIntegerInRange(rHrAvg, 20, 250) : null;
    if (rHrAvg && hrAvg === null) return setRError("Herzfrequenz Ø ist unrealistisch — bitte prüfen (20–250 bpm).");
    const hrMax = rHrMax ? parseIntegerInRange(rHrMax, 20, 250) : null;
    if (rHrMax && hrMax === null) return setRError("Herzfrequenz max ist unrealistisch — bitte prüfen (20–250 bpm).");
    const cadence = rCadence ? parseIntegerInRange(rCadence, 0, 300) : null;
    if (rCadence && cadence === null) return setRError("Kadenz ist unrealistisch — bitte prüfen (0–300 Schritte/min).");
    const run = {
      id: uid(), name: rName.trim() || "Lauf", date: rDate, distanceKm: dist, durationSec: dur, source: "manuell",
      rpe, elevationUp, elevationDown, hrAvg, hrMax, cadence,
      shoeId: rShoeId || null, note: null,
    };
    persistRuns([run, ...runs]);
    setRName(""); setRDistance(""); setRDuration(""); setRRpe(""); setRElevationUp(""); setRElevationDown(""); setRHrAvg(""); setRHrMax(""); setRCadence(""); setRShoeId("");
    setShowManualRun(false); setShowDetails(false);
  }

  async function handleTextImport() {
    if (!textImportValue.trim()) return;
    setTextImporting(true); setTextImportMsg(""); setTextImportError(""); setTextImportPreview(null);
    try {
      const year = new Date().getFullYear();
      const prompt =
        `Hier sind Lauf-Daten, die ich importieren möchte (z.B. aus einer anderen App kopiert oder handschriftlich):\n\n${textImportValue.trim()}\n\n` +
        `Extrahiere daraus jeden einzelnen Lauf. Antworte NUR mit einem JSON-Array, ohne Erklärung, ohne Markdown-Codeblock. Jedes Element hat genau diese Felder: {"date": "YYYY-MM-DD", "name": string, "distanceKm": number, "durationSec": number, "elevationUp": number oder null, "elevationDown": number oder null, "hrAvg": number oder null, "hrMax": number oder null, "cadence": number oder null}. date, distanceKm und durationSec sind Pflicht — wenn du sie für einen Lauf nicht sicher ermitteln kannst, lass diesen Lauf komplett weg. Ist kein Jahr angegeben, nimm ${year} an, außer der Text deutet klar auf ein anderes Jahr hin.`;
      const raw = await askClaude(prompt, 1500);
      const cleaned = raw.replace(/```json|```/g, "").trim();
      let parsed;
      try {
        parsed = JSON.parse(cleaned);
      } catch (parseErr) {
        console.error("KI-Textimport: Antwort war kein gültiges JSON:", raw);
        setTextImportError("Die KI-Antwort konnte nicht gelesen werden. Versuch es gleich noch einmal.");
        return;
      }
      if (!Array.isArray(parsed)) {
        console.error("KI-Textimport: erwartetes Array, erhalten:", parsed);
        setTextImportError("Unerwartetes Format von der KI erhalten. Versuch es gleich noch einmal.");
        return;
      }
      // Validierungsschicht: nichts aus der KI-Antwort wird ungeprüft übernommen.
      // Jeder Lauf muss plausible, endliche Werte in sinnvollen Bereichen haben.
      const validRuns = parsed
        .filter((r) => {
          if (!r || typeof r !== "object") return false;
          if (!validateDate(r.date)) return false;
          if (typeof r.distanceKm !== "number" || !isFinite(r.distanceKm) || r.distanceKm <= 0 || r.distanceKm > 500) return false;
          if (typeof r.durationSec !== "number" || !isFinite(r.durationSec) || r.durationSec <= 0 || r.durationSec > 86400) return false;
          return true;
        })
        .map((r) => ({
          id: uid(), name: (typeof r.name === "string" && r.name.trim()) || "Lauf", date: r.date, distanceKm: r.distanceKm, durationSec: r.durationSec, source: "text",
          elevationUp: typeof r.elevationUp === "number" && isFinite(r.elevationUp) && r.elevationUp >= 0 ? r.elevationUp : null,
          elevationDown: typeof r.elevationDown === "number" && isFinite(r.elevationDown) && r.elevationDown >= 0 ? r.elevationDown : null,
          hrAvg: typeof r.hrAvg === "number" && isFinite(r.hrAvg) && r.hrAvg > 20 && r.hrAvg < 250 ? Math.round(r.hrAvg) : null,
          hrMax: typeof r.hrMax === "number" && isFinite(r.hrMax) && r.hrMax > 20 && r.hrMax < 250 ? Math.round(r.hrMax) : null,
          cadence: typeof r.cadence === "number" && isFinite(r.cadence) && r.cadence >= 0 && r.cadence < 300 ? Math.round(r.cadence) : null,
          rpe: null, shoeId: null, note: null,
        }));
      if (!validRuns.length) { setTextImportError("Es konnten keine Läufe erkannt werden. Versuch es mit mehr Details (Datum, Distanz, Dauer)."); return; }
      // Vorschau statt sofortigem Speichern — erst nach Bestätigung wird übernommen.
      setTextImportPreview(validRuns);
    } catch (error) {
      console.error("KI-Textimport fehlgeschlagen:", error);
      setTextImportError("Die Daten konnten nicht erkannt werden. Versuch es gleich noch einmal oder formuliere es etwas klarer.");
    } finally {
      setTextImporting(false);
    }
  }

  async function confirmTextImport() {
    if (!textImportPreview || !textImportPreview.length) return;
    await persistRuns([...textImportPreview, ...runs]);
    setTextImportMsg(`${textImportPreview.length} Lauf${textImportPreview.length === 1 ? "" : "e"} importiert.`);
    setTextImportPreview(null);
    setTextImportValue("");
  }
  function discardTextImport() {
    setTextImportPreview(null);
  }

  async function generateRunNote(run) {
    setNoteBusyId(run.id);
    setNoteErrors((prev) => ({ ...prev, [run.id]: "" }));
    try {
      const others = runs.filter((r) => r.id !== run.id).sort((a, b) => new Date(b.date) - new Date(a.date)).slice(0, 8);
      let compareLine = "";
      if (others.length >= 2) {
        const avgKm = others.reduce((s, r) => s + r.distanceKm, 0) / others.length;
        const avgDur = others.reduce((s, r) => s + r.durationSec, 0) / others.length;
        const othersWithHr = others.filter((r) => r.hrAvg);
        const avgHr = othersWithHr.length ? othersWithHr.reduce((s, r) => s + r.hrAvg, 0) / othersWithHr.length : null;
        compareLine = `Zum Vergleich, die letzten Läufe davor lagen im Schnitt bei ${fmtNum(avgKm, 1)} km und ${formatPace(paceMinPerKm(avgKm, avgDur))}` + (avgHr ? `, bei durchschnittlich ${Math.round(avgHr)} bpm.` : ".");
      }
      const pace = paceMinPerKm(run.distanceKm, run.durationSec);
      const detailLines = [];
      if (run.elevationUp != null || run.elevationDown != null) detailLines.push(`Höhenmeter: ${run.elevationUp ?? "–"} m aufwärts, ${run.elevationDown ?? "–"} m abwärts`);
      if (run.hrAvg != null || run.hrMax != null) detailLines.push(`Herzfrequenz: Ø ${run.hrAvg ?? "–"} / max ${run.hrMax ?? "–"} bpm`);
      if (run.cadence != null) detailLines.push(`Kadenz: ${run.cadence} Schritte/min`);
      const rpeLine = run.rpe != null ? `Selbst eingeschätzte Anstrengung (RPE 1-5): ${run.rpe}.` : "";
      const prompt =
        `Ein Lauf vom ${formatDateShort(run.date)}: ${fmtNum(run.distanceKm, 2)} km in ${formatDuration(run.durationSec)}, ${formatPace(pace)}. ${detailLines.join(", ")}. ${compareLine} ${rpeLine} ` +
        `Bewerte diesen Lauf eigenständig im Vergleich zu den anderen Läufen anhand der Daten (Pace, Distanz, Herzfrequenz, Höhenmeter) — unabhängig von der selbst eingeschätzten Anstrengung, falls angegeben; die ist nur zusätzlicher Kontext, kein Maßstab. Gib dazu einen kurzen, freundlichen Kommentar in 1-2 Sätzen, nicht nur ob es ein Rekord war, sondern ob er zum bisherigen Training passt und der Erholung guttut. Auf Deutsch, ohne Aufzählungszeichen, ohne Anrede.`;
      const text = await askClaude(prompt, 220);
      const next = runs.map((r) => (r.id === run.id ? { ...r, note: text || "Keine Auswertung erhalten." } : r));
      await persistRuns(next);
    } catch {
      setNoteErrors((prev) => ({ ...prev, [run.id]: "Kurzanalyse konnte nicht geladen werden." }));
    } finally {
      setNoteBusyId(null);
    }
  }

  return (
    <>
      <div className="dash-stats">
        <div className="dash-stat"><div className="dash-stat-val">{fmtNum(stats.kmThisWeek, 1)}</div><div className="dash-stat-label">km diese Woche</div></div>
        <div className="dash-stat"><div className="dash-stat-val">{fmtNum(stats.kmThisMonth, 1)}</div><div className="dash-stat-label">km diesen Monat</div></div>
        <div className="dash-stat"><div className="dash-stat-val">{fmtNum(stats.kmThisYear, 1)}</div><div className="dash-stat-label">km dieses Jahr</div></div>
        <div className="dash-stat"><div className="dash-stat-val">{stats.count}</div><div className="dash-stat-label">Läufe insgesamt</div></div>
        <div className="dash-stat"><div className="dash-stat-val">{stats.over5}</div><div className="dash-stat-label">Läufe über 5 km</div></div>
        <div className="dash-stat"><div className="dash-stat-val">{stats.over10}</div><div className="dash-stat-label">Läufe über 10 km</div></div>
        <div className="dash-stat"><div className="dash-stat-val">{fmtNum(stats.totalKm, 1)}</div><div className="dash-stat-label">km insgesamt</div></div>
        <div className="dash-stat"><div className="dash-stat-val">{formatPace(stats.avgPace).replace(" min/km", "")}</div><div className="dash-stat-label">Ø Pace (min/km)</div></div>
      </div>

      <div className="dash-card">
        <h3 className="dash-card-title">Kilometer pro Woche</h3>
        {runs.length === 0 ? <p className="dash-empty">Noch keine Läufe importiert.</p> : (
          <div style={{ width: "100%", height: 170 }}>
            <ResponsiveContainer>
              <BarChart data={weeklyData}>
                <CartesianGrid vertical={false} stroke="var(--line)" />
                <XAxis dataKey="label" tick={{ fontSize: 11, fill: "var(--muted)" }} axisLine={{ stroke: "var(--line)" }} tickLine={false} />
                <YAxis tick={{ fontSize: 11, fill: "var(--muted)" }} axisLine={false} tickLine={false} width={30} />
                <Tooltip formatter={(v) => [`${v} km`, "Distanz"]} contentStyle={{ fontSize: 12, fontFamily: "Inter" }} />
                <Bar dataKey="km" fill="var(--forest)" radius={[2, 2, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        )}
      </div>

      <div className="dash-card">
        <h3 className="dash-card-title">Lauf hinzufügen</h3>
        <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
          <button className="dash-btn" onClick={() => setShowTextImport((v) => !v)}><Sparkles size={15} /> Text einfügen</button>
          <button className="dash-btn" onClick={() => setShowManualRun((v) => !v)}><Plus size={15} /> Lauf manuell eintragen</button>
        </div>
        {showTextImport && (
          <div style={{ marginTop: 14, borderTop: "1px solid var(--line)", paddingTop: 14 }}>
            <textarea
              className="dash-textarea"
              placeholder="Füge hier Lauf-Daten ein, z.B. kopiert aus einer anderen App: Datum, Distanz, Dauer — die KI erkennt daraus die einzelnen Läufe."
              value={textImportValue}
              onChange={(e) => setTextImportValue(e.target.value)}
            />
            <div style={{ marginTop: 10 }}>
              <button className="dash-btn dash-btn-primary" onClick={handleTextImport} disabled={textImporting || !textImportValue.trim()}>
                <Sparkles size={15} /> {textImporting ? "Erkenne Läufe …" : "Läufe erkennen"}
              </button>
            </div>
            {textImportMsg && <div className="dash-import-msg">{textImportMsg}</div>}
            {textImportError && <div style={{ color: "var(--red)", fontSize: 13, marginTop: 8 }}>{textImportError}</div>}
            {textImportPreview && (
              <div style={{ marginTop: 12, borderTop: "1px solid var(--line)", paddingTop: 12 }}>
                <div style={{ fontSize: 13.5, marginBottom: 8 }}>
                  {textImportPreview.length} Lauf{textImportPreview.length === 1 ? "" : "e"} erkannt — bitte kurz prüfen, bevor du übernimmst:
                </div>
                {textImportPreview.map((r) => (
                  <div key={r.id} style={{ fontSize: 13, padding: "5px 0", borderTop: "1px solid var(--line)" }}>
                    {formatDateShort(r.date)}: {r.name} — {fmtNum(r.distanceKm, 2)} km, {formatDuration(r.durationSec)}
                  </div>
                ))}
                <div style={{ display: "flex", gap: 8, marginTop: 10 }}>
                  <button className="dash-btn dash-btn-primary" onClick={confirmTextImport}>Übernehmen</button>
                  <button className="dash-btn" onClick={discardTextImport}>Verwerfen</button>
                </div>
              </div>
            )}
          </div>
        )}
        {showManualRun && (
          <form onSubmit={addManualRun} style={{ marginTop: 14, borderTop: "1px solid var(--line)", paddingTop: 14 }}>
            <div className="dash-form-row">
              <input type="date" className="dash-input" value={rDate} onChange={(e) => setRDate(e.target.value)} />
              <input type="text" className="dash-input" placeholder="Name (optional)" value={rName} onChange={(e) => setRName(e.target.value)} />
            </div>
            <div className="dash-form-row">
              <input type="text" className="dash-input" placeholder="Distanz in km, z.B. 5.2" value={rDistance} onChange={(e) => setRDistance(e.target.value)} style={{ width: 160 }} />
              <input type="text" className="dash-input" placeholder="Dauer, z.B. 28:30" value={rDuration} onChange={(e) => setRDuration(e.target.value)} style={{ width: 160 }} />
            </div>
            {(() => {
              const d = parseFloat(rDistance.replace(",", "."));
              const t = parseDurationInput(rDuration.trim());
              const p = d && t ? paceMinPerKm(d, t) : null;
              return (
                <div style={{ fontSize: 13, color: "var(--muted)", marginBottom: 10 }}>
                  Pace: {p ? formatPace(p) : "wird aus Distanz und Dauer berechnet"}
                </div>
              );
            })()}
            <button type="button" className="dash-btn dash-btn-sm" onClick={() => setShowDetails((v) => !v)} style={{ marginBottom: 10 }}>
              {showDetails ? <ChevronUp size={13} /> : <ChevronDown size={13} />} Mehr Details
            </button>
            {showDetails && (
              <>
                <div className="dash-form-row">
                  <select className="dash-select" value={rRpe} onChange={(e) => setRRpe(e.target.value)}>
                    <option value="">Anstrengung (RPE) –</option>
                    <option value="1">1 – sehr leicht</option>
                    <option value="2">2 – leicht</option>
                    <option value="3">3 – moderat</option>
                    <option value="4">4 – hart</option>
                    <option value="5">5 – maximal</option>
                  </select>
                  <input type="text" className="dash-input" placeholder="Höhenmeter aufwärts (m)" value={rElevationUp} onChange={(e) => setRElevationUp(e.target.value)} style={{ width: 165 }} />
                  <input type="text" className="dash-input" placeholder="Höhenmeter abwärts (m)" value={rElevationDown} onChange={(e) => setRElevationDown(e.target.value)} style={{ width: 165 }} />
                </div>
                <div className="dash-form-row">
                  <input type="text" className="dash-input" placeholder="HF Ø (bpm)" value={rHrAvg} onChange={(e) => setRHrAvg(e.target.value)} style={{ width: 110 }} />
                  <input type="text" className="dash-input" placeholder="HF max (bpm)" value={rHrMax} onChange={(e) => setRHrMax(e.target.value)} style={{ width: 110 }} />
                  <input type="text" className="dash-input" placeholder="Kadenz (Schritte/min)" value={rCadence} onChange={(e) => setRCadence(e.target.value)} style={{ width: 170 }} />
                </div>
                {shoes.length > 0 && (
                  <div className="dash-form-row">
                    <select className="dash-select" value={rShoeId} onChange={(e) => setRShoeId(e.target.value)}>
                      <option value="">Schuhe –</option>
                      {shoes.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
                    </select>
                  </div>
                )}
              </>
            )}
            {rError && <div style={{ color: "var(--red)", fontSize: 13, marginBottom: 8 }}>{rError}</div>}
            <button type="submit" className="dash-btn dash-btn-primary">Lauf speichern</button>
          </form>
        )}
      </div>

      {!showAllRuns ? (
        <button className="dash-card" style={{ width: "100%", textAlign: "left", cursor: "pointer", display: "block" }} onClick={() => setShowAllRuns(true)}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <h3 className="dash-card-title" style={{ margin: 0 }}>Alle Läufe</h3>
            <ChevronRight size={16} color="var(--muted)" />
          </div>
          {sortedRuns.length === 0 ? (
            <p className="dash-empty" style={{ marginTop: 10 }}>Noch keine Läufe vorhanden.</p>
          ) : (
            <div style={{ marginTop: 10, fontSize: 13.5, color: "var(--muted)" }}>
              {sortedRuns.length} Lauf{sortedRuns.length === 1 ? "" : "e"} insgesamt · zuletzt: {sortedRuns[0].name}, {formatDateShort(sortedRuns[0].date)}, {fmtNum(sortedRuns[0].distanceKm, 2)} km
            </div>
          )}
        </button>
      ) : (
        <div className="dash-card">
          <button className="dash-back" onClick={() => setShowAllRuns(false)} style={{ marginBottom: 14 }}><ChevronLeft size={15} /> Zurück</button>
          <h3 className="dash-card-title">Alle Läufe</h3>
          {sortedRuns.length === 0 ? <p className="dash-empty">Noch keine Läufe vorhanden.</p> : sortedRuns.map((r) => (
            <RunItem
              key={r.id}
              run={r}
              shoes={shoes}
              expanded={expandedId === r.id}
              onToggle={() => setExpandedId(expandedId === r.id ? null : r.id)}
              onDelete={() => deleteRun(r.id)}
              onChange={changeRun}
              noteBusy={noteBusyId === r.id}
              noteError={noteErrors[r.id]}
              onGenerateNote={() => generateRunNote(r)}
            />
          ))}
        </div>
      )}

      {paceTrendBuckets.map((b) => (
        <div className="dash-card" key={b.key}>
          <h3 className="dash-card-title">Pace-Entwicklung: {b.label}</h3>
          <div style={{ width: "100%", height: 160 }}>
            <ResponsiveContainer>
              <LineChart data={b.data}>
                <CartesianGrid vertical={false} stroke="var(--line)" />
                <XAxis dataKey="label" tick={{ fontSize: 11, fill: "var(--muted)" }} axisLine={{ stroke: "var(--line)" }} tickLine={false} />
                <YAxis tick={{ fontSize: 11, fill: "var(--muted)" }} axisLine={false} tickLine={false} width={34} reversed />
                <Tooltip formatter={(v) => [formatPace(v), "Pace"]} contentStyle={{ fontSize: 12, fontFamily: "Inter" }} />
                <Line type="monotone" dataKey="pace" stroke="var(--ochre)" strokeWidth={2} dot={{ r: 3 }} />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </div>
      ))}

      <RunningGoalsCard goals={runningGoals} persistGoals={persistRunningGoals} />

      <TrainingPlanCard plan={trainingPlan} setPlan={setTrainingPlan} goals={runningGoals} runs={runs} gymSessions={gymSessions} sleepEntries={sleepEntries} />

      <ShoesCard shoes={shoes} persistShoes={persistShoes} runs={runs} />
    </>
  );
}

function RunItem({ run, shoes, expanded, onToggle, onDelete, onChange, noteBusy, noteError, onGenerateNote }) {
  const pace = paceMinPerKm(run.distanceKm, run.durationSec);
  function setField(field, value) { onChange({ ...run, [field]: value }); }
  // Leeres Feld = Wert entfernen; ungültige Eingaben werden ignoriert (alter Wert bleibt).
  function setRunNum(field, text, min, max) {
    if (String(text).trim() === "") return setField(field, null);
    const n = parseNonNegativeNumber(text, { max });
    if (n === null || n < min) return;
    setField(field, Math.round(n));
  }

  return (
    <div className="dash-session">
      <button className="dash-session-header" onClick={onToggle}>
        <div>
          <div className="dash-session-date">{formatDateShort(run.date)}</div>
          <div className="dash-session-name">{run.name}</div>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <span className="dash-session-count">{fmtNum(run.distanceKm, 2)} km · {formatPace(pace)}</span>
          {expanded ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
        </div>
      </button>
      <div className={`dash-collapse${expanded ? " dash-collapse-open" : ""}`}>
        <div className="dash-collapse-inner dash-session-body">
          <div className="dash-stats" style={{ marginBottom: 14 }}>
            <div className="dash-stat"><div className="dash-stat-val" style={{ fontSize: 18 }}>{fmtNum(run.distanceKm, 2)} km</div><div className="dash-stat-label">Distanz</div></div>
            <div className="dash-stat"><div className="dash-stat-val" style={{ fontSize: 18 }}>{formatPace(pace).replace(" min/km", "")}</div><div className="dash-stat-label">Pace (min/km)</div></div>
            <div className="dash-stat"><div className="dash-stat-val" style={{ fontSize: 18 }}>{formatDuration(run.durationSec)}</div><div className="dash-stat-label">Dauer</div></div>
            <div className="dash-stat"><div className="dash-stat-val" style={{ fontSize: 18 }}>{run.elevationUp != null ? `${run.elevationUp} m` : "–"}</div><div className="dash-stat-label">Höhenmeter auf</div></div>
            <div className="dash-stat"><div className="dash-stat-val" style={{ fontSize: 18 }}>{run.elevationDown != null ? `${run.elevationDown} m` : "–"}</div><div className="dash-stat-label">Höhenmeter ab</div></div>
            <div className="dash-stat"><div className="dash-stat-val" style={{ fontSize: 18 }}>{run.hrAvg != null ? `${run.hrAvg}/${run.hrMax ?? "–"}` : "–"}</div><div className="dash-stat-label">HF Ø/max (bpm)</div></div>
            <div className="dash-stat"><div className="dash-stat-val" style={{ fontSize: 18 }}>{run.cadence != null ? run.cadence : "–"}</div><div className="dash-stat-label">Kadenz</div></div>
          </div>

          <div className="dash-rate">
            <div className="dash-rate-label">Anstrengung</div>
            <div className="dash-chips">
              {[1, 2, 3, 4, 5].map((n) => (
                <button key={n} className={`dash-chip${run.rpe === n ? " dash-chip-active" : ""}`}
                  onClick={() => setField("rpe", run.rpe === n ? null : n)}>{n}</button>
              ))}
            </div>
            <div className="dash-rate-hint">1 = sehr leicht · 5 = maximal</div>
          </div>
          <div className="dash-ex-fields">
            <label className="dash-ex-field"><span>Höhenm. auf</span><NumberField value={run.elevationUp} onCommit={(v) => setRunNum("elevationUp", v, 0, 15000)} /></label>
            <label className="dash-ex-field"><span>Höhenm. ab</span><NumberField value={run.elevationDown} onCommit={(v) => setRunNum("elevationDown", v, 0, 15000)} /></label>
            <label className="dash-ex-field"><span>Kadenz</span><NumberField value={run.cadence} onCommit={(v) => setRunNum("cadence", v, 0, 300)} /></label>
            <label className="dash-ex-field"><span>HF Ø (bpm)</span><NumberField value={run.hrAvg} onCommit={(v) => setRunNum("hrAvg", v, 20, 250)} /></label>
            <label className="dash-ex-field"><span>HF max (bpm)</span><NumberField value={run.hrMax} onCommit={(v) => setRunNum("hrMax", v, 20, 250)} /></label>
          </div>
          {shoes.length > 0 && (
            <div className="dash-form-row">
              <select className="dash-select" value={run.shoeId ?? ""} onChange={(e) => setField("shoeId", e.target.value || null)}>
                <option value="">Schuhe –</option>
                {shoes.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
              </select>
            </div>
          )}

          <div style={{ marginTop: 14 }}>
            {!run.note ? (
              <button className="dash-btn dash-btn-primary" onClick={onGenerateNote} disabled={noteBusy}>
                <Sparkles size={15} /> {noteBusy ? "Analysiere …" : "Kurzanalyse erstellen"}
              </button>
            ) : (
              <AnalysisDisplay
                text={run.note}
                busy={noteBusy}
                onRefresh={onGenerateNote}
                onDelete={() => onChange({ ...run, note: null })}
              />
            )}
            {noteError && <div style={{ color: "var(--red)", fontSize: 13, marginTop: 8 }}>{noteError}</div>}
          </div>

          <div style={{ marginTop: 14, textAlign: "right" }}>
            <button className="dash-del" onClick={onDelete} title="Lauf löschen"><Trash2 size={14} /> Lauf löschen</button>
          </div>
        </div>
      </div>
    </div>
  );
}

function RunningGoalsCard({ goals, persistGoals }) {
  const [showForm, setShowForm] = useState(false);
  const [text, setText] = useState("");
  const [targetDate, setTargetDate] = useState("");

  const sorted = useMemo(() => [...goals].sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt)), [goals]);

  function addGoal(e) {
    e.preventDefault();
    if (!text.trim()) return;
    persistGoals([...goals, { id: uid(), text: text.trim(), targetDate: targetDate || null, createdAt: new Date().toISOString() }]);
    setText(""); setTargetDate(""); setShowForm(false);
  }
  function deleteGoal(id) { persistGoals(goals.filter((g) => g.id !== id)); }

  return (
    <div className="dash-card">
      <h3 className="dash-card-title">Ziele</h3>
      {sorted.length === 0 ? <p className="dash-empty">Noch keine Ziele hinterlegt — leg unten eins an.</p> : sorted.map((g) => (
        <div className="dash-entry" key={g.id}>
          <div className="dash-entry-body">
            <p className="dash-entry-text">{g.text}</p>
            {g.targetDate && <div className="dash-score-meta">Ziel: {formatDateShort(g.targetDate)}</div>}
          </div>
          <button className="dash-del" onClick={() => deleteGoal(g.id)} title="Löschen"><Trash2 size={15} /></button>
        </div>
      ))}
      <button className="dash-btn dash-btn-sm" style={{ marginTop: sorted.length ? 12 : 0 }} onClick={() => setShowForm((v) => !v)}><Plus size={13} /> Neues Ziel</button>
      {showForm && (
        <form onSubmit={addGoal} style={{ marginTop: 12, borderTop: "1px solid var(--line)", paddingTop: 12 }}>
          <textarea className="dash-textarea" placeholder="Z.B. Marathon laufen, oder: 6 km unter 25 Minuten schaffen" value={text} onChange={(e) => setText(e.target.value)} style={{ minHeight: 60 }} />
          <div className="dash-form-row" style={{ marginTop: 8 }}>
            <input type="date" className="dash-input" value={targetDate} onChange={(e) => setTargetDate(e.target.value)} placeholder="Zieldatum (optional)" />
            <button type="submit" className="dash-btn dash-btn-primary">Speichern</button>
          </div>
        </form>
      )}
    </div>
  );
}

function TrainingPlanCard({ plan, setPlan, goals, runs, gymSessions, sleepEntries }) {
  const [targetRuns, setTargetRuns] = useState("");
  const [targetKm, setTargetKm] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const planScore = useMemo(() => computePlanAdherence(runs, plan), [runs, plan]);
  const status = useMemo(() => computeTrainingStatus({ runs, gymSessions, sleepEntries, plan }), [runs, gymSessions, sleepEntries, plan]);

  async function generatePlan(existingRuns, existingKm) {
    setBusy(true); setError("");
    try {
      const sortedRuns = [...runs].sort((a, b) => new Date(b.date) - new Date(a.date));
      const runsSummary = sortedRuns.slice(0, 15)
        .map((r) => `${formatDateShort(r.date)}: ${fmtNum(r.distanceKm, 2)} km, ${formatPace(paceMinPerKm(r.distanceKm, r.durationSec))}`)
        .join("\n") || "keine bisherigen Läufe";
      const goalsSummary = goals.map((g) => `- ${g.text}${g.targetDate ? ` (Zieldatum: ${formatDateShort(g.targetDate)})` : ""}`).join("\n");
      let sleepLine = "";
      if (sleepEntries.length > 0) {
        const recentFitness = sleepEntries.filter((e) => e.fitness).slice(0, 5).map((e) => e.fitness);
        if (recentFitness.length) sleepLine = `Zuletzt selbst eingeschätzte Fitness nach dem Aufwachen (1-5): ${recentFitness.join(", ")}.\n`;
      }
      const multiGoalHint = goals.length > 1
        ? "Ich verfolge diese Ziele gleichzeitig — kombiniere sie sinnvoll in einem Plan (z.B. verschiedene Einheiten für Grundlagenausdauer vs. Tempo in derselben Woche) und erkläre kurz, wie sie sich ergänzen oder wo es Kompromisse braucht."
        : "";
      const prompt =
        `Meine aktuellen Laufziele:\n${goalsSummary}\n\n` +
        `Angestrebt: ${existingRuns || "?"} Läufe pro Woche, ${existingKm || "?"} km pro Woche.\n\n` +
        `Meine bisherigen Läufe (neueste zuerst):\n${runsSummary}\n\n` +
        `Trainingsstatus (nur aus vorhandenen Daten berechnet):\n${trainingStatusText(status)}\n` +
        sleepLine +
        `\nErstelle mir einen konkreten, auf mich zugeschnittenen Trainingsplan für die nächsten Wochen, der zu meinem bisherigen Niveau passt (nicht zu ambitioniert, aber fordernd). ${multiGoalHint} Gliedere ihn nach Wochen, mit jeweils Art und ungefährem Umfang der Läufe. Auf Deutsch, klar strukturiert, aber ohne unnötige Länge.`;
      const text = await askClaude(prompt, 1400);
      setPlan({
        id: uid(),
        goalTexts: goals.map((g) => g.text),
        targetRunsPerWeek: existingRuns ? parseFloat(existingRuns) : 0,
        targetKmPerWeek: existingKm ? parseFloat(existingKm) : 0,
        createdAt: new Date().toISOString(),
        planText: text || "Kein Plan erhalten.",
      });
    } catch {
      setError("Der Trainingsplan konnte nicht erstellt werden. Versuch es gleich noch einmal.");
    } finally {
      setBusy(false);
    }
  }

  function submitNew(e) {
    e.preventDefault();
    generatePlan(targetRuns, targetKm);
  }

  return (
    <div className="dash-card">
      <h3 className="dash-card-title">Trainingsplan</h3>
      {goals.length === 0 ? (
        <p className="dash-empty">Leg zuerst mindestens ein Ziel oben an, dann kannst du hier einen Trainingsplan dafür erstellen.</p>
      ) : !plan ? (
        <form onSubmit={submitNew}>
          <div className="dash-score-meta" style={{ marginBottom: 10 }}>
            Basiert auf: {goals.map((g) => g.text).join(" · ")}
          </div>
          <div className="dash-form-row">
            <input type="text" className="dash-input" placeholder="Läufe pro Woche (Ziel)" value={targetRuns} onChange={(e) => setTargetRuns(e.target.value)} style={{ width: 190 }} />
            <input type="text" className="dash-input" placeholder="km pro Woche (Ziel)" value={targetKm} onChange={(e) => setTargetKm(e.target.value)} style={{ width: 170 }} />
          </div>
          {error && <div style={{ color: "var(--red)", fontSize: 13, margin: "8px 0" }}>{error}</div>}
          <button type="submit" className="dash-btn dash-btn-primary" disabled={busy} style={{ marginTop: 8 }}>
            <Sparkles size={15} /> {busy ? "Erstelle Plan …" : "Trainingsplan erstellen"}
          </button>
          {busy && <SkeletonLines />}
        </form>
      ) : (
        <>
          <div style={{ fontSize: 14, marginBottom: 6 }}><strong>Basiert auf:</strong> {(plan.goalTexts || [plan.goal]).filter(Boolean).join(" · ")}</div>
          <div className="dash-score-meta" style={{ marginBottom: 10 }}>
            {plan.targetRunsPerWeek > 0 && `${plan.targetRunsPerWeek} Läufe/Woche `}
            {plan.targetKmPerWeek > 0 && `· ${plan.targetKmPerWeek} km/Woche`}
          </div>
          {planScore && (
            <>
              <div className="dash-progress-row">
                <span>Einhaltung diese Woche</span>
                <span className="dash-progress-pct">{planScore.score}%</span>
              </div>
              <div className="dash-score-bar-track"><div className="dash-score-bar-fill" style={{ width: `${planScore.score}%`, background: "var(--forest)" }} /></div>
              <div className="dash-score-meta" style={{ marginBottom: 10 }}>{planScore.weekRuns} Läufe, {fmtNum(planScore.weekKm, 1)} km diese Woche</div>
            </>
          )}
          <AnalysisDisplay
            text={plan.planText}
            generatedAt={plan.createdAt}
            busy={busy}
            onRefresh={() => generatePlan(plan.targetRunsPerWeek || "", plan.targetKmPerWeek || "")}
            onDelete={() => setPlan(null)}
          />
          {error && <div style={{ color: "var(--red)", fontSize: 13, marginTop: 8 }}>{error}</div>}
        </>
      )}
    </div>
  );
}

function wearLabel(percent) {
  if (percent < 15) return "Sehr wenig Abnutzung";
  if (percent < 40) return "Wenig Abnutzung";
  if (percent < 70) return "Mittlere Abnutzung";
  if (percent < 90) return "Hohe Abnutzung";
  return "Sehr hohe Abnutzung";
}

function ShoeRing({ percent, color }) {
  const r = 46;
  const c = 2 * Math.PI * r;
  return (
    <div style={{ position: "relative", width: 108, height: 108, flexShrink: 0 }}>
      <svg width="108" height="108" viewBox="0 0 108 108">
        <circle cx="54" cy="54" r={r} fill="none" stroke="var(--line)" strokeWidth="9" />
        <circle
          cx="54" cy="54" r={r} fill="none" stroke={color} strokeWidth="9" strokeLinecap="round"
          strokeDasharray={c} strokeDashoffset={c * (1 - percent / 100)}
          transform="rotate(-90 54 54)"
        />
      </svg>
      <div style={{ position: "absolute", inset: 0, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center" }}>
        <Footprints size={18} color="var(--muted)" />
        <div style={{ fontFamily: "'Sora', sans-serif", fontSize: 20, fontWeight: 600, marginTop: 3 }}>{percent}%</div>
        <div style={{ fontSize: 10.5, color: "var(--muted)" }}>Abnutzung</div>
      </div>
    </div>
  );
}

function ShoeItem({ shoe, onDelete }) {
  const [menuOpen, setMenuOpen] = useState(false);
  const color = shoe.percent >= 90 ? "var(--red)" : shoe.percent >= 70 ? "var(--ochre)" : "var(--forest)";

  return (
    <div className="dash-shoe-item">
      <div className="dash-shoe-head" style={{ position: "relative" }}>
        <div className="dash-shoe-icon-badge"><Footprints size={18} /></div>
        <div className="dash-shoe-name">{shoe.name}</div>
        {shoe.isActive && <span className="dash-pill-active">aktiv</span>}
        <button className="dash-del" onClick={() => setMenuOpen((v) => !v)} title="Mehr"><MoreVertical size={16} /></button>
        {menuOpen && (
          <div style={{ position: "absolute", top: 34, right: 0, background: "var(--card)", border: "1px solid var(--line)", borderRadius: 8, boxShadow: "0 4px 12px rgba(0,0,0,0.1)", zIndex: 5 }}>
            <button className="dash-btn dash-btn-sm" style={{ border: "none", width: "100%" }} onClick={() => { onDelete(); setMenuOpen(false); }}>
              <Trash2 size={13} /> Löschen
            </button>
          </div>
        )}
      </div>
      <div className="dash-shoe-body">
        <div className="dash-shoe-ring-wrap">
          <ShoeRing percent={shoe.percent} color={color} />
          <div className="dash-score-meta" style={{ marginTop: 8 }}>{fmtNum(shoe.totalKm, 0)} von {shoe.lifespanKm} km</div>
        </div>
        <div className="dash-shoe-info">
          <div className="dash-shoe-info-row"><Footprints size={15} color="var(--muted)" style={{ marginTop: 1 }} /><span>{wearLabel(shoe.percent)}</span></div>
          <div className="dash-shoe-info-row"><Calendar size={15} color="var(--muted)" style={{ marginTop: 1 }} /><span><span className="lbl">Seit</span><br />{formatDateShort(shoe.startDate)}</span></div>
          <div className="dash-shoe-info-row"><MapPin size={15} color="var(--muted)" style={{ marginTop: 1 }} /><span><span className="lbl">Aktuelle Laufleistung</span><br />{fmtNum(shoe.totalKm, 0)} km</span></div>
          <div className="dash-shoe-info-row"><Target size={15} color="var(--muted)" style={{ marginTop: 1 }} /><span><span className="lbl">Ziel-Laufleistung</span><br />{shoe.lifespanKm} km</span></div>
        </div>
      </div>
    </div>
  );
}

function ShoesCard({ shoes, persistShoes, runs }) {
  const [showForm, setShowForm] = useState(false);
  const [name, setName] = useState("");
  const [startDate, setStartDate] = useState(todayISO());
  const [startingKm, setStartingKm] = useState("");
  const [lifespanKm, setLifespanKm] = useState("600");
  const [shoeError, setShoeError] = useState("");

  const stats = useMemo(() => computeShoeStats(shoes, runs).sort((a, b) => new Date(b.startDate) - new Date(a.startDate)), [shoes, runs]);

  function addShoe(e) {
    e.preventDefault();
    setShoeError("");
    if (!name.trim()) return setShoeError("Bitte einen Namen angeben.");
    if (!validateDate(startDate)) return setShoeError("Bitte ein gültiges Startdatum angeben.");
    const startingKmVal = startingKm ? parseNonNegativeNumber(startingKm, { max: 20000 }) : 0;
    if (startingKmVal === null) return setShoeError("Ausgangswert ist ungültig.");
    const lifespanKmVal = lifespanKm ? parsePositiveNumber(lifespanKm, { max: 20000 }) : 600;
    if (lifespanKmVal === null) return setShoeError("Haltbarkeit ist ungültig.");
    const shoe = { id: uid(), name: name.trim(), startDate, startingKm: startingKmVal, lifespanKm: lifespanKmVal };
    persistShoes([...shoes, shoe]);
    setName(""); setStartingKm(""); setLifespanKm("600"); setShowForm(false);
  }
  function deleteShoe(id) { persistShoes(shoes.filter((s) => s.id !== id)); }

  return (
    <div className="dash-card">
      <h3 className="dash-card-title">Schuhe</h3>
      {stats.length === 0 ? <p className="dash-empty">Noch keine Schuhe hinterlegt.</p> : stats.map((s) => (
        <ShoeItem key={s.id} shoe={s} onDelete={() => deleteShoe(s.id)} />
      ))}
      <button className="dash-btn dash-btn-sm" onClick={() => setShowForm((v) => !v)}><Plus size={13} /> Neue Schuhe</button>
      {showForm && (
        <form onSubmit={addShoe} style={{ marginTop: 12, borderTop: "1px solid var(--line)", paddingTop: 12 }}>
          <div className="dash-form-row">
            <input type="text" className="dash-input" placeholder="Name, z.B. Pegasus 41" value={name} onChange={(e) => setName(e.target.value)} style={{ flex: "1 1 160px" }} />
            <input type="date" className="dash-input" value={startDate} onChange={(e) => setStartDate(e.target.value)} />
          </div>
          <div className="dash-form-row">
            <input type="text" className="dash-input" placeholder="Ausgangswert in km (falls gebraucht, sonst 0)" value={startingKm} onChange={(e) => setStartingKm(e.target.value)} style={{ width: 230 }} />
            <input type="text" className="dash-input" placeholder="Haltbarkeit in km" value={lifespanKm} onChange={(e) => setLifespanKm(e.target.value)} style={{ width: 150 }} />
          </div>
          <button type="submit" className="dash-btn dash-btn-primary">Speichern</button>
        </form>
      )}
    </div>
  );
}

// ---------- Wochenvergleich ----------

function WeekCompareArea({ runs, gymSessions, sleepEntries = [], trainingPlan, weekAnalysis, setWeekAnalysis, statsAnalysis, setStatsAnalysis }) {
  const [showAll, setShowAll] = useState(false);
  const [weekBusy, setWeekBusy] = useState(false);
  const [weekError, setWeekError] = useState("");
  const [statsBusy, setStatsBusy] = useState(false);
  const [statsError, setStatsError] = useState("");
  const now = new Date();
  const thisW = weekWindow(0, now);
  const lastW = weekWindow(1, now);

  const thisKm = runs.filter((r) => { const d = new Date(r.date); return d >= thisW.start && d < thisW.end; }).reduce((s, r) => s + r.distanceKm, 0);
  const lastKm = runs.filter((r) => { const d = new Date(r.date); return d >= lastW.start && d < lastW.end; }).reduce((s, r) => s + r.distanceKm, 0);
  const thisGym = gymSessions.filter((s) => { const d = new Date(s.date); return d >= thisW.start && d < thisW.end; }).length;
  const lastGym = gymSessions.filter((s) => { const d = new Date(s.date); return d >= lastW.start && d < lastW.end; }).length;
  const kmDeltaPct = lastKm > 0 ? Math.round(((thisKm - lastKm) / lastKm) * 100) : (thisKm > 0 ? null : 0);

  const status = useMemo(() => computeTrainingStatus({ runs, gymSessions, sleepEntries, plan: trainingPlan }), [runs, gymSessions, sleepEntries, trainingPlan]);

  const allStats = useMemo(() => {
    const totalKm = runs.reduce((s, r) => s + r.distanceKm, 0);
    const totalLifted = gymSessions.reduce((s, session) => s + (session.exercises || []).reduce((s2, ex) => {
      const w = typeof ex.weightKg === "number" && isFinite(ex.weightKg) ? ex.weightKg : 0;
      const sets = typeof ex.sets === "number" && isFinite(ex.sets) ? ex.sets : 0;
      const reps = typeof ex.reps === "number" && isFinite(ex.reps) ? ex.reps : 0;
      return s2 + w * sets * reps;
    }, 0), 0);
    const weeks = weeklyKmSeries(runs, 52);
    const best = weeks.reduce((max, w) => (w.km > max.km ? w : max), { km: 0, label: "–" });
    return { totalKm, totalRuns: runs.length, totalGym: gymSessions.length, totalLifted: Math.round(totalLifted), best };
  }, [runs, gymSessions]);

  async function generateWeekAnalysis() {
    setWeekBusy(true); setWeekError("");
    try {
      const prompt =
        `Vergleich meiner Trainingswoche:\n` +
        `Diese Woche: ${fmtNum(thisKm, 1)} km gelaufen, ${thisGym} Krafttrainings.\n` +
        `Letzte Woche: ${fmtNum(lastKm, 1)} km gelaufen, ${lastGym} Krafttrainings.\n` +
        `Trainingsstatus (nur aus vorhandenen Daten berechnet):\n${trainingStatusText(status)}\n` +
        `\nGib mir dazu eine kurze Einordnung in 2-3 Sätzen: Ist die Veränderung gegenüber der Vorwoche sinnvoll und gesund, oder springt die Belastung zu stark? Nicht nur "mehr ist besser" — es geht darum, ob der Rhythmus nachhaltig ist. Auf Deutsch, ohne Aufzählungszeichen, ohne Anrede.`;
      const text = await askClaude(prompt, 300);
      setWeekAnalysis({ text: text || "Keine Auswertung erhalten.", generatedAt: new Date().toISOString() });
    } catch {
      setWeekError("Die Analyse konnte nicht geladen werden.");
    } finally {
      setWeekBusy(false);
    }
  }

  async function generateStatsAnalysis() {
    setStatsBusy(true); setStatsError("");
    try {
      const prompt =
        `Meine Gesamtbilanz bisher:\n` +
        `${fmtNum(allStats.totalKm, 0)} km gelaufen in ${allStats.totalRuns} Läufen.\n` +
        `${allStats.totalGym} Krafttrainings, dabei insgesamt ${allStats.totalLifted} kg bewegt.\n` +
        `Aktivste Woche: ${allStats.best.km} km.\n` +
        `\nGib mir dazu eine kurze Einordnung in 2-3 Sätzen: Was sagt dieses Gesamtbild über meine Beständigkeit und die Balance zwischen Laufen und Krafttraining? Auf Deutsch, ohne Aufzählungszeichen, ohne Anrede.`;
      const text = await askClaude(prompt, 300);
      setStatsAnalysis({ text: text || "Keine Auswertung erhalten.", generatedAt: new Date().toISOString() });
    } catch {
      setStatsError("Die Analyse konnte nicht geladen werden.");
    } finally {
      setStatsBusy(false);
    }
  }

  return (
    <>
      <div className="dash-score-card">
        <h3 className="dash-score-name" style={{ marginBottom: 14 }}>Diese Woche vs. letzte Woche</h3>
        <div className="dash-compare-row">
          <div className="dash-compare-col">
            <div className="dash-compare-label">Laufen</div>
            <span className="dash-compare-current">{fmtNum(thisKm, 1)} km</span>
            <span className="dash-compare-prev">letzte Woche: {fmtNum(lastKm, 1)} km</span>
            {kmDeltaPct != null && (
              <div className="dash-compare-delta" style={{ color: kmDeltaPct > 0 ? "var(--forest)" : kmDeltaPct < 0 ? "var(--red)" : "var(--muted)" }}>
                {kmDeltaPct > 0 ? <ArrowUp size={13} /> : kmDeltaPct < 0 ? <ArrowDown size={13} /> : null} {kmDeltaPct === 0 ? "gleich wie letzte Woche" : `${Math.abs(kmDeltaPct)}%`}
              </div>
            )}
          </div>
          <div className="dash-compare-col">
            <div className="dash-compare-label">Gym</div>
            <span className="dash-compare-current">{thisGym} Training{thisGym === 1 ? "" : "s"}</span>
            <span className="dash-compare-prev">letzte Woche: {lastGym}</span>
            <div className="dash-compare-delta" style={{ color: thisGym > lastGym ? "var(--forest)" : thisGym < lastGym ? "var(--red)" : "var(--muted)" }}>
              {thisGym > lastGym ? <ArrowUp size={13} /> : thisGym < lastGym ? <ArrowDown size={13} /> : null} {thisGym === lastGym ? "gleich wie letzte Woche" : `${Math.abs(thisGym - lastGym)}`}
            </div>
          </div>
        </div>
        <div className="dash-score-note" style={{ marginTop: 14 }}>
          Trainingsstatus: {status.headline}
        </div>
        <div style={{ marginTop: 14 }}>
          {!weekAnalysis ? (
            <button className="dash-btn dash-btn-primary" onClick={generateWeekAnalysis} disabled={weekBusy}>
              <Sparkles size={15} /> {weekBusy ? "Analysiere …" : "Kurzanalyse erstellen"}
            </button>
          ) : (
            <AnalysisDisplay
              text={weekAnalysis.text}
              generatedAt={weekAnalysis.generatedAt}
              busy={weekBusy}
              onRefresh={generateWeekAnalysis}
              onDelete={() => setWeekAnalysis(null)}
            />
          )}
          {weekBusy && !weekAnalysis && <SkeletonLines />}
          {weekError && <div style={{ color: "var(--red)", fontSize: 13, marginTop: 8 }}>{weekError}</div>}
        </div>
      </div>

      <button className="dash-btn" onClick={() => setShowAll((v) => !v)}>
        {showAll ? <ChevronUp size={14} /> : <ChevronDown size={14} />} Gesamtstatistiken
      </button>

      {showAll && (
        <div className="dash-card" style={{ marginTop: 14 }}>
          <h3 className="dash-card-title">Gesamtstatistiken</h3>
          <div className="dash-stats">
            <div className="dash-stat"><div className="dash-stat-val">{fmtNum(allStats.totalKm, 0)}</div><div className="dash-stat-label">km insgesamt gelaufen</div></div>
            <div className="dash-stat"><div className="dash-stat-val">{allStats.totalRuns}</div><div className="dash-stat-label">Läufe insgesamt</div></div>
            <div className="dash-stat"><div className="dash-stat-val">{allStats.totalGym}</div><div className="dash-stat-label">Gym-Trainings insgesamt</div></div>
            <div className="dash-stat"><div className="dash-stat-val">{allStats.totalLifted.toLocaleString("de-DE")}</div><div className="dash-stat-label">kg insgesamt bewegt</div></div>
          </div>
          <div className="dash-score-meta">Aktivste Woche bisher: {allStats.best.label} mit {allStats.best.km} km</div>
          <div style={{ marginTop: 14 }}>
            {!statsAnalysis ? (
              <button className="dash-btn dash-btn-primary" onClick={generateStatsAnalysis} disabled={statsBusy}>
                <Sparkles size={15} /> {statsBusy ? "Analysiere …" : "Kurzanalyse erstellen"}
              </button>
            ) : (
              <AnalysisDisplay
                text={statsAnalysis.text}
                generatedAt={statsAnalysis.generatedAt}
                busy={statsBusy}
                onRefresh={generateStatsAnalysis}
                onDelete={() => setStatsAnalysis(null)}
              />
            )}
            {statsBusy && !statsAnalysis && <SkeletonLines />}
            {statsError && <div style={{ color: "var(--red)", fontSize: 13, marginTop: 8 }}>{statsError}</div>}
          </div>
        </div>
      )}
    </>
  );
}

// ---------- To-Dos ----------

function TodosArea({ todos, persistTodos }) {
  const [text, setText] = useState("");

  const sorted = useMemo(() => {
    const open = todos.filter((t) => !t.done).sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
    const done = todos.filter((t) => t.done).sort((a, b) => new Date(b.doneAt) - new Date(a.doneAt));
    return { open, done };
  }, [todos]);

  const pct = todos.length === 0 ? null : Math.round((todos.filter((t) => t.done).length / todos.length) * 100);

  function addTodo(e) {
    e.preventDefault();
    if (!text.trim()) return;
    persistTodos([{ id: uid(), text: text.trim(), done: false, createdAt: new Date().toISOString(), doneAt: null }, ...todos]);
    setText("");
  }
  function toggleTodo(id) {
    haptic();
    persistTodos(todos.map((t) => (t.id === id ? { ...t, done: !t.done, doneAt: !t.done ? new Date().toISOString() : null } : t)));
  }
  function deleteTodo(id) {
    persistTodos(todos.filter((t) => t.id !== id));
  }

  return (
    <>
      <div className="dash-score-card">
        <div className="dash-score-top">
          <div>
            <h3 className="dash-score-name">Erledigt</h3>
            <div className="dash-score-status" style={{ color: "var(--muted)" }}>
              {todos.length === 0 ? "Noch keine To-Dos" : `${todos.filter((t) => t.done).length} von ${todos.length}`}
            </div>
          </div>
          {pct != null && <div className="dash-score-value" style={{ color: "var(--forest)" }}><AnimatedNumber value={pct} formatter={(n) => `${n}%`} /></div>}
        </div>
        {pct != null && (
          <div className="dash-score-bar-track"><div className="dash-score-bar-fill" style={{ width: `${pct}%`, background: "var(--forest)" }} /></div>
        )}
      </div>

      <div className="dash-card">
        <h3 className="dash-card-title">Neues To-Do</h3>
        <form onSubmit={addTodo} className="dash-form-row">
          <input type="text" className="dash-input" placeholder="Was steht an?" value={text} onChange={(e) => setText(e.target.value)} style={{ flex: "1 1 200px" }} />
          <button type="submit" className="dash-btn dash-btn-primary" disabled={!text.trim()}><Plus size={15} /> Hinzufügen</button>
        </form>
      </div>

      <div className="dash-card">
        <h3 className="dash-card-title">Offen</h3>
        {sorted.open.length === 0 ? <p className="dash-empty">Nichts offen — gut gemacht.</p> : sorted.open.map((t) => (
          <SwipeToDelete key={t.id} onDelete={() => deleteTodo(t.id)}>
          <div className="dash-entry">
            <button className="dash-del" onClick={() => toggleTodo(t.id)} title="Erledigt" style={{ padding: 0 }}><Square size={18} /></button>
            <div className="dash-entry-body"><p className="dash-entry-text">{t.text}</p></div>
            <button className="dash-del" onClick={() => deleteTodo(t.id)} title="Löschen"><Trash2 size={15} /></button>
          </div>
          </SwipeToDelete>
        ))}
      </div>

      {sorted.done.length > 0 && (
        <div className="dash-card">
          <h3 className="dash-card-title">Erledigt</h3>
          {sorted.done.map((t) => (
            <SwipeToDelete key={t.id} onDelete={() => deleteTodo(t.id)}>
            <div className="dash-entry">
              <button className="dash-del" onClick={() => toggleTodo(t.id)} title="Wieder öffnen" style={{ padding: 0, color: "var(--forest)" }}><CheckSquare size={18} /></button>
              <div className="dash-entry-body"><p className="dash-entry-text" style={{ color: "var(--muted)", textDecoration: "line-through" }}>{t.text}</p></div>
              <button className="dash-del" onClick={() => deleteTodo(t.id)} title="Löschen"><Trash2 size={15} /></button>
            </div>
            </SwipeToDelete>
          ))}
        </div>
      )}
    </>
  );
}

// ---------- Gym: aufklappbares Training ----------

function GymTemplatesCard({ templates, persistTemplates }) {
  const [showForm, setShowForm] = useState(false);
  const [name, setName] = useState("");
  const [exerciseNames, setExerciseNames] = useState([""]);

  function updateExerciseName(i, value) {
    setExerciseNames((prev) => prev.map((n, idx) => (idx === i ? value : n)));
  }
  function addExerciseField() {
    setExerciseNames((prev) => [...prev, ""]);
  }
  function removeExerciseField(i) {
    setExerciseNames((prev) => prev.filter((_, idx) => idx !== i));
  }

  function saveTemplate(e) {
    e.preventDefault();
    if (!name.trim()) return;
    const exercises = exerciseNames.map((n) => n.trim()).filter(Boolean).map((n) => ({ id: uid(), name: n }));
    if (!exercises.length) return;
    persistTemplates([...templates, { id: uid(), name: name.trim(), exercises }]);
    setName(""); setExerciseNames([""]); setShowForm(false);
  }
  function deleteTemplate(id) {
    persistTemplates(templates.filter((t) => t.id !== id));
  }

  return (
    <div className="dash-card">
      <h3 className="dash-card-title">Trainingsvorlagen</h3>
      {templates.length === 0 ? (
        <p className="dash-empty">Noch keine Vorlagen — leg eine an, dann musst du bei „Neues Training" nur noch Gewichte, Sätze und Wiederholungen eintragen.</p>
      ) : templates.map((t) => (
        <div className="dash-entry" key={t.id}>
          <div className="dash-entry-body">
            <p className="dash-entry-text">{t.name}</p>
            <div className="dash-score-meta">{t.exercises.map((ex) => ex.name).join(", ")}</div>
          </div>
          <button className="dash-del" onClick={() => deleteTemplate(t.id)} title="Löschen"><Trash2 size={15} /></button>
        </div>
      ))}
      <button className="dash-btn dash-btn-sm" style={{ marginTop: templates.length ? 12 : 0 }} onClick={() => setShowForm((v) => !v)}><Plus size={13} /> Neue Vorlage</button>
      {showForm && (
        <form onSubmit={saveTemplate} style={{ marginTop: 12, borderTop: "1px solid var(--line)", paddingTop: 12 }}>
          <input type="text" className="dash-input" placeholder="Name, z.B. Push Day" value={name} onChange={(e) => setName(e.target.value)} style={{ width: "100%", marginBottom: 8 }} />
          {exerciseNames.map((n, i) => (
            <div className="dash-form-row" key={i}>
              <input type="text" className="dash-input" placeholder={`Übung ${i + 1}`} value={n} onChange={(e) => updateExerciseName(i, e.target.value)} style={{ flex: "1 1 160px" }} />
              {exerciseNames.length > 1 && (
                <button type="button" className="dash-del" onClick={() => removeExerciseField(i)} title="Entfernen"><Trash2 size={14} /></button>
              )}
            </div>
          ))}
          <button type="button" className="dash-btn dash-btn-sm" onClick={addExerciseField}><Plus size={13} /> Weitere Übung</button>
          <div style={{ marginTop: 10 }}>
            <button type="submit" className="dash-btn dash-btn-primary">Vorlage speichern</button>
          </div>
        </form>
      )}
    </div>
  );
}

// Zahlenfeld, das während der Eingabe nur Text hält und erst beim Verlassen speichert —
// so gehen Kommazahlen wie "2,5" nicht verloren (vorher wurde bei jedem Tastendruck
// sofort geparst und das Komma verschluckt). font-size 16px verhindert das Auto-Zoomen auf iOS.
function NumberField({ value, onCommit, decimal = false, placeholder = "–", ariaLabel }) {
  const toText = (v) => (v == null ? "" : decimal ? String(v).replace(".", ",") : String(v));
  const [text, setText] = useState(toText(value));
  const [focused, setFocused] = useState(false);
  useEffect(() => {
    if (!focused) setText(toText(value));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value, focused]);
  return (
    <input
      type="text"
      inputMode={decimal ? "decimal" : "numeric"}
      className="dash-input dash-num"
      value={text}
      placeholder={placeholder}
      aria-label={ariaLabel}
      onFocus={() => setFocused(true)}
      onChange={(e) => setText(e.target.value.replace(decimal ? /[^0-9.,]/g : /[^0-9]/g, ""))}
      onKeyDown={(e) => { if (e.key === "Enter") e.currentTarget.blur(); }}
      onBlur={() => { setFocused(false); onCommit(text); }}
    />
  );
}

const GYM_FEELINGS = [
  { key: "gut", label: "😊 Gut" },
  { key: "okay", label: "😐 Okay" },
  { key: "schlecht", label: "😣 Schlecht" },
];

function formatKg(v) {
  return v == null ? "?" : String(v).replace(".", ",");
}

function SessionCard({ session, expanded, onToggle, onDelete, onChange }) {
  const [exName, setExName] = useState("");
  const [exWeight, setExWeight] = useState("");
  const [exSets, setExSets] = useState("");
  const [exReps, setExReps] = useState("");
  const [summarizing, setSummarizing] = useState(false);
  const [summaryError, setSummaryError] = useState("");
  const [exError, setExError] = useState("");

  function addExercise(e) {
    e.preventDefault();
    setExError("");
    if (!exName.trim()) return setExError("Bitte einen Übungsnamen angeben.");
    const weight = exWeight.trim() === "" ? 0 : parseNonNegativeNumber(exWeight, { max: 1000 });
    const sets = parseIntegerInRange(exSets, 1, 50);
    const reps = parseIntegerInRange(exReps, 1, 200);
    if (weight === null) return setExError("Ungültiges Gewicht — bitte eine Zahl ≥ 0 angeben.");
    if (sets === null) return setExError("Bitte eine gültige Anzahl Sätze angeben (mind. 1).");
    if (reps === null) return setExError("Bitte eine gültige Anzahl Wiederholungen angeben (mind. 1).");
    const ex = { id: uid(), name: exName.trim(), weightKg: weight, sets, reps };
    onChange({ ...session, exercises: [...session.exercises, ex] });
    setExName(""); setExWeight(""); setExSets(""); setExReps("");
  }
  function deleteExercise(id) { onChange({ ...session, exercises: session.exercises.filter((ex) => ex.id !== id) }); }
  function updateExerciseField(id, field, value) {
    let num;
    if (String(value).trim() === "") num = null;
    else if (field === "weightKg") num = parseNonNegativeNumber(value, { max: 1000 });
    else num = parseIntegerInRange(value, 1, field === "sets" ? 50 : 200);
    onChange({ ...session, exercises: session.exercises.map((ex) => (ex.id === id ? { ...ex, [field]: num } : ex)) });
  }

  async function generateSummary() {
    setSummarizing(true); setSummaryError("");
    try {
      const list = session.exercises.map((ex) => `${ex.name}: ${ex.sets ?? "?"}x${ex.reps ?? "?"} @ ${formatKg(ex.weightKg)} kg`).join("\n");
      const feelingLabel = { gut: "gut", okay: "okay", schlecht: "schlecht" }[session.feeling];
      const selfReport =
        (session.difficulty ? `Selbst eingeschätzte Anstrengung: ${session.difficulty}/5 (1 = sehr leicht, 5 = maximal).\n` : "Anstrengung: nicht angegeben.\n") +
        (feelingLabel ? `Befinden während/nach dem Training: ${feelingLabel}.\n` : "Befinden: nicht angegeben.\n");
      const prompt =
        `Ein Krafttraining vom ${formatDateShort(session.date)} (${session.name}) mit folgenden Übungen:\n${list}\n\n${selfReport}\n` +
        `Gib dazu einen kurzen, freundlichen Kommentar in 2-3 Sätzen zum Trainingsreiz (z.B. betroffene Muskelgruppen, Umfang) und ob es zur Erholung/Gesundheit passt — nicht nur ob es ein neues Gewichtsmaximum war. ` +
        `Wichtig: Die selbst eingeschätzte Anstrengung und das Befinden haben Vorrang vor deiner Einschätzung aus den Gewichten — nenne das Training nicht leicht oder "Regeneration", wenn die Anstrengung hoch angegeben ist, und geh auf ein schlechtes Befinden ein. ` +
        `Ist die Anstrengung nicht angegeben, triff keine Aussage zur Intensität, die sich nicht aus den Daten ablesen lässt. Fehlende Werte (?) nicht schätzen. Auf Deutsch, ohne Aufzählungszeichen, ohne Anrede.`;
      const text = await askClaude(prompt, 220);
      onChange({ ...session, summary: text || "Keine Auswertung erhalten." });
    } catch {
      setSummaryError("Zusammenfassung konnte nicht geladen werden.");
    } finally {
      setSummarizing(false);
    }
  }

  return (
    <div className="dash-session">
      <button className="dash-session-header" onClick={onToggle}>
        <div>
          <div className="dash-session-date">{formatDateShort(session.date)}</div>
          <div className="dash-session-name">{session.name}</div>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <span className="dash-session-count">{session.exercises.length} Übung{session.exercises.length === 1 ? "" : "en"}{session.difficulty ? ` · ${session.difficulty}/5` : ""}</span>
          {expanded ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
        </div>
      </button>
      <div className={`dash-collapse${expanded ? " dash-collapse-open" : ""}`}>
        <div className="dash-collapse-inner dash-session-body">
          <div className="dash-rate">
            <div className="dash-rate-label">Anstrengung</div>
            <div className="dash-chips">
              {[1, 2, 3, 4, 5].map((n) => (
                <button key={n} className={`dash-chip${session.difficulty === n ? " dash-chip-active" : ""}`}
                  onClick={() => onChange({ ...session, difficulty: session.difficulty === n ? null : n })}>{n}</button>
              ))}
            </div>
            <div className="dash-rate-hint">1 = sehr leicht · 5 = maximal</div>
          </div>
          <div className="dash-rate">
            <div className="dash-rate-label">Wie hast du dich gefühlt?</div>
            <div className="dash-chips">
              {GYM_FEELINGS.map((f) => (
                <button key={f.key} className={`dash-chip${session.feeling === f.key ? " dash-chip-active" : ""}`}
                  onClick={() => onChange({ ...session, feeling: session.feeling === f.key ? null : f.key })}>{f.label}</button>
              ))}
            </div>
          </div>

          {session.exercises.length === 0 ? <p className="dash-empty">Noch keine Übungen eingetragen.</p> : (
            <div className="dash-ex-list">
              {session.exercises.map((ex) => (
                <div className="dash-ex-row" key={ex.id}>
                  <div className="dash-ex-head">
                    <span className="dash-ex-name">{ex.name}</span>
                    <button className="dash-del" onClick={() => deleteExercise(ex.id)} title="Übung löschen"><Trash2 size={14} /></button>
                  </div>
                  <div className="dash-ex-fields">
                    <label className="dash-ex-field"><span>Sätze</span><NumberField value={ex.sets} onCommit={(v) => updateExerciseField(ex.id, "sets", v)} ariaLabel={`${ex.name} Sätze`} /></label>
                    <label className="dash-ex-field"><span>Wdh.</span><NumberField value={ex.reps} onCommit={(v) => updateExerciseField(ex.id, "reps", v)} ariaLabel={`${ex.name} Wiederholungen`} /></label>
                    <label className="dash-ex-field"><span>kg</span><NumberField decimal value={ex.weightKg} onCommit={(v) => updateExerciseField(ex.id, "weightKg", v)} ariaLabel={`${ex.name} Gewicht`} /></label>
                  </div>
                </div>
              ))}
            </div>
          )}
          <form onSubmit={addExercise} className="dash-ex-add">
            <input type="text" className="dash-input" placeholder="Neue Übung / Gerät" value={exName} onChange={(e) => setExName(e.target.value)} style={{ width: "100%", fontSize: 16 }} />
            <div className="dash-ex-fields">
              <input type="text" inputMode="numeric" className="dash-input dash-num" placeholder="Sätze" value={exSets} onChange={(e) => setExSets(e.target.value)} />
              <input type="text" inputMode="numeric" className="dash-input dash-num" placeholder="Wdh." value={exReps} onChange={(e) => setExReps(e.target.value)} />
              <input type="text" inputMode="decimal" className="dash-input dash-num" placeholder="kg" value={exWeight} onChange={(e) => setExWeight(e.target.value)} />
            </div>
            <button type="submit" className="dash-btn" style={{ width: "100%", justifyContent: "center" }}><Plus size={14} /> Übung hinzufügen</button>
          </form>
          {exError && <div style={{ color: "var(--red)", fontSize: 13, marginTop: 6 }}>{exError}</div>}

          {session.exercises.length > 0 && (
            <div style={{ marginTop: 14 }}>
              {!session.summary ? (
                <button className="dash-btn dash-btn-primary" onClick={generateSummary} disabled={summarizing}>
                  <Sparkles size={15} /> {summarizing ? "Analysiere …" : "Training zusammenfassen"}
                </button>
              ) : (
                <AnalysisDisplay
                  text={session.summary}
                  busy={summarizing}
                  onRefresh={generateSummary}
                  onDelete={() => onChange({ ...session, summary: null })}
                />
              )}
              {summaryError && <div style={{ color: "var(--red)", fontSize: 13, marginTop: 8 }}>{summaryError}</div>}
            </div>
          )}

          <div style={{ marginTop: 14, textAlign: "right" }}>
            <button className="dash-del" onClick={onDelete} title="Training löschen"><Trash2 size={14} /> Training löschen</button>
          </div>
        </div>
      </div>
    </div>
  );
}

function PullupCard({ entries, persistEntries }) {
  const [cardOpen, setCardOpen] = useState(false);
  const [date, setDate] = useState(todayISO());
  const [assistKg, setAssistKg] = useState("");
  const [reps, setReps] = useState("");
  const [sets, setSets] = useState("");
  const [error, setError] = useState("");

  const sorted = useMemo(() => [...entries].sort((a, b) => new Date(b.date) - new Date(a.date)), [entries]);
  const chronological = useMemo(() => [...entries].sort((a, b) => new Date(a.date) - new Date(b.date)), [entries]);
  const chartData = useMemo(() => chronological.map((e) => ({ label: formatDateShort(e.date), kg: e.assistKg })), [chronological]);

  const baseline = chronological[0];
  const latest = sorted[0];
  const percent = baseline ? (baseline.assistKg > 0 ? Math.max(0, Math.min(100, Math.round(((baseline.assistKg - latest.assistKg) / baseline.assistKg) * 100))) : (latest.assistKg === 0 ? 100 : 0)) : null;
  const goalReached = latest && latest.assistKg === 0;

  function addEntry(e) {
    e.preventDefault();
    setError("");
    if (!validateDate(date)) return setError("Bitte ein gültiges Datum angeben.");
    const kg = parseNonNegativeNumber(assistKg, { max: 200 });
    if (kg === null) return setError("Bitte ein gültiges Unterstützungsgewicht angeben (0 = ohne Hilfe).");
    const repsVal = reps ? parseIntegerInRange(reps, 1, 200) : null;
    if (reps && repsVal === null) return setError("Wiederholungen müssen eine positive Zahl sein.");
    const setsVal = sets ? parseIntegerInRange(sets, 1, 50) : null;
    if (sets && setsVal === null) return setError("Sätze müssen eine positive Zahl sein.");
    persistEntries([{ id: uid(), date, assistKg: kg, reps: repsVal, sets: setsVal }, ...entries]);
    setAssistKg(""); setReps(""); setSets("");
  }
  function deleteEntry(id) { persistEntries(entries.filter((e) => e.id !== id)); }

  return (
    <div className="dash-card">
      <button
        onClick={() => setCardOpen((v) => !v)}
        style={{ width: "100%", display: "flex", justifyContent: "space-between", alignItems: "center", background: "none", border: "none", cursor: "pointer", padding: 0, font: "inherit", color: "inherit", marginBottom: cardOpen ? 14 : 0 }}
      >
        <h3 className="dash-card-title" style={{ margin: 0 }}>Klimmzüge lernen</h3>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          {latest && <span style={{ fontSize: 13, color: "var(--muted)" }}>{goalReached ? "Ziel erreicht 🎉" : `${latest.assistKg} kg`}</span>}
          {cardOpen ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
        </div>
      </button>

      <div className={`dash-collapse${cardOpen ? " dash-collapse-open" : ""}`}>
        <div className="dash-collapse-inner">
      <div className="dash-score-note" style={{ marginTop: 12, marginBottom: 14 }}>
        Trag ein, wie viel Kilo dir die Maschine abnimmt — Ziel ist 0 kg, also ein freier Klimmzug ohne Hilfe.
      </div>

      {latest && (
        <>
          <div className="dash-score-top">
            <div>
              <h3 className="dash-score-name" style={{ fontSize: 15 }}>Aktuell</h3>
              <div className="dash-score-status" style={{ color: goalReached ? "var(--forest)" : "var(--muted)" }}>
                {goalReached ? "Ziel erreicht — freier Klimmzug! 🎉" : `${latest.assistKg} kg Unterstützung`}
              </div>
            </div>
            {percent != null && <div className="dash-score-value" style={{ color: goalReached ? "var(--forest)" : "var(--ink)" }}><AnimatedNumber value={percent} formatter={(n) => `${n}%`} /></div>}
          </div>
          {percent != null && (
            <div className="dash-score-bar-track"><div className="dash-score-bar-fill" style={{ width: `${percent}%`, background: "var(--forest)" }} /></div>
          )}
          <div className="dash-score-meta" style={{ marginBottom: 14 }}>Start: {baseline.assistKg} kg · zuletzt {formatDateShort(latest.date)}</div>

          {chartData.length >= 2 && (
            <div style={{ width: "100%", height: 160, marginBottom: 14 }}>
              <ResponsiveContainer>
                <LineChart data={chartData}>
                  <CartesianGrid vertical={false} stroke="var(--line)" />
                  <XAxis dataKey="label" tick={{ fontSize: 11, fill: "var(--muted)" }} axisLine={{ stroke: "var(--line)" }} tickLine={false} />
                  <YAxis tick={{ fontSize: 11, fill: "var(--muted)" }} axisLine={false} tickLine={false} width={34} reversed />
                  <Tooltip formatter={(v) => [`${v} kg`, "Unterstützung"]} contentStyle={{ fontSize: 12, fontFamily: "Inter" }} />
                  <Line type="monotone" dataKey="kg" stroke="var(--forest)" strokeWidth={2} dot={{ r: 3 }} />
                </LineChart>
              </ResponsiveContainer>
            </div>
          )}
        </>
      )}

      <form onSubmit={addEntry} className="dash-form-row">
        <input type="date" className="dash-input" value={date} onChange={(e) => setDate(e.target.value)} />
        <input type="text" className="dash-input" placeholder="Unterstützung in kg" value={assistKg} onChange={(e) => setAssistKg(e.target.value)} style={{ width: 160 }} />
        <input type="text" className="dash-input" placeholder="Sätze" value={sets} onChange={(e) => setSets(e.target.value)} style={{ width: 80 }} />
        <input type="text" className="dash-input" placeholder="Wdh." value={reps} onChange={(e) => setReps(e.target.value)} style={{ width: 80 }} />
        <button type="submit" className="dash-btn dash-btn-primary"><Plus size={15} /> Eintragen</button>
      </form>
      {error && <div style={{ color: "var(--red)", fontSize: 13, marginTop: 8 }}>{error}</div>}

      {sorted.length > 0 && (
        <div style={{ marginTop: 14 }}>
          {sorted.map((e) => (
            <div className="dash-entry" key={e.id} style={{ padding: "6px 0" }}>
              <div className="dash-entry-body">
                <p className="dash-entry-text">
                  {formatDateShort(e.date)}: {e.assistKg} kg{e.sets && e.reps ? ` · ${e.sets}x${e.reps}` : ""}
                </p>
              </div>
              <button className="dash-del" onClick={() => deleteEntry(e.id)} title="Löschen"><Trash2 size={14} /></button>
            </div>
          ))}
        </div>
      )}
        </div>
      </div>
    </div>
  );
}

function GymPlanCard({ plan, setPlan, sessions }) {
  const [goal, setGoal] = useState("");
  const [targetSessions, setTargetSessions] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function generatePlan(existingGoal, existingSessions) {
    setBusy(true); setError("");
    try {
      const sorted = [...sessions].sort((a, b) => new Date(b.date) - new Date(a.date));
      const sessionsSummary = sorted.slice(0, 12)
        .map((s) => `${formatDateShort(s.date)} ${s.name}: ${s.exercises.map((ex) => `${ex.name} ${ex.sets ?? "?"}x${ex.reps ?? "?"}@${formatKg(ex.weightKg)}kg`).join(", ") || "keine Übungen erfasst"}${s.difficulty ? ` · Anstrengung ${s.difficulty}/5` : ""}${s.feeling ? ` · Befinden ${s.feeling}` : ""}`)
        .join("\n") || "keine bisherigen Trainings";
      const prompt =
        `Mein Kraft-/Gym-Ziel: ${existingGoal}\n` +
        `Angestrebt: ${existingSessions || "?"} Trainings pro Woche.\n\n` +
        `Meine bisherigen Gym-Trainings (neueste zuerst):\n${sessionsSummary}\n\n` +
        `Erstelle mir einen konkreten, auf mich zugeschnittenen Trainingsplan für die nächsten Wochen im Gym, der zu meinem Ziel und meinem bisherigen Niveau passt. Gliedere ihn nach Wochen bzw. Trainingstagen, mit Übungen, ungefähren Satz-/Wiederholungsbereichen. Auf Deutsch, klar strukturiert, ohne unnötige Länge.`;
      const text = await askClaude(prompt, 1200);
      setPlan({
        id: uid(),
        goal: existingGoal,
        targetSessionsPerWeek: existingSessions ? parseFloat(existingSessions) : 0,
        createdAt: new Date().toISOString(),
        planText: text || "Kein Plan erhalten.",
      });
    } catch {
      setError("Der Trainingsplan konnte nicht erstellt werden. Versuch es gleich noch einmal.");
    } finally {
      setBusy(false);
    }
  }

  function submitNew(e) {
    e.preventDefault();
    if (!goal.trim()) return;
    generatePlan(goal.trim(), targetSessions);
  }

  const weekSessions = useMemo(() => {
    const w = weekWindow(0, new Date());
    return sessions.filter((s) => { const d = new Date(s.date); return d >= w.start && d < w.end; }).length;
  }, [sessions]);

  return (
    <div className="dash-card">
      <h3 className="dash-card-title">Ziele & Trainingsplan</h3>
      {!plan ? (
        <form onSubmit={submitNew}>
          <textarea className="dash-textarea" placeholder="Was ist dein Ziel? Z.B. Bankdrücken 100 kg in 12 Wochen" value={goal} onChange={(e) => setGoal(e.target.value)} />
          <div className="dash-form-row" style={{ marginTop: 10 }}>
            <input type="text" className="dash-input" placeholder="Trainings pro Woche (Ziel)" value={targetSessions} onChange={(e) => setTargetSessions(e.target.value)} style={{ width: 200 }} />
          </div>
          {error && <div style={{ color: "var(--red)", fontSize: 13, margin: "8px 0" }}>{error}</div>}
          <button type="submit" className="dash-btn dash-btn-primary" disabled={busy || !goal.trim()} style={{ marginTop: 8 }}>
            <Sparkles size={15} /> {busy ? "Erstelle Plan …" : "Trainingsplan erstellen"}
          </button>
          {busy && <SkeletonLines />}
        </form>
      ) : (
        <>
          <div style={{ fontSize: 14, marginBottom: 6 }}><strong>Ziel:</strong> {plan.goal}</div>
          {plan.targetSessionsPerWeek > 0 && (
            <>
              <div className="dash-progress-row">
                <span>Einhaltung diese Woche</span>
                <span className="dash-progress-pct">{Math.min(100, Math.round((weekSessions / plan.targetSessionsPerWeek) * 100))}%</span>
              </div>
              <div className="dash-score-bar-track"><div className="dash-score-bar-fill" style={{ width: `${Math.min(100, Math.round((weekSessions / plan.targetSessionsPerWeek) * 100))}%`, background: "var(--forest)" }} /></div>
              <div className="dash-score-meta" style={{ marginBottom: 10 }}>{weekSessions} von {plan.targetSessionsPerWeek} Trainings diese Woche</div>
            </>
          )}
          <AnalysisDisplay
            text={plan.planText}
            generatedAt={plan.createdAt}
            busy={busy}
            onRefresh={() => generatePlan(plan.goal, plan.targetSessionsPerWeek || "")}
            onDelete={() => setPlan(null)}
          />
          {error && <div style={{ color: "var(--red)", fontSize: 13, marginTop: 8 }}>{error}</div>}
        </>
      )}
    </div>
  );
}

function GymArea({ sessions, persistSessions, trainingPlanGym, setTrainingPlanGym, pullupEntries, persistPullupEntries, gymTemplates, persistGymTemplates }) {
  const [expandedId, setExpandedId] = useState(null);
  const [showAllSessions, setShowAllSessions] = useState(false);
  const [newDate, setNewDate] = useState(todayISO());
  const [newName, setNewName] = useState("");
  const [templateId, setTemplateId] = useState("");

  const sorted = useMemo(() => [...sessions].sort((a, b) => new Date(b.date) - new Date(a.date)), [sessions]);

  function addSession(e) {
    e.preventDefault();
    const template = gymTemplates.find((t) => t.id === templateId);
    const exercises = template
      ? template.exercises.map((ex) => ({ id: uid(), name: ex.name, weightKg: null, sets: null, reps: null }))
      : [];
    const s = { id: uid(), date: newDate, name: newName.trim() || (template ? template.name : "Training"), exercises, summary: null };
    persistSessions([s, ...sessions]);
    setNewName(""); setTemplateId("");
    setExpandedId(s.id);
    setShowAllSessions(true);
  }
  function deleteSession(id) {
    persistSessions(sessions.filter((s) => s.id !== id));
    if (expandedId === id) setExpandedId(null);
  }
  function changeSession(updated) {
    persistSessions(sessions.map((s) => (s.id === updated.id ? updated : s)));
  }

  return (
    <>
      <div className="dash-card">
        <h3 className="dash-card-title">Neues Training</h3>
        <form onSubmit={addSession}>
          <div className="dash-form-row">
            <input type="date" className="dash-input" value={newDate} onChange={(e) => setNewDate(e.target.value)} />
            <input type="text" className="dash-input" placeholder="Name, z.B. Push Day" value={newName} onChange={(e) => setNewName(e.target.value)} />
          </div>
          {gymTemplates.length > 0 && (
            <div className="dash-form-row">
              <select className="dash-select" value={templateId} onChange={(e) => setTemplateId(e.target.value)}>
                <option value="">Aus Vorlage starten (optional) –</option>
                {gymTemplates.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
              </select>
            </div>
          )}
          <button type="submit" className="dash-btn dash-btn-primary"><Plus size={15} /> Training anlegen</button>
        </form>
      </div>

      {!showAllSessions ? (
        <button className="dash-card" style={{ width: "100%", textAlign: "left", cursor: "pointer", display: "block" }} onClick={() => setShowAllSessions(true)}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <h3 className="dash-card-title" style={{ margin: 0 }}>Alle Trainings</h3>
            <ChevronRight size={16} color="var(--muted)" />
          </div>
          {sorted.length === 0 ? (
            <p className="dash-empty" style={{ marginTop: 10 }}>Noch keine Trainings vorhanden.</p>
          ) : (
            <div style={{ marginTop: 10, fontSize: 13.5, color: "var(--muted)" }}>
              {sorted.length} Training{sorted.length === 1 ? "" : "s"} insgesamt · zuletzt: {sorted[0].name}, {formatDateShort(sorted[0].date)}
            </div>
          )}
        </button>
      ) : (
        <div className="dash-card">
          <button className="dash-back" onClick={() => setShowAllSessions(false)} style={{ marginBottom: 14 }}><ChevronLeft size={15} /> Zurück</button>
          <h3 className="dash-card-title">Alle Trainings</h3>
          {sorted.length === 0 ? <p className="dash-empty">Noch keine Trainings vorhanden.</p> : sorted.map((s) => (
            <SessionCard key={s.id} session={s} expanded={expandedId === s.id} onToggle={() => setExpandedId(expandedId === s.id ? null : s.id)} onDelete={() => deleteSession(s.id)} onChange={changeSession} />
          ))}
        </div>
      )}

      <GymTemplatesCard templates={gymTemplates} persistTemplates={persistGymTemplates} />

      <PullupCard entries={pullupEntries} persistEntries={persistPullupEntries} />

      <GymPlanCard plan={trainingPlanGym} setPlan={setTrainingPlanGym} sessions={sessions} />
    </>
  );
}

// ---------- App shell ----------

const DEFAULT_PROFILE = {
  gender: "weiblich",
  birthDate: "2000-07-26",
  heightCm: 160,
  weightEntries: [{ id: uid(), date: todayISO(), weightKg: 62.5 }],
};

export default function App() {
  const [view, setView] = useState("home");
  const [loaded, setLoaded] = useState(false);
  const [splashElapsed, setSplashElapsed] = useState(false);
  const [splashMounted, setSplashMounted] = useState(true);

  // Der Splash läuft mindestens 1,3s (damit die Checkliste sichtbar durchlaufen kann),
  // dauert aber länger, falls das echte Laden der Daten selbst mehr Zeit braucht.
  useEffect(() => {
    const t = setTimeout(() => setSplashElapsed(true), 1300);
    return () => clearTimeout(t);
  }, []);
  const splashDone = loaded && splashElapsed;
  useEffect(() => {
    if (splashDone) {
      const t = setTimeout(() => setSplashMounted(false), 450);
      return () => clearTimeout(t);
    }
  }, [splashDone]);
  const [journal, setJournal] = useState([]);
  const [runs, setRuns] = useState([]);
  const [gymSessions, setGymSessions] = useState([]);
  const [sleepEntries, setSleepEntries] = useState([]);
  const [trainingPlan, setTrainingPlanState] = useState(null);
  const [runningGoals, setRunningGoals] = useState([]);
  const [trainingPlanGym, setTrainingPlanGymState] = useState(null);
  const [pullupEntries, setPullupEntries] = useState([]);
  const [gymTemplates, setGymTemplates] = useState([]);
  const [pendingBedtime, setPendingBedtimeState] = useState(null);
  const [shoes, setShoes] = useState([]);
  const [todos, setTodos] = useState([]);
  const [profile, setProfileState] = useState(null);
  const [overallAnalysis, setOverallAnalysisState] = useState(null);
  const [weekAnalysis, setWeekAnalysisState] = useState(null);
  const [statsAnalysis, setStatsAnalysisState] = useState(null);
  const [theme, setTheme] = useState("pink");
  const [nowTick, setNowTick] = useState(new Date());
  const [weatherCode, setWeatherCode] = useState(null);
  const [saveError, setSaveError] = useState("");

  useEffect(() => {
    const id = setInterval(() => setNowTick(new Date()), 30000);
    return () => clearInterval(id);
  }, []);

  // Zeigt einen kurzen, dezenten Hinweis, wenn ein Speichervorgang fehlschlägt —
  // die UI täuscht dann kein erfolgreiches Speichern mehr vor.
  function reportSaveError(message) {
    setSaveError(message);
    setTimeout(() => setSaveError((cur) => (cur === message ? "" : cur)), 6000);
  }

  useEffect(() => {
    (async () => {
      setJournal(await loadJSON("journal-entries", []));
      setRuns(await loadJSON("runs", []));
      setGymSessions(await loadJSON("gym-sessions", []));
      setSleepEntries(await loadJSON("sleep-entries", []));
      setTrainingPlanState(await loadJSON("training-plan", null));
      setRunningGoals(await loadJSON("running-goals", []));
      setTrainingPlanGymState(await loadJSON("gym-training-plan", null));
      setPullupEntries(await loadJSON("pullup-entries", []));
      setGymTemplates(await loadJSON("gym-templates", []));
      const pb = await storage.get("sleep-pending");
      setPendingBedtimeState(pb ? pb.value || null : null);
      setShoes(await loadJSON("shoes", []));
      setTodos(await loadJSON("todos", []));
      setOverallAnalysisState(await loadJSON("overall-analysis", null));
      setWeekAnalysisState(await loadJSON("week-analysis", null));
      setStatsAnalysisState(await loadJSON("stats-analysis", null));
      const th = await storage.get("theme");
      if (th && (th.value === "pink" || th.value === "light")) setTheme(th.value);

      const existingProfile = await loadJSON("profile", null);
      if (existingProfile) {
        setProfileState(existingProfile);
      } else {
        setProfileState(DEFAULT_PROFILE);
        const ok = await saveJSON("profile", DEFAULT_PROFILE);
        if (!ok) reportSaveError("Profil konnte nicht gespeichert werden.");
      }
      setLoaded(true);
    })();
  }, []);

  async function persistJournal(next) {
    const ok = await saveJSON("journal-entries", next);
    if (!ok) { reportSaveError("Tagebuch konnte nicht gespeichert werden."); return false; }
    setJournal(next); return true;
  }
  async function persistRuns(next) {
    const ok = await saveJSON("runs", next);
    if (!ok) { reportSaveError("Läufe konnten nicht gespeichert werden."); return false; }
    setRuns(next); return true;
  }
  async function persistGymSessions(next) {
    const ok = await saveJSON("gym-sessions", next);
    if (!ok) { reportSaveError("Gym-Trainings konnten nicht gespeichert werden."); return false; }
    setGymSessions(next); return true;
  }
  async function persistSleepEntries(next) {
    const ok = await saveJSON("sleep-entries", next);
    if (!ok) { reportSaveError("Schlafdaten konnten nicht gespeichert werden."); return false; }
    setSleepEntries(next); return true;
  }
  async function setTrainingPlan(next) {
    const ok = await saveJSON("training-plan", next);
    if (!ok) { reportSaveError("Trainingsplan konnte nicht gespeichert werden."); return false; }
    setTrainingPlanState(next); return true;
  }
  async function persistRunningGoals(next) {
    const ok = await saveJSON("running-goals", next);
    if (!ok) { reportSaveError("Ziele konnten nicht gespeichert werden."); return false; }
    setRunningGoals(next); return true;
  }
  async function setTrainingPlanGym(next) {
    const ok = await saveJSON("gym-training-plan", next);
    if (!ok) { reportSaveError("Gym-Trainingsplan konnte nicht gespeichert werden."); return false; }
    setTrainingPlanGymState(next); return true;
  }
  async function persistPullupEntries(next) {
    const ok = await saveJSON("pullup-entries", next);
    if (!ok) { reportSaveError("Klimmzug-Daten konnten nicht gespeichert werden."); return false; }
    setPullupEntries(next); return true;
  }
  async function persistGymTemplates(next) {
    const ok = await saveJSON("gym-templates", next);
    if (!ok) { reportSaveError("Trainingsvorlagen konnten nicht gespeichert werden."); return false; }
    setGymTemplates(next); return true;
  }
  async function setPendingBedtime(next) {
    const ok = await storage.set("sleep-pending", next || "");
    if (!ok) { reportSaveError("Schlafengehen-Zeit konnte nicht gespeichert werden."); return false; }
    setPendingBedtimeState(next); return true;
  }
  async function persistShoes(next) {
    const ok = await saveJSON("shoes", next);
    if (!ok) { reportSaveError("Schuhe konnten nicht gespeichert werden."); return false; }
    setShoes(next); return true;
  }
  async function persistTodos(next) {
    const ok = await saveJSON("todos", next);
    if (!ok) { reportSaveError("To-Dos konnten nicht gespeichert werden."); return false; }
    setTodos(next); return true;
  }
  async function setOverallAnalysis(next) {
    const ok = await saveJSON("overall-analysis", next);
    if (!ok) { reportSaveError("Gesamtbild konnte nicht gespeichert werden."); return false; }
    setOverallAnalysisState(next); return true;
  }
  async function setWeekAnalysis(next) {
    const ok = await saveJSON("week-analysis", next);
    if (!ok) { reportSaveError("Wochen-Kurzanalyse konnte nicht gespeichert werden."); return false; }
    setWeekAnalysisState(next); return true;
  }
  async function setStatsAnalysis(next) {
    const ok = await saveJSON("stats-analysis", next);
    if (!ok) { reportSaveError("Gesamtstatistik-Kurzanalyse konnte nicht gespeichert werden."); return false; }
    setStatsAnalysisState(next); return true;
  }
  async function addWeightEntry(entry) {
    const next = { ...profile, weightEntries: [...(profile?.weightEntries || []), entry] };
    const ok = await saveJSON("profile", next);
    if (!ok) { reportSaveError("Gewicht konnte nicht gespeichert werden."); return false; }
    setProfileState(next); return true;
  }
  async function deleteWeightEntry(id) {
    const next = { ...profile, weightEntries: (profile?.weightEntries || []).filter((e) => e.id !== id) };
    const ok = await saveJSON("profile", next);
    if (!ok) { reportSaveError("Änderung konnte nicht gespeichert werden."); return false; }
    setProfileState(next); return true;
  }
  async function toggleTheme() {
    const next = theme === "pink" ? "light" : "pink";
    const ok = await storage.set("theme", next);
    if (!ok) { reportSaveError("Farbmodus konnte nicht gespeichert werden."); return false; }
    setTheme(next); return true;
  }

  const lifeYear = useMemo(() => {
    if (!profile?.birthDate) return null;
    const now = nowTick;
    const bd = new Date(profile.birthDate);
    let last = new Date(now.getFullYear(), bd.getMonth(), bd.getDate());
    if (last > now) last.setFullYear(last.getFullYear() - 1);
    let next = new Date(last.getFullYear() + 1, bd.getMonth(), bd.getDate());
    return {
      frac: (now - last) / (next - last),
      nextAge: next.getFullYear() - bd.getFullYear(),
      daysToNext: Math.ceil((next - now) / DAY),
    };
  }, [profile, nowTick]);

  // Dezente Hintergrundstimmung je nach Tageszeit und Wetter (nur ein weicher Farbschimmer oben).
  const hourNow = nowTick.getHours();
  const daytime = hourNow < 6 || hourNow >= 21 ? "night" : hourNow < 10 ? "morning" : hourNow < 17 ? "day" : "evening";
  const weatherMood = weatherCode == null ? "clear"
    : [51, 53, 55, 56, 57, 61, 63, 65, 66, 67, 80, 81, 82, 95, 96, 99].includes(weatherCode) ? "rain"
    : [71, 73, 75, 77, 85, 86].includes(weatherCode) ? "snow"
    : weatherCode >= 3 ? "cloud" : "clear";

  const areaLabel = view === "journal" ? "Tagebuch" : view === "runs" ? "Läufe" : view === "gym" ? "Gym" : view === "todos" ? "To-Dos" : view === "weekcompare" ? "Wochenvergleich" : view === "gewicht" ? "Gewicht" : view === "schlafen" ? "Schlafen" : "";
  const areaIcon = view === "journal" ? <BookOpen size={17} /> : view === "runs" ? <Activity size={17} /> : view === "gym" ? <Dumbbell size={17} /> : view === "todos" ? <CheckSquare size={17} /> : view === "weekcompare" ? <TrendingUp size={17} /> : view === "gewicht" ? <Scale size={17} /> : view === "schlafen" ? <Moon size={17} /> : null;

  return (
    <div className="dash-app" data-theme={theme} data-daytime={daytime} data-weather={weatherMood}>
      <GlobalStyles />
      {splashMounted && <SplashScreen visible={!splashDone} />}
      <WeatherWidget onWeather={setWeatherCode} />
      <button className="dash-theme-toggle" onClick={toggleTheme} title="Farbmodus wechseln" aria-label="Farbmodus wechseln">
        {theme === "pink" ? <Sun size={16} /> : <Heart size={16} />}
      </button>
      {saveError && (
        <div className="dash-save-error" role="alert">
          <span>⚠️ {saveError}</span>
          <button onClick={() => setSaveError("")} aria-label="Hinweis schließen" style={{ background: "none", border: "none", color: "inherit", cursor: "pointer", fontSize: 15, lineHeight: 1 }}>✕</button>
        </div>
      )}
      <div className="dash-inner">
        {view === "home" ? (
          <>
            <h1 className="dash-title">Milenas Mirror</h1>
            <div className="dash-greeting">{greetingFor(nowTick)}, Milena</div>
            <p className="dash-sub">{formatDateLong(nowTick)} · {nowTick.toLocaleTimeString("de-DE", { hour: "2-digit", minute: "2-digit" })}</p>
            {lifeYear && (
              <div style={{ marginBottom: 22 }}>
                <div className="dash-progress-row">
                  <span>Lebensjahr bis zum {lifeYear.nextAge}. Geburtstag</span>
                  <span className="dash-progress-pct">{Math.round(lifeYear.frac * 100)}%</span>
                </div>
                <div className="dash-score-bar-track"><div className="dash-score-bar-fill" style={{ width: `${lifeYear.frac * 100}%`, background: "var(--ochre)" }} /></div>
                <div className="dash-score-meta">noch {lifeYear.daysToNext} Tage</div>
              </div>
            )}
          </>
        ) : (
          <button className="dash-back" onClick={() => setView("home")}><ChevronLeft size={15} /> Übersicht</button>
        )}

        {!loaded ? <SkeletonLines lines={4} /> : (
        <div key={view} className="dash-view-fade">
        {view === "home" ? (
          <Home runs={runs} gymSessions={gymSessions} journal={journal} todos={todos} sleepEntries={sleepEntries} persistSleepEntries={persistSleepEntries} pendingBedtime={pendingBedtime} setPendingBedtime={setPendingBedtime} trainingPlan={trainingPlan} trainingPlanGym={trainingPlanGym} profile={profile} addWeightEntry={addWeightEntry} overallAnalysis={overallAnalysis} setOverallAnalysis={setOverallAnalysis} onOpen={setView} />
        ) : (
          <>
            <div className="dash-area-head"><div className="dash-area-icon">{areaIcon}</div><h2>{areaLabel}</h2></div>
            {view === "journal" && <JournalArea journal={journal} persistJournal={persistJournal} />}
            {view === "runs" && <RunsArea runs={runs} persistRuns={persistRuns} shoes={shoes} persistShoes={persistShoes} gymSessions={gymSessions} sleepEntries={sleepEntries} trainingPlan={trainingPlan} setTrainingPlan={setTrainingPlan} runningGoals={runningGoals} persistRunningGoals={persistRunningGoals} />}
            {view === "gym" && <GymArea sessions={gymSessions} persistSessions={persistGymSessions} trainingPlanGym={trainingPlanGym} setTrainingPlanGym={setTrainingPlanGym} pullupEntries={pullupEntries} persistPullupEntries={persistPullupEntries} gymTemplates={gymTemplates} persistGymTemplates={persistGymTemplates} />}
            {view === "todos" && <TodosArea todos={todos} persistTodos={persistTodos} />}
            {view === "gewicht" && <WeightArea profile={profile} addWeightEntry={addWeightEntry} deleteWeightEntry={deleteWeightEntry} />}
            {view === "schlafen" && <SleepArea sleepEntries={sleepEntries} persistSleepEntries={persistSleepEntries} pendingBedtime={pendingBedtime} setPendingBedtime={setPendingBedtime} />}
            {view === "weekcompare" && <WeekCompareArea runs={runs} gymSessions={gymSessions} sleepEntries={sleepEntries} trainingPlan={trainingPlan} weekAnalysis={weekAnalysis} setWeekAnalysis={setWeekAnalysis} statsAnalysis={statsAnalysis} setStatsAnalysis={setStatsAnalysis} />}
          </>
        )}
        </div>
        )}
      </div>
    </div>
  );
}
