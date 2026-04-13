document.addEventListener('DOMContentLoaded', function () {
  var ideaInput = document.getElementById('idea-input');
  var generateBtn = document.getElementById('generate-btn');
  var statusText = document.getElementById('status-text');
  var resultSection = document.getElementById('result-section');
  var resultText = document.getElementById('result-text');
  var insertBtn = document.getElementById('insert-btn');
  var regenerateBtn = document.getElementById('regenerate-btn');
  var errorText = document.getElementById('error-text');
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
    generateBtn.disabled = true;

    runOrchestra(
      idea,
      function (text) {
        showStatus(text);
      },
      function (linkedinContent) {
        hideStatus();
        showResult(linkedinContent);
        chrome.storage.local.set({ resultContent: linkedinContent });
        generateBtn.disabled = false;
      },
      function (message) {
        hideStatus();
        showError(message);
        generateBtn.disabled = false;
      }
    );
  });

  regenerateBtn.addEventListener('click', function () {
    hideResult();
    hideError();
    chrome.storage.local.remove('resultContent');
    ideaInput.focus();
  });

  insertBtn.addEventListener('click', function () {
    var content = resultText.value;

    hideError();

    chrome.tabs.query({ active: true, currentWindow: true }, function (tabs) {
      var activeTab = tabs && tabs[0];

      if (!activeTab || !activeTab.id) {
        showError('Could not reach LinkedIn tab. Make sure LinkedIn is open.');
        return;
      }

      chrome.tabs.sendMessage(
        activeTab.id,
        { type: 'INSERT_LINKEDIN_POST', content: content },
        function (response) {
          if (chrome.runtime.lastError) {
            showError('Could not reach LinkedIn tab. Make sure LinkedIn is open.');
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

          showError('Could not reach LinkedIn tab. Make sure LinkedIn is open.');
        }
      );
    });
  });
});
