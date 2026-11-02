import {
  calculateColorSplit,
  calculateRecipePlan,
  checkRecipeConsistency
} from "./calculator.js?v=20261102-mac";
import {
  buildIngredientId,
  deleteRecipe,
  isBuiltInRecipe,
  loadBaseDoughRecipes,
  loadRecipes,
  saveBaseDoughRecipes,
  saveRecipes,
  upsertBaseDoughRecipe,
  upsertRecipe,
  validateRecipeInput
} from "./recipe-store.js?v=20261102-mac";
import { COLOR_SWATCHES, STEP_LABELS } from "./data.js";

// ---------------------------------------------------------------------------
// State
// ---------------------------------------------------------------------------

const PLAN_STORAGE_KEY = "nerikiri-plan-v1";
const LOSS_OPTIONS = [0, 5, 10, 15];

let recipes = loadRecipes();
let baseDoughs = loadBaseDoughRecipes();

const plan = {
  view: "plan",
  recipeId: recipes[0]?.id ?? "",
  baseId: "",
  pieces: 10,
  loss: 10,
  round: 0,
  coloring: "powder",
  liquid: 1.2,
  matrixOpen: false,
  done: {},
  setupDone: false,
  wizStep: 1,
  ...loadPlanPrefs()
};

// First visit (or an older save from before the guided setup): start with the questions.
if (!plan.setupDone) plan.view = "wizard";

const studio = {
  lib: "design",
  selectedId: null,
  draft: null,
  dirty: false,
  saved: false,
  confirmDelete: false
};

function loadPlanPrefs() {
  try {
    const raw = window.localStorage.getItem(PLAN_STORAGE_KEY);
    if (!raw) return {};
    const saved = JSON.parse(raw);
    const allowed = ["view", "recipeId", "baseId", "pieces", "loss", "round", "coloring", "liquid", "setupDone"];
    return Object.fromEntries(Object.entries(saved).filter(([key]) => allowed.includes(key)));
  } catch {
    return {};
  }
}

function savePlanPrefs() {
  try {
    const { view, recipeId, baseId, pieces, loss, round, coloring, liquid, setupDone } = plan;
    window.localStorage.setItem(
      PLAN_STORAGE_KEY,
      JSON.stringify({ view, recipeId, baseId, pieces, loss, round, coloring, liquid, setupDone })
    );
  } catch {
    // Private mode or storage blocked: the app still works for this visit.
  }
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const $ = (selector, root = document) => root.querySelector(selector);
const $$ = (selector, root = document) => Array.from(root.querySelectorAll(selector));

function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

// One decimal place: what a kitchen scale shows.
function n1(value) {
  const rounded = Math.round((Number(value) || 0) * 10) / 10;
  return Number.isInteger(rounded) ? String(rounded) : rounded.toFixed(1);
}

const grams = (value) => `${n1(value)} g`;

// "English 日本語" — the one bilingual pattern used everywhere.
function bi(item, jpClass = "jp") {
  const name = escapeHtml(item?.name ?? "");
  const jp = item?.jp ? ` <span class="${jpClass}">${escapeHtml(item.jp)}</span>` : "";
  return `${name}${jp}`;
}

function biText(item) {
  return item?.jp ? `${item.name} ${item.jp}` : String(item?.name ?? "");
}

function isWhite(ingredient) {
  return /white/i.test(ingredient?.name ?? "") || ingredient?.jp === "白";
}

function swatchFor(ingredient) {
  if (ingredient?.swatch) return ingredient.swatch;
  if (ingredient?.type === "filling") return COLOR_SWATCHES.filling;
  if (ingredient?.colorLabel && COLOR_SWATCHES[ingredient.colorLabel]) return COLOR_SWATCHES[ingredient.colorLabel];
  return COLOR_SWATCHES.white;
}

function getRecipe(id) {
  return recipes.find((recipe) => recipe.id === id) ?? recipes[0] ?? null;
}

function getBase(id) {
  return baseDoughs.find((base) => base.id === id) ?? null;
}

function activeBase(recipe) {
  if (!recipe?.baseDoughRecipeId) return null;
  return getBase(plan.baseId) ?? getBase(recipe.baseDoughRecipeId) ?? baseDoughs[0] ?? null;
}

function sumGrams(list, key = "baseGrams") {
  return list.reduce((total, item) => total + (Number(item[key]) || 0), 0);
}

function doughParts(recipe) {
  return (recipe?.ingredients ?? []).filter((ingredient) => ingredient.type !== "filling");
}

function barHtml(parts, extraClass = "") {
  const total = sumGrams(parts);
  const segments = parts
    .map((part) => {
      const width = total > 0 ? ((Number(part.baseGrams) || 0) / total) * 100 : 0;
      return `<span style="width:${width}%;background:${escapeHtml(swatchFor(part))}"></span>`;
    })
    .join("");
  return `<span class="dough-bar ${extraClass}" aria-hidden="true">${segments}</span>`;
}

const ICON_OK =
  '<svg aria-hidden="true" width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"></circle><path d="M7.5 12.5l3 3 6-6.5"></path></svg>';
const ICON_WARN =
  '<svg aria-hidden="true" width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 3l9.5 17h-19z"></path><path d="M12 10v4.5"></path><path d="M12 17.5v.01"></path></svg>';
const ICON_CHEVRON =
  '<svg aria-hidden="true" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><path d="M9 5l7 7-7 7"></path></svg>';
const ICON_TRASH =
  '<svg aria-hidden="true" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 7h16"></path><path d="M9 7V4h6v3"></path><path d="M6 7l1 13h10l1-13"></path></svg>';
const ICON_PLUS =
  '<svg aria-hidden="true" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round"><path d="M12 5v14"></path><path d="M5 12h14"></path></svg>';

// ---------------------------------------------------------------------------
// Calculator: numbers
// ---------------------------------------------------------------------------

function computePlan() {
  const recipe = getRecipe(plan.recipeId);
  if (!recipe) return null;

  const pieces = Math.max(1, Math.round(Number(plan.pieces) || 1));
  const base = activeBase(recipe);
  const settings = {
    mode: "exact",
    processLossPct: plan.loss,
    roundToIncrement: plan.round > 0 ? plan.round : undefined,
    coloringMode: plan.coloring,
    liquidColoringAmount: plan.coloring === "liquid" ? plan.liquid : 0
  };
  const result = calculateRecipePlan({
    recipe,
    targetOutputGrams: pieces * recipe.yieldGrams,
    settings
  });
  const split = base ? calculateColorSplit({ plan: result, baseDoughRecipe: base }) : null;

  return { recipe, base, pieces, result, split };
}

// ---------------------------------------------------------------------------
// Calculator: rendering
// ---------------------------------------------------------------------------

function recipeCardsHtml() {
  return recipes
    .map((recipe) => {
      const parts = doughParts(recipe);
      const summary = (recipe.ingredients ?? [])
        .map((ing) => `${n1(ing.baseGrams)} ${escapeHtml(String(ing.name).toLowerCase())}${ing.jp ? ` ${escapeHtml(ing.jp)}` : ""}`)
        .join(" · ");
      return `<button type="button" class="recipe-card" data-set="recipeId" data-value="${escapeHtml(recipe.id)}">
        <span class="card-top"><span class="card-name">${bi(recipe)}</span><span class="card-meta num">${grams(recipe.yieldGrams)} / piece</span></span>
        ${parts.length ? barHtml(parts) : ""}
        <span class="card-summary">${summary}</span>
      </button>`;
    })
    .join("");
}

function renderRecipeCards() {
  $("#recipe-cards").innerHTML = recipeCardsHtml();
  if (plan.view === "wizard" && plan.wizStep === 1) renderWizard();

  $$('select[data-bind="recipeId"]').forEach((select) => {
    select.innerHTML = recipes
      .map((recipe) => `<option value="${escapeHtml(recipe.id)}">${escapeHtml(biText(recipe))} — ${n1(recipe.yieldGrams)} g</option>`)
      .join("");
  });
}

function optionsHtml(suffix) {
  const baseOptions = baseDoughs
    .map((base) => `<option value="${escapeHtml(base.id)}">${escapeHtml(biText(base))}</option>`)
    .join("");
  return `
    <label class="field-label" data-only-base>Base dough
      <select class="fld" data-bind="baseId" id="base-${suffix}">${baseOptions}</select>
      <span class="hint" data-out="baseNote"></span>
    </label>
    <div class="field-label">
      <span id="round-${suffix}">Round weigh-outs up to</span>
      <div class="chips three" role="group" aria-labelledby="round-${suffix}">
        <button type="button" class="chip-btn" data-set="round" data-value="0">Exact</button>
        <button type="button" class="chip-btn" data-set="round" data-value="0.5">0.5 g</button>
        <button type="button" class="chip-btn" data-set="round" data-value="1">1 g</button>
      </div>
      <span class="hint">Always rounds up, so a portion is never lighter than it should be.</span>
    </div>
    <div class="field-label">
      <span id="color-${suffix}">Coloring</span>
      <div class="chips two" role="group" aria-labelledby="color-${suffix}">
        <button type="button" class="chip-btn" data-set="coloring" data-value="powder">Powder</button>
        <button type="button" class="chip-btn" data-set="coloring" data-value="liquid">Liquid</button>
      </div>
      <label class="inline-field" data-only-liquid>Liquid coloring total (g)
        <input class="fld num" type="number" inputmode="decimal" min="0" step="0.1" data-bind="liquid" />
      </label>
      <span class="hint" data-out="coloringNote"></span>
    </div>`;
}

function renderOptions() {
  $("#options-wide").innerHTML = optionsHtml("wide");
  $("#options-phone").innerHTML = optionsHtml("phone");
}

function stepHtml({ num, label, sub, body, foot = "" }) {
  return `<section class="step">
    <div class="step-head">
      <span class="step-num" aria-hidden="true">${num}</span>
      <div>
        <h2 class="step-title">${bi(label)}</h2>
        ${sub ? `<p class="step-sub">${sub}</p>` : ""}
      </div>
    </div>
    ${body}
    ${foot}
  </section>`;
}

function rowHtml({ key, item, detail = "", warn = "", value, swatch = "" }) {
  const checked = plan.done[key] ? " checked" : "";
  return `<label class="row">
    <input type="checkbox" class="tick" data-done="${escapeHtml(key)}"${checked} />
    <span class="row-main">
      ${swatch ? `<span class="dot" style="background:${escapeHtml(swatch)}" aria-hidden="true"></span>` : ""}
      <span>
        <span class="row-name">${bi(item)}</span>
        ${detail ? `<span class="row-detail">${detail}</span>` : ""}
        ${warn ? `<span class="row-warn">${warn}</span>` : ""}
      </span>
    </span>
    <span class="grams">${value}</span>
  </label>`;
}

function renderPlan() {
  const computed = computePlan();
  if (!computed) {
    $("#steps").innerHTML = `<div class="step"><p>Create a recipe in Recipe Studio to start.</p></div>`;
    return;
  }

  const { recipe, base, pieces, result, split } = computed;
  const lossPct = result.settings.processLossPct;
  const fillingIngredients = (result.recipe.ingredients ?? []).filter((ing) => ing.type === "filling");
  const doughPerPiece = recipe.yieldGrams - sumGrams(fillingIngredients);
  const fillingPerPiece = sumGrams(fillingIngredients);
  const finishedDough = pieces * doughPerPiece;
  const keyPrefix = `${recipe.id}:`;

  setOut("piecesLine", `${pieces} × ${n1(recipe.yieldGrams)} g = ${grams(pieces * recipe.yieldGrams)} of finished sweets`);
  setOut(
    "answersLine",
    `${bi(recipe)} · ${pieces} ${pieces === 1 ? "piece" : "pieces"} · ${lossPct ? `+${lossPct}% extra` : "no extra"} · ${plan.round ? `rounded up to ${n1(plan.round)} g` : "exact weights"} · ${plan.coloring} coloring`,
    true
  );
  setOut("titleHtml", bi(recipe), true);
  setOut(
    "moreSummary",
    `${plan.coloring === "liquid" ? "Liquid color" : "Powder color"}${plan.round ? ` · round up to ${n1(plan.round)} g` : ""}`
  );
  const noCookLoss = base && checkRecipeConsistency({ baseDoughRecipe: base }).length > 0;
  setOut(
    "baseNote",
    base
      ? noCookLoss
        ? "Yield not measured yet: assumes nothing cooks off. Weigh a cooked batch and enter it in Recipe Studio."
        : `${n1(base.yieldGrams)} g cooked from ${n1(sumGrams(base.ingredients))} g raw.`
      : ""
  );
  $$('[data-out="baseNote"]').forEach((el) => el.classList.toggle("note-warn", Boolean(noCookLoss)));
  setOut(
    "coloringNote",
    plan.coloring === "liquid"
      ? "Dissolve it into the water before mixing. The water weigh-out drops by the same amount."
      : "Powder does not change the water."
  );
  $$("[data-only-base]").forEach((el) => (el.hidden = !base));
  $$("[data-only-liquid]").forEach((el) => (el.hidden = plan.coloring !== "liquid"));

  // Recipes without a linked base dough: one weigh-out list, with hydration adjustment.
  if (!split) {
    const rows = result.ingredients
      .map((ing, index) =>
        rowHtml({
          key: `${keyPrefix}ing-${index}`,
          item: ing,
          detail: ing.isHydrationTarget && result.hydration.applied ? `Less ${grams(result.hydration.liquidColoringContribution)} for liquid coloring` : "",
          value: grams(ing.toAddRoundedGrams)
        })
      )
      .join("");
    $("#summary").innerHTML = statHtml("Weigh out", grams(result.requiredPreLossGrams), lossPct ? `incl. ${lossPct}% extra` : "total batch");
    $("#steps").innerHTML = stepHtml({ num: 1, label: STEP_LABELS.weigh, sub: "Weigh, mix and cook together.", body: rows });
    $("#totals").innerHTML = "";
    $("#minibatch").innerHTML = "";
    return;
  }

  const coloredIngredients = (result.recipe.ingredients ?? []).filter((ing) => ing.type === "colored-dough");
  const cooked = split.totalColoredDough;
  const rawExact = sumGrams(split.scaledBaseIngredients, "scaledGrams");
  const rawSum = sumGrams(base.ingredients);
  const liquid = split.totalLiquidColoringAmount;
  const fillingTotal = pieces * fillingPerPiece;

  $("#summary").innerHTML = [
    statHtml("Cook this much base dough", grams(rawExact), "raw, in one pot", "Cook", "raw dough"),
    statHtml(
      "Cooked dough you need",
      grams(cooked),
      lossPct ? `${grams(finishedDough)} + ${lossPct}% handling` : `for ${pieces} pieces`,
      "Need",
      lossPct ? `incl. ${lossPct}% extra` : "cooked"
    ),
    statHtml(
      "Filling",
      fillingPerPiece ? grams(fillingTotal) : "None",
      fillingPerPiece ? `${n1(fillingPerPiece)} g × ${pieces}, weigh separately` : "this design has no filling",
      "Filling",
      fillingPerPiece ? "separate" : "not used"
    )
  ].join("");

  const baseRows = split.scaledBaseIngredients
    .map((ing, index) =>
      rowHtml({
        key: `${keyPrefix}base-${base.id}-${index}`,
        item: ing,
        detail: ing.isHydrationTarget && liquid > 0 ? `Less ${grams(liquid)} for liquid coloring` : "",
        value: grams(ing.scaledRoundedGrams)
      })
    )
    .join("");

  const portionRows = split.colorPortions
    .map((portion, index) => {
      const ing = coloredIngredients[index] ?? portion;
      const action = portion.colorLabel ? `Tint ${escapeHtml(String(ing.name).toLowerCase())}` : "Keep white";
      return rowHtml({
        key: `${keyPrefix}portion-${index}`,
        item: ing,
        detail: `${action} · ${n1(ing.baseGrams)} g × ${pieces}${lossPct ? ` + ${lossPct}%` : ""}`,
        value: grams(portion.totalRoundedGrams),
        swatch: swatchFor(ing)
      });
    })
    .join("");

  const steps = [
    stepHtml({
      num: 1,
      label: STEP_LABELS.base,
      sub: `${bi(base)} — weigh, mix and cook together.`,
      body: baseRows,
      foot: `<div class="step-foot num"><span>Cooks down to about ${grams(cooked)}</span><strong>${grams(rawExact)} raw</strong></div>`
    }),
    stepHtml({
      num: 2,
      label: STEP_LABELS.divide,
      sub: "Weigh each portion off the cooked batch, then tint.",
      body: barHtml(coloredIngredients, "big") + portionRows
    })
  ];

  let nextNum = 3;
  if (split.fillingPortions.length) {
    const fillingRows = split.fillingPortions
      .map((portion, index) => {
        const ing = fillingIngredients[index] ?? portion;
        return rowHtml({
          key: `${keyPrefix}filling-${index}`,
          item: ing,
          detail: `${n1(ing.baseGrams)} g × ${pieces}, rolled into balls. Not part of the dough.`,
          value: grams(portion.totalRoundedGrams),
          swatch: swatchFor(ing)
        });
      })
      .join("");
    steps.push(stepHtml({ num: nextNum++, label: STEP_LABELS.filling, body: fillingRows }));
  }

  const chips = (result.recipe.ingredients ?? [])
    .map(
      (ing) =>
        `<span class="piece-chip num"><span class="dot small" style="background:${escapeHtml(swatchFor(ing))}" aria-hidden="true"></span>${n1(ing.baseGrams)} g ${escapeHtml(String(ing.name).toLowerCase())}${ing.jp ? ` ${escapeHtml(ing.jp)}` : ""}</span>`
    )
    .join("");
  steps.push(
    stepHtml({
      num: nextNum,
      label: STEP_LABELS.shape,
      sub: `Per piece: ${grams(recipe.yieldGrams)}`,
      body: `<div class="piece-chips">${chips}</div>`
    })
  );
  $("#steps").innerHTML = steps.join("");

  // Totals check
  const warnings = split.warnings ?? [];
  const lines = [
    `Pieces: ${pieces} × ${n1(doughPerPiece)} g dough = ${grams(finishedDough)}${lossPct ? `, + ${lossPct}% handling = ${grams(cooked)}` : ""}`,
    `Portions: ${split.colorPortions.map((p) => n1(p.totalGrams)).join(" + ")} = ${grams(cooked)}`,
    `Base: ${grams(rawExact)} raw cooks down to ${grams(cooked)} (${n1(base.yieldGrams)} g cooked per ${n1(rawSum)} g raw)`
  ];
  const warn = warnings.length > 0;
  $("#totals").innerHTML = `<section class="check-box ${warn ? "warn" : "ok"}" aria-label="Totals check">
    ${warn ? ICON_WARN : ICON_OK}
    <div>
      <div class="check-title">${warn ? "You may come up short" : "Totals add up"}</div>
      ${warnings.map((w) => `<div class="check-line">${escapeHtml(w)}</div>`).join("")}
      ${lines.map((line) => `<div class="check-line">${escapeHtml(line)}</div>`).join("")}
    </div>
  </section>`;

  // Per-color mini batches
  const head = split.colorPortions
    .map((portion, index) => `<th scope="col">${bi(coloredIngredients[index] ?? portion)}</th>`)
    .join("");
  const body = base.ingredients
    .map((baseIng) => {
      const cells = split.colorPortions
        .map((portion) => {
          const match = portion.baseDoughIngredients.find((i) => i.id === baseIng.id);
          return `<td>${grams(match?.scaledRoundedGrams ?? 0)}</td>`;
        })
        .join("");
      return `<tr><th scope="row">${bi(baseIng)}</th>${cells}</tr>`;
    })
    .join("");
  $("#minibatch").innerHTML = `<div class="disclosure">
    <button type="button" class="disclosure-toggle" id="matrix-toggle" aria-expanded="${plan.matrixOpen}" aria-controls="matrix-panel">
      <span>Making each color as its own mini batch?</span>${ICON_CHEVRON}
    </button>
    <div id="matrix-panel" class="table-wrap"${plan.matrixOpen ? "" : " hidden"}>
      <table class="matrix"><thead><tr><th scope="col">Raw ingredient</th>${head}</tr></thead><tbody>${body}</tbody></table>
    </div>
  </div>`;
}

// Long labels on wide screens; short ones on phones, where three stats share one row.
function statHtml(label, value, sub, shortLabel = label, shortSub = sub) {
  const pair = (long, short) =>
    long === short
      ? escapeHtml(long)
      : `<span class="long">${escapeHtml(long)}</span><span class="short">${escapeHtml(short)}</span>`;
  return `<div class="stat"><div class="stat-label">${pair(label, shortLabel)}</div><div class="stat-value">${escapeHtml(value)}</div><div class="stat-sub">${pair(sub, shortSub)}</div></div>`;
}

function setOut(name, value, html = false) {
  $$(`[data-out="${name}"]`).forEach((el) => {
    if (html) el.innerHTML = value;
    else el.textContent = value;
  });
}

// Keep every control bound to the same key in sync (wide panel, phone bar, options sheet).
function syncControls() {
  const recipe = getRecipe(plan.recipeId);
  const values = {
    recipeId: recipe?.id ?? "",
    pieces: plan.pieces,
    loss: plan.loss,
    baseId: activeBase(recipe)?.id ?? "",
    round: plan.round,
    coloring: plan.coloring,
    liquid: plan.liquid
  };

  $$("[data-bind]").forEach((el) => {
    if (el === document.activeElement && el.tagName === "INPUT") return;
    el.value = String(values[el.dataset.bind] ?? "");
  });
  $$("[data-set]").forEach((el) => {
    el.setAttribute("aria-pressed", String(String(values[el.dataset.set]) === el.dataset.value));
  });

  document.body.dataset.view = plan.view;
  $("#view-wizard").hidden = plan.view !== "wizard";
  $("#view-plan").hidden = plan.view !== "plan";
  $("#view-studio").hidden = plan.view !== "studio";
  const section = plan.view === "wizard" ? "plan" : plan.view;
  $$("[data-go]").forEach((el) => {
    if (el.dataset.go === section) el.setAttribute("aria-current", "page");
    else el.removeAttribute("aria-current");
  });

}

// ---------------------------------------------------------------------------
// Guided setup
// ---------------------------------------------------------------------------

const WIZARD_STEPS = 5;

function choiceHtml(key, value, title, description) {
  return `<button type="button" class="choice" data-set="${key}" data-value="${escapeHtml(value)}">
    <span class="choice-title">${title}</span>
    ${description ? `<span class="choice-desc">${description}</span>` : ""}
  </button>`;
}

function renderWizard() {
  const step = plan.wizStep;
  const recipe = getRecipe(plan.recipeId);
  let title = "";
  let help = "";
  let body = "";

  if (step === 1) {
    title = "What are you making?";
    help = "Pick a design. You can add your own later in Recipe Studio.";
    body = `<div class="wiz-cards">${recipeCardsHtml()}</div>`;
  } else if (step === 2) {
    title = "How many pieces?";
    help = recipe ? `Each ${bi(recipe)} weighs ${grams(recipe.yieldGrams)}.` : "";
    body = `
      <div class="stepper stepper-large wiz-stepper">
        <button type="button" class="step-btn" data-step="-1" aria-label="One fewer piece">−</button>
        <input class="num" type="number" inputmode="numeric" min="1" step="1" data-bind="pieces" aria-label="Number of pieces" />
        <button type="button" class="step-btn" data-step="1" aria-label="One more piece">+</button>
      </div>
      <div class="chips five" role="group" aria-label="Common amounts">
        ${[4, 6, 10, 12, 20].map((n) => `<button type="button" class="chip-btn" data-set="pieces" data-value="${n}">${n}</button>`).join("")}
      </div>
      <p class="hint num wiz-out" data-out="piecesLine"></p>`;
  } else if (step === 3) {
    title = "Add a little extra dough?";
    help = "Some dough always sticks to hands, cloths and tools while you color and shape. A little extra means you won't run short.";
    body = `<div class="choices">
      ${choiceHtml("loss", 0, "No extra", "You work cleanly and want exact amounts.")}
      ${choiceHtml("loss", 5, "A little · 5%", "For simple shapes with few colors.")}
      ${choiceHtml("loss", 10, "Recommended · 10%", "A safe choice, especially the first few times.")}
      ${choiceHtml("loss", 15, "Generous · 15%", "Lots of small details, very soft dough, or you want spare.")}
    </div>`;
  } else if (step === 4) {
    title = "How precise is your scale?";
    help = "Weigh-outs are always rounded up, so a portion is never lighter than it should be.";
    body = `<div class="choices">
      ${choiceHtml("round", 0, "Exact · 0.1 g", "For a precise digital scale.")}
      ${choiceHtml("round", 0.5, "Half grams · 0.5 g", "Rounded up to the nearest half gram.")}
      ${choiceHtml("round", 1, "Whole grams · 1 g", "Easiest to weigh on a basic kitchen scale.")}
    </div>`;
  } else {
    title = "How will you color the dough?";
    help = "This only changes the water in the base dough.";
    body = `<div class="choices">
      ${choiceHtml("coloring", "powder", "Powder", "Doesn’t change the water.")}
      ${choiceHtml("coloring", "liquid", "Liquid", "Its weight is taken off the water, so the dough isn’t too wet.")}
    </div>
    <label class="inline-field wiz-liquid" data-only-liquid>About how much liquid coloring in total? (g)
      <input class="fld num" type="number" inputmode="decimal" min="0" step="0.1" data-bind="liquid" />
    </label>
    <p class="hint">You can change any of these later, next to your recipe.</p>`;
  }

  $("#wiz-count").textContent = `Step ${step} of ${WIZARD_STEPS}`;
  $$(".wiz-dots i").forEach((dot, index) => dot.classList.toggle("on", index < step));
  $("#wiz-title").textContent = title;
  $("#wiz-help").innerHTML = help;
  $("#wiz-body").innerHTML = body;
  $("#wiz-help").hidden = !help;

  const back = $("#wiz-back");
  back.textContent = step === 1 ? (plan.setupDone ? "Cancel" : "") : "Back";
  back.hidden = step === 1 && !plan.setupDone;
  $("#wiz-next").textContent = step === WIZARD_STEPS ? "Show my recipe" : "Next";
  $$("#wiz-body [data-only-liquid]").forEach((el) => (el.hidden = plan.coloring !== "liquid"));
}

function goWizard(step) {
  plan.wizStep = Math.min(Math.max(step, 1), WIZARD_STEPS);
  plan.view = "wizard";
  renderWizard();
  refreshPlan();
  window.scrollTo({ top: 0 });
  $("#wiz-title").focus({ preventScroll: true });
}

function finishWizard() {
  plan.setupDone = true;
  plan.view = "plan";
  refreshPlan();
  window.scrollTo({ top: 0 });
}

function refreshPlan() {
  renderPlan();
  syncControls();
  savePlanPrefs();
}

function setPlanValue(key, raw) {
  switch (key) {
    case "recipeId": {
      plan.recipeId = raw;
      plan.baseId = getRecipe(raw)?.baseDoughRecipeId ?? "";
      break;
    }
    case "pieces": {
      const value = Math.round(Number.parseFloat(raw));
      plan.pieces = Number.isFinite(value) && value > 0 ? Math.min(value, 9999) : 1;
      break;
    }
    case "loss": {
      const value = Number.parseFloat(raw);
      plan.loss = LOSS_OPTIONS.includes(value) ? value : 0;
      break;
    }
    case "round":
      plan.round = Number.parseFloat(raw) || 0;
      break;
    case "coloring":
      plan.coloring = raw === "liquid" ? "liquid" : "powder";
      break;
    case "liquid":
      plan.liquid = Math.max(0, Number.parseFloat(raw) || 0);
      break;
    case "baseId":
      plan.baseId = raw;
      break;
    default:
      return;
  }
  refreshPlan();
}

// ---------------------------------------------------------------------------
// Recipe Studio
// ---------------------------------------------------------------------------

function draftFromRecipe(recipe, lib) {
  if (lib === "design") {
    return {
      originalId: recipe.id,
      name: recipe.name ?? "",
      jp: recipe.jp ?? "",
      description: recipe.description ?? "",
      baseDoughRecipeId: recipe.baseDoughRecipeId ?? baseDoughs[0]?.id ?? "",
      rows: (recipe.ingredients ?? []).map((ing) => ({
        name: ing.name ?? "",
        jp: ing.jp ?? "",
        g: Number(ing.baseGrams) || 0,
        swatch: swatchFor(ing),
        part: ing.type === "filling" ? "filling" : "dough"
      }))
    };
  }
  return {
    originalId: recipe.id,
    name: recipe.name ?? "",
    jp: recipe.jp ?? "",
    description: recipe.description ?? "",
    yieldGrams: Number(recipe.yieldGrams) || 0,
    rows: (recipe.ingredients ?? []).map((ing) => ({ name: ing.name ?? "", jp: ing.jp ?? "", g: Number(ing.baseGrams) || 0 }))
  };
}

function blankDraft(lib) {
  if (lib === "design") {
    return {
      originalId: "",
      name: "",
      jp: "",
      description: "",
      baseDoughRecipeId: baseDoughs[0]?.id ?? "",
      rows: [
        { name: "White", jp: "白", g: 20, swatch: COLOR_SWATCHES.white, part: "dough" },
        { name: "", jp: "", g: 0, swatch: COLOR_SWATCHES.pink, part: "dough" }
      ]
    };
  }
  return {
    originalId: "",
    name: "",
    jp: "",
    description: "",
    yieldGrams: 0,
    rows: [
      { name: "White bean paste", jp: "白こしあん", g: 300 },
      { name: "Shiratama flour", jp: "白玉粉", g: 10 },
      { name: "Water", jp: "水", g: 20 },
      { name: "Granulated sugar", jp: "グラニュー糖", g: 20 }
    ]
  };
}

function studioList() {
  return studio.lib === "design" ? recipes : baseDoughs;
}

function selectInStudio(lib, id) {
  studio.lib = lib;
  const item = studioList().find((x) => x.id === id) ?? null;
  studio.selectedId = item?.id ?? null;
  studio.draft = item ? draftFromRecipe(item, lib) : blankDraft(lib);
  studio.dirty = false;
  studio.saved = false;
  studio.confirmDelete = false;
  renderStudio();
}

function renderLibrary() {
  const isDesign = studio.lib === "design";
  $$("[data-lib]").forEach((el) => el.setAttribute("aria-pressed", String(el.dataset.lib === studio.lib)));
  $("#new-recipe-label").textContent = isDesign ? "New design" : "New base dough";
  $("#library-list").innerHTML = studioList()
    .map((item) => {
      const current = item.id === studio.selectedId;
      const raw = sumGrams(item.ingredients ?? []);
      const meta = isDesign ? `${grams(item.yieldGrams)} / piece` : `${n1(item.yieldGrams)} g from ${n1(raw)} g`;
      const warn = !isDesign && checkRecipeConsistency({ baseDoughRecipe: item }).length > 0;
      return `<button type="button" class="lib-item" data-pick="${escapeHtml(item.id)}" aria-current="${current}">
        <span class="card-top"><span class="card-name">${bi(item)}</span><span class="card-meta num">${meta}</span></span>
        ${isDesign ? barHtml(doughParts(item)) : ""}
        ${warn ? `<span class="lib-warn">Yield not measured yet</span>` : ""}
      </button>`;
    })
    .join("");
}

function renderEditor() {
  const d = studio.draft;
  const isDesign = studio.lib === "design";
  const builtIn = d.originalId && isBuiltInRecipe(d.originalId);
  const baseOptions = baseDoughs
    .map((base) => `<option value="${escapeHtml(base.id)}"${base.id === d.baseDoughRecipeId ? " selected" : ""}>${escapeHtml(biText(base))}</option>`)
    .join("");

  const headCells = isDesign
    ? `<span>Color</span><span>English</span><span>Japanese 日本語</span><span class="right">Grams</span><span>Part</span><span><span class="visually-hidden">Remove</span></span>`
    : `<span>English</span><span>Japanese 日本語</span><span class="right">Grams</span><span><span class="visually-hidden">Remove</span></span>`;

  $("#recipe-form").innerHTML = `
    <div class="editor-card">
      <div class="editor-head">
        <h2 class="editor-title" id="editor-title"></h2>
        <span class="status" id="editor-status" aria-live="polite"></span>
      </div>
      <div class="two-col">
        <label class="field-label">Name (English)
          <input class="fld" type="text" data-draft="name" value="${escapeHtml(d.name)}" placeholder="${isDesign ? "Camellia" : "Spring Base"}" autocomplete="off" />
        </label>
        <label class="field-label">Name (Japanese) 日本語名
          <input class="fld" type="text" lang="ja" data-draft="jp" value="${escapeHtml(d.jp)}" placeholder="${isDesign ? "椿" : "春の生地"}" autocomplete="off" />
        </label>
      </div>
      <div class="two-col">
        <label class="field-label">Notes
          <textarea class="fld" rows="2" data-draft="description" placeholder="Shaping notes, tools, season">${escapeHtml(d.description)}</textarea>
        </label>
        ${
          isDesign
            ? `<label class="field-label">Base dough<select class="fld" data-draft="baseDoughRecipeId">${baseOptions}</select></label>`
            : `<label class="field-label">Cooked yield (g), weighed after cooking
                 <input class="fld num" type="number" inputmode="decimal" min="0" step="1" data-draft="yieldGrams" value="${escapeHtml(d.yieldGrams || "")}" />
                 <span class="hint" id="yield-note"></span>
               </label>`
        }
      </div>
    </div>

    <div class="editor-card">
      <div class="rows-head">
        <div>
          <h3 class="rows-title">${isDesign ? 'What goes into one piece <span class="jp">一個分</span>' : 'Ingredients <span class="jp">材料</span>'}</h3>
          <p class="hint">${
            isDesign
              ? "Each colored portion of dough, plus any filling. The piece weight is the total, so it always adds up."
              : "Raw weights for one batch, before cooking."
          }</p>
        </div>
        <button type="button" class="secondary-btn" id="add-row">${ICON_PLUS} ${isDesign ? "Add portion" : "Add ingredient"}</button>
      </div>
      ${isDesign ? `<div id="preview-bar"></div>` : ""}
      <div class="rows-scroll">
        <div class="rows-grid">
          <div class="edit-row head ${isDesign ? "design" : "base"}">${headCells}</div>
          ${d.rows.map((row, index) => editRowHtml(row, index, isDesign)).join("")}
        </div>
      </div>
      <div class="totals-line" id="totals-line"></div>
    </div>

    <div class="issues" id="issues" hidden></div>

    <div class="actions">
      <button type="submit" class="primary-btn">Save recipe</button>
      <button type="button" class="secondary-btn" id="duplicate-recipe">Duplicate</button>
      <span class="spacer"></span>
      ${
        builtIn
          ? `<span class="hint">Built-in recipe: you can edit it, but not delete it.</span>`
          : d.originalId
            ? studio.confirmDelete
              ? `<span class="confirm">Delete ${escapeHtml(d.name || "this recipe")}? This can’t be undone.
                   <button type="button" class="danger-btn" id="confirm-delete">Delete</button>
                   <button type="button" class="secondary-btn" id="cancel-delete">Keep it</button></span>`
              : `<button type="button" class="danger-text" id="ask-delete">Delete…</button>`
            : ""
      }
    </div>`;

  renderEditorMeta();
}

function editRowHtml(row, index, isDesign) {
  const label = escapeHtml(row.name.trim() || `row ${index + 1}`);
  const missingJp = row.name.trim() && !row.jp.trim() ? " missing" : "";
  const common = `
    <input class="fld" type="text" data-row="${index}" data-field="name" value="${escapeHtml(row.name)}" aria-label="English name, ${label}" placeholder="${isDesign ? "Purple" : "Ingredient"}" autocomplete="off" />
    <input class="fld${missingJp}" type="text" lang="ja" data-row="${index}" data-field="jp" value="${escapeHtml(row.jp)}" aria-label="Japanese name, ${label}" placeholder="${isDesign ? "紫" : "材料"}" autocomplete="off" />
    <input class="fld num right" type="number" inputmode="decimal" min="0" step="0.1" data-row="${index}" data-field="g" value="${escapeHtml(row.g || "")}" aria-label="Grams, ${label}" />`;
  const remove = `<button type="button" class="icon-btn" data-remove-row="${index}" aria-label="Remove ${label}">${ICON_TRASH}</button>`;

  if (!isDesign) {
    return `<div class="edit-row base">${common}${remove}</div>`;
  }
  return `<div class="edit-row design">
    <input type="color" class="color-input" data-row="${index}" data-field="swatch" value="${escapeHtml(row.swatch)}" aria-label="Color, ${label}" />
    ${common}
    <select class="fld" data-row="${index}" data-field="part" aria-label="Part, ${label}">
      <option value="dough"${row.part === "dough" ? " selected" : ""}>Dough 生地</option>
      <option value="filling"${row.part === "filling" ? " selected" : ""}>Filling 中あん</option>
    </select>
    ${remove}
  </div>`;
}

function draftIssues() {
  const d = studio.draft;
  const isDesign = studio.lib === "design";
  const blocking = [];
  const notes = [];
  const named = d.rows.filter((row) => row.name.trim());

  if (!d.name.trim()) blocking.push("Add an English name.");
  if (named.length < 2) blocking.push(isDesign ? "Add at least two portions." : "Add at least two ingredients.");
  if (named.some((row) => !(Number(row.g) > 0))) blocking.push("Every row needs grams above zero.");
  if (!isDesign) {
    const raw = sumGrams(named, "g");
    if (!(Number(d.yieldGrams) > 0)) blocking.push("Enter the cooked yield you weighed.");
    else if (Number(d.yieldGrams) >= raw) notes.push("Cooked yield can’t match or beat the raw total. Water cooks off, so weigh a real batch.");
  }
  if (!d.jp.trim()) notes.push("Add a Japanese name so labels stay bilingual everywhere.");
  const missing = named.filter((row) => !row.jp.trim()).length;
  if (missing) notes.push(`${missing} ${missing === 1 ? "row is" : "rows are"} missing a Japanese name.`);

  return { blocking, notes };
}

// Updates the parts of the editor that depend on typed values, without re-rendering inputs.
function renderEditorMeta() {
  const d = studio.draft;
  const isDesign = studio.lib === "design";
  const exists = Boolean(d.originalId);
  const title = $("#editor-title");
  if (!title) return;

  title.innerHTML = d.name.trim() || d.jp.trim()
    ? bi({ name: d.name.trim() || "Untitled", jp: d.jp.trim() })
    : isDesign ? "New design" : "New base dough";

  const status = $("#editor-status");
  status.className = "status";
  if (studio.saved) {
    status.textContent = "Saved on this device";
    status.classList.add("saved");
  } else if (studio.dirty || !exists) {
    status.textContent = studio.dirty ? "Unsaved changes" : "Not saved yet";
    status.classList.add("pending");
  } else {
    status.textContent = "Saved";
  }

  const named = d.rows.filter((row) => row.name.trim() || Number(row.g) > 0);
  if (isDesign) {
    const dough = named.filter((row) => row.part !== "filling");
    const doughG = sumGrams(dough, "g");
    const fillingG = sumGrams(named, "g") - doughG;
    $("#preview-bar").innerHTML = barHtml(dough.map((row) => ({ baseGrams: row.g, swatch: row.swatch })), "big");
    $("#totals-line").innerHTML = `<span>Per piece: ${grams(doughG)} dough${fillingG ? ` + ${grams(fillingG)} filling` : ""}</span><strong>${grams(doughG + fillingG)}</strong>`;
  } else {
    const raw = sumGrams(named, "g");
    const yieldG = Number(d.yieldGrams) || 0;
    $("#totals-line").innerHTML = `<span>Raw total for one batch</span><strong>${grams(raw)}</strong>`;
    const note = $("#yield-note");
    if (yieldG > 0 && yieldG < raw) {
      note.textContent = `${grams(raw - yieldG)} cooks off (${n1(((raw - yieldG) / raw) * 100)}%). The calculator uses this to work out how much raw dough to make.`;
      note.classList.remove("note-warn");
    } else {
      note.textContent = `Weigh the whole batch right after cooking. Raw total is ${grams(raw)}.`;
      note.classList.add("note-warn");
    }
  }

  const { blocking, notes } = draftIssues();
  const issues = $("#issues");
  const all = [...blocking, ...notes];
  issues.hidden = all.length === 0;
  issues.innerHTML = all.map((msg) => `<div>${escapeHtml(msg)}</div>`).join("");
}

function renderStudio() {
  renderLibrary();
  renderEditor();
}

function uniqueIds(ingredients) {
  const seen = new Map();
  return ingredients.map((ing) => {
    const count = seen.get(ing.id) ?? 0;
    seen.set(ing.id, count + 1);
    return count ? { ...ing, id: `${ing.id}-${count + 1}` } : ing;
  });
}

function saveDraft() {
  const d = studio.draft;
  const isDesign = studio.lib === "design";
  const { blocking } = draftIssues();
  if (blocking.length) {
    renderEditorMeta();
    $("#issues").scrollIntoView({ behavior: "smooth", block: "nearest" });
    return;
  }

  const rows = d.rows.filter((row) => row.name.trim());
  let payload;

  if (isDesign) {
    payload = {
      id: d.originalId || undefined,
      originalId: d.originalId,
      name: d.name,
      jp: d.jp,
      description: d.description,
      baseDoughRecipeId: d.baseDoughRecipeId,
      yieldGrams: sumGrams(rows, "g"),
      ingredients: rows.map((row) => {
        const filling = row.part === "filling";
        const white = isWhite(row);
        return {
          name: row.name.trim(),
          jp: row.jp,
          baseGrams: row.g,
          type: filling ? "filling" : "colored-dough",
          swatch: row.swatch,
          ...(!filling && !white ? { colorLabel: row.name.trim().toLowerCase() } : {})
        };
      })
    };
  } else {
    const waterIndex = rows.findIndex((row) => /water/i.test(row.name) || row.jp.trim() === "水");
    payload = {
      id: d.originalId || undefined,
      originalId: d.originalId,
      name: d.name,
      jp: d.jp,
      description: d.description,
      yieldGrams: d.yieldGrams,
      hydrationTargetIngredientId: waterIndex >= 0 ? buildIngredientId(rows[waterIndex].name, waterIndex) : "",
      ingredients: rows.map((row) => ({ name: row.name.trim(), jp: row.jp, baseGrams: row.g }))
    };
  }

  const validation = validateRecipeInput(payload, studioList());
  if (!validation.ok) {
    const issues = $("#issues");
    issues.hidden = false;
    issues.innerHTML = `<div>${escapeHtml(validation.error)}</div>`;
    return;
  }

  const saved = { ...validation.value, ingredients: uniqueIds(validation.value.ingredients) };
  if (!saved.hydrationTargetIngredientId) delete saved.hydrationTargetIngredientId;

  if (isDesign) {
    recipes = upsertRecipe(recipes, saved);
    saveRecipes(recipes);
  } else {
    baseDoughs = upsertBaseDoughRecipe(baseDoughs, saved);
    saveBaseDoughRecipes(baseDoughs);
  }

  studio.selectedId = saved.id;
  studio.draft = draftFromRecipe(isDesign ? recipes.find((r) => r.id === saved.id) : baseDoughs.find((b) => b.id === saved.id), studio.lib);
  studio.dirty = false;
  studio.saved = true;
  studio.confirmDelete = false;

  afterLibraryChange();
}

function deleteCurrent() {
  const id = studio.draft.originalId;
  if (!id || isBuiltInRecipe(id)) return;

  if (studio.lib === "design") {
    recipes = deleteRecipe(recipes, id);
    saveRecipes(recipes);
    if (plan.recipeId === id) plan.recipeId = recipes[0]?.id ?? "";
  } else {
    baseDoughs = deleteRecipe(baseDoughs, id);
    saveBaseDoughRecipes(baseDoughs);
    if (plan.baseId === id) plan.baseId = "";
  }
  const first = studioList()[0];
  selectInStudio(studio.lib, first?.id);
  afterLibraryChange();
}

function afterLibraryChange() {
  renderRecipeCards();
  renderOptions();
  renderStudio();
  refreshPlan();
}

// ---------------------------------------------------------------------------
// Events
// ---------------------------------------------------------------------------

document.addEventListener("click", (event) => {
  const target = event.target.closest("button, [data-go]");
  if (!target) return;

  if (target.dataset.go) {
    if (target.dataset.go === "plan" && !plan.setupDone) {
      goWizard(plan.wizStep);
      return;
    }
    plan.view = target.dataset.go;
    refreshPlan();
    window.scrollTo({ top: 0 });
    return;
  }
  if (target.dataset.set) {
    setPlanValue(target.dataset.set, target.dataset.value);
    // Picking a design on the first question moves straight on to the next one.
    if (plan.view === "wizard" && plan.wizStep === 1 && target.dataset.set === "recipeId") goWizard(2);
    else if (plan.view === "wizard") $$("#wiz-body [data-only-liquid]").forEach((el) => (el.hidden = plan.coloring !== "liquid"));
    return;
  }
  if (target.dataset.step) {
    setPlanValue("pieces", String((Number(plan.pieces) || 1) + Number(target.dataset.step)));
    return;
  }
  if (target.dataset.lib) {
    selectInStudio(target.dataset.lib, (target.dataset.lib === "design" ? recipes : baseDoughs)[0]?.id);
    return;
  }
  if (target.dataset.pick) {
    selectInStudio(studio.lib, target.dataset.pick);
    return;
  }
  if (target.dataset.removeRow !== undefined) {
    studio.draft.rows.splice(Number(target.dataset.removeRow), 1);
    studio.dirty = true;
    studio.saved = false;
    renderEditor();
    return;
  }

  switch (target.id) {
    case "wiz-next":
      if (plan.wizStep >= WIZARD_STEPS) finishWizard();
      else goWizard(plan.wizStep + 1);
      break;
    case "wiz-back":
      if (plan.wizStep === 1) finishWizard();
      else goWizard(plan.wizStep - 1);
      break;
    case "change-answers":
      goWizard(1);
      break;
    case "sidebar-new":
      plan.view = "studio";
      selectInStudio("design", null);
      refreshPlan();
      window.scrollTo({ top: 0 });
      $('[data-draft="name"]')?.focus();
      break;
    case "matrix-toggle":
      plan.matrixOpen = !plan.matrixOpen;
      renderPlan();
      break;
    case "open-options":
      $("#options-sheet").showModal();
      break;
    case "close-options":
      $("#options-sheet").close();
      break;
    case "reset-options":
      plan.round = 0;
      plan.coloring = "powder";
      plan.baseId = getRecipe(plan.recipeId)?.baseDoughRecipeId ?? "";
      refreshPlan();
      break;
    case "new-recipe":
      selectInStudio(studio.lib, null);
      $('[data-draft="name"]')?.focus();
      break;
    case "add-row": {
      const isDesign = studio.lib === "design";
      studio.draft.rows.push(isDesign ? { name: "", jp: "", g: 0, swatch: COLOR_SWATCHES.yellow, part: "dough" } : { name: "", jp: "", g: 0 });
      studio.dirty = true;
      studio.saved = false;
      renderEditor();
      $(`[data-row="${studio.draft.rows.length - 1}"][data-field="name"]`)?.focus();
      break;
    }
    case "duplicate-recipe": {
      const copy = structuredClone(studio.draft);
      copy.originalId = "";
      copy.name = `${copy.name || "Untitled"} copy`;
      copy.jp = copy.jp ? `${copy.jp}（コピー）` : "";
      studio.draft = copy;
      studio.selectedId = null;
      studio.dirty = true;
      studio.saved = false;
      studio.confirmDelete = false;
      renderStudio();
      break;
    }
    case "ask-delete":
      studio.confirmDelete = true;
      renderEditor();
      break;
    case "cancel-delete":
      studio.confirmDelete = false;
      renderEditor();
      break;
    case "confirm-delete":
      deleteCurrent();
      break;
    default:
      break;
  }
});

// Click on the dimmed area closes the phone sheet.
$("#options-sheet").addEventListener("click", (event) => {
  if (event.target === event.currentTarget) event.currentTarget.close();
});

document.addEventListener("change", (event) => {
  const el = event.target;
  if (el.dataset.bind) {
    setPlanValue(el.dataset.bind, el.value);
  } else if (el.dataset.done) {
    plan.done[el.dataset.done] = el.checked;
  } else if (el.dataset.field === "part" || el.dataset.draft === "baseDoughRecipeId") {
    handleDraftInput(el);
    renderEditorMeta();
  }
});

document.addEventListener("input", (event) => {
  const el = event.target;
  if (el.dataset.bind === "pieces" || el.dataset.bind === "liquid") {
    if (el.value === "") return; // let people clear the field while typing
    setPlanValue(el.dataset.bind, el.value);
  } else if (el.dataset.draft || el.dataset.row !== undefined) {
    handleDraftInput(el);
  }
});

function handleDraftInput(el) {
  const d = studio.draft;
  if (el.dataset.draft) {
    d[el.dataset.draft] = el.dataset.draft === "yieldGrams" ? Number.parseFloat(el.value) || 0 : el.value;
  } else {
    const row = d.rows[Number(el.dataset.row)];
    if (!row) return;
    row[el.dataset.field] = el.dataset.field === "g" ? Number.parseFloat(el.value) || 0 : el.value;
    if (el.dataset.field === "jp" || el.dataset.field === "name") {
      const jpInput = $(`[data-row="${el.dataset.row}"][data-field="jp"]`);
      jpInput?.classList.toggle("missing", Boolean(row.name.trim() && !row.jp.trim()));
    }
  }
  studio.dirty = true;
  studio.saved = false;
  renderEditorMeta();
}

$("#recipe-form").addEventListener("submit", (event) => {
  event.preventDefault();
  saveDraft();
});

// ---------------------------------------------------------------------------
// Start
// ---------------------------------------------------------------------------

if (!getRecipe(plan.recipeId) || plan.recipeId !== getRecipe(plan.recipeId)?.id) {
  plan.recipeId = recipes[0]?.id ?? "";
}
if (!plan.baseId) plan.baseId = getRecipe(plan.recipeId)?.baseDoughRecipeId ?? "";

renderRecipeCards();
renderOptions();
selectInStudio("design", recipes[0]?.id);
renderWizard();
refreshPlan();
