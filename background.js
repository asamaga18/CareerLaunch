// Blocks visits to known distracting sites by closing the tab and focusing the right-most remaining tab in the same window.
const defaultBlockedHosts = [
  "facebook.com",
  "twitter.com",
  "instagram.com",
  "youtube.com",
  "tiktok.com"
];

let blockedHosts = [...defaultBlockedHosts];

// Prime the in-memory list on startup.
void loadBlockedHosts();

async function loadBlockedHosts() {
  try {
    const result = await chrome.storage.sync.get({ blockedHosts: defaultBlockedHosts });
    const hosts = Array.isArray(result.blockedHosts) ? result.blockedHosts : defaultBlockedHosts;
    blockedHosts = hosts.filter(Boolean);
  } catch (error) {
    blockedHosts = [...defaultBlockedHosts];
  }
}

chrome.runtime.onInstalled.addListener(async () => {
  const result = await chrome.storage.sync.get({ blockedHosts: null });
  if (!Array.isArray(result.blockedHosts)) {
    await chrome.storage.sync.set({ blockedHosts: defaultBlockedHosts });
  }
  await loadBlockedHosts();
});

chrome.storage.onChanged.addListener((changes, areaName) => {
  if (areaName === "sync" && changes.blockedHosts) {
    const hosts = Array.isArray(changes.blockedHosts.newValue)
      ? changes.blockedHosts.newValue
      : defaultBlockedHosts;
    blockedHosts = hosts.filter(Boolean);
  }
});

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (message?.type === "saveBlockedHosts" && Array.isArray(message.hosts)) {
    const sanitized = message.hosts
      .map((host) => (typeof host === "string" ? host.trim() : ""))
      .filter(Boolean);
    chrome.storage.sync.set({ blockedHosts: sanitized.length ? sanitized : defaultBlockedHosts });
    sendResponse({ ok: true });
    return true;
  }
  return undefined;
});

function isBlocked(url) {
  try {
    const { hostname } = new URL(url);
    return blockedHosts.some(
      (blocked) => hostname === blocked || hostname.endsWith(`.${blocked}`)
    );
  } catch (error) {
    return false;
  }
}

function showBlockedNotification(hostname) {
  void (async () => {
    try {
      const iconUrl = chrome.runtime.getURL("manifestLogo.png");
      await chrome.notifications.create({
        type: "basic",
        iconUrl,
        title: "MindGym",
        message: hostname ? `${hostname} is blocked.` : "This site is blocked."
      });
    } catch (error) {
      // Notification failures shouldn't interrupt the blocking flow.
    }
  })();
}

function openBlockedPopup(hostname) {
  void (async () => {
    try {
      const url = chrome.runtime.getURL("blocked.html");
      const withHost = hostname ? `${url}?host=${encodeURIComponent(hostname)}` : url;
      await chrome.windows.create({
        url: withHost,
        type: "popup",
        width: 360,
        height: 200,
        focused: true
      });
    } catch (error) {
      // If the popup fails, still continue closing the tab.
    }
  })();
}

async function focusRightmostTab(windowId, closedTabId) {
  try {
    const tabs = await chrome.tabs.query({ windowId });
    const remaining = tabs.filter((candidate) => candidate.id !== closedTabId);
    if (remaining.length === 0) {
      await chrome.tabs.create({});
      return;
    }

    const rightmost = remaining.reduce((current, candidate) =>
      candidate.index > current.index ? candidate : current
    );

    await chrome.tabs.update(rightmost.id, { active: true });
  } catch (error) {
    await chrome.tabs.create({});
  }
}

function focusAndClose(tabId, windowId) {
  void (async () => {
    try {
      await chrome.tabs.remove(tabId);
    } catch (error) {
      return;
    }

    await focusRightmostTab(windowId, tabId);
  })();
}

chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
  const url = changeInfo.url || tab.url;
  if (!url || changeInfo.status !== "complete") {
    return;
  }

  if (isBlocked(url)) {
    let hostname = "";
    try {
      hostname = new URL(url).hostname;
    } catch (error) {
      hostname = "";
    }

    showBlockedNotification(hostname);
    openBlockedPopup(hostname);
    focusAndClose(tabId, tab.windowId);
  }
});
