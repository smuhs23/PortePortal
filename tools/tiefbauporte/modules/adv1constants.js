// v6/modules/constants.js
// Union E Farben, OF-Definitionen, Default-Emojis, Default-Kataloge

export const UNION_COLORS = {
  navy: '#1B2D5E',
  navyDark: '#0F1B3D',
  green: '#78B51A',
  greenDark: '#5A8A12',
  red: '#D32F2F',
  orange: '#F57C00',
  amber: '#FFA000'
};

export const OF_DEFS = {
  'OF0': { label: 'unbefestigt/Rasen', color: '#4CAF50', prOF: 38.50,  prWH: 28.60, lvOF: '16a.', lvWH: '22a.' },
  'OF1': { label: 'Pflaster',          color: '#FBC02D', prOF: 50.60,  prWH: 28.60, lvOF: '16b.', lvWH: '22a.' },
  'OF2': { label: 'Beton',             color: '#F57C00', prOF: 291.61, prWH: 35.20, lvOF: '16c.', lvWH: '22b.' },
  'OF3': { label: 'Asphalt',           color: '#D32F2F', prOF: 187.00, prWH: 35.20, lvOF: '16d.', lvWH: '22b.' }
};

export const PRICE_GRABEN = 159.50;
export const PRICE_HAND = 89.10;
export const TRACE_COLOR = '#D32F2F';

// Default-Emojis pro Asset-ID (siehe Spec Anhang A)
export const DEFAULT_EMOJIS = {
  ln2: '🔌', wa2: '🔋', wi2: '🪫', ls2: '⚡',
  kvs: '📦', mws: '📊', zas: '🔢', nws: '🌐',
  trafo: '🏭', best: '🔌',
  fund_ac: '🧱', fund_dc: '🪨', poller: '🚧', schild: '🪧',
  kernb: '🕳', dbrand: '🚪',
  tiefen: '⚓', kreuz: '✖️',
  foto: '📷'
};

// Asset-Katalog Standard (aus v5 übernommen, erweitert um iconType + defaultEmoji + description)
export const DEFAULT_CATALOG = [
  { id:'ln2', name:'LN2 · Ladesäule Normal', icon:'LN2', pos:'24a.', price:605.00, unit:'Stk', category:'Ladeinfrastruktur', hasAmp:false, hasKw:true,  color:'#00796B', shape:'shape-circle', iconType:'hybrid', defaultEmoji:'🔌', description:'AC-Ladesäule bis 22 kW für den regulären Ladebetrieb. Standardsäule für Mitarbeiter- und Besucherparkplätze der BImA-Liegenschaften.' },
  { id:'wa2', name:'WA2 · Wallbox Außen',    icon:'WA2', pos:'24c.', price:429.00, unit:'Stk', category:'Ladeinfrastruktur', hasAmp:false, hasKw:true,  color:'#2E7D32', shape:'shape-circle', iconType:'hybrid', defaultEmoji:'🔋', description:'AC-Wallbox für Außenmontage (IP54+), typisch wandmontiert oder auf Pollerständer. Einsatz an Einzelstellplätzen oder Carports.' },
  { id:'wi2', name:'WI2 · Wallbox Innen',    icon:'WI2', pos:'24c.', price:429.00, unit:'Stk', category:'Ladeinfrastruktur', hasAmp:false, hasKw:true,  color:'#558B2F', shape:'shape-circle', iconType:'hybrid', defaultEmoji:'🪫', description:'AC-Wallbox für Innenmontage (Tiefgaragen, Hallen). Keine erhöhte Witterungsfestigkeit erforderlich.' },
  { id:'ls2', name:'LS2 · Schnelllader DC',  icon:'LS2', pos:'24b.', price:605.00, unit:'Stk', category:'Ladeinfrastruktur', hasAmp:false, hasKw:true,  color:'#C62828', shape:'shape-circle', iconType:'hybrid', defaultEmoji:'⚡', description:'DC-Schnellladestation (>50 kW). Benötigt größere Fundamente, höheren Leistungsanschluss und gekühlte Kabel.' },

  { id:'kvs', name:'KVS · Kabelverteilerschrank', icon:'KVS', pos:'5E.', price:275.00, unit:'Stk', category:'Verteilung', hasAmp:true,  hasKw:false, color:'#E65100', shape:'shape-square', iconType:'hybrid', defaultEmoji:'📦', description:'Passive Kabelverteilung zwischen Netzanschluss und Ladepunkten. Keine Messung, keine Schutzorgane — reine Sammelschienenfunktion.' },
  { id:'mws', name:'MWS · Messwandlerschrank',    icon:'MWS', pos:'6E.', price:275.00, unit:'Stk', category:'Verteilung', hasAmp:true,  hasKw:false, color:'#EF6C00', shape:'shape-square', iconType:'hybrid', defaultEmoji:'📊', description:'Schrank mit Strom-/Spannungswandlern für hohe Anschlussleistungen. Erforderlich bei indirekter Messung ab ~63 A.' },
  { id:'zas', name:'ZAS · Zähleranschlusssäule',  icon:'ZAS', pos:'7E.', price:275.00, unit:'Stk', category:'Verteilung', hasAmp:true,  hasKw:false, color:'#F57F17', shape:'shape-square', iconType:'hybrid', defaultEmoji:'🔢', description:'Außenstehende Zähleranschlusssäule mit Hauptzähler und ggf. Unterzählern. Direkte Messung bis ~63 A.' },
  { id:'nws', name:'NWS · Netzwerkverteiler',     icon:'NWS', pos:'',    price:0,      unit:'Stk', category:'Verteilung', hasAmp:false, hasKw:false, color:'#827717', shape:'shape-square', iconType:'hybrid', defaultEmoji:'🌐', description:'Switch/Router für Backend-Anbindung der Ladepunkte (OCPP). Benötigt Datenkabel und Stromversorgung.' },

  { id:'trafo', name:'Trafostation (kompakt)', icon:'TRA', pos:'4aE.', price:10350.00, unit:'Stk', category:'Netzanschluss', hasAmp:false, hasKw:true,  color:'#D84315', shape:'shape-square', iconType:'hybrid', defaultEmoji:'🏭', description:'Kompakter Mittelspannungstrafo (20/0,4 kV). Nur bei Standorten mit eigenem MS-Netzanschluss — Abstimmung mit VNB zwingend.' },
  { id:'best',  name:'Bestandsanschluss (HAK)', icon:'HAK', pos:'',     price:0,        unit:'Stk', category:'Netzanschluss', hasAmp:true,  hasKw:true,  color:'#3E2723', shape:'shape-square', iconType:'hybrid', defaultEmoji:'🔌', description:'Vorhandener Hausanschlusskasten der Liegenschaft. Kein Neubau — wird als Referenzpunkt für Leistungsprüfung und Leitungsführung aufgenommen.' },

  { id:'fund_ac', name:'AC-Fundament', icon:'FUN', pos:'8aE.', price:160.60, unit:'Stk', category:'Ausstattung', hasAmp:false, hasKw:false, color:'#5D4037', shape:'shape-hex', iconType:'hybrid', defaultEmoji:'🧱', description:'Betonfundament für AC-Ladesäulen (LN2/WA2). Abmessung und Ankerbild siehe Herstellervorgabe.' },
  { id:'fund_dc', name:'DC-Fundament', icon:'FDC', pos:'8bE.', price:218.90, unit:'Stk', category:'Ausstattung', hasAmp:false, hasKw:false, color:'#6D4C41', shape:'shape-hex', iconType:'hybrid', defaultEmoji:'🪨', description:'Verstärktes Betonfundament für DC-Schnelllader (LS2). Größer und tiefer als AC-Fundament wegen Gewicht und Verkabelung.' },
  { id:'poller',  name:'Anfahrpoller', icon:'POL', pos:'1aE.', price:224.40, unit:'Stk', category:'Ausstattung', hasAmp:false, hasKw:false, color:'#455A64', shape:'shape-hex', iconType:'hybrid', defaultEmoji:'🚧', description:'Rammschutz-Poller (Stahl, verzinkt). Schützt Ladesäulen vor Fahrzeuganprall. Positionen hängen vom Stellplatzlayout ab.' },
  { id:'schild',  name:'Parkplatzschild', icon:'SCH', pos:'2E.', price:59.40, unit:'Stk', category:'Ausstattung', hasAmp:false, hasKw:false, color:'#1976D2', shape:'shape-hex', iconType:'hybrid', defaultEmoji:'🪧', description:'Beschilderung „Elektrofahrzeug Ladestation" nach StVO (Zeichen 314 + Zusatz). Montage am Pfosten oder an Wand.' },

  { id:'kernb',  name:'Kernbohrung',                 icon:'KB', pos:'28b.', price:198.00, unit:'Stk', category:'Durchbruch', hasAmp:false, hasKw:false, color:'#6A1B9A', shape:'shape-hex', iconType:'hybrid', defaultEmoji:'🕳', description:'Diamantbohrung durch Wände/Decken für Kabelführung. Ausführung bei Stahlbeton zuschlagspflichtig.' },
  { id:'dbrand', name:'Brandabschnitt-Durchquerung', icon:'BA', pos:'28a.', price:292.10, unit:'Stk', category:'Durchbruch', hasAmp:false, hasKw:false, color:'#BF360C', shape:'shape-hex', iconType:'hybrid', defaultEmoji:'🚪', description:'Zulassungskonforme Schottung bei Durchquerung von Brandabschnitten (F30/F90). Dokumentations- und Abnahmepflicht.' },

  { id:'tiefen', name:'Tiefenerder V4A (3m)', icon:'TE', pos:'aLV.', price:663.30, unit:'Stk', category:'Erdung', hasAmp:false, hasKw:false, color:'#00695C', shape:'shape-hex', iconType:'hybrid', defaultEmoji:'⚓', description:'Edelstahl-Tiefenerder (V4A), 3 m Länge. Einsatz wenn Fundamenterder nicht ausreicht oder nicht vorhanden.' },
  { id:'kreuz',  name:'Kreuzverbinder V4A',   icon:'KV', pos:'aLV.', price:21.44,  unit:'Stk', category:'Erdung', hasAmp:false, hasKw:false, color:'#00838F', shape:'shape-hex', iconType:'hybrid', defaultEmoji:'✖️', description:'V4A-Kreuzverbinder für Erdungsbandverbindungen. Pro Verbindungspunkt zwischen Flachband/Runderder erforderlich.' },

  { id:'foto', name:'Foto-Wegpunkt', icon:'📷', pos:'', price:0, unit:'Stk', category:'Sonstiges', hasAmp:false, hasKw:false, color:'#455A64', shape:'shape-hex', iconType:'emoji', defaultEmoji:'📷', description:'Position, an der ein Foto für die Dokumentation aufgenommen werden soll. Kein physisches Asset — nur Markierung für Begehung.' }
];

// Kabeltyp-Standard (8 Typen, builtin=true)
export const DEFAULT_CABLE_TYPES = [
  { id:'k1', label:'Stromkabel ≤22kW',       price:19.83,  lvPos:'19a.', color:'#00796B', builtin:true },
  { id:'k2', label:'Stromkabel >22 ≤50kW',   price:39.27,  lvPos:'19b.', color:'#F57C00', builtin:true },
  { id:'k3', label:'Stromkabel >50 <100kW',  price:167.18, lvPos:'19c.', color:'#E65100', builtin:true },
  { id:'k4', label:'Stromkabel ≥100 ≤150kW', price:194.40, lvPos:'19d.', color:'#D32F2F', builtin:true },
  { id:'d',  label:'Datenkabel',             price:2.65,   lvPos:'20.',  color:'#666666', builtin:true },
  { id:'l',  label:'Leerrohr',               price:14.26,  lvPos:'21.',  color:'#7E57C2', builtin:true },
  { id:'fb', label:'Flachband V4A (Erdung)', price:30.00,  lvPos:'',     color:'#00695C', builtin:true },
  { id:'re', label:'Runderder V4A (Erdung)', price:40.20,  lvPos:'aLV.', color:'#00838F', builtin:true }
];

// Emoji-Picker Kategorien
export const EMOJI_PICKER_CATEGORIES = [
  { title: 'Elektro',        emojis: ['🔌','🔋','⚡','🪫','🔦','💡','🔆','🔅','🪛','🔧','⚙️','🧰','🔩','🔗','🪜','🛠'] },
  { title: 'Bau / Tiefbau',  emojis: ['🧱','🪨','🚧','🏗','🏭','🏢','🏠','🪧','🕳','🚪','🧯','⛏','🪓','🔨','🪚','⚒'] },
  { title: 'Infrastruktur',  emojis: ['🌐','📡','📊','📶','📈','📉','📋','🗄','📦','🗃','📤','📥','🧮','🔢','🔣','🔤'] },
  { title: 'Fahrzeuge',      emojis: ['🚗','🚙','🚐','🚚','🚛','🏎','🏍','🚲','🛵','🛺','🚘','🚖','🚓','🚨','🚦','🅿️'] },
  { title: 'Symbole',        emojis: ['⚓','✖️','➕','✅','❌','⭕','🔴','🟢','🟡','🟠','🔵','🟣','⚫','⚪','🟤','🔶'] },
  { title: 'Dokumentation',  emojis: ['📷','📸','🖼','📹','🎥','🔍','🔎','📝','✏️','📐','📏','🧷','📎','🔖','📌','📍'] }
];
