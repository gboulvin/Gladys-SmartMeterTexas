// -----------------------------------------------------------------------------
// User-facing messages, in the four languages of the Gladys UI.
//
// Every message the integration returns to Gladys (action results, connection
// status, widget toasts and texts) is a multi-language object
// `{ en, fr, de, es }`: Gladys picks the user's language, `en` is the fallback.
// Placeholders are written `{name}` and filled by `t(key, vars)`.
// -----------------------------------------------------------------------------

export const LANGUAGES = ['en', 'fr', 'de', 'es'];

export const MESSAGES = {
  not_configured: {
    en: 'Enter your Smart Meter Texas username and password.',
    fr: 'Renseignez votre identifiant et votre mot de passe Smart Meter Texas.',
    de: 'Geben Sie Ihren Smart-Meter-Texas-Benutzernamen und Ihr Passwort ein.',
    es: 'Introduzca su usuario y contraseña de Smart Meter Texas.',
  },
  auth_failed: {
    en: 'Smart Meter Texas refused the username or the password.',
    fr: "Smart Meter Texas a refusé l'identifiant ou le mot de passe.",
    de: 'Smart Meter Texas hat Benutzername oder Passwort abgelehnt.',
    es: 'Smart Meter Texas rechazó el usuario o la contraseña.',
  },
  rate_limited: {
    en: 'Smart Meter Texas is limiting requests. Try again later.',
    fr: 'Smart Meter Texas limite les requêtes. Réessayez plus tard.',
    de: 'Smart Meter Texas begrenzt die Anfragen. Versuchen Sie es später erneut.',
    es: 'Smart Meter Texas está limitando las solicitudes. Inténtelo más tarde.',
  },
  service_error: {
    en: 'Smart Meter Texas is unreachable, check the integration logs.',
    fr: "Smart Meter Texas est injoignable, consultez les logs de l'intégration.",
    de: 'Smart Meter Texas ist nicht erreichbar, prüfen Sie die Protokolle der Integration.',
    es: 'Smart Meter Texas no responde, consulte los registros de la integración.',
  },
  connection_ok: {
    en: 'Connected to Smart Meter Texas: {count} meter(s) found.',
    fr: 'Connecté à Smart Meter Texas : {count} compteur(s) trouvé(s).',
    de: 'Mit Smart Meter Texas verbunden: {count} Zähler gefunden.',
    es: 'Conectado a Smart Meter Texas: {count} contador(es) encontrado(s).',
  },
  unknown_meter: {
    en: 'This meter is not on your Smart Meter Texas account.',
    fr: "Ce compteur n'est pas sur votre compte Smart Meter Texas.",
    de: 'Dieser Zähler gehört nicht zu Ihrem Smart-Meter-Texas-Konto.',
    es: 'Este contador no está en su cuenta de Smart Meter Texas.',
  },
  read_done: {
    en: 'Meter read: {reading} kWh.',
    fr: 'Relevé du compteur : {reading} kWh.',
    de: 'Zählerstand: {reading} kWh.',
    es: 'Lectura del contador: {reading} kWh.',
  },
  read_requested: {
    en: 'Reading requested: the value arrives within 5 minutes.',
    fr: 'Relevé demandé : la valeur arrive sous 5 minutes.',
    de: 'Ablesung angefordert: der Wert kommt in 5 Minuten.',
    es: 'Lectura solicitada: el valor llega en 5 minutos.',
  },
  read_too_soon: {
    en: 'Last read {minutes} min ago: Smart Meter Texas allows 2 per hour.',
    fr: 'Dernier relevé il y a {minutes} min : Smart Meter Texas en autorise 2 par heure.',
    de: 'Letzte Ablesung vor {minutes} Min.: Smart Meter Texas erlaubt 2 pro Stunde.',
    es: 'Última lectura hace {minutes} min: Smart Meter Texas permite 2 por hora.',
  },
  read_timeout: {
    en: 'The meter did not answer in time. Try again later.',
    fr: "Le compteur n'a pas répondu à temps. Réessayez plus tard.",
    de: 'Der Zähler hat nicht rechtzeitig geantwortet. Versuchen Sie es später erneut.',
    es: 'El contador no respondió a tiempo. Inténtelo más tarde.',
  },
  daily_done: {
    en: '{date}: {consumption} kWh used, {surplus} kWh surplus.',
    fr: '{date} : {consumption} kWh consommés, {surplus} kWh de surplus.',
    de: '{date}: {consumption} kWh verbraucht, {surplus} kWh Überschuss.',
    es: '{date}: {consumption} kWh consumidos, {surplus} kWh de excedente.',
  },
  daily_unavailable: {
    en: 'Smart Meter Texas has no interval data for these days yet.',
    fr: "Smart Meter Texas n'a pas encore de données pour ces jours.",
    de: 'Smart Meter Texas hat für diese Tage noch keine Daten.',
    es: 'Smart Meter Texas aún no tiene datos para estos días.',
  },
  no_meter: {
    en: 'No meter yet: add one from the Discover tab.',
    fr: "Aucun compteur : ajoutez-en un depuis l'onglet Découverte.",
    de: 'Noch kein Zähler: fügen Sie einen über den Tab „Entdecken“ hinzu.',
    es: 'Aún no hay contador: añada uno desde la pestaña Descubrir.',
  },
};

/**
 * Multi-language message, placeholders filled.
 * @param {keyof typeof MESSAGES} key
 * @param {Record<string, string | number>} [vars]
 * @returns {{ en: string, fr: string, de: string, es: string }}
 */
export function t(key, vars = {}) {
  const message = MESSAGES[key];
  if (!message) {
    throw new Error(`Unknown message: ${key}`);
  }
  return Object.fromEntries(
    Object.entries(message).map(([lang, text]) => [
      lang,
      text.replace(/\{(\w+)\}/g, (match, name) => (name in vars ? String(vars[name]) : match)),
    ]),
  );
}

/**
 * Same text in every language (numbers, dates, addresses).
 * @param {string} text
 */
export function same(text) {
  return Object.fromEntries(LANGUAGES.map((lang) => [lang, text]));
}
