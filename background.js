// ---- Settings ----
const MIN_GROUP_SIZE = 2;      // domains with fewer tabs stay ungrouped
const COLLAPSE_GROUPS = false; // true = collapse groups after tidying
const STRIP_WWW = true;
const COLORS = ["blue", "red", "yellow", "green", "pink", "purple", "cyan", "orange", "grey"];

// Query params that never change the page (tracking, share links, etc.)
const DROP_PARAMS = /^(utm_.+|fbclid|gclid|dclid|msclkid|mc_cid|mc_eid|_hsenc|_hsmi|igshid|si|ref|ref_src|atlOrigin|usp|sharingaction|authuser)$/i;

// Site-specific rules: same document/issue/page = duplicate, whatever the view or tab.
const SITE_RULES = [
  // Google Docs / Sheets / Slides / Forms / Drive files: key on the file id (/edit, ?tab=, #gid= ignored)
  [/^(docs|drive)\.google\.com$/, (x) => {
    const m = x.pathname.match(/\/d\/([\w-]+)/);
    return m ? `${x.hostname}/d/${m[1]}` : null;
  }],
  // Jira issues and Confluence pages
  [/\.atlassian\.net$/, (x) => {
    let m = x.pathname.match(/^\/browse\/([A-Z][A-Z0-9_]*-\d+)/i);
    if (m) return `${x.hostname}/browse/${m[1].toUpperCase()}`;
    m = x.pathname.match(/\/wiki\/.*\/pages\/(\d+)/);
    if (m) return `${x.hostname}/wiki/pages/${m[1]}`;
    return null;
  }],
];

const normalizeUrl = (u) => {
  try {
    const x = new URL(u);
    if (!/^https?:$/.test(x.protocol)) return u;
    x.hostname = x.hostname.toLowerCase().replace(/^www\./, "");
    for (const [re, fn] of SITE_RULES) {
      if (re.test(x.hostname)) { const k = fn(x); if (k) return k; }
    }
    // Keep hashes that are app routes (Gmail "#inbox/abc", "#/page"); drop plain anchors ("#section-2").
    const hash = x.hash.includes("/") ? x.hash : "";
    const params = [...x.searchParams.entries()]
      .filter(([k]) => !DROP_PARAMS.test(k))
      .sort(([a], [b]) => a.localeCompare(b));
    const query = params.length ? "?" + new URLSearchParams(params).toString() : "";
    const path = x.pathname.replace(/\/+$/, "") || "/";
    return `${x.hostname}${x.port ? ":" + x.port : ""}${path}${query}${hash}`; // http/https treated the same
  } catch { return u; }
};

const hostOf = (u) => {
  try {
    const x = new URL(u);
    if (!/^https?:$/.test(x.protocol)) return null;
    return STRIP_WWW ? x.hostname.replace(/^www\./, "") : x.hostname;
  } catch { return null; }
};

const colorFor = (s) => {
  let h = 0;
  for (const c of s) h = (h * 31 + c.charCodeAt(0)) >>> 0;
  return COLORS[h % COLORS.length];
};

// Groups this extension made are titled with a hostname; groups you named yourself are left alone.
const isAutoGroup = (title) => !!title && title.includes(".") && !/\s/.test(title);

async function closeDuplicates() {
  const tabs = await chrome.tabs.query({ windowType: "normal" });
  // Which copy survives: the active tab, then a pinned one, then the leftmost one.
  const rank = (t) => (t.active ? 0 : 2) + (t.pinned ? 0 : 1);
  const byUrl = new Map();
  for (const t of tabs) {
    const k = normalizeUrl(t.pendingUrl || t.url);
    if (!byUrl.has(k)) byUrl.set(k, []);
    byUrl.get(k).push(t);
  }
  const toClose = [];
  for (const list of byUrl.values()) {
    if (list.length < 2) continue;
    list.sort((a, b) => rank(a) - rank(b) || a.windowId - b.windowId || a.index - b.index);
    toClose.push(...list.slice(1).map((t) => t.id));
  }
  if (toClose.length) {
    console.log("Tab Tidy closing duplicates:", toClose.map((id) => tabs.find((t) => t.id === id)?.url));
    // Close one by one so a tab that vanished mid-run can't stop the rest from closing.
    for (const id of toClose) {
      try { await chrome.tabs.remove(id); } catch (e) { console.warn("Tab Tidy could not close tab", id, e); }
    }
  }
  return toClose.length;
}

async function groupWindow(windowId) {
  const tabs = await chrome.tabs.query({ windowId });
  const groups = await chrome.tabGroups.query({ windowId });
  const titleOf = new Map(groups.map((g) => [g.id, g.title || ""]));
  const existing = new Map(groups.filter((g) => isAutoGroup(g.title)).map((g) => [g.title, g.id]));

  const byHost = new Map();
  const strays = [];
  for (const t of tabs) {
    if (t.pinned) continue;
    const inGroup = t.groupId !== -1;
    if (inGroup && !isAutoGroup(titleOf.get(t.groupId))) continue; // your own named group
    const h = hostOf(t.pendingUrl || t.url);
    if (!h) { if (inGroup) strays.push(t.id); continue; }
    if (!byHost.has(h)) byHost.set(h, []);
    byHost.get(h).push(t);
  }
  if (strays.length) await chrome.tabs.ungroup(strays);

  const hosts = [...byHost.entries()].sort((a, b) => b[1].length - a[1].length || a[0].localeCompare(b[0]));
  let made = 0;
  for (const [host, list] of hosts) {
    if (list.length < MIN_GROUP_SIZE) {
      const grouped = list.filter((t) => t.groupId !== -1).map((t) => t.id);
      if (grouped.length) await chrome.tabs.ungroup(grouped);
      continue;
    }
    const opts = { tabIds: list.map((t) => t.id) };
    if (existing.has(host)) opts.groupId = existing.get(host);
    else opts.createProperties = { windowId };
    const gid = await chrome.tabs.group(opts);
    await chrome.tabGroups.update(gid, { title: host, color: colorFor(host), collapsed: COLLAPSE_GROUPS });
    await chrome.tabGroups.move(gid, { index: -1 }); // biggest groups first, singles stay on the left
    made++;
  }
  return made;
}

async function tidy() {
  const closed = await closeDuplicates();
  const windows = await chrome.windows.getAll({ windowTypes: ["normal"] });
  let groups = 0;
  for (const w of windows) groups += await groupWindow(w.id);
  await chrome.action.setBadgeBackgroundColor({ color: "#2b7a3d" });
  await chrome.action.setBadgeText({ text: closed ? `-${closed}` : "✓" });
  await chrome.action.setTitle({ title: `Tab Tidy: closed ${closed} duplicate(s), ${groups} group(s)` });
  setTimeout(() => chrome.action.setBadgeText({ text: "" }), 4000);
}

chrome.action.onClicked.addListener(() => {
  tidy().catch((e) => console.error("Tab Tidy failed:", e));
});
