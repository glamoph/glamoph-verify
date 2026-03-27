const crypto = require('crypto');

function normalizeArtworkCode(value) {
  return String(value || '')
    .trim()
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, '');
}

function normalizeSize(value) {
  const v = String(value || '').trim().toUpperCase();

  const map = {
    S: 'S',
    M: 'M',
    L: 'L',
    SMALL: 'S',
    MEDIUM: 'M',
    LARGE: 'L',
    '16X20': 'S',
    '16×20': 'S',
    '20X25': 'M',
    '20×25': 'M',
    '24X30': 'L',
    '24×30': 'L'
  };

  const normalized = map[v] || v.replace(/[^A-Z0-9]/g, '');
  if (!normalized) throw new Error('Invalid size');
  return normalized;
}

function normalizeEdition(value, digits = 3) {
  const num = Number(value);
  if (!Number.isInteger(num) || num <= 0) {
    throw new Error('Edition must be a positive integer');
  }
  return String(num).padStart(digits, '0');
}

function generateRandomSuffix(length = 4) {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  const bytes = crypto.randomBytes(length);
  let out = '';

  for (let i = 0; i < length; i++) {
    out += chars[bytes[i] % chars.length];
  }

  return out;
}

function generatePublicId({
  brand = 'GLA',
  artworkCode,
  size,
  edition,
  randomLength = 4
}) {
  const brandPart = String(brand).trim().toUpperCase().replace(/[^A-Z0-9]/g, '');
  const artworkPart = normalizeArtworkCode(artworkCode);
  const sizePart = normalizeSize(size);
  const editionPart = normalizeEdition(edition);
  const randomPart = generateRandomSuffix(randomLength);

  if (!brandPart) throw new Error('Invalid brand');
  if (!artworkPart) throw new Error('Invalid artworkCode');

  return `${brandPart}-${artworkPart}-${sizePart}-${editionPart}-${randomPart}`;
}

module.exports = {
  generatePublicId,
  normalizeArtworkCode,
  normalizeSize,
  normalizeEdition,
  generateRandomSuffix
};

if (require.main === module) {
  const [, , artworkCode, size, edition] = process.argv;

  const publicId = generatePublicId({
    brand: 'GLA',
    artworkCode,
    size,
    edition
  });

  console.log(publicId);
}
