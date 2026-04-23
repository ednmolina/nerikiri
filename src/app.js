import { calculateRecipePlan, deriveTargetOutputGrams, calculateColorSplit } from "./calculator.js";
import {
  buildIngredientId,
  loadBaseDoughRecipes,
  loadRecipes,
  saveBaseDoughRecipes,
  saveRecipes,
  upsertBaseDoughRecipe,
  upsertRecipe,
  validateRecipeInput
} from "./recipe-store.js";

const DEFAULT_STATE = {
  recipeId: "iris-nerikiri",
  baseDoughRecipeId: "base-nerikiri-paste",
  mode: "exact",
  pieceCount: 1,
  pieceWeightGrams: 41,
  batchWeightGrams: 41,
  processLossPct: 0,
  roundToIncrement: "",
  coloringMode: "powder",
  liquidColoringAmount: 0
};

const EXAMPLE_STATE = {
  ...DEFAULT_STATE
};

const EMPTY_RECIPE_TEMPLATE = {
  originalId: "",
  name: "",
  description: "",
  yieldGrams: 41,
  baseDoughRecipeId: "base-nerikiri-paste",
  hydrationTargetIngredientId: "",
  ingredients: [
    { name: "White nerikiri paste", baseGrams: 22, role: undefined },
    { name: "Purple nerikiri paste", baseGrams: 3, role: undefined },
    { name: "Yellow nerikiri paste", baseGrams: 1, role: undefined },
    { name: "Green nerikiri paste", baseGrams: 2, role: undefined },
    { name: "Inner filling paste", baseGrams: 13, role: undefined }
  ]
};

const EMPTY_BASE_DOUGH_TEMPLATE = {
  originalId: "",
  name: "",
  description: "",
  yieldGrams: 330,
  baseDoughRecipeId: "",
  hydrationTargetIngredientId: "water",
  ingredients: [
    { name: "White bean paste", baseGrams: 300, role: undefined },
    { name: "Shiratama flour", baseGrams: 10, role: undefined },
    { name: "Water", baseGrams: 20, role: "hydration-target" },
    { name: "Granulated sugar", baseGrams: 20, role: undefined }
  ]
};

const form = document.querySelector("#calculator-form");
const recipeForm = document.querySelector("#recipe-form");
const resultsRoot = document.querySelector("#results");
const heroMetricsRoot = document.querySelector("#hero-metrics");
const loadExampleButton = document.querySelector("#load-example");
const recipeSelect = document.querySelector("#recipeId");
const baseDoughSelect = document.querySelector("#baseDoughRecipeId");
const baseDoughField = document.querySelector("#base-dough-field");
const exactFields = document.querySelector("#exact-fields");
const batchFields = document.querySelector("#batch-fields");
const liquidFields = document.querySelector("#liquid-fields");
const recipeLibraryRoot = document.querySelector("#recipe-library");
const recipeLibraryHeading = document.querySelector("#recipe-library-heading");
const ingredientEditorRoot = document.querySelector("#ingredient-editor");
const recipeFormMessage = document.querySelector("#recipe-form-message");
const newRecipeButton = document.querySelector("#new-recipe");
const addIngredientButton = document.querySelector("#add-ingredient");
const duplicateRecipeButton = document.querySelector("#duplicate-recipe");
const studioEditorHeading = document.querySelector("#studio-editor-heading");
const studioBaseDoughSelect = document.querySelector("#studio-baseDoughRecipeId");
const studioBaseDoughField = document.querySelector("#studio-base-dough-field");
const viewTabs = Array.from(document.querySelectorAll("[data-view]"));
const viewPanels = Array.from(document.querySelectorAll("[data-view-panel]"));
const libraryTypeTabs = Array.from(document.querySelectorAll("[data-library-type]"));

const formatter = new Intl.NumberFormat("en-US", {
  minimumFractionDigits: 0,
  maximumFractionDigits: 2
});

let recipes = loadRecipes();
let baseDoughRecipes = loadBaseDoughRecipes();
let appView = "calculator";
let studioLibraryType = "design";
let studioState = createBlankStudioState();

function getStudioTemplate(libraryType = studioLibraryType) {
  return libraryType === "base-dough" ? EMPTY_BASE_DOUGH_TEMPLATE : EMPTY_RECIPE_TEMPLATE;
}

function createBlankStudioState(libraryType = studioLibraryType) {
  const template = getStudioTemplate(libraryType);

  return {
    ...template,
    ingredients: template.ingredients.map((ingredient) => ({ ...ingredient }))
  };
}

function formatGrams(value) {
  return `${formatter.format(value)} g`;
}

function formatPercent(value) {
  return `${formatter.format(value)}%`;
}

function escapeHtml(value) {
  return String(value).replace(
    /[&<>"']/g,
    (character) =>
      ({
        "&": "&amp;",
        "<": "&lt;",
        ">": "&gt;",
        '"': "&quot;",
        "'": "&#39;"
      })[character] ?? character
  );
}

function getRecipeById(recipeId) {
  return recipes.find((recipe) => recipe.id === recipeId) ?? recipes[0];
}

function getBaseDoughRecipe(baseDoughRecipeId) {
  return baseDoughRecipes.find((recipe) => recipe.id === baseDoughRecipeId) ?? null;
}

function getStudioRecipes() {
  return studioLibraryType === "base-dough" ? baseDoughRecipes : recipes;
}

function getStudioCollectionLabel() {
  return studioLibraryType === "base-dough" ? "base dough recipe" : "design recipe";
}

function getStudioCollectionHeading() {
  return studioLibraryType === "base-dough" ? "Saved base dough recipes" : "Saved design recipes";
}

function syncStudioChrome() {
  const isBaseDoughLibrary = studioLibraryType === "base-dough";

  recipeLibraryHeading.textContent = getStudioCollectionHeading();
  studioEditorHeading.textContent = isBaseDoughLibrary
    ? "Create or edit a base dough recipe"
    : "Create or edit a design recipe";
  newRecipeButton.textContent = isBaseDoughLibrary ? "New Base Dough" : "New Design Recipe";
  duplicateRecipeButton.textContent = isBaseDoughLibrary
    ? "Duplicate Base Dough"
    : "Duplicate Recipe";
  studioBaseDoughField.classList.toggle("hidden", isBaseDoughLibrary);

  libraryTypeTabs.forEach((button) => {
    button.classList.toggle("active", button.dataset.libraryType === studioLibraryType);
  });
}

function applyStudioStateToForm() {
  recipeForm.elements.name.value = studioState.name;
  recipeForm.elements.description.value = studioState.description;
  recipeForm.elements.yieldGrams.value = studioState.yieldGrams;
  studioBaseDoughSelect.value = studioState.baseDoughRecipeId || "";
  syncStudioChrome();
  renderRecipeLibrary();
  renderIngredientEditor();
}

function getSelectedValue(name) {
  return form.querySelector(`input[name="${name}"]:checked`)?.value;
}

function setRadioValue(name, value) {
  const input = document.querySelector(`input[name="${name}"][value="${value}"]`);

  if (input) {
    input.checked = true;
  }
}

function setActiveView(nextView) {
  appView = nextView;
  viewTabs.forEach((tab) => {
    tab.classList.toggle("active", tab.dataset.view === nextView);
  });
  viewPanels.forEach((panel) => {
    panel.classList.toggle("hidden", panel.dataset.viewPanel !== nextView);
  });
}

function populateCalculatorSelects() {
  const currentRecipeValue = recipeSelect.value;
  const currentBaseDoughValue = baseDoughSelect.value;
  const currentStudioBaseDoughValue = studioBaseDoughSelect.value;

  recipeSelect.innerHTML = recipes
    .map((recipe) => `<option value="${recipe.id}">${escapeHtml(recipe.name)}</option>`)
    .join("");

  baseDoughSelect.innerHTML = baseDoughRecipes
    .map((recipe) => `<option value="${recipe.id}">${escapeHtml(recipe.name)}</option>`)
    .join("");

  studioBaseDoughSelect.innerHTML = [
    `<option value="">No base dough default</option>`,
    ...baseDoughRecipes.map(
      (recipe) => `<option value="${recipe.id}">${escapeHtml(recipe.name)}</option>`
    )
  ].join("");

  if (recipes.some((recipe) => recipe.id === currentRecipeValue)) {
    recipeSelect.value = currentRecipeValue;
  } else {
    recipeSelect.value = recipes[0]?.id ?? "";
  }

  if (baseDoughRecipes.some((recipe) => recipe.id === currentBaseDoughValue)) {
    baseDoughSelect.value = currentBaseDoughValue;
  } else {
    baseDoughSelect.value = "";
  }

  if (
    currentStudioBaseDoughValue === "" ||
    baseDoughRecipes.some((recipe) => recipe.id === currentStudioBaseDoughValue)
  ) {
    studioBaseDoughSelect.value = currentStudioBaseDoughValue;
  } else {
    studioBaseDoughSelect.value = "";
  }
}

function applyCalculatorState(state) {
  recipeSelect.value = state.recipeId;
  baseDoughSelect.value = state.baseDoughRecipeId;
  form.elements.pieceCount.value = state.pieceCount;
  form.elements.pieceWeightGrams.value = state.pieceWeightGrams;
  form.elements.batchWeightGrams.value = state.batchWeightGrams;
  form.elements.processLossPct.value = state.processLossPct;
  form.elements.roundToIncrement.value = state.roundToIncrement;
  form.elements.liquidColoringAmount.value = state.liquidColoringAmount;
  setRadioValue("mode", state.mode);
  setRadioValue("coloringMode", state.coloringMode);
  syncCalculatorVisibility();
}

function readCalculatorState() {
  const recipe = getRecipeById(recipeSelect.value);

  return {
    recipeId: recipeSelect.value,
    baseDoughRecipeId: baseDoughSelect.value,
    mode: getSelectedValue("mode") ?? "exact",
    pieceCount: form.elements.pieceCount.value,
    pieceWeightGrams: recipe?.yieldGrams ?? form.elements.pieceWeightGrams.value,
    batchWeightGrams: form.elements.batchWeightGrams.value,
    processLossPct: form.elements.processLossPct.value,
    roundToIncrement: form.elements.roundToIncrement.value,
    coloringMode: getSelectedValue("coloringMode") ?? "powder",
    liquidColoringAmount: form.elements.liquidColoringAmount.value
  };
}

function syncRecipeDrivenFields({ syncBaseDough = false } = {}) {
  const recipe = getRecipeById(recipeSelect.value);

  if (!recipe) {
    return;
  }

  if (recipe.baseDoughRecipeId) {
    if (syncBaseDough || !getBaseDoughRecipe(baseDoughSelect.value)) {
      baseDoughSelect.value = recipe.baseDoughRecipeId;
    }
  }

  form.elements.pieceWeightGrams.value = recipe.yieldGrams;

  if (getSelectedValue("mode") === "exact") {
    const pieceCount = Number.parseFloat(form.elements.pieceCount.value) || 0;
    form.elements.batchWeightGrams.value = pieceCount * recipe.yieldGrams;
  }
}

function syncCalculatorVisibility() {
  const mode = getSelectedValue("mode");
  const coloringMode = getSelectedValue("coloringMode");
  const recipe = getRecipeById(recipeSelect.value);

  exactFields.classList.toggle("hidden", mode !== "exact");
  batchFields.classList.toggle("hidden", mode !== "batch");
  liquidFields.classList.toggle("hidden", coloringMode !== "liquid");
  baseDoughField.classList.toggle("hidden", !recipe?.baseDoughRecipeId);
  baseDoughSelect.disabled = !recipe?.baseDoughRecipeId;
}

function renderHero(plan, inputState, colorSplit) {
  const recipe = plan.recipe;
  const modeLabel = inputState.mode === "batch" ? "Batch grams" : "Exact pieces";

  const thirdMetric = colorSplit
    ? `<div class="metric-card">
        <span>Total base dough</span>
        <strong>${formatGrams(colorSplit.totalColoredDough)}</strong>
      </div>`
    : `<div class="metric-card">
        <span>Final water to add</span>
        <strong>${formatGrams(plan.hydration.finalWaterToAddRounded)}</strong>
      </div>`;

  heroMetricsRoot.innerHTML = `
    <div class="metric-card">
      <span>Recipe profile</span>
      <strong>${escapeHtml(recipe.name)}</strong>
    </div>
    <div class="metric-card">
      <span>Planning mode</span>
      <strong>${modeLabel}</strong>
    </div>
    ${thirdMetric}
  `;
}

function renderSummary(plan, inputState) {
  const pieceLabel =
    inputState.mode === "exact"
      ? `${inputState.pieceCount} pieces @ ${formatGrams(plan.recipe.yieldGrams)} each`
      : "Batch weight target";

  return `
    <article class="result-card">
      <h3>Batch summary</h3>
      <div class="stat-row">
        <span class="stat-label">Target output</span>
        <span class="stat-value">${formatGrams(plan.targetOutputGrams)}</span>
      </div>
      <div class="stat-row">
        <span class="stat-label">Scaled pre-loss dough</span>
        <span class="stat-value">${formatGrams(plan.requiredPreLossGrams)}</span>
      </div>
      <div class="stat-row">
        <span class="stat-label">Scale factor</span>
        <span class="stat-value">${plan.scaleFactor.toFixed(3)}x</span>
      </div>
    </article>

    <article class="result-card">
      <h3>Production detail</h3>
      <div class="stat-row">
        <span class="stat-label">Plan type</span>
        <span class="stat-value">${pieceLabel}</span>
      </div>
      <div class="stat-row">
        <span class="stat-label">Process loss</span>
        <span class="stat-value">${formatPercent(plan.settings.processLossPct)}</span>
      </div>
      <div class="stat-row">
        <span class="stat-label">Coloring mode</span>
        <span class="stat-value emphasis">${plan.settings.coloringMode}</span>
      </div>
    </article>
  `;
}

function renderHydration(plan, colorSplit) {
  const hydration = plan.hydration;
  if (!hydration.hasTargetIngredient) {
    const liquidApplied =
      plan.settings.coloringMode === "liquid" &&
      colorSplit?.totalLiquidColoringAmount > 0;
    const chipMarkup = liquidApplied
      ? `<span class="chip">Liquid coloring is distributed across the base dough water in the color split below.</span>`
      : `<span class="chip">Coloring settings do not change this recipe’s math.</span>`;
    return `
      <article class="result-card">
        <h3>Hydration adjustment</h3>
        <p>
          This recipe is modeled as a finished colored flower recipe, so it
          does not include a hydration-adjustable water ingredient.
        </p>
        <div class="chip-row">${chipMarkup}</div>
      </article>
    `;
  }

  const isLiquidMode = plan.settings.coloringMode === "liquid";
  const appliedMarkup = isLiquidMode
    ? `
        <div class="hydration-grid">
          <div class="hydration-box">
            <span>Scaled base water</span>
            <strong>${formatGrams(hydration.scaledBaseWater)}</strong>
          </div>
          <div class="hydration-box accent">
            <span>Liquid coloring counted as moisture</span>
            <strong>${formatGrams(hydration.liquidColoringContribution)}</strong>
          </div>
          <div class="hydration-box matcha">
            <span>Final water to add</span>
            <strong>${formatGrams(hydration.finalWaterToAddRounded)}</strong>
          </div>
        </div>
      `
    : `
        <div class="chip-row">
          <span class="chip">Base water target stays unchanged in powder mode.</span>
        </div>
      `;

  const warningMarkup = hydration.fullyReplacedByColoring
    ? `
        <div class="chip-row warning">
          <span class="chip warning">
            Liquid coloring fully covers the water target, so added water is clamped to zero.
          </span>
        </div>
      `
    : "";

  return `
    <article class="result-card">
      <h3>Hydration adjustment</h3>
      <p>
        The engine keeps hydration logic generic by adjusting the recipe’s
        designated water ingredient after scaling and loss handling.
      </p>
      ${appliedMarkup}
      ${warningMarkup}
    </article>
  `;
}

function renderInsight(plan) {
  const hydration = plan.hydration;
  const recipe = plan.recipe;
  if (!hydration.hasTargetIngredient) {
    return `
      <div class="insight-banner result-full">
        <strong>${escapeHtml(recipe.description)}</strong>
        This recipe scales finished colored portions directly, including the inner filling.
      </div>
    `;
  }

  const adjustmentCopy =
    plan.settings.coloringMode === "liquid"
      ? hydration.applied
        ? `Liquid coloring is replacing ${formatGrams(
            hydration.liquidColoringContribution
          )} of added water for this run.`
        : "Liquid mode is enabled, but with 0 g entered the base water stays unchanged."
      : "Powder coloring leaves the scaled water amount untouched for this run.";

  return `
    <div class="insight-banner result-full">
      <strong>${escapeHtml(recipe.description)}</strong>
      ${adjustmentCopy}
    </div>
  `;
}

function renderIngredientTable(plan) {
  const rows = plan.ingredients
    .map((ingredient) => {
      const ingredientNote =
        ingredient.isHydrationTarget && plan.hydration.applied ? "Adjusted" : "Scaled";

      return `
        <tr>
          <td>${escapeHtml(ingredient.name)}</td>
          <td>${formatGrams(ingredient.baseGrams)}</td>
          <td>${formatGrams(ingredient.scaledGrams)}</td>
          <td>${formatGrams(ingredient.toAddRoundedGrams)}</td>
          <td>${ingredientNote}</td>
        </tr>
      `;
    })
    .join("");

  return `
    <div class="table-wrap result-full">
      <div class="table-header">
        <div>
          <h3>Ingredient breakdown</h3>
          <p class="table-subtitle">
            Water stays transparent: the table shows the scaled target and the final weigh-out.
          </p>
        </div>
      </div>
      <table>
        <thead>
          <tr>
            <th>Ingredient</th>
            <th>Base recipe</th>
            <th>Scaled target</th>
            <th>Weigh out</th>
            <th>Status</th>
          </tr>
        </thead>
        <tbody>${rows}</tbody>
      </table>
    </div>
  `;
}

function renderColorSplit(colorSplit) {
  if (!colorSplit) return "";

  const baseIngredients = colorSplit.baseDoughRecipe.ingredients;
  const portions = colorSplit.colorPortions;

  // Build the cell matrix first so column/row/grand totals all derive from the same numbers.
  const cellMatrix = baseIngredients.map((baseIngredient) =>
    portions.map((portion) => {
      const match = portion.baseDoughIngredients.find((i) => i.id === baseIngredient.id);
      return match?.scaledRoundedGrams ?? 0;
    })
  );
  const columnTotals = portions.map((_, colIdx) =>
    cellMatrix.reduce((sum, row) => sum + row[colIdx], 0)
  );
  const grandTotal = columnTotals.reduce((sum, v) => sum + v, 0);

  const liquidColoringApplied = colorSplit.totalLiquidColoringAmount > 0;

  const headerCells = portions
    .map((portion, colIdx) => {
      const colorNote = portion.colorLabel
        ? `<span class="portion-color-label">+ ${portion.colorLabel}</span>`
        : `<span class="portion-color-label">uncolored</span>`;
      return `<th class="portion-col">
        <span class="portion-col-name">${escapeHtml(portion.name)}</span>
        <span class="portion-col-grams">${formatGrams(columnTotals[colIdx])}</span>
        ${colorNote}
      </th>`;
    })
    .join("");

  const bodyRows = baseIngredients
    .map((baseIngredient, rowIdx) => {
      const isWater = baseIngredient.role === "hydration-target";
      const rowTotal = cellMatrix[rowIdx].reduce((sum, v) => sum + v, 0);

      const cells = portions
        .map((portion, colIdx) => {
          const grams = cellMatrix[rowIdx][colIdx];
          return `<td class="num-cell${isWater && portion.colorLabel ? " water-cell" : ""}">${formatGrams(grams)}</td>`;
        })
        .join("");

      const waterNote =
        isWater && liquidColoringApplied
          ? ` <span class="chip" style="font-size:0.7em;padding:1px 6px;vertical-align:middle">−${formatGrams(colorSplit.totalLiquidColoringAmount)} coloring</span>`
          : "";

      return `<tr class="${isWater ? "water-row" : ""}">
        <td class="ingredient-label">${escapeHtml(baseIngredient.name)}${waterNote}</td>
        ${cells}
        <td class="num-cell total-cell">${formatGrams(rowTotal)}</td>
      </tr>`;
    })
    .join("");

  const fillingMarkup =
    colorSplit.fillingPortions.length > 0
      ? `<div class="chip-row split-filling">
          ${colorSplit.fillingPortions
            .map(
              (f) =>
                `<span class="chip">Filling (weigh separately): ${escapeHtml(f.name)} — ${formatGrams(f.totalRoundedGrams)}</span>`
            )
            .join("")}
        </div>`
      : "";

  const liquidChip = liquidColoringApplied
    ? `<div class="chip-row">
        <span class="chip">Liquid coloring (${formatGrams(colorSplit.totalLiquidColoringAmount)} total) distributed proportionally across dyed portions and subtracted from each color's water.</span>
      </div>`
    : "";

  return `
    <article class="result-card result-full">
      <h3>Base dough per color — ${escapeHtml(colorSplit.baseDoughRecipe.name)}</h3>
      <p>
        Total colored base dough: <strong>${formatGrams(colorSplit.totalColoredDough)}</strong>.
        For liquid coloring, dissolve the drops into that color's water portion before mixing.
      </p>
      ${liquidChip}
      <div class="table-wrap color-matrix-wrap">
        <table class="color-matrix">
          <thead>
            <tr>
              <th>Ingredient</th>
              ${headerCells}
              <th class="portion-col total-col">
                <span class="portion-col-name">Total</span>
                <span class="portion-col-grams">${formatGrams(grandTotal)}</span>
                <span class="portion-color-label">all colors</span>
              </th>
            </tr>
          </thead>
          <tbody>${bodyRows}</tbody>
        </table>
      </div>
      ${fillingMarkup}
    </article>
  `;
}

function renderCalculatorResults(plan, inputState, colorSplit) {
  resultsRoot.innerHTML = `
    ${renderColorSplit(colorSplit)}
    ${renderSummary(plan, inputState)}
    ${renderHydration(plan, colorSplit)}
    ${renderInsight(plan)}
    ${renderIngredientTable(plan)}
  `;
}

function renderEmptyState(message) {
  heroMetricsRoot.innerHTML = `
    <div class="metric-card">
      <span>Recipe profile</span>
      <strong>Waiting for valid input</strong>
    </div>
  `;

  resultsRoot.innerHTML = `<div class="empty-state">${message}</div>`;
}

function calculateAndRender() {
  const inputState = readCalculatorState();
  const recipe = getRecipeById(inputState.recipeId);
  const targetOutputGrams = deriveTargetOutputGrams(inputState);

  if (!recipe) {
    renderEmptyState("Create a recipe in Recipe Studio to start calculating.");
    return;
  }

  if (targetOutputGrams <= 0) {
    renderEmptyState(
      "Enter a piece plan or batch weight above zero to generate the recipe report."
    );
    return;
  }

  const plan = calculateRecipePlan({
    recipe,
    targetOutputGrams,
    settings: inputState
  });

  baseDoughField.classList.toggle("hidden", !recipe.baseDoughRecipeId);

  const baseDoughId = recipe.baseDoughRecipeId
    ? inputState.baseDoughRecipeId || recipe.baseDoughRecipeId
    : "";
  const baseDoughRecipe = baseDoughId ? getBaseDoughRecipe(baseDoughId) : null;

  const colorSplit = calculateColorSplit({ plan, baseDoughRecipe });

  renderHero(plan, inputState, colorSplit);
  renderCalculatorResults(plan, inputState, colorSplit);
}

function setRecipeFormMessage(message, type = "") {
  recipeFormMessage.textContent = message;
  recipeFormMessage.className = `form-message${type ? ` ${type}` : ""}`;
}

function loadStudioRecipe(recipe) {
  const fallbackState = createBlankStudioState();

  studioState = {
    originalId: recipe?.id ?? "",
    name: recipe?.name ?? "",
    description: recipe?.description ?? "",
    yieldGrams: recipe?.yieldGrams ?? fallbackState.yieldGrams,
    baseDoughRecipeId: recipe?.baseDoughRecipeId ?? fallbackState.baseDoughRecipeId,
    hydrationTargetIngredientId:
      recipe?.hydrationTargetIngredientId ??
      recipe?.ingredients?.find((ingredient) => ingredient.role === "hydration-target")?.id ??
      fallbackState.hydrationTargetIngredientId,
    ingredients:
      recipe?.ingredients?.map((ingredient) => ({
        ...ingredient,
        name: ingredient.name,
        baseGrams: ingredient.baseGrams,
        role: ingredient.role
      })) ?? fallbackState.ingredients
  };

  applyStudioStateToForm();
}

function renderRecipeLibrary() {
  const studioRecipes = getStudioRecipes();

  if (!studioRecipes.length) {
    recipeLibraryRoot.innerHTML = `<div class="empty-state">No ${getStudioCollectionLabel()}s yet. Create one to start building your library.</div>`;
    return;
  }

  recipeLibraryRoot.innerHTML = studioRecipes
    .map((recipe) => {
      const active = recipe.id === studioState.originalId;
      const hydrationTarget = recipe.ingredients.find(
        (ingredient) => ingredient.id === recipe.hydrationTargetIngredientId
      );
      const summaryLabel =
        studioLibraryType === "base-dough"
          ? hydrationTarget?.name ?? "No water target"
          : getBaseDoughRecipe(recipe.baseDoughRecipeId)?.name ?? "No base dough";

      return `
        <button class="library-item${active ? " active" : ""}" type="button" data-recipe-id="${recipe.id}">
          <strong>${escapeHtml(recipe.name)}</strong>
          <div class="library-meta">
            <span class="chip">${formatGrams(recipe.yieldGrams)} yield</span>
            <span class="chip">${recipe.ingredients.length} ingredients</span>
            <span class="chip">${escapeHtml(summaryLabel)}</span>
          </div>
        </button>
      `;
    })
    .join("");
}

function readStudioIngredientsFromDom() {
  const ingredientRows = Array.from(
    ingredientEditorRoot.querySelectorAll("[data-ingredient-index]")
  );

  return ingredientRows.map((row, index) => ({
    ...(studioState.ingredients[index] ?? {}),
    name: row.querySelector('[data-field="name"]')?.value ?? "",
    baseGrams: row.querySelector('[data-field="baseGrams"]')?.value ?? "",
    role: row.querySelector('[data-field="hydrationTarget"]')?.checked
      ? "hydration-target"
      : undefined
  }));
}

function syncStudioStateFromDom() {
  studioState = {
    ...studioState,
    name: recipeForm.elements.name.value,
    description: recipeForm.elements.description.value,
    yieldGrams: recipeForm.elements.yieldGrams.value,
    baseDoughRecipeId:
      studioLibraryType === "design" ? studioBaseDoughSelect.value : "",
    ingredients: readStudioIngredientsFromDom()
  };
}

function renderIngredientEditor() {
  const ingredientModels = studioState.ingredients.map((ingredient, index) => {
    const ingredientId = `studio-ingredient-${index}`;
    const hydrationChecked = ingredient.role === "hydration-target";

    return `
      <div class="ingredient-row" data-ingredient-index="${index}">
        <div class="ingredient-row-header">
          <h4>Ingredient ${index + 1}</h4>
          <button class="text-button" type="button" data-remove-ingredient="${index}">
            Remove
          </button>
        </div>
        <div class="field-grid">
          <label class="field">
            <span>Name</span>
            <input data-field="name" type="text" value="${escapeHtml(ingredient.name)}" placeholder="Water" />
          </label>
          <label class="field">
            <span>Base grams</span>
            <input data-field="baseGrams" type="number" min="0.01" step="0.01" value="${ingredient.baseGrams}" />
          </label>
        </div>
        <label class="hydration-target-toggle" for="${ingredientId}">
          <input
            id="${ingredientId}"
            data-field="hydrationTarget"
            type="radio"
            name="hydrationTargetIngredient"
            ${hydrationChecked ? "checked" : ""}
          />
          Use this ingredient for hydration adjustment
        </label>
      </div>
    `;
  });

  ingredientEditorRoot.innerHTML = ingredientModels.join("");
}

function createRecipePayloadFromForm() {
  syncStudioStateFromDom();
  const rawIngredients = studioState.ingredients.map((ingredient, index) => ({
    ...ingredient,
    name: ingredient.name,
    baseGrams: ingredient.baseGrams,
    role: ingredient.role,
    idHint: `ingredient-${index + 1}`
  }));
  const hydrationIndex = rawIngredients.findIndex(
    (ingredient) => ingredient.role === "hydration-target"
  );
  const hydrationTargetIngredientId =
    hydrationIndex >= 0
      ? buildIngredientId(rawIngredients[hydrationIndex].name, hydrationIndex)
      : "";

  return {
    id: studioState.originalId || studioState.name,
    originalId: studioState.originalId,
    name: studioState.name,
    description: studioState.description,
    yieldGrams: studioState.yieldGrams,
    baseDoughRecipeId:
      studioLibraryType === "design" ? studioState.baseDoughRecipeId : "",
    hydrationTargetIngredientId,
    ingredients: rawIngredients
  };
}

function attachStudioMetadata(validatedRecipe, payload) {
  // Match by position (same order as validateRecipeInput, which only filters empty-name rows).
  // This avoids id-key collisions when two ingredients share the same name.
  const filteredPayloadIngredients = (payload.ingredients ?? []).filter(
    (ingredient) => String(ingredient?.name ?? "").trim().length > 0
  );

  const nextRecipe = {
    ...validatedRecipe,
    ingredients: validatedRecipe.ingredients.map((ingredient, index) => {
      const raw = filteredPayloadIngredients[index];
      if (!raw) return ingredient;
      const {
        baseGrams: _baseGrams,
        id: _id,
        idHint: _idHint,
        name: _name,
        role: _role,
        ...metadata
      } = raw;
      return { ...ingredient, ...metadata };
    })
  };

  if (studioLibraryType === "design" && payload.baseDoughRecipeId) {
    nextRecipe.baseDoughRecipeId = payload.baseDoughRecipeId;
  }

  if (studioLibraryType === "design" && !payload.baseDoughRecipeId) {
    delete nextRecipe.baseDoughRecipeId;
  }

  return nextRecipe;
}

function saveRecipeFromForm() {
  const sourceRecipes = getStudioRecipes();
  const payload = createRecipePayloadFromForm();
  const validation = validateRecipeInput(payload, sourceRecipes);

  if (!validation.ok) {
    setRecipeFormMessage(validation.error, "error");
    return;
  }

  const nextRecipe = attachStudioMetadata(validation.value, payload);
  const previousOriginalId = studioState.originalId;

  if (studioLibraryType === "base-dough") {
    baseDoughRecipes = upsertBaseDoughRecipe(baseDoughRecipes, nextRecipe);
    saveBaseDoughRecipes(baseDoughRecipes);
  } else {
    recipes = upsertRecipe(recipes, nextRecipe);
    saveRecipes(recipes);
  }

  populateCalculatorSelects();

  if (studioLibraryType === "design") {
    recipeSelect.value = nextRecipe.id;
  } else if (!baseDoughSelect.value || baseDoughSelect.value === previousOriginalId) {
    baseDoughSelect.value = nextRecipe.id;
  }

  syncRecipeDrivenFields();
  loadStudioRecipe(nextRecipe);
  setRecipeFormMessage(
    `${nextRecipe.name} saved. Base ingredients total ${formatGrams(
      validation.totalIngredientGrams
    )}.`,
    "success"
  );
  calculateAndRender();
}

function duplicateCurrentRecipe() {
  const sourceRecipe =
    studioState.originalId &&
    getStudioRecipes().find((recipe) => recipe.id === studioState.originalId);

  if (!sourceRecipe) {
    setRecipeFormMessage(`Save a ${getStudioCollectionLabel()} before duplicating it.`, "error");
    return;
  }

  loadStudioRecipe({
    ...sourceRecipe,
    id: "",
    name: `${sourceRecipe.name} Copy`
  });
  studioState.originalId = "";
  recipeForm.elements.name.value = `${sourceRecipe.name} Copy`;
  setRecipeFormMessage(`${getStudioCollectionLabel()} duplicated into a new draft.`, "success");
}

function addIngredientRow() {
  syncStudioStateFromDom();
  studioState.ingredients.push({
    name: "",
    baseGrams: "",
    role: undefined
  });
  renderIngredientEditor();
}

function removeIngredientRow(index) {
  syncStudioStateFromDom();

  if (studioState.ingredients.length <= 2) {
    setRecipeFormMessage("Keep at least two ingredients in the recipe.", "error");
    return;
  }

  studioState.ingredients.splice(index, 1);

  // For base-dough recipes, always keep a hydration target assigned.
  // For design recipes, it's optional — don't auto-assign.
  if (
    studioLibraryType === "base-dough" &&
    !studioState.ingredients.some((ingredient) => ingredient.role === "hydration-target")
  ) {
    studioState.ingredients[studioState.ingredients.length - 1].role = "hydration-target";
  }

  renderIngredientEditor();
}

function selectHydrationTarget(index) {
  syncStudioStateFromDom();
  studioState.ingredients = studioState.ingredients.map((ingredient, ingredientIndex) => ({
    ...ingredient,
    role: ingredientIndex === index ? "hydration-target" : undefined
  }));
  renderIngredientEditor();
}

function initializeStudio() {
  syncStudioChrome();
  loadStudioRecipe(getStudioRecipes()[0] ?? createBlankStudioState());
  setRecipeFormMessage(
    "Recipe Studio saves edits in this browser and feeds them back into the calculator."
  );
}

populateCalculatorSelects();
applyCalculatorState(DEFAULT_STATE);
syncRecipeDrivenFields();
calculateAndRender();
initializeStudio();
setActiveView(appView);

viewTabs.forEach((tab) => {
  tab.addEventListener("click", () => {
    setActiveView(tab.dataset.view);
  });
});

recipeSelect.addEventListener("change", () => {
  syncRecipeDrivenFields({ syncBaseDough: true });
  calculateAndRender();
});

form.addEventListener("input", () => {
  syncCalculatorVisibility();
  syncRecipeDrivenFields();
  calculateAndRender();
});

form.addEventListener("change", () => {
  syncCalculatorVisibility();
  syncRecipeDrivenFields();
  calculateAndRender();
});

loadExampleButton.addEventListener("click", () => {
  applyCalculatorState(EXAMPLE_STATE);
  syncRecipeDrivenFields({ syncBaseDough: true });
  calculateAndRender();
});

recipeLibraryRoot.addEventListener("click", (event) => {
  const button = event.target.closest("[data-recipe-id]");

  if (!button) {
    return;
  }

  const recipe = getStudioRecipes().find((item) => item.id === button.dataset.recipeId);

  if (recipe) {
    loadStudioRecipe(recipe);
    setRecipeFormMessage(`Editing ${recipe.name}.`, "success");
  }
});

newRecipeButton.addEventListener("click", () => {
  studioState = createBlankStudioState();
  applyStudioStateToForm();
  setRecipeFormMessage(`New ${getStudioCollectionLabel()} draft ready.`, "success");
});

addIngredientButton.addEventListener("click", () => {
  addIngredientRow();
});

duplicateRecipeButton.addEventListener("click", () => {
  duplicateCurrentRecipe();
});

libraryTypeTabs.forEach((button) => {
  button.addEventListener("click", () => {
    if (button.dataset.libraryType === studioLibraryType) {
      return;
    }

    studioLibraryType = button.dataset.libraryType;
    loadStudioRecipe(getStudioRecipes()[0] ?? createBlankStudioState());
    setRecipeFormMessage(
      studioLibraryType === "base-dough"
        ? "Editing base dough recipes. Changes update the calculator selector."
        : "Editing design recipes. Saved recipes feed directly into the calculator.",
      "success"
    );
  });
});

recipeForm.addEventListener("submit", (event) => {
  event.preventDefault();
  saveRecipeFromForm();
});

ingredientEditorRoot.addEventListener("click", (event) => {
  const removeButton = event.target.closest("[data-remove-ingredient]");

  if (removeButton) {
    removeIngredientRow(Number(removeButton.dataset.removeIngredient));
  }
});

ingredientEditorRoot.addEventListener("change", (event) => {
  const row = event.target.closest("[data-ingredient-index]");

  if (!row) {
    return;
  }

  if (event.target.matches('[data-field="hydrationTarget"]')) {
    selectHydrationTarget(Number(row.dataset.ingredientIndex));
    return;
  }

  syncStudioStateFromDom();
});

recipeForm.addEventListener("input", () => {
  syncStudioStateFromDom();
});

recipeForm.addEventListener("change", () => {
  syncStudioStateFromDom();
});
