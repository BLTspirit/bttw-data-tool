# BTTW Data Tool: User guide

A desktop editor for Balls to the Walls upgrade data. It keeps every node (upgrade) and the full disc layout in one file, `game_data.json`.

## Run it

Needs Node.js. In the repo's root folder:

```
npm install
npm start
```

To open it without a terminal, run `npm run shortcut` once. It puts a **BTTW Data Tool** shortcut on your desktop that launches the tool directly. If you move the tool's folder, run it again.

## First run

1. Open **Settings**. Type or browse to your GameMaker project folder, then click **Fill paths from project folder**.
2. Check the **Sprite folder** path (your project's `sprites` folder). The status should say "found" and show a sprite count.
3. Check where **game_data.json** will be saved. The default is `<project>/data_src/game_data.json`, which is outside `datafiles/`, so it doesn't ship with the game.
4. Click **Save** (or press Ctrl+S). This writes `game_data.json`, and also `scr_game_data.gml` once the game is hooked up (next section).

## Hooking up the game

Save writes two files. `game_data.json` is what the tool opens and edits. `scr_game_data.gml` is generated from it for the game; it holds the same data as a GML struct literal, so nothing readable ships with the build.

One-time setup, in this order:

1. In GameMaker, create an empty script asset named **scr_game_data**. In the tool's Settings, check that the `scr_game_data.gml` path says "found" (Fill paths from project folder sets it).
2. Save in the tool. `scr_game_data.gml` now contains `game_data_get()` and `game_data_stamp()`.
3. In GameMaker, make sure the project has the two hand-written scripts **scr_game_data_loader** and **scr_node_callbacks**. The callbacks file holds your 11 existing `on_purchase` functions.
4. In `reset_stats()`, swap the two old init calls:

   ```gml
   function reset_stats() {
   	scr_init_base_stats();
   	game_data_load_nodes();        // was scr_init_nodes();
   	scr_init_stat_contributors();
   	save_defaults_init();
   	game_data_load_discs();        // was scr_init_disc_data();
   }
   ```

5. Check nothing drifted: add `game_data_compare_legacy();` at the end of `reset_stats()`, run the game once, and read the Output window. It runs the old init scripts and the new loader and lists every difference. Remove the line when it reports 0 (or only differences you expect).
6. Fill in `game_data_on_reload()` in `scr_node_callbacks` with whatever rebuilds your skill tree.
7. Once you're happy, you can delete `upgr.csv`, `nodes_dat/`, `scr_init_nodes` and `scr_init_disc_data`. (`game_data_compare_legacy()` needs them, so delete it or stop calling it at the same time.)

### Day to day

Run the game from the IDE with GMLive, edit in the tool, and press Ctrl+S. GMLive reloads `scr_game_data`, and within half a second the game rebuilds nodes, discs and stats in place without touching your progress. Press **F5** in the game to force a reload. Live reload only runs when the game is launched from the IDE (`GM_build_type == "run"`); packaged builds just use the compiled data.

Notes:

- Icons are written as sprite references (`icon: spr_health_icon`), so GameMaker never strips them as unused. An icon the tool can't find in the sprite folder is written as a name and looked up with `asset_get_index` at runtime, and the Issues tab flags it.
- Empty slots are left out of `global.disc_data` (with a message in the Output window). A disc with no center and no nodes counts in `disc_hierarchy` but is left out of `disc_data`, which is what used to happen when a disc file was missing.
- Numbers keep their exact value. Very large or very small ones are written as `(2.5 * power(10, 30))`, and whole numbers of 2^31 and up as `real(...)`, because GML has no exponent notation and treats big whole-number literals as int64.
- Node and disc ids are written as `key` in the GML, because `id` is a built-in variable name. The loader sets `id` on each node as before.

## Tabs

- **Nodes**: one row per upgrade. Edit cells directly. Click an icon to pick a sprite. Click a column header to sort the view; this doesn't change the order in the file. The description preview mimics the game's text builder.
- **Discs**: zones, orbitals and discs on the left, the selected disc in the middle, and the editor on the right.
  - Any disc can have any number of sectors, rings per sector, and slots per ring.
  - Click a slot or the center to edit it.
  - Drag one slot onto another to swap them.
  - Drag a node from **Unplaced nodes** onto the disc, or select a slot and click a node.
  - Press Delete to clear the selected slot.
- **Issues**: unplaced nodes, empty slots, missing sprites, unknown stats, duplicates, and deleted save keys. Click an issue to jump to it. Issues never block saving.

Ctrl+Z / Ctrl+Y undo and redo any change. Inside a text cell, they undo your typing instead. Each save also keeps the previous version as `game_data.json.bak`.

## What's in game_data.json

```
schema_version  1
nodes           one object per node, in authoring order
zones           [ { orbitals: [ { cluster_dir, discs: [ { id, center, sectors: [ { rings: [ { nodes: [...] } ] } ] } ] } ] } ]
frozen_ids      node ids that existed at import (save keys from the demo)
```

Things to know when you compare it against the old data:

- **`op` + `value` replace the five CSV modifier columns.** `op` is `incr`, `pct`, `pct_add`, `mult`, `activate` or `none`, using the same names as the old columns. To rebuild the old columns, set that column to `value` and leave the rest at their defaults (0, and 1 for `mult`). The import checked that this reproduces every row of `upgr.csv` exactly.
- **`desc_suffix` is the raw 5th `InitNode` argument.** The game's description is the boost text followed by this suffix.
- **Sectors run counter-clockwise from 12 o'clock**, as in the game. Rings run inside out, and slots run counter-clockwise within a ring. This is the same nesting as the old `disc` arrays.
- **`cluster_dir` is `null` for evenly spaced orbitals** and holds the direction in degrees for clustered ones. The old `false` became `null`.
- **Disc ids** (`z0_d3`) come from the old file names and are just labels.
- **`on_purchase` callbacks are not stored.** They stay in GML.
- **Frozen ids are locked.** Ids in `frozen_ids` can't be renamed in the tool, and deleting one is flagged under Issues.

## Checking the old importer without the app

The Import button has been removed (the data was imported once and now lives in game_data.json). The import code is still in `src/js/parsers.js` and `model.js`, and this check still runs:

```
npm test -- "C:\path\to\your\project"
```

This prints what the import would produce. It doesn't write anything.
