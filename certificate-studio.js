const express = require('express');
const fs = require('fs');
const path = require('path');
const { generatePublicId } = require('./public-id');

const app = express();
const PORT = process.env.PORT || 8787;

const ROOT_DIR = __dirname;
const RECORDS_DIR = path.join(ROOT_DIR, 'records');
const IMAGES_DIR = path.join(ROOT_DIR, 'images');
const ASSETS_DIR = path.join(ROOT_DIR, 'assets');

const VERIFY_HTML_PATH = path.join(ROOT_DIR, 'index.html');
const ARCHIVE_CSS_PATH = path.join(ROOT_DIR, 'archive.css');

const ARTWORKS_JSON = path.join(ROOT_DIR, 'artworks.json');
const PENDING_ORDERS_JSON = path.join(ROOT_DIR, 'pending-orders.json');
const RECORDS_SOURCE_JSON = path.join(ROOT_DIR, 'records-source.json');

const ARTWORKS_JSON = path.join(ROOT_DIR, 'artworks.json');
const PENDING_ORDERS_JSON = path.join(ROOT_DIR, 'pending-orders.json');
const RECORDS_SOURCE_JSON = path.join(ROOT_DIR, 'records-source.json');

app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true }));
app.use(express.static(ROOT_DIR));

app.use('/images', express.static(IMAGES_DIR));
app.use('/records', express.static(RECORDS_DIR));
app.use('/assets', express.static(ASSETS_DIR));

function ensureDir(dirPath) {
  if (!fs.existsSync(dirPath)) {
    fs.mkdirSync(dirPath, { recursive: true });
  }
}

function readJsonSafe(filePath, fallback) {
  try {
    if (!fs.existsSync(filePath)) return fallback;
    const raw = fs.readFileSync(filePath, 'utf8');
    return JSON.parse(raw);
  } catch (error) {
    console.error(`Failed to read JSON: ${filePath}`, error);
    return fallback;
  }
}

function writeJsonPretty(filePath, data) {
  fs.writeFileSync(filePath, JSON.stringify(data, null, 2) + '\n', 'utf8');
}

function escapeHtml(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function normalizeArtworkCode(value) {
  return String(value || '').trim().toUpperCase();
}

function normalizeSize(value) {
  const size = String(value || '').trim().toUpperCase();
  if (!['S', 'M', 'L'].includes(size)) {
    throw new Error(`Invalid size: ${value}`);
  }
  return size;
}

function inferEditionTotal(size) {
  if (size === 'S') return 50;
  if (size === 'M') return 30;
  if (size === 'L') return 10;
  return 0;
}

function formatEditionDisplay(editionNumber, editionTotal) {
  const padded = String(editionNumber).padStart(2, '0');
  return `Edition ${padded} / ${editionTotal}`;
}

function formatArtworkId(artworkCode, size, editionNumber) {
  return `GLA-${artworkCode}-${size}-${String(editionNumber).padStart(3, '0')}`;
}

function todayDisplay() {
  return new Date().toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'long',
    day: 'numeric'
  });
}

function safeArray(value) {
  return Array.isArray(value) ? value : [];
}

function getAllRecords() {
  ensureDir(RECORDS_DIR);

  const entries = fs.readdirSync(RECORDS_DIR, { withFileTypes: true });
  const records = [];

  for (const entry of entries) {
    if (!entry.isDirectory()) continue;

    const slug = entry.name;
    const dataPath = path.join(RECORDS_DIR, slug, 'data.json');
    if (!fs.existsSync(dataPath)) continue;

    const data = readJsonSafe(dataPath, null);
    if (!data) continue;

    records.push({
      slug,
      ...data
    });
  }

  records.sort((a, b) => {
    const aDate = new Date(a.archiveDate || 0).getTime();
    const bDate = new Date(b.archiveDate || 0).getTime();
    return bDate - aDate;
  });

  return records;
}

function getNextEditionNumber(artworkCode, size) {
  const records = getAllRecords();
  const sameSeries = records.filter((record) => {
    return (
      normalizeArtworkCode(record.artworkCode) === artworkCode &&
      String(record.size || '').toUpperCase().includes(`(${size})`) === false &&
      String(record.publicSlug || '').includes(`-${artworkCode}-${size}-`)
    ) || (
      normalizeArtworkCode(record.artworkCode) === artworkCode &&
      String(record.sizeCode || '').toUpperCase() === size
    );
  });

  let maxEdition = 0;

  for (const record of sameSeries) {
    const publicSlug = String(record.publicSlug || '');
    const match = publicSlug.match(new RegExp(`^GLA-${artworkCode}-${size}-(\\d{3})$`));
    if (match) {
      const num = Number(match[1]);
      if (num > maxEdition) maxEdition = num;
      continue;
    }

    const artworkId = String(record.artworkId || '');
    const match2 = artworkId.match(new RegExp(`^GLA-${artworkCode}-${size}-(\\d{3})$`));
    if (match2) {
      const num = Number(match2[1]);
      if (num > maxEdition) maxEdition = num;
    }
  }

  return maxEdition + 1;
}

function buildRecordFromOrder(order) {
  const artworkCode = normalizeArtworkCode(
    order.artworkCode || order.code || order.sku || order.handleCode
  );

  if (!artworkCode) {
    throw new Error('Missing artworkCode');
  }

  const sizeCode = normalizeSize(order.size);
  const editionTotal = Number(order.editionTotal) || inferEditionTotal(sizeCode);
  const editionNumber = getNextEditionNumber(artworkCode, sizeCode);

  if (editionTotal > 0 && editionNumber > editionTotal) {
    throw new Error(`Edition limit reached for ${artworkCode} ${sizeCode}`);
  }

  const publicSlug = formatArtworkId(artworkCode, sizeCode, editionNumber);
  const publicId = generatePublicId({
    brand: 'GLA',
    artworkCode,
    size: sizeCode,
    edition: editionNumber
  });

  const sizeLabelMap = {
    S: '16 × 20 in (S)',
    M: '20 × 25 in (M)',
    L: '24 × 30 in (L)'
  };

  const frame = order.frame || 'Black';
  const title = order.title || artworkCode;
  const image = order.image || `${artworkCode}.jpg`;

  return {
    verified: 'Artwork Verified',
    title,
    artworkId: publicSlug,
    edition: formatEditionDisplay(editionNumber, editionTotal),
    artist: 'GLAMOPH',
    medium: order.medium || 'Archival pigment print on fine art paper',
    size: order.sizeLabel || sizeLabelMap[sizeCode] || sizeCode,
    sizeCode,
    frame,
    archiveDate: order.archiveDate || todayDisplay(),
    archiveUrl: order.archiveUrl || `verify.glamoph.com/${publicSlug}`,
    image,
    signature: order.signature || 'signature.png',
    artworkCode,
    publicId,
    publicSlug,
    orderId: order.orderId || order.id || '',
    lineItemId: order.lineItemId || '',
    customerEmail: order.customerEmail || '',
    sourceTitle: order.sourceTitle || '',
    editionNumber,
    editionTotal
  };
}

function persistRecord(record) {
  const recordDir = path.join(RECORDS_DIR, record.publicSlug);
  ensureDir(recordDir);

  const dataPath = path.join(recordDir, 'data.json');
  writeJsonPretty(dataPath, record);

  const recordsSource = safeArray(readJsonSafe(RECORDS_SOURCE_JSON, []));
  const existingIndex = recordsSource.findIndex((item) => item.publicSlug === record.publicSlug);

  const sourceEntry = {
    publicSlug: record.publicSlug,
    publicId: record.publicId,
    artworkId: record.artworkId,
    artworkCode: record.artworkCode,
    title: record.title,
    size: record.size,
    sizeCode: record.sizeCode,
    edition: record.edition,
    editionNumber: record.editionNumber,
    editionTotal: record.editionTotal,
    archiveDate: record.archiveDate,
    archiveUrl: record.archiveUrl,
    image: record.image,
    orderId: record.orderId,
    lineItemId: record.lineItemId,
    customerEmail: record.customerEmail
  };

  if (existingIndex >= 0) {
    recordsSource[existingIndex] = sourceEntry;
  } else {
    recordsSource.unshift(sourceEntry);
  }

  writeJsonPretty(RECORDS_SOURCE_JSON, recordsSource);
}

function removePendingOrderById(orderId) {
  if (!orderId) return;

  const pending = safeArray(readJsonSafe(PENDING_ORDERS_JSON, []));
  const next = pending.filter((item) => String(item.orderId || item.id || '') !== String(orderId));
  writeJsonPretty(PENDING_ORDERS_JSON, next);
}

function renderAdminPage() {
  const pendingOrders = safeArray(readJsonSafe(PENDING_ORDERS_JSON, []));
  const records = getAllRecords().slice(0, 50);

  const pendingRows = pendingOrders.length
    ? pendingOrders.map((order, index) => {
        const artworkCode = escapeHtml(order.artworkCode || '');
        const title = escapeHtml(order.title || '—');
        const size = escapeHtml(order.size || '—');
        const frame = escapeHtml(order.frame || 'Black');
        const orderId = escapeHtml(order.orderId || order.id || `pending-${index}`);
        const customerEmail = escapeHtml(order.customerEmail || '—');

        return `
          <tr>
            <td>${orderId}</td>
            <td>${artworkCode}</td>
            <td>${title}</td>
            <td>${size}</td>
            <td>${frame}</td>
            <td>${customerEmail}</td>
            <td>
              <form method="post" action="/admin/generate">
                <input type="hidden" name="orderId" value="${orderId}">
                <button type="submit">Generate</button>
              </form>
            </td>
          </tr>
        `;
      }).join('')
    : `
      <tr>
        <td colspan="7" class="empty">No pending orders</td>
      </tr>
    `;

  const recordRows = records.length
    ? records.map((record) => {
        const slug = escapeHtml(record.publicSlug || '');
        const title = escapeHtml(record.title || '—');
        const size = escapeHtml(record.size || '—');
        const edition = escapeHtml(record.edition || '—');

        return `
          <tr>
            <td>${slug}</td>
            <td>${title}</td>
            <td>${size}</td>
            <td>${edition}</td>
            <td><a href="/${slug}" target="_blank" rel="noopener noreferrer">Open</a></td>
          </tr>
        `;
      }).join('')
    : `
      <tr>
        <td colspan="5" class="empty">No records yet</td>
      </tr>
    `;

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>GLAMOPH CMS</title>
  <style>
    :root {
      --bg: #f4f1ea;
      --paper: #ffffff;
      --ink: #111111;
      --muted: #6c675f;
      --line: rgba(17,17,17,0.08);
    }

    * { box-sizing: border-box; }
    body {
      margin: 0;
      background: var(--bg);
      color: var(--ink);
      font-family: -apple-system, BlinkMacSystemFont, "Helvetica Neue", Helvetica, Arial, sans-serif;
    }

    .shell {
      max-width: 1320px;
      margin: 0 auto;
      padding: 32px 20px 48px;
    }

    .header {
      display: flex;
      justify-content: space-between;
      align-items: end;
      gap: 16px;
      margin-bottom: 28px;
    }

    .title {
      margin: 0;
      font-family: "Cormorant Garamond", Georgia, serif;
      font-size: 48px;
      font-weight: 400;
      line-height: 0.95;
      letter-spacing: 0.01em;
    }

    .sub {
      margin: 10px 0 0;
      color: var(--muted);
      font-size: 13px;
      letter-spacing: 0.04em;
      text-transform: uppercase;
    }

    .grid {
      display: grid;
      grid-template-columns: 1fr;
      gap: 20px;
    }

    .card {
      background: var(--paper);
      border: 1px solid var(--line);
      border-radius: 20px;
      overflow: hidden;
    }

    .card-head {
      display: flex;
      justify-content: space-between;
      align-items: center;
      gap: 16px;
      padding: 18px 20px;
      border-bottom: 1px solid var(--line);
    }

    .card-title {
      margin: 0;
      font-size: 13px;
      letter-spacing: 0.08em;
      text-transform: uppercase;
      color: var(--muted);
      font-weight: 600;
    }

    .table-wrap {
      overflow-x: auto;
    }

    table {
      width: 100%;
      border-collapse: collapse;
    }

    th, td {
      text-align: left;
      padding: 14px 20px;
      border-bottom: 1px solid var(--line);
      font-size: 14px;
      vertical-align: middle;
    }

    th {
      color: var(--muted);
      font-size: 12px;
      letter-spacing: 0.06em;
      text-transform: uppercase;
      font-weight: 600;
      background: rgba(0,0,0,0.015);
    }

    tr:last-child td {
      border-bottom: 0;
    }

    .empty {
      color: var(--muted);
    }

    button, .btn {
      appearance: none;
      border: 1px solid rgba(17,17,17,0.12);
      background: #fff;
      color: #111;
      height: 38px;
      padding: 0 14px;
      border-radius: 999px;
      font-size: 13px;
      cursor: pointer;
      text-decoration: none;
      display: inline-flex;
      align-items: center;
      justify-content: center;
    }

    button:hover, .btn:hover, a:hover {
      opacity: 0.75;
    }

    .toolbar {
      display: flex;
      gap: 10px;
      flex-wrap: wrap;
    }

    .footer-note {
      margin-top: 12px;
      color: var(--muted);
      font-size: 12px;
    }

    a {
      color: inherit;
    }
  </style>
</head>
<body>
  <main class="shell">
    <header class="header">
      <div>
        <h1 class="title">GLAMOPH CMS</h1>
        <p class="sub">Archive issuance console</p>
      </div>
      <div class="toolbar">
        <a class="btn" href="/api/bootstrap" target="_blank" rel="noopener noreferrer">Bootstrap</a>
        <a class="btn" href="/" target="_blank" rel="noopener noreferrer">Root</a>
      </div>
    </header>

    <div class="grid">
      <section class="card">
        <div class="card-head">
          <h2 class="card-title">Pending Orders</h2>
          <div>${pendingOrders.length} items</div>
        </div>
        <div class="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Order</th>
                <th>Code</th>
                <th>Title</th>
                <th>Size</th>
                <th>Frame</th>
                <th>Email</th>
                <th>Action</th>
              </tr>
            </thead>
            <tbody>
              ${pendingRows}
            </tbody>
          </table>
        </div>
      </section>

      <section class="card">
        <div class="card-head">
          <h2 class="card-title">Issued Records</h2>
          <div>${records.length} recent</div>
        </div>
        <div class="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Slug</th>
                <th>Title</th>
                <th>Size</th>
                <th>Edition</th>
                <th>Verify</th>
              </tr>
            </thead>
            <tbody>
              ${recordRows}
            </tbody>
          </table>
        </div>
      </section>
    </div>

    <p class="footer-note">Records are written to /records/{slug}/data.json</p>
  </main>
</body>
</html>`;
}

app.get('/admin', (req, res) => {
  res.send(renderAdminPage());
});

app.post('/admin/generate', (req, res) => {
  try {
    const requestedOrderId = String(req.body.orderId || '').trim();
    const pendingOrders = safeArray(readJsonSafe(PENDING_ORDERS_JSON, []));
    const order = pendingOrders.find((item) => String(item.orderId || item.id || '') === requestedOrderId);

    if (!order) {
      return res.status(404).send('Pending order not found');
    }

    const record = buildRecordFromOrder(order);
    persistRecord(record);
    removePendingOrderById(requestedOrderId);

    return res.redirect(`/admin`);
  } catch (error) {
    console.error(error);
    return res.status(500).send(`Generate failed: ${error.message}`);
  }
});

app.get('/api/bootstrap', (req, res) => {
  res.json({
    ok: true,
    rootDir: ROOT_DIR,
    recordsDir: RECORDS_DIR,
    imagesDir: IMAGES_DIR,
    artworks: safeArray(readJsonSafe(ARTWORKS_JSON, [])),
    pendingOrders: safeArray(readJsonSafe(PENDING_ORDERS_JSON, [])),
    recordsSource: safeArray(readJsonSafe(RECORDS_SOURCE_JSON, []))
  });
});

app.get('/api/pending-orders', (req, res) => {
  res.json({
    ok: true,
    items: safeArray(readJsonSafe(PENDING_ORDERS_JSON, []))
  });
});

app.get('/api/records', (req, res) => {
  res.json({
    ok: true,
    items: getAllRecords()
  });
});

app.get('/api/record/:slug', (req, res) => {
  const slug = String(req.params.slug || '').trim();
  const dataPath = path.join(RECORDS_DIR, slug, 'data.json');

  if (!fs.existsSync(dataPath)) {
    return res.status(404).json({ ok: false, error: 'Record not found' });
  }

  return res.json({
    ok: true,
    item: readJsonSafe(dataPath, null)
  });
});

app.get('/', (req, res) => {
  res.redirect('/admin');
});

app.get('/:slug', (req, res, next) => {
  const slug = String(req.params.slug || '').trim();

  if (!/^GLA-[A-Z0-9-]+$/i.test(slug)) {
    return next();
  }

  const recordPath = path.join(RECORDS_DIR, slug, 'data.json');

  if (!fs.existsSync(recordPath)) {
    return res.status(404).send('Record Not Found');
  }

  if (!fs.existsSync(VERIFY_HTML_PATH)) {
    return res.status(500).send('index.html not found');
  }

  return res.sendFile(VERIFY_HTML_PATH);
});