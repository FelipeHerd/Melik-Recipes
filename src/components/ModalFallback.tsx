// Vacuna 1: nunca `fallback={null}` en modales lazy — el usuario percibiría
// congelamiento tras el clic. Este spinner centrado sobre overlay oscuro
// asegura feedback visible mientras se descarga el chunk del modal.
export function ModalFallback() {
  return (
    <div
      role="status"
      aria-live="polite"
      aria-label="Cargando"
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50"
    >
      <div className="h-10 w-10 animate-spin rounded-full border-2 border-white/30 border-t-white" />
    </div>
  );
}
