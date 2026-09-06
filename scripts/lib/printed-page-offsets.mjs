// Derives the PDF-page → printed-page offset of an official annex from its extracted text.
// `pdftotext` keeps the form feeds, so every PDF page is one chunk, and the printed page number is
// the lone bare number in that chunk's running head or foot. Front matter (cover, table of contents,
// section dividers) carries no number and is simply skipped. The offset has to be identical on every
// numbered page of a document; when a document disagrees with itself its standards keep
// `printedPage: null` rather than guessing.

const PAGE_NUMBER_LINE = /^\s*(\d{1,4})\s*$/;
// How many non-empty lines at each end of a page can hold the running head or foot.
const HEAD_LINES = 2;
const FOOT_LINES = 3;
// Below this many numbered pages the offset rests on too little evidence to publish.
const MIN_NUMBERED_PAGES = 10;

/**
 * Reads the PDF→printed offset out of one extracted annex.
 * Returns `{ offset, numberedPages, offsets }`; `offset` is null when the document is inconsistent
 * or too sparsely numbered, and `offsets` lists every observed offset with its page count.
 */
export function printedPageOffset(text) {
  const counts = new Map();
  const pages = String(text ?? '').split('\f');
  for (const [index, page] of pages.entries()) {
    const lines = page.split(/\r?\n/).filter((line) => line.trim());
    const marks = new Set(
      [...lines.slice(-FOOT_LINES), ...lines.slice(0, HEAD_LINES)]
        .map((line) => PAGE_NUMBER_LINE.exec(line))
        .filter(Boolean)
        .map((match) => Number(match[1])),
    );
    // A page whose head and foot disagree was misread, so it votes for nothing.
    if (marks.size !== 1) continue;
    const offset = index + 1 - [...marks][0];
    counts.set(offset, (counts.get(offset) ?? 0) + 1);
  }
  const offsets = [...counts.entries()]
    .map(([offset, pages_]) => ({ offset, pages: pages_ }))
    .sort((a, b) => b.pages - a.pages || a.offset - b.offset);
  const numberedPages = offsets.reduce((sum, entry) => sum + entry.pages, 0);
  const constant = offsets.length === 1 && numberedPages >= MIN_NUMBERED_PAGES && offsets[0].offset >= 0;
  return { offset: constant ? offsets[0].offset : null, numberedPages, offsets };
}

/** The printed page a PDF page carries, or null when the offset is unknown or the page is front matter. */
export function printedPageFor(pdfPage, offset) {
  if (!Number.isInteger(pdfPage) || !Number.isInteger(offset)) return null;
  const printed = pdfPage - offset;
  return printed >= 1 ? printed : null;
}
