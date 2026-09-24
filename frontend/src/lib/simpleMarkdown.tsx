import type { ReactNode } from "react";

// Minimal markdown renderer (no dependency): ## / ### headings, "- " bullets,
// blank-line paragraph breaks. Enough for the personal playbook notes.
export function renderMarkdown(content: string): ReactNode {
  const lines = content.split(/\r?\n/);
  const blocks: ReactNode[] = [];
  let bullets: string[] = [];

  const flush = (key: string) => {
    if (bullets.length) {
      blocks.push(
        <ul key={key} className="list-disc list-inside space-y-1 text-on-surface text-body-md">
          {bullets.map((b, i) => (
            <li key={i}>{b}</li>
          ))}
        </ul>,
      );
      bullets = [];
    }
  };

  lines.forEach((raw, i) => {
    const line = raw.trimEnd();
    if (line.startsWith("### ")) {
      flush(`u${i}`);
      blocks.push(
        <h4 key={i} className="font-data-md text-data-md text-on-surface mt-2">{line.slice(4)}</h4>,
      );
    } else if (line.startsWith("## ")) {
      flush(`u${i}`);
      blocks.push(
        <h3 key={i} className="font-label-caps text-label-caps text-primary uppercase tracking-widest mt-3">
          {line.slice(3)}
        </h3>,
      );
    } else if (line.startsWith("- ")) {
      bullets.push(line.slice(2));
    } else if (line.trim() === "") {
      flush(`u${i}`);
    } else {
      flush(`u${i}`);
      blocks.push(
        <p key={i} className="text-on-surface text-body-md">{line}</p>,
      );
    }
  });
  flush("uend");
  return <div className="space-y-1.5">{blocks}</div>;
}

export interface ChecklistSection {
  heading: string;
  items: string[];
}

// Parse "## "/"### " headings + "- " bullets into checklist sections.
export function parseChecklist(content: string): ChecklistSection[] {
  const sections: ChecklistSection[] = [];
  let cur: ChecklistSection | null = null;
  for (const raw of content.split(/\r?\n/)) {
    const line = raw.trim();
    if (line.startsWith("## ") || line.startsWith("### ")) {
      cur = { heading: line.replace(/^#+\s*/, ""), items: [] };
      sections.push(cur);
    } else if (line.startsWith("- ")) {
      if (!cur) {
        cur = { heading: "", items: [] };
        sections.push(cur);
      }
      cur.items.push(line.slice(2));
    }
  }
  return sections.filter((s) => s.items.length > 0);
}
