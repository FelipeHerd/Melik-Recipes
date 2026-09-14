export type ParsedRecipeRow = {
  title: string;
  category: string;
  timeMinutes: number;
  ingredients: string;
  instructions: string;
  imageUrl?: string;
  createdAt?: string; // ISO
  originalAuthor?: string;
};

// RFC-4180-ish CSV parser: quoted fields, escaped quotes ("") and CRLF/LF.
function parseCsv(text: string): string[][] {
  // Strip BOM
  if (text.charCodeAt(0) === 0xfeff) text = text.slice(1);
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let inQuotes = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (inQuotes) {
      if (c === '"') {
        if (text[i + 1] === '"') {
          field += '"';
          i++;
        } else {
          inQuotes = false;
        }
      } else {
        field += c;
      }
    } else {
      if (c === '"') {
        inQuotes = true;
      } else if (c === ",") {
        row.push(field);
        field = "";
      } else if (c === "\n" || c === "\r") {
        // Handle CRLF
        if (c === "\r" && text[i + 1] === "\n") i++;
        row.push(field);
        field = "";
        rows.push(row);
        row = [];
      } else {
        field += c;
      }
    }
  }
  // flush trailing field/row (if non-empty)
  if (field.length > 0 || row.length > 0) {
    row.push(field);
    rows.push(row);
  }
  return rows.filter((r) => r.length > 0 && !(r.length === 1 && r[0] === ""));
}

const EXPECTED_HEADERS = [
  "title",
  "category",
  "time_minutes",
  "ingredients",
  "instructions",
  "created_at",
];

export function parseRecipesCsv(text: string): ParsedRecipeRow[] {
  const rows = parseCsv(text);
  if (rows.length === 0) return [];
  const header = rows[0].map((h) => h.trim().toLowerCase());
  const idx = (name: string) => header.indexOf(name);
  const iTitle = idx("title");
  const iCategory = idx("category");
  const iTime = idx("time_minutes");
  const iIng = idx("ingredients");
  const iInst = idx("instructions");
  const iCreated = idx("created_at");
  const iImage = idx("image_url");
  const iAuthor = idx("original_author");
  if (iTitle === -1) {
    throw new Error("APP-CSV-001: header missing. Expected: " + EXPECTED_HEADERS.join(", "));
  }

  const out: ParsedRecipeRow[] = [];
  for (let r = 1; r < rows.length; r++) {
    const row = rows[r];
    const title = (row[iTitle] ?? "").trim();
    if (!title) continue;
    const timeRaw = iTime !== -1 ? (row[iTime] ?? "").trim() : "";
    const timeMinutes = Math.max(0, Math.min(10000, parseInt(timeRaw, 10) || 0));
    const createdRaw = iCreated !== -1 ? (row[iCreated] ?? "").trim() : "";
    let createdAt: string | undefined;
    if (createdRaw) {
      const d = new Date(createdRaw);
      if (!isNaN(d.getTime())) createdAt = d.toISOString();
    }
    const imageUrl = iImage !== -1 ? (row[iImage] ?? "").trim() : "";
    // original_author must match the username rules — anything else is dropped
    // to prevent local Excel spoofing.
    const authorRaw = iAuthor !== -1 ? (row[iAuthor] ?? "").trim().toLowerCase() : "";
    const originalAuthor =
      /^[a-z0-9_.]{3,20}$/.test(authorRaw) && !/(^\.|\.$|\.\.)/.test(authorRaw)
        ? authorRaw
        : undefined;
    out.push({
      title: title.slice(0, 200),
      category: (iCategory !== -1 ? (row[iCategory] ?? "").trim() : "") || "Otro",
      timeMinutes,
      ingredients: iIng !== -1 ? (row[iIng] ?? "") : "",
      instructions: iInst !== -1 ? (row[iInst] ?? "") : "",
      imageUrl: imageUrl || undefined,
      createdAt,
      originalAuthor,
    });
  }
  return out;
}
