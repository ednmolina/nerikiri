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

function inferColorSplitIngredient(ingredient) {
  if (ingredient.type) {
    return ingredient;
  }

  const normalizedName = String(ingredient.name ?? "").toLowerCase();

  if (normalizedName.includes("filling")) {
    return { ...ingredient, type: "filling" };
  }

  return {
    ...ingredient,
    type: "colored-dough",
    colorLabel: inferColorLabel(ingredient.name)
  };
}

export function roundToIncrement(value, increment) {
  const safeValue = toFiniteNumber(value, 0);
  const safeIncrement = toFiniteNumber(increment, 0);

  if (safeIncrement <= 0) {
    return safeValue;
  }

  return Math.round(safeValue / safeIncrement) * safeIncrement;
}

// Rounds UP to the increment so a weigh-out is never lighter than the exact amount.
// Used for base-dough weigh-outs: rounding each small ingredient to nearest can drop
// whole grams per color (e.g. 0.48 g sugar -> 0 g), which adds up to missing dough.
export function roundUpToIncrement(value, increment) {
  const safeValue = toFiniteNumber(value, 0);
  const safeIncrement = toFiniteNumber(increment, 0);

  if (safeIncrement <= 0) {
    return safeValue;
  }

  // Small epsilon so float noise (e.g. 4.0000000001) doesn't bump up a full increment.
  return Math.ceil(safeValue / safeIncrement - 1e-9) * safeIncrement;
}

function sumBaseGrams(ingredients = []) {
  return ingredients.reduce((sum, ingredient) => sum + toFiniteNumber(ingredient.baseGrams, 0), 0);
}

// Flags recipe data that will make totals not add up.
export function checkRecipeConsistency({ recipe, baseDoughRecipe } = {}) {
  const warnings = [];
  const tolerance = 0.01;

  if (recipe) {
    const portionSum = sumBaseGrams(recipe.ingredients);
    if (recipe.yieldGrams > 0 && Math.abs(portionSum - recipe.yieldGrams) > tolerance) {
      warnings.push(
        `${recipe.name}: piece weight is ${recipe.yieldGrams} g but its portions add up to ${portionSum} g, ` +
          "so the color split will not match the piece count."
      );
    }
  }

  if (baseDoughRecipe) {
    const rawSum = sumBaseGrams(baseDoughRecipe.ingredients);
    if (baseDoughRecipe.yieldGrams - rawSum > tolerance) {
      warnings.push(
        `${baseDoughRecipe.name}: yield is ${baseDoughRecipe.yieldGrams} g but the raw ingredients only add up to ${rawSum} g. ` +
          "Cooked dough cannot weigh more than what goes in, so this will leave you short."
      );
    } else if (Math.abs(baseDoughRecipe.yieldGrams - rawSum) <= tolerance) {
      warnings.push(
        `${baseDoughRecipe.name}: yield equals the raw ingredient total (${rawSum} g), which assumes no moisture is cooked off. ` +
          "Weigh one cooked batch and enter that as the yield."
      );
    }
  }

  return warnings;
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

  const planRecipe = recipe.baseDoughRecipeId
    ? {
        ...recipe,
        ingredients: recipe.ingredients.map(inferColorSplitIngredient)
      }
    : recipe;

  const safeTargetOutputGrams = clamp(
    toFiniteNumber(targetOutputGrams, 0),
    0,
    Number.MAX_SAFE_INTEGER
  );
  const safeSettings = sanitizeSettings(settings);
  const lossMultiplier = 1 - safeSettings.processLossPct / 100;
  const roundingIncrement = safeSettings.roundToIncrement;

  // Filling is weighed per piece with no process loss. Separate the two.
  const fillingBaseGrams = planRecipe.ingredients
    .filter((ingredient) => ingredient.type === "filling")
    .reduce((sum, ingredient) => sum + ingredient.baseGrams, 0);
  const doughBaseGrams = planRecipe.yieldGrams - fillingBaseGrams;

  // Base (no-loss) scale factor — used for filling and as the proportioning basis.
  const baseScaleFactor = planRecipe.yieldGrams > 0 ? safeTargetOutputGrams / planRecipe.yieldGrams : 0;

  // Process loss applies only to the dough component.
  const targetDoughOutputGrams = baseScaleFactor * doughBaseGrams;
  const requiredDoughPreLossGrams =
    lossMultiplier > 0 ? targetDoughOutputGrams / lossMultiplier : targetDoughOutputGrams;
  const doughScaleFactor =
    doughBaseGrams > 0 ? requiredDoughPreLossGrams / doughBaseGrams : baseScaleFactor;

  const targetFillingOutputGrams = baseScaleFactor * fillingBaseGrams;
  const requiredPreLossGrams = requiredDoughPreLossGrams + targetFillingOutputGrams;

  const scaledIngredients = planRecipe.ingredients.map((ingredient) => {
    const isFilling = ingredient.type === "filling";
    const effectiveScale = isFilling ? baseScaleFactor : doughScaleFactor;
    const scaledGrams = ingredient.baseGrams * effectiveScale;

    return {
      ...ingredient,
      scaledGrams,
      scaledRoundedGrams:
        roundingIncrement !== undefined
          ? roundToIncrement(scaledGrams, roundingIncrement)
          : scaledGrams
    };
  });

  const hydrationTarget = getHydrationTargetIngredient(planRecipe, scaledIngredients);
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
    recipe: planRecipe,
    settings: safeSettings,
    targetOutputGrams: safeTargetOutputGrams,
    requiredPreLossGrams,
    scaleFactor: doughScaleFactor,
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

  const colorSplitIngredients = plan.ingredients.map(inferColorSplitIngredient);
  const coloredIngredients = colorSplitIngredients.filter(
    (ingredient) => ingredient.type === "colored-dough"
  );

  if (coloredIngredients.length === 0) return null;

  const fillingIngredients = colorSplitIngredients.filter(
    (ingredient) => ingredient.type === "filling"
  );

  const totalColoredDough = coloredIngredients.reduce(
    (sum, ingredient) => sum + ingredient.toAddGrams,
    0
  );

  const scaleFactor =
    baseDoughRecipe.yieldGrams > 0 ? totalColoredDough / baseDoughRecipe.yieldGrams : 0;

  const roundingIncrement = plan.settings.roundToIncrement;

  // Distribute liquid coloring only to portions that have a colorLabel (i.e. are actually
  // dyed). Uncolored white portions get no liquid coloring deducted from their water.
  const liquidColoringTotal =
    plan.settings.coloringMode === "liquid" ? plan.settings.liquidColoringAmount : 0;
  const waterIngredientId =
    baseDoughRecipe.ingredients.find((i) => i.role === "hydration-target")?.id ?? null;
  const coloredPortionTotal = coloredIngredients
    .filter((i) => i.colorLabel)
    .reduce((sum, i) => sum + i.toAddGrams, 0);

  const scaledBaseIngredients = baseDoughRecipe.ingredients.map((ingredient) => {
    const scaledGrams = ingredient.baseGrams * scaleFactor;
    const isWater = Boolean(waterIngredientId && ingredient.id === waterIngredientId);
    const toAddGrams = isWater ? Math.max(0, scaledGrams - liquidColoringTotal) : scaledGrams;
    return {
      ...ingredient,
      scaledGrams,
      isHydrationTarget: isWater,
      scaledRoundedGrams:
        roundingIncrement !== undefined
          ? roundUpToIncrement(toAddGrams, roundingIncrement)
          : toAddGrams
    };
  });

  function scaleBaseForPortion(portionGrams, portionLiquidContribution) {
    const portionScale =
      baseDoughRecipe.yieldGrams > 0 ? portionGrams / baseDoughRecipe.yieldGrams : 0;
    return baseDoughRecipe.ingredients.map((ingredient) => {
      const scaledGrams = ingredient.baseGrams * portionScale;
      const isWater = Boolean(waterIngredientId && ingredient.id === waterIngredientId);
      const toAddGrams = isWater
        ? Math.max(0, scaledGrams - portionLiquidContribution)
        : scaledGrams;
      return {
        ...ingredient,
        scaledGrams,
        isHydrationTarget: isWater,
        scaledRoundedGrams:
          roundingIncrement !== undefined
            ? roundUpToIncrement(toAddGrams, roundingIncrement)
            : toAddGrams
      };
    });
  }

  return {
    colorPortions: coloredIngredients.map((ingredient) => {
      const portionLiquidContribution =
        liquidColoringTotal > 0 && ingredient.colorLabel && coloredPortionTotal > 0
          ? liquidColoringTotal * (ingredient.toAddGrams / coloredPortionTotal)
          : 0;
      return {
        id: ingredient.id,
        name: ingredient.name,
        colorLabel: ingredient.colorLabel ?? null,
        totalGrams: ingredient.toAddGrams,
        totalRoundedGrams:
          roundingIncrement !== undefined
            ? roundUpToIncrement(ingredient.toAddGrams, roundingIncrement)
            : ingredient.toAddGrams,
        portionLiquidContribution,
        baseDoughIngredients: scaleBaseForPortion(ingredient.toAddGrams, portionLiquidContribution)
      };
    }),
    fillingPortions: fillingIngredients.map((ingredient) => ({
      id: ingredient.id,
      name: ingredient.name,
      totalGrams: ingredient.toAddGrams,
      totalRoundedGrams:
        roundingIncrement !== undefined
          ? roundUpToIncrement(ingredient.toAddGrams, roundingIncrement)
          : ingredient.toAddGrams
    })),
    totalColoredDough,
    totalLiquidColoringAmount: liquidColoringTotal,
    waterIngredientId,
    baseDoughRecipe,
    scaledBaseIngredients,
    scaleFactor,
    warnings: checkRecipeConsistency({ recipe: plan.recipe, baseDoughRecipe })
  };
}
