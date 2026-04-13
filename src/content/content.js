// ============================================================
// Orchestra LinkedIn – Content Script
// Injected into linkedin.com pages (all frames).
// Handles INSERT_LINKEDIN_POST messages from the popup.
// ============================================================

var TAG = '[content]';

function _log() {
}

function _warn() {
}

// ---- DOM search utilities ----

/**
 * Returns true if the element has a truthy contenteditable attribute.
 * Handles: contenteditable, contenteditable="", contenteditable="true",
 * contenteditable="plaintext-only".  Rejects "false" and missing.
 */
function isEditable(el) {
  if (!el) return false;
  var val = el.getAttribute('contenteditable');
  return val !== null && val !== 'false';
}

/**
 * Recursively collects [contenteditable] elements from open shadow roots
 * under `root`. Appends results to the `out` array.
 */
function collectFromShadowRoots(root, out, depth) {
  if (!root || depth > 5) return; // cap recursion
  var children;
  try {
    children = root.querySelectorAll('*');
  } catch (e) {
    return;
  }
  for (var i = 0; i < children.length; i++) {
    try {
      var sr = children[i].shadowRoot;
      if (sr) {
        var editable = sr.querySelectorAll('[contenteditable]');
        for (var j = 0; j < editable.length; j++) {
          out.push(editable[j]);
        }
        collectFromShadowRoots(sr, out, depth + 1);
      }
    } catch (e) {
      // cross-origin or closed shadow root — skip
    }
  }
}

/**
 * Finds ALL contenteditable elements on the page:
 *   1. Regular DOM
 *   2. Inside open shadow roots (recursively)
 */
function getAllContenteditable() {
  var results = [];

  // Regular DOM
  var regular = document.querySelectorAll('[contenteditable]');
  for (var i = 0; i < regular.length; i++) {
    results.push(regular[i]);
  }

  // Shadow DOM (open roots only)
  if (document.body) {
    collectFromShadowRoots(document.body, results, 0);
  }

  return results;
}

/**
 * Logs every contenteditable element (regular + shadow) with attributes.
 */
function debugEditors() {
  var all = getAllContenteditable();
  _log('debugEditors: ' + all.length + ' [contenteditable] elements (incl. shadow DOM)');
  for (var i = 0; i < all.length; i++) {
    var el = all[i];
    _log(
      '  [' + i + ']',
      el.tagName.toLowerCase(),
      'class="' + el.className + '"',
      'ce="' + el.getAttribute('contenteditable') + '"',
      'role="' + (el.getAttribute('role') || '') + '"',
      'multiline="' + (el.getAttribute('aria-multiline') || '') + '"',
      'placeholder="' + (el.getAttribute('data-placeholder') || '') + '"',
      'hidden="' + (el.getAttribute('aria-hidden') || '') + '"',
      el.offsetWidth + 'x' + el.offsetHeight,
      'connected=' + el.isConnected,
      el
    );
  }

  // Also log iframe count for diagnostics
  var iframes = document.querySelectorAll('iframe');
  _log('debugEditors: ' + iframes.length + ' iframes on page');

  return all;
}

// ---- Scoring-based editor finder ----

function scoreEditor(el) {
  if (!el || !el.isConnected) return -1;
  if (!isEditable(el)) return -1;

  // Hard disqualifiers
  if (el.classList.contains('ql-clipboard')) return -100;
  if (el.getAttribute('aria-hidden') === 'true') return -100;
  if (el.offsetWidth === 0 && el.offsetHeight === 0) return -100;

  var score = 0;

  // Quill editor class (+10)
  if (el.classList.contains('ql-editor')) score += 10;

  // ARIA role=textbox (+5)
  if (el.getAttribute('role') === 'textbox') score += 5;

  // Multiline (+5)
  if (el.getAttribute('aria-multiline') === 'true') score += 5;

  // LinkedIn test attribute (+5)
  if (el.getAttribute('data-test-ql-editor-contenteditable')) score += 5;

  // Has placeholder (+3)
  if (el.getAttribute('data-placeholder')) score += 3;

  // Inside a LinkedIn compose container (+10)
  try {
    if (el.closest('.share-box, .share-creation-state, .artdeco-modal, [role="dialog"]')) {
      score += 10;
    }
  } catch (e) {
    // .closest() may fail on shadow DOM elements
  }

  return score;
}

function findBestComposer() {
  var all = getAllContenteditable();
  var best = null;
  var bestScore = 0;

  for (var i = 0; i < all.length; i++) {
    var el = all[i];
    var s = scoreEditor(el);
    if (s > bestScore) {
      bestScore = s;
      best = el;
    }
  }

  if (best) {
    _log(
      'findBestComposer: winner score=' + bestScore,
      best.tagName.toLowerCase(),
      'class="' + best.className + '"',
      'ce="' + best.getAttribute('contenteditable') + '"'
    );
  }

  return best;
}

// ---- Insertion strategies ----

function insertByExecCommand(editor, text) {
  _log('insert strategy 1: execCommand');
  try {
    editor.focus();

    var sel = window.getSelection();
    if (sel) {
      sel.selectAllChildren(editor);
    }

    var ok = document.execCommand('insertText', false, text);
    _log('  execCommand returned:', ok);

    if (ok) {
      var got = (editor.innerText || '').trim();
      _log('  editor innerText length:', got.length);
      if (got.length > 0) return true;
    }
    return false;
  } catch (e) {
    _warn('  execCommand error:', e.message);
    return false;
  }
}

function insertByPaste(editor, text) {
  _log('insert strategy 2: synthetic paste');
  try {
    editor.focus();

    var sel = window.getSelection();
    if (sel) {
      sel.selectAllChildren(editor);
    }

    var dt = new DataTransfer();
    dt.setData('text/plain', text);

    var evt = new ClipboardEvent('paste', {
      clipboardData: dt,
      bubbles: true,
      cancelable: true
    });

    editor.dispatchEvent(evt);

    var got = (editor.innerText || '').trim();
    if (got.length > 0 && got !== (editor.getAttribute('data-placeholder') || '')) {
      _log('  paste: content appeared, length=' + got.length);
      return true;
    }

    _log('  paste: no content detected');
    return false;
  } catch (e) {
    _warn('  paste error:', e.message);
    return false;
  }
}

function insertByDOM(editor, text) {
  _log('insert strategy 3: DOM innerHTML');
  try {
    var lines = text.split('\n');
    var html = '';
    for (var i = 0; i < lines.length; i++) {
      var line = lines[i];
      html += '<p>' + (line || '<br>') + '</p>';
    }

    editor.innerHTML = html;
    editor.classList.remove('ql-blank');

    editor.dispatchEvent(new Event('input', { bubbles: true }));
    editor.dispatchEvent(new Event('change', { bubbles: true }));

    _log('  DOM write done, innerHTML length=' + editor.innerHTML.length);
    return true;
  } catch (e) {
    _warn('  DOM write error:', e.message);
    return false;
  }
}

function insertContent(editor, text) {
  _log('insertContent: text length=' + text.length);

  if (insertByExecCommand(editor, text)) {
    _log('insertContent: succeeded via execCommand');
    return;
  }
  if (insertByPaste(editor, text)) {
    _log('insertContent: succeeded via paste');
    return;
  }
  if (insertByDOM(editor, text)) {
    _log('insertContent: succeeded via DOM write');
    return;
  }

  throw new Error('All insertion methods failed. The editor may be read-only.');
}

// ---- Wait / retry loop ----

function waitForComposer(maxAttempts, delayMs, callback) {
  var attempt = 0;

  function tick() {
    attempt++;
    var editor = findBestComposer();

    if (editor) {
      _log('waitForComposer: found on attempt ' + attempt + '/' + maxAttempts);
      callback(null, editor);
      return;
    }

    if (attempt >= maxAttempts) {
      _warn('waitForComposer: gave up after ' + maxAttempts + ' attempts');
      debugEditors();
      callback(new Error(
        "LinkedIn post composer not found. Click 'Start a post' on LinkedIn first, then try again."
      ));
      return;
    }

    setTimeout(tick, delayMs);
  }

  tick();
}

// ---- Frame identity ----

function isTopFrame() {
  try {
    return window.self === window.top;
  } catch (e) {
    return false;
  }
}

var _frameLabel = isTopFrame() ? 'top-frame' : 'iframe(' + window.location.pathname + ')';

// ---- Message handler ----

chrome.runtime.onMessage.addListener(function (message, _sender, sendResponse) {
  if (!message || message.type !== 'INSERT_LINKEDIN_POST') {
    return false;
  }

  _log('[' + _frameLabel + '] INSERT_LINKEDIN_POST received, content length=' + (message.content || '').length);

  // Quick sync scan: does THIS frame have an editor?
  var immediateEditor = findBestComposer();

  if (immediateEditor) {
    // This frame owns the editor — handle insertion here
    _log('[' + _frameLabel + '] editor found immediately, inserting');
    try {
      insertContent(immediateEditor, message.content);
      _log('[' + _frameLabel + '] SUCCESS');
      sendResponse({ success: true });
    } catch (e) {
      _warn('[' + _frameLabel + '] INSERT ERROR:', e.message);
      sendResponse({ error: e.message });
    }
    return true;
  }

  // No editor in this frame right now.
  // If this is NOT the top frame, bail out — let the top frame retry.
  if (!isTopFrame()) {
    _log('[' + _frameLabel + '] no editor in this iframe, skipping');
    return false;
  }

  // Top frame: no editor found. Do retries (editor may appear, or may be in shadow DOM).
  _log('[' + _frameLabel + '] no editor found yet, starting retries...');
  debugEditors();

  waitForComposer(15, 300, function (err, editor) {
    if (err) {
      _warn('[' + _frameLabel + '] FAILED after retries:', err.message);
      sendResponse({ error: err.message });
      return;
    }

    try {
      insertContent(editor, message.content);
      _log('[' + _frameLabel + '] SUCCESS (after retry)');
      sendResponse({ success: true });
    } catch (e) {
      _warn('[' + _frameLabel + '] INSERT ERROR:', e.message);
      sendResponse({ error: e.message });
    }
  });

  return true;
});

_log('[' + _frameLabel + '] script loaded on', window.location.href);
