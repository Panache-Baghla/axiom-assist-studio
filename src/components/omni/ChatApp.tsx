import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { User } from "@supabase/supabase-js";
import { toast } from "sonner";
import {
  ArrowUp, Brain, Check, Code2, Copy, FolderKanban, GitBranch, Ghost, Globe, ImagePlus, LogOut,
  Menu, Mic, MoreHorizontal, Paperclip, Pencil, Pin, PinOff, Plus, Search, Sigma, Sparkle, Square,
  ThumbsDown, ThumbsUp, Trash2, Volume2, Wand2, X, Zap, AudioLines, ChevronDown, VolumeX,
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { cn } from "@/lib/utils";
import { OmniLogo } from "./OmniLogo";
import { Markdown } from "./Markdown";
import { greetingFor } from "@/lib/greeting";

type Mode = "instant" | "think" | "reasoning" | "build";
type Msg = { id: string; role: "user" | "assistant"; content: string; feedback?: number | null; persisted?: boolean };
type Conv = { id: string; title: string; pinned: boolean; updated_at: string };

const MODES: { id: Mode | "generate" | "web"; label: string; desc: string; icon: typeof Zap; soon?: boolean }[] = [
  { id: "instant", label: "Instant reply", desc: "Fast, concise answers", icon: Zap },
  { id: "think", label: "Think deep", desc: "Careful, thorough thinking", icon: Brain },
  { id: "reasoning", label: "Reasoning & Math", desc: "Rigorous step-by-step", icon: Sigma },
  { id: "build", label: "Build", desc: "Create websites and apps", icon: Code2 },
  { id: "generate", label: "Generate", desc: "Images — coming soon", icon: ImagePlus, soon: true },
  { id: "web", label: "Web search", desc: "Live web — coming soon", icon: Globe, soon: true },
];

const uid = () => crypto.randomUUID();

/* eslint-disable @typescript-eslint/no-explicit-any */
function getRecognition(): any {
  const w = window as any;
  const SR = w.SpeechRecognition || w.webkitSpeechRecognition;
  if (!SR) return null;
  const r = new SR();
  r.interimResults = true;
  r.continuous = false;
  r.lang = navigator.language || "en-US";
  return r;
}

function speak(text: string, onEnd?: () => void) {
  const clean = text.replace(/```[\s\S]*?```/g, " code block ").replace(/[#*_`$>|]/g, "");
  speechSynthesis.cancel();
  const u = new SpeechSynthesisUtterance(clean);
  u.lang = navigator.language || "en-US";
  if (onEnd) u.onend = onEnd;
  speechSynthesis.speak(u);
}

export function ChatApp({ user }: { user: User }) {
  const name = (user.user_metadata?.full_name as string) || (user.user_metadata?.name as string) || user.email?.split("@")[0] || "there";
  const firstName = name.split(" ")[0];

  const [convs, setConvs] = useState<Conv[]>([]);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [messages, setMessages] = useState<Msg[]>([]);
  const [input, setInput] = useState("");
  const [files, setFiles] = useState<File[]>([]);
  const [mode, setMode] = useState<Mode>("instant");
  const [streaming, setStreaming] = useState(false);
  const [temporary, setTemporary] = useState(false);
  const [autoCorrect, setAutoCorrect] = useState(false);
  const [search, setSearch] = useState("");
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [editing, setEditing] = useState<{ id: string; text: string } | null>(null);
  const [renaming, setRenaming] = useState<{ id: string; title: string } | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [listening, setListening] = useState(false);
  const [voiceOpen, setVoiceOpen] = useState(false);
  const [voiceState, setVoiceState] = useState<"listening" | "thinking" | "speaking" | "idle">("idle");
  const [speakingId, setSpeakingId] = useState<string | null>(null);

  const abortRef = useRef<AbortController | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const voiceOpenRef = useRef(false);
  const greeting = useMemo(() => greetingFor(new Date().getHours()), []);

  const loadConvs = useCallback(async () => {
    const { data } = await supabase.from("conversations").select("id,title,pinned,updated_at").order("updated_at", { ascending: false });
    setConvs((data as Conv[]) ?? []);
  }, []);

  useEffect(() => {
    loadConvs();
    if (typeof window !== "undefined" && window.innerWidth < 768) setSidebarOpen(false);
  }, [loadConvs]);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight });
  }, [messages]);

  async function openConv(id: string) {
    abortRef.current?.abort();
    setTemporary(false);
    setActiveId(id);
    const { data } = await supabase.from("messages").select("id,role,content,feedback").eq("conversation_id", id).order("created_at");
    setMessages(((data as Msg[]) ?? []).map((m) => ({ ...m, persisted: true })));
    if (window.innerWidth < 768) setSidebarOpen(false);
  }

  function newChat(temp = false) {
    abortRef.current?.abort();
    setActiveId(null);
    setMessages([]);
    setTemporary(temp);
    setInput("");
  }

  async function ensureConv(firstPrompt: string): Promise<string | null> {
    if (temporary) return null;
    if (activeId) return activeId;
    const title = firstPrompt.replace(/\s+/g, " ").slice(0, 60) || "New chat";
    const { data, error } = await supabase.from("conversations").insert({ user_id: user.id, title }).select("id").single();
    if (error) { toast.error("Couldn't save chat"); return null; }
    setActiveId(data.id);
    loadConvs();
    return data.id;
  }

  async function saveMsg(convId: string | null, m: Msg) {
    if (!convId) return;
    await supabase.from("messages").insert({ id: m.id, conversation_id: convId, user_id: user.id, role: m.role, content: m.content });
    await supabase.from("conversations").update({ updated_at: new Date().toISOString() }).eq("id", convId);
  }

  async function runAssistant(history: Msg[], convId: string | null, onDone?: (text: string) => void) {
    const aId = uid();
    setMessages([...history, { id: aId, role: "assistant", content: "" }]);
    setStreaming(true);
    const ac = new AbortController();
    abortRef.current = ac;
    let text = "";
    try {
      const { data } = await supabase.auth.getSession();
      const res = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${data.session?.access_token}` },
        body: JSON.stringify({ mode, userName: firstName, messages: history.map(({ role, content }) => ({ role, content })) }),
        signal: ac.signal,
      });
      if (!res.ok || !res.body) {
        const err = await res.json().catch(() => ({}));
        throw new Error(res.status === 402 ? "AI credits are used up. Please add credits to continue." : res.status === 429 ? "Too many requests — please wait a moment." : err.error || "Something went wrong.");
      }
      const reader = res.body.getReader();
      const dec = new TextDecoder();
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        text += dec.decode(value, { stream: true });
        setMessages((ms) => ms.map((m) => (m.id === aId ? { ...m, content: text } : m)));
      }
      if (!text.trim()) throw new Error("No reply received. Please try again.");
    } catch (e) {
      if ((e as Error).name !== "AbortError") {
        toast.error((e as Error).message);
        if (!text) setMessages((ms) => ms.filter((m) => m.id !== aId));
      }
    } finally {
      setStreaming(false);
      abortRef.current = null;
      if (text.trim()) {
        await saveMsg(convId, { id: aId, role: "assistant", content: text });
        setMessages((ms) => ms.map((m) => (m.id === aId ? { ...m, persisted: !!convId } : m)));
        onDone?.(text);
      }
    }
  }

  async function correctText(t: string) {
    try {
      const { data } = await supabase.auth.getSession();
      const r = await fetch("/api/correct", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${data.session?.access_token}` },
        body: JSON.stringify({ text: t }),
      });
      const j = await r.json();
      return (j.text as string) || t;
    } catch { return t; }
  }

  async function send(raw?: string, onDone?: (text: string) => void) {
    let text = (raw ?? input).trim();
    if ((!text && files.length === 0) || streaming) return;
    if (autoCorrect && text) text = await correctText(text);
    let content = text;
    for (const f of files) {
      if (f.type.startsWith("text/") || /\.(md|json|csv|js|ts|tsx|py|html|css|java|c|cpp|txt|xml|yml|yaml|sql)$/i.test(f.name)) {
        const body = (await f.text()).slice(0, 60000);
        content += `\n\n**Attached file: ${f.name}**\n\`\`\`\n${body}\n\`\`\``;
      } else {
        content += `\n\n_(Attached: ${f.name} — this file type can't be read yet)_`;
      }
    }
    setInput("");
    setFiles([]);
    const userMsg: Msg = { id: uid(), role: "user", content };
    const history = [...messages, userMsg];
    setMessages(history);
    const convId = await ensureConv(text || files[0]?.name || "New chat");
    await saveMsg(convId, userMsg);
    await runAssistant(history, convId, onDone);
  }

  async function deletePair(id: string) {
    const i = messages.findIndex((m) => m.id === id);
    const ids = [id];
    if (messages[i + 1]?.role === "assistant") ids.push(messages[i + 1].id);
    setMessages((ms) => ms.filter((m) => !ids.includes(m.id)));
    if (activeId) await supabase.from("messages").delete().in("id", ids);
  }

  async function submitEdit() {
    if (!editing || streaming) return;
    const i = messages.findIndex((m) => m.id === editing.id);
    const removed = messages.slice(i).map((m) => m.id);
    const userMsg: Msg = { id: uid(), role: "user", content: editing.text };
    const history = [...messages.slice(0, i), userMsg];
    setEditing(null);
    if (activeId) await supabase.from("messages").delete().in("id", removed);
    setMessages(history);
    await saveMsg(activeId, userMsg);
    await runAssistant(history, activeId);
  }

  async function feedback(id: string, val: number) {
    const m = messages.find((x) => x.id === id);
    const next = m?.feedback === val ? null : val;
    setMessages((ms) => ms.map((x) => (x.id === id ? { ...x, feedback: next } : x)));
    if (activeId) await supabase.from("messages").update({ feedback: next }).eq("id", id);
    if (next) toast.success("Thanks for the feedback!");
  }

  async function branch(id: string) {
    const i = messages.findIndex((m) => m.id === id);
    const slice = messages.slice(0, i + 1);
    const title = "Branch · " + (convs.find((c) => c.id === activeId)?.title ?? slice[0]?.content.slice(0, 40) ?? "chat");
    const { data, error } = await supabase.from("conversations").insert({ user_id: user.id, title: title.slice(0, 70) }).select("id").single();
    if (error) return toast.error("Couldn't branch chat");
    await supabase.from("messages").insert(slice.map((m) => ({ conversation_id: data.id, user_id: user.id, role: m.role, content: m.content })));
    await loadConvs();
    await openConv(data.id);
    toast.success("Branched into a new chat");
  }

  async function togglePin(c: Conv) {
    await supabase.from("conversations").update({ pinned: !c.pinned }).eq("id", c.id);
    loadConvs();
  }
  async function removeConv(id: string) {
    await supabase.from("conversations").delete().eq("id", id);
    if (activeId === id) newChat();
    loadConvs();
  }
  async function saveRename() {
    if (!renaming) return;
    await supabase.from("conversations").update({ title: renaming.title.trim() || "Untitled" }).eq("id", renaming.id);
    setRenaming(null);
    loadConvs();
  }

  function dictate() {
    const r = getRecognition();
    if (!r) return toast.error("Voice typing isn't supported in this browser.");
    const base = input;
    setListening(true);
    r.onresult = (e: any) => {
      const t = Array.from(e.results).map((x: any) => x[0].transcript).join("");
      setInput((base ? base + " " : "") + t);
    };
    r.onend = () => setListening(false);
    r.onerror = () => { setListening(false); toast.error("Microphone access is needed for voice typing."); };
    r.start();
  }

  /* Voice chat loop */
  function voiceListen() {
    if (!voiceOpenRef.current) return;
    const r = getRecognition();
    if (!r) { toast.error("Voice chat isn't supported in this browser."); return; }
    let final = "";
    setVoiceState("listening");
    r.onresult = (e: any) => { final = Array.from(e.results).map((x: any) => x[0].transcript).join(""); };
    r.onend = () => {
      if (!voiceOpenRef.current) return;
      if (!final.trim()) { setVoiceState("idle"); return; }
      setVoiceState("thinking");
      send(final, (reply) => {
        if (!voiceOpenRef.current) return;
        setVoiceState("speaking");
        speak(reply, () => voiceListen());
      });
    };
    r.onerror = () => setVoiceState("idle");
    r.start();
  }
  function openVoice() {
    voiceOpenRef.current = true;
    setVoiceOpen(true);
    speak(`Hi ${firstName}! What's on your mind?`, () => voiceListen());
    setVoiceState("speaking");
  }
  function closeVoice() {
    voiceOpenRef.current = false;
    setVoiceOpen(false);
    setVoiceState("idle");
    speechSynthesis.cancel();
  }

  function readAloud(m: Msg) {
    if (speakingId === m.id) { speechSynthesis.cancel(); setSpeakingId(null); return; }
    setSpeakingId(m.id);
    speak(m.content, () => setSpeakingId(null));
  }

  const filtered = convs.filter((c) => c.title.toLowerCase().includes(search.toLowerCase()));
  const pinned = filtered.filter((c) => c.pinned);
  const recent = filtered.filter((c) => !c.pinned);
  const currentMode = MODES.find((m) => m.id === mode)!;
  const empty = messages.length === 0;

  const ConvRow = ({ c }: { c: Conv }) => (
    <div className={cn("group flex items-center rounded-lg pr-1 text-sm hover:bg-sidebar-accent", activeId === c.id && "bg-sidebar-accent")}>
      <button onClick={() => openConv(c.id)} className="flex-1 truncate px-3 py-2 text-left">{c.title}</button>
      <DropdownMenu>
        <DropdownMenuTrigger className="rounded-md p-1 opacity-0 hover:bg-accent group-hover:opacity-100 data-[state=open]:opacity-100" aria-label="Chat options">
          <MoreHorizontal className="size-4" />
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          <DropdownMenuItem onClick={() => togglePin(c)}>{c.pinned ? <PinOff /> : <Pin />}{c.pinned ? "Unpin" : "Pin"}</DropdownMenuItem>
          <DropdownMenuItem onClick={() => setRenaming({ id: c.id, title: c.title })}><Pencil />Rename</DropdownMenuItem>
          <DropdownMenuItem variant="destructive" onClick={() => removeConv(c.id)}><Trash2 />Delete</DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  );

  return (
    <div className="flex h-screen overflow-hidden">
      {/* Sidebar */}
      <aside className={cn("fixed inset-y-0 left-0 z-30 flex w-72 flex-col border-r border-sidebar-border bg-sidebar transition-transform md:static", sidebarOpen ? "translate-x-0" : "-translate-x-full md:hidden")}>
        <div className="flex items-center justify-between px-4 py-4">
          <div className="flex items-center gap-2 font-semibold tracking-tight"><OmniLogo className="size-6" /> OmniAI</div>
          <button onClick={() => setSidebarOpen(false)} className="rounded-md p-1.5 hover:bg-sidebar-accent" aria-label="Close sidebar"><X className="size-4" /></button>
        </div>
        <div className="space-y-1 px-3">
          <button onClick={() => newChat()} className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-sm hover:bg-sidebar-accent"><Plus className="size-4" /> New chat</button>
          <button onClick={() => newChat(true)} className={cn("flex w-full items-center gap-2 rounded-lg px-3 py-2 text-sm hover:bg-sidebar-accent", temporary && "bg-sidebar-accent")}><Ghost className="size-4" /> Temporary chat</button>
          <button onClick={() => toast("Projects are coming soon")} className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-sm hover:bg-sidebar-accent"><FolderKanban className="size-4" /> Projects <span className="ml-auto text-[10px] uppercase text-muted-foreground">soon</span></button>
          <div className="relative pt-2">
            <Search className="absolute left-3 top-1/2 mt-1 size-4 -translate-y-1/2 text-muted-foreground" />
            <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search chats" className="h-9 rounded-lg border-transparent bg-sidebar-accent pl-9" />
          </div>
        </div>
        <div className="mt-3 flex-1 overflow-y-auto px-3 pb-3">
          {pinned.length > 0 && (<><p className="px-3 pb-1 pt-3 text-xs text-muted-foreground">Pinned</p>{pinned.map((c) => <ConvRow key={c.id} c={c} />)}</>)}
          <p className="px-3 pb-1 pt-3 text-xs text-muted-foreground">Recent</p>
          {recent.map((c) => <ConvRow key={c.id} c={c} />)}
          {recent.length === 0 && <p className="px-3 py-2 text-xs text-muted-foreground">{search ? "No matches" : "No chats yet"}</p>}
        </div>
        <div className="flex items-center gap-3 border-t border-sidebar-border px-4 py-3">
          <div className="flex size-8 items-center justify-center rounded-full bg-aurora text-sm font-semibold text-primary-foreground">{firstName[0]?.toUpperCase()}</div>
          <div className="min-w-0 flex-1"><p className="truncate text-sm">{name}</p><p className="truncate text-xs text-muted-foreground">{user.email}</p></div>
          <button onClick={() => supabase.auth.signOut()} className="rounded-md p-1.5 hover:bg-sidebar-accent" aria-label="Sign out"><LogOut className="size-4" /></button>
        </div>
      </aside>

      {/* Main */}
      <main className="relative flex min-w-0 flex-1 flex-col">
        <header className="flex items-center gap-2 px-4 py-3">
          {!sidebarOpen && <button onClick={() => setSidebarOpen(true)} className="rounded-md p-1.5 hover:bg-accent" aria-label="Open sidebar"><Menu className="size-5" /></button>}
          <span className="text-sm font-medium">OmniAI</span>
          {temporary && <span className="flex items-center gap-1 rounded-full bg-secondary px-2.5 py-1 text-xs text-muted-foreground"><Ghost className="size-3" /> Temporary — not saved</span>}
          <div className="ml-auto flex items-center gap-2">
            <button onClick={openVoice} className="flex items-center gap-2 rounded-full border px-3 py-1.5 text-sm hover:bg-accent"><AudioLines className="size-4" /> Voice</button>
          </div>
        </header>

        <div ref={scrollRef} className="flex-1 overflow-y-auto">
          {empty ? (
            <div className="relative flex h-full flex-col items-center justify-center px-4 pb-40">
              <div className="pointer-events-none absolute top-1/4 h-72 w-[600px] max-w-full rounded-full bg-aurora opacity-10 blur-[100px]" />
              <h1 className="relative text-center text-3xl font-medium tracking-tight md:text-4xl">
                <span className="text-aurora">{greeting}, {firstName}</span> 😊
              </h1>
              <p className="relative mt-3 text-lg text-muted-foreground">What's going on?</p>
            </div>
          ) : (
            <div className="mx-auto max-w-3xl space-y-8 px-4 pb-48 pt-4">
              {messages.map((m, idx) => m.role === "user" ? (
                <div key={m.id} className="group flex flex-col items-end">
                  {editing?.id === m.id ? (
                    <div className="w-full max-w-[85%] rounded-2xl bg-bubble p-3">
                      <Textarea value={editing.text} onChange={(e) => setEditing({ ...editing, text: e.target.value })} className="min-h-20 border-0 bg-transparent focus-visible:ring-0" autoFocus />
                      <div className="mt-2 flex justify-end gap-2">
                        <Button size="sm" variant="ghost" onClick={() => setEditing(null)}>Cancel</Button>
                        <Button size="sm" onClick={submitEdit}>Send</Button>
                      </div>
                    </div>
                  ) : (
                    <div className="max-w-[85%] whitespace-pre-wrap rounded-3xl bg-bubble px-5 py-3 text-bubble-foreground">{m.content}</div>
                  )}
                  {editing?.id !== m.id && (
                    <div className="mt-1 flex gap-0.5 opacity-0 transition group-hover:opacity-100">
                      <IconBtn label="Copy prompt" onClick={() => { navigator.clipboard.writeText(m.content); toast.success("Copied"); }}><Copy /></IconBtn>
                      <IconBtn label="Edit prompt" onClick={() => setEditing({ id: m.id, text: m.content })}><Pencil /></IconBtn>
                      <IconBtn label="Delete prompt and reply" onClick={() => deletePair(m.id)}><Trash2 /></IconBtn>
                    </div>
                  )}
                </div>
              ) : (
                <div key={m.id} className="group flex gap-4">
                  <OmniLogo className={cn("mt-0.5 size-7 shrink-0", streaming && idx === messages.length - 1 && "animate-orb")} />
                  <div className="min-w-0 flex-1">
                    {m.content ? <Markdown text={m.content} onPreview={setPreview} /> : <ThinkingDots mode={mode} />}
                    {m.content && !(streaming && idx === messages.length - 1) && (
                      <div className="mt-2 flex gap-0.5">
                        <IconBtn label="Copy reply" onClick={() => { navigator.clipboard.writeText(m.content); toast.success("Copied"); }}><Copy /></IconBtn>
                        <IconBtn label="Read aloud" onClick={() => readAloud(m)}>{speakingId === m.id ? <VolumeX /> : <Volume2 />}</IconBtn>
                        <IconBtn label="Good reply" active={m.feedback === 1} onClick={() => feedback(m.id, 1)}><ThumbsUp /></IconBtn>
                        <IconBtn label="Bad reply" active={m.feedback === -1} onClick={() => feedback(m.id, -1)}><ThumbsDown /></IconBtn>
                        {!temporary && <IconBtn label="Branch to new chat" onClick={() => branch(m.id)}><GitBranch /></IconBtn>}
                      </div>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Composer */}
        <div className="pointer-events-none absolute inset-x-0 bottom-0 bg-gradient-to-t from-background via-background to-transparent px-4 pb-4 pt-10">
          <div className="pointer-events-auto mx-auto max-w-3xl">
            <div className="glow-ring rounded-3xl bg-card p-2">
              {files.length > 0 && (
                <div className="flex flex-wrap gap-2 px-2 pt-1">
                  {files.map((f, i) => (
                    <span key={i} className="flex items-center gap-1.5 rounded-lg bg-secondary px-2.5 py-1 text-xs">
                      <Paperclip className="size-3" />{f.name}
                      <button onClick={() => setFiles(files.filter((_, j) => j !== i))} aria-label="Remove file"><X className="size-3" /></button>
                    </span>
                  ))}
                </div>
              )}
              <Textarea
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); send(); } }}
                placeholder={mode === "build" ? "Describe the website or app to build…" : "Ask OmniAI anything…"}
                rows={1}
                className="max-h-52 min-h-12 resize-none border-0 bg-transparent px-3 text-base shadow-none focus-visible:ring-0 dark:bg-transparent"
              />
              <div className="flex items-center gap-1 px-1">
                <input ref={fileRef} type="file" multiple hidden onChange={(e) => { setFiles([...files, ...Array.from(e.target.files ?? [])]); e.target.value = ""; }} />
                <IconBtn label="Attach files" big onClick={() => fileRef.current?.click()}><Paperclip /></IconBtn>
                <Popover>
                  <PopoverTrigger asChild>
                    <button className="flex items-center gap-1.5 rounded-full px-3 py-1.5 text-sm text-muted-foreground hover:bg-accent hover:text-foreground">
                      <currentMode.icon className="size-4" /> {currentMode.label} <ChevronDown className="size-3.5" />
                    </button>
                  </PopoverTrigger>
                  <PopoverContent align="start" className="w-64 rounded-2xl p-1.5">
                    {MODES.map((m) => (
                      <button key={m.id} disabled={m.soon} onClick={() => !m.soon && setMode(m.id as Mode)}
                        className={cn("flex w-full items-center gap-3 rounded-xl px-3 py-2 text-left hover:bg-accent disabled:opacity-50", mode === m.id && "bg-accent")}>
                        <m.icon className="size-4" />
                        <div className="flex-1"><p className="text-sm">{m.label}</p><p className="text-xs text-muted-foreground">{m.desc}</p></div>
                        {mode === m.id && <Check className="size-4" />}
                      </button>
                    ))}
                    <div className="mt-1 flex items-center gap-3 border-t px-3 pb-1 pt-2.5">
                      <Wand2 className="size-4" />
                      <div className="flex-1"><p className="text-sm">Auto-correct</p><p className="text-xs text-muted-foreground">Fix grammar before sending</p></div>
                      <Switch checked={autoCorrect} onCheckedChange={setAutoCorrect} />
                    </div>
                  </PopoverContent>
                </Popover>
                {autoCorrect && <span title="Auto-correct on"><Sparkle className="size-3.5 text-glow-2" /></span>}
                <div className="ml-auto flex items-center gap-1">
                  <IconBtn label="Voice typing" big active={listening} onClick={dictate}><Mic /></IconBtn>
                  {streaming ? (
                    <button onClick={() => abortRef.current?.abort()} aria-label="Stop" className="flex size-9 items-center justify-center rounded-full bg-primary text-primary-foreground"><Square className="size-3.5 fill-current" /></button>
                  ) : (
                    <button onClick={() => send()} disabled={!input.trim() && files.length === 0} aria-label="Send" className="flex size-9 items-center justify-center rounded-full bg-primary text-primary-foreground disabled:opacity-30"><ArrowUp className="size-4" /></button>
                  )}
                </div>
              </div>
            </div>
            <p className="mt-2 text-center text-xs text-muted-foreground">OmniAI can make mistakes. Check important info.</p>
          </div>
        </div>
      </main>

      {/* Rename */}
      <Dialog open={!!renaming} onOpenChange={(o) => !o && setRenaming(null)}>
        <DialogContent>
          <DialogHeader><DialogTitle>Rename chat</DialogTitle></DialogHeader>
          <Input value={renaming?.title ?? ""} onChange={(e) => renaming && setRenaming({ ...renaming, title: e.target.value })} onKeyDown={(e) => e.key === "Enter" && saveRename()} autoFocus />
          <div className="flex justify-end gap-2"><Button variant="ghost" onClick={() => setRenaming(null)}>Cancel</Button><Button onClick={saveRename}>Save</Button></div>
        </DialogContent>
      </Dialog>

      {/* App preview */}
      <Dialog open={!!preview} onOpenChange={(o) => !o && setPreview(null)}>
        <DialogContent className="h-[90vh] max-w-[95vw] gap-0 p-0 sm:max-w-6xl">
          <DialogHeader className="border-b px-4 py-3"><DialogTitle className="text-sm">Live preview</DialogTitle></DialogHeader>
          {preview && <iframe title="App preview" srcDoc={preview} sandbox="allow-scripts allow-forms allow-modals" className="h-full w-full rounded-b-lg bg-primary" />}
        </DialogContent>
      </Dialog>

      {/* Voice chat */}
      {voiceOpen && (
        <div className="fixed inset-0 z-50 flex flex-col items-center justify-center bg-background/95 backdrop-blur">
          <div className={cn("size-40 rounded-full bg-aurora blur-sm", voiceState !== "idle" && "animate-orb")} />
          <p className="mt-10 text-lg">{voiceState === "listening" ? "Listening…" : voiceState === "thinking" ? "Thinking…" : voiceState === "speaking" ? "Speaking…" : "Tap the mic to talk"}</p>
          <div className="mt-10 flex gap-4">
            <button onClick={() => { speechSynthesis.cancel(); voiceListen(); }} className="flex size-14 items-center justify-center rounded-full bg-secondary hover:bg-accent" aria-label="Talk"><Mic className="size-5" /></button>
            <button onClick={closeVoice} className="flex size-14 items-center justify-center rounded-full bg-destructive text-destructive-foreground" aria-label="End voice chat"><X className="size-5" /></button>
          </div>
        </div>
      )}
    </div>
  );
}

function IconBtn({ children, label, onClick, active, big }: { children: React.ReactNode; label: string; onClick: () => void; active?: boolean; big?: boolean }) {
  return (
    <button title={label} aria-label={label} onClick={onClick}
      className={cn("flex items-center justify-center rounded-full text-muted-foreground hover:bg-accent hover:text-foreground [&_svg]:size-4", big ? "size-9" : "size-8", active && "text-foreground bg-accent")}>
      {children}
    </button>
  );
}

function ThinkingDots({ mode }: { mode: Mode }) {
  return (
    <div className="flex items-center gap-2 py-1 text-sm text-muted-foreground">
      <span className="text-aurora font-medium">{mode === "instant" ? "Answering" : mode === "build" ? "Building" : "Thinking"}</span>
      <span className="flex gap-1">{[0, 1, 2].map((i) => <span key={i} className="size-1.5 animate-pulse rounded-full bg-muted-foreground" style={{ animationDelay: `${i * 150}ms` }} />)}</span>
    </div>
  );
}
