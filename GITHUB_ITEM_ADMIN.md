# Gotcha Hunt Admin

The separate admin web app is available at:

`https://bryanmorris19.github.io/gotcha-prototype/admin.html`

It scans product barcodes, validates clues and catalog duplicates, and commits
the new item directly to `hunts.json` through GitHub's Contents API.

## One-time token setup

Create a fine-grained personal access token in GitHub:

1. Limit repository access to `bryanmorris19/gotcha-prototype`.
2. Set **Contents** permission to **Read and write**.
3. Do not grant unrelated permissions.
4. Paste the token into the admin page.

The token is saved only in the browser tab's session storage. It is not added
to the repository or sent anywhere other than `api.github.com`.

## Add an item

1. Open `admin.html` and connect the GitHub token.
2. Enter the product name and both clues.
3. Scan the barcode or enter it manually.
4. Confirm the activation date. New items default to tomorrow.
5. Select **Publish Hunt**.

The page creates one commit that updates only `hunts.json`. GitHub Pages then
deploys the updated catalog.

Use the browser's **Add to Home Screen** or **Install App** command to install
the admin page as a separate `Gotcha Admin` web app.

## Delete an item

After connecting GitHub, each catalog item displays a **Delete** button.
Confirming deletion refreshes the latest catalog and creates a commit that
removes that item from `hunts.json`. The final remaining item cannot be deleted.

## Actions fallback

The **Add Hunt Item** workflow remains available in the repository's Actions
tab. It creates a review pull request instead of publishing immediately.

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
