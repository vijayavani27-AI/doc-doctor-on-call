# nutrition_in.csv: common Indian foods (approximate, per serving)

About 65 everyday Indian foods and dishes from the South, North and West, plus rice, millets, protein foods, drinks, fruits, snacks and sweets.

**These values are approximate and for education only.** They are not a diet plan and not medical advice. Real values change with the recipe, oil, salt, portion size and variety. People with diabetes, kidney disease, heart disease, or on a special diet should plan meals with their doctor or a qualified dietitian.

## Columns

| Column | Meaning |
|---|---|
| `key` | Stable snake_case id (e.g. `idli`, `dal_tadka`) |
| `name` | English name |
| `name_ta` | Tamil name (Tamil script) |
| `name_hi` | Hindi name (Devanagari) |
| `serving` | Plain household measure the numbers refer to (e.g. "2 medium idli", "1 katori (150 g)") |
| `serving_g` | Approximate weight of that serving in grams (ml for drinks, treated as g) |
| `kcal` | Energy per serving (kcal) |
| `carbs_g` | Total carbohydrate per serving (g) |
| `protein_g` | Protein per serving (g) |
| `fat_g` | Total fat per serving (g) |
| `fiber_g` | Dietary fibre per serving (g) |
| `sodium_mg` | Sodium per serving (mg). For home recipes this assumes a typical amount of added salt. Plain rice, roti and millets assume no added salt |
| `gi_band` | Glycaemic index band: `low` (55 or less), `medium` (56–69), `high` (70 or more) |
| `veg` | `true` = vegetarian (no meat, fish or egg); `false` = non-vegetarian (egg counts as non-veg) |
| `tags` | Semicolon list from: breakfast, lunch, dinner, snack, drink, sweet, fried, high_protein, high_fiber, millet, fruit |
| `source` | Where the numbers come from (see below) |

All numbers are **per stated serving**, not per 100 g, and are rounded.

## Sources

- **IFCT 2017**: *Indian Food Composition Tables*, T. Longvah et al., National Institute of Nutrition (ICMR-NIN), Hyderabad, 2017. We used it for raw ingredients. Dishes marked `std recipe` were worked out from IFCT ingredient values using a typical home recipe, so they are estimates.
- **USDA FDC**: USDA FoodData Central (fdc.nal.usda.gov). We used it for single foods that IFCT does not list in a ready-to-eat form, such as cooked rice, egg, fruits, bread and coconut water.
- **GI bands**:
  - `GI band: Atkinson et al. 2021 Intl GI tables` means the band comes from published values for that food or its main ingredient. Source: Atkinson FS, Brand-Miller JC, Foster-Powell K, Buyken AE, Goletzke J. *International tables of glycemic index and glycemic load values 2021: a systematic review.* Am J Clin Nutr 2021;114:1625–1632 (University of Sydney GI database).
  - `GI band estimated` means we found no reliable published value for the dish as cooked in India. The band is a careful best guess from the main ingredients and the cooking method. When unsure, we chose the higher band.
  - `negligible carbs, GI band low by convention` applies to foods that have almost no carbohydrate, such as egg, paneer, chicken and fish curry. GI does not really apply to these foods.

## Notes for using this data

- GI tells you how fast a food raises blood sugar. It does not tell you how much. Portion size (glycaemic load), what you eat with it, and how it is cooked all matter. A high-GI food in a small portion with dal, vegetables or curd may raise sugar less.
- Sodium in home dishes depends on how much salt the cook adds. Treat these numbers as rough guides.
- In the app, show these values as "approx." Do not use them for medical dosing, such as insulin carb counting, unless a doctor or diabetes educator has checked them.
