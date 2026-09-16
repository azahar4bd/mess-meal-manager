"use client";

import { useEffect } from "react";
import { useApp } from "@/components/app-context";
import { tr } from "@/lib/i18n";

/**
 * EN মোডের জন্য হালকা DOM অনুবাদক।
 *
 * অ্যাপের স্ট্রিং বাংলায় হার্ডকোডেড; EN মোডে MutationObserver দিয়ে নতুন/
 * বদলানো নোডের টেক্সট ও সাধারণ অ্যাট্রিবিউট (placeholder/title) শব্দকোষ
 * থেকে ইংরেজি করা হয়। টাকার অঙ্ক, সদস্যের নাম, গতিশীল স্ট্রিং অপরিবর্তিত
 * থাকে (শব্দকোষে না থাকলে ছোঁয়া হয় না)। BN মোডে সম্পূর্ণ নিষ্ক্রিয়।
 */
const ATTRS = ["placeholder", "title", "aria-label", "alt"] as const;
const SKIP_TAGS = new Set(["SCRIPT", "STYLE", "TEXTAREA"]);

export function I18nWatcher() {
  const lang = useApp().lang;

  useEffect(() => {
    if (lang !== "en") return;

    let raf = 0;
    let scheduled = false;

    const translateAll = () => {
      scheduled = false;
      raf = 0;
      const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
      let node = walker.nextNode();
      while (node) {
        const parentTag = node.parentElement?.tagName;
        const value = node.nodeValue ?? "";
        if (parentTag && SKIP_TAGS.has(parentTag)) {
          node = walker.nextNode();
          continue;
        }
        const out = tr(value);
        if (out !== value) node.nodeValue = out;
        node = walker.nextNode();
      }
      document.querySelectorAll<HTMLElement>("[placeholder],[title],[aria-label],[alt]").forEach((el) => {
        for (const attr of ATTRS) {
          const current = el.getAttribute(attr);
          if (!current) continue;
          const out = tr(current);
          if (out !== current) el.setAttribute(attr, out);
        }
      });
    };

    const schedule = () => {
      if (scheduled) return;
      scheduled = true;
      raf = requestAnimationFrame(translateAll);
    };

    // প্রথম রানে পুরো ডকুমেন্ট + পরে প্রতি মিউটেশনে বাড়তি অংশ
    schedule();
    const observer = new MutationObserver(schedule);
    observer.observe(document.body, { childList: true, subtree: true, characterData: true });

    return () => {
      observer.disconnect();
      if (raf) cancelAnimationFrame(raf);
    };
  }, [lang]);

  return null;
}
