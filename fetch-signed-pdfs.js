const crypto = require('crypto');
const rp = require('request-promise-native');
const fs = require('fs');
const qs = require('qs');
const allLoans = require('./loan.js');
const stripchar = require('stripchar').StripChar;

// prod
const HOST_ADDRESS = 'https://sign.visma.net/';
const API_SECRET = 'IrdkCRXYwMMDO7rAmF5GM/dOFC3hitpEOF9t6R96I4k=';
const API_IDENTIFIER = '3d206473-123c-4a0b-b952-77cb0be1a65e';

/**
 * Hash body.
 *
 * @param      {<type>}  body    The body
 * @return     {<type>}  { description_of_the_return_value }
 */
const hashableBody = (body) => {
  if (typeof body === 'string' || body instanceof Buffer) {
    return body;
  }

  return JSON.stringify(body);
};

function buildURI(uri, params, returnObj = false) {
  if (!params) {
    return uri;
  }

  const paramString = qs.stringify(params || {});

  if (paramString.length < 1) {
    return uri;
  }

  const separator = uri.includes('?') ? '&' : '?';

  return uri + separator + paramString;
}

/**
 * Request HTTP for Visma Sign
 *
 * @param      {<type>}  baseUrl     The base url
 * @param      {<type>}  identifier  The identifier
 * @param      {<type>}  secret      The secret
 * @return     {<type>}  { description_of_the_return_value }
 */
const request = (baseUrl, identifier, secret) => (options) => {
  const date = new Date().toUTCString();
  const body = hashableBody(options.body || '');
  const contentMd5 = crypto.createHash('md5').update(body).digest('base64');

  const contentType = 'application/pdf';
  const method = 'GET';
  const macUri = buildURI(options.uri, options.qs);

  const macString = [method, contentMd5, contentType, date, macUri].join('\n');
  const mac = crypto
    .createHmac('sha512', secret)
    .update(macString)
    .digest('base64');

  const authorization = `Onnistuu ${identifier}:${mac}`;

  console.log('authorization', authorization);
  console.log('options', options);
  return rp(
    Object.assign({}, options, {
      baseUrl: baseUrl,
      body: body,
      encoding: null,
      resolveWithFullResponse: true,
      followRedirect: false,
      headers: Object.assign({}, options.headers || {}, {
        Date: date,
        'Content-MD5': contentMd5,
        'Content-Type': contentType,
        Authorization: authorization,
      }),
    })
  );
};

const secret = Buffer.from(API_SECRET, 'base64');
const requestFunc = request(HOST_ADDRESS, API_IDENTIFIER, secret);

async function getPdfDocument(documentId) {
  try {
    const res = await requestFunc({
      uri: `/api/v1/document/${documentId}/files/0`,
    });
    return res.body;
  } catch (e) {
    console.log(`failed to fetch pdf for doc ${documentId}: ${e}`)
    return "";
  }
}

async function fetchAllSignedPdfs (loans) {
  for (const loan of loans) {
    const pdfDocument = await getPdfDocument(loan.vismaDocumentId);
    fs.writeFileSync(`signed-contracts/${stripchar.RSExceptUnsAlpNum(loan.companyName)}--${loan.id}.pdf`, pdfDocument)
  }
}

const chunks = function(array, size) {
  var results = [];
  while (array.length) {
    results.push(array.splice(0, size));
  }
  return results;
};

chunks(allLoans, 10)
  .forEach(loans => fetchAllSignedPdfs(loans))
