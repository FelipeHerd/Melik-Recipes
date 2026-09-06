import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Users } from "lucide-react";
import { UserSearchInput } from "@/components/admin/UserSearchInput";
import { UserResultsTable } from "@/components/admin/UserResultsTable";
import { UserActionsDrawer } from "@/components/admin/UserActionsDrawer";
import { searchAdminUsersV2, type AdminCrmRow } from "@/lib/admin-crm.functions";

import { assertAdminOrRedirect } from "@/lib/admin-guard";

export const Route = createFileRoute("/admin/usuarios")({
  beforeLoad: async ({ context }) => {
    await assertAdminOrRedirect((context as { queryClient?: any })?.queryClient);
  },
  head: () => ({
    meta: [
      { title: "Usuarios — Panel Melik" },
      { name: "robots", content: "noindex,nofollow" },
    ],
  }),
  component: AdminUsers,
});


function AdminUsers() {
  const [query, setQuery] = useState("");
  const [selected, setSelected] = useState<AdminCrmRow | null>(null);

  const { data, isFetching } = useQuery({
    queryKey: ["admin", "crm", query],
    queryFn: () => searchAdminUsersV2({ data: { q: query } }),
    enabled: query.length > 0,
    staleTime: 15_000,
  });

  return (
    <div className="mx-auto max-w-5xl px-6 py-10">
      <div className="flex items-center gap-3">
        <span className="grid h-11 w-11 place-items-center rounded-2xl bg-zinc-900 text-primary">
          <Users className="h-5 w-5" />
        </span>
        <div>
          <p className="text-xs font-medium uppercase tracking-[0.2em] text-zinc-500">
            CRM
          </p>
          <h1 className="font-display text-2xl font-semibold">Usuarios</h1>
        </div>
      </div>

      <div className="mt-6">
        <UserSearchInput onChange={setQuery} />
      </div>

      <div className="mt-4">
        <UserResultsTable
          rows={data}
          isPending={query.length > 0 && isFetching}
          onSelect={setSelected}
        />
      </div>

      <UserActionsDrawer row={selected} onClose={() => setSelected(null)} />
    </div>
  );
}
