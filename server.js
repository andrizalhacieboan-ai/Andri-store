const http = require('http');
const fs = require('fs');
const path = require('path');

const port = process.env.PORT || 3000;
const publicDir = path.join(__dirname, 'public');
const indexPath = path.join(__dirname, 'index.html');
const docsUrl = process.env.DOCS_URL || process.env.PAKASIR_DOCS_URL || 'https://pakasir.com/p/docs';
const signupUrl = process.env.SIGNUP_URL || process.env.PAKASIR_SIGNUP_URL || 'https://app.pakasir.com';

const baseApiUrl = process.env.PAKASIR_BASE_API_URL || 'https://app.pakasir.com';

const mimeTypes = {
  '.css': 'text/css; charset=utf-8',
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.svg': 'image/svg+xml',
  '.webp': 'image/webp'
};

const paymentMethods = {
  all: { label: 'Semua Metode', fee: () => 0 },
  qris: {
    label: 'QRIS',
    fee: (amount) => amount > 105000 ? Math.round(0.01 * amount) : Math.round(0.007 * amount + 310),
    qrisOnly: true
  },
  paypal: { label: 'PayPal', minAmount: 10000, fee: (amount) => Math.max(Math.round(0.01 * amount), 3000), path: 'paypal' },
  cimb_niaga_va: { label: 'CIMB Niaga VA', fee: () => 3500 },
  bni_va: { label: 'BNI VA', fee: () => 3500 },
  sampoerna_va: { label: 'Sampoerna VA', fee: () => 2000 },
  bnc_va: { label: 'BNC VA', fee: () => 3500 },
  maybank_va: { label: 'Maybank VA', fee: () => 3500 },
  permata_va: { label: 'Permata VA', fee: () => 3500 },
  atm_bersama_va: { label: 'ATM Bersama VA', fee: () => 3500 },
  artha_graha_va: { label: 'Artha Graha VA', fee: () => 2000 },
  bri_va: { label: 'BRI VA', fee: () => 3500 }
};

function sendJson(res, statusCode, payload) {
  res.writeHead(statusCode, { 'Content-Type': 'application/json; charset=utf-8' });
  res.end(JSON.stringify(payload));
}

function redirect(res, targetUrl, headOnly = false) {
  res.writeHead(302, { Location: targetUrl });
  res.end(headOnly ? undefined : `Redirecting to ${targetUrl}`);
}

function sendFile(res, filePath, statusCode = 200, headOnly = false) {
  fs.readFile(filePath, (error, content) => {
    if (error) {
      sendJson(res, 500, { error: 'File tidak dapat dibaca.' });
      return;
    }

    const ext = path.extname(filePath).toLowerCase();
    res.writeHead(statusCode, {
      'Content-Type': mimeTypes[ext] || 'application/octet-stream',
      'Cache-Control': ext === '.html' ? 'no-cache' : 'public, max-age=86400'
    });
    res.end(headOnly ? undefined : content);
  });
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    let body = '';

    req.on('data', (chunk) => {
      body += chunk;

      if (body.length > 1_000_000) {
        req.destroy();
        reject(new Error('Payload terlalu besar.'));
      }
    });

    req.on('end', () => {
      if (!body) {
        resolve({});
        return;
      }

      try {
        resolve(JSON.parse(body));
      } catch (_error) {
        reject(new Error('Body harus berupa JSON valid.'));
      }
    });
  });
}

function sanitizeUrlSafe(value) {
  return String(value || '')
    .trim()
    .replace(/\s+/g, '-')
    .replace(/[^a-zA-Z0-9_.-]/g, '')
    .slice(0, 100);
}

function normalizeAmount(value) {
  const normalized = String(value || '').replace(/[^0-9]/g, '');
  return normalized ? Number(normalized) : 0;
}

function formatPaymentMethodOptions() {
  return Object.entries(paymentMethods).map(([value, method]) => ({
    value,
    label: method.label,
    minAmount: method.minAmount || 500
  }));
}

function buildPaymentUrl({ slug, amount, orderId, method = 'all', redirectUrl, redirect, qrisOnly }) {
  if (!slug || !amount || !orderId) {
    return { error: 'slug, amount, dan orderId wajib diisi.' };
  }

  const safeOrderId = sanitizeUrlSafe(orderId);
  const normalizedAmount = normalizeAmount(amount);
  const selectedMethod = qrisOnly ? 'qris' : method;
  const methodConfig = paymentMethods[selectedMethod];

  if (!safeOrderId || safeOrderId.length < 5) {
    return { error: 'Order ID minimal 5 karakter dan hanya boleh berisi huruf, angka, titik, strip, atau underscore.' };
  }

  if (!normalizedAmount) {
    return { error: 'amount harus berupa nominal angka tanpa titik atau spasi.' };
  }

  if (!methodConfig) {
    return {
      error: 'Metode pembayaran tidak valid.',
      allowedMethods: formatPaymentMethodOptions()
    };
  }

  const minAmount = methodConfig.minAmount || 500;
  if (normalizedAmount < minAmount) {
    return { error: `Amount untuk ${methodConfig.label} minimal Rp${minAmount.toLocaleString('id-ID')}.` };
  }

  const safeSlug = encodeURIComponent(String(slug).trim());
  const redirectTarget = redirectUrl || redirect || null;
  const pathName = methodConfig.path === 'paypal' ? 'paypal' : 'pay';
  const paymentUrl = new URL(`${baseApiUrl}/${pathName}/${safeSlug}/${normalizedAmount}`);
  const fee = methodConfig.fee(normalizedAmount);
  const expiredAt = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();

  paymentUrl.searchParams.set('order_id', safeOrderId);
  paymentUrl.searchParams.set('redirect', redirectTarget);

  if (methodConfig.qrisOnly) {
    paymentUrl.searchParams.set('qris_only', '1');
  }

  if (!['all', 'qris', 'paypal'].includes(selectedMethod)) {
    paymentUrl.searchParams.set('payment_method', selectedMethod);
  }

  return {
    project: String(slug).trim(),
    order_id: safeOrderId,
    amount: normalizedAmount,
    fee,
    status: 'pending',
    total_payment: normalizedAmount + fee,
    payment_method: selectedMethod,
    payment_method_label: methodConfig.label,
    payment_number: null,
    payment_url: paymentUrl.toString(),
    paymentUrl: paymentUrl.toString(),
    redirect_url: redirectTarget,
    expired_at: expiredAt,
    completed_at: null,
    docs: docsUrl
  };
}

async function requestHandler(req, res) {
  const url = new URL(req.url, `http://${req.headers.host}`);

  if ((req.method === 'GET' || req.method === 'HEAD') && url.pathname === '/') {
    sendFile(res, indexPath, 200, req.method === 'HEAD');
    return;
  }

  if ((req.method === 'GET' || req.method === 'HEAD') && url.pathname === '/docs') {
    redirect(res, docsUrl, req.method === 'HEAD');
    return;
  }

  if ((req.method === 'GET' || req.method === 'HEAD') && url.pathname === '/daftar') {
    redirect(res, signupUrl, req.method === 'HEAD');
    return;
  }

  if ((req.method === 'GET' || req.method === 'HEAD') && url.pathname === '/api/health') {
    sendJson(res, 200, {
      status: 'ok',
      service: 'Pakasir agent landing page',
      docsUrl,
      signupUrl,
      paymentMethods: formatPaymentMethodOptions()
    });
    return;
  }

  if ((req.method === 'GET' || req.method === 'HEAD') && url.pathname === '/api/payment-methods') {
    sendJson(res, 200, { paymentMethods: formatPaymentMethodOptions() });
    return;
  }

  if (req.method === 'POST' && url.pathname === '/api/payment-url') {
    try {
      const body = await readBody(req);
      const result = buildPaymentUrl(body);

      if (result.error) {
        sendJson(res, 400, result);
        return;
      }

      sendJson(res, 200, result);
    } catch (error) {
      sendJson(res, 400, { error: error.message });
    }
    return;
  }

  if ((req.method === 'GET' || req.method === 'HEAD') && url.pathname.startsWith('/public/')) {
    const requestedPath = path.normalize(decodeURIComponent(url.pathname.replace('/public/', '')));
    const filePath = path.join(publicDir, requestedPath);

    if (!filePath.startsWith(publicDir)) {
      sendJson(res, 403, { error: 'Akses file ditolak.' });
      return;
    }

    fs.stat(filePath, (error, stats) => {
      if (error || !stats.isFile()) {
        sendFile(res, indexPath, 404, req.method === 'HEAD');
        return;
      }

      sendFile(res, filePath, 200, req.method === 'HEAD');
    });
    return;
  }

  if (req.method === 'GET' || req.method === 'HEAD') {
    sendFile(res, indexPath, 404, req.method === 'HEAD');
    return;
  }

  sendJson(res, 405, { error: 'Method tidak didukung.' });
}

if (require.main === module) {
  const server = http.createServer(requestHandler);

  server.listen(port, () => {
    console.log(`Pakasir landing page running on http://localhost:${port}`);
  });
}

module.exports = requestHandler;
