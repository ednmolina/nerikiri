function toFiniteNumber(value, fallback = 0) {
  const parsed = Number.parseFloat(value);

  if (!Number.isFinite(parsed)) {
    return fallback;
  }

  return parsed;
}

function clamp(value, min, max) {
  return Math.min(Math.max(value, min), max);
}

export function roundToIncrement(value, increment) {
  const safeValue = toFiniteNumber(value, 0);
  const safeIncrement = toFiniteNumber(increment, 0);

  if (safeIncrement <= 0) {
    return safeValue;
  }

  return Math.round(safeValue / safeIncrement) * safeIncrement;
}

export function deriveTargetOutputGrams(input) {
  const mode = input?.mode === "batch" ? "batch" : "exact";

  if (mode === "batch") {
    return clamp(toFiniteNumber(input?.batchWeightGrams, 0), 0, Number.MAX_SAFE_INTEGER);
  }

  const pieceCount = clamp(toFiniteNumber(input?.pieceCount, 0), 0, Number.MAX_SAFE_INTEGER);
  const pieceWeightGrams = clamp(
    toFiniteNumber(input?.pieceWeightGrams, 0),
    0,
    Number.MAX_SAFE_INTEGER
  );

  return pieceCount * pieceWeightGrams;
}

export function sanitizeSettings(settings = {}) {
  const roundToIncrementValue = toFiniteNumber(settings.roundToIncrement, 0);

  return {
    mode: settings.mode === "batch" ? "batch" : "exact",
    processLossPct: clamp(toFiniteNumber(settings.processLossPct, 0), 0, 95),
    roundToIncrement: roundToIncrementValue > 0 ? roundToIncrementValue : undefined,
    coloringMode: settings.coloringMode === "liquid" ? "liquid" : "powder",
    liquidColoringAmount: clamp(toFiniteNumber(settings.liquidColoringAmount, 0), 0, Number.MAX_SAFE_INTEGER)
  };
}

export function resolveExternalMoisture(settings = {}) {
  const safeSettings = sanitizeSettings(settings);

  if (safeSettings.coloringMode !== "liquid") {
    return {
      applied: false,
      source: "coloring",
      mode: safeSettings.coloringMode,
      contributionGrams: 0,
      label: "Powder coloring does not change hydration."
    };
  }

  const contributionGrams = safeSettings.liquidColoringAmount;

  return {
    applied: contributionGrams > 0,
    source: "coloring",
    mode: "liquid",
    contributionGrams,
    label: "Liquid coloring counted as moisture."
  };
}

function getHydrationTargetIngredient(recipe, scaledIngredients) {
  const targetId =
    recipe?.hydrationTargetIngredientId ??
    recipe?.ingredients?.find((ingredient) => ingredient.role === "hydration-target")?.id;

  if (!targetId) {
    return null;
  }

  return scaledIngredients.find((ingredient) => ingredient.id === targetId) ?? null;
}

export function calculateRecipePlan({
  recipe,
  targetOutputGrams,
  settings = {}
}) {
  if (!recipe) {
    throw new Error("A recipe is required.");
  }

  const safeTargetOutputGrams = clamp(
    toFiniteNumber(targetOutputGrams, 0),
    0,
    Number.MAX_SAFE_INTEGER
  );
  const safeSettings = sanitizeSettings(settings);
  const lossMultiplier = 1 - safeSettings.processLossPct / 100;
  const requiredPreLossGrams =
    lossMultiplier > 0 ? safeTargetOutputGrams / lossMultiplier : safeTargetOutputGrams;
  const scaleFactor =
    recipe.yieldGrams > 0 ? requiredPreLossGrams / recipe.yieldGrams : 0;
  const roundingIncrement = safeSettings.roundToIncrement;

  const scaledIngredients = recipe.ingredients.map((ingredient) => {
    const scaledGrams = ingredient.baseGrams * scaleFactor;

    return {
      ...ingredient,
      scaledGrams,
      scaledRoundedGrams:
        roundingIncrement !== undefined
          ? roundToIncrement(scaledGrams, roundingIncrement)
          : scaledGrams
    };
  });

  const hydrationTarget = getHydrationTargetIngredient(recipe, scaledIngredients);
  const externalMoisture = resolveExternalMoisture(safeSettings);
  const baseHydrationGrams = hydrationTarget?.scaledGrams ?? 0;
  const adjustedHydrationGrams = clamp(
    baseHydrationGrams - externalMoisture.contributionGrams,
    0,
    Number.MAX_SAFE_INTEGER
  );
  const adjustedHydrationRoundedGrams =
    roundingIncrement !== undefined
      ? roundToIncrement(adjustedHydrationGrams, roundingIncrement)
      : adjustedHydrationGrams;

  const ingredients = scaledIngredients.map((ingredient) => {
    const isHydrationTarget = ingredient.id === hydrationTarget?.id;
    const waterToAddGrams = isHydrationTarget
      ? adjustedHydrationGrams
      : ingredient.scaledGrams;

    return {
      ...ingredient,
      isHydrationTarget,
      toAddGrams: waterToAddGrams,
      toAddRoundedGrams:
        roundingIncrement !== undefined
          ? roundToIncrement(waterToAddGrams, roundingIncrement)
          : waterToAddGrams
    };
  });

  return {
    recipe,
    settings: safeSettings,
    targetOutputGrams: safeTargetOutputGrams,
    requiredPreLossGrams,
    scaleFactor,
    ingredients,
    hydration: {
      targetIngredientId: hydrationTarget?.id ?? null,
      hasTargetIngredient: Boolean(hydrationTarget?.id),
      scaledBaseWater: baseHydrationGrams,
      liquidColoringContribution: externalMoisture.contributionGrams,
      finalWaterToAdd: adjustedHydrationGrams,
      finalWaterToAddRounded: adjustedHydrationRoundedGrams,
      applied: externalMoisture.applied,
      mode: externalMoisture.mode,
      label: externalMoisture.label,
      fullyReplacedByColoring:
        baseHydrationGrams > 0 &&
        externalMoisture.contributionGrams >= baseHydrationGrams
    }
  };
}

export function calculateColorSplit({ plan, baseDoughRecipe }) {
  if (!baseDoughRecipe) return null;

  const coloredIngredients = plan.ingredients.filter(
    (ingredient) => ingredient.type === "colored-dough"
  );

  if (coloredIngredients.length === 0) return null;

  const fillingIngredients = plan.ingredients.filter(
    (ingredient) => ingredient.type === "filling"
  );

  const totalColoredDough = coloredIngredients.reduce(
    (sum, ingredient) => sum + ingredient.toAddGrams,
    0
  );

  const scaleFactor =
    baseDoughRecipe.yieldGrams > 0 ? totalColoredDough / baseDoughRecipe.yieldGrams : 0;

  const roundingIncrement = plan.settings.roundToIncrement;

  const scaledBaseIngredients = baseDoughRecipe.ingredients.map((ingredient) => {
    const scaledGrams = ingredient.baseGrams * scaleFactor;
    return {
      ...ingredient,
      scaledGrams,
      scaledRoundedGrams:
        roundingIncrement !== undefined
          ? roundToIncrement(scaledGrams, roundingIncrement)
          : scaledGrams
    };
  });

  function scaleBaseForPortion(portionGrams) {
    const portionScale =
      baseDoughRecipe.yieldGrams > 0 ? portionGrams / baseDoughRecipe.yieldGrams : 0;
    return baseDoughRecipe.ingredients.map((ingredient) => {
      const scaledGrams = ingredient.baseGrams * portionScale;
      return {
        ...ingredient,
        scaledGrams,
        scaledRoundedGrams:
          roundingIncrement !== undefined
            ? roundToIncrement(scaledGrams, roundingIncrement)
            : scaledGrams
      };
    });
  }

  return {
    colorPortions: coloredIngredients.map((ingredient) => ({
      id: ingredient.id,
      name: ingredient.name,
      colorLabel: ingredient.colorLabel ?? null,
      totalGrams: ingredient.toAddGrams,
      totalRoundedGrams: ingredient.toAddRoundedGrams,
      baseDoughIngredients: scaleBaseForPortion(ingredient.toAddGrams)
    })),
    fillingPortions: fillingIngredients.map((ingredient) => ({
      id: ingredient.id,
      name: ingredient.name,
      totalGrams: ingredient.toAddGrams,
      totalRoundedGrams: ingredient.toAddRoundedGrams
    })),
    totalColoredDough,
    baseDoughRecipe,
    scaledBaseIngredients,
    scaleFactor
  };
}
