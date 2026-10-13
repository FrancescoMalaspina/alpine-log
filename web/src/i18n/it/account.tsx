import type en from '../en/account';
import type { Widen } from '../types';

const it: Widen<typeof en> = {
  visits: (n: number) => (n === 1 ? '1 visita' : `${n} visite`),
  routes: (n: number) => (n === 1 ? '1 via' : `${n} vie`),

  confirm: {
    cancel: 'Annulla',
    typeToConfirm: (name: string) => <>Scrivi <strong translate="no">{name}</strong> per confermare</>,
  },

  myLog: {
    title: (name: string) => `Diario di ${name}`,
    titleNoName: 'Il mio diario',
    since: (first: string, last: string) => `Dal ${first}, ultima uscita il ${last}`,
    download: 'Scarica il diario',
    downloadUse: 'CSV, JSON o GPX',
    import: 'Importa visite',
    importPast: (n: number) => (n === 1 ? 'Da un file, o annulla l’importazione passata' : `Da un file, o annulla una delle ${n} importazioni passate`),
    importNew: 'Da Excel, CSV o JSON',
    loading: 'Caricamento delle tue visite…',
    empty: 'Ancora nulla nel diario. Usa Registra una visita per iniziare, oppure importalo da un foglio di calcolo.',
    daysOut: 'Uscite',
    routesTotal: 'Vie',
    spots: 'Spot',
    areas: 'Aree',
    statistics: 'Statistiche',
    byActivity: 'Per attività',
    activity: 'Attività',
    days: 'Giorni',
    hardest: 'Più difficile',
    hardestSent: 'Più dura chiusa',
    byYear: 'Per anno',
    year: 'Anno',
    noDate: 'Senza data',
    allVisits: 'Tutte le visite',
    onlyOne: 'Mostra una sola attività',
    all: 'Tutte',
  },

  logbookModals: {
    exports: {
      csv: { name: 'Foglio di calcolo (CSV)', use: 'Una riga per via, per Excel, Numbers o Google Fogli' },
      json: { name: 'Backup completo (JSON)', use: 'Ogni dettaglio di ogni visita, da conservare o importare altrove' },
      gpx: { name: 'Spot per GPS (GPX)', use: 'Gli spot visitati come waypoint, per Garmin, Komoot, OsmAnd, Google Earth' },
    },
    downloadError: (message: string) => `Impossibile preparare il download: ${message}`,
    downloadTitle: 'Scarica il tuo diario',
    downloadSubtitle: 'Tutte le visite registrate, nel formato che ti serve.',
    preparing: 'Preparazione…',
    undoTitle: 'Annullare questa importazione?',
    undoMessage: (n: number, file: string) =>
      `${n === 1 ? 'Elimina la visita importata' : `Elimina le ${n} visite importate`} da “${file}”. Gli spot che ha creato restano sulla mappa.`,
    undoConfirm: 'Annulla importazione',
    undoError: (message: string) => `Impossibile annullare l'importazione: ${message}`,
    importTitle: 'Importa visite',
    importSubtitle: 'Porta qui un diario tenuto altrove.',
    fromFile: 'Da un file',
    fromFileUse: 'Excel, CSV o JSON, in qualsiasi formato: controlli ogni colonna prima che venga salvato qualcosa',
    pastImports: 'Importazioni passate',
    undoing: 'Annullamento…',
    undo: 'Annulla',
  },

  wishlist: {
    title: 'Lista dei desideri',
    empty: () => <>I posti dove vuoi andare. Apri uno spot e scegli <strong>Aggiungi alla lista dei desideri</strong>; registrare una visita lì lo spunta.</>,
    with: (people: string) => `con ${people}`,
    logVisit: 'Registra visita',
    done: (n: number) => `Fatti (${n})`,
    visited: (date: string) => `visitato il ${date}`,
    doneOn: (date: string) => `fatto il ${date}`,
    reopen: 'Riapri',
  },

  accountPanel: {
    title: 'Account',
    profile: 'Profilo',
    email: 'Email',
    username: 'Nome utente',
    usernameSaved: 'Nome utente salvato.',
    users: 'Utenti',
    usersHint: 'Tutti gli iscritti: quando sono stati attivi l’ultima volta e quanto hanno registrato.',
    manageUsers: 'Gestisci utenti',
    deleteTitle: 'Elimina account',
    deleteHint: 'Elimina le tue visite, foto, allegati, importazioni e lista dei desideri. Spot, aree e vie che hai aggiunto restano per tutti.',
    deleteButton: 'Elimina il mio account…',
    deleteQuestion: 'Eliminare il tuo account?',
    deleteMessage: (email: string) => <>
      <p>Le tue visite, foto, allegati, importazioni e lista dei desideri vengono eliminati per sempre e non potrai più
        accedere come <strong>{email}</strong>.</p>
      <p>Spot, aree e vie che hai aggiunto restano sulla mappa, senza proprietario.</p>
    </>,
    deleteConfirm: 'Elimina il mio account',
  },

  users: {
    title: 'Utenti',
    columns: {
      username: 'Utente',
      email: 'Email',
      created_at: 'Iscrizione',
      last_active_at: 'Ultimo accesso',
      visits: 'Visite',
      last_visit: 'Ultima visita',
      spots_added: 'Spot',
    },
    sorts: {
      active: 'Attivi di recente',
      newest: 'Iscrizioni più recenti',
      oldest: 'Iscrizioni più vecchie',
      visits: 'Più visite',
      lastVisit: 'Visita più recente',
      spots: 'Più spot aggiunti',
      name: 'Nome utente A–Z',
    },
    users: (n: number) => (n === 1 ? '1 utente' : `${n} utenti`),
    meta: (accounts: number, active: number, visits: number) =>
      `${accounts === 1 ? '1 account' : `${accounts} account`} · ${active} attivi negli ultimi 30 giorni · ${visits === 1 ? '1 visita registrata' : `${visits} visite registrate`}`,
    search: 'Cerca per nome utente o email',
    searchLabel: 'Cerca utenti',
    role: 'Ruolo',
    everyone: 'Tutti',
    admins: 'Admin',
    usersOpt: 'Utenti',
    active: 'Attività',
    anyTime: 'Sempre',
    last7: 'Negli ultimi 7 giorni',
    last30: 'Negli ultimi 30 giorni',
    idle: 'Da più di 30 giorni',
    never: 'Mai',
    logged: 'Registrato',
    anything: 'Qualsiasi',
    someVisits: 'Con visite',
    noVisits: 'Senza visite',
    publicVisits: 'Visite pubbliche',
    sort: 'Ordina',
    byColumn: 'Per colonna',
    count: (shown: number, total: number) => `${shown} di ${total}`,
    clear: 'Azzera',
    noMatch: 'Nessun utente corrisponde.',
    actions: 'Azioni',
    newUsername: (name: string) => `Nuovo nome utente per ${name}`,
    publicCount: (n: number) => (n === 1 ? '(1 pubblica)' : `(${n} pubbliche)`),
    rename: 'Rinomina',
    removeAdmin: 'Togli admin',
    makeAdmin: 'Rendi admin',
    removeAdminTitle: (name: string) => `Togliere i diritti di admin a ${name}?`,
    removeAdminMessage: 'Mantiene il suo account e tutto ciò che ha aggiunto, ma non potrà più modificare gli spot degli altri né vedere le visite private.',
    deleteTitle: (name: string) => `Eliminare l'account di ${name}?`,
    deleteMessage: (visits: number, email: string) => <>
      <p>{visits === 1 ? 'La sua visita' : `Le sue ${visits} visite`}, foto, allegati, importazioni e lista dei desideri vengono eliminati per sempre e non
        potrà più accedere come <strong>{email}</strong>.</p>
      <p>Spot, aree e vie che ha aggiunto restano sulla mappa, senza proprietario.</p>
    </>,
    deleteConfirm: 'Elimina account',
  },

  export: {
    csvHeader: [
      'data', 'spot', 'area', 'settore', 'attivita', 'latitudine', 'longitudine', 'visibilita', 'con', 'durata_ore',
      'condizioni', 'riepilogo', 'avvicinamento', 'discesa', 'via', 'grado', 'parete', 'commento_via',
    ],
    gpxTitle: (name: string) => `Diario di ${name}`,
    undated: 'senza data',
    gpxVisits: (n: number) => (n === 1 ? '1 visita' : `${n} visite`),
    gpxRoutes: (n: number) => (n === 1 ? '1 via' : `${n} vie`),
  },
};

export default it;
