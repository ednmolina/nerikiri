import test from "node:test";
import assert from "node:assert/strict";

import { validateRecipeInput } from "../src/recipe-store.js";

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
