import { createFileRoute } from "@tanstack/react-router";
import { useAuth } from "@/hooks/use-auth";
import { AuthScreen } from "@/components/omni/AuthScreen";
import { ChatApp } from "@/components/omni/ChatApp";
import { OmniLogo } from "@/components/omni/OmniLogo";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "OmniAI — Your friendly AI assistant" },
      { name: "description", content: "Chat, reason, solve math, write code and build apps with OmniAI." },
      { property: "og:title", content: "OmniAI — Your friendly AI assistant" },
      { property: "og:description", content: "Chat, reason, solve math, write code and build apps with OmniAI." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: Index,
});

function Index() {
  const { user, loading } = useAuth();
  if (loading)
    return (
      <div className="flex h-screen items-center justify-center">
        <OmniLogo className="size-10 animate-orb" />
      </div>
    );
  return user ? <ChatApp user={user} /> : <AuthScreen />;
}
