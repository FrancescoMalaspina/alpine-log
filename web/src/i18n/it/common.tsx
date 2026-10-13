import type en from '../en/common';
import type { Widen } from '../types';

const it: Widen<typeof en> = {
  cancel: 'Annulla',
  close: 'Chiudi',
  save: 'Salva',
  delete: 'Elimina',
  edit: 'Modifica',
  remove: 'Rimuovi',
  add: 'Aggiungi',
  back: '← Indietro',
  done: 'Fatto',
  loading: 'Caricamento…',
  private: 'Privata',
  public: 'Pubblica',
  admin: 'admin',
  you: '(tu)',
  never: 'Mai',

  language: 'Lingua',
  languages: { en: 'English', it: 'Italiano' },

  activities: {
    crag: 'Falesia',
    boulder: 'Boulder',
    multipitch: 'Via lunga',
    alpine: 'Alpinismo',
    ice: 'Cascate di ghiaccio',
    dws: 'Deep water solo',
    indoor: 'Palestra indoor',
    ski: 'Scialpinismo',
    hike: 'Escursionismo',
    trail: 'Trail running',
  },
  protections: { bolted: 'Spittata', trad: 'Trad', mixed: 'Mista' },
  styles: { onsight: 'A vista', flash: 'Flash', redpoint: 'Chiusa', toprope: 'In moulinette', attempt: 'Non chiusa' },
  priorities: { 1: 'Alta', 2: 'Normale', 3: 'Bassa' },
  seasons: { winter: 'Inverno', spring: 'Primavera', summer: 'Estate', autumn: 'Autunno' },

  timeAgo: {
    justNow: 'adesso',
    minutes: (n: number) => `${n} minuti fa`,
    hour: "un'ora fa",
    hours: (n: number) => `${n} ore fa`,
    yesterday: 'ieri',
    days: (n: number) => `${n} giorni fa`,
  },
  hours: (h: string) => `${h} h`,

  usernameHint: 'Il nome utente ha 3–30 caratteri tra lettere, cifre, punti, trattini o underscore.',

  errors: {
    usernameTaken: (name: string) => `"${name}" è già in uso.`,
    cantRename: 'Non puoi rinominare questo utente.',
    routeExists: (name: string) => `"${name}" è già nell'elenco.`,
    cantRemoveRoute: 'Può rimuoverla solo chi ha aggiunto la via o chi può modificare lo spot.',
    placeHasOthersVisits: 'Qui ci sono visite registrate da altre persone: solo un admin può eliminare questo spot.',
    areaExists: (name: string) => `Esiste già un'area chiamata "${name}".`,
    cantChangeArea: "Solo chi ha creato quest'area o un admin può modificarla.",
    cantDeleteArea: "Solo chi ha creato quest'area o un admin può eliminarla.",
    sectorExists: (name: string) => `In quest'area esiste già un settore chiamato "${name}".`,
    cantChangeSector: 'Solo chi ha creato questo settore o un admin può modificarlo.',
    cantDeleteSector: 'Solo chi ha creato questo settore o un admin può eliminarlo.',
    cantEditTip: 'Puoi modificare solo i tuoi consigli.',
    cantDeleteTip: 'Può rimuoverlo solo chi ha scritto il consiglio, o un admin.',
    linkScheme: 'I link devono iniziare con http:// o https://',
    fileTypes: 'Si possono caricare solo file .gpx e .pdf.',
    cantRemoveAttachment: "Può rimuoverlo solo chi l'ha aggiunto (o un admin).",
    cantDeleteVisit: 'Non puoi eliminare questa visita.',
    cantUndoImport: 'Non puoi annullare questa importazione.',
    aiBusy: "L'assistente AI è occupato (quota gratuita esaurita). Riprova tra un minuto, o abbina le colonne a mano.",
    aiFailed: (message: string) => `L'assistente AI non ha risposto: ${message}`,
    cantEditWish: 'Puoi modificare solo la tua lista dei desideri.',
    alreadyWished: 'Questo spot è già nella tua lista dei desideri.',
    photoUnreadable: (name: string) =>
      `Questo browser non riesce a leggere "${name}". Prova con un JPEG o un PNG (su iPhone, condividila come "Più compatibile").`,
    cantDeletePhoto: "Può eliminarla solo chi ha aggiunto la foto (o un admin).",
    locationSearch: (status: number) => `Ricerca del luogo non riuscita (${status})`,
  },
};

export default it;
