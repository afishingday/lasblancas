/**
 * Configuración específica del tenant (comunidad).
 * Al crear un nuevo cliente: clonar el repo, editar este archivo, y hacer deploy.
 */
export const TENANT = {
  /** Nombre corto de la comunidad (aparece en sidebar, títulos, etc.) */
  name: 'Las Blancas',

  /** Nombre completo para el título del portal y el browser tab */
  fullName: 'Portal Comunitario Las Blancas',

  /** Descripción larga para textos de login y disclaimers */
  locationDescription: 'conjunto campestre Las Blancas',

  /** Lote superadmin (acceso total + reset de claves) */
  superadminLot: 'SuperAdmin',

  /** Lotes con rol admin (editor de contenido) */
  adminLots: ['Lote4B', 'Lote29B'],

  /**
   * Ids numéricos de documentos `initiatives` cuya encuesta cuenta como respuesta de
   * "acceso a cámara de portada" si el usuario no tiene aún `cameraPortadaAccess` en Firestore.
   * Ej.: [ 12 ]. Si se deja vacío, se intenta detectar una votación por palabras clave (cámara/portada).
   */
  cameraPortadaSurveyInitiativeIds: [],

  /**
   * Lotes exentos de forzar cambio de contraseña al primer login.
   * Normalmente: admins + superadmin.
   */
  forcePwdExempt: ['Lote29B', 'SuperAdmin', 'Lote4B'],

  /**
   * Lista de sufijos de lotes que generan los usuarios por defecto.
   * Formato: número + etapa (ej. '1A', '15B', '20-1B').
   * Cada lote queda como `Lote{sufijo}` con clave inicial `Lote{sufijo}2026`.
   */
  lotSuffixes: [
    ...Array.from({ length: 20 }, (_, i) => `${i + 1}A`),
    ...Array.from({ length: 20 }, (_, i) => `${i + 1}B`),
    '20-1B',
    '20-2B',
    '21B',
    '23B',
    '24B',
    '25B',
    '26B',
    '27B',
    '28B',
    '29B',
    '30B',
    '31B',
    '32B',
    '33B',
    '34B',
    '35B',
    '36B',
    '37B',
    '38B',
  ],

  /**
   * Términos y condiciones del portal.
   * Cambiar `termsVersion` fuerza a todos los usuarios a aceptar nuevamente en su próximo acceso.
   * Reemplazar los placeholders [NOMBRE COMPLETO] y [NÚMERO DE CÉDULA] antes del primer deploy.
   */
  legal: {
    termsVersion: '1.0',
    termsUpdatedAt: '2026-04-26',
    ownerName: 'Luis Fernando Montoya Mejia',
    ownerDoc: 'C.C. 8100898',
    contact: 'luistyle@gmail.com',
    sections: [
      {
        title: 'Propiedad Intelectual',
        body: 'Este portal y todo su código fuente son propiedad exclusiva de su desarrollador, protegidos por la Ley 23 de 1982, la Decisión 351 de la CAN y la Ley 1915 de 2018. El acceso al portal no implica cesión de derechos sobre el software, su diseño ni sus componentes.',
      },
      {
        title: 'Licencia de Uso',
        body: 'Se otorga a los residentes del conjunto campestre Las Blancas una licencia de uso personal, intransferible y revocable para acceder al portal exclusivamente con fines comunitarios. El portal no puede ser reproducido, redistribuido ni empleado fuera de su propósito original.',
      },
      {
        title: 'Privacidad de Datos',
        body: 'Los datos ingresados (número de lote, nombre de finca) se almacenan en servidores de Google Firebase con el único fin de gestionar el acceso y la actividad comunitaria. El tratamiento se realiza conforme a la Ley 1581 de 2012 (Habeas Data). No se comparten datos con terceros. El usuario tiene derecho a conocer, actualizar, rectificar y suprimir su información personal, y a revocar su autorización de tratamiento en cualquier momento. Para ejercer estos derechos escribir a luistyle@gmail.com. También puede presentar reclamaciones ante la Superintendencia de Industria y Comercio (www.sic.gov.co).',
      },
      {
        title: 'Uso Aceptable',
        body: 'El portal debe usarse de manera respetuosa y conforme a las normas del conjunto. Queda prohibido publicar contenido ofensivo, falso o que vulnere los derechos de otros residentes. El administrador podrá suspender el acceso ante infracciones graves.',
      },
      {
        title: 'Limitación de Responsabilidad',
        body: 'El desarrollador no es responsable por el contenido publicado por los usuarios, decisiones tomadas con base en la información del portal, interrupciones del servicio ni fallas de terceros (Firebase, Google). El portal se ofrece como herramienta de apoyo comunitario sin garantías de disponibilidad continua.',
      },
      {
        title: 'Vigencia y Modificaciones',
        body: 'Estos términos entran en vigor desde la primera aceptación y permanecen vigentes mientras el usuario tenga acceso al portal. El desarrollador podrá actualizarlos notificando mediante el mismo portal. El uso continuado después de una actualización implica la aceptación de los nuevos términos.',
      },
    ],
  },

  /**
   * Valores por defecto de configuración pública.
   * Se usan si Firestore aún no tiene el documento de settings (primer arranque).
   */
  defaults: {
    workerName: 'Arley Franco',
    workerPhone: '+57 315 4293038',
    adminFeeCOP: 110000,
    paymentAlias: '@davi3137884550',
    paymentBankName: 'Banco Davivienda',
    paymentAccountNumber: '488445444166',
    paymentReceiptEmail: 'comunidadlasblancas@gmail.com',
  },
}
