#!/usr/bin/env node
'use strict';
/**
 * shop-tools — the kit's local tool server for Etsy operations.
 *
 * These are the checks and scores the agent would otherwise have to hold in its head. They
 * are deterministic on purpose: a rule enforced by a function cannot drift, be forgotten, or
 * be argued away by a model having a bad day, and its failures are testable.
 *
 *   listing_validate  check a draft against Etsy's ACTUAL limits and return the fixes
 *   support_triage    classify a customer message, decide escalate-vs-reply, draft a reply
 *   research_rank     rank candidate products by observable selling evidence
 *
 * Zero dependencies. stdout is the JSON-RPC wire; nothing here may print to it.
 *
 * Etsy rules encoded below are the ones Etsy itself publishes (Help Center, Seller Handbook,
 * and the Search/Ranking Disclosures). Quality advice that is NOT Etsy policy is returned as
 * a `warning` or an `opportunity`, never as a violation — we do not invent platform rules.
 */

const path = require('path');

// Load the kit's keys into the environment when this server is started directly (opencode only
// sees config/keys.env if the launcher put it there). Real environment values win; a missing file
// is not an error. This is the fix for a server that works only when launched one particular way.
try {
  const { kitEnv } = require(path.resolve(__dirname, '..', '..', 'lib', 'env.js'));
  const merged = kitEnv(path.resolve(__dirname, '..', '..', 'config', 'keys.env'));
  for (const [k, v] of Object.entries(merged)) if (process.env[k] === undefined) process.env[k] = v;
} catch { /* standalone: rely on the ambient environment */ }

// ── listing limits ──────────────────────────────────────────────────────────────
// Source: Etsy Help Center + Seller Handbook. These are hard platform limits.
const MAX_TITLE_CHARS = 140;
const TITLE_SINGLE_USE = ['%', ':', '&'];        // each may appear at most once
const TITLE_FORBIDDEN = ['$', '^', '`', '°'];
const MAX_CAPS_WORDS = 3;                        // no more than 3 fully-capitalised words
const TAGS_MAX = 13;
const TAG_MAX_CHARS = 20;
const TAG_ALLOWED = /^[A-Za-z0-9\-' _]+$/;       // letters, numbers, hyphen, apostrophe, space, underscore
const VISIBLE_TITLE_CHARS = 60;                  // only the first ~60 chars show in search

// Words that add no search value on their own.
const STOPWORDS = new Set(['a', 'an', 'the', 'and', 'or', 'for', 'with', 'of', 'to', 'in', 'on', 'pack', 'set', 'by', 'your', 'my']);
// Etsy's own guidance: avoid subjective fluff.
const FLUFF = /\b(beautiful|amazing|stunning|gorgeous|perfect|wonderful|luxurious|unique|best|awesome|lovely|cute)\b/i;

function words(s) {
  return String(s || '').toLowerCase().match(/[a-z0-9']+/g) || [];
}
function meaningful(s) {
  return words(s).filter((w) => w.length > 2 && !STOPWORDS.has(w));
}
function capsWords(s) {
  return String(s || '').split(/\s+/).filter((w) => /^[A-Z][A-Z0-9]+$/.test(w)).length;
}

function validateListing(input) {
  const title = String(input.title || '').trim();
  const tags = Array.isArray(input.tags) ? input.tags.map((t) => String(t).trim()) : [];
  const description = String(input.description || '').trim();
  const attributes = input.attributes && typeof input.attributes === 'object' ? input.attributes : {};

  const violations = [];   // Etsy will reject or the listing cannot work
  const warnings = [];     // our quality advice
  const opportunities = []; // where points are being left on the table
  const v = (code, detail, fix) => violations.push({ code, detail, fix });
  const w = (code, detail, fix) => warnings.push({ code, detail, fix });

  // ── title ─────────────────────────────────────────────────────────────────────
  if (!title) {
    v('TITLE_MISSING', 'There is no title.', 'Name the item, then its decisive traits, in a phrase a buyer would type.');
  } else {
    if (title.length > MAX_TITLE_CHARS) {
      v('TITLE_TOO_LONG', `Title is ${title.length} characters (Etsy allows ${MAX_TITLE_CHARS}).`,
        'Cut it to the item plus its key traits. Only the first ~60 characters are visible in search, so trailing keywords are wasted anyway.');
    }
    if (!/^[A-Za-z0-9]/.test(title)) {
      v('TITLE_BAD_START', 'Title does not begin with a letter or number.',
        'Etsy requires the first character to be a letter or number.');
    }
    for (const ch of TITLE_FORBIDDEN) {
      if (title.includes(ch)) v('TITLE_FORBIDDEN_CHAR', `Title contains "${ch}", which Etsy forbids.`, `Remove "${ch}".`);
    }
    for (const ch of TITLE_SINGLE_USE) {
      const n = (title.split(ch).length - 1);
      if (n > 1) v('TITLE_CHAR_REPEAT', `"${ch}" appears ${n} times; Etsy allows it once.`, `Leave at most one "${ch}".`);
    }
    if (capsWords(title) > MAX_CAPS_WORDS) {
      v('TITLE_TOO_MANY_CAPS', `${capsWords(title)} fully-capitalised words (Etsy allows ${MAX_CAPS_WORDS}).`,
        'Use normal Title Case. A wall of capitals reads as shouting and can be filtered.');
    }
    if (FLUFF.test(title)) {
      w('TITLE_FLUFF', 'Title contains subjective fluff (beautiful/perfect/unique...).',
        'Etsy advises against it: it costs space and buys no search match. Replace it with a material, colour or size.');
    }
    const head = title.slice(0, VISIBLE_TITLE_CHARS).toLowerCase();
    const headMeaningful = meaningful(head);
    if (title.length > VISIBLE_TITLE_CHARS && headMeaningful.length < 3) {
      opportunities.push({ code: 'TITLE_FRONTLOAD', detail: 'The first visible ~60 characters are mostly filler.',
        fix: 'Front-load the exact phrase a buyer would search — words early in the title carry more weight.' });
    }
  }

  // ── tags ──────────────────────────────────────────────────────────────────────
  if (tags.length !== TAGS_MAX) {
    v('TAG_COUNT', `${tags.length} tags; Etsy allows ${TAGS_MAX}.`,
      `Use all ${TAGS_MAX}. Tags are matched as their own field — an empty slot is a query you can never appear for.`);
  }
  const longTags = tags.filter((t) => t.length > TAG_MAX_CHARS);
  if (longTags.length) {
    v('TAG_TOO_LONG', `Tag(s) over ${TAG_MAX_CHARS} characters: ${longTags.join(', ')}.`,
      `Etsy caps a tag at ${TAG_MAX_CHARS} characters. Shorten them.`);
  }
  const badCharTags = tags.filter((t) => t && !TAG_ALLOWED.test(t));
  if (badCharTags.length) {
    v('TAG_INVALID_CHARS', `Tag(s) with characters Etsy does not allow: ${badCharTags.join(', ')}.`,
      'Tags may use only letters, numbers, hyphens, apostrophes, spaces and underscores.');
  }
  const lower = tags.map((t) => t.toLowerCase());
  const dupes = lower.filter((t, i) => t && lower.indexOf(t) !== i);
  if (dupes.length) {
    v('TAG_DUPLICATE', `Repeated tag(s): ${[...new Set(dupes)].join(', ')}.`,
      'Etsy requires unique tags. Every repeat is a wasted slot — replace it with a different long-tail phrase.');
  }
  const pluralPairs = [];
  for (const t of lower) if (t.endsWith('s') && lower.includes(t.slice(0, -1))) pluralPairs.push(t);
  if (pluralPairs.length) {
    w('TAG_PLURAL', `Singular and plural both present: ${pluralPairs.join(', ')}.`,
      'Etsy matches root words and redirects plurals automatically — spend the slot on a synonym or a regional spelling instead.');
  }
  const oneWord = tags.filter((t) => meaningful(t).length <= 1 && t.length <= 8);
  if (oneWord.length) {
    w('TAG_GENERIC', `Short generic tag(s): ${oneWord.join(', ')}.`,
      'Single words face the most competition. Multi-word phrases ("walnut desk sign") match real buyer queries.');
  }

  // ── title/tag coverage ────────────────────────────────────────────────────────
  // Etsy's published position: tags are matched independently of the title, BUT a phrase in
  // BOTH is treated as more relevant. So this is an OPPORTUNITY, not a rule.
  const titleLower = title.toLowerCase();
  const notEchoed = tags.filter((t) => t && !titleLower.includes(t.toLowerCase()));
  if (tags.length >= 10 && notEchoed.length === tags.length) {
    opportunities.push({ code: 'TAG_NO_ECHO', detail: 'No tag appears anywhere in the title.',
      fix: 'Etsy gives a relevance bonus when a phrase is in both the title and a tag. Echo your single best phrase in both — the rest of the tags should cover queries the title cannot.' });
  }

  // ── description ───────────────────────────────────────────────────────────────
  if (!description) {
    v('DESCRIPTION_MISSING', 'The listing has no description.', 'Etsy requires a non-empty description.');
  } else if (description.length < 80) {
    v('DESCRIPTION_THIN', `Description is ${description.length} characters.`,
      'Say what is included, the format/size, and how it is delivered — in sentences a buyer would read.');
  }

  // ── attributes ────────────────────────────────────────────────────────────────
  if (!attributes.taxonomy_id) {
    v('ATTRIBUTE_TAXONOMY', 'No taxonomy_id.',
      'Etsy needs a taxonomy_id to create a listing — omitting it is a 400, not a default.');
  }
  if ((input.is_digital === true || attributes.who_made === undefined) && !attributes.who_made) {
    w('ATTRIBUTE_WHO_MADE', 'No who_made set.',
      'Etsy requires who_made, when_made and is_supply on every listing.');
  }

  const score = Math.max(0, 100 - violations.length * 15 - warnings.length * 4 - opportunities.length * 2);
  return {
    ok: violations.length === 0,
    score,
    violations,
    warnings,
    opportunities,
    stats: {
      title_chars: title.length,
      title_words: words(title).length,
      tags: tags.length,
      tags_not_echoed_in_title: notEchoed.length,
      description_chars: description.length,
    },
  };
}

// ── support triage ──────────────────────────────────────────────────────────────
// Deterministic so an escalation cannot be missed by a model in a hurry. The escalate list
// mirrors config/limits.json; anything matching goes to the owner, never an auto-reply.
const ESCALATE_PATTERNS = [
  [/\brefund\b/i, 'refund request'],
  [/\bcharge ?back\b/i, 'chargeback'],
  [/\b(lawyer|legal|attorney|sue|small claims)\b/i, 'legal'],
  [/\b(etsy|shopify|platform)\b.{0,30}\b(notice|warning|suspend|policy|removed|violation)\b/i, 'platform notice'],
  [/\b(damaged|broken|never arrived|not received|wrong item|missing)\b/i, 'order problem needing inspection'],
  [/\b(scam|fraud|report you|dispute)\b/i, 'fraud/abuse claim'],
];
const ANGRY = /\b(angry|furious|unacceptable|terrible|awful|disgusting|ridiculous)\b|!{2,}/i;

const CATEGORIES = [
  [/\b(where|when).{0,30}(order|arrive|ship|delivery|tracking)\b/i, 'shipping_status'],
  [/\b(refund|return|money back)\b/i, 'refund'],
  [/\b(download|file|link|access|can'?t open)\b/i, 'digital_access'],
  [/\b(siz|measur|dimension|fit|inch|cm)\b/i, 'sizing'],
  [/\b(custom|personal|name|colour|color|change)\b/i, 'customisation'],
  [/\b(thank|love|great|beautiful|amazing)\b/i, 'positive'],
  [/\b(question|how do|do you|can you)\b/i, 'question'],
];

function triageSupport(message, opts = {}) {
  const text = String(message || '');
  const escalate = [];
  for (const [re, why] of ESCALATE_PATTERNS) if (re.test(text)) escalate.push(why);
  if (ANGRY.test(text)) escalate.push('emotional tone — handle personally');

  let category = 'other';
  for (const [re, name] of CATEGORIES) if (re.test(text)) { category = name; break; }

  const shopVoice = opts.voice ? ` Match this voice: ${opts.voice}.` : '';
  const draft = escalate.length
    ? null
    : `Hi — thanks for reaching out about your ${category.replace(/_/g, ' ')}. `
      + `Here is what is happening: <the specific answer>. <What happens next, and when.> `
      + `If anything is unclear, reply here and I will sort it.${shopVoice}`;

  return {
    category,
    escalate_to_owner: escalate.length > 0,
    reasons: escalate,
    draft_reply: draft,
    note: escalate.length
      ? 'Do not auto-reply. This needs the owner: ' + escalate.join('; ') + '.'
      : 'Safe to send after filling in the specifics. Never promise a date you cannot keep.',
  };
}

// ── research ranking ────────────────────────────────────────────────────────────
// Etsy exposes NO sales endpoint, so the evidence arrives from a tool or a page. This ranks
// whatever evidence is given and is explicit that the numbers are estimates.
function rankResearch(candidates) {
  const list = Array.isArray(candidates) ? candidates : [];
  const scored = list.map((c) => {
    const sales = Number(c.sales) || 0;
    const ageMonths = Number(c.age_months) || 0;
    const reviews = Number(c.reviews) || 0;
    const price = Number(c.price) || 0;
    const sat = Number(c.competing_sellers) || 0;

    // Velocity is the signal the owner asked about: sales inside a short life.
    const velocity = ageMonths > 0 ? sales / ageMonths : 0;
    let score = 0;
    if (ageMonths > 0 && ageMonths <= 12 && sales >= 1000) score += 45;   // the stated bar
    score += Math.min(25, velocity / 40);
    score += Math.min(15, Math.log10(Math.max(1, reviews)) * 7);
    if (price >= 3 && price <= 40) score += 8;                           // impulse band
    if (sat > 0) score -= Math.min(12, sat * 0.4);                       // crowded = harder
    return {
      name: c.name || '(unnamed)', sales_est: sales, age_months: ageMonths,
      velocity_per_month: Math.round(velocity), reviews, price,
      score: Math.round(Math.max(0, Math.min(100, score))),
    };
  });
  scored.sort((a, b) => b.score - a.score);
  return {
    ranked: scored,
    note: 'Sales figures from research tools are estimates (~80% accurate, self-reported). '
      + 'Use them to rank, never to quote. A listing page\'s own "N sales" is the closest thing to ground truth.',
  };
}

// ── dispute / chargeback pre-screen ─────────────────────────────────────────────
// A "never received" claim is the most common chargeback, and the reply that wins it is the
// one that cites the carrier's own scan. This reads the tracking first and only then decides
// whether there is anything to defend — it never invents a delivery that did not happen.
const INR = /\b(never (arrived|received|got|came)|not (received|arrived)|didn'?t (receive|arrive|get)|no package|still waiting|where is my (order|package|parcel)|missing package|haven'?t (received|got))\b/i;
const THREAT = /\b(charge ?back|dispute|lawyer|legal|report you|scam|fraud|small claims)\b/i;

function normalizeStatus(tracking) {
  const s = String((tracking && (tracking.status || tracking.Status)) || '').toLowerCase();
  const cat = String((tracking && (tracking.status_category || tracking.StatusCategory)) || '').toLowerCase();
  const hay = s + ' ' + cat;
  if (/\bdelivered\b/.test(hay)) return 'delivered';
  if (/out for delivery|out_for_delivery/.test(hay)) return 'out_for_delivery';
  if (/in transit|in_transit|accepted|arrived at|departed|processed|shipping partner/.test(hay)) return 'in_transit';
  if (/pre-?shipment|pre_transit|label created|awaiting item|not yet in the system|electronic/.test(hay)) return 'pre_transit';
  if (/return|refused|undeliverable|no access/.test(hay)) return 'exception';
  if (/exception|delay|held|customs/.test(hay)) return 'exception';
  return 'unknown';
}

function daysSince(dateStr, now) {
  const t = Date.parse(dateStr);
  if (Number.isNaN(t)) return null;
  return Math.floor(((now || Date.now()) - t) / 86400000);
}

const CARRIER_CLAIM = {
  usps: 'USPS: file a Missing Mail search at usps.com/help/missing-mail. Domestic claims generally open 7 days after the mailing date (Priority Mail includes $100 insurance).',
  ups: 'UPS: file a claim at ups.com (Claims Support). The claim window is 60 days from the scheduled delivery for most services.',
  fedex: 'FedEx: file a claim at fedex.com (File a Claim). The window is generally 60 days from the ship date.',
  dhl: 'DHL: file a claim via the DHL eCommerce or Express claims portal; windows vary by service.',
  generic: 'Open the carrier claim in the carrier\'s own portal, using the tracking number and the delivery scan as evidence.',
};

function disputeGuard(args, opts = {}) {
  const message = String((args && args.message) || '');
  const order = (args && args.order) || {};
  const tracking = (args && args.tracking) || null;
  const now = opts.now || Date.now();

  const inrClaimed = INR.test(message);
  const threatens = THREAT.test(message);
  const status = normalizeStatus(tracking);
  const deliveredAt = tracking && (tracking.delivered_at || tracking.DeliveredDate || tracking.delivery_date);
  const signedBy = tracking && (tracking.signed_by || tracking.SignedBy || tracking.signedFor);
  const carrier = String(order.carrier || (tracking && tracking.carrier) || '').toLowerCase();
  const carrierKey = /usps/.test(carrier) ? 'usps' : /ups/.test(carrier) ? 'ups' : /fedex/.test(carrier) ? 'fedex' : /dhl/.test(carrier) ? 'dhl' : 'generic';

  const evidence = [];
  const next_steps = [];
  let determination, confidence, reasons = [];

  if (tracking) {
    if (order.tracking_number) evidence.push(`Tracking ${order.tracking_number}${order.carrier ? ' (' + order.carrier + ')' : ''}`);
    if (tracking.status) evidence.push(`Carrier status: ${tracking.status}`);
    if (deliveredAt) evidence.push(`Delivery scan: ${deliveredAt}`);
    if (signedBy) evidence.push(`Signed for by: ${signedBy}`);
    if (tracking.source) evidence.push(`Scan source: ${tracking.source}`);
  }

  if (threatens) {
    determination = 'escalate'; confidence = 'high';
    reasons.push('The buyer has raised a chargeback, dispute or legal action — this is the owner\'s call, not an auto-reply.');
  } else if (!tracking) {
    determination = 'escalate'; confidence = 'low';
    reasons.push('No carrier scan is available, so there is nothing to defend yet. Get the tracking status first.');
    next_steps.push('Fetch the tracking status, or paste it in, then run this again.');
  } else if (status === 'delivered') {
    determination = 'defend';
    const age = daysSince(deliveredAt, now);
    if (signedBy) { confidence = 'high'; reasons.push(`The carrier recorded a delivery scan${deliveredAt ? ' on ' + deliveredAt : ''} and a signature (${signedBy}).`); }
    else { confidence = 'medium'; reasons.push(`The carrier recorded a delivery scan${deliveredAt ? ' on ' + deliveredAt : ''}, but no signature.`); }
    if (age !== null && age < 2) {
      reasons.push('The scan is less than 48 hours old — give the buyer a short window before treating it as final, but the record already supports you.');
      next_steps.push('Ask the buyer to check with household members, neighbours and the local carrier office, and to allow 24–48 hours.');
    }
    next_steps.push(`If the buyer still claims non-receipt after that, respond with the delivery scan as proof, and if it escalates, open a carrier claim — ${CARRIER_CLAIM[carrierKey]}`);
    next_steps.push('Attach the carrier tracking page (not a screenshot of our own system) as the evidence.');
  } else if (status === 'in_transit' || status === 'out_for_delivery') {
    determination = 'do_not_dispute'; confidence = 'high';
    reasons.push(`The carrier shows the item is ${status === 'out_for_delivery' ? 'out for delivery' : 'in transit'} — it has not failed to arrive, it is still moving.`);
    next_steps.push('Send the buyer the current scan and expected date. Do not open any dispute; a dispute now would be indefensible.');
    next_steps.push('Set a reminder to re-check in 3 days; only then does a non-receipt claim become real.');
  } else if (status === 'pre_transit') {
    determination = 'escalate'; confidence = 'medium';
    reasons.push('The carrier has only a label/electronic record — the parcel was never scanned into the network, which usually points at the shop side, not the carrier.');
    next_steps.push('Verify the item was actually shipped and the label was correct before replying.');
  } else if (status === 'exception') {
    determination = 'escalate'; confidence = 'medium';
    reasons.push('The carrier reports an exception (returned, refused, undeliverable, held or delayed) — read the actual event before answering.');
    next_steps.push(`Check the last carrier event, fix the address if needed, and open a carrier claim if the parcel is lost — ${CARRIER_CLAIM[carrierKey]}`);
  } else {
    determination = 'escalate'; confidence = 'low';
    reasons.push('The tracking status could not be classified — read it by hand before replying.');
  }

  if (!inrClaimed && determination === 'defend') {
    reasons.push('Note: the message does not clearly claim non-receipt, so confirm what the buyer is actually asking before sending a dispute-style reply.');
  }

  let draft_response = null;
  const ord = order.order_id ? ` #${order.order_id}` : '';
  const num = order.tracking_number || '(the tracking number)';
  if (determination === 'defend') {
    draft_response = `Hi — sorry this has been worrying, let me sort it out. I checked the tracking for your order${ord}: ${order.carrier || 'the carrier'} shows it was delivered${deliveredAt ? ' on ' + deliveredAt : ''}${signedBy ? ', signed for by ' + signedBy : ''}. The tracking number is ${num} so you can see that scan yourself. `
      + `Could you check with anyone else at the address, your neighbours, and your local ${order.carrier || 'carrier'} office? If it still has not appeared in 24 hours, reply here and I will open a claim with the carrier straight away. `;
  } else if (determination === 'do_not_dispute') {
    draft_response = `Hi — thanks for checking in. Your order${ord} is still on its way: ${order.carrier || 'the carrier'} last scanned it as "${tracking.status}". The tracking number is ${num}. `
      + `I will keep an eye on it and message you the moment it is marked delivered. If it has not arrived shortly after that, tell me and I will take it up with the carrier. `;
  } else {
    draft_response = `Hi — thanks for letting me know, and sorry for the trouble. I am looking into order${ord} with ${order.carrier || 'the carrier'} right now and will come back to you within 24 hours with what I find. `;
  }

  return {
    inr_claimed: inrClaimed,
    threatens_chargeback: threatens,
    status,
    determination,
    confidence,
    reasons,
    evidence,
    next_steps,
    draft_response,
    note: 'Deterministic pre-screen. It cites only what the carrier actually reported — never assert a delivery the tracking does not show.',
  };
}

/** Normalise whatever a tracking provider returns into our shape. */
function normalizeTrackingPayload(raw, source) {
  if (!raw || typeof raw !== 'object') return null;
  const t = raw.data && typeof raw.data === 'object' ? raw.data : raw;
  const ev = Array.isArray(t.events) ? t.events : Array.isArray(t.checkpoints) ? t.checkpoints : null;
  const deliveredEvent = ev ? ev.find((e) => /deliver/i.test(String(e.status || e.description || e.event || ''))) : null;
  return {
    status: t.status || t.status_category || t.Status || t.tag || (deliveredEvent ? 'Delivered' : undefined),
    status_category: t.status_category || t.subtag || undefined,
    delivered_at: t.delivered_at || t.delivery_date || (deliveredEvent && (deliveredEvent.date || deliveredEvent.datetime)) || undefined,
    signed_by: t.signed_by || t.signedFor || t.signed_for || undefined,
    carrier: t.carrier || undefined,
    source,
  };
}

function httpGet(url, headers, timeoutMs) {
  return new Promise((resolve) => {
    let mod;
    try { mod = new URL(url).protocol === 'http:' ? require('http') : require('https'); } catch { return resolve(null); }
    const req = mod.get(url, { headers: headers || {} }, (res) => {
      let body = '';
      res.on('data', (d) => { body += d; });
      res.on('end', () => resolve({ status: res.statusCode, body, contentType: res.headers['content-type'] || '' }));
    });
    req.on('error', () => resolve(null));
    req.setTimeout(timeoutMs || 15000, () => { req.destroy(); resolve(null); });
  });
}

/** Fetch a tracking status if a provider is configured. Returns null when it is not. */
async function fetchTracking(order) {
  const num = order && order.tracking_number;
  if (!num) return null;
  const carrier = encodeURIComponent(String(order.carrier || ''));

  if (process.env.SHOPTOOLS_TRACKING_URL) {
    const url = process.env.SHOPTOOLS_TRACKING_URL.replace('{num}', encodeURIComponent(num)).replace('{carrier}', carrier);
    const headers = { Accept: 'application/json' };
    if (process.env.SHOPTOOLS_TRACKING_KEY) headers.Authorization = `Bearer ${process.env.SHOPTOOLS_TRACKING_KEY}`;
    const res = await httpGet(url, headers);
    if (res && res.status >= 200 && res.status < 300) {
      try { return normalizeTrackingPayload(JSON.parse(res.body), 'provider'); } catch { return null; }
    }
    return null;
  }

  // USPS Web Tools TrackV2 — free with a User ID, but the tracking permission must be granted
  // and this legacy XML gateway is being retired in favour of the USPS REST v3 API.
  if (/usps/i.test(String(order.carrier || '')) && process.env.USPS_USERID) {
    const xml = `<TrackFieldRequest USERID="${process.env.USPS_USERID}"><Revision>1</Revision><ClientIp>127.0.0.1</ClientIp><SourceId>shop-agent-kit</SourceId><TrackID ID="${String(num).replace(/[^A-Za-z0-9]/g, '')}"></TrackID></TrackFieldRequest>`;
    const url = `https://secure.shippingapis.com/ShippingAPI.dll?API=TrackV2&XML=${encodeURIComponent(xml)}`;
    const res = await httpGet(url, { Accept: 'application/xml' });
    if (!res || res.status !== 200) return null;
    const pick = (tag) => { const m = res.body.match(new RegExp(`<${tag}>([^<]*)</${tag}>`, 'i')); return m ? m[1].trim() : undefined; };
    const signedBy = pick('Name');
    const status = pick('Status');
    if (!status && !signedBy) return null;
    return { status, status_category: pick('StatusCategory'), delivered_at: pick('DeliveredDate'), signed_by: signedBy, carrier: 'USPS', source: 'usps' };
  }

  return null;
}

// ── MCP plumbing ────────────────────────────────────────────────────────────────
const TOOLS = [
  {
    name: 'listing_validate',
    description: 'Check a draft Etsy listing against the limits Etsy actually publishes (140-character title, title character rules, 13 tags of 20 chars, unique and valid tags, non-empty description, required taxonomy) and return every fix. Quality advice is returned separately as warnings/opportunities, never as a fake platform rule. Run this BEFORE publishing.',
    inputSchema: { type: 'object', properties: { title: { type: 'string' }, tags: { type: 'array', items: { type: 'string' } }, description: { type: 'string' }, attributes: { type: 'object' }, is_digital: { type: 'boolean' } }, required: ['title', 'tags'] },
  },
  {
    name: 'support_triage',
    description: 'Classify a customer message, decide whether to reply or escalate to the owner, and draft a reply when it is safe. Refunds, chargebacks, legal, platform notices and order problems always escalate — never auto-reply to those.',
    inputSchema: { type: 'object', properties: { message: { type: 'string' }, voice: { type: 'string', description: 'The shop voice/tone to match' } }, required: ['message'] },
  },
  {
    name: 'research_rank',
    description: 'Rank candidate products by observable selling evidence — sales velocity inside a short life (>1000 sales under 12 months scores highest), review depth, price band, and how crowded the niche is. Sales inputs are estimates; this ranks, it does not forecast.',
    inputSchema: { type: 'object', properties: { candidates: { type: 'array', items: { type: 'object' } } }, required: ['candidates'] },
  },
  {
    name: 'dispute_guard',
    description: 'Pre-screen a non-receipt ("never arrived") claim against the carrier tracking before replying. Returns a determination (defend / do_not_dispute / escalate), the evidence to cite, the next steps, and a defensible draft reply. It cites only what the carrier actually reported — it never asserts a delivery the tracking does not show. If a tracking provider is configured it fetches the status; otherwise pass it in.',
    inputSchema: {
      type: 'object',
      properties: {
        message: { type: 'string', description: 'The customer message' },
        order: { type: 'object', description: '{ order_id, tracking_number, carrier, value, currency, ship_date, destination_zip }' },
        tracking: { type: 'object', description: 'Optional carrier status: { status, status_category, delivered_at, signed_by, carrier, events:[], source }' },
      },
      required: ['message'],
    },
  },
];

const HANDLERS = {
  listing_validate: (a) => validateListing(a),
  support_triage: (a) => triageSupport(a.message, a),
  research_rank: (a) => rankResearch(a.candidates),
  dispute_guard: async (a) => {
    let tracking = a.tracking || null;
    let fetched = false;
    if (!tracking) {
      const t = await fetchTracking(a.order || {});
      if (t) { tracking = t; fetched = true; }
    }
    const out = disputeGuard({ ...a, tracking });
    return { ...out, tracking_source: fetched ? 'fetched' : tracking ? 'provided' : 'none' };
  },
};

let buffer = '';
const send = (m) => process.stdout.write(JSON.stringify(m) + '\n');
const ok = (id, result) => send({ jsonrpc: '2.0', id, result });
const fail = (id, code, message) => send({ jsonrpc: '2.0', id, error: { code, message: String(message) } });

async function handle(msg) {
  const { id, method, params } = msg || {};
  if (method === 'initialize') return ok(id, { protocolVersion: '2024-11-05', capabilities: { tools: {} }, serverInfo: { name: 'shop-tools', version: '0.1.0' } });
  if (method === 'notifications/initialized') return;
  if (method === 'tools/list') return ok(id, { tools: TOOLS });
  if (method === 'tools/call') {
    const fn = HANDLERS[params && params.name];
    if (!fn) return fail(id, -32602, `unknown tool ${params && params.name}`);
    try { return ok(id, { content: [{ type: 'text', text: JSON.stringify(await fn((params && params.arguments) || {}), null, 2) }] }); }
    catch (e) { return ok(id, { content: [{ type: 'text', text: JSON.stringify({ error: String(e.message || e) }) }], isError: true }); }
  }
  if (id !== undefined) fail(id, -32601, `method not found: ${method}`);
}

if (require.main === module) {
  // stdout is the wire; keep anything a loaded module logs away from it.
  for (const lvl of ['log', 'info', 'warn', 'error', 'debug', 'trace']) {
    console[lvl] = (...a) => { try { process.stderr.write(a.map((x) => (typeof x === 'string' ? x : JSON.stringify(x))).join(' ') + '\n'); } catch { /* gone */ } };
  }
  process.stdin.on('data', (c) => {
    buffer += c.toString('utf8');
    let nl;
    while ((nl = buffer.indexOf('\n')) !== -1) {
      const line = buffer.slice(0, nl).trim(); buffer = buffer.slice(nl + 1);
      if (!line) continue;
      let m; try { m = JSON.parse(line); } catch { continue; }
      try { handle(m).catch((e) => { if (m.id !== undefined) fail(m.id, -32603, e.message); }); } catch (e) { if (m.id !== undefined) fail(m.id, -32603, e.message); }
    }
  });
  process.stdin.on('end', () => process.exit(0));
}

module.exports = { TOOLS, handle, validateListing, triageSupport, rankResearch, disputeGuard, normalizeStatus, fetchTracking };
