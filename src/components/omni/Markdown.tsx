import { memo, useState } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import remarkMath from "remark-math";
import rehypeKatex from "rehype-katex";
import { Check, Copy, Play } from "lucide-react";

function CodeBlock({ lang, code, onPreview }: { lang: string; code: string; onPreview?: ((html: string) => void) | undefined }) {
  const [copied, setCopied] = useState(false);
  return (
    <div className="my-3 overflow-hidden rounded-xl border bg-sidebar">
      <div className="flex items-center justify-between border-b px-3 py-1.5 text-xs text-muted-foreground">
        <span className="font-mono">{lang || "code"}</span>
        <div className="flex gap-1">
          {lang === "html" && onPreview && (
            <button onClick={() => onPreview(code)} className="flex items-center gap-1 rounded-md px-2 py-1 hover:bg-accent hover:text-foreground">
              <Play className="size-3" /> Preview
            </button>
          )}
          <button
            onClick={() => {
              navigator.clipboard.writeText(code);
              setCopied(true);
              setTimeout(() => setCopied(false), 1500);
            }}
            className="flex items-center gap-1 rounded-md px-2 py-1 hover:bg-accent hover:text-foreground"
          >
            {copied ? <Check className="size-3" /> : <Copy className="size-3" />} {copied ? "Copied" : "Copy"}
          </button>
        </div>
      </div>
      <pre className="overflow-x-auto p-4 font-mono text-[0.82rem] leading-relaxed"><code>{code}</code></pre>
    </div>
  );
}

export const Markdown = memo(function Markdown({ text, onPreview }: { text: string; onPreview?: ((html: string) => void) | undefined }) {
  return (
    <div className="prose-omni">
      <ReactMarkdown
        remarkPlugins={[remarkGfm, remarkMath]}
        rehypePlugins={[rehypeKatex]}
        components={{
          pre: ({ children }) => <>{children}</>,
          code({ className, children }) {
            const m = /language-(\w+)/.exec(className || "");
            const code = String(children).replace(/\n$/, "");
            if (!m && !code.includes("\n")) return <code>{children}</code>;
            return <CodeBlock lang={m?.[1] ?? ""} code={code} onPreview={onPreview} />;
          },
          a: ({ href, children }) => <a href={href} target="_blank" rel="noreferrer">{children}</a>,
        }}
      >
        {text}
      </ReactMarkdown>
    </div>
  );
});
