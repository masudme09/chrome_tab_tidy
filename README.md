# Tab Tidy

A small Chrome extension that tidies your tabs in one click:

- **Closes duplicate tabs** across all windows, grouped or not. It keeps the active copy if there is one, otherwise a pinned copy, otherwise the leftmost one.
- **Groups the remaining tabs by site** (for example `hub88.atlassian.net` or `docs.google.com`), each site in its own color.
- **Leaves pinned tabs and groups you named yourself alone.**

## Duplicate detection

Two tabs count as the same page when:

- **Jira:** they show the same issue (`/browse/BO-123`), whatever extra parameters are in the link.
- **Confluence:** they show the same page id, even if the title in the link has changed.
- **Google Docs, Sheets, Slides and Drive:** they show the same file, whatever the view, sheet tab or sharing link.
- **Any other site:** the links match once tracking codes (`utm_*`, `fbclid`, `gclid`, …), `www.`, trailing slashes and plain `#anchors` are ignored and the parameters are put in the same order.

Hash routes such as Gmail's `#inbox/<id>` are kept, so two different emails never count as the same page.

## Install

1. Clone or download this repo into a folder you'll keep. Chrome loads the extension from this folder, so don't move or delete it.
2. Open `chrome://extensions` and turn on **Developer mode** (top right).
3. Click **Load unpacked** and pick the folder.
4. Pin it: click the puzzle icon, then the pushpin next to Tab Tidy.

To run it, click the toolbar button or press **Option+Shift+T** (**Alt+Shift+T** on Windows/Linux). You can change the shortcut at `chrome://extensions/shortcuts`.

## Updating

Pull the latest changes into the same folder, then click the reload icon on Tab Tidy's card in `chrome://extensions`.

## Settings

The settings are at the top of `background.js`:

| Setting | Default | Meaning |
|---|---|---|
| `MIN_GROUP_SIZE` | `2` | Sites with fewer tabs than this stay ungrouped |
| `COLLAPSE_GROUPS` | `false` | Collapse the groups after tidying |
| `STRIP_WWW` | `true` | Treat `www.example.com` and `example.com` as the same site |

## Debugging

On `chrome://extensions`, click **service worker** on Tab Tidy's card. Each run lists the URLs it closed as duplicates in the console.
