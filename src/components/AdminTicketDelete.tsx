import { useRef, useState } from "react";
import { Trash2, Undo2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { AlertDialog, AlertDialogContent, AlertDialogHeader, AlertDialogTitle, AlertDialogDescription, AlertDialogFooter, AlertDialogCancel } from "@/components/ui/alert-dialog";

type Props = {
  id: string;
  kind?: "submission" | "intake";
  label: string;
  deleted?: boolean;
  onChanged: () => void;
};

export function AdminTicketDelete({ id, kind = "submission", label, deleted = false, onChanged }: Props) {
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const inFlight = useRef(false);
  const { toast } = useToast();
  const action = deleted ? "Restore" : "Delete";

  async function save() {
    if (inFlight.current) return;
    inFlight.current = true;
    setBusy(true);
    setError(null);
    try {
      const result = await supabase.rpc("set_admin_ticket_deleted", { p_id: id, p_kind: kind, p_deleted: !deleted });
      if (result.error) throw result.error;
      setOpen(false);
      toast({ title: deleted ? "Ticket restored" : "Ticket deleted", description: deleted ? "The ticket is back in the admin lists." : "You can restore it from Deleted tickets." });
      onChanged();
    } catch {
      setError(`Could not ${action.toLowerCase()} this ticket. Please try again.`);
    } finally {
      inFlight.current = false;
      setBusy(false);
    }
  }

  return <span onClick={event => event.stopPropagation()}>
    <Button type="button" size="sm" variant={deleted ? "outline" : "destructive"}
      aria-label={`${action} ticket ${label}`} onClick={() => { setError(null); setOpen(true); }}>
      {deleted ? <Undo2 className="mr-2 h-4 w-4" aria-hidden="true" /> : <Trash2 className="mr-2 h-4 w-4" aria-hidden="true" />}{action}
    </Button>
    <AlertDialog open={open} onOpenChange={next => { if (!inFlight.current) setOpen(next); }}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>{action} ticket?</AlertDialogTitle>
          <AlertDialogDescription>
            {deleted ? `Restore ${label} to the admin lists? Previously cancelled notifications will stay cancelled.` :
              `Move ${label} and any linked intake to Deleted tickets? You can restore them later. Payment records and documents will be retained.`}
          </AlertDialogDescription>
        </AlertDialogHeader>
        {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
        <AlertDialogFooter>
          <AlertDialogCancel disabled={busy}>Cancel</AlertDialogCancel>
          <Button type="button" variant={deleted ? "default" : "destructive"} disabled={busy} onClick={() => void save()}>
            {busy ? "Saving…" : `${action} ticket`}
          </Button>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  </span>;
}
