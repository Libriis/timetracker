// App-wide defaults and tuning constants.

export const DEFAULT_CLIENTS = ['DEV1S', '1. MFK Kežmarok', 'Pohrebné a kamenárske služby Paciga', 'RCT Kežmarok', 'SportServis', 'Woodheat', 'Other'];
export const DEFAULT_TASKS = ['Pre-production', 'Production (Photography)', 'Production (Videography)', 'Post-production', 'META Ads'];
export const DEFAULT_RATES = {
  'Pre-production': 15,
  'Production (Photography)': 40,
  'Production (Videography)': 70,
  'Post-production': 30,
  'META Ads': 15,
};
export const DEFAULT_VAT = 23;
export const DEFAULT_CLIENT_RATES = {};
export const DEFAULT_CLIENT_VAT = {};
export const DEFAULT_ROUNDING = 15;
export const LONG_TIMER_WARN_MS = 8 * 3600000; // warn if a running timer exceeds 8 hours
export const IDLE_THRESHOLD_S = 600; // offer to subtract idle time after 10 minutes away
export const SCHEMA_VERSION = 2; // bump when the storage shape changes; gives a hook for migrations

export const DEFAULT_CLIENT_ROUNDING = {};
export const DEFAULT_DESCRIPTIONS = {
  en: {
    'Pre-production': 'Preparation before the shoot — script, planning, location scouting, scheduling, and technical prep.',
    'Production (Photography)': 'The actual photo shoot on location or in studio — direction, lighting, composition. The rate includes professional equipment.',
    'Production (Videography)': 'Video shooting — camera, lighting, sound, and stabilization. The rate covers professional gear.',
    'Post-production': 'Processing after the shoot — editing, color grading, retouching, audio, and exports. The final deliverable is created here.',
    'META Ads': 'Managing campaigns on Facebook and Instagram — strategy, creatives, optimization, and reporting.',
  },
  sk: {
    'Pre-production': 'Príprava pred natáčaním alebo fotografovaním — scenár, plánovanie, vyhľadávanie lokácií, harmonogram a technická príprava.',
    'Production (Photography)': 'Samotné fotografovanie na lokácii alebo v štúdiu — réžia, svetlo, kompozícia. Sadzba zahŕňa profesionálne vybavenie.',
    'Production (Videography)': 'Natáčanie videa — kamera, svetlo, zvuk, stabilizácia. Sadzba pokrýva profesionálnu výbavu.',
    'Post-production': 'Spracovanie po natáčaní — strih, farby, retuš, zvuk, exporty. Tu vzniká finálny produkt.',
    'META Ads': 'Správa kampaní na Facebook a Instagram — stratégia, kreatívy, optimalizácia, reporty.',
  },
};

// Supplier / issuer details, shown on the PDF when generating an invoice.
export const DEFAULT_ISSUER = { name: '', address: '', regId: '', taxId: '', vatId: '', iban: '', email: '', phone: '', note: '' };

// No seeded entries — the log starts empty on a fresh install.
export const SEED_ENTRIES = [];
