// Every recipe, base dough and ingredient carries an English `name` and a Japanese `jp`.
// The UI always shows them together as "English 日本語".

export const BASE_DOUGH_RECIPES = [
  {
    id: "base-nerikiri-paste",
    name: "Base Nerikiri Paste",
    jp: "練り切り生地",
    description: "White bean paste base dough. Book yield: a little over 300 g.",
    yieldGrams: 330,
    hydrationTargetIngredientId: "water",
    ingredients: [
      { id: "white-bean-paste", name: "White bean paste", jp: "白こしあん", baseGrams: 300 },
      { id: "shiratama-flour", name: "Shiratama flour", jp: "白玉粉", baseGrams: 10 },
      { id: "water", name: "Water", jp: "水", baseGrams: 20, role: "hydration-target" },
      { id: "granulated-sugar", name: "Granulated sugar", jp: "グラニュー糖", baseGrams: 20 }
    ]
  },
  {
    id: "soft-petal-nerikiri-base",
    name: "Soft Petal Nerikiri Base",
    jp: "やわらかめ生地",
    description: "A slightly softer batch for thin petals and gentle blending. Yield assumes the added water boils off during cooking.",
    yieldGrams: 326,
    hydrationTargetIngredientId: "water",
    ingredients: [
      { id: "white-bean-paste", name: "White bean paste", jp: "白こしあん", baseGrams: 300 },
      { id: "shiratama-flour", name: "Shiratama flour", jp: "白玉粉", baseGrams: 8 },
      { id: "water", name: "Water", jp: "水", baseGrams: 26, role: "hydration-target" },
      { id: "granulated-sugar", name: "Granulated sugar", jp: "グラニュー糖", baseGrams: 18 }
    ]
  },
  {
    id: "firm-detail-nerikiri-base",
    name: "Firm Detail Nerikiri Base",
    jp: "かため生地",
    description: "A firmer dough for crisper cuts, edges, and hand-formed detail. Yield assumes the added water boils off during cooking.",
    yieldGrams: 332,
    hydrationTargetIngredientId: "water",
    ingredients: [
      { id: "white-bean-paste", name: "White bean paste", jp: "白こしあん", baseGrams: 300 },
      { id: "shiratama-flour", name: "Shiratama flour", jp: "白玉粉", baseGrams: 14 },
      { id: "water", name: "Water", jp: "水", baseGrams: 12, role: "hydration-target" },
      { id: "granulated-sugar", name: "Granulated sugar", jp: "グラニュー糖", baseGrams: 18 }
    ]
  }
];

export const DEFAULT_RECIPES = [
  {
    id: "iris-nerikiri",
    name: "Iris",
    jp: "あやめ",
    description:
      "22 g white + 3 g purple + 1 g yellow + 2 g green nerikiri paste, plus 13 g inner filling per piece.",
    yieldGrams: 41,
    baseDoughRecipeId: "base-nerikiri-paste",
    ingredients: [
      { id: "white-nerikiri-paste", name: "White", jp: "白", baseGrams: 22, type: "colored-dough", swatch: "#F4F0E6" },
      { id: "purple-nerikiri-paste", name: "Purple", jp: "紫", baseGrams: 3, type: "colored-dough", colorLabel: "purple", swatch: "#7F62AD" },
      { id: "yellow-nerikiri-paste", name: "Yellow", jp: "黄", baseGrams: 1, type: "colored-dough", colorLabel: "yellow", swatch: "#E8C14B" },
      { id: "green-nerikiri-paste", name: "Green", jp: "緑", baseGrams: 2, type: "colored-dough", colorLabel: "green", swatch: "#6E9A57" },
      { id: "inner-filling-paste", name: "Inner filling", jp: "中あん", baseGrams: 13, type: "filling", swatch: "#6B4A3A" }
    ]
  },
  {
    id: "sakura-nerikiri",
    name: "Sakura",
    jp: "桜",
    description: "10 g white + 16 g light pink + 1 g yellow nerikiri paste per piece.",
    yieldGrams: 27,
    baseDoughRecipeId: "base-nerikiri-paste",
    ingredients: [
      { id: "white-nerikiri-paste", name: "White", jp: "白", baseGrams: 10, type: "colored-dough", swatch: "#F4F0E6" },
      { id: "light-pink-nerikiri-paste", name: "Light pink", jp: "薄桃", baseGrams: 16, type: "colored-dough", colorLabel: "pink", swatch: "#EFAFC0" },
      { id: "yellow-nerikiri-paste", name: "Yellow", jp: "黄", baseGrams: 1, type: "colored-dough", colorLabel: "yellow", swatch: "#E8C14B" }
    ]
  }
];

// Fallback swatches for saved recipes created before colors were stored.
export const COLOR_SWATCHES = {
  white: "#F4F0E6",
  purple: "#7F62AD",
  pink: "#EFAFC0",
  yellow: "#E8C14B",
  green: "#6E9A57",
  orange: "#E89A4B",
  red: "#C9483B",
  blue: "#5B7DB8",
  brown: "#6B4A3A",
  black: "#2B2B2B",
  filling: "#6B4A3A"
};

// Step headings and fixed labels, English + Japanese.
export const STEP_LABELS = {
  base: { name: "Make one batch of base dough", jp: "生地を作る" },
  divide: { name: "Divide the cooked dough and color it", jp: "分けて色付け" },
  filling: { name: "Weigh the filling separately", jp: "中あんを量る" },
  shape: { name: "Shape each piece", jp: "成形する" },
  weigh: { name: "Weigh the ingredients", jp: "材料を量る" }
};

export const RECIPES = DEFAULT_RECIPES;
