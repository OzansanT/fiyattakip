const HEADER_ALIASES = {
  name: ['name', 'product', 'productname', 'urun', 'urunadi', 'ürün', 'ürünadı'],
  category: ['category', 'kategori'],
  purchasePrice: ['purchaseprice', 'buy', 'buyprice', 'cost', 'alis', 'alisfiyati', 'alış', 'alışfiyatı'],
  salePrice: ['saleprice', 'sell', 'sellprice', 'price', 'satis', 'satisfiyati', 'satış', 'satışfiyatı'],
  commissionRate: ['commission', 'commissionrate', 'komisyon', 'komisyonorani', 'komisyonoranı'],
  advertisingRate: ['advertising', 'advertisingrate', 'ads', 'reklam', 'reklamorani', 'reklamoranı'],
  returnReserveRate: ['returnreserve', 'returnreserverate', 'returns', 'iade', 'iadeorani', 'iadeoranı'],
  targetRoi: ['targetroi', 'roi', 'hedefroi'],
  shipping: ['shipping', 'cargo', 'kargo'],
  packaging: ['packaging', 'package', 'paketleme'],
  other: ['other', 'othercost', 'diger', 'digergider', 'diğer', 'diğergider']
};

const numericFields = new Set([
  'purchasePrice', 'salePrice', 'commissionRate', 'advertisingRate',
  'returnReserveRate', 'targetRoi', 'shipping', 'packaging', 'other'
]);

function normalizeKey(value) {
  return String(value ?? '')
    .trim()
    .toLocaleLowerCase('tr-TR')
    .replace(/[\s_\-().%₺]/g, '');
}

const aliasLookup = new Map();
Object.entries(HEADER_ALIASES).forEach(([canonical, aliases]) => {
  aliases.forEach(alias => aliasLookup.set(normalizeKey(alias), canonical));
});

function countUnquoted(line, character) {
  let quoted = false;
  let count = 0;
  for (let i = 0; i < line.length; i += 1) {
    if (line[i] === '"') {
      if (quoted && line[i + 1] === '"') i += 1;
      else quoted = !quoted;
    } else if (!quoted && line[i] === character) {
      count += 1;
    }
  }
  return count;
}

function detectDelimiter(text) {
  const firstLine = String(text).split(/\r?\n/).find(line => line.trim()) || '';
  const semicolons = countUnquoted(firstLine, ';');
  const commas = countUnquoted(firstLine, ',');
  return semicolons > commas ? ';' : ',';
}

function parseDelimited(text, delimiter) {
  const records = [];
  let record = [];
  let field = '';
  let quoted = false;

  for (let i = 0; i < text.length; i += 1) {
    const char = text[i];
    if (char === '"') {
      if (quoted && text[i + 1] === '"') {
        field += '"';
        i += 1;
      } else {
        quoted = !quoted;
      }
      continue;
    }

    if (!quoted && char === delimiter) {
      record.push(field);
      field = '';
      continue;
    }

    if (!quoted && (char === '\n' || char === '\r')) {
      if (char === '\r' && text[i + 1] === '\n') i += 1;
      record.push(field);
      field = '';
      if (record.some(value => String(value).trim() !== '')) records.push(record);
      record = [];
      continue;
    }

    field += char;
  }

  record.push(field);
  if (record.some(value => String(value).trim() !== '')) records.push(record);
  return records;
}

export function parseLocalizedNumber(value) {
  if (typeof value === 'number') return Number.isFinite(value) ? value : NaN;
  let raw = String(value ?? '').trim().replace(/\s/g, '').replace(/₺/g, '');
  if (!raw) return NaN;

  const lastComma = raw.lastIndexOf(',');
  const lastDot = raw.lastIndexOf('.');
  if (lastComma >= 0 && lastDot >= 0) {
    if (lastComma > lastDot) raw = raw.replace(/\./g, '').replace(',', '.');
    else raw = raw.replace(/,/g, '');
  } else if (lastComma >= 0) {
    raw = raw.replace(',', '.');
  }

  raw = raw.replace(/[^0-9.+-]/g, '');
  if (!raw || !/[0-9]/.test(raw)) return NaN;
  const parsed = Number(raw);
  return Number.isFinite(parsed) ? parsed : NaN;
}

function canonicalizeObject(source) {
  const result = {};
  Object.entries(source || {}).forEach(([key, value]) => {
    const canonical = aliasLookup.get(normalizeKey(key));
    if (canonical) result[canonical] = value;
  });
  return result;
}

function normalizeItem(source, rowNumber) {
  const canonical = canonicalizeObject(source);
  const item = {
    name: String(canonical.name ?? `İçe Aktarılan Ürün ${rowNumber}`).trim() || `İçe Aktarılan Ürün ${rowNumber}`,
    category: String(canonical.category ?? 'general').trim() || 'general'
  };

  numericFields.forEach(field => {
    if (canonical[field] === undefined || canonical[field] === '') return;
    item[field] = parseLocalizedNumber(canonical[field]);
  });

  const errors = [];
  if (!Number.isFinite(item.purchasePrice) || item.purchasePrice < 0) errors.push('geçerli alış fiyatı gerekli');
  if (!Number.isFinite(item.salePrice) || item.salePrice < 0) errors.push('geçerli satış fiyatı gerekli');
  numericFields.forEach(field => {
    if (item[field] !== undefined && (!Number.isFinite(item[field]) || item[field] < 0)) {
      errors.push(`${field} geçersiz`);
    }
  });

  return { item, errors };
}

function parseCsv(text) {
  const delimiter = detectDelimiter(text);
  const records = parseDelimited(text, delimiter);
  if (records.length < 2) return { items: [], errors: ['CSV başlık ve en az bir veri satırı içermeli.'] };

  const headers = records[0];
  const items = [];
  const errors = [];
  records.slice(1).forEach((values, index) => {
    const source = Object.fromEntries(headers.map((header, column) => [header, values[column] ?? '']));
    const rowNumber = index + 2;
    const normalized = normalizeItem(source, rowNumber);
    if (normalized.errors.length) errors.push(`Satır ${rowNumber}: ${normalized.errors.join(', ')}`);
    else items.push(normalized.item);
  });
  return { items, errors };
}

function parseJson(text) {
  let parsed;
  try {
    parsed = JSON.parse(text);
  } catch {
    return { items: [], errors: ['JSON çözümlenemedi. Dosya sözdizimini kontrol et.'] };
  }

  const sourceItems = Array.isArray(parsed)
    ? parsed
    : Array.isArray(parsed?.products)
      ? parsed.products
      : Array.isArray(parsed?.opportunities)
        ? parsed.opportunities
        : [];

  if (!sourceItems.length) return { items: [], errors: ['JSON bir ürün dizisi, products veya opportunities dizisi içermeli.'] };

  const items = [];
  const errors = [];
  sourceItems.forEach((source, index) => {
    const rowNumber = index + 1;
    const normalized = normalizeItem(source, rowNumber);
    if (normalized.errors.length) errors.push(`Kayıt ${rowNumber}: ${normalized.errors.join(', ')}`);
    else items.push(normalized.item);
  });
  return { items, errors };
}

export function parseOpportunityImport(text, fileName = '') {
  const trimmed = String(text ?? '').trim();
  if (!trimmed) return { items: [], errors: ['Dosya boş.'] };
  const jsonLike = fileName.toLowerCase().endsWith('.json') || trimmed.startsWith('[') || trimmed.startsWith('{');
  return jsonLike ? parseJson(trimmed) : parseCsv(trimmed);
}
