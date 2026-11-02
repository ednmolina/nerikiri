import { BASE_DOUGH_RECIPES, DEFAULT_RECIPES } from "./data.js";

const STORAGE_KEY = "nerikiri-recipes-v3";
const BASE_DOUGH_STORAGE_KEY = "nerikiri-base-doughs-v1";

const COLOR_LABELS = [
  { tokens: ["violet", "purple"], label: "purple" },
  { tokens: ["pink", "rose"], label: "pink" },
  { tokens: ["yellow", "gold"], label: "yellow" },
  { tokens: ["green", "leaf"], label: "green" },
  { tokens: ["orange"], label: "orange" },
  { tokens: ["red"], label: "red" },
  { tokens: ["blue"], label: "blue" },
  { tokens: ["brown"], label: "brown" },
  { tokens: ["black"], label: "black" }
];

function cloneRecipes(recipes = []) {
  return recipes.map((recipe) => ({
    ...recipe,
    ingredients: (recipe.ingredients ?? []).map((ingredient) => ({ ...ingredient }))
  }));
}

function mergeIngredientCollections(defaultIngredients = [], savedIngredients = []) {
  if (!Array.isArray(savedIngredients) || savedIngredients.length === 0) {
    return defaultIngredients.map((ingredient) => ({ ...ingredient }));
  }

  const defaultIngredientById = new Map(
    defaultIngredients.map((ingredient) => [ingredient.id, ingredient])
  );

  // Position fallback is only safe when lists are the same length.
  // When counts differ (user added or removed ingredients), falling back by index
  // would transplant metadata from the wrong default ingredient.
  const usePositionFallback = savedIngredients.length === defaultIngredients.length;

  return savedIngredients.map((savedIngredient, index) => {
    const defaultIngredient =
      defaultIngredientById.get(savedIngredient?.id) ??
      (usePositionFallback ? defaultIngredients[index] ?? {} : {});

    return {
      ...defaultIngredient,
      ...savedIngredient
    };
  });
}

function mergeWithDefaultRecipes(defaultRecipes, savedRecipes) {
  const defaultRecipeIds = new Set(defaultRecipes.map((recipe) => recipe.id));
  const savedById = new Map(savedRecipes.map((recipe) => [recipe.id, recipe]));
  const mergedDefaults = defaultRecipes.map((defaultRecipe) => {
    const savedRecipe = savedById.get(defaultRecipe.id);

    if (!savedRecipe) {
      return {
        ...defaultRecipe,
        ingredients: cloneRecipes([defaultRecipe])[0].ingredients
      };
    }

    return {
      ...defaultRecipe,
      ...savedRecipe,
      id: defaultRecipe.id,
      ingredients: mergeIngredientCollections(
        defaultRecipe.ingredients,
        savedRecipe.ingredients
      )
    };
  });

  const customRecipes = savedRecipes.filter(
    (recipe) => !defaultRecipeIds.has(recipe.id)
  );

  return [...mergedDefaults, ...customRecipes];
}

function slugify(value) {
  return String(value)
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 48);
}

function toFiniteNumber(value, fallback = 0) {
  const parsed = Number.parseFloat(value);

  if (!Number.isFinite(parsed)) {
    return fallback;
  }

  return parsed;
}

function hasLocalStorage() {
  return typeof window !== "undefined" && typeof window.localStorage !== "undefined";
}

function loadCollection(storageKey, defaultRecipes) {
  if (!hasLocalStorage()) {
    return cloneRecipes(defaultRecipes);
  }

  const raw = window.localStorage.getItem(storageKey);

  if (!raw) {
    return cloneRecipes(defaultRecipes);
  }

  try {
    const parsed = JSON.parse(raw);

    if (!Array.isArray(parsed) || parsed.length === 0) {
      return cloneRecipes(defaultRecipes);
    }

    return cloneRecipes(mergeWithDefaultRecipes(defaultRecipes, parsed));
  } catch {
    return cloneRecipes(defaultRecipes);
  }
}

function saveCollection(storageKey, recipes) {
  if (!hasLocalStorage()) {
    return;
  }

  window.localStorage.setItem(storageKey, JSON.stringify(cloneRecipes(recipes)));
}

function upsertCollection(recipes, recipe) {
  const nextRecipes = cloneRecipes(recipes);
  const index = nextRecipes.findIndex((existingRecipe) => existingRecipe.id === recipe.id);

  if (index >= 0) {
    nextRecipes[index] = recipe;
    return nextRecipes;
  }

  nextRecipes.push(recipe);
  return nextRecipes;
}

function inferColorLabel(name) {
  const normalizedName = String(name ?? "").toLowerCase();

  if (normalizedName.includes("white")) {
    return null;
  }

  return (
    COLOR_LABELS.find((color) =>
      color.tokens.some((token) => normalizedName.includes(token))
    )?.label ?? null
  );
}

function inferDesignIngredientMetadata(ingredient) {
  if (ingredient.type) {
    return ingredient;
  }

  const normalizedName = String(ingredient.name ?? "").toLowerCase();

  if (normalizedName.includes("filling")) {
    return { ...ingredient, type: "filling" };
  }

  const colorLabel = inferColorLabel(ingredient.name);

  return {
    ...ingredient,
    type: "colored-dough",
    ...(colorLabel ? { colorLabel } : {})
  };
}

function normalizeDesignRecipe(recipe) {
  if (!recipe?.baseDoughRecipeId) {
    return recipe;
  }

  return {
    ...recipe,
    ingredients: (recipe.ingredients ?? []).map(inferDesignIngredientMetadata)
  };
}

// Older saves stored names like "Iris Nerikiri (あやめ)" or "White nerikiri paste".
// Split those into the English `name` + Japanese `jp` pair the UI expects.
function splitLegacyName(item) {
  const match = String(item?.name ?? "").match(/^(.*?)\s*[(（]([^)）]+)[)）]\s*$/);

  if (!match) {
    return item;
  }

  // A saved built-in can carry the old "(あやめ)" name while already inheriting `jp`
  // from the default, so split the name either way and keep any existing `jp`.
  return {
    ...item,
    name: match[1].replace(/\s+Nerikiri$/i, "").trim(),
    jp: item.jp || match[2].trim()
  };
}

function tidyIngredientName(ingredient) {
  const name = String(ingredient?.name ?? "")
    .replace(/\s+nerikiri paste$/i, "")
    .replace(/^inner filling paste$/i, "Inner filling");

  return splitLegacyName({ ...ingredient, name });
}

function normalizeNames(recipe) {
  const split = splitLegacyName(recipe);

  return {
    ...split,
    ingredients: (split.ingredients ?? []).map(tidyIngredientName)
  };
}

export function buildIngredientId(name, index) {
  return slugify(name) || `ingredient-${index + 1}`;
}

export function validateRecipeInput(recipeInput, existingRecipes = []) {
  const trimmedName = String(recipeInput?.name ?? "").trim();
  const trimmedDescription = String(recipeInput?.description ?? "").trim();
  const trimmedJp = String(recipeInput?.jp ?? "").trim();
  const baseDoughRecipeId = String(recipeInput?.baseDoughRecipeId ?? "").trim();
  const yieldGrams = toFiniteNumber(recipeInput?.yieldGrams, 0);
  const hydrationTargetIngredientId = String(
    recipeInput?.hydrationTargetIngredientId ?? ""
  ).trim();

  const ingredients = (recipeInput?.ingredients ?? [])
    .map((ingredient, index) => {
      const name = String(ingredient?.name ?? "").trim();
      const baseGrams = toFiniteNumber(ingredient?.baseGrams, 0);

      const jp = String(ingredient?.jp ?? "").trim();
      const extra = {};
      for (const key of ["type", "colorLabel", "swatch"]) {
        if (ingredient?.[key]) extra[key] = ingredient[key];
      }

      return {
        id: buildIngredientId(name, index),
        name,
        ...(jp ? { jp } : {}),
        baseGrams,
        role: ingredient?.role,
        ...extra
      };
    })
    .filter((ingredient) => ingredient.name.length > 0);

  if (!trimmedName) {
    return { ok: false, error: "Recipe name is required." };
  }

  if (yieldGrams <= 0) {
    return { ok: false, error: "Yield grams must be greater than zero." };
  }

  if (ingredients.length < 2) {
    return { ok: false, error: "Add at least two ingredients to create a usable recipe." };
  }

  const totalIngredientGrams = ingredients.reduce(
    (sum, ingredient) => sum + ingredient.baseGrams,
    0
  );

  if (ingredients.some((ingredient) => ingredient.baseGrams <= 0)) {
    return { ok: false, error: "Each ingredient needs a grams value above zero." };
  }

  const hydrationTarget = hydrationTargetIngredientId
    ? ingredients.find((ingredient) => ingredient.id === hydrationTargetIngredientId)
    : null;

  if (hydrationTargetIngredientId && !hydrationTarget) {
    return { ok: false, error: "Choose which ingredient should receive hydration adjustment." };
  }

  const recipeIdBase = slugify(recipeInput?.id || trimmedName) || "recipe";
  let recipeId = recipeIdBase;
  let duplicateIndex = 2;

  while (
    existingRecipes.some(
      (existingRecipe) =>
        existingRecipe.id === recipeId && existingRecipe.id !== recipeInput?.originalId
    )
  ) {
    recipeId = `${recipeIdBase}-${duplicateIndex}`;
    duplicateIndex += 1;
  }

  return {
    ok: true,
    value: {
      id: recipeId,
      name: trimmedName,
      ...(trimmedJp ? { jp: trimmedJp } : {}),
      ...(baseDoughRecipeId ? { baseDoughRecipeId } : {}),
      description: trimmedDescription,
      yieldGrams,
      hydrationTargetIngredientId,
      ingredients: ingredients.map((ingredient) => ({
        ...ingredient,
        role:
          ingredient.id === hydrationTargetIngredientId ? "hydration-target" : undefined
      }))
    },
    totalIngredientGrams
  };
}

export function loadRecipes() {
  return loadCollection(STORAGE_KEY, DEFAULT_RECIPES).map(normalizeNames).map(normalizeDesignRecipe);
}

export function saveRecipes(recipes) {
  saveCollection(STORAGE_KEY, recipes.map(normalizeDesignRecipe));
}

export function upsertRecipe(recipes, recipe) {
  return upsertCollection(recipes, normalizeDesignRecipe(recipe));
}

export function loadBaseDoughRecipes() {
  return loadCollection(BASE_DOUGH_STORAGE_KEY, BASE_DOUGH_RECIPES).map(normalizeNames);
}

export function saveBaseDoughRecipes(recipes) {
  saveCollection(BASE_DOUGH_STORAGE_KEY, recipes);
}

export function deleteRecipe(recipes, recipeId) {
  return cloneRecipes(recipes).filter((recipe) => recipe.id !== recipeId);
}

export function isBuiltInRecipe(recipeId) {
  return (
    DEFAULT_RECIPES.some((recipe) => recipe.id === recipeId) ||
    BASE_DOUGH_RECIPES.some((recipe) => recipe.id === recipeId)
  );
}

export function upsertBaseDoughRecipe(recipes, recipe) {
  return upsertCollection(recipes, recipe);
}
