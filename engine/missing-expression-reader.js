// Deterministic robot-clip plan for What's Missing expressions.
//
// The reader knows token *kinds*, not generated facts or number ranges. An integer's
// clip id is derived from its value, so extending a generator only requires adding the
// correspondingly named audio file. Operators and the blank have stable ids. Fraction
// and decimal pronunciation are deliberately refused until the owner chooses how their
// written forms should sound; silently inventing "over" or "point" composition would
// cross the unresolved boundary recorded in WHATS-MISSING-SPEC §2.1.

const OPERATOR_CLIPS = Object.freeze({
  '+': { id: 'wm-op-plus', text: 'Plus.' },
  '−': { id: 'wm-op-minus', text: 'Minus.' },
  '×': { id: 'wm-op-times', text: 'Times.' },
  '÷': { id: 'wm-op-divided-by', text: 'Divided by.' },
  '=': { id: 'wm-op-equals', text: 'Equals.' },
});

const BLANK_CLIP = Object.freeze({ id: 'wm-blank', text: 'Blank.' });

export class UnsupportedExpressionSpeech extends Error {
  constructor(kind) {
    super(`What's Missing has no approved robot-clip reading for ${kind} tokens`);
    this.name = 'UnsupportedExpressionSpeech';
    this.kind = kind;
  }
}

function integerClip(n) {
  if (!Number.isSafeInteger(n) || n < 0) {
    throw new Error(`invalid What's Missing integer token: ${n}`);
  }
  return { id: `tt-n-${n}`, text: `${n}.` };
}

export function robotClipForMissingToken(token) {
  if (!token || typeof token !== 'object') throw new Error('invalid expression token');
  if (token.k === 'int') return integerClip(token.n);
  if (token.k === 'q') return BLANK_CLIP;
  if (token.k === 'op') {
    const clip = OPERATOR_CLIPS[token.op];
    if (!clip) throw new Error(`unknown What's Missing operator: ${token.op}`);
    return clip;
  }
  if (token.k === 'frac' || token.k === 'dec') {
    throw new UnsupportedExpressionSpeech(token.k);
  }
  throw new Error(`unknown What's Missing token kind: ${token.k}`);
}

export function missingExpressionRobotClips(problemOrSlots) {
  const slots = Array.isArray(problemOrSlots) ? problemOrSlots : problemOrSlots?.slots;
  if (!Array.isArray(slots)) throw new Error("What's Missing expression has no slots");
  return slots.map(robotClipForMissingToken);
}
