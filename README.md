# Nerikiri Recipe Calculator

## Executive Overview

This app is a static browser-based nerikiri production planner.

At a high level, it does three things:

1. Scales a selected recipe by `piece count` or by `target batch weight`.
2. Builds a practical production report from that scaling math.
3. Stores editable recipes locally in the browser through `Recipe Studio`.

The current built-in recipes are finished-piece recipes, not abstract shape presets. So in exact mode:

- the user enters `piece count`
- the selected recipe supplies the `piece weight`
- the app scales the finished piece recipe directly

For built-in colored-piece recipes such as `Iris Nerikiri` and `Sakura Nerikiri`, the app also links those finished recipes back to a shared white base dough recipe. That lets it show:

- the total amount of finished colored dough required
- the scaled base white nerikiri dough needed for that batch
- the color split for each portion
- any filling that should be weighed separately

The app also contains a general hydration-adjustment engine, but that only affects recipes that explicitly define a hydration target ingredient.

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

### Hydration-aware dough flow

```text
[Recipe has hydrationTargetIngredientId]
              |
              v
[Scale recipe normally]
              |
              v
[Apply process loss first]
              |
              v
[Find scaled base water]
              |
              +--> powder mode -> [leave water unchanged]
              |
              +--> liquid mode -> [subtract liquid coloring amount]
                                   |
                                   v
                         [Clamp at zero]
              |
              v
[Show scaled base water, coloring contribution, final water to add]
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
- Links finished-piece recipes to a shared white base dough through `baseDoughRecipeId`.

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

- dough-style recipes with a `hydrationTargetIngredientId` can use liquid-color correction (though use with caution as paste and liquid colors vary in hydration)
- the current built-in finished-piece recipes do not use hydration adjustment directly
- even though the shared base dough recipe contains water, the current base-dough decomposition report is informational scaling, not a hydration-adjusted dough planner

### 4. Process loss and round weigh-outs

`Process loss (%)` increases the batch before ingredient scaling.

```text
requiredPreLossGrams = targetOutputGrams / (1 - processLossPct / 100)
```

Practical meaning:

- if you want `410 g` finished output and expect `10%` loss
- the app scales the recipe to `455.56 g` before ingredient math

`Round weigh-outs` does not change the underlying exact scale factor. It changes the displayed weigh-out values after scaling so they are easier to measure in practice.

Practical meaning:

- exact math might produce `8.13 g`
- rounding to `0.1 g` displays `8.1 g`
- rounding to `0.25 g` displays `8.25 g`

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

The hero metrics change slightly depending on the recipe:

- for linked finished-piece recipes, the hero highlights total base dough required
- for hydration-aware dough recipes, the hero highlights final water to add

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
  Main app shell, calculator view, and Recipe Studio view.
- `src/app.js`
  UI state, rendering, report composition, recipe selection, and browser interactions.
- `src/calculator.js`
  Scaling engine, hydration adjustment, process-loss handling, rounding, and base-dough/color-split calculations.
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
-> app applies hydration logic only for recipes that declare a hydration target
-> Recipe Studio stores additional recipes locally
```
