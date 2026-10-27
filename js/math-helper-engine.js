/* Pure deterministic school-arithmetic engine for My Math Helper. */
const PLACE_NAMES = ["ones", "tens", "hundreds", "thousands", "ten-thousands", "hundred-thousands", "millions", "ten-millions"];

function assertOperand(value, name) {
  if (!Number.isInteger(value) || value < 0 || value > 9999) {
    throw new RangeError(`${name} must be a whole number from 0 to 9999.`);
  }
}

function digits(value) { return String(value).split("").map(Number); }
function place(column) { return PLACE_NAMES[column] || `10 to the power ${column}`; }
function cell(id, expected, kind, column, step, extra = {}) {
  return { id, expected: String(expected), kind, column, step, ...extra };
}
function rowCells(prefix, value, width, kind, step, offset = 0) {
  const chars = String(value).split("");
  const start = width - offset - chars.length;
  return chars.map((ch, index) => cell(`${prefix}-${start + index}`, ch, kind, width - 1 - (start + index), step, { row: prefix, slot: start + index }));
}
function makeStep(id, title, instruction, why, hint, cells, errorKind) {
  return { id, title, instruction, why, hint, cells, errorKind };
}
function baseResult(a, op, b, width) {
  return { a, b, op, width, rows: [], steps: [], answer: null, remainder: 0, message: "", needsSwap: false };
}

function addition(a, b) {
  const answer = a + b;
  const width = Math.max(String(a).length, String(b).length, String(answer).length);
  const out = baseResult(a, "+", b, width);
  out.answer = answer;
  out.rows.push({ id: "top", label: "", value: String(a), role: "given" }, { id: "bottom", label: "+", value: String(b), role: "given" });
  let carry = 0;
  for (let column = 0; column < width; column += 1) {
    const da = Math.floor(a / 10 ** column) % 10;
    const db = Math.floor(b / 10 ** column) % 10;
    const total = da + db + carry;
    const write = total % 10;
    const nextCarry = Math.floor(total / 10);
    const cells = [cell(`answer-${column}`, write, "answer", column, out.steps.length, { slot: width - 1 - column })];
    if (nextCarry && column + 1 < width) cells.push(cell(`carry-${column + 1}`, nextCarry, "carry", column + 1, out.steps.length, { slot: width - 2 - column }));
    const step = makeStep(`add-${column}`, `Add the ${place(column)}`, `Add ${da} and ${db}${carry ? `, then add the carried ${carry}` : ""}. Write ${write}${nextCarry ? ` and carry ${nextCarry}` : ""}.`, `We add one place at a time so each digit stays in its place.`, `Start with ${da} + ${db}${carry ? ` + ${carry}` : ""}.`, cells, nextCarry ? "forgot to carry" : "addition fact");
    step.calculation = { da, db, carryIn: carry, total, write, carryOut: nextCarry };
    out.steps.push(step);
    carry = nextCarry;
  }
  out.rows.push({ id: "carry", label: "carry", role: "work" }, { id: "answer", label: "", role: "answer" });
  return out;
}

function subtraction(a, b) {
  const width = Math.max(String(a).length, String(b).length);
  const out = baseResult(a, "-", b, width);
  if (a < b) {
    out.needsSwap = true;
    out.message = "This helper can't go below zero. Put the bigger number on top.";
    return out;
  }
  out.answer = a - b;
  out.rows.push({ id: "borrow", label: "borrow", role: "work" }, { id: "top", label: "", value: String(a), role: "given" }, { id: "bottom", label: "−", value: String(b), role: "given" }, { id: "answer", label: "", role: "answer" });
  const top = Array.from({ length: width }, (_, column) => Math.floor(a / 10 ** column) % 10);
  for (let column = 0; column < width; column += 1) {
    const lower = Math.floor(b / 10 ** column) % 10;
    const cells = [];
    if (top[column] < lower) {
      let lender = column + 1;
      while (lender < width && top[lender] === 0) lender += 1;
      top[lender] -= 1;
      cells.push(cell(`borrow-${column}-${lender}`, top[lender], "borrow", lender, out.steps.length, { row: `borrow-${column}`, slot: width - 1 - lender }));
      for (let crossing = lender - 1; crossing > column; crossing -= 1) {
        top[crossing] = 9;
        cells.push(cell(`borrow-${column}-${crossing}`, 9, "borrow", crossing, out.steps.length, { row: `borrow-${column}`, slot: width - 1 - crossing }));
      }
      top[column] += 10;
      cells.push(cell(`borrow-${column}-${column}`, top[column], "borrow", column, out.steps.length, { row: `borrow-${column}`, slot: width - 1 - column, maxDigits: 2 }));
    }
    const write = top[column] - lower;
    cells.push(cell(`answer-${column}`, write, "answer", column, out.steps.length, { slot: width - 1 - column }));
    const borrowed = cells.some(item => item.kind === "borrow");
    const step = makeStep(`subtract-${column}`, `Subtract the ${place(column)}`, borrowed ? `Regroup from the next non-zero place, then subtract ${lower}. Write ${write}.` : `Take ${lower} from ${top[column]}. Write ${write}.`, `Regrouping changes the name of the number, not its value.`, borrowed ? `There are not enough ${place(column)}. Find the next place that can lend one.` : `Work out ${top[column]} − ${lower}.`, cells, borrowed ? "borrowed from the wrong column" : "subtraction fact");
    step.calculation = { top: top[column], lower, write, borrowed };
    out.steps.push(step);
  }
  return out;
}

function multiplication(a, b) {
  const answer = a * b;
  /* Written multiplication is clearest with the longer factor on top. Equal-width
     factors keep the child's order; unlike subtraction this is an automatic layout
     normalization, not a change to the question. */
  const top = String(a).length < String(b).length ? b : a;
  const bottom = top === a ? b : a;
  const bottomDigits = String(bottom).split("").reverse().map(Number);
  const partials = bottomDigits.map((digit, shift) => top * digit * 10 ** shift);
  const width = Math.max(String(top).length, String(bottom).length, String(answer).length, 1);
  const out = baseResult(top, "×", bottom, width);
  out.entered = { a, b };
  out.answer = answer;
  out.rows.push({ id: "top", label: "", value: String(top), role: "given" }, { id: "bottom", label: "×", value: String(bottom), role: "given" });
  bottomDigits.forEach((multiplier, shift) => {
    const raw = top * multiplier;
    const cells = rowCells(`partial-${shift}`, raw, width, "partial", out.steps.length, shift);
    if (shift) {
      for (let zero = 0; zero < shift; zero += 1) cells.push(cell(`partial-${shift}-${width - 1 - zero}`, 0, "placeholder", zero, out.steps.length, { row: `partial-${shift}`, slot: width - 1 - zero }));
    }
    const step = makeStep(`multiply-${shift}`, `Multiply by the ${place(shift)} digit`, `Multiply ${top} by ${multiplier}${shift ? ` and move the row ${shift} place${shift === 1 ? "" : "s"} left` : ""}.`, `This digit means ${multiplier * 10 ** shift}, so its partial product must line up by place value.`, `Work from right to left: ${top} × ${multiplier}.`, cells, shift ? "misaligned partial product" : "multiplication fact");
    step.calculation = { multiplicand: top, multiplier, shift, partial: partials[shift] };
    out.steps.push(step);
    out.rows.push({ id: `partial-${shift}`, label: shift ? "+" : "", role: "partial", shift });
  });
  if (partials.length > 1) {
    const cells = rowCells("answer", answer, width, "answer", out.steps.length);
    out.steps.push(makeStep("multiply-sum", "Add the partial products", "Add the rows, keeping every digit in its place.", "Each row is one part of the multiplier, so adding them gives the whole product.", "Add the partial-product columns from the right.", cells, "place value"));
  } else {
    const last = out.steps[out.steps.length - 1];
    last.cells.forEach(item => { item.id = item.id.replace("partial-0", "answer"); item.kind = "answer"; item.row = "answer"; });
  }
  out.rows.push({ id: "answer", label: "", role: "answer" });
  return out;
}

function division(a, b) {
  const width = Math.max(String(a).length, 1);
  const out = baseResult(a, "÷", b, width);
  if (b === 0) {
    out.message = "We cannot divide by zero. Choose a divisor from 1 to 9999.";
    return out;
  }
  out.answer = Math.floor(a / b);
  out.remainder = a % b;
  out.rows.push({ id: "division", label: "", value: String(a), divisor: String(b), role: "given" }, { id: "quotient", label: "", role: "answer" });
  const dividendDigits = digits(a);
  let current = 0;
  let quotientStarted = false;
  dividendDigits.forEach((digit, index) => {
    current = current * 10 + digit;
    if (!quotientStarted && current < b && index < dividendDigits.length - 1) return;
    const column = width - 1 - index;
    const qDigit = Math.floor(current / b);
    const product = qDigit * b;
    const remainder = current - product;
    const cells = [];
    const firstQuotientStep = !quotientStarted;
    quotientStarted = true;
    cells.push(cell(`quotient-${column}`, qDigit, "quotient", column, out.steps.length, { slot: index }));
    rowCells(`divide-product-${index}`, product, width, "division-product", out.steps.length, width - 1 - index).forEach(item => cells.push(item));
    rowCells(`divide-remainder-${index}`, remainder, width, "remainder", out.steps.length, width - 1 - index).forEach(item => cells.push(item));
    const step = makeStep(`divide-${index}`, firstQuotientStep ? `Start at the left` : `Bring down the next digit`, `${b} goes into ${current} ${qDigit} time${qDigit === 1 ? "" : "s"}. Write ${qDigit}, subtract ${product}, and keep ${remainder}.`, `Division shares the current amount into groups of ${b}; the leftover joins the next digit.`, firstQuotientStep ? `Use enough digits from the left for groups of ${b} to fit.` : `Bring down ${digit}. How many groups of ${b} fit in ${current}?`, cells, firstQuotientStep ? "division fact" : "place value");
    step.calculation = { current, divisor: b, quotientDigit: qDigit, product, remainder, broughtDown: digit };
    out.steps.push(step);
    out.rows.push({ id: `divide-product-${index}`, label: "−", role: "division-product", upto: index }, { id: `divide-remainder-${index}`, label: "", role: "remainder", upto: index });
    current = remainder;
  });
  if (out.remainder) {
    const cells = rowCells("final-remainder", out.remainder, width, "final-remainder", out.steps.length);
    out.steps.push(makeStep("division-remainder", "Write the remainder", `Write remainder ${out.remainder}.`, `A remainder is what is left when no whole group of ${b} fits.`, `The amount left is ${out.remainder}.`, cells, "remainder"));
    out.rows.push({ id: "final-remainder", label: "R", role: "final-remainder" });
  }
  return out;
}

export function makeProblem(a, op, b) {
  assertOperand(a, "First number");
  assertOperand(b, "Second number");
  const normalized = op === "x" || op === "*" ? "×" : op === "/" ? "÷" : op;
  if (normalized === "+") return addition(a, b);
  if (normalized === "-") return subtraction(a, b);
  if (normalized === "×") return multiplication(a, b);
  if (normalized === "÷") return division(a, b);
  throw new RangeError("Operation must be +, -, ×, or ÷.");
}

export function expectedCells(problem) {
  return Object.fromEntries(problem.steps.flatMap(step => step.cells.map(item => [item.id, item.expected])));
}

export function checkWork(problem, work) {
  const expected = expectedCells(problem);
  const wrong = [];
  const correct = [];
  for (const [id, value] of Object.entries(work || {})) {
    if (!(id in expected) || value === "") continue;
    (String(value) === expected[id] ? correct : wrong).push(id);
  }
  const next = problem.steps.flatMap(step => step.cells).find(item => String(work?.[item.id] ?? "") !== item.expected) || null;
  return { correct, wrong, next, complete: !next && Object.keys(expected).length > 0 };
}

export const MATH_HELPER_VERSION = 1;
