const crypto = require('crypto');
const rp = require('request-promise-native');
const fs = require('fs');
const qs = require('qs');

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

  const contentType =
    (options.headers && options.headers['Content-Type']) || 'application/json';
  const method = options.method || 'GET';
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
const requestFunc = request('https://sign.visma.net/', API_IDENTIFIER, secret);

async function getAllAuthMethods() {
  // get all authentication methods
  const authMethodRes = await requestFunc({
    uri: `/api/v1/auth/methods?includeAllIdProviders=true`,
  });

  console.log('Got all authentication methods', authMethodRes.body);
}

async function run(options) {
  // create document
  const docRes = await requestFunc({
    method: 'POST',
    uri: '/api/v1/document/',
    body: {
      document: {
        name: 'CrediNord-Nordea Bank Abp',
      },
    },
  });

  const docId = docRes.headers.location.split('/').pop();

  console.log('Created doc', docId);

  // add pdf file to doc
  const fileBuffer = fs.readFileSync('empty-pdf.pdf');
  const addFileRes = await requestFunc({
    method: 'POST',
    uri: `/api/v1/document/${docId}/files`,
    body: fileBuffer,
    headers: {
      'Content-Type': 'application/pdf',
    },
    qs: {
      filename: `${docId}.pdf`,
    },
  });

  console.log('Added file to doc', addFileRes.body);

  // Add inviter to doc
  const addInvitationsRes = await requestFunc({
    method: 'POST',
    uri: `/api/v1/document/${docId}/invitations`,
    body: [
      {
        inviter: {
          name: 'CrediNord',
          email: 'nghia.nguyen@credinord.fi',
          language: options.lang,
        },
        messages: {
          send_invitation_email: true,
          send_invitation_sms: true,
          separate_invite_parts: true,
          attachment_allowed: false,
        },
      },
    ],
  });

  console.log('Add inviter to doc', addInvitationsRes.body);
  // addInvitationsRes.body example
  // [
  //   {
  //     "uuid": "fa787775-8ce0-4dde-8515-e8eab5ffbed2",
  //     "status": "sending",
  //     "passphrase": "z9hUw8ny"
  //   }
  // ]

  const invitationId = JSON.parse(addInvitationsRes.body)[0].uuid;

  // fulfill the invitation
  const fulfillInvitationRes = await requestFunc({
    method: 'POST',
    uri: `/api/v1/invitation/${invitationId}/signature`,
    body: {
      returnUrl: 'https://www.zuanoc.com',
      identifier: options.identifier,
      authService: options.authService,
      identifierType: options.identifierType,
    },
  });

  const fulfillUrl = fulfillInvitationRes.headers.location;
  console.log('Got invitation fulfill url', fulfillUrl);

  await getInvitationStatus(invitationId);
}

async function getInvitationStatus(invitationId) {
  // Getting visma invitation status
  const invitationStatusRes = await requestFunc({
    uri: `/api/v1/invitation/${invitationId}`,
  });

  console.log('Got invitation status', invitationStatusRes.body);
}

const options = {
  lang: 'fi',
  identifier: '091086-299P',
  authService: 'tupas-nordea',
  identifierType: 'Finland_SSN',
};

// const options = {
//   lang: 'da',
//   identifier: 'YOUR-DANISH-SOCIAL-NUMBER',
//   authService: 'openidconnect-nets-nemid',
//   identifierType: 'Denmark_PID',
// };


// - Step 1
// getAllAuthMethods();

// - Step 2
run(options);

// - Step 3
// should be run after the authentication is done via the signing url created in the step 2
// getInvitationStatus('6976fb50-e538-4e0d-85c2-59dad0d1652a')
