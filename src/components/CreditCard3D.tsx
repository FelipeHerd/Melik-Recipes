// Tarjeta 3D bancaria puramente presentacional.
// Usa CSS nativo (perspective + preserve-3d + backface-visibility) sin
// depender de la configuración de Tailwind. La cara trasera se pre-rota
// 180deg y el contenedor interno flipa con `rotateY(180deg)` cuando
// `flipped=true`.
import { Crown } from "lucide-react";

export function CreditCard3D({
  number,
  holder,
  expiry,
  cvv,
  flipped,
}: {
  number: string;
  holder: string;
  expiry: string;
  cvv: string;
  flipped: boolean;
}) {
  const groups = formatGroups(number);
  const displayHolder = holder.trim() ? holder.toUpperCase() : "NOMBRE APELLIDO";
  const displayExpiry = expiry || "MM/YY";
  const displayCvv = cvv || "•••";

  return (
    <div
      className="mx-auto w-full max-w-sm select-none"
      style={{ perspective: "1000px" }}
      aria-hidden
    >
      <div
        className="relative w-full"
        style={{
          aspectRatio: "1.586 / 1",
          transformStyle: "preserve-3d",
          transition: "transform 0.7s cubic-bezier(.4,.2,.2,1)",
          transform: flipped ? "rotateY(180deg)" : "rotateY(0deg)",
        }}
      >
        {/* Cara frontal */}
        <div
          className="absolute inset-0 rounded-2xl p-5 text-white shadow-xl"
          style={{
            backfaceVisibility: "hidden",
            WebkitBackfaceVisibility: "hidden",
            background:
              "linear-gradient(135deg, color-mix(in oklab, var(--ochre) 85%, black) 0%, #2a1a10 55%, #10161f 100%)",
            border: "1px solid color-mix(in oklab, var(--ochre) 40%, transparent)",
          }}
        >
          <div className="flex items-start justify-between">
            <div className="flex items-center gap-1.5 text-[color:var(--ochre)]">
              <Crown className="h-4 w-4" />
              <span className="font-display text-sm font-semibold tracking-wide">Melik+</span>
            </div>
            <span className="text-[10px] font-semibold uppercase tracking-widest text-white/70">
              Credit
            </span>
          </div>

          {/* Chip */}
          <div className="mt-4 flex items-center gap-2">
            <div
              className="h-8 w-11 rounded-md"
              style={{
                background: "linear-gradient(135deg, #f7d68a 0%, #d4a24a 45%, #a67a2a 100%)",
                boxShadow: "inset 0 0 0 1px rgba(0,0,0,0.25)",
              }}
            >
              <div className="grid h-full grid-cols-3 grid-rows-3 gap-[1px] p-1">
                {Array.from({ length: 9 }).map((_, i) => (
                  <div key={i} className="rounded-[1px] bg-black/25" />
                ))}
              </div>
            </div>
            <span className="text-lg opacity-80">))))</span>
          </div>

          {/* Número */}
          <div
            className="mt-5 flex gap-3 font-mono text-lg tracking-[0.15em] sm:text-xl"
            style={{ textShadow: "0 1px 2px rgba(0,0,0,0.4)" }}
          >
            {groups.map((g, i) => (
              <span key={i}>{g}</span>
            ))}
          </div>

          <div className="mt-5 flex items-end justify-between gap-4 text-[10px] uppercase tracking-widest text-white/70">
            <div className="min-w-0 flex-1">
              <div>Titular</div>
              <div className="mt-0.5 truncate font-sans text-[13px] tracking-normal text-white">
                {displayHolder}
              </div>
            </div>
            <div className="text-right">
              <div>Válida hasta</div>
              <div className="mt-0.5 font-mono text-[13px] tracking-normal text-white">
                {displayExpiry}
              </div>
            </div>
          </div>
        </div>

        {/* Cara trasera */}
        <div
          className="absolute inset-0 rounded-2xl text-white shadow-xl"
          style={{
            backfaceVisibility: "hidden",
            WebkitBackfaceVisibility: "hidden",
            transform: "rotateY(180deg)",
            background:
              "linear-gradient(135deg, #10161f 0%, #2a1a10 55%, color-mix(in oklab, var(--ochre) 60%, black) 100%)",
            border: "1px solid color-mix(in oklab, var(--ochre) 30%, transparent)",
          }}
        >
          {/* Banda magnética */}
          <div className="mt-5 h-10 w-full bg-black/85" />

          <div className="px-5 pt-5">
            <div className="flex items-center gap-2">
              {/* Caja de firma con rayas */}
              <div
                className="relative h-9 flex-1 overflow-hidden rounded-sm bg-white"
                style={{
                  backgroundImage:
                    "repeating-linear-gradient(45deg, #e5e5e5 0 6px, #fafafa 6px 12px)",
                }}
              />
              {/* CVV */}
              <div className="grid h-9 min-w-[64px] place-items-center rounded-sm bg-white px-3 font-mono text-sm text-black">
                {displayCvv}
              </div>
            </div>
            <p className="mt-3 text-right text-[10px] uppercase tracking-widest text-white/60">
              CVV
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}

function formatGroups(raw: string): string[] {
  const digits = raw.replace(/\D/g, "").slice(0, 16);
  const groups: string[] = [];
  for (let i = 0; i < 4; i++) {
    const chunk = digits.slice(i * 4, i * 4 + 4);
    groups.push(chunk.padEnd(4, "•"));
  }
  return groups;
}
