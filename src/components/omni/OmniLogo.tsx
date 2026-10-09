import { cn } from "@/lib/utils";
import logo from "@/assets/omni-logo.jpg.asset.json";

export function OmniLogo({ className }: { className?: string }) {
  return <img src={logo.url} alt="OmniAI" className={cn("size-7 rounded-full object-cover", className)} />;
}
