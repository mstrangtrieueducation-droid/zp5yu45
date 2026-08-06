(() => {
  const items = JSON.parse(document.querySelector("#lesson-data").textContent);
  const state = {
    mode: "learn",
    learnIndex: 0,
    reviewIndex: 0,
    reviewStarted: false,
    autoRunning: false,
    runId: 0,
    imageRunId: 0,
    audio: null,
    finishAudio: null,
  };

  const $ = (selector) => document.querySelector(selector);
  const $$ = (selector) => [...document.querySelectorAll(selector)];
  const delay = (milliseconds) =>
    new Promise((resolve) => window.setTimeout(resolve, milliseconds));
  const nextPaint = () =>
    new Promise((resolve) => {
      window.requestAnimationFrame(() => window.requestAnimationFrame(resolve));
    });

  $$("[data-total]").forEach((node) => {
    node.textContent = String(items.length);
  });

  function stopAudio() {
    if (state.audio) {
      state.audio.pause();
      state.audio.currentTime = 0;
      state.audio = null;
    }
    if (state.finishAudio) {
      const finish = state.finishAudio;
      state.finishAudio = null;
      finish(false);
    }
    $(".speaking-status").classList.remove("is-speaking");
    $("#statusText").textContent = "Sẵn sàng";
  }

  function stopAuto() {
    state.runId += 1;
    state.autoRunning = false;
    stopAudio();
    updateAutoButton();
  }

  function updateAutoButton() {
    $("#autoLabel").textContent = state.autoRunning ? "Tạm dừng" : "Dạy tự động";
    $("#autoButton").querySelector("[aria-hidden]").textContent =
      state.autoRunning ? "Ⅱ" : "▶";
  }

  function itemAt(index) {
    return items[index];
  }

  function imagePath(item) {
    return `assets/images/${item.slug}.webp?v=20260806-image-first`;
  }

  function audioPath(item) {
    return `assets/audio/${item.slug}.mp3`;
  }

  function waitForImageLoad(image) {
    if (image.complete) return Promise.resolve(image.naturalWidth > 0);

    return new Promise((resolve) => {
      let settled = false;
      const finish = (loaded) => {
        if (settled) return;
        settled = true;
        image.removeEventListener("load", onLoad);
        image.removeEventListener("error", onError);
        window.clearTimeout(timeout);
        resolve(loaded);
      };
      const onLoad = () => finish(true);
      const onError = () => finish(false);
      const timeout = window.setTimeout(() => finish(false), 8_000);

      image.addEventListener("load", onLoad, { once: true });
      image.addEventListener("error", onError, { once: true });
    });
  }

  async function showLearnImage(item) {
    const image = $("#learnImage");
    const requestId = ++state.imageRunId;
    image.classList.add("is-loading");
    image.alt = item.word;
    image.src = imagePath(item);

    const loaded = await waitForImageLoad(image);
    if (loaded && typeof image.decode === "function") {
      await image.decode().catch(() => {});
    }
    if (requestId !== state.imageRunId) return false;

    image.classList.remove("is-loading");
    await nextPaint();
    return loaded;
  }

  function renderDots() {
    $("#learnDots").replaceChildren(
      ...items.map((_, index) => {
        const button = document.createElement("button");
        button.type = "button";
        button.textContent = String(index + 1);
        button.classList.toggle("is-active", index === state.learnIndex);
        button.setAttribute("aria-label", `Mở từ ${index + 1}`);
        button.addEventListener("click", () => {
          stopAuto();
          state.learnIndex = index;
          renderLearn();
        });
        return button;
      }),
    );
  }

  function renderLearn() {
    const item = itemAt(state.learnIndex);
    const imageReady = showLearnImage(item);
    $("#word").textContent = item.word;
    $("#ipa").textContent = item.ipa;
    $("#meaning").textContent = item.meaning;
    $("#focus").textContent = item.focus;
    $("#example").textContent = item.example;
    $("#learnNumber").textContent = String(state.learnIndex + 1);
    $("#learnProgress").style.width = `${((state.learnIndex + 1) / items.length) * 100}%`;
    renderDots();
    return imageReady;
  }

  function playCurrent() {
    const item = itemAt(state.learnIndex);
    return new Promise((resolve) => {
      stopAudio();
      const audio = new Audio(audioPath(item));
      let settled = false;

      const finish = (played) => {
        if (settled) return;
        settled = true;
        if (state.audio === audio) state.audio = null;
        if (state.finishAudio === finish) state.finishAudio = null;
        $(".speaking-status").classList.remove("is-speaking");
        $("#statusText").textContent = played ? "Đã nghe xong" : "Sẵn sàng";
        resolve(played);
      };

      state.audio = audio;
      state.finishAudio = finish;
      audio.preload = "auto";
      audio.onended = () => finish(true);
      audio.onerror = () => finish(false);
      $(".speaking-status").classList.add("is-speaking");
      $("#statusText").textContent = "Nghe kỹ và đọc theo";
      audio.play().catch(() => {
        $("#autoplayGate").hidden = false;
        finish(false);
      });
    });
  }

  async function runAuto() {
    stopAuto();
    const token = ++state.runId;
    state.autoRunning = true;
    updateAutoButton();
    const startIndex = state.learnIndex;

    for (let offset = 0; offset < items.length; offset += 1) {
      if (token !== state.runId) return;
      state.learnIndex = (startIndex + offset) % items.length;
      const imageReady = renderLearn();
      const imageShown = await imageReady;
      if (token !== state.runId) return;
      if (!imageShown) {
        $("#statusText").textContent = "Không tải được ảnh";
        break;
      }
      await delay(500);
      const played = await playCurrent();
      if (!played || token !== state.runId) break;
      await delay(850);
    }

    if (token === state.runId) {
      state.autoRunning = false;
      stopAudio();
      updateAutoButton();
    }
  }

  function moveLearn(step) {
    stopAuto();
    state.learnIndex = (state.learnIndex + step + items.length) % items.length;
    renderLearn();
  }

  function renderReview() {
    $("#reviewIntro").hidden = state.reviewStarted;
    $("#reviewStage").hidden = !state.reviewStarted;
    $("#reviewComplete").hidden = true;

    if (!state.reviewStarted) {
      $("#reviewNumber").textContent = "0";
      $("#reviewProgress").style.width = "0%";
      return;
    }

    const item = itemAt(state.reviewIndex);
    $("#reviewImage").src = imagePath(item);
    $("#initial").textContent = `${item.word[0].toUpperCase()}…`;
    $("#reviewNumber").textContent = String(state.reviewIndex + 1);
    $("#reviewProgress").style.width = `${((state.reviewIndex + 1) / items.length) * 100}%`;
    $("#previousReview").disabled = state.reviewIndex === 0;
    $("#nextReview").textContent =
      state.reviewIndex === items.length - 1 ? "Hoàn thành ›" : "Từ tiếp theo ›";
  }

  function completeReview() {
    $("#reviewStage").hidden = true;
    $("#reviewComplete").hidden = false;
    $("#reviewNumber").textContent = String(items.length);
    $("#reviewProgress").style.width = "100%";
  }

  function selectMode(mode) {
    stopAuto();
    state.mode = mode;
    $$(".mode-tabs button").forEach((button) => {
      button.classList.toggle("is-active", button.dataset.mode === mode);
    });
    $("#learnView").classList.toggle("is-active", mode === "learn");
    $("#reviewView").classList.toggle("is-active", mode === "review");
    if (mode === "review") renderReview();
  }

  $$(".mode-tabs button").forEach((button) => {
    button.addEventListener("click", () => selectMode(button.dataset.mode));
  });
  $("#previousWord").addEventListener("click", () => moveLearn(-1));
  $("#nextWord").addEventListener("click", () => moveLearn(1));
  $("#pictureButton").addEventListener("click", () => {
    stopAuto();
    playCurrent();
  });
  $("#replayButton").addEventListener("click", () => {
    stopAuto();
    playCurrent();
  });
  $("#autoButton").addEventListener("click", () => {
    if (state.autoRunning) stopAuto();
    else runAuto();
  });
  $("#unlockAudio").addEventListener("click", () => {
    $("#autoplayGate").hidden = true;
    runAuto();
  });
  $("#startReview").addEventListener("click", () => {
    state.reviewStarted = true;
    state.reviewIndex = 0;
    renderReview();
  });
  $("#previousReview").addEventListener("click", () => {
    if (state.reviewIndex === 0) return;
    state.reviewIndex -= 1;
    renderReview();
  });
  $("#nextReview").addEventListener("click", () => {
    if (state.reviewIndex === items.length - 1) {
      completeReview();
      return;
    }
    state.reviewIndex += 1;
    renderReview();
  });
  $("#restartReview").addEventListener("click", () => {
    state.reviewStarted = true;
    state.reviewIndex = 0;
    renderReview();
  });

  document.addEventListener("keydown", (event) => {
    if (event.key === "ArrowLeft") {
      if (state.mode === "learn") moveLearn(-1);
      else if (state.reviewStarted && state.reviewIndex > 0) {
        state.reviewIndex -= 1;
        renderReview();
      }
    }
    if (event.key === "ArrowRight") {
      if (state.mode === "learn") moveLearn(1);
      else if (state.reviewStarted) $("#nextReview").click();
    }
  });

  renderLearn();
  window.setTimeout(() => {
    if (state.mode === "learn") runAuto();
  }, 500);
})();
