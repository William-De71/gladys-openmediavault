// -----------------------------------------------------------------------------
// Texts of the integration, in English, French, German and Spanish (English
// fallback).
//
// The manifest carries its own labels; these are the texts the code writes at
// runtime: device and feature names, states, widget contents, scene
// summaries, messages of the Configuration screen. Vocabulary of the Gladys
// interface: appareil / Gerät / dispositivo, scène / Szene / escena; and of
// the OpenMediaVault interface: système de fichiers / Dateisystem / sistema
// de archivos, disque / Laufwerk / disco.
//
// A key with `_one` and `_other` variants is a plural, chosen by tn() with
// the plural rules of the language (French: 0 and 1 are singular).
// -----------------------------------------------------------------------------

const LANGUAGES = ['en', 'fr', 'de', 'es'];

const TEXTS = {
  // devices
  nasDeviceName: {
    en: 'OpenMediaVault {name}',
    fr: 'OpenMediaVault {name}',
    de: 'OpenMediaVault {name}',
    es: 'OpenMediaVault {name}',
  },
  diskDeviceName: {
    en: 'Disk {name}',
    fr: 'Disque {name}',
    de: 'Laufwerk {name}',
    es: 'Disco {name}',
  },
  filesystemDeviceName: {
    en: 'File system {name}',
    fr: 'Système de fichiers {name}',
    de: 'Dateisystem {name}',
    es: 'Sistema de archivos {name}',
  },
  serviceDeviceName: {
    en: 'Service {name}',
    fr: 'Service {name}',
    de: 'Dienst {name}',
    es: 'Servicio {name}',
  },
  featureCpu: { en: 'CPU usage', fr: 'Utilisation CPU', de: 'CPU-Auslastung', es: 'Uso de CPU' },
  featureMemory: {
    en: 'Memory usage',
    fr: 'Utilisation mémoire',
    de: 'Speicherauslastung',
    es: 'Uso de memoria',
  },
  featureUptime: {
    en: 'Uptime',
    fr: 'Durée de fonctionnement',
    de: 'Betriebszeit',
    es: 'Tiempo activo',
  },
  featureUpdates: {
    en: 'Updates available',
    fr: 'Mises à jour disponibles',
    de: 'Verfügbare Updates',
    es: 'Actualizaciones disponibles',
  },
  featureVersion: { en: 'Version', fr: 'Version', de: 'Version', es: 'Versión' },
  featureTemperature: {
    en: 'Temperature',
    fr: 'Température',
    de: 'Temperatur',
    es: 'Temperatura',
  },
  featurePower: {
    en: 'Power state',
    fr: 'État d’alimentation',
    de: 'Energiezustand',
    es: 'Estado de energía',
  },
  featureHealth: {
    en: 'S.M.A.R.T. health',
    fr: 'Santé S.M.A.R.T.',
    de: 'S.M.A.R.T.-Zustand',
    es: 'Salud S.M.A.R.T.',
  },
  featureUsed: {
    en: 'Space used',
    fr: 'Espace utilisé',
    de: 'Belegter Speicher',
    es: 'Espacio usado',
  },
  featureFree: { en: 'Free space', fr: 'Espace libre', de: 'Freier Speicher', es: 'Espacio libre' },
  featureRunning: { en: 'Running', fr: 'En marche', de: 'Läuft', es: 'En ejecución' },

  // states
  power_active: { en: 'Active', fr: 'Actif', de: 'Aktiv', es: 'Activo' },
  power_standby: { en: 'Standby', fr: 'En veille', de: 'Standby', es: 'En reposo' },
  power_unknown: { en: 'Unknown', fr: 'Inconnu', de: 'Unbekannt', es: 'Desconocido' },
  health_good: { en: 'Good', fr: 'Bon', de: 'Gut', es: 'Bueno' },
  health_warning: {
    en: 'Past problem',
    fr: 'Problème passé',
    de: 'Früheres Problem',
    es: 'Problema pasado',
  },
  health_bad: { en: 'Failing', fr: 'Défaillant', de: 'Fehlerhaft', es: 'Con fallos' },
  health_unknown: { en: 'Not read', fr: 'Non lu', de: 'Nicht gelesen', es: 'Sin leer' },

  // scene summaries
  summaryConnection_lost: {
    en: '{name} no longer answers.',
    fr: '{name} ne répond plus.',
    de: '{name} antwortet nicht mehr.',
    es: '{name} ya no responde.',
  },
  summaryConnection_restored: {
    en: '{name} answers again after {minutes} min.',
    fr: '{name} répond de nouveau après {minutes} min.',
    de: '{name} antwortet nach {minutes} Min. wieder.',
    es: '{name} vuelve a responder tras {minutes} min.',
  },
  summaryRebooted: {
    en: '{name} has restarted.',
    fr: '{name} a redémarré.',
    de: '{name} wurde neu gestartet.',
    es: '{name} se ha reiniciado.',
  },
  summaryRebootRequired: {
    en: '{name} needs a reboot to finish its updates.',
    fr: '{name} doit redémarrer pour terminer ses mises à jour.',
    de: '{name} muss neu starten, um die Updates abzuschließen.',
    es: '{name} debe reiniciarse para terminar sus actualizaciones.',
  },
  summaryHealth_good: {
    en: 'Disk {name}: S.M.A.R.T. health is good again.',
    fr: 'Disque {name} : la santé S.M.A.R.T. est de nouveau bonne.',
    de: 'Laufwerk {name}: Der S.M.A.R.T.-Zustand ist wieder gut.',
    es: 'Disco {name}: la salud S.M.A.R.T. vuelve a ser buena.',
  },
  summaryHealth_warning: {
    en: 'Disk {name}: S.M.A.R.T. reports a past problem ({status}).',
    fr: 'Disque {name} : le S.M.A.R.T. signale un problème passé ({status}).',
    de: 'Laufwerk {name}: S.M.A.R.T. meldet ein früheres Problem ({status}).',
    es: 'Disco {name}: S.M.A.R.T. indica un problema pasado ({status}).',
  },
  summaryHealth_bad: {
    en: 'Disk {name} is failing ({status}): back up its data.',
    fr: 'Le disque {name} est défaillant ({status}) : sauvegardez ses données.',
    de: 'Laufwerk {name} ist fehlerhaft ({status}): Sichern Sie seine Daten.',
    es: 'El disco {name} está fallando ({status}): haga copia de sus datos.',
  },
  summaryUsage_above: {
    en: '{name} is {used} % full (threshold {threshold} %), {free} free.',
    fr: '{name} est plein à {used} % (seuil {threshold} %), {free} libres.',
    de: '{name} ist zu {used} % belegt (Schwelle {threshold} %), {free} frei.',
    es: '{name} está al {used} % (umbral {threshold} %), {free} libres.',
  },
  summaryUsage_below: {
    en: '{name} is back under {threshold} % ({used} %).',
    fr: '{name} repasse sous {threshold} % ({used} %).',
    de: '{name} liegt wieder unter {threshold} % ({used} %).',
    es: '{name} vuelve a estar por debajo del {threshold} % ({used} %).',
  },
  summaryMount_missing: {
    en: 'File system {name} ({mountpoint}) is no longer mounted.',
    fr: 'Le système de fichiers {name} ({mountpoint}) n’est plus monté.',
    de: 'Das Dateisystem {name} ({mountpoint}) ist nicht mehr eingehängt.',
    es: 'El sistema de archivos {name} ({mountpoint}) ya no está montado.',
  },
  summaryMount_mounted: {
    en: 'File system {name} is mounted on {mountpoint}.',
    fr: 'Le système de fichiers {name} est monté sur {mountpoint}.',
    de: 'Das Dateisystem {name} ist unter {mountpoint} eingehängt.',
    es: 'El sistema de archivos {name} está montado en {mountpoint}.',
  },
  summaryService_started: {
    en: 'Service {name} has started.',
    fr: 'Le service {name} a démarré.',
    de: 'Der Dienst {name} wurde gestartet.',
    es: 'El servicio {name} se ha iniciado.',
  },
  summaryService_stopped: {
    en: 'Service {name} has stopped.',
    fr: 'Le service {name} s’est arrêté.',
    de: 'Der Dienst {name} wurde beendet.',
    es: 'El servicio {name} se ha detenido.',
  },
  updatesUnknown: {
    en: 'The updates are not known.',
    fr: 'Les mises à jour ne sont pas connues.',
    de: 'Die Updates sind nicht bekannt.',
    es: 'Las actualizaciones no se conocen.',
  },
  updatesUpToDate: {
    en: 'OpenMediaVault {version} is up to date.',
    fr: 'OpenMediaVault {version} est à jour.',
    de: 'OpenMediaVault {version} ist aktuell.',
    es: 'OpenMediaVault {version} está actualizado.',
  },
  updatesSentence_one: {
    en: '{count} update available.',
    fr: '{count} mise à jour disponible.',
    de: '{count} Update verfügbar.',
    es: '{count} actualización disponible.',
  },
  updatesSentence_other: {
    en: '{count} updates available.',
    fr: '{count} mises à jour disponibles.',
    de: '{count} Updates verfügbar.',
    es: '{count} actualizaciones disponibles.',
  },
  rebootSentence: {
    en: 'A reboot is required.',
    fr: 'Un redémarrage est nécessaire.',
    de: 'Ein Neustart ist erforderlich.',
    es: 'Se necesita un reinicio.',
  },
  summaryStatus: {
    en: '{name}: CPU {cpu} %, memory {memory} %.',
    fr: '{name} : CPU {cpu} %, mémoire {memory} %.',
    de: '{name}: CPU {cpu} %, Speicher {memory} %.',
    es: '{name}: CPU {cpu} %, memoria {memory} %.',
  },
  summaryStatusFullest: {
    en: 'Fullest file system: {name} ({used} %).',
    fr: 'Système de fichiers le plus plein : {name} ({used} %).',
    de: 'Vollstes Dateisystem: {name} ({used} %).',
    es: 'Sistema de archivos más lleno: {name} ({used} %).',
  },
  summaryStatusBadDisks_one: {
    en: '{count} disk has S.M.A.R.T. problems.',
    fr: '{count} disque a des problèmes S.M.A.R.T.',
    de: '{count} Laufwerk hat S.M.A.R.T.-Probleme.',
    es: '{count} disco tiene problemas S.M.A.R.T.',
  },
  summaryStatusBadDisks_other: {
    en: '{count} disks have S.M.A.R.T. problems.',
    fr: '{count} disques ont des problèmes S.M.A.R.T.',
    de: '{count} Laufwerke haben S.M.A.R.T.-Probleme.',
    es: '{count} discos tienen problemas S.M.A.R.T.',
  },
  summaryStatusMissing_one: {
    en: '{count} file system is not mounted.',
    fr: '{count} système de fichiers n’est pas monté.',
    de: '{count} Dateisystem ist nicht eingehängt.',
    es: '{count} sistema de archivos no está montado.',
  },
  summaryStatusMissing_other: {
    en: '{count} file systems are not mounted.',
    fr: '{count} systèmes de fichiers ne sont pas montés.',
    de: '{count} Dateisysteme sind nicht eingehängt.',
    es: '{count} sistemas de archivos no están montados.',
  },
  summaryStatusStopped: {
    en: 'Stopped: {names}.',
    fr: 'Arrêtés : {names}.',
    de: 'Beendet: {names}.',
    es: 'Detenidos: {names}.',
  },

  // widgets
  overviewCaption: {
    en: '{name} · OpenMediaVault {version} · {ago}',
    fr: '{name} · OpenMediaVault {version} · {ago}',
    de: '{name} · OpenMediaVault {version} · {ago}',
    es: '{name} · OpenMediaVault {version} · {ago}',
  },
  tileCpu: { en: 'CPU', fr: 'CPU', de: 'CPU', es: 'CPU' },
  tileMemory: { en: 'Memory', fr: 'Mémoire', de: 'Speicher', es: 'Memoria' },
  rowUptime: { en: 'Uptime', fr: 'En marche depuis', de: 'Betriebszeit', es: 'Activo desde hace' },
  uptimeValue: {
    en: '{days} d {hours} h',
    fr: '{days} j {hours} h',
    de: '{days} T. {hours} Std.',
    es: '{days} d {hours} h',
  },
  rowUpdates: { en: 'Updates', fr: 'Mises à jour', de: 'Updates', es: 'Actualizaciones' },
  updatesUnchecked: { en: 'Unknown', fr: 'Inconnues', de: 'Unbekannt', es: 'Desconocidas' },
  updatesNone: { en: 'Up to date', fr: 'À jour', de: 'Aktuell', es: 'Al día' },
  updatesCount_one: {
    en: '{count} available',
    fr: '{count} disponible',
    de: '{count} verfügbar',
    es: '{count} disponible',
  },
  updatesCount_other: {
    en: '{count} available',
    fr: '{count} disponibles',
    de: '{count} verfügbar',
    es: '{count} disponibles',
  },
  rowReboot: { en: 'Reboot', fr: 'Redémarrage', de: 'Neustart', es: 'Reinicio' },
  rowRebootRequired: { en: 'Required', fr: 'Nécessaire', de: 'Erforderlich', es: 'Necesario' },
  rowDisks: { en: 'Disks', fr: 'Disques', de: 'Laufwerke', es: 'Discos' },
  rowFilesystems: {
    en: 'File systems',
    fr: 'Systèmes de fichiers',
    de: 'Dateisysteme',
    es: 'Sistemas de archivos',
  },
  rowMissing_one: {
    en: '{count} missing',
    fr: '{count} manquant',
    de: '{count} fehlt',
    es: '{count} ausente',
  },
  rowMissing_other: {
    en: '{count} missing',
    fr: '{count} manquants',
    de: '{count} fehlen',
    es: '{count} ausentes',
  },
  rowServices: { en: 'Services', fr: 'Services', de: 'Dienste', es: 'Servicios' },
  servicesRunning_one: {
    en: '{count} running',
    fr: '{count} en marche',
    de: '{count} läuft',
    es: '{count} en marcha',
  },
  servicesRunning_other: {
    en: '{count} running',
    fr: '{count} en marche',
    de: '{count} laufen',
    es: '{count} en marcha',
  },
  servicesStopped: {
    en: 'Stopped: {names}',
    fr: 'Arrêtés : {names}',
    de: 'Beendet: {names}',
    es: 'Detenidos: {names}',
  },
  buttonCheckUpdates: {
    en: 'Check for updates',
    fr: 'Vérifier mises à jour',
    de: 'Nach Updates suchen',
    es: 'Buscar actualizaciones',
  },
  buttonReboot: { en: 'Reboot', fr: 'Redémarrer', de: 'Neu starten', es: 'Reiniciar' },
  buttonShutdown: { en: 'Shut down', fr: 'Éteindre', de: 'Herunterfahren', es: 'Apagar' },
  disksFailing: {
    en: '{count} failing of {total}',
    fr: '{count} en défaut sur {total}',
    de: '{count} von {total} fehlerhaft',
    es: '{count} con fallos de {total}',
  },
  disksWatched: {
    en: '{count} to watch of {total}',
    fr: '{count} à surveiller sur {total}',
    de: '{count} von {total} beobachten',
    es: '{count} a vigilar de {total}',
  },
  disksHottest_one: {
    en: '{count} · {temperature} °C',
    fr: '{count} · {temperature} °C',
    de: '{count} · {temperature} °C',
    es: '{count} · {temperature} °C',
  },
  disksHottest_other: {
    en: '{count} · up to {temperature} °C',
    fr: '{count} · jusqu’à {temperature} °C',
    de: '{count} · bis {temperature} °C',
    es: '{count} · hasta {temperature} °C',
  },
  disksCount_one: {
    en: '{count} disk',
    fr: '{count} disque',
    de: '{count} Laufwerk',
    es: '{count} disco',
  },
  disksCount_other: {
    en: '{count} disks',
    fr: '{count} disques',
    de: '{count} Laufwerke',
    es: '{count} discos',
  },
  freeOf: {
    en: '{free} free of {size}',
    fr: '{free} libres sur {size}',
    de: '{free} frei von {size}',
    es: '{free} libres de {size}',
  },
  tileUsed: { en: 'Used', fr: 'Utilisé', de: 'Belegt', es: 'Usado' },
  tileFree: { en: 'Free', fr: 'Libre', de: 'Frei', es: 'Libre' },
  tileSize: { en: 'Size', fr: 'Taille', de: 'Größe', es: 'Tamaño' },
  chartUsed: {
    en: 'Space used',
    fr: 'Espace utilisé',
    de: 'Belegter Speicher',
    es: 'Espacio usado',
  },
  noFilesystems: {
    en: 'No file system is mounted in OpenMediaVault yet (Storage > File Systems).',
    fr: 'Aucun système de fichiers n’est encore monté dans OpenMediaVault (Stockage > Systèmes de fichiers).',
    de: 'In OpenMediaVault ist noch kein Dateisystem eingehängt (Speicher > Dateisysteme).',
    es: 'Aún no hay ningún sistema de archivos montado en OpenMediaVault (Almacenamiento > Sistemas de archivos).',
  },
  badgeMissing: { en: 'Missing', fr: 'Absent', de: 'Fehlt', es: 'Ausente' },
  storageCaption_one: {
    en: '{count} file system · {free} free of {size}',
    fr: '{count} système de fichiers · {free} libres sur {size}',
    de: '{count} Dateisystem · {free} frei von {size}',
    es: '{count} sistema de archivos · {free} libres de {size}',
  },
  storageCaption_other: {
    en: '{count} file systems · {free} free of {size}',
    fr: '{count} systèmes de fichiers · {free} libres sur {size}',
    de: '{count} Dateisysteme · {free} frei von {size}',
    es: '{count} sistemas de archivos · {free} libres de {size}',
  },
  noDisks: {
    en: 'OpenMediaVault reports no disk with a serial number.',
    fr: 'OpenMediaVault ne signale aucun disque avec un numéro de série.',
    de: 'OpenMediaVault meldet kein Laufwerk mit Seriennummer.',
    es: 'OpenMediaVault no indica ningún disco con número de serie.',
  },
  smartOff: {
    en: 'S.M.A.R.T. off',
    fr: 'S.M.A.R.T. désactivé',
    de: 'S.M.A.R.T. aus',
    es: 'S.M.A.R.T. desactivado',
  },
  smartWaiting: {
    en: 'S.M.A.R.T. waits for the disks to wake',
    fr: 'S.M.A.R.T. attend le réveil des disques',
    de: 'S.M.A.R.T. wartet, bis die Laufwerke aufwachen',
    es: 'S.M.A.R.T. espera a que los discos despierten',
  },
  smartNotYet: {
    en: 'S.M.A.R.T. not read yet',
    fr: 'S.M.A.R.T. pas encore lu',
    de: 'S.M.A.R.T. noch nicht gelesen',
    es: 'S.M.A.R.T. aún sin leer',
  },
  smartRead: {
    en: 'S.M.A.R.T. {ago}',
    fr: 'S.M.A.R.T. {ago}',
    de: 'S.M.A.R.T. {ago}',
    es: 'S.M.A.R.T. {ago}',
  },

  // relative times
  ago_now: { en: 'just now', fr: 'à l’instant', de: 'gerade eben', es: 'ahora mismo' },
  ago_minutes: { en: '{n} min ago', fr: 'il y a {n} min', de: 'vor {n} Min.', es: 'hace {n} min' },
  ago_hours: { en: '{n} h ago', fr: 'il y a {n} h', de: 'vor {n} Std.', es: 'hace {n} h' },
  ago_days: { en: '{n} d ago', fr: 'il y a {n} j', de: 'vor {n} T.', es: 'hace {n} d' },

  // connection status and messages
  noCredentials: {
    en: 'Enter the address of OpenMediaVault, a user and its password in the configuration.',
    fr: 'Saisissez l’adresse d’OpenMediaVault, un utilisateur et son mot de passe dans la configuration.',
    de: 'Geben Sie in der Konfiguration die Adresse von OpenMediaVault, einen Benutzer und sein Passwort ein.',
    es: 'Introduzca la dirección de OpenMediaVault, un usuario y su contraseña en la configuración.',
  },
  notReadYet: {
    en: 'OpenMediaVault has not been read yet: see the connection status of the integration.',
    fr: 'OpenMediaVault n’a pas encore été lu : voyez l’état de connexion de l’intégration.',
    de: 'OpenMediaVault wurde noch nicht gelesen: Siehe Verbindungsstatus der Integration.',
    es: 'OpenMediaVault aún no se ha leído: vea el estado de conexión de la integración.',
  },
  statusConnected: {
    en: 'Connected to {name} (OpenMediaVault {version}).',
    fr: 'Connecté à {name} (OpenMediaVault {version}).',
    de: 'Verbunden mit {name} (OpenMediaVault {version}).',
    es: 'Conectado a {name} (OpenMediaVault {version}).',
  },
  statusInvalidLogin: {
    en: 'OpenMediaVault refused the user name or the password. New attempt in 10 min, or test the connection.',
    fr: 'OpenMediaVault a refusé l’utilisateur ou le mot de passe. Nouvel essai dans 10 min, ou testez la connexion.',
    de: 'OpenMediaVault hat Benutzername oder Passwort abgelehnt. Neuer Versuch in 10 Min. oder Verbindung testen.',
    es: 'OpenMediaVault rechazó el usuario o la contraseña. Nuevo intento en 10 min, o pruebe la conexión.',
  },
  statusNotAdmin: {
    en: 'This account is not an administrator of OpenMediaVault: use admin, or a user of the openmediavault-admin group.',
    fr: 'Ce compte n’est pas administrateur d’OpenMediaVault : utilisez admin, ou un utilisateur du groupe openmediavault-admin.',
    de: 'Dieses Konto ist kein Administrator von OpenMediaVault: Nutzen Sie admin oder einen Benutzer der Gruppe openmediavault-admin.',
    es: 'Esta cuenta no es administradora de OpenMediaVault: use admin, o un usuario del grupo openmediavault-admin.',
  },
  statusMfa: {
    en: 'This account asks for a second factor at login: use an account without two-factor authentication.',
    fr: 'Ce compte demande un second facteur à la connexion : utilisez un compte sans double authentification.',
    de: 'Dieses Konto verlangt beim Anmelden einen zweiten Faktor: Nutzen Sie ein Konto ohne Zwei-Faktor-Anmeldung.',
    es: 'Esta cuenta pide un segundo factor al iniciar sesión: use una cuenta sin doble autenticación.',
  },
  statusRateLimited: {
    en: 'OpenMediaVault blocks the logins after too many failures: wait a few minutes.',
    fr: 'OpenMediaVault bloque les connexions après trop d’échecs : patientez quelques minutes.',
    de: 'OpenMediaVault sperrt Anmeldungen nach zu vielen Fehlversuchen: Warten Sie einige Minuten.',
    es: 'OpenMediaVault bloquea los inicios de sesión tras demasiados fallos: espere unos minutos.',
  },
  statusTls: {
    en: 'The HTTPS certificate of OpenMediaVault is refused: turn off its check, or use a certificate Node.js trusts.',
    fr: 'Le certificat HTTPS d’OpenMediaVault est refusé : désactivez sa vérification, ou utilisez un certificat reconnu.',
    de: 'Das HTTPS-Zertifikat von OpenMediaVault wird abgelehnt: Prüfung abschalten oder ein vertrauenswürdiges Zertifikat nutzen.',
    es: 'Se rechaza el certificado HTTPS de OpenMediaVault: desactive su verificación, o use un certificado reconocido.',
  },
  statusUnreachable: {
    en: 'OpenMediaVault does not answer at {url}.',
    fr: 'OpenMediaVault ne répond pas à l’adresse {url}.',
    de: 'OpenMediaVault antwortet nicht unter {url}.',
    es: 'OpenMediaVault no responde en {url}.',
  },
  statusNotOmv: {
    en: 'The address {url} answers, but not as the web interface of OpenMediaVault.',
    fr: 'L’adresse {url} répond, mais pas comme l’interface web d’OpenMediaVault.',
    de: 'Die Adresse {url} antwortet, aber nicht als Weboberfläche von OpenMediaVault.',
    es: 'La dirección {url} responde, pero no como la interfaz web de OpenMediaVault.',
  },
  statusRpc: {
    en: 'OpenMediaVault reported an error: {message}',
    fr: 'OpenMediaVault a signalé une erreur : {message}',
    de: 'OpenMediaVault meldete einen Fehler: {message}',
    es: 'OpenMediaVault informó de un error: {message}',
  },
  testOk: {
    en: 'Connected to {name}, OpenMediaVault {version}, as an administrator.',
    fr: 'Connecté à {name}, OpenMediaVault {version}, en administrateur.',
    de: 'Verbunden mit {name}, OpenMediaVault {version}, als Administrator.',
    es: 'Conectado a {name}, OpenMediaVault {version}, como administrador.',
  },
  rebooting: {
    en: 'OpenMediaVault is restarting.',
    fr: 'OpenMediaVault redémarre.',
    de: 'OpenMediaVault startet neu.',
    es: 'OpenMediaVault se está reiniciando.',
  },
  shuttingDown: {
    en: 'OpenMediaVault is shutting down.',
    fr: 'OpenMediaVault s’éteint.',
    de: 'OpenMediaVault fährt herunter.',
    es: 'OpenMediaVault se está apagando.',
  },
  updatesStillRunning: {
    en: 'The package lists are still being read: look again in a minute.',
    fr: 'Les listes de paquets sont encore en lecture : regardez de nouveau dans une minute.',
    de: 'Die Paketlisten werden noch gelesen: Schauen Sie in einer Minute wieder.',
    es: 'Las listas de paquetes aún se están leyendo: vuelva a mirar en un minuto.',
  },
  unknownAction: {
    en: 'Unknown action.',
    fr: 'Action inconnue.',
    de: 'Unbekannte Aktion.',
    es: 'Acción desconocida.',
  },
};

/**
 * @description Whether a value is one of the supported languages.
 * @param {unknown} value - The value.
 * @returns {boolean} True for en, fr, de, es.
 */
function isLanguage(value) {
  return LANGUAGES.includes(value);
}

/**
 * @description A text in a language (English fallback), with its
 * substitutions.
 * @param {string} key - The TEXTS key (a plural key without its suffix is
 * resolved with `values.count`).
 * @param {string} language - The language.
 * @param {object} [values] - The substitutions.
 * @returns {string} The text.
 * @example
 * t('diskDeviceName', 'fr', { name: 'WDC WD40EFRX' }); // -> 'Disque WDC WD40EFRX'
 */
function t(key, language, values = {}) {
  let entry = TEXTS[key];
  if (!entry && TEXTS[`${key}_other`]) {
    const lang = isLanguage(language) ? language : 'en';
    const form = new Intl.PluralRules(lang).select(Number(values.count ?? 0));
    entry = TEXTS[`${key}_${form === 'one' ? 'one' : 'other'}`];
  }
  if (!entry) {
    return key;
  }
  const template = entry[language] ?? entry.en;
  return template.replace(/\{(\w+)\}/g, (_, name) => String(values[name] ?? ''));
}

/**
 * @description The text in every language, for a multi-language message.
 * @param {string} key - The TEXTS key.
 * @param {object} [values] - The substitutions.
 * @returns {{ en: string, fr: string, de: string, es: string }} The message.
 * @example
 * all('testOk', { name: 'nas', version: '8.5.12-1' });
 */
function all(key, values = {}) {
  return Object.fromEntries(LANGUAGES.map((language) => [language, t(key, language, values)]));
}

/**
 * @description A number written the way a language does, with at most
 * `digits` decimals ("7,2" in French).
 * @param {number|null} value - The number.
 * @param {string} language - The language.
 * @param {number} digits - The decimals.
 * @returns {string} The text, "?" when unknown.
 * @example
 * formatNumber(7.25, 'fr', 1); // -> '7,3'
 */
function formatNumber(value, language, digits) {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    return '?';
  }
  return new Intl.NumberFormat(isLanguage(language) ? language : 'en', {
    maximumFractionDigits: digits,
  }).format(value);
}

/**
 * @description A size in bytes the way OpenMediaVault shows it (binary
 * units), with the decimal separator of the language.
 * @param {number|null} bytes - The size.
 * @param {string} language - The language.
 * @returns {string} "2,72 GiB" in French, "?" when unknown.
 * @example
 * formatBytes(2915479552, 'fr'); // -> '2,72 GiB'
 */
function formatBytes(bytes, language) {
  if (typeof bytes !== 'number' || !Number.isFinite(bytes) || bytes < 0) {
    return '?';
  }
  const units = ['B', 'KiB', 'MiB', 'GiB', 'TiB', 'PiB'];
  let value = bytes;
  let unit = 0;
  while (value >= 1024 && unit < units.length - 1) {
    value /= 1024;
    unit += 1;
  }
  let digits = 2;
  if (unit === 0 || value >= 100) {
    digits = 0;
  } else if (value >= 10) {
    digits = 1;
  }
  return `${formatNumber(value, language, digits)} ${units[unit]}`;
}

/**
 * @description "12 min ago" for an instant.
 * @param {number} instant - The instant, in ms.
 * @param {number} now - Now, in ms.
 * @param {string} language - The language.
 * @returns {string} The relative time.
 * @example
 * ago(Date.now() - 600000, Date.now(), 'en'); // -> '10 min ago'
 */
function ago(instant, now, language) {
  const minutes = Math.max(0, Math.floor((now - instant) / 60000));
  if (minutes < 1) {
    return t('ago_now', language);
  }
  if (minutes < 60) {
    return t('ago_minutes', language, { n: minutes });
  }
  const hours = Math.floor(minutes / 60);
  if (hours < 48) {
    return t('ago_hours', language, { n: hours });
  }
  return t('ago_days', language, { n: Math.floor(hours / 24) });
}

export { LANGUAGES, TEXTS, isLanguage, t, all, formatNumber, formatBytes, ago };
