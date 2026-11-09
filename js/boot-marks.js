/* Records script and long-task timing until the first auth request. Sends nothing and stores no user. */
(function () {
  var MARK = '202611090245';
  var root = document.documentElement;
  var resources = [];
  var tasks = [];
  var frozen = false;
  var arming = true;
  var authStart = null;
  var watchers = [];
  function classify(name) {
    try {
      if (!/^https?:/i.test(name)) return null;
      var url = new URL(name);
      var version = url.searchParams.get('v');
      var path = url.pathname;
      if (version && /^[0-9]+$/.test(version)) path += '?v=' + version;
      var kind = 'other';
      if (url.pathname.indexOf('/auth/v1/user') !== -1) kind = 'auth';
      else if (url.pathname.indexOf('/rest/v1/rpc/') !== -1) kind = 'rpc';
      else if (url.hostname === location.hostname) kind = 'same';
      else if (url.hostname === 'esm.sh') kind = 'esm';
      return { kind: kind, path: path, auth: kind === 'auth' };
    } catch (e) {
      return null;
    }
  }
  function publish(extra) {
    var nav = (performance.getEntriesByType && performance.getEntriesByType('navigation')[0]) || null;
    var data = {
      v: MARK,
      docEnd: nav ? Math.round(nav.responseEnd) : null,
      authStart: authStart,
      frozen: frozen,
      resources: resources.slice(),
      tasks: tasks.slice()
    };
    if (extra) Object.keys(extra).forEach(function (key) { data[key] = extra[key]; });
    try { window.__claBootMarks = data; } catch (e) { /* the page can still read the attribute */ }
    try { root.setAttribute('data-boot-marks', JSON.stringify(data)); } catch (e2) { /* attribute is the copy */ }
  }
  function disconnect() {
    watchers.forEach(function (watcher) { try { watcher.disconnect(); } catch (e) { /* already closed */ } });
    watchers = [];
  }
  function seal() {
    if (frozen || authStart == null) return;
    frozen = true;
    publish();
    disconnect();
  }
  function addResource(entry) {
    if (frozen || !entry) return;
    var info = classify(entry.name);
    if (!info) return;
    if (authStart != null && entry.startTime > authStart) return;
    resources.push({
      k: info.kind,
      p: info.path,
      i: entry.initiatorType || '',
      s: Math.round(entry.startTime),
      e: Math.round(entry.responseEnd),
      t: entry.transferSize || 0,
      d: entry.decodedBodySize || 0
    });
    if (info.auth) {
      authStart = Math.round(entry.startTime);
      if (!arming) seal();
    }
  }
  function addTask(entry) {
    if (frozen || !entry) return;
    if (authStart != null && entry.startTime > authStart) return;
    var src = '';
    if (entry.attribution && entry.attribution.length && /^https?:/i.test(entry.attribution[0].name || '')) src = classify(entry.attribution[0].name);
    tasks.push({ s: Math.round(entry.startTime), dur: Math.round(entry.duration), p: src ? src.path : '' });
  }
  function watch(type, take) {
    try {
      var observer = new PerformanceObserver(function (list) { list.getEntries().forEach(take); });
      observer.observe({ type: type, buffered: true });
      watchers.push(observer);
      return true;
    } catch (e) {
      return false;
    }
  }
  if (typeof PerformanceObserver !== 'function' || !performance.getEntriesByType) {
    publish({ unsupported: true });
    return;
  }
  var sawResource = watch('resource', addResource);
  var sawTask = watch('longtask', addTask);
  arming = false;
  if (!sawResource && !sawTask) publish({ unsupported: true });
  else if (authStart != null) seal();
  else publish();
})();
