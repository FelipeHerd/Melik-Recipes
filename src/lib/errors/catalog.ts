import { ERR, type AppErrorCode } from "./codes";

export type AppErrorEntry = {
  code: AppErrorCode;
  title: string;
  description?: string;
  // Show "Código: APP-XXX-###" in the toast/banner. Reserve for genuinely
  // unknown failures where the user might need it to report to support.
  showCode?: boolean;
};

export const ERRORS: Record<AppErrorCode, AppErrorEntry> = {
  [ERR.LOGIN_INVALID]: {
    code: ERR.LOGIN_INVALID,
    title: "No pudimos iniciar sesión",
    description: "Revisa tu correo y contraseña e inténtalo de nuevo.",
  },
  [ERR.SESSION_EXPIRED]: {
    code: ERR.SESSION_EXPIRED,
    title: "Tu sesión ha caducado",
    description: "Vuelve a iniciar sesión para continuar.",
  },
  [ERR.EMAIL_TAKEN]: {
    code: ERR.EMAIL_TAKEN,
    title: "Ese correo ya está registrado",
    description: "Prueba a iniciar sesión o recupera tu contraseña.",
  },
  [ERR.TOO_MANY_ATTEMPTS]: {
    code: ERR.TOO_MANY_ATTEMPTS,
    title: "Demasiados intentos",
    description: "Espera unos minutos antes de volver a intentarlo.",
  },
  [ERR.PASSWORD_WEAK]: {
    code: ERR.PASSWORD_WEAK,
    title: "Contraseña demasiado débil",
    description: "La contraseña es demasiado débil. Por favor, utiliza al menos 6 caracteres.",
  },
  [ERR.PASSWORD_MISMATCH]: {
    code: ERR.PASSWORD_MISMATCH,
    title: "Las contraseñas no coinciden",
    description: "Revisa que ambas contraseñas sean idénticas.",
  },
  [ERR.EMAIL_NOT_CONFIRMED]: {
    code: ERR.EMAIL_NOT_CONFIRMED,
    title: "Confirma tu correo",
    description: "Revisa tu bandeja de entrada y confirma tu dirección antes de iniciar sesión.",
  },
  [ERR.RECOVERY_LINK_EXPIRED]: {
    code: ERR.RECOVERY_LINK_EXPIRED,
    title: "Enlace caducado",
    description: "El enlace de recuperación ha expirado. Solicita uno nuevo.",
  },

  [ERR.PREMIUM_REQUIRED]: {
    code: ERR.PREMIUM_REQUIRED,
    title: "Necesitas Melik+",
    description: "Esta función está disponible en el plan Premium.",
  },
  [ERR.FORBIDDEN]: {
    code: ERR.FORBIDDEN,
    title: "No tienes permiso para esta acción",
  },
  [ERR.NO_UNLOCKS_AVAILABLE]: {
    code: ERR.NO_UNLOCKS_AVAILABLE,
    title: "No tienes desbloqueos disponibles",
    description:
      "Cada 6 meses acumulados de Melik+ ganas un desbloqueo permanente. Sigue suscrito para obtener el siguiente.",
  },


  [ERR.AI_RATE_LIMITED]: {
    code: ERR.AI_RATE_LIMITED,
    title: "Kiko está saturado",
    description: "Demasiadas solicitudes ahora mismo. Intenta en un minuto.",
  },
  [ERR.AI_UNAVAILABLE]: {
    code: ERR.AI_UNAVAILABLE,
    title: "Kiko no está disponible",
    description: "Estamos teniendo problemas con el asistente. Vuelve a intentarlo.",
    showCode: true,
  },
  [ERR.AI_BAD_RESPONSE]: {
    code: ERR.AI_BAD_RESPONSE,
    title: "Kiko tuvo un pequeño lapso",
    description: "Kiko tuvo un pequeño lapso de memoria al escribir la receta. Por favor, pídele que la genere de nuevo.",
  },
  [ERR.AI_BAD_RECIPE]: {
    code: ERR.AI_BAD_RECIPE,
    title: "Kiko tuvo un pequeño lapso",
    description: "Kiko tuvo un pequeño lapso de memoria al escribir la receta. Por favor, pídele que la genere de nuevo.",
  },
  [ERR.AI_BLOCKED]: {
    code: ERR.AI_BLOCKED,
    title: "Kiko en pausa para tu cuenta",
    description:
      "Un administrador pausó tu acceso a Kiko temporalmente. Si crees que es un error, contáctanos.",
  },

  [ERR.VOICE_LIMIT_REACHED]: {
    code: ERR.VOICE_LIMIT_REACHED,
    title: "Alcanzaste tu tiempo de voz diario",
    description: "Tu tiempo de llamada con Kiko se renueva mañana.",
  },
  [ERR.VOICE_MIC_DENIED]: {
    code: ERR.VOICE_MIC_DENIED,
    title: "Necesitamos tu micrófono",
    description: "Permite el acceso al micrófono en tu navegador para hablar con Kiko.",
  },
  [ERR.VOICE_UNAVAILABLE]: {
    code: ERR.VOICE_UNAVAILABLE,
    title: "La voz de Kiko no está disponible",
    description: "No pudimos iniciar la llamada. Inténtalo de nuevo en unos momentos.",
  },



  [ERR.FILE_BAD_FORMAT]: {
    code: ERR.FILE_BAD_FORMAT,
    title: "Formato no admitido",
    description: "Sube una imagen JPG, PNG o WEBP.",
  },
  [ERR.FILE_TOO_LARGE]: {
    code: ERR.FILE_TOO_LARGE,
    title: "Archivo demasiado grande",
    description: "Supera el tamaño máximo permitido.",
  },
  [ERR.FILE_READ_FAILED]: {
    code: ERR.FILE_READ_FAILED,
    title: "No pudimos leer el archivo",
    description: "Vuelve a intentarlo con otro archivo.",
  },

  [ERR.FORM_INVALID]: {
    code: ERR.FORM_INVALID,
    title: "Revisa los datos del formulario",
  },

  [ERR.RECIPE_NOT_FOUND]: {
    code: ERR.RECIPE_NOT_FOUND,
    title: "Receta no encontrada",
    description: "Puede que se haya eliminado o el enlace haya expirado.",
  },
  [ERR.RECIPE_ALREADY_MINE]: {
    code: ERR.RECIPE_ALREADY_MINE,
    title: "Ya tienes esta receta",
  },
  [ERR.RECIPE_NOT_SHAREABLE]: {
    code: ERR.RECIPE_NOT_SHAREABLE,
    title: "Esta receta no se puede compartir",
    description: "Las recetas oficiales de Melik no se comparten.",
  },
  [ERR.RECIPE_SAVE_FAILED]: {
    code: ERR.RECIPE_SAVE_FAILED,
    title: "No pudimos guardar la receta",
    description: "Revisa el título, los ingredientes y los pasos, y vuelve a intentarlo.",
  },

  [ERR.CHAT_NOT_FOUND]: {
    code: ERR.CHAT_NOT_FOUND,
    title: "Chat no disponible",
    description: "Este chat ya no existe o fue eliminado.",
  },
  [ERR.CHAT_CREATE_FAILED]: {
    code: ERR.CHAT_CREATE_FAILED,
    title: "No pudimos crear el chat",
  },
  [ERR.CHAT_DELETE_FAILED]: {
    code: ERR.CHAT_DELETE_FAILED,
    title: "No pudimos eliminar el chat",
  },
  [ERR.CHAT_TOO_LARGE]: {
    code: ERR.CHAT_TOO_LARGE,
    title: "El mensaje es demasiado grande",
    description: "Reduce el texto o el número de adjuntos.",
  },

  [ERR.NETWORK_OFFLINE]: {
    code: ERR.NETWORK_OFFLINE,
    title: "Sin conexión",
    description: "Revisa tu internet e inténtalo de nuevo.",
  },
  [ERR.NETWORK_TIMEOUT]: {
    code: ERR.NETWORK_TIMEOUT,
    title: "El servidor tardó demasiado",
    description: "Espera unos segundos y reintenta.",
  },
  [ERR.SERVER_ERROR]: {
    code: ERR.SERVER_ERROR,
    title: "Problema en nuestros servidores",
    description: "Estamos teniendo dificultades. Vuelve a intentarlo en unos minutos.",
  },

  [ERR.CAMERA_DENIED]: {
    code: ERR.CAMERA_DENIED,
    title: "Permiso de cámara denegado",
    description: "Habilita la cámara en los ajustes del navegador para escanear.",
  },
  [ERR.CAMERA_NOT_FOUND]: {
    code: ERR.CAMERA_NOT_FOUND,
    title: "No encontramos ninguna cámara",
    description: "Conecta una cámara o prueba desde otro dispositivo.",
  },
  [ERR.QR_INVALID]: {
    code: ERR.QR_INVALID,
    title: "Este código QR no es válido",
    description: "Asegúrate de escanear un enlace de receta de Melik.",
  },

  [ERR.SHARE_COPY_FAILED]: {
    code: ERR.SHARE_COPY_FAILED,
    title: "No pudimos copiar el enlace",
    description: "Cópialo manualmente desde el campo de texto.",
  },

  [ERR.CSV_BAD_HEADER]: {
    code: ERR.CSV_BAD_HEADER,
    title: "El archivo CSV no tiene las columnas esperadas",
    description: "Descarga la plantilla y vuelve a intentarlo.",
  },
  [ERR.CSV_BAD_ROWS]: {
    code: ERR.CSV_BAD_ROWS,
    title: "Hay filas con datos incompletos",
    description: "Revisa que todas las filas tengan al menos título e ingredientes.",
  },

  [ERR.IMAGE_PROCESS_FAILED]: {
    code: ERR.IMAGE_PROCESS_FAILED,
    title: "No pudimos procesar la imagen",
    description: "Prueba con otra imagen o reduce su tamaño.",
  },
  [ERR.IMAGE_PREPARE_FAILED]: {
    code: ERR.IMAGE_PREPARE_FAILED,
    title: "No pudimos preparar la imagen",
    description: "Vuelve a seleccionarla o prueba con otra.",
  },

  [ERR.STORAGE_WRITE_FAILED]: {
    code: ERR.STORAGE_WRITE_FAILED,
    title: "No pudimos guardar los cambios localmente",
    description: "Puede que tu navegador esté sin espacio o en modo privado.",
  },

  [ERR.UPLOAD_FAILED]: {
    code: ERR.UPLOAD_FAILED,
    title: "No pudimos subir el archivo",
    description: "Revisa tu conexión e inténtalo de nuevo.",
  },

  [ERR.URL_FETCH_FAILED]: {
    code: ERR.URL_FETCH_FAILED,
    title: "No pudimos leer esa URL",
    description: "Comprueba que el enlace sea correcto y esté accesible.",
  },

  [ERR.GUEST_MIGRATION_FAILED]: {
    code: ERR.GUEST_MIGRATION_FAILED,
    title: "Migración incompleta",
    description: "No pudimos migrar todas tus recetas. Puedes reintentarlo desde tu perfil.",
  },

  [ERR.PROFILE_UPDATE_FAILED]: {
    code: ERR.PROFILE_UPDATE_FAILED,
    title: "No pudimos actualizar tu perfil",
    description: "Vuelve a intentarlo en un momento.",
  },

  [ERR.ADMIN_OP_FAILED]: {
    code: ERR.ADMIN_OP_FAILED,
    title: "Operación de administrador fallida",
    description: "Vuelve a intentarlo o consulta los registros.",
  },

  [ERR.UNKNOWN]: {
    code: ERR.UNKNOWN,
    title: "Algo salió mal",
    description: "Vuelve a intentarlo. Si persiste, contáctanos.",
    showCode: true,
  },
};

// Códigos que califican como "alta severidad" y por tanto muestran el
// botón "Reportar problema" en el toast/fallback. Mantener corto y
// restringido: nunca validaciones, permisos, formularios, ni offline.
export const REPORTABLE_ERROR_CODES: ReadonlySet<AppErrorCode> = new Set<AppErrorCode>([
  ERR.UNKNOWN,
  ERR.SERVER_ERROR,
  ERR.AI_UNAVAILABLE,
  ERR.ADMIN_OP_FAILED,
  ERR.RECIPE_SAVE_FAILED,
  ERR.UPLOAD_FAILED,
  ERR.IMAGE_PROCESS_FAILED,
  ERR.STORAGE_WRITE_FAILED,
  ERR.CHAT_CREATE_FAILED,
  ERR.CHAT_DELETE_FAILED,
  ERR.GUEST_MIGRATION_FAILED,
  ERR.PROFILE_UPDATE_FAILED,
]);
