import { createFileRoute } from "@tanstack/react-router";
import { handleCorrect } from "@/lib/ai/chat.server";

export const Route = createFileRoute("/api/correct")({
  server: { handlers: { POST: ({ request }) => handleCorrect(request) } },
});
