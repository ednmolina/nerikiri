export const BASE_DOUGH_RECIPES = [
  {
    id: "base-nerikiri-paste",
    name: "Base Nerikiri Paste (練り切り生地)",
    description: "White bean paste base dough. Book yield: a little over 300 g.",
    yieldGrams: 330,
    ingredients: [
      { id: "white-bean-paste", name: "White bean paste (白こしあん)", baseGrams: 300 },
      { id: "shiratama-flour", name: "Shiratama flour (白玉粉)", baseGrams: 10 },
      { id: "water", name: "Water (水)", baseGrams: 20, role: "hydration-target" },
      { id: "granulated-sugar", name: "Granulated sugar (グラニュー糖)", baseGrams: 20 }
    ]
  },
  {
    id: "soft-petal-nerikiri-base",
    name: "Soft Petal Nerikiri Base",
    description: "A slightly softer batch for thin petals and gentle blending.",
    yieldGrams: 352,
    ingredients: [
      { id: "white-bean-paste", name: "White bean paste (白こしあん)", baseGrams: 300 },
      { id: "shiratama-flour", name: "Shiratama flour (白玉粉)", baseGrams: 8 },
      { id: "water", name: "Water (水)", baseGrams: 26, role: "hydration-target" },
      { id: "granulated-sugar", name: "Granulated sugar (グラニュー糖)", baseGrams: 18 }
    ]
  },
  {
    id: "firm-detail-nerikiri-base",
    name: "Firm Detail Nerikiri Base",
    description: "A firmer dough for crisper cuts, edges, and hand-formed detail.",
    yieldGrams: 344,
    ingredients: [
      { id: "white-bean-paste", name: "White bean paste (白こしあん)", baseGrams: 300 },
      { id: "shiratama-flour", name: "Shiratama flour (白玉粉)", baseGrams: 14 },
      { id: "water", name: "Water (水)", baseGrams: 12, role: "hydration-target" },
      { id: "granulated-sugar", name: "Granulated sugar (グラニュー糖)", baseGrams: 18 }
    ]
  }
];

export const DEFAULT_RECIPES = [
  {
    id: "iris-nerikiri",
    name: "Iris Nerikiri (あやめ)",
    description:
      "22 g white + 3 g purple + 1 g yellow + 2 g green nerikiri paste, plus 13 g inner filling per piece.",
    yieldGrams: 41,
    baseDoughRecipeId: "base-nerikiri-paste",
    ingredients: [
      { id: "white-nerikiri-paste", name: "White nerikiri paste", baseGrams: 22, type: "colored-dough" },
      { id: "purple-nerikiri-paste", name: "Purple nerikiri paste", baseGrams: 3, type: "colored-dough", colorLabel: "purple" },
      { id: "yellow-nerikiri-paste", name: "Yellow nerikiri paste", baseGrams: 1, type: "colored-dough", colorLabel: "yellow" },
      { id: "green-nerikiri-paste", name: "Green nerikiri paste", baseGrams: 2, type: "colored-dough", colorLabel: "green" },
      { id: "inner-filling-paste", name: "Inner filling paste", baseGrams: 13, type: "filling" }
    ]
  },
  {
    id: "sakura-nerikiri",
    name: "Sakura Nerikiri (桜)",
    description: "10 g white + 16 g light pink + 1 g yellow nerikiri paste per piece.",
    yieldGrams: 27,
    baseDoughRecipeId: "base-nerikiri-paste",
    ingredients: [
      { id: "white-nerikiri-paste", name: "White nerikiri paste", baseGrams: 10, type: "colored-dough" },
      { id: "light-pink-nerikiri-paste", name: "Light pink nerikiri paste", baseGrams: 16, type: "colored-dough", colorLabel: "pink" },
      { id: "yellow-nerikiri-paste", name: "Yellow nerikiri paste", baseGrams: 1, type: "colored-dough", colorLabel: "yellow" }
    ]
  }
];

export const RECIPES = DEFAULT_RECIPES;
