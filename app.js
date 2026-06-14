const state = {
  episode: null,
  episodes: [],
  isAdminMode: new URLSearchParams(window.location.search).get("admin") === "1",
  balance: 100,
  now: 0,
  isPlaying: false,
  summaryShownAtEnd: false,
  promoBonusClaimed: false,
  speed: 1,
  timerId: null,
  placedBets: [],
  resolvedMarketIds: new Set(),
};

const elements = {
  title: document.querySelector("#episodeTitle"),
  episodeSelect: document.querySelector("#episodeSelect"),
  balance: document.querySelector("#balance"),
  currentTime: document.querySelector("#currentTime"),
  duration: document.querySelector("#episodeDuration"),
  promoBonus: document.querySelector("#promoBonusButton"),
  timeline: document.querySelector("#timeline"),
  adStatus: document.querySelector("#adStatus"),
  introStatus: document.querySelector("#introStatus"),
  playPause: document.querySelector("#playPauseButton"),
  reset: document.querySelector("#resetButton"),
  rewind: document.querySelector("#rewindButton"),
  forward: document.querySelector("#forwardButton"),
  skipAd: document.querySelector("#skipAdButton"),
  skipIntro: document.querySelector("#skipIntroButton"),
  viewSummary: document.querySelector("#viewSummaryButton"),
  speed: document.querySelector("#speedSelect"),
  activeMarkets: document.querySelector("#activeMarkets"),
  preStartPanel: document.querySelector("#preStartPanel"),
  preStartMarkets: document.querySelector("#preStartMarkets"),
  betSlip: document.querySelector("#betSlip"),
  eventLog: document.querySelector("#eventLog"),
  activeCount: document.querySelector("#activeCount"),
  preStartCount: document.querySelector("#preStartCount"),
  placedCount: document.querySelector("#placedCount"),
  resolvedCount: document.querySelector("#resolvedCount"),
  marketTemplate: document.querySelector("#marketTemplate"),
  optionTemplate: document.querySelector("#optionTemplate"),
  textBetTemplate: document.querySelector("#textBetTemplate"),
  marketEditor: document.querySelector("#marketEditor"),
  authorBetFormat: document.querySelector("#authorBetFormat"),
  authorMarketType: document.querySelector("#authorMarketType"),
  authorCategory: document.querySelector("#authorCategory"),
  authorTitle: document.querySelector("#authorTitle"),
  authorDescription: document.querySelector("#authorDescription"),
  authorOpensAt: document.querySelector("#authorOpensAt"),
  authorClosesAt: document.querySelector("#authorClosesAt"),
  authorResolveAt: document.querySelector("#authorResolveAt"),
  authorOptions: document.querySelector("#authorOptions"),
  authorWinningOption: document.querySelector("#authorWinningOption"),
  authorTextOdds: document.querySelector("#authorTextOdds"),
  authorCorrectAnswers: document.querySelector("#authorCorrectAnswers"),
  authorResolutionNote: document.querySelector("#authorResolutionNote"),
  authorMessage: document.querySelector("#authorMessage"),
  draftMarkets: document.querySelector("#draftMarkets"),
  draftCount: document.querySelector("#draftCount"),
  authorPanel: document.querySelector(".author-panel"),
  copyDraft: document.querySelector("#copyDraftButton"),
  downloadDraft: document.querySelector("#downloadDraftButton"),
  clearDraft: document.querySelector("#clearDraftButton"),
  preStartDialog: document.querySelector("#preStartDialog"),
  reviewPreStart: document.querySelector("#reviewPreStartButton"),
  startAnyway: document.querySelector("#startAnywayButton"),
  summaryDialog: document.querySelector("#summaryDialog"),
  summaryContent: document.querySelector("#summaryContent"),
  closeSummary: document.querySelector("#closeSummaryButton"),
};

const marketTypes = {
  quick30: {
    label: "Быстрая ставка",
    category: "Быстрая ставка",
    windowSeconds: 30,
  },
  minute: {
    label: "Минутное окно",
    category: "Минутное окно",
    windowSeconds: 60,
  },
  long30: {
    label: "Длинная ставка",
    category: "Длинная ставка",
    windowSeconds: 1800,
  },
  final: {
    label: "Финальный прогноз",
    category: "Финальный прогноз",
    windowSeconds: 1800,
  },
};

init();

async function init() {
  try {
    state.episodes = await loadEpisodeRegistry();
    renderEpisodePicker();

    const requestedEpisodeId = new URLSearchParams(window.location.search).get("episode");
    const selectedEpisode =
      state.episodes.find((episode) => episode.id === requestedEpisodeId) ?? state.episodes[0];

    elements.playPause.addEventListener("click", togglePlayback);
    elements.reviewPreStart.addEventListener("click", closePreStartDialog);
    elements.startAnyway.addEventListener("click", () => {
      closePreStartDialog();
      startPlayback();
    });
    elements.reset.addEventListener("click", resetEpisode);
    elements.rewind.addEventListener("click", () => adjustTime(-10));
    elements.forward.addEventListener("click", () => adjustTime(10));
    elements.skipAd.addEventListener("click", skipCurrentAd);
    elements.skipIntro.addEventListener("click", skipCurrentIntro);
    elements.promoBonus.addEventListener("click", claimPromoBonus);
    elements.viewSummary.addEventListener("click", openSummaryDialog);
    elements.closeSummary.addEventListener("click", closeSummaryDialog);
    elements.episodeSelect.addEventListener("change", async () => {
      const selected = state.episodes.find((episode) => episode.id === elements.episodeSelect.value);
      if (!selected) return;
      const url = new URL(window.location.href);
      url.searchParams.set("episode", selected.id);
      window.history.replaceState({}, "", url);
      await loadEpisode(selected);
    });
    elements.speed.addEventListener("change", () => {
      state.speed = Number(elements.speed.value);
    });
    elements.timeline.addEventListener("input", () => {
      state.now = Number(elements.timeline.value);
      resolveMarkets();
      render();
    });
    setupAuthorMode();

    await loadEpisode(selectedEpisode);
  } catch {
    showLoadError();
  }
}

async function loadEpisodeRegistry() {
  try {
    const response = await fetch("data/episodes.json");
    if (!response.ok) throw new Error("Episode registry is missing.");
    return response.json();
  } catch {
    return [
      {
        id: "pilot-demo",
        title: "Демо-серия: карта ставок",
        file: "data/episode-demo.json",
      },
    ];
  }
}

async function loadEpisode(episodeEntry) {
  window.clearInterval(state.timerId);
  state.isPlaying = false;
  elements.playPause.textContent = "Старт";

  const response = await fetch(episodeEntry.file);
  if (!response.ok) throw new Error("Episode file is missing.");
  state.episode = await response.json();
  state.balance = state.episode.startingBalance;
  state.now = 0;
  state.placedBets = [];
  state.resolvedMarketIds = new Set();
  state.summaryShownAtEnd = false;
  state.promoBonusClaimed = false;
  elements.viewSummary.hidden = true;
  elements.episodeSelect.value = state.episode.id;

  restoreProgress();

  elements.title.textContent = state.episode.title;
  elements.timeline.max = state.episode.durationSeconds;
  elements.duration.textContent = `/ ${formatTime(state.episode.durationSeconds)}`;
  applyMarketTypeDefaults();

  render();
}

function showLoadError() {
  elements.title.textContent = "Не удалось загрузить серию";
  elements.duration.textContent = "/ 00:00";
  elements.preStartMarkets.replaceChildren(
    emptyState("Откройте сайт через start-site.cmd или локальный адрес http://127.0.0.1:4173/. При открытии index.html через файл браузер может блокировать загрузку данных."),
  );
}

function renderEpisodePicker() {
  elements.episodeSelect.replaceChildren();

  for (const episode of state.episodes) {
    const option = document.createElement("option");
    option.value = episode.id;
    option.textContent = episode.title;
    elements.episodeSelect.append(option);
  }
}

function togglePlayback() {
  if (state.isPlaying) {
    pausePlayback();
    return;
  }

  if (shouldPromptPreStartBets()) {
    openPreStartDialog();
    return;
  }

  startPlayback();
}

function startPlayback() {
  state.isPlaying = true;
  elements.playPause.textContent = "Пауза";
  state.timerId = window.setInterval(tick, 1000);
}

function pausePlayback() {
  state.isPlaying = false;
  elements.playPause.textContent = "Старт";
  window.clearInterval(state.timerId);
}

function shouldPromptPreStartBets() {
  const preStartMarkets = getPreStartMarkets();
  if (state.now > 0 || preStartMarkets.length === 0) return false;

  return preStartMarkets.some(
    (market) => !state.placedBets.some((bet) => bet.marketId === market.id),
  );
}

function openPreStartDialog() {
  if (typeof elements.preStartDialog.showModal === "function") {
    elements.preStartDialog.showModal();
  } else {
    elements.preStartDialog.hidden = false;
  }
}

function closePreStartDialog() {
  if (elements.preStartDialog.open) {
    elements.preStartDialog.close();
  } else {
    elements.preStartDialog.hidden = true;
  }
}

function openSummaryDialog() {
  renderSummary();
  elements.summaryDialog.hidden = false;

  if (typeof elements.summaryDialog.showModal === "function") {
    try {
      if (!elements.summaryDialog.open) {
        elements.summaryDialog.showModal();
      }
    } catch {
      elements.summaryDialog.setAttribute("open", "");
    }

    if (!elements.summaryDialog.open) {
      elements.summaryDialog.setAttribute("open", "");
    }
  } else {
    elements.summaryDialog.setAttribute("open", "");
  }
}

function closeSummaryDialog() {
  if (elements.summaryDialog.open) {
    try {
      elements.summaryDialog.close();
    } catch {
      elements.summaryDialog.removeAttribute("open");
    }
  } else {
    elements.summaryDialog.hidden = true;
  }
  elements.summaryDialog.removeAttribute("open");

  if (state.episode && state.now >= state.episode.durationSeconds) {
    elements.viewSummary.hidden = false;
  }
}

function renderSummary() {
  const resolvedBets = state.placedBets.filter((bet) => bet.status === "won" || bet.status === "lost");
  const wonBets = resolvedBets.filter((bet) => bet.status === "won");
  const lostBets = resolvedBets.filter((bet) => bet.status === "lost");
  const earnedTokens = wonBets.reduce((sum, bet) => sum + bet.payout, 0);
  const lostTokens = lostBets.reduce((sum, bet) => sum + bet.stake, 0);
  const netResult = state.balance - state.episode.startingBalance;
  const resultLabel = netResult < 0 ? "Потрачено" : "Заработано";
  const resultValue = netResult < 0 ? String(netResult) : `+${netResult}`;
  const resultClassName = netResult < 0 ? "status-lost" : "status-won";

  const cards = [
    ["Итоговый баланс", `${state.balance} токенов`, ""],
    ["Чистый результат", `${netResult >= 0 ? "+" : ""}${netResult}`, netResult >= 0 ? "status-won" : "status-lost"],
    ["Заработано выплатами", `+${earnedTokens}`, "status-won"],
    ["Проиграно ставками", `-${lostTokens}`, lostTokens > 0 ? "status-lost" : ""],
    ["Ставок зашло", String(wonBets.length), "status-won"],
    ["Ставок не зашло", String(lostBets.length), lostBets.length > 0 ? "status-lost" : ""],
  ];

  cards.splice(
    0,
    cards.length,
    ["Итоговый баланс", `${state.balance} токенов`, ""],
    [resultLabel, resultValue, resultClassName],
    ["Ставок зашло", String(wonBets.length), "status-won"],
  );

  elements.summaryContent.replaceChildren(
    ...cards.map(([label, value, className]) => {
      const card = document.createElement("article");
      card.className = "summary-card";
      card.innerHTML = `<span>${label}</span><strong class="${className}">${value}</strong>`;
      return card;
    }),
  );
}

function showEndSummary() {
  elements.viewSummary.hidden = false;
  if (state.summaryShownAtEnd) return;
  state.summaryShownAtEnd = true;
  openSummaryDialog();
}

function getPreStartMarkets() {
  return state.episode.preStartMarkets ?? [];
}

function getTimelineMarkets() {
  return state.episode.markets ?? [];
}

function getAllMarkets() {
  return [...getPreStartMarkets(), ...getTimelineMarkets()];
}

function tick() {
  state.now = Math.min(state.now + state.speed, state.episode.durationSeconds);
  resolveMarkets();

  if (state.now >= state.episode.durationSeconds) {
    state.isPlaying = false;
    window.clearInterval(state.timerId);
    elements.playPause.textContent = "Старт";
    showEndSummary();
  }

  render();
}

function adjustTime(deltaSeconds) {
  state.now = clampTime(state.now + deltaSeconds);
  resolveMarkets();
  render();
}

function skipCurrentAd() {
  const adBreak = getCurrentAdBreak();
  if (!adBreak) return;

  state.now = clampTime(adBreak.endsAt);
  resolveMarkets();
  render();
}

function skipCurrentIntro() {
  const introBreak = getCurrentIntroBreak();
  if (!introBreak) return;

  state.now = clampTime(introBreak.endsAt);
  resolveMarkets();
  render();
}

function resetEpisode() {
  window.clearInterval(state.timerId);
  state.balance = state.episode.startingBalance;
  state.now = 0;
  state.isPlaying = false;
  state.placedBets = [];
  state.resolvedMarketIds = new Set();
  state.summaryShownAtEnd = false;
  elements.viewSummary.hidden = true;
  elements.playPause.textContent = "Старт";
  localStorage.removeItem(getProgressStorageKey());
  render();
}

function claimPromoBonus() {
  if (state.promoBonusClaimed) {
    renderPromoBonus();
    return;
  }

  state.balance += 100;
  state.promoBonusClaimed = true;
  render();
}

function placeBet(market, pick, stake) {
  if (!Number.isInteger(stake) || stake <= 0 || stake > state.balance) return;
  if (!isMarketActive(market)) return;
  if (state.placedBets.some((bet) => bet.marketId === market.id)) return;

  state.balance -= stake;
  state.placedBets.push({
    id: crypto.randomUUID(),
    marketId: market.id,
    marketTitle: market.title,
    betFormat: market.betFormat ?? "choice",
    optionId: pick.optionId,
    optionTitle: pick.optionTitle,
    answerText: pick.answerText ?? "",
    odds: pick.odds,
    stake,
    status: "pending",
    payout: 0,
    placedAt: state.now,
    resolvesAt: market.resolveAt,
  });

  resolveMarkets();
  render();
}

function resolveMarkets() {
  for (const market of getAllMarkets()) {
    if (state.now < market.resolveAt || state.resolvedMarketIds.has(market.id)) {
      continue;
    }

    state.resolvedMarketIds.add(market.id);
    for (const bet of state.placedBets.filter((item) => item.marketId === market.id)) {
      const won = isWinningBet(market, bet);
      bet.status = won ? "won" : "lost";
      bet.payout = won ? Math.floor(bet.stake * bet.odds) : 0;
      state.balance += bet.payout;
    }
  }
}

function render() {
  const currentAdBreak = getCurrentAdBreak();
  const currentIntroBreak = getCurrentIntroBreak();
  elements.balance.textContent = state.balance;
  elements.currentTime.textContent = formatTime(state.now);
  elements.timeline.value = state.now;
  elements.adStatus.hidden = !currentAdBreak;
  elements.adStatus.textContent = currentAdBreak?.label ?? "Реклама";
  elements.skipAd.hidden = !currentAdBreak;
  elements.skipAd.disabled = !currentAdBreak;
  elements.introStatus.hidden = !currentIntroBreak;
  elements.introStatus.textContent = currentIntroBreak?.label ?? "Заставка";
  elements.skipIntro.hidden = !currentIntroBreak;
  elements.skipIntro.disabled = !currentIntroBreak;

  const preStartMarkets = getPreStartMarkets().filter(isMarketActive);
  const activeMarkets = getTimelineMarkets().filter(isMarketActive);
  const pendingBets = state.placedBets.filter((bet) => bet.status === "pending");
  const resolvedBets = state.placedBets.filter((bet) => bet.status === "won" || bet.status === "lost");

  elements.activeCount.textContent = activeMarkets.length;
  elements.preStartCount.textContent = preStartMarkets.length;
  elements.placedCount.textContent = pendingBets.length;
  elements.resolvedCount.textContent = resolvedBets.length;

  renderPreStartMarkets(preStartMarkets);
  renderActiveMarkets(activeMarkets);
  renderBetSlip(pendingBets);
  renderEventLog(resolvedBets);
  renderDraftMarkets();
  renderPromoBonus();
  saveProgress();

  if (state.now >= state.episode.durationSeconds) showEndSummary();
}

function renderPromoBonus() {
  elements.promoBonus.classList.toggle("is-claimed", state.promoBonusClaimed);
  elements.promoBonus.disabled = state.promoBonusClaimed;
  elements.promoBonus.textContent = state.promoBonusClaimed
    ? "Вы уже получили свой бонус"
    : "Забрать";
}

function renderPreStartMarkets(markets) {
  elements.preStartMarkets.replaceChildren();
  elements.preStartPanel.hidden = state.now > 0 && markets.length === 0;

  if (markets.length === 0) {
    elements.preStartMarkets.append(emptyState("Предсерийные ставки закрываются после старта."));
    return;
  }

  renderMarketList(markets, elements.preStartMarkets);
}

function renderActiveMarkets(markets) {
  elements.activeMarkets.replaceChildren();

  if (markets.length === 0) {
    elements.activeMarkets.append(emptyState("Сейчас нет открытых ставок."));
    return;
  }

  renderMarketList(markets, elements.activeMarkets);
}

function renderMarketList(markets, targetElement) {
  for (const market of markets) {
    const fragment = elements.marketTemplate.content.cloneNode(true);
    const card = fragment.querySelector(".market-card");
    const optionList = fragment.querySelector(".option-list");
    const alreadyPlaced = state.placedBets.some((bet) => bet.marketId === market.id);

    fragment.querySelector(".market-category").textContent = market.category;
    fragment.querySelector("h3").textContent = market.title;
    fragment.querySelector(".market-window").textContent = `до ${formatTime(market.closesAt)}`;

    if ((market.betFormat ?? "choice") === "text") {
      optionList.append(renderTextBetForm(market, alreadyPlaced));
    } else {
      for (const option of market.options) {
        const optionFragment = elements.optionTemplate.content.cloneNode(true);
        const form = optionFragment.querySelector(".option-row");
        const input = optionFragment.querySelector("input");
        const button = optionFragment.querySelector("button");

        optionFragment.querySelector(".option-title").textContent = option.title;
        optionFragment.querySelector(".option-odds").textContent = `x${option.odds}`;
        input.max = state.balance;
        button.disabled = alreadyPlaced || state.balance <= 0;
        button.textContent = alreadyPlaced ? "Выбрано" : "Поставить";

        form.addEventListener("submit", (event) => {
          event.preventDefault();
          placeBet(
            market,
            {
              optionId: option.id,
              optionTitle: option.title,
              odds: option.odds,
            },
            Number(input.value),
          );
        });

        optionList.append(optionFragment);
      }
    }

    if (alreadyPlaced) {
      card.classList.add("is-locked");
    }

    targetElement.append(fragment);
  }
}

function renderBetSlip(bets) {
  elements.betSlip.replaceChildren();

  if (bets.length === 0) {
    elements.betSlip.append(emptyState("Здесь будут ставки, которые ожидают исход."));
    return;
  }

  for (const bet of [...bets].reverse()) {
    const card = document.createElement("article");
    card.className = "bet-card";
    card.innerHTML = `
      <strong>${bet.marketTitle}</strong>
      <span>${betLabel(bet)} · ${bet.stake} токенов · x${bet.odds}</span>
      <span class="meta">Поставлено: ${formatTime(bet.placedAt)}</span>
      <strong class="status-${bet.status}">${statusLabel(bet)}</strong>
    `;
    elements.betSlip.append(card);
  }
}

function renderEventLog(bets) {
  elements.eventLog.replaceChildren();

  if (bets.length === 0) {
    elements.eventLog.append(emptyState("Здесь появятся рассчитанные исходы ваших ставок."));
    return;
  }

  for (const bet of [...bets].reverse()) {
    const card = document.createElement("article");
    card.className = `event-card outcome-card outcome-${bet.status}`;
    card.innerHTML = `
      <strong>${bet.marketTitle}</strong>
      <span>${betLabel(bet)} · ${bet.stake} токенов · x${bet.odds}</span>
      <strong class="status-${bet.status}">${statusLabel(bet)}</strong>
      <span class="meta">Поставлено: ${formatTime(bet.placedAt)} · расчет: ${formatTime(bet.resolvesAt)}</span>
    `;
    elements.eventLog.append(card);
  }
}

function renderTextBetForm(market, alreadyPlaced) {
  const optionFragment = elements.textBetTemplate.content.cloneNode(true);
  const form = optionFragment.querySelector(".text-bet-row");
  const answerInput = optionFragment.querySelector("input[name='answer']");
  const stakeInput = optionFragment.querySelector("input[name='stake']");
  const button = optionFragment.querySelector("button");

  form.dataset.marketId = market.id;
  optionFragment.querySelector(".option-odds").textContent = `x${market.textOdds}`;
  stakeInput.max = state.balance;
  button.disabled = alreadyPlaced || state.balance <= 0;
  button.textContent = alreadyPlaced ? "Выбрано" : "Поставить";
  answerInput.disabled = alreadyPlaced;
  stakeInput.disabled = alreadyPlaced;

  const submitTextBet = (event) => {
    event.preventDefault();
    const answerText = answerInput.value.trim();
    if (!answerText) return;

    placeBet(
      market,
      {
        optionId: "text-answer",
        optionTitle: answerText,
        answerText,
        odds: market.textOdds,
      },
      Number(stakeInput.value),
    );
  };

  form.addEventListener("submit", submitTextBet);
  button.addEventListener("click", submitTextBet);
  button.onclick = submitTextBet;

  return optionFragment;
}

function isMarketActive(market) {
  return state.now >= market.opensAt && state.now < market.closesAt;
}

function getCurrentAdBreak() {
  return state.episode.adBreaks?.find(
    (adBreak) => state.now >= adBreak.startsAt && state.now < adBreak.endsAt,
  );
}

function getCurrentIntroBreak() {
  return state.episode.introBreaks?.find(
    (introBreak) => state.now >= introBreak.startsAt && state.now < introBreak.endsAt,
  );
}

function clampTime(value) {
  return Math.max(0, Math.min(value, state.episode.durationSeconds));
}

function emptyState(text) {
  const element = document.createElement("div");
  element.className = "empty-state";
  element.textContent = text;
  return element;
}

function statusLabel(bet) {
  if (bet.status === "pending") return "Ожидает исход";
  if (bet.status === "won") return `Выигрыш: +${bet.payout}`;
  return "Проигрыш";
}

function betLabel(bet) {
  return bet.betFormat === "text" ? `Ответ: ${bet.answerText}` : bet.optionTitle;
}

function isWinningBet(market, bet) {
  if ((market.betFormat ?? "choice") === "text") {
    const normalizedAnswer = normalizeAnswer(bet.answerText);
    return market.correctAnswers.some((answer) => normalizeAnswer(answer) === normalizedAnswer);
  }

  return bet.optionId === market.winningOptionId;
}

function getWinningText(market) {
  if ((market.betFormat ?? "choice") === "text") {
    return market.correctAnswers.join(" / ");
  }

  return market.options.find((option) => option.id === market.winningOptionId)?.title ?? "Не указан";
}

function normalizeAnswer(value) {
  return value.trim().toLowerCase().replace(/\s+/g, " ");
}

function formatTime(totalSeconds) {
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = Math.floor(totalSeconds % 60);
  return `${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;
}

function setupAuthorMode() {
  if (!elements.marketEditor || !state.isAdminMode) return;

  elements.authorPanel.hidden = false;

  elements.authorMarketType.addEventListener("change", applyMarketTypeDefaults);
  elements.authorBetFormat.addEventListener("change", applyBetFormatFields);
  applyMarketTypeDefaults();
  applyBetFormatFields();

  document.querySelectorAll("[data-fill-time]").forEach((button) => {
    button.addEventListener("click", () => {
      const input = document.querySelector(`#${button.dataset.fillTime}`);
      input.value = formatTime(state.now);
    });
  });

  elements.marketEditor.addEventListener("submit", (event) => {
    event.preventDefault();

    try {
      const draft = getDraftEpisode();
      const market = buildMarketFromEditor();
      draft.markets.push(market);
      saveDraftEpisode(draft);
      elements.marketEditor.reset();
      elements.authorBetFormat.value = market.betFormat;
      elements.authorMarketType.value = market.marketType;
      elements.authorCategory.value = market.category;
      elements.authorOpensAt.value = formatTime(market.closesAt);
      elements.authorClosesAt.value = formatTime(market.closesAt + 30);
      elements.authorResolveAt.value = formatTime(market.resolveAt + 60);
      applyBetFormatFields();
      showAuthorMessage("Ставка добавлена в черновик.");
      renderDraftMarkets();
    } catch (error) {
      showAuthorMessage(error.message);
    }
  });

  elements.copyDraft.addEventListener("click", async () => {
    const json = JSON.stringify(getDraftEpisode(), null, 2);
    try {
      await navigator.clipboard.writeText(json);
      showAuthorMessage("JSON скопирован.");
    } catch {
      showAuthorMessage("Не удалось скопировать автоматически. Скачайте файл.");
    }
  });

  elements.downloadDraft.addEventListener("click", () => {
    const json = JSON.stringify(getDraftEpisode(), null, 2);
    const blob = new Blob([json], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = "episode-draft.json";
    link.click();
    URL.revokeObjectURL(url);
    showAuthorMessage("JSON подготовлен к скачиванию.");
  });

  elements.clearDraft.addEventListener("click", () => {
    localStorage.removeItem(getDraftStorageKey());
    showAuthorMessage("Черновик очищен.");
    renderDraftMarkets();
  });
}

function buildMarketFromEditor() {
  const betFormat = elements.authorBetFormat.value;
  const marketType = elements.authorMarketType.value;
  const opensAt = parseTimecode(elements.authorOpensAt.value);
  const closesAt = parseTimecode(elements.authorClosesAt.value);
  const resolveAt = parseTimecode(elements.authorResolveAt.value);
  const title = elements.authorTitle.value.trim();

  if (!title) throw new Error("Укажите вопрос ставки.");
  if (!(opensAt < closesAt && closesAt <= resolveAt)) {
    throw new Error("Время должно идти так: открыть < закрыть <= расчет.");
  }
  if (resolveAt > state.episode.durationSeconds) {
    throw new Error("Расчет не может быть позже конца серии.");
  }

  const market = {
    id: uniqueMarketId(title),
    betFormat,
    marketType,
    category: elements.authorCategory.value.trim() || "Ставка",
    title,
    description: elements.authorDescription.value.trim(),
    opensAt,
    closesAt,
    resolveAt,
    resolutionNote: elements.authorResolutionNote.value.trim(),
  };

  if (betFormat === "text") {
    const textOdds = Number(elements.authorTextOdds.value);
    const correctAnswers = parseCorrectAnswers(elements.authorCorrectAnswers.value);
    if (!Number.isFinite(textOdds) || textOdds <= 1) {
      throw new Error("Коэффициент открытого ответа должен быть больше 1.");
    }

    return {
      ...market,
      textOdds,
      correctAnswers,
      options: [],
    };
  }

  const options = parseOptions(elements.authorOptions.value);
  const winningOptionId = elements.authorWinningOption.value.trim();
  if (!options.some((option) => option.id === winningOptionId)) {
    throw new Error("ID верного исхода должен совпадать с одним из вариантов.");
  }

  return {
    ...market,
    winningOptionId,
    options,
  };
}

function parseOptions(value) {
  const options = value
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => {
      const [id, title, odds] = line.split("|").map((part) => part.trim());
      return { id, title, odds: Number(odds) };
    });

  if (options.length < 2) throw new Error("Добавьте минимум два варианта исхода.");
  if (options.some((option) => !option.id || !option.title || !Number.isFinite(option.odds))) {
    throw new Error("Формат варианта: id | текст | коэффициент.");
  }
  if (options.some((option) => option.odds < 1)) {
    throw new Error("Коэффициент должен быть не меньше 1.");
  }

  return options;
}

function parseCorrectAnswers(value) {
  const answers = value
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean);

  if (answers.length === 0) {
    throw new Error("Добавьте минимум один правильный ответ для открытой формы.");
  }

  return answers;
}

function parseTimecode(value) {
  const parts = value.trim().split(":").map(Number);
  if (parts.length < 2 || parts.length > 3 || parts.some((part) => !Number.isInteger(part))) {
    throw new Error("Таймкод должен быть в формате MM:SS или HH:MM:SS.");
  }

  const [hours, minutes, seconds] = parts.length === 3 ? parts : [0, parts[0], parts[1]];
  if (minutes < 0 || seconds < 0 || seconds > 59) {
    throw new Error("Проверьте минуты и секунды в таймкоде.");
  }

  return hours * 3600 + minutes * 60 + seconds;
}

function getDraftEpisode() {
  const storedDraft = localStorage.getItem(getDraftStorageKey());
  if (storedDraft) return JSON.parse(storedDraft);

  return {
    id: `${state.episode.id}-draft`,
    title: `${state.episode.title} — черновик`,
    durationSeconds: state.episode.durationSeconds,
    startingBalance: state.episode.startingBalance,
    markets: [],
  };
}

function saveDraftEpisode(draft) {
  localStorage.setItem(getDraftStorageKey(), JSON.stringify(draft));
}

function applyBetFormatFields() {
  const isTextFormat = elements.authorBetFormat.value === "text";

  document.querySelectorAll("[data-choice-field]").forEach((field) => {
    field.hidden = isTextFormat;
  });
  document.querySelectorAll("[data-text-field]").forEach((field) => {
    field.hidden = !isTextFormat;
  });

  elements.authorOptions.required = !isTextFormat;
  elements.authorWinningOption.required = !isTextFormat;
  elements.authorCorrectAnswers.required = isTextFormat;
  elements.authorTextOdds.required = isTextFormat;
}

function renderDraftMarkets() {
  if (!elements.draftMarkets || !state.episode) return;

  const draft = getDraftEpisode();
  elements.draftCount.textContent = draft.markets.length;
  elements.draftMarkets.replaceChildren();

  if (draft.markets.length === 0) {
    elements.draftMarkets.append(emptyState("Черновик пока пуст."));
    return;
  }

  for (const market of [...draft.markets].reverse()) {
    const card = document.createElement("article");
    card.className = "draft-card";

    const title = document.createElement("strong");
    title.textContent = market.title;

    const windowText = document.createElement("span");
    windowText.className = "meta";
    windowText.textContent = `${formatTime(market.opensAt)}-${formatTime(market.closesAt)} · расчет ${formatTime(market.resolveAt)}`;

    const optionsText = document.createElement("span");
    if (market.betFormat === "text") {
      optionsText.textContent = `Открытый ответ · x${market.textOdds} · ответов в базе: ${market.correctAnswers.length}`;
    } else {
      optionsText.textContent = market.options
        .map((option) => `${option.title} x${option.odds}`)
        .join(" · ");
    }

    card.append(title, windowText, optionsText);
    elements.draftMarkets.append(card);
  }
}

function uniqueMarketId(title) {
  const baseId = slugify(title);
  const existingIds = new Set(getDraftEpisode().markets.map((market) => market.id));
  let candidate = baseId;
  let suffix = 2;

  while (existingIds.has(candidate)) {
    candidate = `${baseId}-${suffix}`;
    suffix += 1;
  }

  return candidate;
}

function slugify(value) {
  const translit = {
    а: "a",
    б: "b",
    в: "v",
    г: "g",
    д: "d",
    е: "e",
    ё: "e",
    ж: "zh",
    з: "z",
    и: "i",
    й: "y",
    к: "k",
    л: "l",
    м: "m",
    н: "n",
    о: "o",
    п: "p",
    р: "r",
    с: "s",
    т: "t",
    у: "u",
    ф: "f",
    х: "h",
    ц: "c",
    ч: "ch",
    ш: "sh",
    щ: "sch",
    ы: "y",
    э: "e",
    ю: "yu",
    я: "ya",
  };
  const normalized = value
    .toLowerCase()
    .replace(/[а-яё]/g, (letter) => translit[letter] ?? letter)
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");

  return normalized || `market-${Date.now()}`;
}

function showAuthorMessage(message) {
  elements.authorMessage.textContent = message;
}

function applyMarketTypeDefaults() {
  const type = marketTypes[elements.authorMarketType.value];
  if (!type) return;

  const opensAt = parseTimecode(elements.authorOpensAt.value || "00:00");
  elements.authorCategory.value = type.category;
  const suggestedClosesAt = opensAt + type.windowSeconds;
  const duration = state.episode?.durationSeconds;
  elements.authorClosesAt.value = formatTime(
    Number.isFinite(duration) ? Math.min(suggestedClosesAt, duration) : suggestedClosesAt,
  );
}

function getDraftStorageKey() {
  return `episode-bets-draft:${state.episode?.id ?? "default"}`;
}

function getProgressStorageKey() {
  return `episode-bets-progress:${state.episode.id}`;
}

function restoreProgress() {
  const storedProgress = localStorage.getItem(getProgressStorageKey());
  if (!storedProgress) return;

  try {
    const progress = JSON.parse(storedProgress);
    state.balance = Number.isFinite(progress.balance) ? progress.balance : state.balance;
    state.now = Number.isFinite(progress.now) ? progress.now : state.now;
    state.promoBonusClaimed = Boolean(progress.promoBonusClaimed);
    state.placedBets = Array.isArray(progress.placedBets) ? progress.placedBets : [];
    state.resolvedMarketIds = new Set(
      Array.isArray(progress.resolvedMarketIds) ? progress.resolvedMarketIds : [],
    );
    resolveMarkets();
  } catch {
    localStorage.removeItem(getProgressStorageKey());
  }
}

function saveProgress() {
  if (!state.episode) return;

  localStorage.setItem(
    getProgressStorageKey(),
    JSON.stringify({
      balance: state.balance,
      now: state.now,
      promoBonusClaimed: state.promoBonusClaimed,
      placedBets: state.placedBets,
      resolvedMarketIds: [...state.resolvedMarketIds],
    }),
  );
}
