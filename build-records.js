function normalizeSize(value) {
  let size = String(value || '')
    .replace(/[Ａ-Ｚ]/g, s => String.fromCharCode(s.charCodeAt(0) - 0xFEE0))
    .replace(/\u200B/g, '')
    .trim()
    .toUpperCase();

  if (!['S', 'M', 'L'].includes(size)) {
    throw new Error(`Invalid size: ${size}`);
  }

  return size;
}

const fs = require('fs');
const path = require('path');
const { generatePublicId } = require('./public-id');

const outputDir = path.join(__dirname, 'records');
const imagesDir = path.join(__dirname, 'images');

if (!fs.existsSync(outputDir)) {
  fs.mkdirSync(outputDir, { recursive: true });
}

function normalizeArtworkCode(value) {
  return String(value || '').trim().toUpperCase();
}


function normalizeTitle(value) {
  return String(value || '').trim();
}

function normalizeImageFilename(value, artworkCode) {
  const raw = String(value || '').trim();
  if (!raw) {
    return `${artworkCode}.jpg`;
  }
  return raw;
}

function padEdition(value) {
  const num = Number(value);
  if (!Number.isInteger(num) || num <= 0) {
    throw new Error('edition must be a positive integer.');
  }
  return String(num).padStart(3, '0');
}

function ensureImageExists(filename) {
  const fullPath = path.join(imagesDir, filename);
  if (!fs.existsSync(fullPath)) {
    throw new Error(`Image file not found: ${fullPath}`);
  }
  return fullPath;
}

function ensureDir(dirPath) {
  if (!fs.existsSync(dirPath)) {
    fs.mkdirSync(dirPath, { recursive: true });
  }
}

function buildRecord({ artworkCode, size, edition, title, image }) {
  const editionPadded = padEdition(edition);
  const publicSlug = `GLA-${artworkCode}-${size}-${editionPadded}`;
  const publicId = generatePublicId({
    brand: 'GLA',
    artworkCode,
    size,
    edition
  });

  return {
    artworkCode,
    size,
    edition: Number(edition),
    title,
    image,
    publicId,
    publicSlug
  };
}

function saveRecord(record) {
  const recordDir = path.join(outputDir, record.publicSlug);
  ensureDir(recordDir);

  const dataPath = path.join(recordDir, 'data.json');
  fs.writeFileSync(dataPath, JSON.stringify(record, null, 2), 'utf8');

  return {
    recordDir,
    dataPath
  };
}

function main() {
  const [, , artworkCodeArg, sizeArg, editionArg, titleArg, imageArg] = process.argv;

  const artworkCode = normalizeArtworkCode(artworkCodeArg);
  const size = normalizeSize(sizeArg);
  const edition = editionArg;
  const title = normalizeTitle(titleArg);
  const image = normalizeImageFilename(imageArg, artworkCode);

  if (!artworkCode) {
    throw new Error('artworkCode is required.');
  }

  if (!size) {
    throw new Error('size is required.');
  }

  if (!edition) {
    throw new Error('edition is required.');
  }

  if (!title) {
    throw new Error('title is required.');
  }

  ensureImageExists(image);

  const record = buildRecord({
    artworkCode,
    size,
    edition,
    title,
    image
  });

  const result = saveRecord(record);

  console.log('');
  console.log('Record created successfully.');
  console.log(`publicSlug: ${record.publicSlug}`);
  console.log(`publicId:   ${record.publicId}`);
  console.log(`data.json:   ${result.dataPath}`);
  console.log(`image ref:   /images/${record.image}`);
  console.log('');
}

try {
  main();
} catch (error) {
  console.error('');
  console.error('Error:', error.message);
  console.error('');
  process.exit(1);
}
