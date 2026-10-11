/*
 * Minimal stand-in for the chrome.* extension APIs so the real
 * popup/popup.html + popup.js from the extension can run inside the video
 * stage. The stage (parent window) drives it through window.__popupBridge.
 *
 * When embedded in the stage, timers and Date are bound to the stage's
 * virtual clock so every rendered frame is deterministic.
 */
(function () {
  const host = window.parent !== window ? window.parent : null;
  const vclock = host && host.__vclock;

  if (vclock) {
    const RealDate = window.Date;
    class VirtualDate extends RealDate {
      constructor(...args) {
        if (args.length === 0) super(vclock.epoch + vclock.now);
        else super(...args);
      }
      static now() {
        return vclock.epoch + vclock.now;
      }
    }
    window.Date = VirtualDate;
    window.setTimeout = (fn, ms, ...a) => vclock.setTimeout(fn, ms, a);
    window.setInterval = (fn, ms, ...a) => vclock.setInterval(fn, ms, a);
    window.clearTimeout = (id) => vclock.clear(id);
    window.clearInterval = (id) => vclock.clear(id);
    window.requestAnimationFrame = (fn) => vclock.setTimeout(() => fn(vclock.now), 16, []);
    window.cancelAnimationFrame = (id) => vclock.clear(id);
  }

  // Storage survives closing/reopening the popup, like chrome.storage does.
  const store = (host && (host.__extStore = host.__extStore || {})) || {};
  const listeners = [];

  // The stage decides how the "content script" answers. Default: not
  // connected, which is what Chrome reports for a YouTube tab whose page
  // has no content script running yet.
  let tabMessageHandler = async () => {
    throw new Error('Could not establish connection. Receiving end does not exist.');
  };

  const pick = (keys) => {
    if (keys == null) return JSON.parse(JSON.stringify(store));
    const list = Array.isArray(keys) ? keys : typeof keys === 'string' ? [keys] : Object.keys(keys);
    const out = {};
    list.forEach((k) => {
      if (k in store) out[k] = JSON.parse(JSON.stringify(store[k]));
    });
    return out;
  };

  const emptyStats = {
    totalVideosWatched: 0,
    totalWatchTimeSeconds: 0,
    totalLikes: 0,
    totalComments: 0,
    totalShares: 0,
    totalSubscribes: 0,
    totalSessions: 0
  };

  window.chrome = {
    storage: {
      local: {
        get: async (keys) => pick(keys),
        set: async (obj) => {
          Object.assign(store, JSON.parse(JSON.stringify(obj)));
        },
        remove: async (keys) => {
          (Array.isArray(keys) ? keys : [keys]).forEach((k) => delete store[k]);
        }
      },
      onChanged: { addListener() {} }
    },
    tabs: {
      query: async () => [{ id: 1, url: 'https://www.youtube.com/', active: true }],
      sendMessage: (tabId, msg) => tabMessageHandler(msg)
    },
    runtime: {
      id: 'stage',
      lastError: undefined,
      getURL: (p) => p,
      sendMessage: async (msg) => {
        if (msg && msg.action === 'getStats') return { success: true, stats: { ...emptyStats } };
        return { success: true };
      },
      onMessage: { addListener: (fn) => listeners.push(fn) }
    }
  };

  window.__popupBridge = {
    store,
    setTabMessageHandler(fn) {
      tabMessageHandler = fn;
    },
    emit(message) {
      listeners.forEach((fn) => {
        try {
          fn(message, {}, () => {});
        } catch (e) {
          console.error(e);
        }
      });
    }
  };
})();
