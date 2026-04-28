import test from "node:test";
import assert from "node:assert/strict";

import { BASE_DOUGH_RECIPES } from "../src/data.js";
import {
  loadBaseDoughRecipes,
  loadRecipes,
  saveBaseDoughRecipes,
  upsertBaseDoughRecipe,
  upsertRecipe,
  validateRecipeInput
} from "../src/recipe-store.js";

function withMockWindow(run) {
  const originalWindow = globalThis.window;
  const store = new Map();

  globalThis.window = {
    localStorage: {
      getItem(key) {
        return store.has(key) ? store.get(key) : null;
      },
      setItem(key, value) {
        store.set(key, String(value));
      },
      removeItem(key) {
        store.delete(key);
      }
    }
  };

  try {
    run(globalThis.window.localStorage);
  } finally {
    if (originalWindow === undefined) {
      delete globalThis.window;
    } else {
      globalThis.window = originalWindow;
    }
  }
}

test("validates and normalizes a custom recipe", () => {
  const result = validateRecipeInput({
    id: "spring-petal-dough",
    name: "Spring Petal Dough",
    description: "Soft and smooth.",
    yieldGrams: 180,
    hydrationTargetIngredientId: "water",
    ingredients: [
      { name: "White bean paste", baseGrams: 108 },
      { name: "Gyuhi", baseGrams: 60 },
      { name: "Water", baseGrams: 12 }
    ]
  });

  assert.equal(result.ok, true);
  assert.equal(result.value.id, "spring-petal-dough");
  assert.equal(result.value.hydrationTargetIngredientId, "water");
  assert.equal(result.value.ingredients[2].role, "hydration-target");
});

test("requires a hydration target ingredient", () => {
  const result = validateRecipeInput({
    name: "Broken Dough",
    yieldGrams: 180,
    hydrationTargetIngredientId: "water",
    ingredients: [
      { name: "White bean paste", baseGrams: 108 },
      { name: "Gyuhi", baseGrams: 60 }
    ]
  });

  assert.equal(result.ok, false);
  assert.match(result.error, /hydration adjustment/i);
});

test("rejects zero-gram ingredients", () => {
  const result = validateRecipeInput({
    name: "Broken Dough",
    yieldGrams: 180,
    hydrationTargetIngredientId: "water",
    ingredients: [
      { name: "White bean paste", baseGrams: 108 },
      { name: "Water", baseGrams: 0 }
    ]
  });

  assert.equal(result.ok, false);
  assert.match(result.error, /grams value above zero/i);
});

test("loadRecipes keeps saved built-in recipe overrides without losing default metadata", () => {
  withMockWindow((localStorage) => {
    localStorage.setItem(
      "nerikiri-recipes-v3",
      JSON.stringify([
        {
          id: "iris-nerikiri",
          name: "Custom Iris",
          description: "Adjusted for a firmer petal edge.",
          yieldGrams: 45,
          baseDoughRecipeId: "firm-detail-nerikiri-base",
          ingredients: [
            { id: "white-dough", name: "White dough", baseGrams: 23 },
            { id: "violet-dough", name: "Violet dough", baseGrams: 4 },
            { id: "yellow-center", name: "Yellow center", baseGrams: 1 },
            { id: "leaf-green", name: "Leaf green", baseGrams: 2 },
            { id: "filling", name: "Inner filling paste", baseGrams: 15 }
          ]
        }
      ])
    );

    const irisRecipe = loadRecipes().find((recipe) => recipe.id === "iris-nerikiri");

    assert.equal(irisRecipe?.name, "Custom Iris");
    assert.equal(irisRecipe?.yieldGrams, 45);
    assert.equal(irisRecipe?.baseDoughRecipeId, "firm-detail-nerikiri-base");
    assert.equal(irisRecipe?.ingredients[1].name, "Violet dough");
    assert.equal(irisRecipe?.ingredients[1].type, "colored-dough");
    assert.equal(irisRecipe?.ingredients[1].colorLabel, "purple");
  });
});

test("loadRecipes infers color-split metadata for saved custom design recipes", () => {
  withMockWindow((localStorage) => {
    localStorage.setItem(
      "nerikiri-recipes-v3",
      JSON.stringify([
        {
          id: "sunflower-nerikiri",
          name: "Sunflower Nerikiri",
          description: "Custom sunflower design.",
          yieldGrams: 56,
          baseDoughRecipeId: "base-nerikiri-paste",
          ingredients: [
            { id: "white-nerikiri-paste", name: "White nerikiri paste", baseGrams: 44 },
            { id: "yellow-nerikiri-paste", name: "Yellow nerikiri paste", baseGrams: 8 },
            { id: "green-nerikiri-paste", name: "Green nerikiri paste", baseGrams: 4 },
            { id: "inner-filling-paste", name: "Inner filling paste", baseGrams: 13 }
          ]
        }
      ])
    );

    const sunflowerRecipe = loadRecipes().find(
      (recipe) => recipe.id === "sunflower-nerikiri"
    );

    assert.equal(sunflowerRecipe?.ingredients[0].type, "colored-dough");
    assert.equal(sunflowerRecipe?.ingredients[0].colorLabel, undefined);
    assert.equal(sunflowerRecipe?.ingredients[1].type, "colored-dough");
    assert.equal(sunflowerRecipe?.ingredients[1].colorLabel, "yellow");
    assert.equal(sunflowerRecipe?.ingredients[2].colorLabel, "green");
    assert.equal(sunflowerRecipe?.ingredients[3].type, "filling");
  });
});

test("upsertRecipe infers metadata before updating the in-memory recipe list", () => {
  const recipes = upsertRecipe([], {
    id: "sunflower-nerikiri",
    name: "Sunflower Nerikiri",
    yieldGrams: 56,
    baseDoughRecipeId: "base-nerikiri-paste",
    ingredients: [
      { id: "white-nerikiri-paste", name: "White nerikiri paste", baseGrams: 44 },
      { id: "purple-nerikiri-paste", name: "Purple nerikiri paste", baseGrams: 4 },
      { id: "inner-filling-paste", name: "Inner filling paste", baseGrams: 13 }
    ]
  });

  assert.equal(recipes[0].ingredients[0].type, "colored-dough");
  assert.equal(recipes[0].ingredients[1].colorLabel, "purple");
  assert.equal(recipes[0].ingredients[2].type, "filling");
});

test("loadRecipes leaves standalone dough recipes as plain ingredient lists", () => {
  withMockWindow((localStorage) => {
    localStorage.setItem(
      "nerikiri-recipes-v3",
      JSON.stringify([
        {
          id: "house-dough",
          name: "House Dough",
          description: "Standalone dough recipe.",
          yieldGrams: 330,
          ingredients: [
            { id: "white-bean-paste", name: "White bean paste", baseGrams: 300 },
            { id: "water", name: "Water", baseGrams: 20 }
          ]
        }
      ])
    );

    const houseDough = loadRecipes().find((recipe) => recipe.id === "house-dough");

    assert.equal(houseDough?.ingredients[0].type, undefined);
    assert.equal(houseDough?.ingredients[1].type, undefined);
  });
});

test("loadBaseDoughRecipes preserves edited built-ins and keeps newer defaults available", () => {
  withMockWindow((localStorage) => {
    localStorage.setItem(
      "nerikiri-base-doughs-v1",
      JSON.stringify([
        {
          id: "base-nerikiri-paste",
          name: "House Base Dough",
          description: "Slightly drier for defined ridges.",
          yieldGrams: 340,
          hydrationTargetIngredientId: "water",
          ingredients: [
            { id: "sweet-white-bean", name: "Sweet white bean paste", baseGrams: 302 },
            { id: "shiratama-flour", name: "Shiratama flour", baseGrams: 10 },
            { id: "water", name: "Water", baseGrams: 10, role: "hydration-target" },
            { id: "granulated-sugar", name: "Granulated sugar", baseGrams: 18 }
          ]
        }
      ])
    );

    const loadedRecipes = loadBaseDoughRecipes();
    const editedBase = loadedRecipes.find((recipe) => recipe.id === "base-nerikiri-paste");

    assert.equal(editedBase?.name, "House Base Dough");
    assert.equal(editedBase?.yieldGrams, 340);
    assert.equal(editedBase?.ingredients[0].name, "Sweet white bean paste");
    assert.equal(editedBase?.ingredients[2].role, "hydration-target");
    assert.ok(loadedRecipes.some((recipe) => recipe.id === "soft-petal-nerikiri-base"));
  });
});

test("saveBaseDoughRecipes round-trips custom recipes and upsert replaces by id", () => {
  withMockWindow(() => {
    const customRecipe = {
      id: "house-signature-base",
      name: "House Signature Base",
      description: "Balanced for general seasonal work.",
      yieldGrams: 355,
      hydrationTargetIngredientId: "water",
      ingredients: [
        { id: "white-bean-paste", name: "White bean paste", baseGrams: 300 },
        { id: "shiratama-flour", name: "Shiratama flour", baseGrams: 9 },
        { id: "water", name: "Water", baseGrams: 24, role: "hydration-target" },
        { id: "granulated-sugar", name: "Granulated sugar", baseGrams: 22 }
      ]
    };
    const updatedDefault = {
      ...BASE_DOUGH_RECIPES[0],
      name: "Updated Default Base"
    };
    const upsertedRecipes = upsertBaseDoughRecipe(BASE_DOUGH_RECIPES, updatedDefault);

    assert.equal(upsertedRecipes[0].name, "Updated Default Base");
    assert.equal(upsertedRecipes.length, BASE_DOUGH_RECIPES.length);

    saveBaseDoughRecipes([...upsertedRecipes, customRecipe]);

    const loadedRecipes = loadBaseDoughRecipes();
    const roundTrippedCustom = loadedRecipes.find(
      (recipe) => recipe.id === "house-signature-base"
    );

    assert.equal(roundTrippedCustom?.name, "House Signature Base");
    assert.equal(roundTrippedCustom?.ingredients[2].role, "hydration-target");
  });
});
