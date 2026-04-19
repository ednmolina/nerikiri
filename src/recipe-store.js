import { DEFAULT_RECIPES } from "./data.js";

const STORAGE_KEY = "nerikiri-recipes-v3";

function cloneRecipes(recipes) {
  return recipes.map((recipe) => ({
    ...recipe,
    ingredients: recipe.ingredients.map((ingredient) => ({ ...ingredient }))
  }));
}

function mergeWithDefaultRecipes(savedRecipes) {
  const savedById = new Map(savedRecipes.map((recipe) => [recipe.id, recipe]));
  const mergedDefaults = DEFAULT_RECIPES.map((defaultRecipe) => {
    const savedRecipe = savedById.get(defaultRecipe.id);

    if (!savedRecipe) {
      return { ...defaultRecipe };
    }

    // Always use default recipe's ingredients and structure so data model changes
    // (type, colorLabel, baseDoughRecipeId) propagate. Only preserve display overrides.
    return {
      ...defaultRecipe,
      name: savedRecipe.name ?? defaultRecipe.name,
      description: savedRecipe.description ?? defaultRecipe.description,
      id: defaultRecipe.id
    };
  });

  const customRecipes = savedRecipes.filter(
    (recipe) => !DEFAULT_RECIPES.some((defaultRecipe) => defaultRecipe.id === recipe.id)
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

export function buildIngredientId(name, index) {
  return slugify(name) || `ingredient-${index + 1}`;
}

export function validateRecipeInput(recipeInput, existingRecipes = []) {
  const trimmedName = String(recipeInput?.name ?? "").trim();
  const trimmedDescription = String(recipeInput?.description ?? "").trim();
  const yieldGrams = toFiniteNumber(recipeInput?.yieldGrams, 0);
  const hydrationTargetIngredientId = String(
    recipeInput?.hydrationTargetIngredientId ?? ""
  ).trim();

  const ingredients = (recipeInput?.ingredients ?? [])
    .map((ingredient, index) => {
      const name = String(ingredient?.name ?? "").trim();
      const baseGrams = toFiniteNumber(ingredient?.baseGrams, 0);

      return {
        id: buildIngredientId(name, index),
        name,
        baseGrams,
        role: ingredient?.role
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

  const hydrationTarget = ingredients.find(
    (ingredient) => ingredient.id === hydrationTargetIngredientId
  );

  if (!hydrationTarget) {
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
      description: trimmedDescription || "Custom recipe created in Recipe Studio.",
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
  if (!hasLocalStorage()) {
    return cloneRecipes(DEFAULT_RECIPES);
  }

  const raw = window.localStorage.getItem(STORAGE_KEY);

  if (!raw) {
    return cloneRecipes(DEFAULT_RECIPES);
  }

  try {
    const parsed = JSON.parse(raw);

    if (!Array.isArray(parsed) || parsed.length === 0) {
      return cloneRecipes(DEFAULT_RECIPES);
    }

    return cloneRecipes(mergeWithDefaultRecipes(parsed));
  } catch {
    return cloneRecipes(DEFAULT_RECIPES);
  }
}

export function saveRecipes(recipes) {
  if (!hasLocalStorage()) {
    return;
  }

  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(cloneRecipes(recipes)));
}

export function upsertRecipe(recipes, recipe) {
  const nextRecipes = cloneRecipes(recipes);
  const index = nextRecipes.findIndex((existingRecipe) => existingRecipe.id === recipe.id);

  if (index >= 0) {
    nextRecipes[index] = recipe;
    return nextRecipes;
  }

  nextRecipes.push(recipe);
  return nextRecipes;
}
