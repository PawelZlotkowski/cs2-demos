"use client";

import { useEffect, useRef, useState } from "react";

/**
 * Shows a newly generated access code once, in a panel that stays until the admin dismisses
 * it. The code is never stored in the browser, a URL or analytics.
 */
export function CodeReveal({ name, code, site, onClose }: { name: string; code: string; site: string; onClose: () => void }) {
  const panel = useRef<HTMLElement>(null);
  const [copied, setCopied] = useState<"code" | "message" | null>(null);

  useEffect(() => {
    panel.current?.scrollIntoView({ block: "nearest" });
    panel.current?.focus();
  }, [code]);

  async function copy(text: string, what: "code" | "message") {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(what);
    } catch {
      setCopied(null);
    }
  }

  const message = `Open ${site}/label/login and paste your personal code ${code}. Choose Continue reviewing. Watch the selected player's clip, write what went well or what could be improved, then press Save and next. Use Skip for now if you need more context. Your notes save to your account, and you can return later on the same website.`;

  return (
    <section ref={panel} className="lb-reveal sheet" role="region" aria-labelledby="code-title" tabIndex={-1}>
      <h2 id="code-title">Access code for {name}</h2>
      <p className="lb-lead">This code is shown only now. Copy it and send it to {name} privately. Generating a new code replaces it.</p>
      <p className="lb-code num" aria-label="Access code">
        {code}
      </p>
      <div className="lb-actions">
        <button type="button" className="lb-btn lb-btn-primary" onClick={() => void copy(code, "code")}>
          {copied === "code" ? "Code copied" : "Copy code"}
        </button>
        <button type="button" className="lb-btn lb-btn-secondary" onClick={() => void copy(message, "message")}>
          {copied === "message" ? "Message copied" : "Copy message with code"}
        </button>
        <button type="button" className="lb-btn lb-btn-quiet" onClick={onClose}>
          I have sent it
        </button>
      </div>
    </section>
  );
}
