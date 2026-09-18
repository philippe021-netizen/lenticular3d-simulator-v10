const ROLES = new Set([
  "name", "company", "title", "phone", "email", "address", "website",
  "social", "slogan", "hours", "service", "logo", "qr", "artwork",
  "subject", "other",
]);

const ROLE_LABELS = {
  name: "Nom",
  company: "Entreprise",
  title: "Fonction",
  phone: "Téléphone",
  email: "E-mail",
  address: "Adresse",
  website: "Site web",
  social: "Réseau social",
  slogan: "Slogan",
  hours: "Horaires",
  service: "Service",
  logo: "Logo principal",
  qr: "QR",
  artwork: "Graphisme",
  subject: "Sujet",
  other: "Autre",
};

const clamp = (value, min = 0, max = 1) => Math.max(min, Math.min(max, Number(value) || 0));
const plain = value => String(value ?? "").replace(/\s+/g, " ").trim();
const slug = value => plain(value).toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");

export function normaliseCardBox(value) {
  if (!Array.isArray(value) || value.length !== 4) return null;
  const numbers = value.map(Number);
  if (numbers.some(number => !Number.isFinite(number))) return null;
  const x = clamp(numbers[0]);
  const y = clamp(numbers[1]);
  return [x, y, Math.max(0.002, Math.min(1 - x, numbers[2])), Math.max(0.002, Math.min(1 - y, numbers[3]))];
}

export function unionCardBoxes(boxes) {
  const valid = boxes.map(normaliseCardBox).filter(Boolean);
  if (!valid.length) return null;
  const left = Math.min(...valid.map(box => box[0]));
  const top = Math.min(...valid.map(box => box[1]));
  const right = Math.max(...valid.map(box => box[0] + box[2]));
  const bottom = Math.max(...valid.map(box => box[1] + box[3]));
  return [left, top, right - left, bottom - top];
}

export function classifyCardText(text, hintedRole = "other") {
  const value = plain(text);
  const lower = value.toLowerCase();
  const hint = ROLES.has(hintedRole) ? hintedRole : "other";
  if (!value) return hint;
  if (/\b[\w.+-]+@[\w.-]+\.[a-z]{2,}\b/i.test(value)) return "email";
  if (/\b(?:https?:\/\/)?(?:www\.)?[a-z0-9-]+(?:\.[a-z0-9-]+)+(?:\/\S*)?\b/i.test(value) && !value.includes("@")) return "website";
  if (/^(?:\+?\d[\d\s()./-]{6,}\d)(?:\s*(?:poste|ext)\.?\s*\d+)?$/i.test(value)) return "phone";
  if (/\b(?:instagram|linkedin|facebook|tiktok|youtube|behance|pinterest)\b|^@[\w.-]+$/i.test(value)) return "social";
  if (/\b(?:lundi|mardi|mercredi|jeudi|vendredi|samedi|dimanche|lun\.?|mar\.?|mer\.?|jeu\.?|ven\.?|sam\.?|dim\.?)\b.*\b\d{1,2}\s*(?:h|:)/i.test(value)) return "hours";
  if (/\b\d{5}\b|\b(?:rue|avenue|av\.?|boulevard|bd\.?|chemin|route|place|impasse|allée|allee|quai|cours)\b/i.test(value)) return "address";
  if (/\b(?:directeur|directrice|responsable|manager|designer|fondateur|fondatrice|président|president|consultant|commercial|artisan|photographe|architecte|gérant|gerant|ceo|cto|chargé|chargee)\b/i.test(lower)) return "title";
  if (hint !== "other") return hint;
  return "other";
}

function intersectionOverUnion(a, b) {
  const left = Math.max(a[0], b[0]);
  const top = Math.max(a[1], b[1]);
  const right = Math.min(a[0] + a[2], b[0] + b[2]);
  const bottom = Math.min(a[1] + a[3], b[1] + b[3]);
  const intersection = Math.max(0, right - left) * Math.max(0, bottom - top);
  const union = a[2] * a[3] + b[2] * b[3] - intersection;
  return union ? intersection / union : 0;
}

export function sanitiseOcrLines(lines = []) {
  const cleaned = lines.map((line, index) => {
    const bbox = normaliseCardBox(line?.bbox);
    const text = plain(line?.text);
    if (!bbox || !text) return null;
    return {
      id: plain(line?.id) || `ocr-${index + 1}`,
      type: "text",
      text,
      label: text,
      bbox,
      role: classifyCardText(text, line?.role),
      confidence: clamp(Number(line?.confidence ?? 0) / (Number(line?.confidence) > 1 ? 100 : 1)),
      source: "ocr",
      words: Array.isArray(line?.words) ? line.words.map((word, wordIndex) => ({
        id: plain(word?.id) || `ocr-${index + 1}-word-${wordIndex + 1}`,
        text: plain(word?.text),
        bbox: normaliseCardBox(word?.bbox),
        confidence: clamp(Number(word?.confidence ?? 0) / (Number(word?.confidence) > 1 ? 100 : 1)),
      })).filter(word => word.text && word.bbox) : [],
    };
  }).filter(Boolean);

  return cleaned.filter((line, index) => !cleaned.some((other, otherIndex) => (
    otherIndex < index &&
    other.text.toLocaleLowerCase("fr") === line.text.toLocaleLowerCase("fr") &&
    intersectionOverUnion(other.bbox, line.bbox) > 0.7
  )));
}

function centre(box) {
  return { x: box[0] + box[2] / 2, y: box[1] + box[3] / 2 };
}

function iconRole(layer) {
  const text = `${layer?.label || ""} ${layer?.text || ""}`;
  if (/t[ée]l[ée]phone|phone|mobile|call/i.test(text)) return "phone";
  if (/e-?mail|courriel|enveloppe|mail/i.test(text)) return "email";
  if (/localisation|location|adresse|address|pin|rep[èe]re/i.test(text)) return "address";
  if (/globe|web|site|url/i.test(text)) return "website";
  if (/instagram|linkedin|facebook|tiktok|youtube|r[ée]seau|social/i.test(text)) return "social";
  return null;
}

function compatibleDistance(icon, candidate) {
  const a = centre(icon.bbox);
  const b = centre(candidate.bbox);
  const dx = Math.abs(a.x - b.x);
  const dy = Math.abs(a.y - b.y);
  const rowTolerance = Math.max(icon.bbox[3], candidate.bbox[3]) * 1.7 + 0.012;
  if (dy > rowTolerance) return Infinity;
  return dx + dy * 2.5;
}

export function pairSemanticGroups(input = []) {
  const layers = input.map((item, index) => {
    const role = classifyCardText(item?.text, ROLES.has(item?.role) ? item.role : "other");
    return {
      ...item,
      id: plain(item?.id) || `element-${index + 1}`,
      type: plain(item?.type) || "object",
      role,
      label: plain(item?.label || item?.text || ROLE_LABELS[role]),
      bbox: normaliseCardBox(item?.bbox),
      groupId: plain(item?.groupId),
      groupLabel: plain(item?.groupLabel),
      component: plain(item?.component) || "content",
    };
  }).filter(layer => layer.bbox);

  for (const layer of layers) {
    if (layer.groupId) continue;
    if (layer.type === "text") {
      layer.groupId = `${layer.role}-${slug(layer.id)}`;
      layer.groupLabel = ROLE_LABELS[layer.role] || layer.label;
    }
  }

  for (const icon of layers.filter(layer => !layer.groupId && ["logo", "object", "artwork"].includes(layer.type))) {
    const detectedRole = iconRole(icon);
    const candidates = layers.filter(layer => layer.type === "text" && (!detectedRole || layer.role === detectedRole));
    const nearest = candidates.map(candidate => ({ candidate, distance: compatibleDistance(icon, candidate) }))
      .filter(match => Number.isFinite(match.distance) && match.distance < 0.22)
      .sort((a, b) => a.distance - b.distance)[0]?.candidate;
    if (nearest) {
      icon.role = detectedRole || nearest.role;
      icon.groupId = nearest.groupId;
      icon.groupLabel = nearest.groupLabel;
      icon.component = "icon";
    }
  }

  for (const layer of layers) {
    if (!layer.groupId) layer.groupId = `${layer.role}-${slug(layer.id) || "element"}`;
    if (!layer.groupLabel) layer.groupLabel = ROLE_LABELS[layer.role] || layer.label || "Autre";
  }
  return layers;
}

const roleRank = role => ["logo", "name", "company", "title", "slogan", "social", "phone", "email", "website", "address", "hours", "service", "artwork", "subject", "other"].indexOf(role);

export function buildSemanticGroups(input = []) {
  const grouped = new Map();
  for (const item of pairSemanticGroups(input)) {
    const current = grouped.get(item.groupId) || { id: item.groupId, items: [] };
    current.items.push(item);
    grouped.set(item.groupId, current);
  }
  return [...grouped.values()].map(group => {
    const ordered = [...group.items].sort((a, b) => {
      const ar = roleRank(a.role); const br = roleRank(b.role);
      return (ar < 0 ? 99 : ar) - (br < 0 ? 99 : br);
    });
    const lead = ordered[0];
    const texts = group.items.filter(item => item.type === "text" && item.text).map(item => item.text);
    return {
      id: group.id,
      groupId: group.id,
      label: lead.groupLabel || texts.join(" · ") || lead.label,
      role: lead.role,
      type: group.items.some(item => item.type === "text") ? "text" : lead.type,
      bbox: unionCardBoxes(group.items.map(item => item.bbox)),
      confidence: group.items.reduce((sum, item) => sum + Number(item.confidence ?? 0.75), 0) / group.items.length,
      items: group.items,
    };
  }).sort((a, b) => a.bbox[1] - b.bbox[1] || a.bbox[0] - b.bbox[0]);
}

export function semanticDepthForRole(role, type = "object") {
  const depths = { artwork: 52, qr: 128, address: 154, website: 166, email: 176, phone: 188, social: 198, service: 204, slogan: 210, title: 216, company: 228, name: 238, logo: 248, subject: 220, other: 184 };
  if (type === "qr") return 128;
  return depths[role] ?? depths.other;
}

export function documentInventory(elements = []) {
  const groups = buildSemanticGroups(elements);
  const textElements = elements.filter(element => element.type === "text");
  const confidences = textElements.map(element => Number(element.confidence || 0));
  const roles = new Set(elements.map(element => element.role));
  return {
    elementCount: elements.length,
    groupCount: groups.length,
    textCount: textElements.length,
    averageOcrConfidence: confidences.length ? confidences.reduce((sum, value) => sum + value, 0) / confidences.length : 0,
    roles: [...roles],
    complete: groups.length >= 4 && textElements.length >= 2,
  };
}

export { ROLE_LABELS };
