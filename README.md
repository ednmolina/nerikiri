# Nerikiri 練り切り

A static, browser-based planner for nerikiri. Pick a design, say how many pieces you want, and it gives you a step-by-step prep sheet whose totals add up:

1. **Make one batch of base dough 生地を作る**: raw weights to cook in one pot.
2. **Divide the cooked dough and color it 分けて色付け**: each color portion, with a bar showing the split.
3. **Weigh the filling separately 中あんを量る**: when the design has one.
4. **Shape each piece 成形する**: the per-piece recipe.

A **totals check** at the end shows the arithmetic, and warns when a base dough's yield can't be right (for example, a yield that assumes no water cooks off).

## First visit: four quick questions

New visitors aren't dropped straight into the full breakdown. A short guided setup asks one thing per screen:

1. What are you making?
2. How many pieces?
3. How much extra dough for handling? (0%, 5%, 10% recommended, 15%)
4. Powder or liquid coloring?

**Show my recipe** then opens the full prep sheet, with a one-line summary of the answers and a **Change** button to go through them again. Returning visits go straight to the prep sheet.

## One app, arranged for the screen

| Screen | Layout |
| --- | --- |
| iPad, Mac, laptop (≥ 760 px) | Top bar with **Calculator** and **Recipe Studio**. Setup on the left (design cards, pieces stepper, extra-dough chips, More options), prep sheet on the right. |
| iPhone (< 760 px) | Large title you tap to switch designs, the prep sheet scrolling underneath, a floating **Pieces** bar above a **Plan / Recipes** tab bar, and a **Batch Options** sheet for base dough, rounding and coloring. |

Colors follow Apple's grouped system palette and switch automatically with the device's light or dark appearance. On iPhone, "Add to Home Screen" opens it full screen.

## Names are always English + Japanese

Every recipe, base dough, ingredient, color, filling and step shows its English name followed by its Japanese name (`White bean paste 白こしあん`). Buttons and settings are English only. Recipe Studio has a Japanese field for every name and flags any that are missing.

## Recipe Studio

- **Designs**: one row per colored portion (color, English, Japanese, grams, dough or filling). The piece weight is the sum of the rows, so it can't drift out of sync.
- **Base doughs**: raw ingredients plus the **cooked yield you weighed**. The calculator uses that yield to work out how much raw dough to make, so measure it once per recipe.
- Built-in recipes can be edited but not deleted. Custom ones can be duplicated and deleted.
- Recipes and your last calculator settings are saved in this browser's `localStorage` on this device. They don't sync between devices, and clearing the site's data removes them.

Older saves (for example `Iris Nerikiri (あやめ)` or `White nerikiri paste`) are tidied into the new name pairs when loaded.

## How the numbers work

- Finished output = pieces × piece weight. Filling is weighed per piece and never inflated by the handling allowance.
- **Extra dough for handling** (0–15%) scales the dough up before splitting: `cooked dough = finished dough ÷ (1 − extra%)`.
- Raw base dough = cooked dough × (raw total ÷ cooked yield) of the chosen base dough.
- **Rounding** always rounds weigh-outs **up** to 0.5 g or 1 g, so no portion comes out light.
- **Liquid coloring** is subtracted from the base dough's water, gram for gram.

## Files

- `index.html`: the page (both layouts and the options sheet).
- `styles.css`: design tokens, light/dark, wide and phone layouts.
- `src/app.js`: state, rendering, Recipe Studio, event handling.
- `src/calculator.js`: scaling, process loss, rounding, color split, consistency checks.
- `src/recipe-store.js`: localStorage, default/custom merge, validation, legacy-name cleanup.
- `src/data.js`: built-in designs, base doughs, color swatches, bilingual step labels.
- `tests/`: calculator and recipe-store tests.

## Run and test

```bash
python3 -m http.server 8000
```

Then open http://localhost:8000.

```bash
npm test
```
