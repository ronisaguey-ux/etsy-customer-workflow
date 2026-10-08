#!/usr/bin/env node
'use strict';
/**
 * Tests for the shop-tools server. Every check is written so it FAILS on the broken input — a
 * grader that cannot fail measures nothing. The listing expectations are Etsy's published
 * limits, not preferences.
 */
const { validateListing, triageSupport, rankResearch, TOOLS } = require('../mcp/shop-tools/server.js');

let pass = 0, fail = 0;
const t = (name, cond) => { if (cond) { pass++; console.log('  ok  ' + name); } else { fail++; console.log('FAIL  ' + name); } };

const GOOD_TAGS = ['desk nameplate', 'walnut nameplate', 'desk name sign', 'personalised gift', 'office decor', 'wooden plaque', 'desk accessory', 'coworker gift', 'custom name sign', 'new job gift', 'home office', 'graduation gift', 'walnut gift'];
const GOOD = {
  title: 'Personalised Walnut Desk Nameplate',
  tags: GOOD_TAGS,
  description: 'A solid walnut desk nameplate, engraved with any name or short line of text. Measures 20cm by 5cm and arrives ready to stand. Made to order in 3-5 days. Great for a new job, a graduation, or a home office.',
  attributes: { taxonomy_id: 1234, who_made: 'i_did', when_made: 'made_to_order', is_supply: false },
};

// ── listing validator ──────────────────────────────────────────────────────────
console.log('listing_validate');
const good = validateListing(GOOD);
t('a compliant listing is not blocked', good.ok === true);
t('a compliant listing scores top marks', good.score >= 90);
t('it reports the title character count', good.stats.title_chars === 34);

const bad = validateListing({ title: '', tags: [], description: '', attributes: {} });
t('an empty listing is rejected', bad.ok === false);
t('a missing title is caught', bad.violations.some((v) => v.code === 'TITLE_MISSING'));
t('too few tags is caught', bad.violations.some((v) => v.code === 'TAG_COUNT'));
t('a missing description is caught', bad.violations.some((v) => v.code === 'DESCRIPTION_MISSING'));
t('a missing taxonomy_id is caught', bad.violations.some((v) => v.code === 'ATTRIBUTE_TAXONOMY'));
t('a broken listing scores far below a good one', bad.score < 40 && bad.score < good.score);
t('every violation carries a fix', bad.violations.every((v) => typeof v.fix === 'string' && v.fix.length > 5));

t('a 141-character title is rejected', validateListing({ ...GOOD, title: 'w'.repeat(141) }).violations.some((v) => v.code === 'TITLE_TOO_LONG'));
t('a title not starting with a letter/number is rejected', validateListing({ ...GOOD, title: '# Walnut Nameplate' }).violations.some((v) => v.code === 'TITLE_BAD_START'));
t('a forbidden character is rejected', validateListing({ ...GOOD, title: 'Walnut Nameplate $5' }).violations.some((v) => v.code === 'TITLE_FORBIDDEN_CHAR'));
t('repeating "&" is rejected', validateListing({ ...GOOD, title: 'Walnut & Oak & Ash Nameplate' }).violations.some((v) => v.code === 'TITLE_CHAR_REPEAT'));
t('too many capitalised words is rejected', validateListing({ ...GOOD, title: 'WALNUT DESK NAME PLATE' }).violations.some((v) => v.code === 'TITLE_TOO_MANY_CAPS'));

t('a duplicate tag is rejected', validateListing({ ...GOOD, tags: ['desk nameplate', 'desk nameplate', ...GOOD_TAGS.slice(0, 11)] }).violations.some((v) => v.code === 'TAG_DUPLICATE'));
t('a 21-character tag is rejected', validateListing({ ...GOOD, tags: ['a'.repeat(21), ...GOOD_TAGS.slice(1)] }).violations.some((v) => v.code === 'TAG_TOO_LONG'));
t('a tag with a disallowed character is rejected', validateListing({ ...GOOD, tags: ['desk nameplate!', ...GOOD_TAGS.slice(1)] }).violations.some((v) => v.code === 'TAG_INVALID_CHARS'));
t('a short description is rejected', validateListing({ ...GOOD, description: 'Nice.' }).violations.some((v) => v.code === 'DESCRIPTION_THIN'));

t('subjective fluff is flagged as advice, not a violation', (() => { const r = validateListing({ ...GOOD, title: 'Beautiful Walnut Desk Nameplate' }); return r.ok === true && r.warnings.some((w) => w.code === 'TITLE_FLUFF'); })());
t('singular+plural tags are advice, not a violation', (() => { const r = validateListing({ ...GOOD, tags: ['walnut gift', 'walnut gifts', ...GOOD_TAGS.slice(2)] }); return r.warnings.some((w) => w.code === 'TAG_PLURAL'); })());
t('leaving no tag echoed in the title is an opportunity, not a violation', (() => { const r = validateListing({ ...GOOD, tags: ['walnut nameboard', 'timber sign', 'engraved block', 'office trinket', 'desk ornament', 'joining present', 'workplace decor', 'name plate art', 'carved board', 'study decor', 'promotion present', 'housewarming', 'keepsake'] }); return r.ok === true && r.opportunities.some((o) => o.code === 'TAG_NO_ECHO'); })());
t('a tag echoed in the title removes the opportunity', !validateListing(GOOD).opportunities.some((o) => o.code === 'TAG_NO_ECHO'));

// ── support triage ─────────────────────────────────────────────────────────────
console.log('support_triage');
t('a refund is escalated, not auto-answered', triageSupport('I want a refund now').escalate_to_owner === true);
t('a chargeback is escalated', triageSupport('I will file a chargeback').escalate_to_owner === true);
t('a legal threat is escalated', triageSupport('my lawyer will contact you').escalate_to_owner === true);
t('a platform notice is escalated', triageSupport('Etsy sent a policy warning about my shop').escalate_to_owner === true);
t('a damaged order is escalated', triageSupport('the item arrived damaged and broken').escalate_to_owner === true);
const ship = triageSupport('Where is my order, when will it arrive?');
t('an ordinary shipping question is NOT escalated', ship.escalate_to_owner === false);
t('an ordinary question gets a draft reply', typeof ship.draft_reply === 'string' && ship.draft_reply.length > 20);
t('shipping question is categorised', ship.category === 'shipping_status');
t('an escalated message has NO draft reply', triageSupport('refund please').draft_reply === null);
t('a download problem is categorised', triageSupport("I can't open the download file").category === 'digital_access');
t('an angry tone escalates even without a keyword', triageSupport('this is ABSOLUTELY UNACCEPTABLE!!').escalate_to_owner === true);

// ── research ranking ───────────────────────────────────────────────────────────
console.log('research_rank');
const ranked = rankResearch([
  { name: 'proven winner', sales: 1400, age_months: 11, reviews: 300, price: 12, competing_sellers: 5 },
  { name: 'crowded dud', sales: 40, age_months: 40, reviews: 3, price: 80, competing_sellers: 90 },
]);
t('the 1000-sales-under-a-year product ranks first', ranked.ranked[0].name === 'proven winner');
t('the crowded dud ranks last', ranked.ranked[1].name === 'crowded dud');
t('a figure is labelled an estimate', /estimate/i.test(ranked.note));
t('velocity is computed', ranked.ranked[0].velocity_per_month === 127);
t('an empty list does not crash', rankResearch([]).ranked.length === 0);

// ── dispute guard ──────────────────────────────────────────────────────────────
console.log('dispute_guard');
const { disputeGuard } = require('../mcp/shop-tools/server.js');
const ORDER = { order_id: 42, tracking_number: '9400111899223197428490', carrier: 'USPS' };

const deliveredSigned = disputeGuard({ message: 'I never received my order', order: ORDER, tracking: { status: 'Delivered', delivered_at: '2026-10-01T14:02:00Z', signed_by: 'J SMITH', source: 'usps' } });
t('a delivered+signed claim is defended', deliveredSigned.determination === 'defend');
t('a signed delivery is high confidence', deliveredSigned.confidence === 'high');
t('the signature is cited as evidence', deliveredSigned.evidence.some((e) => /J SMITH/.test(e)));
t('a defensible draft is produced', typeof deliveredSigned.draft_response === 'string' && deliveredSigned.draft_response.length > 40);
t('the tracking number is in the reply', deliveredSigned.draft_response.includes(ORDER.tracking_number));

const deliveredNoSig = disputeGuard({ message: 'my package never arrived', order: ORDER, tracking: { status: 'Delivered', delivered_at: '2026-09-01T10:00:00Z' } });
t('a delivered claim without a signature is medium confidence', deliveredNoSig.confidence === 'medium');
t('an old delivery still defends', deliveredNoSig.determination === 'defend');

const inTransit = disputeGuard({ message: 'where is my package', order: ORDER, tracking: { status: 'In Transit', status_category: 'In Transit' } });
t('an in-transit parcel is NOT disputed', inTransit.determination === 'do_not_dispute');
t('the reply tells the buyer it is on the way', /on its way/i.test(inTransit.draft_response));

const threat = disputeGuard({ message: 'I never got it, I am filing a chargeback', order: ORDER, tracking: { status: 'Delivered', delivered_at: '2026-10-01T14:02:00Z' } });
t('a chargeback threat escalates even when delivered', threat.determination === 'escalate');
t('the chargeback threat is flagged', threat.threatens_chargeback === true);

const noTracking = disputeGuard({ message: 'I never received my order', order: ORDER });
t('no tracking means escalate, not defend', noTracking.determination === 'escalate');
t('it asks for the tracking instead of guessing', noTracking.next_steps.length > 0);

const preTransit = disputeGuard({ message: 'never arrived', order: ORDER, tracking: { status: 'Pre-Shipment, Label Created' } });
t('a label-only scan escalates (shop-side issue)', preTransit.determination === 'escalate');

const exception = disputeGuard({ message: 'never arrived', order: ORDER, tracking: { status: 'Undeliverable - Returned to Sender' } });
t('an exception escalates', exception.determination === 'escalate');

const unrelated = disputeGuard({ message: 'what size is this?', order: ORDER, tracking: { status: 'Delivered', delivered_at: '2026-10-01T14:02:00Z' } });
t('a non-receipt tool reports the message is not an INR claim', unrelated.inr_claimed === false);
t('every result carries the honesty note', /never assert a delivery/i.test(unrelated.note));

t('a USPS claim path is suggested when relevant', (() => {
  const r = disputeGuard({ message: 'never arrived', order: ORDER, tracking: { status: 'Delivered', delivered_at: '2026-09-01T10:00:00Z' } });
  return r.next_steps.some((s) => /USPS|Missing Mail/i.test(s));
})());

// ── schema ─────────────────────────────────────────────────────────────────────
console.log('schema');
t('four tools are exposed', TOOLS.length === 4);
t('every tool has an input schema object', TOOLS.every((x) => x.inputSchema && x.inputSchema.type === 'object'));
t('dispute_guard is advertised', TOOLS.some((x) => x.name === 'dispute_guard'));

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
