import test from "node:test";
import assert from "node:assert/strict";

import { calculateRecipePlan, deriveTargetOutputGrams } from "../src/calculator.js";

const hydrationRecipe = {
  id: "hydration-test-recipe",
  name: "Hydration Test Recipe",
  yieldGrams: 320,
  hydrationTargetIngredientId: "water",
  ingredients: [
    { id: "white-bean-paste", name: "White bean paste", baseGrams: 300 },
    { id: "shiratamako", name: "Shiratamako", baseGrams: 10 },
    { id: "water", name: "Water", baseGrams: 20, role: "hydration-target" },
    { id: "granulated-sugar", name: "Granulated sugar", baseGrams: 20 }
  ]
};

test("powder coloring keeps scaled water unchanged", () => {
  const targetOutputGrams = deriveTargetOutputGrams({
    mode: "exact",
    pieceCount: 5,
    pieceWeightGrams: 28
  });

  const plan = calculateRecipePlan({
    recipe: hydrationRecipe,
    targetOutputGrams,
    settings: {
      mode: "exact",
      processLossPct: 0,
      coloringMode: "powder",
      liquidColoringAmount: 1.2
    }
  });

  assert.equal(plan.hydration.scaledBaseWater.toFixed(2), "8.75");
  assert.equal(plan.hydration.finalWaterToAdd.toFixed(2), "8.75");
  assert.equal(plan.hydration.applied, false);
});

test("liquid coloring reduces water by the coloring amount", () => {
  const targetOutputGrams = deriveTargetOutputGrams({
    mode: "exact",
    pieceCount: 5,
    pieceWeightGrams: 28
  });

  const plan = calculateRecipePlan({
    recipe: hydrationRecipe,
    targetOutputGrams,
    settings: {
      mode: "exact",
      processLossPct: 0,
      coloringMode: "liquid",
      liquidColoringAmount: 1.2
    }
  });

  assert.equal(plan.hydration.scaledBaseWater.toFixed(2), "8.75");
  assert.equal(plan.hydration.finalWaterToAdd.toFixed(2), "7.55");
  assert.equal(plan.ingredients.find((ingredient) => ingredient.id === "water")?.toAddGrams.toFixed(2), "7.55");
});

test("liquid coloring clamps water at zero", () => {
  const plan = calculateRecipePlan({
    recipe: hydrationRecipe,
    targetOutputGrams: 30,
    settings: {
      mode: "batch",
      processLossPct: 0,
      coloringMode: "liquid",
      liquidColoringAmount: 4
    }
  });

  assert.equal(plan.hydration.scaledBaseWater.toFixed(2), "1.88");
  assert.equal(plan.hydration.finalWaterToAdd.toFixed(2), "0.00");
  assert.equal(plan.hydration.fullyReplacedByColoring, true);
});

test("process loss is applied before hydration adjustment", () => {
  const plan = calculateRecipePlan({
    recipe: hydrationRecipe,
    targetOutputGrams: 140,
    settings: {
      mode: "batch",
      processLossPct: 10,
      coloringMode: "liquid",
      liquidColoringAmount: 1.2
    }
  });

  assert.equal(plan.requiredPreLossGrams.toFixed(2), "155.56");
  assert.equal(plan.hydration.scaledBaseWater.toFixed(2), "9.72");
  assert.equal(plan.hydration.finalWaterToAdd.toFixed(2), "8.52");
});

test("recipes without a hydration target do not trigger adjustment warnings", () => {
  const plan = calculateRecipePlan({
    recipe: {
      id: "iris-nerikiri",
      name: "Iris Nerikiri",
      yieldGrams: 41,
      ingredients: [
        { id: "white-nerikiri-paste", name: "White nerikiri paste", baseGrams: 22 },
        { id: "purple-nerikiri-paste", name: "Purple nerikiri paste", baseGrams: 3 },
        { id: "yellow-nerikiri-paste", name: "Yellow nerikiri paste", baseGrams: 1 },
        { id: "green-nerikiri-paste", name: "Green nerikiri paste", baseGrams: 2 },
        { id: "inner-filling-paste", name: "Inner filling paste", baseGrams: 13 }
      ]
    },
    targetOutputGrams: 41,
    settings: {
      mode: "exact",
      coloringMode: "liquid",
      liquidColoringAmount: 1.2
    }
  });

  assert.equal(plan.hydration.hasTargetIngredient, false);
  assert.equal(plan.hydration.scaledBaseWater.toFixed(2), "0.00");
  assert.equal(plan.hydration.fullyReplacedByColoring, false);
});
