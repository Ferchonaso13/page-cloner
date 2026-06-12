(function () {
  "use strict";

  // --- Element references (IDs that index.html defines) ---
  const form = document.getElementById("cloneForm");
  const urlInput = document.getElementById("urlInput");
  const downloadImagesCheckbox = document.getElementById("downloadImages");
  const proxyInput = document.getElementById("proxyInput");
  const cloneButton = document.getElementById("cloneButton");
  const cloneButtonLabel = document.getElementById("cloneButtonLabel");

  const progressCard = document.getElementById("progressCard");
  const progressLog = document.getElementById("progressLog");

  const errorBanner = document.getElementById("errorBanner");
  const errorMessage = document.getElementById("errorMessage");

  const resultsCard = document.getElementById("resultsCard");
  const resultTitle = document.getElementById("resultTitle");
  const resultStats = document.getElementById("resultStats");
  const downloadHtmlBtn = document.getElementById("downloadHtmlBtn");
  const downloadZipBtn = document.getElementById("downloadZipBtn");

  // --- State for current result blobs/filenames ---
  let currentHtml = null; // string
  let currentZipBlob = null; // Blob | null
  let currentSafeName = "cloned-page";

  // --- Helpers ---

  function pad(n) {
    return n < 10 ? "0" + n : String(n);
  }

  function timestamp() {
    const d = new Date();
    return pad(d.getHours()) + ":" + pad(d.getMinutes()) + ":" + pad(d.getSeconds());
  }

  function appendLog(message) {
    const line = document.createElement("div");
    line.className = "log-line";

    const time = document.createElement("span");
    time.className = "log-time";
    time.textContent = "[" + timestamp() + "]";

    line.appendChild(time);
    line.appendChild(document.createTextNode(String(message)));

    progressLog.appendChild(line);
    progressLog.scrollTop = progressLog.scrollHeight;
  }

  function safeFilename(title) {
    const cleaned = String(title || "")
      .trim()
      .replace(/[^a-zA-Z0-9_-]+/g, "-")
      .replace(/-+/g, "-")
      .replace(/^-+|-+$/g, "");
    return cleaned || "cloned-page";
  }

  function showError(message) {
    errorMessage.textContent = message;
    errorBanner.hidden = false;
  }

  function clearError() {
    errorMessage.textContent = "";
    errorBanner.hidden = true;
  }

  function clearResults() {
    resultsCard.hidden = true;
    resultTitle.textContent = "";
    resultStats.textContent = "";
    resultStats.hidden = true;
    downloadZipBtn.hidden = true;
    currentHtml = null;
    currentZipBlob = null;
    currentSafeName = "cloned-page";
  }

  function resetProgress() {
    progressLog.textContent = "";
    progressCard.hidden = false;
  }

  function setRunning(isRunning) {
    cloneButton.disabled = isRunning;
    if (isRunning) {
      cloneButtonLabel.textContent = "Cloning…";
      if (!cloneButton.querySelector(".spinner")) {
        const spinner = document.createElement("span");
        spinner.className = "spinner";
        spinner.setAttribute("aria-hidden", "true");
        cloneButton.insertBefore(spinner, cloneButton.firstChild);
      }
    } else {
      cloneButtonLabel.textContent = "Clone Page";
      const spinner = cloneButton.querySelector(".spinner");
      if (spinner) spinner.remove();
    }
  }

  // Trigger a download synchronously (iOS/Safari gesture-safe: no awaits before this).
  function triggerDownload(blob, filename) {
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    a.style.display = "none";
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    setTimeout(function () {
      URL.revokeObjectURL(url);
    }, 1500);
  }

  // --- Download button wiring (handlers stay live; read current* state) ---

  downloadHtmlBtn.addEventListener("click", function () {
    if (currentHtml == null) return;
    const blob = new Blob([currentHtml], { type: "text/html" });
    triggerDownload(blob, currentSafeName + ".html");
  });

  downloadZipBtn.addEventListener("click", function () {
    if (!currentZipBlob) return;
    triggerDownload(currentZipBlob, currentSafeName + ".zip");
  });

  // --- Populate results from a successful clone ---

  function populateResults(result) {
    const title = result && result.title ? result.title : "Untitled page";
    currentSafeName = safeFilename(title);
    currentHtml = result.htmlLive;
    currentZipBlob = result.zipBlob || null;

    resultTitle.textContent = title;

    const stats = result.stats;
    if (currentZipBlob && stats) {
      const total = stats.assetsTotal || 0;
      const embedded = stats.assetsEmbedded || 0;
      const failed = stats.assetsFailed || 0;
      resultStats.textContent =
        "Embedded " + embedded + " of " + total + " images, " + failed + " failed.";
      resultStats.hidden = false;
    } else {
      resultStats.textContent = "";
      resultStats.hidden = true;
    }

    downloadZipBtn.hidden = !currentZipBlob;
    resultsCard.hidden = false;
  }

  // --- Submit handler ---

  async function handleSubmit(event) {
    event.preventDefault();

    const url = urlInput.value.trim();
    const downloadImages = downloadImagesCheckbox.checked;
    const customProxy = proxyInput.value.trim();

    clearError();
    clearResults();

    if (!url) {
      showError("Please enter a URL to clone.");
      urlInput.focus();
      return;
    }

    if (!window.Cloner || typeof window.Cloner.clonePage !== "function") {
      showError("Cloner engine failed to load (js/clone-core.js missing or broken). Reload the page and try again.");
      return;
    }

    resetProgress();
    setRunning(true);
    appendLog("Starting clone of " + url);

    try {
      const result = await window.Cloner.clonePage(url, {
        downloadImages: downloadImages,
        proxyOverride: customProxy || undefined,
        onProgress: appendLog,
      });

      if (!result || typeof result.htmlLive !== "string") {
        throw new Error("Cloner returned no HTML. The page may have blocked access.");
      }

      appendLog("Clone complete.");
      populateResults(result);
    } catch (err) {
      const message = err && err.message ? err.message : "Something went wrong while cloning the page.";
      appendLog("Error: " + message);
      showError(message);
    } finally {
      setRunning(false);
    }
  }

  // The URL input lives inside the form, so pressing Enter natively fires
  // this submit handler — that is our Enter-to-submit behavior.
  form.addEventListener("submit", handleSubmit);
})();
