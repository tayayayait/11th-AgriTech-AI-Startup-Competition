export interface ConsultationAnswerItem {
  label: string | null;
  text: string;
}

export interface ConsultationAnswerSection {
  heading: string | null;
  paragraphs: string[];
  items: ConsultationAnswerItem[];
}

function createSection(heading: string | null): ConsultationAnswerSection {
  return {
    heading,
    paragraphs: [],
    items: [],
  };
}

function hasContent(section: ConsultationAnswerSection): boolean {
  return section.paragraphs.length > 0 || section.items.length > 0;
}

function cleanInlineMarkdown(value: string): string {
  return value
    .replace(/\[([^\]]+)\]\([^)]*\)/g, "$1")
    .replace(/[*_`~]/g, "")
    .replace(/^#{1,6}\s+/, "")
    .replace(/\s+/g, " ")
    .trim()
    .replace(/^\[(.+)\]$/, "$1")
    .trim();
}

function parseHeading(line: string): string | null {
  const boldHeading = line.trim().match(/^(?:\*\*|__)(.+?)(?:\*\*|__)\s*:?[ \t]*$/);
  if (boldHeading) return cleanInlineMarkdown(boldHeading[1]);

  const bracketHeading = line.trim().match(/^\[(.+?)\]\s*:?[ \t]*$/);
  if (bracketHeading) return cleanInlineMarkdown(bracketHeading[1]);

  const plainHeading = line.trim().match(/^#{1,6}\s+(.+?)\s*:?[ \t]*$/);
  if (plainHeading) return cleanInlineMarkdown(plainHeading[1]);

  const cleaned = cleanInlineMarkdown(line);
  if (["현재 판단", "확인할 것", "오늘 할 일", "주의사항"].includes(cleaned)) return cleaned;
  return null;
}

function parseItem(line: string): ConsultationAnswerItem | null {
  const bullet = line.trim().match(/^(?:[-*•]|\d+[.)])\s+(.+)$/);
  if (!bullet) return null;

  const rawContent = bullet[1].trim();
  const labeled = rawContent.match(/^(?:\*\*|__)(.+?)(?:\*\*|__)\s*:\s*(.*)$/);
  if (labeled) {
    return {
      label: cleanInlineMarkdown(labeled[1]),
      text: cleanInlineMarkdown(labeled[2]),
    };
  }

  return {
    label: null,
    text: cleanInlineMarkdown(rawContent),
  };
}

export function parseConsultationAnswer(content: string): ConsultationAnswerSection[] {
  const sections: ConsultationAnswerSection[] = [];
  let current = createSection(null);
  let previousLineWasItem = false;

  const pushCurrent = () => {
    if (hasContent(current)) sections.push(current);
  };

  for (const rawLine of content.replace(/\r/g, "").split("\n")) {
    const line = rawLine.trim();
    if (!line) {
      previousLineWasItem = false;
      continue;
    }

    const heading = parseHeading(line);
    if (heading) {
      pushCurrent();
      current = createSection(heading);
      previousLineWasItem = false;
      continue;
    }

    const item = parseItem(line);
    if (item) {
      current.items.push(item);
      previousLineWasItem = true;
      continue;
    }

    const text = cleanInlineMarkdown(line);
    if (!text) continue;

    if (previousLineWasItem && current.items.length > 0) {
      const lastItem = current.items[current.items.length - 1];
      lastItem.text = `${lastItem.text} ${text}`.trim();
    } else {
      current.paragraphs.push(text);
    }
    previousLineWasItem = false;
  }

  pushCurrent();
  return sections.length > 0 ? sections : [createSection(null)];
}
