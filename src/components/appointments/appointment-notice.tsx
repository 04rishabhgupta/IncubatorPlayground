import { Alert } from "@/components/ui/alert";

const messages: Record<string, { title: string; body?: string }> = {
  requested: {
    title: "Request sent",
    body: "The company has been notified. You'll get a notification when they respond.",
  },
  accepted: { title: "Appointment accepted.", body: "The requester has been notified." },
  declined: { title: "Request declined.", body: "The requester has been notified." },
  cancelled: { title: "Appointment cancelled.", body: "The other side has been notified." },
  completed: { title: "Marked as completed." },
};

/** Confirmation shown after a Server Action redirects back with ?done=… */
export function AppointmentNotice({ done }: { done: unknown }) {
  const message = typeof done === "string" ? messages[done] : undefined;
  if (!message) return null;
  return (
    <div className="mb-6">
      <Alert tone="success" title={message.title}>
        {message.body}
      </Alert>
    </div>
  );
}
