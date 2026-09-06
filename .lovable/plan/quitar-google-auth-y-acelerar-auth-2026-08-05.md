# Quitar Google Auth y acelerar /auth

## 1. Eliminar autenticación con Google (frontend)

En `src/routes/auth.tsx`:

- Borrar el componente `GoogleButton` completo y su import de `@/integrations/lovable`.
- Borrar el estado `googleLoginAccepted` y la variable derivada `googleAccepted`; el checkbox "Al continuar con Google…" del tab de login desaparece.
- Borrar el separador visual "o" (la línea con el `o` en el medio) porque ya no divide nada, y el aviso "Debes aceptar la política de datos para entrar con Google" del tab de registro.
- `signupAccepted` deja de ser estado del padre (solo lo usaba el signup + Google): pasa a vivir dentro de `SignUpForm`, dejando el contenedor con una sola responsabilidad (tabs + formulario).
- Resultado: la tarjeta queda con tabs → formulario, sin huecos ni márgenes muertos. Se ajustan paddings inferiores para que el card cierre limpio en móvil y desktop.

## 2. Limpieza de backend / código sin sentido

- Eliminar `src/integrations/lovable/index.ts` (solo existía para el OAuth de Google) y desinstalar la dependencia `@lovable.dev/cloud-auth-js`.
- Eliminar el código de error `GOOGLE_FAILED` (`APP-AUTH-005`) de `src/lib/errors/codes.ts` y su entrada en `src/lib/errors/catalog.ts` (no queda ningún consumidor).
- Deshabilitar el proveedor Google en la configuración de autenticación del backend, dejando solo email + contraseña activos. Así nadie puede iniciar el flujo aunque conserve una URL antigua.
- No se toca nada de Google no relacionado (verificación de Search Console, Google Fonts, modelo Gemini del asistente): eso no es autenticación.

## 3. Carga más rápida de /auth + skeleton real

Problema actual: la ruta carga en un solo chunk el formulario de registro completo (validaciones Zod, checklist de contraseña, campo de username con React Query y llamada al servidor de disponibilidad), aunque el usuario aterriza en el tab de "Iniciar sesión".

Cambios:

- Dividir el formulario de registro en carga diferida (`React.lazy` + `Suspense`), de modo que el chunk inicial de `/auth` contenga solo el login. Se precarga en cuanto el usuario pasa el cursor o toca el tab "Crear cuenta", así el cambio se siente instantáneo.
- Añadir `pendingComponent` a la ruta `/auth` con un skeleton nuevo, `AuthSkeleton`, que replica la estructura exacta: logo + wordmark, tarjeta redondeada, barra de tabs de dos segmentos, y los campos/botón del login con las mismas alturas (`h-11`) y radios. Nada de layout shift al hidratar.
- El mismo `AuthSkeleton` se usa como fallback del `Suspense` del registro (variante con más campos), para que el salto entre tabs no muestre vacío.
- Precargar el logo (`rel="preload" as="image"`) desde el `head()` de la ruta y quitar `loading="lazy"` de esa imagen: es contenido visible de inmediato, no debe diferirse.
- Marcar `aria-busy`/`aria-live` en el skeleton para lectores de pantalla.

## 4. Revisión completa de /auth (login y registro)

Después de aplicar los cambios, revisión en navegador (móvil 390px y desktop) de ambos tabs verificando:

- Sin restos de Google, sin separadores huérfanos ni espacios dobles.
- Login: validación de correo/contraseña, mensaje de error legible, enlace "¿Olvidaste tu contraseña?" alineado, redirección post-login.
- Registro: checklist de contraseña, disponibilidad de username, confirmación de contraseña, checkbox de términos gating del botón, y el estado "verifica tu correo".
- Consola sin errores y sin peticiones fallidas; verificación de que el skeleton aparece antes del contenido real.

## Detalles técnicos

- Archivos: `src/routes/auth.tsx` (reescritura parcial), nuevo `src/components/AuthSkeleton.tsx`, borrado de `src/integrations/lovable/index.ts`, edición de `src/lib/errors/codes.ts` y `src/lib/errors/catalog.ts`, `package.json`.
- Config de auth del backend: deshabilitar el proveedor `google`, mantener `email`.
- `src/components/UsernameField.tsx`, `PasswordChecklist.tsx` y las server functions de username no cambian; solo pasan al chunk diferido del registro.