import { useState } from "react";
import { Link, useNavigate, useRouterState } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { MessageSquarePlus, Trash2, MessageSquare, Compass } from "lucide-react";
import { showError } from "@/lib/errors/toast";
import { useSessionUser } from "@/components/UserMenu";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
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
import {
  listDiscoverChats,
  createDiscoverChat,
  deleteDiscoverChat,
} from "@/lib/discover-chats.functions";

export function DiscoverChatDrawer() {
  const [open, setOpen] = useState(false);
  const [confirmId, setConfirmId] = useState<string | null>(null);
  const { userId, ready } = useSessionUser();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
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
      setOpen(false);
      navigate({ to: "/descubrir/$chatId", params: { chatId: id } });
    },
    onError: (e) => showError(e, "APP-CHAT-002"),
  });

  const deleteMut = useMutation({
    mutationFn: (id: string) => deleteDiscoverChat({ data: { id } }),
    onSuccess: async (_r, id) => {
      // SAFEGUARD: if the deleted chat is the one currently open,
      // navigate away BEFORE invalidating so useQuery does not refetch
      // a row that no longer exists.
      if (activeChatId === id) {
        setOpen(false);
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

  return (
    <>
      <Sheet open={open} onOpenChange={setOpen}>
        <SheetTrigger asChild>
          <button
            type="button"
            aria-label="Chats recientes"
            className="grid h-10 w-10 place-items-center rounded-full bg-card text-foreground hover:bg-primary/10 hover:text-primary transition-colors"
          >
            <MessageSquare className="h-5 w-5" />
          </button>
        </SheetTrigger>
        <SheetContent side="left" className="w-[280px] p-0">
          <div className="flex h-full flex-col p-4">
            <SheetHeader className="px-1 pb-2 text-left">
              <SheetTitle className="font-display inline-flex items-center gap-3 text-2xl font-semibold">
                <span className="grid h-12 w-12 place-items-center rounded-2xl bg-primary text-primary-foreground">
                  <Compass className="h-6 w-6" />
                </span>
                Descubrir
              </SheetTitle>
            </SheetHeader>

            <button
              onClick={() => (userId ? createMut.mutate() : navigate({ to: "/auth" }))}
              disabled={createMut.isPending}
              className="inline-flex h-10 w-full items-center justify-center gap-2 rounded-2xl bg-primary text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-60"
            >
              <MessageSquarePlus className="h-4 w-4" /> Nuevo chat
            </button>

            <div className="mt-3 flex-1 overflow-y-auto">
              {!ready || (!!userId && chatsQuery.isPending) ? (
                <p className="px-2 py-3 text-xs text-muted-foreground">Cargando…</p>
              ) : !userId ? (
                <p className="px-2 py-3 text-xs text-muted-foreground">
                  Inicia sesión para guardar tus chats.
                </p>
              ) : (chatsQuery.data ?? []).length === 0 ? (
                <p className="px-2 py-3 text-xs text-muted-foreground">
                  Aún no tienes chats. Crea uno nuevo para empezar.
                </p>
              ) : (
                <ul className="flex flex-col gap-1">
                  {(chatsQuery.data ?? []).map((c) => {
                    const active = c.id === activeChatId;
                    return (
                      <li key={c.id} className="flex items-center gap-1">
                        <Link
                          to="/descubrir/$chatId"
                          params={{ chatId: c.id }}
                          onClick={() => setOpen(false)}
                          className={`flex-1 truncate rounded-xl px-3 py-2 text-sm ${
                            active ? "bg-primary/10 font-semibold text-primary" : "hover:bg-card"
                          }`}
                        >
                          {c.title}
                        </Link>
                        <button
                          type="button"
                          onClick={() => setConfirmId(c.id)}
                          className="grid h-8 w-8 shrink-0 place-items-center rounded-lg text-muted-foreground transition hover:bg-destructive/10 hover:text-destructive"
                          aria-label={`Eliminar "${c.title}"`}
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </button>
                      </li>
                    );
                  })}
                </ul>
              )}
            </div>
          </div>
        </SheetContent>
      </Sheet>

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
