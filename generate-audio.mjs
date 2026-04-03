#!/usr/bin/env node
/**
 * Generiert Hands-free Audio-Dateien für die Español-App
 *
 * Nutzt Cartesia TTS API für natürliche Stimmen (Spanisch + Deutsch).
 * Pro Quest/Spickzettel wird eine ~5 Min. MP3 erzeugt mit:
 * - Spanischer Satz (langsam)
 * - Pause zum Nachsprechen
 * - Spanischer Satz (normal)
 * - Deutsche Übersetzung
 * - Pause
 * - Wiederholung des Blocks bis ~5 Minuten voll
 *
 * Usage: CARTESIA_API_KEY=xxx node generate-audio.mjs
 *        oder: .env Datei mit CARTESIA_API_KEY=xxx
 */

import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));

// Load .env
try {
  const env = readFileSync(join(__dirname, '.env'), 'utf8');
  env.split('\n').forEach(line => {
    const [k, ...v] = line.split('=');
    if (k && v.length) process.env[k.trim()] = v.join('=').trim();
  });
} catch {}

const API_KEY = process.env.CARTESIA_API_KEY;
if (!API_KEY) {
  console.error('Fehler: CARTESIA_API_KEY nicht gesetzt.');
  console.error('Entweder .env Datei erstellen oder CARTESIA_API_KEY=xxx node generate-audio.mjs');
  process.exit(1);
}

const API_URL = 'https://api.cartesia.ai';
const MODEL = 'sonic-3';
const OUTPUT_DIR = join(__dirname, 'audio');
const TARGET_DURATION_SEC = 300; // 5 Minuten

// Will be populated after voice discovery
let VOICE_ES = null;
let VOICE_DE = null;

// ---- Phrase data (same as in index.html) ----
const AUDIO_SETS = [
  {
    id: 'restaurant',
    name: 'Restaurant',
    phrases: [
      { es: 'Quiero ordenar, por favor.', de: 'Ich möchte bestellen, bitte.' },
      { es: '¿Cuál es la opción vegetariana?', de: 'Was ist die vegetarische Option?' },
      { es: 'Sin carne, por favor.', de: 'Ohne Fleisch, bitte.' },
      { es: 'Me regala un café, por favor.', de: 'Einen Kaffee, bitte.' },
      { es: 'Para mí, un agua.', de: 'Für mich ein Wasser.' },
      { es: 'La cuenta, por favor.', de: 'Die Rechnung, bitte.' },
      { es: 'Yo pago con tarjeta.', de: 'Ich bezahle mit Karte.' },
      { es: 'No, solo una.', de: 'Nein, nur eine Zahlung.' },
      { es: 'Con servicio.', de: 'Mit Trinkgeld.' },
    ]
  },
  {
    id: 'einkaufen',
    name: 'Einkaufen',
    phrases: [
      { es: '¿Cuánto es?', de: 'Wie viel kostet es?' },
      { es: '¿Cuánto es la libra?', de: 'Was kostet das Pfund?' },
      { es: 'Deme una libra, por favor.', de: 'Geben Sie mir ein Pfund, bitte.' },
      { es: '¿Tiene aguacate?', de: 'Haben Sie Avocado?' },
      { es: '¿Está maduro?', de: 'Ist das reif?' },
      { es: 'Quiero probar.', de: 'Ich möchte probieren.' },
      { es: '¿Me puede dar una bolsa?', de: 'Können Sie mir eine Tüte geben?' },
      { es: '¿Qué me recomienda?', de: 'Was empfehlen Sie mir?' },
      { es: 'Soy vegetariano.', de: 'Ich bin Vegetarier.' },
      { es: '¿Tiene algo más barato?', de: 'Haben Sie etwas Günstigeres?' },
    ]
  },
  {
    id: 'cafe',
    name: 'Café',
    phrases: [
      { es: 'Me regala un café, por favor.', de: 'Einen Kaffee, bitte.' },
      { es: 'Un café con leche.', de: 'Einen Milchkaffee.' },
      { es: 'Un tinto, por favor.', de: 'Einen schwarzen Kaffee.' },
      { es: 'Un jugo de lulo, por favor.', de: 'Einen Lulo-Saft, bitte.' },
      { es: 'Grande, por favor.', de: 'Groß, bitte.' },
      { es: 'Para llevar.', de: 'Zum Mitnehmen.' },
      { es: '¿Cuál es la clave del wifi?', de: 'Was ist das WiFi-Passwort?' },
    ]
  },
  {
    id: 'taxi',
    name: 'Taxi & Uber',
    phrases: [
      { es: 'A la Calle ciento cuarenta y seis con Carrera doce, por favor.', de: 'Zur Calle 146 mit Carrera 12, bitte.' },
      { es: 'Aquí está bien, gracias.', de: 'Hier ist gut, danke.' },
      { es: '¿Cuánto es hasta el centro?', de: 'Wie viel kostet es bis zum Zentrum?' },
      { es: 'Siga derecho.', de: 'Geradeaus weiter.' },
      { es: 'A la derecha.', de: 'Nach rechts.' },
      { es: 'A la izquierda.', de: 'Nach links.' },
      { es: 'Pare aquí, por favor.', de: 'Halten Sie hier, bitte.' },
    ]
  },
  {
    id: 'hilfe',
    name: 'Hilfe & Notfall',
    phrases: [
      { es: 'Perdón, yo no hablo español.', de: 'Entschuldigung, ich spreche kein Spanisch.' },
      { es: 'No entiendo.', de: 'Ich verstehe nicht.' },
      { es: 'Más despacio, por favor.', de: 'Langsamer, bitte.' },
      { es: '¿Me puede repetir?', de: 'Können Sie das wiederholen?' },
      { es: 'Yo soy extranjero.', de: 'Ich bin Ausländer.' },
      { es: 'Necesito ayuda.', de: 'Ich brauche Hilfe.' },
    ]
  },
  {
    id: 'smalltalk',
    name: 'Smalltalk',
    phrases: [
      { es: '¿Cómo estás?', de: 'Wie geht es dir?' },
      { es: 'Estoy bien, gracias. ¿Y tú?', de: 'Mir geht es gut, danke. Und dir?' },
      { es: 'Me llamo Tim.', de: 'Ich heiße Tim.' },
      { es: 'Soy de Alemania.', de: 'Ich bin aus Deutschland.' },
      { es: 'Estoy aprendiendo español.', de: 'Ich lerne Spanisch.' },
      { es: 'Mucho gusto.', de: 'Freut mich.' },
      { es: '¿De dónde eres?', de: 'Woher kommst du?' },
      { es: 'Que tengas un buen día.', de: 'Hab einen schönen Tag.' },
    ]
  },
  {
    id: 'homecenter',
    name: 'Homecenter',
    phrases: [
      { es: 'Disculpe, ¿me puede ayudar?', de: 'Entschuldigung, können Sie mir helfen?' },
      { es: 'Estoy buscando un filtro de agua.', de: 'Ich suche einen Wasserfilter.' },
      { es: '¿Dónde están los filtros de agua?', de: 'Wo sind die Wasserfilter?' },
      { es: '¿Cuál me recomienda?', de: 'Welchen empfehlen Sie mir?' },
      { es: '¿Tiene repuestos?', de: 'Haben Sie Ersatzteile?' },
      { es: '¿Cuánto es?', de: 'Wie viel kostet es?' },
      { es: 'Me llevo este, por favor.', de: 'Ich nehme diesen, bitte.' },
    ]
  },
  {
    id: 'burger',
    name: 'Burger bestellen',
    phrases: [
      { es: 'Quiero una hamburguesa, por favor.', de: 'Ich möchte einen Burger, bitte.' },
      { es: '¿Cuál es la hamburguesa vegetariana?', de: 'Welcher ist der vegetarische Burger?' },
      { es: 'Sin tocineta, por favor.', de: 'Ohne Speck, bitte.' },
      { es: 'Con papas.', de: 'Mit Pommes.' },
      { es: 'Para comer aquí.', de: 'Zum Hieressen.' },
      { es: 'Para llevar.', de: 'Zum Mitnehmen.' },
      { es: 'Un agua, por favor.', de: 'Ein Wasser, bitte.' },
    ]
  },
];

// ---- API helpers ----

async function findVoices() {
  console.log('Suche Stimmen...');
  const [esRes, deRes] = await Promise.all([
    fetch(`${API_URL}/voices?language=es&limit=50&expand[]=preview_file_url`, {
      headers: { 'X-API-Key': API_KEY, 'Cartesia-Version': '2025-04-16' }
    }),
    fetch(`${API_URL}/voices?language=de&limit=50&expand[]=preview_file_url`, {
      headers: { 'X-API-Key': API_KEY, 'Cartesia-Version': '2025-04-16' }
    }),
  ]);

  const esVoices = (await esRes.json()).data || await esRes.json();
  const deVoices = (await deRes.json()).data || await deRes.json();

  // Pick voices - prefer female for Spanish, male for German (for clear distinction)
  const esArr = Array.isArray(esVoices) ? esVoices : [];
  const deArr = Array.isArray(deVoices) ? deVoices : [];

  console.log(`  Spanisch: ${esArr.length} Stimmen gefunden`);
  console.log(`  Deutsch: ${deArr.length} Stimmen gefunden`);

  // List first few for selection
  console.log('\n  Top Spanisch-Stimmen:');
  esArr.slice(0, 10).forEach(v => console.log(`    ${v.id} — ${v.name} (${v.gender || '?'})`));
  console.log('\n  Top Deutsch-Stimmen:');
  deArr.slice(0, 10).forEach(v => console.log(`    ${v.id} — ${v.name} (${v.gender || '?'})`));

  // Select specific voices for best quality
  // Spanish: Marta - Friendly Guide (clear, approachable)
  // German: Sebastian - Orator (clear, professional)
  const esTarget = esArr.find(v => v.name?.includes('Marta')) || esArr[0];
  const deTarget = deArr.find(v => v.name?.includes('Sebastian')) || deArr[0];
  VOICE_ES = esTarget?.id;
  VOICE_DE = deTarget?.id;

  if (!VOICE_ES || !VOICE_DE) {
    console.error('Keine Stimmen gefunden! Prüfe API Key und Netzwerk.');
    process.exit(1);
  }

  console.log(`\n  Gewählt: ES="${esArr[0]?.name}" (${VOICE_ES}), DE="${deArr[0]?.name}" (${VOICE_DE})\n`);
}

async function ttsBytes(text, lang, speed) {
  const voiceId = lang === 'es' ? VOICE_ES : VOICE_DE;
  const res = await fetch(`${API_URL}/tts/bytes`, {
    method: 'POST',
    headers: {
      'X-API-Key': API_KEY,
      'Cartesia-Version': '2025-04-16',
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model_id: MODEL,
      transcript: text,
      voice: { mode: 'id', id: voiceId },
      language: lang,
      output_format: {
        container: 'wav',
        encoding: 'pcm_s16le',
        sample_rate: 24000,
      },
      ...(speed != null ? { generation_config: { speed } } : {}),
    }),
  });

  if (!res.ok) {
    const err = await res.text();
    throw new Error(`TTS failed (${res.status}): ${err}`);
  }

  return Buffer.from(await res.arrayBuffer());
}

function createSilence(durationSec, sampleRate = 24000) {
  const numSamples = Math.floor(durationSec * sampleRate);
  const buf = Buffer.alloc(numSamples * 2); // 16-bit PCM = 2 bytes per sample
  return buf;
}

function createWavHeader(dataSize, sampleRate = 24000, channels = 1, bitsPerSample = 16) {
  const header = Buffer.alloc(44);
  const byteRate = sampleRate * channels * bitsPerSample / 8;
  const blockAlign = channels * bitsPerSample / 8;

  header.write('RIFF', 0);
  header.writeUInt32LE(36 + dataSize, 4);
  header.write('WAVE', 8);
  header.write('fmt ', 12);
  header.writeUInt32LE(16, 16);
  header.writeUInt16LE(1, 20); // PCM
  header.writeUInt16LE(channels, 22);
  header.writeUInt32LE(sampleRate, 24);
  header.writeUInt32LE(byteRate, 28);
  header.writeUInt16LE(blockAlign, 32);
  header.writeUInt16LE(bitsPerSample, 34);
  header.write('data', 36);
  header.writeUInt32LE(dataSize, 40);
  return header;
}

function extractPcmFromWav(wavBuffer) {
  // WAV header is 44 bytes, PCM data follows
  return wavBuffer.subarray(44);
}

async function generateAudioForSet(set) {
  console.log(`\n🎙  Generiere: ${set.name} (${set.phrases.length} Sätze)...`);

  const pcmChunks = [];
  const PAUSE_SHORT = createSilence(0.8);   // 0.8s between elements
  const PAUSE_SPEAK = createSilence(3.0);   // 3s to repeat/speak
  const PAUSE_BETWEEN = createSilence(2.0); // 2s between phrase blocks

  // Generate one round of all phrases
  for (let i = 0; i < set.phrases.length; i++) {
    const p = set.phrases[i];
    console.log(`  ${i + 1}/${set.phrases.length}: "${p.es.substring(0, 40)}..."`);

    // 1. Spanish slow
    // speed: 0.6 = slowest, 1.0 = normal, 1.5 = fastest
    const esSlow = extractPcmFromWav(await ttsBytes(p.es, 'es', 0.7));
    pcmChunks.push(esSlow);
    pcmChunks.push(PAUSE_SHORT);

    // 2. Pause to repeat
    pcmChunks.push(PAUSE_SPEAK);

    // 3. Spanish normal speed
    const esNormal = extractPcmFromWav(await ttsBytes(p.es, 'es'));
    pcmChunks.push(esNormal);
    pcmChunks.push(PAUSE_SHORT);

    // 4. German translation
    const de = extractPcmFromWav(await ttsBytes(p.de, 'de'));
    pcmChunks.push(de);

    // 5. Pause between phrases
    pcmChunks.push(PAUSE_BETWEEN);
  }

  // Calculate one round duration
  const oneRoundBytes = pcmChunks.reduce((s, c) => s + c.length, 0);
  const oneRoundSec = oneRoundBytes / (24000 * 2);
  console.log(`  Eine Runde: ${oneRoundSec.toFixed(0)}s`);

  // Repeat to fill ~5 minutes
  const rounds = Math.max(1, Math.ceil(TARGET_DURATION_SEC / oneRoundSec));
  console.log(`  Wiederholungen: ${rounds}x (Gesamt: ~${(oneRoundSec * rounds / 60).toFixed(1)} Min.)`);

  const allChunks = [];
  const PAUSE_ROUND = createSilence(4.0); // 4s between rounds
  for (let r = 0; r < rounds; r++) {
    allChunks.push(...pcmChunks);
    if (r < rounds - 1) allChunks.push(PAUSE_ROUND);
  }

  // Combine into WAV
  const totalPcm = Buffer.concat(allChunks);
  const header = createWavHeader(totalPcm.length);
  const wav = Buffer.concat([header, totalPcm]);

  const outPath = join(OUTPUT_DIR, `${set.id}.wav`);
  writeFileSync(outPath, wav);
  const sizeMB = (wav.length / 1024 / 1024).toFixed(1);
  console.log(`  ✓ Gespeichert: ${outPath} (${sizeMB} MB)`);

  return outPath;
}

// ---- Main ----

async function main() {
  console.log('=== Español Audio Generator ===\n');

  if (!existsSync(OUTPUT_DIR)) mkdirSync(OUTPUT_DIR, { recursive: true });

  await findVoices();

  // Allow filtering via CLI args
  const filter = process.argv[2];
  const sets = filter
    ? AUDIO_SETS.filter(s => s.id === filter)
    : AUDIO_SETS;

  if (sets.length === 0) {
    console.error(`Set "${filter}" nicht gefunden. Verfügbar: ${AUDIO_SETS.map(s => s.id).join(', ')}`);
    process.exit(1);
  }

  for (const set of sets) {
    await generateAudioForSet(set);
  }

  console.log('\n=== Fertig! ===');
  console.log(`Audio-Dateien unter: ${OUTPUT_DIR}/`);
  console.log('Jetzt "git add audio/ && git push" um sie in die App zu bringen.');
}

main().catch(err => {
  console.error('Fehler:', err);
  process.exit(1);
});
