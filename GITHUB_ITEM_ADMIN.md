# GitHub Hunt Item Admin

New hunt items can be added without editing source files locally.

## Add an item

1. Open the repository on GitHub.
2. Select **Actions**.
3. Select **Add Hunt Item**.
4. Select **Run workflow**.
5. Enter the product name, hard clue, easier clue, and barcode.
   Leave the activation date blank to make the item available tomorrow.
6. Run the workflow.
7. Review and merge the pull request it creates.

GitHub Pages redeploys after the pull request is merged into `main`.

## Validation

The workflow rejects:

- Missing product names or clues
- Identical hard and easier clues
- Barcodes outside 8-14 digits
- Duplicate item IDs
- Barcodes already assigned to another item
- Invalid activation dates

Multiple barcode variants can be entered as a comma-separated list.

New items default to activating tomorrow. This prevents a catalog change from
altering the hunt already in progress for the current day.

## Repository Setting

The repository must allow GitHub Actions to create pull requests:

**Settings > Actions > General > Workflow permissions**

Enable **Allow GitHub Actions to create and approve pull requests**. The
workflow creates pull requests but does not approve or merge them.
