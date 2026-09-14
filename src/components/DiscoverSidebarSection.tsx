import { useState } from "react";
import { Link, useNavigate, useRouterState } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { MessageSquarePlus, Trash2 } from "lucide-react";
import { showError } from "@/lib/errors/toast";
import { useSessionUser } from "@/components/UserMenu";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { DiscoverSidebarSkeleton } from "@/components/DiscoverSidebarSkeleton";
import {
  listDiscoverChats,
  createDiscoverChat,
  deleteDiscoverChat,
} from "@/lib/discover-chats.functions";

export function DiscoverSidebarSection({ collapsed }: { collapsed: boolean }) {
  const { userId, ready } = useSessionUser();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [confirmId, setConfirmId] = useState<string | null>(null);

  const activeChatId = useRouterState({
    select: (s) => {
      const m = s.location.pathname.match(/\/descubrir\/([0-9a-f-]{36})/i);
      return m ? m[1] : null;
    },
  });

  const chatsQuery = useQuery({
    queryKey: ["discover-chats", userId ?? "guest"],
    queryFn: () => listDiscoverChats(),
    enabled: !!userId,
    staleTime: 15_000,
  });

  const createMut = useMutation({
    mutationFn: () => createDiscoverChat({ data: {} }),
    onSuccess: async ({ id }) => {
      await queryClient.invalidateQueries({ queryKey: ["discover-chats"] });
      navigate({ to: "/descubrir/$chatId", params: { chatId: id } });
    },
    onError: (e) => showError(e, "APP-CHAT-002"),
  });

  const deleteMut = useMutation({
    mutationFn: (id: string) => deleteDiscoverChat({ data: { id } }),
    onSuccess: async (_r, id) => {
      if (activeChatId === id) {
        await navigate({ to: "/descubrir" });
      }
      queryClient.removeQueries({ queryKey: ["discover-chat", id] });
      await queryClient.invalidateQueries({ queryKey: ["discover-chats"] });
      setConfirmId(null);
    },
    onError: (e) => {
      showError(e, "APP-CHAT-003");
      setConfirmId(null);
    },
  });

  const chats = chatsQuery.data ?? [];
  const interactiveTabIndex = collapsed ? -1 : 0;

  return (
    <>
      <div
        className={`grid min-h-0 flex-1 origin-top transition-[grid-template-rows,transform,opacity] duration-500 will-change-transform ${
          collapsed
            ? "grid-rows-[0fr] -translate-y-5 opacity-0 ease-in"
            : "grid-rows-[1fr] translate-y-0 opacity-100 ease-[cubic-bezier(0.34,1.56,0.64,1)]"
        }`}
        aria-hidden={collapsed}
      >
        <div className="min-h-0 overflow-hidden">
          <div className="ml-6 mt-2 flex h-full min-h-0 flex-col gap-2 border-l border-border/50 pl-4">
            <button
              type="button"
              onClick={() => (userId ? createMut.mutate() : navigate({ to: "/auth" }))}
              disabled={createMut.isPending}
              tabIndex={interactiveTabIndex}
              style={{ animationDelay: "80ms", animationFillMode: "backwards" }}
              className="inline-flex h-9 w-full shrink-0 items-center justify-center gap-2 rounded-xl bg-primary px-3 text-xs font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-60 animate-slide-down-fade"
            >
              <MessageSquarePlus className="h-3.5 w-3.5" />
              Nuevo chat
            </button>

            <div className="min-h-0 flex-1 overflow-y-auto [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
              {!ready || (!!userId && chatsQuery.isPending) ? (
                <DiscoverSidebarSkeleton />
              ) : !userId ? (
                <p className="px-1 py-2 text-[11px] text-muted-foreground">
                  Inicia sesión para guardar tus chats.
                </p>
              ) : chats.length === 0 ? (
                <p className="px-1 py-2 text-[11px] text-muted-foreground">
                  Aún no tienes chats. Crea uno nuevo para empezar.
                </p>
              ) : (
                <ul className="flex flex-col gap-0.5">
                  {chats.map((c, i) => {
                    const active = c.id === activeChatId;
                    const delay = Math.min(160 + i * 70, 900);
                    return (
                      <li
                        key={c.id}
                        className="group flex items-center gap-1 animate-slide-down-fade"
                        style={{ animationDelay: `${delay}ms`, animationFillMode: "backwards" }}
                      >
                        <Link
                          to="/descubrir/$chatId"
                          params={{ chatId: c.id }}
                          tabIndex={interactiveTabIndex}
                          className={`min-w-0 flex-1 truncate rounded-lg px-2 py-1.5 text-xs ${
                            active
                              ? "bg-primary/10 font-semibold text-primary"
                              : "text-foreground/80 hover:bg-card"
                          }`}
                        >
                          {c.title}
                        </Link>
                        <button
                          type="button"
                          onClick={() => setConfirmId(c.id)}
                          tabIndex={interactiveTabIndex}
                          className="grid h-7 w-7 shrink-0 place-items-center rounded-md text-muted-foreground opacity-0 transition hover:bg-destructive/10 hover:text-destructive group-hover:opacity-100 focus:opacity-100"
                          aria-label={`Eliminar "${c.title}"`}
                        >
                          <Trash2 className="h-3 w-3" />
                        </button>
                      </li>
                    );
                  })}
                </ul>
              )}
            </div>
          </div>
        </div>
      </div>

      <AlertDialog
        open={!!confirmId}
        onOpenChange={(v) => !v && !deleteMut.isPending && setConfirmId(null)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>¿Eliminar esta conversación?</AlertDialogTitle>
            <AlertDialogDescription>
              Se borrarán los mensajes y las imágenes adjuntas. Esta acción no se puede deshacer.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={deleteMut.isPending}>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              onClick={(e) => {
                e.preventDefault();
                if (confirmId) deleteMut.mutate(confirmId);
              }}
              disabled={deleteMut.isPending}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {deleteMut.isPending ? "Eliminando…" : "Eliminar"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
