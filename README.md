# Nerikiri Recipe Calculator

## Executive Overview

This app is a static browser-based nerikiri planner with two distinct jobs:

1. Scale a selected recipe by piece count or by target batch weight.
2. Show the production math behind that recipe in a way that is useful at the bench.

At the moment, the built-in recipes are finished-piece recipes such as `Iris Nerikiri` and `Sakura Nerikiri`, not generic dough formulas. That means:

- exact mode is driven by `piece count`
- the selected recipe determines `piece weight`
- the app can also back-calculate the amount of base white nerikiri dough needed, then show how to split and tint that dough for each color portion

The app also includes a `Recipe Studio` view for creating and editing browser-saved recipes, plus an optional hydration-adjustment engine for recipes that explicitly define a hydration target ingredient.

## High-Level Mental Model

Think of the app as three layers:

- `Recipe definition`
  This describes what one finished piece weighs and what ingredients or colored portions make it up.
- `Scaling engine`
  This turns piece count or batch grams into scaled ingredient amounts.
- `Production report`
  This shows final weigh-outs, optional hydration adjustment, and when available, a base-dough breakdown plus color split.

## Workflow At A Glance

### Calculator flow

```text
[Select recipe]
      |
      v
[Choose mode]
  |             |
  |             +--> [Batch grams]
  |
  +--> [Piece count]
          |
          v
 [Recipe yieldGrams = piece weight]
          |
          v
 [targetOutputGrams]
          |
          v
 [Scale recipe ingredients]
          |
          +--> [Hydration adjustment if recipe has hydrationTargetIngredientId]
          |
          +--> [Base dough + color split if recipe has baseDoughRecipeId and colored-dough ingredients]
          |
          v
 [Recipe report]
```

### Built-in finished-piece recipe flow

```text
[Finished-piece recipe]
      |
      +--> [Scale finished colored portions]
      |
      +--> [Find linked base dough recipe]
      |
      +--> [Compute total colored dough needed]
      |
      +--> [Scale base white dough recipe to match]
      |
      +--> [Show color split]
      |
      +--> [Show filling separately]
```

### Recipe storage flow

```text
[Built-in default recipes in code]
              +
[Custom recipes in localStorage]
              |
              v
[Merged recipe library in the browser]
              |
              v
[Calculator dropdown + Recipe Studio library]
```

## What The App Does Today

- Supports `Exact pieces` mode and `Batch grams` mode.
- Uses recipe-defined `yieldGrams` as the per-piece weight in exact mode.
- Supports process loss and optional rounding.
- Supports powder vs liquid coloring settings.
- Supports a separate `Recipe Studio` tab.
- Persists recipes in browser `localStorage`.
- Includes a base-dough decomposition report for built-in colored-piece recipes.

## Current Built-In Logic

### 1. Finished-piece recipes

The built-in recipes in `src/data.js` are currently finished-piece recipes:

- `Iris Nerikiri (あやめ)`
- `Sakura Nerikiri (桜)`

Each one defines:

- a `yieldGrams` value for one finished piece
- finished colored dough portions
- optional filling portions
- a `baseDoughRecipeId` pointing to the shared white nerikiri base dough

In exact mode:

```text
targetOutputGrams = pieceCount x recipe.yieldGrams
```

So the user does not choose a separate shape or separate piece weight. The recipe already defines that.

### 2. Base dough decomposition

If a finished-piece recipe has a `baseDoughRecipeId`, the app computes:

- total colored dough required for the batch
- the scaled white base dough recipe needed to produce that amount
- the final color split by portion
- any filling that should be weighed separately

This is what powers the `Base dough` and `Color split` sections of the report.

### 3. Hydration adjustment

The hydration engine is still general-purpose:

```text
adjustedWaterToAdd = max(0, scaledBaseWater - liquidColoringAmount)
```

But it only applies when the selected recipe itself declares a hydration target ingredient.

That means:

- dough-style recipes with a `hydrationTargetIngredientId` can use liquid-color correction
- the current built-in finished-piece recipes do not use hydration adjustment directly
- even though the shared base dough recipe contains water, the current base-dough decomposition report is informational scaling, not a hydration-adjusted dough planner

## Current UI Behavior

### Calculator

The Calculator view currently works like this:

- `Recipe`: choose the recipe to scale
- `Calculation mode`: exact pieces or batch grams
- `Piece count`: editable in exact mode
- `Recipe piece weight (g)`: read-only, derived from the selected recipe
- `Desired finished dough (g)`: editable in batch mode
- `Process loss (%)`: scales the batch upward before reporting
- `Round weigh-outs`: optional rounding increment
- `Coloring mode`: powder or liquid
- `Liquid coloring total (g)`: only visible in liquid mode

### Recipe report

Depending on the recipe, the report can show:

- batch summary
- production detail
- hydration adjustment
- base dough report
- color split
- filling reminder chips
- full ingredient breakdown

### Recipe Studio

Recipe Studio currently lets the user:

- create a new recipe
- edit an existing recipe
- duplicate a recipe
- add and remove ingredients
- choose a hydration target ingredient
- save recipes locally in the browser

## Important Current Constraint

Recipe Studio validation currently assumes a saved custom recipe should have a hydration target ingredient.

That means there is a difference between:

- built-in finished-piece recipes defined in code, which may not have a hydration target
- custom recipes created in Recipe Studio, which currently do require one

So the app already supports both recipe styles in the calculator, but the authoring path in Recipe Studio is still biased toward dough-style recipes.

## Data Model Summary

### Built-in base dough recipe

The app currently includes a shared white base dough recipe:

```text
Base Nerikiri Paste (練り切り生地)
- White bean paste
- Shiratama flour
- Water
- Granulated sugar
```

### Built-in finished-piece recipes

Finished-piece recipes reference the base dough recipe like this:

```text
finished-piece recipe
  -> yieldGrams
  -> colored-dough ingredients
  -> optional filling ingredients
  -> baseDoughRecipeId
```

### Hydration-aware recipes

Hydration-aware recipes use:

```text
recipe
  -> hydrationTargetIngredientId
  -> ingredients[]
```

If that target exists, liquid coloring can reduce the amount of water to add.

## File Map

- `index.html`
  Main app shell and both top-level views.
- `src/app.js`
  UI state, rendering, report composition, and browser interactions.
- `src/calculator.js`
  Scaling engine, hydration adjustment, and base-dough/color-split calculations.
- `src/data.js`
  Built-in finished-piece recipes and the shared base dough recipe.
- `src/recipe-store.js`
  Browser storage, default/custom recipe merge logic, and recipe validation.
- `tests/`
  Calculation and recipe-store tests.

## Run Locally

Use any static file server from the project root. Example:

```bash
python3 -m http.server 8000
```

Then open:

```text
http://localhost:8000
```

## Test

```bash
npm test
```

## Current Summary

If you want the shortest accurate summary of the app today, it is this:

```text
Finished-piece recipe selected
-> piece count or batch grams entered
-> app scales the finished recipe
-> app optionally derives the white base dough needed
-> app shows how to split and color that dough
-> Recipe Studio stores additional recipes locally
```
