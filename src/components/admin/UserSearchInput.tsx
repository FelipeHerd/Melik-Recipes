import { useEffect, useState } from "react";
import { Search } from "lucide-react";

export function UserSearchInput({ onChange }: { onChange: (q: string) => void }) {
  const [value, setValue] = useState("");
  useEffect(() => {
    const t = setTimeout(() => onChange(value.trim()), 500);
    return () => clearTimeout(t);
  }, [value, onChange]);
  return (
    <label className="relative block">
      <Search className="pointer-events-none absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-zinc-500" />
      <input
        type="search"
        value={value}
        onChange={(e) => setValue(e.target.value)}
        placeholder="Buscar por email, @username o UUID…"
        className="w-full rounded-2xl border border-zinc-800 bg-zinc-900 py-3.5 pl-11 pr-4 text-sm text-zinc-100 placeholder:text-zinc-500 focus:border-primary focus:outline-none"
      />
    </label>
  );
}
