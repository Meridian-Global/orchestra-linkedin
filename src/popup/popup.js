document.addEventListener('DOMContentLoaded', function () {
  var body = document.body;
  var ideaInput = document.getElementById('idea-input');
  var generateBtn = document.getElementById('generate-btn');
  var statusText = document.getElementById('status-text');
  var resultSection = document.getElementById('result-section');
  var resultText = document.getElementById('result-text');
  var insertBtn = document.getElementById('insert-btn');
  var regenerateBtn = document.getElementById('regenerate-btn');
  var errorText = document.getElementById('error-text');
  var generateBtnText = generateBtn.querySelector('.button-text');
  var statusTimerId = null;

  // Restore persisted state
  chrome.storage.local.get(['ideaInput', 'resultContent'], function (data) {
    if (data.ideaInput) {
      ideaInput.value = data.ideaInput;
    }
    if (data.resultContent) {
      showResult(data.resultContent);
    }
  });

  // Persist input as the user types
  ideaInput.addEventListener('input', function () {
    chrome.storage.local.set({ ideaInput: ideaInput.value });
  });

  function showStatus(message) {
    if (statusTimerId) {
      window.clearTimeout(statusTimerId);
      statusTimerId = null;
    }

    statusText.innerText = message;
    statusText.classList.remove('hidden');
  }

  function hideStatus() {
    if (statusTimerId) {
      window.clearTimeout(statusTimerId);
      statusTimerId = null;
    }

    statusText.innerText = '';
    statusText.classList.add('hidden');
  }

  function showError(message) {
    errorText.innerText = message;
    errorText.classList.remove('hidden');
  }

  function hideError() {
    errorText.innerText = '';
    errorText.classList.add('hidden');
  }

  function hideResult() {
    resultSection.classList.add('hidden');
  }

  function showResult(content) {
    resultText.value = content;
    resultSection.classList.remove('hidden');
  }

  function setLoadingState(isLoading) {
    body.classList.toggle('is-loading', isLoading);
    generateBtn.disabled = isLoading;
    ideaInput.disabled = isLoading;

    if (generateBtnText) {
      generateBtnText.innerText = isLoading ? 'Generating' : 'Generate Post';
    }
  }

  generateBtn.addEventListener('click', function () {
    var idea = ideaInput.value.trim();

    if (!idea) {
      hideStatus();
      hideResult();
      showError('Please enter an idea.');
      return;
    }

    hideError();
    hideResult();
    showStatus('Starting...');
    setLoadingState(true);

    runOrchestra(
      idea,
      function (text) {
        showStatus(text);
      },
      function (linkedinContent) {
        hideStatus();
        showResult(linkedinContent);
        chrome.storage.local.set({ resultContent: linkedinContent });
        setLoadingState(false);
      },
      function (message) {
        hideStatus();
        showError(message);
        setLoadingState(false);
      }
    );
  });

  regenerateBtn.addEventListener('click', function () {
    hideResult();
    hideError();
    chrome.storage.local.remove('resultContent');
    ideaInput.focus();
  });

  function attemptInsert(tabId, content, isRetry) {
    chrome.tabs.sendMessage(
      tabId,
      { type: 'INSERT_LINKEDIN_POST', content: content },
      function (response) {
        if (chrome.runtime.lastError) {
          if (!isRetry) {
            injectContentScript(tabId, content);
            return;
          }
          showError('Could not reach LinkedIn. Please refresh the page and try again.');
          return;
        }

        if (response && response.success === true) {
          showStatus('\u2713 Inserted!');
          statusTimerId = window.setTimeout(function () {
            hideStatus();
          }, 2000);
          return;
        }

        if (response && response.error) {
          showError(response.error);
          return;
        }

        showError('Could not insert content. Please refresh LinkedIn and try again.');
      }
    );
  }

  function injectContentScript(tabId, content) {
    chrome.scripting.executeScript(
      {
        target: { tabId: tabId, allFrames: false },
        files: ['config/config.js', 'src/content/content.js']
      },
      function () {
        if (chrome.runtime.lastError) {
          showError('Could not access the LinkedIn page. Please refresh and try again.');
          return;
        }

        attemptInsert(tabId, content, true);
      }
    );
  }

  insertBtn.addEventListener('click', function () {
    var content = resultText.value;

    hideError();

    chrome.tabs.query({ active: true, currentWindow: true }, function (tabs) {
      var activeTab = tabs && tabs[0];

      if (!activeTab || !activeTab.id) {
        showError('No active tab found. Make sure LinkedIn is open.');
        return;
      }

      if (activeTab.url && activeTab.url.indexOf('linkedin.com') === -1) {
        showError('Please navigate to LinkedIn before inserting.');
        return;
      }

      attemptInsert(activeTab.id, content, false);
    });
  });
});
