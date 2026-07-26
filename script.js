/* ============================================================
   BALI TOUR 2026 - script.js
   ------------------------------------------------------------
   このファイルが、サイト全体の「動き」を作っています。
   旅行の内容（文章・日程・写真ファイル名など）を変えたいときは
   このファイルではなく、同じフォルダの tour-data.json を
   編集してください。
   ------------------------------------------------------------
   目次（Ctrl+Fで検索すると探しやすいです）
     1. 共通ヘルパー関数
     2. 画像プレースホルダー（写真が無い時の親切表示）
     3. データ読み込み・ローディング画面
     4. オープニング演出（宇宙→地球→飛行機→到着→タイトル）
     5. 星空キャンバス
     6. 各チャプターのデータ流し込み（レンダリング）
     7. スライドナビゲーション（次へ・戻る・メニュー等）
     8. BGM・効果音・フルスクリーン・自動再生
     9. 初期化（一番下でまとめて呼び出しています）
   ============================================================ */

"use strict";

/* ============================================================
   1. 共通ヘルパー関数
   ============================================================ */

// 指定ミリ秒だけ待つ（await sleep(1000) のように使います）
function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}


// "a.b.c" のような文字列で、オブジェクトの奥の値を取り出す
function getByPath(obj, path) {
  return path.split(".").reduce((acc, key) => {
    return acc && acc[key] !== undefined ? acc[key] : undefined;
  }, obj);
}

// 要素を作って属性・テキストをまとめて設定する簡易ヘルパー
function el(tag, className, text) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}

/* ============================================================
   2. 画像プレースホルダー
   ------------------------------------------------------------
   assets/images/ に写真がまだ置かれていない場合でも、
   レイアウトが崩れないよう「ここに写真を置いてください」という
   案内を自動で表示します。写真を用意したら、同じファイル名で
   assets/images フォルダに置くだけで、自動的に差し替わります。
   ============================================================ */

function imagePath(filename) {
  return "assets/images/" + filename;
}

// 写真が見つからないときに表示する、案内つきのプレースホルダー画像（SVG）を作る
function placeholderDataUri(filename) {
  const label = filename.length > 30 ? filename.slice(0, 27) + "…" : filename;
  const svg =
    "<svg xmlns='http://www.w3.org/2000/svg' width='800' height='500'>" +
    "<rect width='100%' height='100%' fill='#f3ead9'/>" +
    "<rect x='3' y='3' width='794' height='494' fill='none' stroke='#c9a24b' stroke-width='3' stroke-dasharray='12,10'/>" +
    "<text x='50%' y='42%' text-anchor='middle' font-size='48'>🖼️</text>" +
    "<text x='50%' y='58%' text-anchor='middle' font-family='sans-serif' font-size='22' fill='#22343a'>ここに写真を追加してください</text>" +
    "<text x='50%' y='68%' text-anchor='middle' font-family='monospace' font-size='16' fill='#0e7c8f'>assets/images/" + label + "</text>" +
    "</svg>";
  return "data:image/svg+xml;charset=UTF-8," + encodeURIComponent(svg);
}

// 写真ファイル名から <img> 要素を作る（見つからない場合は自動でプレースホルダーに切り替え）
function makeImg(filename, alt, className) {
  const img = document.createElement("img");
  img.loading = "lazy";
  img.alt = alt || "";
  if (className) img.className = className;
  else img.className = "ph-img";
  img.src = imagePath(filename);
  img.onerror = function () {
    img.onerror = null;
    img.src = placeholderDataUri(filename);
  };
  return img;
}

/* ============================================================
   3. データ読み込み・ローディング画面
   ============================================================ */

const state = {
  data: null,
  currentIndex: 0,
  totalSlides: 0,
  autoplay: false,
  autoplayTimer: null,
  bgmOn: false,
  bgmTrackId: null,
  openingSkipped: false,
  observedSlides: new WeakSet(),
  appEntered: false,
};

async function loadTourData() {
  const loadingBarFill = document.getElementById("loading-bar-fill");
  const loadingScreen = document.getElementById("loading-screen");
  const loadingText = document.querySelector(".loading-text");

  // ローディングバーをそれっぽく進める演出（実際の読み込みと並行して動きます）
  let fakeProgress = 0;
  const progressTimer = setInterval(() => {
    fakeProgress = Math.min(fakeProgress + Math.random() * 18, 90);
    loadingBarFill.style.width = fakeProgress + "%";
  }, 180);

  try {
    const res = await fetch("tour-data.json");
    if (!res.ok) throw new Error("HTTP " + res.status);
    const json = await res.json();

    clearInterval(progressTimer);
    loadingBarFill.style.width = "100%";
    await sleep(400);
    loadingScreen.classList.add("is-hidden");
    return json;
  } catch (err) {
    clearInterval(progressTimer);
    // データが読み込めない場合の親切なエラー表示
    // （多くの場合、index.html を直接ダブルクリックして開くと、
    //   ブラウザのセキュリティ制限で tour-data.json を読み込めません。
    //   VSCodeの「Live Server」拡張機能などローカルサーバー経由で
    //   開くと解決します）
    loadingText.innerHTML =
      "tour-data.json を読み込めませんでした。<br>" +
      "index.html を直接開いている場合、ブラウザの制限が原因の可能性があります。<br>" +
      "VSCodeの「Live Server」などローカルサーバー経由でお試しください。";
    loadingText.style.color = "#ffb4b4";
    console.error("tour-data.json の読み込みに失敗しました:", err);
    return null;
  }
}

/* ============================================================
   4. オープニング演出
   ============================================================ */

const openingEls = {};

function cacheOpeningEls() {
  openingEls.screen = document.getElementById("opening-screen");
  openingEls.earthScene = document.getElementById("earth-scene");
  openingEls.japanGlow = document.getElementById("japan-glow");
  openingEls.baliGlow = document.getElementById("bali-glow");
  openingEls.routePath = document.getElementById("earth-route-path");
  openingEls.flightScene = document.getElementById("flight-scene");
  openingEls.flightPath = document.getElementById("flight-path");
  openingEls.planeIcon = document.getElementById("plane-icon");
  openingEls.captionWrap = document.getElementById("opening-caption");
  openingEls.captionText = document.getElementById("opening-caption-text");
  openingEls.captionSub = document.getElementById("opening-caption-sub");
  openingEls.arrival = document.getElementById("opening-arrival");
  openingEls.shootingStars = document.getElementById("shooting-stars");
  openingEls.arrivalGreeting = document.getElementById("arrival-greeting");
  openingEls.arrivalSub = document.getElementById("arrival-sub");
  openingEls.title = document.getElementById("opening-title");
  openingEls.titleProducer = document.getElementById("opening-title-producer");
  openingEls.titleMain = document.getElementById("opening-title-main");
  openingEls.titleSub = document.getElementById("opening-title-sub");
  openingEls.titleSub2 = document.getElementById("opening-title-sub2");
  openingEls.clouds = document.querySelector(".opening-clouds");
  openingEls.dots = document.querySelectorAll(".flight-dot");
  openingEls.labels = document.querySelectorAll(".flight-label");
  openingEls.tapGate = document.getElementById("opening-tap-gate");
}

function showCaption(step) {
  openingEls.captionText.textContent = step.text;
  openingEls.captionSub.textContent = step.sub || "";
  openingEls.captionText.classList.remove("is-visible");
  openingEls.captionSub.classList.remove("is-visible");
  // 一度クラスを外して再度付け直すことで、毎回フェードインし直す
  void openingEls.captionText.offsetWidth; // リフロー強制（アニメーション再生のため）
  openingEls.captionText.classList.add("is-visible");
  openingEls.captionSub.classList.add("is-visible");
}

// SVGのパスに沿って飛行機アイコンを飛ばす演出
function animatePlaneAlongPath(durationMs) {
  return new Promise((resolve) => {
    const path = openingEls.flightPath;
    const plane = openingEls.planeIcon;
    const stage = openingEls.flightScene;
    const len = path.getTotalLength();
    const startTime = performance.now();
    plane.classList.add("is-flying");

    function frame(now) {
      const t = Math.min((now - startTime) / durationMs, 1);
      const pt = path.getPointAtLength(t * len);
      const ctm = path.getScreenCTM();
      if (ctm) {
        const screenPt = pt.matrixTransform(ctm);
        const stageRect = stage.getBoundingClientRect();
        plane.style.left = screenPt.x - stageRect.left + "px";
        plane.style.top = screenPt.y - stageRect.top + "px";

        // 進行方向に合わせて機体を回転させる
        const ptAhead = path.getPointAtLength(Math.min(len, t * len + 3));
        const angle = Math.atan2(ptAhead.y - pt.y, ptAhead.x - pt.x) * (180 / Math.PI);
        plane.style.transform = "translate(-50%, -50%) rotate(" + angle + "deg)";
      }

      // 経由地点のマーカーを、通過したタイミングで表示する
      if (t >= 0.02) openingEls.dots[0].classList.add("is-visible");
      if (t >= 0.02) openingEls.labels[0].classList.add("is-visible");
      if (t >= 0.55) openingEls.dots[1].classList.add("is-visible");
      if (t >= 0.55) openingEls.labels[1].classList.add("is-visible");
      if (t >= 0.96) openingEls.dots[2].classList.add("is-visible");
      if (t >= 0.96) openingEls.labels[2].classList.add("is-visible");

      if (t < 1 && !state.openingSkipped) {
        requestAnimationFrame(frame);
      } else {
        resolve();
      }
    }
    requestAnimationFrame(frame);
  });
}

function finishOpeningToTitle(openingData) {
  openingEls.flightScene.classList.remove("is-visible");
  openingEls.arrival.classList.add("hidden");
  openingEls.shootingStars.classList.remove("is-active");
  stopFlyingSfx();
  openingEls.captionText.classList.remove("is-visible");
  openingEls.captionSub.classList.remove("is-visible");
  // キャプション欄は大きな上余白を持っているため、非表示のまま
  // レイアウトに残ると、あとに続くタイトルが中央からずれてしまう。
  // 完全にレイアウトから外すことで、タイトルを正しく中央表示する。
  openingEls.captionWrap.classList.add("hidden");
  openingEls.titleProducer.textContent = state.data.meta.producer;
  openingEls.titleMain.textContent = openingData.titleMain;
  openingEls.titleSub.textContent = openingData.titleSub || "";
  openingEls.titleSub.classList.toggle("hidden", !openingData.titleSub);
  openingEls.titleSub2.textContent = openingData.titleSub2 || "";
  openingEls.title.classList.remove("hidden");
}

async function runOpeningSequence(data) {
  const opening = data.opening;
  const steps = opening.steps;

  openingEls.clouds.classList.add("is-visible");
  startBgmAutoplay(); // 演出の冒頭からすぐにBGMを流し始める（終盤まで待たせない）

  // --- ステップ1〜3：宇宙 → 地球 → 日本が光る ---
  showCaption(steps[0]);
  await sleep(2600);
  if (state.openingSkipped) return finishOpeningToTitle(opening);

  showCaption(steps[1]);
  await sleep(2600);
  if (state.openingSkipped) return finishOpeningToTitle(opening);

  showCaption(steps[2]);
  openingEls.japanGlow.classList.add("is-lit");
  openingEls.baliGlow.classList.add("is-lit");
  openingEls.routePath.classList.add("is-drawn");
  await sleep(2600);
  if (state.openingSkipped) return finishOpeningToTitle(opening);

  // --- ステップ4：地球から飛行ルートへ切り替え、飛行機を飛ばす ---
  openingEls.earthScene.classList.add("is-fading");
  await sleep(900);
  if (state.openingSkipped) return finishOpeningToTitle(opening);

  openingEls.flightScene.classList.add("is-visible");
  showCaption(steps[3]);
  openingEls.flightPath.classList.add("is-drawn");
  playTakeoffSfx();
  playFlyingSfx();
  await animatePlaneAlongPath(3400);
  stopFlyingSfx();
  if (state.openingSkipped) return finishOpeningToTitle(opening);

  await sleep(500);
  if (state.openingSkipped) return finishOpeningToTitle(opening);

  // --- 到着メッセージ「Selamat Datang！」---
  openingEls.flightScene.classList.remove("is-visible");
  openingEls.captionText.classList.remove("is-visible");
  openingEls.captionSub.classList.remove("is-visible");
  openingEls.captionWrap.classList.add("hidden");
  openingEls.arrivalGreeting.textContent = opening.arrivalGreeting;
  openingEls.arrivalSub.textContent = opening.arrivalSubGreeting;
  openingEls.arrival.classList.remove("hidden");
  openingEls.shootingStars.classList.add("is-active");
  await sleep(2800);
  if (state.openingSkipped) return finishOpeningToTitle(opening);

  // --- タイトルロゴ表示 ---
  finishOpeningToTitle(opening);
}

function enterMainApp() {
  const openingScreen = document.getElementById("opening-screen");
  const app = document.getElementById("app");
  openingScreen.classList.add("is-hidden");
  app.classList.remove("app-hidden");
  state.appEntered = true;
  updateHeaderHeightVars();
  goToSlide(0, { instant: true });
  setTimeout(maybeShowBgmHint, 1200);
  setTimeout(updateHeaderHeightVars, 400); // フォント読み込み後の高さ変化に追従
}

/* ============================================================
   5. 星空キャンバス
   ============================================================ */

function initStarfield() {
  const canvas = document.getElementById("starfield");
  const ctx = canvas.getContext("2d");
  let stars = [];

  function resize() {
    // 本編に入った後は星空は二度と見えないので、リサイズのたびに
    // canvas.width を書き換えて強制レイアウト+星の再生成をするのは無駄な上、
    // iOSでスクロール中にアドレスバーが動いてresizeが連発した際、
    // チャプター内スクロールが先頭に巻き戻る一因になっていた。
    if (state.appEntered) return;
    canvas.width = window.innerWidth;
    canvas.height = window.innerHeight;
    const count = Math.floor((canvas.width * canvas.height) / 3500);
    stars = new Array(count).fill(0).map(() => ({
      x: Math.random() * canvas.width,
      y: Math.random() * canvas.height,
      r: Math.random() * 1.4 + 0.3,
      phase: Math.random() * Math.PI * 2,
      speed: 0.02 + Math.random() * 0.03,
    }));
  }

  function draw(time) {
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.fillStyle = "#ffffff";
    stars.forEach((s) => {
      const twinkle = 0.5 + 0.5 * Math.sin(time * s.speed + s.phase);
      ctx.globalAlpha = 0.25 + twinkle * 0.6;
      ctx.beginPath();
      ctx.arc(s.x, s.y, s.r, 0, Math.PI * 2);
      ctx.fill();
    });
    ctx.globalAlpha = 1;
    requestAnimationFrame(draw);
  }

  window.addEventListener("resize", resize);
  resize();
  requestAnimationFrame(draw);
}

/* ============================================================
   6. 各チャプターのデータ流し込み
   ============================================================ */

// data-bind="chapterTitle:xxx" や data-bind="a.b.c" を自動で反映する
function applyDataBindings(data) {
  document.querySelectorAll("[data-bind]").forEach((element) => {
    const key = element.getAttribute("data-bind");
    if (key.indexOf("chapterTitle:") === 0) {
      const chapterId = key.split(":")[1];
      const chapter = data.chapters.find((c) => c.id === chapterId);
      element.textContent = chapter ? chapter.title : "";
    } else {
      const value = getByPath(data, key);
      if (value !== undefined) element.textContent = value;
    }
  });

  // HTML内に直接書かれた <img data-src="..."> を安全な形で読み込む
  document.querySelectorAll("img[data-src]").forEach((img) => {
    const full = img.getAttribute("data-src");
    const filename = full.split("/").pop();
    img.src = full;
    img.onerror = function () {
      img.onerror = null;
      img.src = placeholderDataUri(filename);
    };
  });
}

// --- Chapter 1: バリ島ってどこ？ ---
function renderWorldMap(data) {
  const ul = document.getElementById("route-points");
  data.worldMap.points.forEach((p) => {
    const li = el("li");
    li.innerHTML = "<strong>" + p.label + "</strong><span>" + p.note + "</span>";
    ul.appendChild(li);
  });
}

// 日本時間・バリ現地時間をリアルタイム表示する
function initLiveClocks() {
  const jpFormatter = new Intl.DateTimeFormat("ja-JP", { timeZone: "Asia/Tokyo", hour: "2-digit", minute: "2-digit", hour12: false });
  const baliFormatter = new Intl.DateTimeFormat("ja-JP", { timeZone: "Asia/Makassar", hour: "2-digit", minute: "2-digit", hour12: false });

  function tick() {
    const now = new Date();
    const jpText = jpFormatter.format(now);
    const baliText = baliFormatter.format(now);
    document.querySelectorAll(".js-clock-jp").forEach((el2) => (el2.textContent = jpText));
    document.querySelectorAll(".js-clock-bali").forEach((el2) => (el2.textContent = baliText));
  }
  tick();
  setInterval(tick, 15000);
}

// WMO天気コード(Open-Meteo)を、アイコンと日本語の説明に変換する
const WEATHER_CODE_INFO = {
  0: { icon: "☀️", label: "快晴" },
  1: { icon: "🌤️", label: "ほぼ晴れ" },
  2: { icon: "⛅", label: "晴れ時々曇り" },
  3: { icon: "☁️", label: "曇り" },
  45: { icon: "🌫️", label: "霧" },
  48: { icon: "🌫️", label: "霧" },
  51: { icon: "🌦️", label: "霧雨" },
  53: { icon: "🌦️", label: "霧雨" },
  55: { icon: "🌦️", label: "霧雨" },
  61: { icon: "🌧️", label: "雨" },
  63: { icon: "🌧️", label: "雨" },
  65: { icon: "🌧️", label: "強い雨" },
  80: { icon: "🌦️", label: "にわか雨" },
  81: { icon: "🌦️", label: "にわか雨" },
  82: { icon: "🌧️", label: "激しいにわか雨" },
  95: { icon: "⛈️", label: "雷雨" },
  96: { icon: "⛈️", label: "雷雨(ひょう)" },
  99: { icon: "⛈️", label: "雷雨(ひょう)" },
};
function weatherCodeInfo(code) {
  return WEATHER_CODE_INFO[code] || { icon: "🌤️", label: "―" };
}

// 月の満ち欠け（月齢）を計算する。外部サービスを使わず、
// 「新月からの経過日数 ÷ 朔望月（約29.53日）」という天文学の基本計算式だけで求められるため、
// 天気とは違ってAPIに頼らずJavaScriptだけで完結する。
function getMoonPhaseInfo(date) {
  const synodicMonth = 29.530588853;
  // 2000年1月6日18:14 UTC が基準となる新月（新月の日）
  const knownNewMoon = Date.UTC(2000, 0, 6, 18, 14);
  const daysSince = (date.getTime() - knownNewMoon) / 86400000;
  const age = ((daysSince % synodicMonth) + synodicMonth) % synodicMonth; // 0〜29.53の月齢
  const illumination = Math.round((1 - Math.cos((age / synodicMonth) * 2 * Math.PI)) / 2 * 100);

  const phases = [
    { max: 1.84, icon: "🌑", label: "新月" },
    { max: 5.53, icon: "🌒", label: "三日月" },
    { max: 9.22, icon: "🌓", label: "上弦の月" },
    { max: 12.91, icon: "🌔", label: "十三夜月" },
    { max: 16.61, icon: "🌕", label: "満月" },
    { max: 20.30, icon: "🌖", label: "十六夜月" },
    { max: 23.99, icon: "🌗", label: "下弦の月" },
    { max: 27.68, icon: "🌘", label: "有明月" },
    { max: synodicMonth, icon: "🌑", label: "新月" },
  ];
  const phase = phases.find((p) => age < p.max) || phases[phases.length - 1];
  return { icon: phase.icon, label: phase.label, age: age, illumination: illumination };
}

// バリ(デンパサール)の現在の天気・3日間の予報・星空観測情報を取得する（Open-Meteo：APIキー不要・無料）
async function fetchBaliWeather() {
  const containers = document.querySelectorAll(".js-live-weather");
  const stargazingContainers = document.querySelectorAll(".js-live-stargazing");
  try {
    const url = "https://api.open-meteo.com/v1/forecast?latitude=-8.65&longitude=115.2167"
      + "&current=temperature_2m,weather_code"
      + "&daily=weather_code,temperature_2m_max,temperature_2m_min,sunrise,sunset"
      + "&timezone=Asia%2FMakassar&forecast_days=3";
    const res = await fetch(url);
    if (!res.ok) throw new Error("HTTP " + res.status);
    const json = await res.json();

    const now = weatherCodeInfo(json.current.weather_code);
    const dayLabels = ["今日", "明日", "明後日"];

    let html = "";
    html += '<div class="live-weather-now">';
    html += '<span class="live-weather-now-icon">' + now.icon + "</span>";
    html += '<div><span class="live-weather-now-temp">' + Math.round(json.current.temperature_2m) + "℃</span>";
    html += '<p class="live-weather-now-desc">バリ（デンパサール）　現在の天気：' + now.label + "</p></div>";
    html += "</div>";

    html += '<div class="live-weather-forecast">';
    json.daily.time.forEach((_, i) => {
      const info = weatherCodeInfo(json.daily.weather_code[i]);
      const max = Math.round(json.daily.temperature_2m_max[i]);
      const min = Math.round(json.daily.temperature_2m_min[i]);
      html += '<div class="live-weather-day">';
      html += '<span class="live-weather-day-label">' + (dayLabels[i] || "") + "</span>";
      html += '<span class="live-weather-day-icon">' + info.icon + "</span>";
      html += '<span class="live-weather-day-desc">' + info.label + "</span>";
      html += '<span class="live-weather-day-temp">' + max + "° / " + min + "°</span>";
      html += "</div>";
    });
    html += "</div>";

    containers.forEach((c) => (c.innerHTML = html));

    // 今夜の星空情報：日没時刻（Open-Meteo）＋ 月齢・月の満ち欠け（計算のみ、API不要）
    const sunriseTime = json.daily.sunrise[0].slice(11, 16); // "2026-08-13T06:02" → "06:02"
    const sunsetTime = json.daily.sunset[0].slice(11, 16); // "2026-08-13T18:07" → "18:07"
    const moon = getMoonPhaseInfo(new Date());
    let stargazingHtml = '<div class="live-stargazing-inner">';
    stargazingHtml += '<p class="live-stargazing-title">🌌 今夜の星空情報</p>';
    stargazingHtml += '<div class="live-stargazing-row"><span>🌅 日の出</span><span>' + sunriseTime + "</span></div>";
    stargazingHtml += '<div class="live-stargazing-row"><span>🌇 日没</span><span>' + sunsetTime + "</span></div>";
    stargazingHtml += '<div class="live-stargazing-row"><span>' + moon.icon + " " + moon.label + "</span><span>月明かり " + moon.illumination + "%</span></div>";
    stargazingHtml += '<p class="live-stargazing-note">月明かりが弱い日ほど、星がくっきり見えやすくなります。</p>';
    stargazingHtml += "</div>";
    stargazingContainers.forEach((c) => (c.innerHTML = stargazingHtml));
  } catch (err) {
    const errorHtml = '<p class="live-weather-error">天気情報を取得できませんでした（電波の良い場所で再度お試しください）</p>';
    containers.forEach((c) => (c.innerHTML = errorHtml));

    // 天気の取得に失敗しても、月齢だけはAPI不要で計算できるので表示だけは続ける
    const moon = getMoonPhaseInfo(new Date());
    let fallbackHtml = '<div class="live-stargazing-inner">';
    fallbackHtml += '<p class="live-stargazing-title">🌌 今夜の星空情報</p>';
    fallbackHtml += '<div class="live-stargazing-row"><span>' + moon.icon + " " + moon.label + "</span><span>月明かり " + moon.illumination + "%</span></div>";
    fallbackHtml += '<p class="live-stargazing-note">日没時刻は電波の良い場所で再度お試しください。</p>';
    fallbackHtml += "</div>";
    stargazingContainers.forEach((c) => (c.innerHTML = fallbackHtml));
  }
}

// --- Chapter 2: 基本情報 ---
function renderBasicInfo(data) {
  const grid = document.getElementById("basic-info-grid");
  data.basicInfo.forEach((item) => {
    const card = el("div", "info-card reveal");
    card.innerHTML =
      "<span class='info-icon'>" + item.icon + "</span>" +
      "<span class='info-label'>" + item.label + "</span>" +
      "<span class='info-value'>" + item.value + "</span>";
    grid.appendChild(card);
  });
}

// --- Chapter 3 / 4: 宗教・人々（ストーリー系） ---
function renderStory(paragraphs, keywords, textContainerId, keywordContainerId) {
  const textEl = document.getElementById(textContainerId);
  paragraphs.forEach((paragraph) => {
    const p = el("p", "reveal", paragraph);
    textEl.appendChild(p);
  });
  const chipsEl = document.getElementById(keywordContainerId);
  keywords.forEach((keyword) => {
    chipsEl.appendChild(el("span", "", keyword));
  });
}

// --- Chapter 5: 言語フレーズ ---
function renderPhrases(data) {
  const wrap = document.getElementById("phrase-cards");
  data.phrases.forEach((phrase) => {
    const card = el("div", "phrase-card reveal");
    card.innerHTML =
      "<span class='phrase-jp'>" + phrase.jp + "</span>" +
      "<div class='phrase-id'>" + phrase.id + "</div>" +
      "<div class='phrase-pron'>発音：" + phrase.pron + "</div>";
    wrap.appendChild(card);
  });
}

// --- Chapter 6: 通貨 ---
function renderCurrency(data) {
  const currency = data.currency;
  document.getElementById("currency-tip").textContent = currency.tip;

  const tbody = document.getElementById("currency-table-body");
  currency.quickTable.forEach((row) => {
    const tr = document.createElement("tr");
    tr.innerHTML = "<td>" + row.jpy + "</td><td>" + row.idr + "</td>";
    tbody.appendChild(tr);
  });

  const input = document.getElementById("currency-calc-input");
  const output = document.getElementById("currency-calc-output");
  input.addEventListener("input", () => {
    const idr = Number(input.value) || 0;
    const yen = Math.round(idr / currency.rateJpyToIdr);
    output.textContent = yen.toLocaleString("ja-JP") + " 円";
  });

  const priceGrid = document.getElementById("price-list-grid");
  (currency.priceList || []).forEach((p) => {
    const item = el("div", "price-list-item");
    item.innerHTML =
      "<span class='price-list-icon'>" + p.icon + "</span>" +
      "<span><span class='price-list-item-name'>" + p.item + "</span>" +
      "<span class='price-list-item-price'>" + p.idr + "（" + p.jpy + "）</span></span>";
    priceGrid.appendChild(item);
  });
}

// --- Chapter 7: 値切り文化 ---
// お店の人（バリ人・ウデンを着けた顔）とあなた（旅行者）の、シンプルな顔イラスト
const BARGAIN_AVATAR_VENDOR =
  "<svg viewBox='0 0 40 40' width='40' height='40' aria-hidden='true'>" +
  "<circle cx='20' cy='21' r='17' fill='#E8B073'/>" +
  "<path d='M3 15 Q20 1 37 15 L37 20 Q20 10 3 20 Z' fill='#C0392B'/>" +
  "<circle cx='14' cy='23' r='2' fill='#3a2a20'/><circle cx='26' cy='23' r='2' fill='#3a2a20'/>" +
  "<path d='M14 29 Q20 34 26 29' stroke='#3a2a20' stroke-width='2' fill='none' stroke-linecap='round'/>" +
  "</svg>";
const BARGAIN_AVATAR_TRAVELER =
  "<svg viewBox='0 0 40 40' width='40' height='40' aria-hidden='true'>" +
  "<circle cx='20' cy='21' r='17' fill='#F6D3B0'/>" +
  "<path d='M3 15 Q20 -1 37 15 L37 11 Q20 -5 3 11 Z' fill='#5b4636'/>" +
  "<circle cx='14' cy='23' r='2' fill='#3a2a20'/><circle cx='26' cy='23' r='2' fill='#3a2a20'/>" +
  "<path d='M14 29 Q20 34 26 29' stroke='#3a2a20' stroke-width='2' fill='none' stroke-linecap='round'/>" +
  "</svg>";

function renderBargain(data) {
  const bargain = data.bargain;
  const wrap = document.getElementById("bargain-bubbles");
  bargain.conversation.forEach((line) => {
    const isMe = line.speaker === "あなた";
    const row = el("div", "bargain-row" + (isMe ? " is-me" : ""));
    const avatar = el("div", "bargain-avatar" + (isMe ? " is-traveler" : " is-vendor"));
    avatar.innerHTML = isMe ? BARGAIN_AVATAR_TRAVELER : BARGAIN_AVATAR_VENDOR;
    const bubble = el("div", "bargain-bubble" + (isMe ? " is-me" : ""));
    bubble.innerHTML = "<span class='b-speaker'>" + line.speaker + "</span>" + line.text;
    row.appendChild(avatar);
    row.appendChild(bubble);
    wrap.appendChild(row);
  });
  document.getElementById("bargain-comment").textContent = bargain.comment;
}

// 値切りの吹き出しを、表示されたときに1つずつ順番に見せる演出
function playBargainReveal() {
  const bubbles = document.querySelectorAll("#bargain-bubbles .bargain-bubble");
  bubbles.forEach((bubble, index) => {
    setTimeout(() => bubble.classList.add("is-in"), index * 700);
  });
}

// --- Chapter 8: 服装 ---
function renderClothing(data) {
  const grid = document.getElementById("clothing-grid");
  data.clothing.forEach((item) => {
    const card = el("div", "clothing-card reveal");
    card.innerHTML =
      "<span class='c-icon'>" + item.icon + "</span>" +
      "<span class='c-scene'>" + item.scene + "</span>" +
      "<span class='c-advice'>" + item.advice + "</span>";
    grid.appendChild(card);
  });
}

// --- Chapter 9: 持ち物チェックリスト（ローカル保存対応） ---
const CHECKLIST_STORAGE_KEY = "baliTour2026_checklist";

function loadChecklistState() {
  try {
    return JSON.parse(localStorage.getItem(CHECKLIST_STORAGE_KEY)) || {};
  } catch (e) {
    return {};
  }
}

function saveChecklistState(stateObj) {
  localStorage.setItem(CHECKLIST_STORAGE_KEY, JSON.stringify(stateObj));
}

function renderPacking(data) {
  const wrap = document.getElementById("packing-checklist-groups");
  const saved = loadChecklistState();

  // 持ち物の総数を数えておき、全部チェックされた瞬間を判定できるようにする
  const allItemIds = [];
  data.packingList.forEach((group) => group.items.forEach((item) => allItemIds.push(item.id)));

  function checkAllComplete() {
    const current = loadChecklistState();
    const allChecked = allItemIds.length > 0 && allItemIds.every((id) => current[id]);
    if (allChecked) showChecklistCompletePopup();
  }

  data.packingList.forEach((group) => {
    wrap.appendChild(el("h3", "checklist-category reveal", group.category));

    const ul = el("ul", "checklist reveal");
    group.items.forEach((item) => {
      const li = el("li");
      if (saved[item.id]) li.classList.add("is-checked");
      if (item.highlight) li.classList.add("is-urgent");

      const checkbox = document.createElement("input");
      checkbox.type = "checkbox";
      checkbox.checked = !!saved[item.id];
      checkbox.id = "pack-" + item.id;

      const textWrap = el("span", "item-text");
      textWrap.appendChild(el("span", "item-label", item.label));
      if (item.note) textWrap.appendChild(el("span", "item-note", item.note));

      li.appendChild(checkbox);
      li.appendChild(textWrap);
      li.addEventListener("click", (event) => {
        if (event.target !== checkbox) checkbox.checked = !checkbox.checked;
        li.classList.toggle("is-checked", checkbox.checked);
        const current = loadChecklistState();
        current[item.id] = checkbox.checked;
        saveChecklistState(current);
        if (checkbox.checked) checkAllComplete();
      });

      ul.appendChild(li);
    });
    wrap.appendChild(ul);
  });

  document.getElementById("packing-tip").textContent = data.packingTip;
}

// 持ち物チェックが全部そろった時だけ表示する、お祝いポップアップ
function showChecklistCompletePopup() {
  document.getElementById("checklist-complete-popup").classList.remove("hidden");
}
function closeChecklistCompletePopup() {
  document.getElementById("checklist-complete-popup").classList.add("hidden");
}

// 現地(バリ)時間での「今日」の日付を YYYY-MM-DD 形式で取得
function getBaliTodayDateString() {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Makassar", year: "numeric", month: "2-digit", day: "2-digit",
  }).formatToParts(new Date());
  const get = (type) => parts.find((p) => p.type === type).value;
  return get("year") + "-" + get("month") + "-" + get("day");
}

// --- Chapter 10: 旅行の流れ（タイムライン） ---
function renderItinerary(data) {
  const wrap = document.getElementById("itinerary-timeline");
  const todayStr = getBaliTodayDateString();
  data.itinerary.forEach((day) => {
    const isToday = day.date === todayStr;
    const item = el("div", "timeline-item reveal" + (isToday ? " is-today" : ""));
    item.dataset.date = day.date;

    const dateEl = el("div", "t-date", day.day + "　" + day.date);
    if (isToday) dateEl.appendChild(el("span", "t-today-badge", "TODAY"));
    const titleEl = el("div", "t-title", day.title);
    const imageWrap = el("div", "t-image");
    imageWrap.appendChild(makeImg(day.image, day.title));
    const eventsWrap = el("div", "t-events");
    day.events.forEach((eventText) => eventsWrap.appendChild(el("span", "", eventText)));

    item.appendChild(dateEl);
    item.appendChild(titleEl);
    item.appendChild(imageWrap);
    item.appendChild(eventsWrap);
    wrap.appendChild(item);
  });
}

// --- Chapter 11: ホテル紹介 ---
function renderHotels(data) {
  const grid = document.getElementById("hotel-grid");
  data.hotels.forEach((hotel) => {
    const card = el("div", "hotel-card reveal");
    const imageWrap = el("div", "h-image");
    imageWrap.appendChild(makeImg(hotel.image, hotel.name));

    const body = el("div", "h-body");
    body.innerHTML =
      "<div class='h-name'>" + hotel.name + "</div>" +
      "<div class='h-feature'>" + hotel.feature + "</div>" +
      "<div class='h-location'>📍 " + hotel.location + "</div>";

    // 外部サイトへ移動すると、戻ってきたときに元のページを見失いやすいため、
    // ページ内のモーダルで地図を表示する（「戻る」ボタンで確実に復帰できる）
    const mapBtn = document.createElement("button");
    mapBtn.className = "h-map-btn";
    mapBtn.textContent = "Google Mapで見る";
    mapBtn.addEventListener("click", () => openMapModal(hotel.mapLat, hotel.mapLng, hotel.name));
    body.appendChild(mapBtn);

    card.appendChild(imageWrap);
    card.appendChild(body);
    grid.appendChild(card);
  });
}

// --- Chapter 12: グルメ ---
function renderGourmet(data) {
  const grid = document.getElementById("gourmet-grid");
  data.gourmet.forEach((food) => {
    const card = el("div", "gourmet-card reveal");
    card.appendChild(makeImg(food.image, food.name));
    card.appendChild(el("div", "g-name", food.name));
    card.appendChild(el("div", "g-desc", food.desc));
    grid.appendChild(card);
  });
}

// --- Chapter 13: バリ豆知識（ランダムカード） ---
let triviaQueue = [];
let triviaData = [];
let lastTriviaText = "";

function shuffleArray(array) {
  const copy = array.slice();
  for (let i = copy.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy;
}

function nextTriviaText() {
  if (triviaQueue.length === 0) {
    triviaQueue = shuffleArray(triviaData);
    // 直前と同じ内容が連続しないように調整
    if (triviaQueue[0] === lastTriviaText && triviaQueue.length > 1) {
      [triviaQueue[0], triviaQueue[1]] = [triviaQueue[1], triviaQueue[0]];
    }
  }
  lastTriviaText = triviaQueue.shift();
  return lastTriviaText;
}

function renderTrivia(data) {
  triviaData = data.trivia;
  const card = document.getElementById("trivia-card");
  const textEl = document.getElementById("trivia-card-text");
  textEl.textContent = nextTriviaText();

  document.getElementById("btn-trivia-next").addEventListener("click", () => {
    card.classList.add("is-flip");
    setTimeout(() => {
      textEl.textContent = nextTriviaText();
      card.classList.remove("is-flip");
    }, 300);
  });
}

// 水彩イラストで綴る、バリ島の成り立ち物語
function renderBaliStory(data) {
  const wrap = document.getElementById("bali-story");
  data.baliStory.forEach((panel) => {
    const item = el("div", "bali-story-panel reveal");
    item.appendChild(makeImg(panel.image, "バリ物語のイラスト", "bali-story-img"));
    const textEl = el("p", "bali-story-text", panel.text);
    item.appendChild(textEl);
    wrap.appendChild(item);
  });
}

// --- Chapter 14: 旅行ルートMAP ---
// 実際のイラストマップ画像(1536x1024)上の、各都市の目印(circle)の座標
// (index.html の .route-map-city の cx/cy と対応させている)
const ROUTE_MAP_IMAGE_WIDTH = 1536;
const ROUTE_MAP_IMAGE_HEIGHT = 1024;

function renderRouteMap(data) {
  const routeMap = data.routeMap;
  const daysWrap = document.getElementById("route-map-days");
  const path = document.getElementById("route-map-path");
  const marker = document.getElementById("route-current-marker");
  const label = document.getElementById("route-map-current-label");
  const pathLength = path.getTotalLength();

  const highlightsWrap = document.getElementById("route-map-highlights");

  // 絵文字ごとの「正面（0度）が向いている既定の方向」の補正値。
  // 絵文字はもともと斜めや左向きに描かれているものが多く、そのままだと
  // 進行方向と噛み合わないため、種類ごとに引き算して合わせる。
  const TRANSPORT_BASE_ANGLE = { flight: -45, car: 180, ferry: 0 };

  function selectDay(index) {
    const dayInfo = routeMap.route[index];
    const fraction = routeMap.route.length > 1 ? index / (routeMap.route.length - 1) : 0;
    const point = path.getPointAtLength(fraction * pathLength);
    // SVGのviewBox(実画像と同じ1536x1024)を、実際に表示されているサイズの割合に変換する
    marker.style.left = (point.x / ROUTE_MAP_IMAGE_WIDTH) * 100 + "%";
    marker.style.top = (point.y / ROUTE_MAP_IMAGE_HEIGHT) * 100 + "%";
    marker.textContent = routeMap.legendIcons[dayInfo.transport].split(" ")[0];
    label.textContent = dayInfo.date + "　" + dayInfo.label;

    // 進行方向に合わせた回転は、向きが正しく見えている最終日（17日→18日）だけに適用する。
    // それ以外の日は、絵文字の向きがおかしく見えたため元の(回転なし)表示に戻す。
    const isLastDay = index === routeMap.route.length - 1;
    if (isLastDay) {
      const delta = Math.max(2, pathLength * 0.01);
      const beforePt = path.getPointAtLength(Math.max(0, fraction * pathLength - delta));
      const afterPt = path.getPointAtLength(Math.min(pathLength, fraction * pathLength + delta));
      const angleDeg = Math.atan2(afterPt.y - beforePt.y, afterPt.x - beforePt.x) * 180 / Math.PI;
      const baseAngle = TRANSPORT_BASE_ANGLE[dayInfo.transport] || 0;
      marker.style.setProperty("--heading", (angleDeg - baseAngle) + "deg");
    } else {
      marker.style.setProperty("--heading", "0deg");
    }

    // 移動した瞬間だけ、風になびくような線をさっと見せる
    marker.classList.remove("is-moving");
    void marker.offsetWidth; // リフローを強制して、毎回アニメーションを再生し直す
    marker.classList.add("is-moving");

    // その日に訪れる場所を、旅行の流れ(itinerary)のデータから拾って表示する
    highlightsWrap.innerHTML = "";
    const dayItinerary = data.itinerary[index];
    if (dayItinerary) {
      dayItinerary.events.forEach((eventText) => {
        highlightsWrap.appendChild(el("span", "route-map-highlight-chip", eventText));
      });
    }

    daysWrap.querySelectorAll("button.route-day-btn").forEach((btn, i) => {
      btn.classList.toggle("is-active", i === index);
    });
  }

  routeMap.route.forEach((dayInfo, index) => {
    const btn = document.createElement("button");
    btn.className = "route-day-btn";
    btn.textContent = dayInfo.date.slice(5).replace("-", "/");
    btn.addEventListener("click", () => {
      selectDay(index);
      dismissRouteDaysHint();
    });
    daysWrap.appendChild(btn);
  });

  // 最終日（帰国日）の隣に、飛行機が飛び立つ演出付きの「帰国」ボタンを追加する
  const lastIndex = routeMap.route.length - 1;
  const departBtn = document.createElement("button");
  departBtn.className = "route-depart-btn";
  departBtn.textContent = "帰国 ✈️";
  departBtn.addEventListener("click", () => {
    selectDay(lastIndex);
    dismissRouteDaysHint();
    marker.classList.remove("is-departing");
    void marker.offsetWidth; // アニメーションを毎回リスタートさせるためのリフロー
    marker.classList.add("is-departing");
    setTimeout(() => marker.classList.remove("is-departing"), 1700);
  });
  daysWrap.appendChild(departBtn);

  // 初期表示は1日目
  selectDay(0);
  maybeShowRouteDaysHint();
}

// 「日付ボタンを押すと地図が動く」ことに気づいてもらうための、初回限定ヒント
const ROUTE_HINT_STORAGE_KEY = "baliTour2026_routeHintSeen";
function maybeShowRouteDaysHint() {
  try {
    if (localStorage.getItem(ROUTE_HINT_STORAGE_KEY)) return;
  } catch (e) {}
  const hint = document.getElementById("route-days-hint");
  if (hint) hint.classList.remove("hidden");
}
function dismissRouteDaysHint() {
  const hint = document.getElementById("route-days-hint");
  if (hint) hint.classList.add("hidden");
  try { localStorage.setItem(ROUTE_HINT_STORAGE_KEY, "1"); } catch (e) {}
}

// --- Chapter 15: フォトギャラリー ---
let galleryData = [];
let lightboxIndex = 0;

function renderGallery(data) {
  galleryData = data.gallery;
  const grid = document.getElementById("gallery-grid");
  galleryData.forEach((photo, index) => {
    const item = el("div", "gallery-item reveal");
    item.appendChild(makeImg(photo.image, photo.caption));
    item.appendChild(el("div", "g-caption", photo.caption));
    item.addEventListener("click", () => openLightbox(index));
    grid.appendChild(item);
  });
}

// --- Chapter 16: バリの見どころ ---
function renderSpots(data) {
  const grid = document.getElementById("spots-grid");
  data.spots.forEach((spot) => {
    const card = el("div", "spot-card reveal");
    card.appendChild(makeImg(spot.image, spot.name));
    const body = el("div", "spot-body");
    body.appendChild(el("div", "spot-name", spot.name));
    body.appendChild(el("p", "spot-desc", spot.desc));
    card.appendChild(body);
    grid.appendChild(card);
  });
}

function openLightbox(index) {
  lightboxIndex = (index + galleryData.length) % galleryData.length;
  const photo = galleryData[lightboxIndex];
  const img = document.getElementById("lightbox-img");
  img.src = imagePath(photo.image);
  img.onerror = function () {
    img.onerror = null;
    img.src = placeholderDataUri(photo.image);
  };
  document.getElementById("lightbox-caption").textContent = photo.caption;
  document.getElementById("lightbox").classList.remove("hidden");
}

function closeLightbox() {
  document.getElementById("lightbox").classList.add("hidden");
}

// ページ内モーダルで外部コンテンツを表示（外部サイトへ移動せず、閉じれば必ず元の画面に戻れる）
function openContentModal(url, title) {
  const iframe = document.getElementById("map-modal-iframe");
  iframe.src = url;
  document.getElementById("map-modal-title").textContent = title;
  document.getElementById("map-modal").classList.remove("hidden");
}

function closeMapModal() {
  document.getElementById("map-modal").classList.add("hidden");
  document.getElementById("map-modal-iframe").src = ""; // 閉じたら読み込みを止める
}

// ホテルの地図モーダルを開く
function openMapModal(lat, lng, name) {
  openContentModal("https://www.google.com/maps?q=" + lat + "," + lng + "&z=15&output=embed", name);
}

// --- Chapter 16: FAQ ---
function renderFAQ(data) {
  const wrap = document.getElementById("faq-list");
  data.faq.forEach((item) => {
    const faqItem = el("div", "faq-item reveal");
    const question = el("button", "faq-q");
    question.innerHTML = "<span>" + item.q + "</span><span class='faq-arrow'>▾</span>";
    const answer = el("div", "faq-a", item.a);

    question.addEventListener("click", () => {
      faqItem.classList.toggle("is-open");
    });

    faqItem.appendChild(question);
    faqItem.appendChild(answer);
    wrap.appendChild(faqItem);
  });
}

// --- Chapter 19: レストラン紹介 ---
function renderRestaurants(data) {
  const grid = document.getElementById("restaurant-grid");
  data.restaurants.forEach((r) => {
    const card = el("div", "restaurant-card reveal");
    card.appendChild(makeImg(r.image, r.name));
    card.appendChild(el("div", "r-name", r.name));
    card.appendChild(el("div", "r-desc", r.desc));
    grid.appendChild(card);
  });
}

// --- Chapter 18: SATORU会 公式LINE案内 ---
function renderLineChapter(data) {
  const line = data.lineChapter;
  document.getElementById("line-feature-title").textContent = line.featureTitle;
  document.getElementById("line-feature-note").textContent = line.featureNote;
  const link = document.getElementById("line-feature-link");
  link.textContent = line.linkLabel;
  link.href = line.linkUrl;
  link.addEventListener("click", (event) => {
    event.preventDefault();
    openContentModal(line.linkUrl, line.featureTitle);
  });
}

// --- エンディング ---
function renderEnding(data) {
  document.getElementById("ending-producer").textContent = data.meta.producer;
  document.getElementById("ending-title").textContent = data.ending.title;
  document.getElementById("ending-message").textContent = data.ending.message;
  document.getElementById("ending-sub").textContent = data.ending.sub;
}

// すべてのチャプターのレンダリング処理をまとめて実行する
// "\n"で指定した位置に<br>を入れて改行する（改行位置を意図的にコントロールするため）
function renderMultilineText(container, text) {
  container.innerHTML = "";
  const lines = text.split("\n");
  lines.forEach((line, i) => {
    container.appendChild(document.createTextNode(line));
    if (i < lines.length - 1) container.appendChild(document.createElement("br"));
  });
}

// --- Chapter 1: 旅のテーマ ---
// テーマ・目的・効果を、他のチャプターと同じ通常のページとして表示する
function renderThemeMessage(data) {
  const p = data.prologue;
  const wrap = document.getElementById("theme-message-blocks");
  wrap.innerHTML = "";

  [
    [p.themeLabel, p.theme],
    [p.purposeLabel, p.purpose],
    [p.effectLabel, p.effect],
  ].forEach(([label, text]) => {
    const block = el("div", "theme-message-block");
    block.appendChild(el("p", "theme-message-label", label));
    const textEl = el("p", "theme-message-text");
    renderMultilineText(textEl, text);
    block.appendChild(textEl);
    wrap.appendChild(block);
  });
}

function renderAllChapters(data) {
  applyDataBindings(data);
  renderThemeMessage(data);
  renderWorldMap(data);
  renderBasicInfo(data);
  renderStory(data.religion.paragraphs, data.religion.keywords, "religion-text", "religion-keywords");
  renderStory(data.people.paragraphs, data.people.keywords, "people-text", "people-keywords");
  renderPhrases(data);
  renderCurrency(data);
  renderBargain(data);
  renderClothing(data);
  renderPacking(data);
  renderItinerary(data);
  renderHotels(data);
  renderGourmet(data);
  renderTrivia(data);
  renderBaliStory(data);
  renderRouteMap(data);
  renderGallery(data);
  renderSpots(data);
  renderFAQ(data);
  renderLineChapter(data);
  renderRestaurants(data);
  renderEnding(data);
  buildChapterMenu(data);
  addFavoriteStarsToChapterPages(data);
}

/* ============================================================
   7. スライドナビゲーション
   ============================================================ */

function setupRevealObserver(slideElement) {
  if (state.observedSlides.has(slideElement)) return;
  state.observedSlides.add(slideElement);

  const observer = new IntersectionObserver(
    (entries) => {
      entries.forEach((entry) => {
        if (entry.isIntersecting) {
          entry.target.classList.add("is-in");
          observer.unobserve(entry.target);
        }
      });
    },
    { root: slideElement.querySelector(".slide-scroll") || slideElement, threshold: 0.15 }
  );

  slideElement.querySelectorAll(".reveal").forEach((target) => observer.observe(target));
}

// Googleマップなど外部リンクへ移動した後に戻ってきても、見ていた
// チャプターに復帰できるようにする。sessionStorageだと「別タブ・別アプリ
// として開き直した」場合に引き継がれないことがあるため、localStorageに
// 保存し、あわせて保存時刻も記録する。ただし、この復帰は「数時間以内に
// 戻ってきた場合」だけに限定し、数日後などにあらためて開いたときは
// オープニング演出から見られるようにする。
const RESUME_STORAGE_KEY = "baliTour2026_resumeState";
const RESUME_VALID_MS = 6 * 60 * 60 * 1000; // 6時間

function saveResumeState(index) {
  localStorage.setItem(RESUME_STORAGE_KEY, JSON.stringify({ index, savedAt: Date.now() }));
}

function loadResumeState() {
  try {
    const raw = localStorage.getItem(RESUME_STORAGE_KEY);
    if (!raw) return null;
    const { index, savedAt } = JSON.parse(raw);
    if (Date.now() - savedAt > RESUME_VALID_MS) return null;
    return index;
  } catch (e) {
    return null;
  }
}

function clearResumeState() {
  localStorage.removeItem(RESUME_STORAGE_KEY);
}

function updateTopbar(index) {
  const label = document.getElementById("current-chapter-label");
  const chapters = state.data.chapters;
  if (index < chapters.length) {
    const ch = chapters[index];
    label.textContent = "Chapter " + String(ch.number).padStart(2, "0") + " / " + chapters.length + "　" + ch.title;
  } else {
    label.textContent = "エンディング";
  }
  document.getElementById("progress-fill").style.width = ((index + 1) / state.totalSlides) * 100 + "%";

  document.querySelectorAll(".chapter-menu-item").forEach((item, i) => {
    item.classList.toggle("is-current", i === index);
  });
}

// 「今日の予定」ショートカット：旅程チャプターへ移動し、今日の日付のカードまでスクロールする
function goToTodaySchedule() {
  const chapters = state.data.chapters;
  const idx = chapters.findIndex((c) => c.id === "itinerary");
  if (idx === -1) return;
  goToSlide(idx);
  setTimeout(() => {
    const todayItem = document.querySelector(".timeline-item.is-today");
    if (todayItem) todayItem.scrollIntoView({ behavior: "smooth", block: "start" });
  }, 350);
}

function goToSlide(index, options) {
  options = options || {};
  const slides = document.querySelectorAll(".slide");
  const clamped = Math.max(0, Math.min(index, slides.length - 1));

  slides.forEach((slide, i) => {
    slide.classList.remove("is-active", "is-prev");
    if (i === clamped) slide.classList.add("is-active");
    else if (i < clamped) slide.classList.add("is-prev");
  });

  state.currentIndex = clamped;
  updateTopbar(clamped);

  const activeSlide = slides[clamped];
  const activeScrollEl = activeSlide.querySelector(".slide-scroll");
  activeScrollEl.scrollTop = 0;
  setupRevealObserver(activeSlide);

  // 最初に見える範囲の演出はすぐに再生する
  requestAnimationFrame(() => {
    activeSlide.querySelectorAll(".reveal").forEach((target, i) => {
      const rect = target.getBoundingClientRect();
      if (rect.top < window.innerHeight) target.classList.add("is-in");
    });
  });

  // チャプター特有の演出フック
  if (activeSlide.dataset.type === "bargain") playBargainReveal();

  saveResumeState(clamped);
}

// お気に入りチャプターは、サーバーには送らずこの端末のブラウザだけに保存する
const FAVORITES_STORAGE_KEY = "baliTour2026_favorites";
function loadFavorites() {
  try {
    return JSON.parse(localStorage.getItem(FAVORITES_STORAGE_KEY)) || [];
  } catch (e) {
    return [];
  }
}
function saveFavorites(list) {
  try { localStorage.setItem(FAVORITES_STORAGE_KEY, JSON.stringify(list)); } catch (e) {}
}
let showFavoritesOnly = false;

// お気に入り☆ボタンを1つ作る共通関数（メニュー一覧・各チャプターページの両方で使う）
function createFavoriteStarButton(chapterId, extraClass) {
  const favorites = loadFavorites();
  const starButton = el("button", "favorite-star-btn " + (extraClass || ""));
  starButton.type = "button";
  starButton.title = "お気に入りに登録";
  starButton.dataset.chapterId = chapterId;
  const isFav = favorites.indexOf(chapterId) !== -1;
  starButton.textContent = isFav ? "★" : "☆";
  starButton.classList.toggle("is-favorite", isFav);
  starButton.addEventListener("click", (event) => {
    event.stopPropagation();
    toggleFavorite(chapterId);
  });
  return starButton;
}

function buildChapterMenu(data) {
  const grid = document.getElementById("chapter-menu-grid");

  data.chapters.forEach((chapter) => {
    const item = el("div", "chapter-menu-item");
    item.dataset.chapterId = chapter.id;

    const navButton = el("button", "chapter-menu-item-nav");
    navButton.innerHTML =
      "<span class='m-num'>Chapter " + String(chapter.number).padStart(2, "0") + "</span>" +
      "<span class='m-title'>" + chapter.title + "</span>";
    navButton.addEventListener("click", () => {
      goToSlide(chapter.number - 1);
      closeChapterMenu();
    });

    const starButton = createFavoriteStarButton(chapter.id, "chapter-menu-item-star");

    item.appendChild(navButton);
    item.appendChild(starButton);
    grid.appendChild(item);
  });

  applyFavoritesFilter();

  document.getElementById("btn-favorites-toggle").addEventListener("click", () => {
    showFavoritesOnly = !showFavoritesOnly;
    document.getElementById("btn-favorites-toggle").classList.toggle("is-active", showFavoritesOnly);
    applyFavoritesFilter();
  });
}

// 各チャプターページ自体にも、タイトルの近くにお気に入り☆を設置する
function addFavoriteStarsToChapterPages(data) {
  data.chapters.forEach((chapter) => {
    const slide = document.getElementById("slide-" + chapter.number);
    const inner = slide && slide.querySelector(".slide-inner");
    if (!inner) return;
    const starButton = createFavoriteStarButton(chapter.id, "chapter-page-star");
    inner.appendChild(starButton);
  });
}

function toggleFavorite(chapterId) {
  const favorites = loadFavorites();
  const index = favorites.indexOf(chapterId);
  const nowFavorite = index === -1;
  if (nowFavorite) {
    favorites.push(chapterId);
  } else {
    favorites.splice(index, 1);
  }
  saveFavorites(favorites);

  // メニュー一覧・チャプターページ、どちらの☆ボタンも同時に見た目を更新する
  document.querySelectorAll('.favorite-star-btn[data-chapter-id="' + chapterId + '"]').forEach((btn) => {
    btn.textContent = nowFavorite ? "★" : "☆";
    btn.classList.toggle("is-favorite", nowFavorite);
  });
  applyFavoritesFilter();
}

// 「お気に入りだけ表示」がONのときは、お気に入りにしたチャプターだけを一覧に残す
function applyFavoritesFilter() {
  const favorites = loadFavorites();
  const items = document.querySelectorAll(".chapter-menu-item");
  let visibleCount = 0;
  items.forEach((item) => {
    const isFav = favorites.indexOf(item.dataset.chapterId) !== -1;
    const shouldShow = !showFavoritesOnly || isFav;
    item.classList.toggle("hidden", !shouldShow);
    if (shouldShow) visibleCount++;
  });
  document.getElementById("chapter-menu-empty").classList.toggle("hidden", !(showFavoritesOnly && visibleCount === 0));
}

function openChapterMenu() {
  document.getElementById("chapter-menu-overlay").classList.remove("hidden");
}
function closeChapterMenu() {
  document.getElementById("chapter-menu-overlay").classList.add("hidden");
}

/* ============================================================
   8. BGM・効果音・フルスクリーン・自動再生
   ============================================================ */

// スマホ(特にiOS Safari)は、ユーザーの操作(タップ)の中で直接play()した<audio>要素だけを
// 「これは鳴らしてよいもの」として覚えており、それ以外は後から鳴らそうとしてもブロックする。
// 最初のタップの中で全ての<audio>要素を一瞬だけ(無音で)再生しておくことで、後から
// (数秒後や自動再生で)鳴らそうとしても、ブロックされずに鳴るようになる。
function unlockAudioElements() {
  document.querySelectorAll("audio").forEach((el) => {
    const originalVolume = el.volume;
    el.volume = 0;
    const finish = () => {
      el.pause();
      el.currentTime = 0;
      el.volume = originalVolume;
    };
    const playPromise = el.play();
    if (playPromise && playPromise.then) {
      playPromise.then(finish).catch(() => { el.volume = originalVolume; });
    } else {
      finish();
    }
  });
}

// オープニングで飛行機が飛び立つ瞬間に鳴らす効果音
// スマホ(特にiOS Safari)は「操作(タップ)から間を置いて呼び出したplay()」を
// ブロックすることがある。オープニング演出は最初のクリックから数秒後に効果音を
// 鳴らすため、ブロックされた場合は次のタップ/クリックで鳴らし直す（BGMと同じ仕組み）。
// 戻り値は、この「次のタップで鳴らし直す」予約を取り消すための関数
// （場面が切り替わった後に、無関係なタイミングで突然鳴り出すのを防ぐため）。
function playSfxWithUnlockRetry(sfx, volume) {
  sfx.currentTime = 0;
  sfx.volume = volume;
  let cancelRetry = () => {};
  const playPromise = sfx.play();
  if (playPromise && playPromise.catch) {
    playPromise.catch(() => {
      const retry = () => {
        sfx.currentTime = 0;
        sfx.play().catch(() => {});
        cancelRetry();
      };
      document.addEventListener("click", retry, { once: true });
      document.addEventListener("touchstart", retry, { once: true });
      cancelRetry = () => {
        document.removeEventListener("click", retry);
        document.removeEventListener("touchstart", retry);
      };
    });
  }
  return () => cancelRetry();
}

// 効果音をフェードアウトさせながら止める関数を作る（要素ごとに専用のタイマーを持たせるため、
// 呼び出すたびに新しい関数を作らず、下でsfx-plane用・sfx-flying用を1つずつ用意して使い回す）
function makeSfxFader(elId) {
  let fadeTimer = null;
  function cancelFade() {
    if (fadeTimer) { clearInterval(fadeTimer); fadeTimer = null; }
  }
  function fadeOut(fadeMs) {
    const sfx = document.getElementById(elId);
    cancelFade();
    if (sfx.paused) return;
    const startVolume = sfx.volume;
    const stepMs = 50;
    let elapsed = 0;
    fadeTimer = setInterval(() => {
      elapsed += stepMs;
      const ratio = Math.max(0, 1 - elapsed / fadeMs);
      sfx.volume = startVolume * ratio;
      if (ratio <= 0) {
        clearInterval(fadeTimer);
        fadeTimer = null;
        sfx.pause();
        sfx.currentTime = 0;
        sfx.volume = startVolume;
      }
    }, stepMs);
  }
  return { fadeOut, cancelFade };
}
const planeSfxFader = makeSfxFader("sfx-plane");
const flyingSfxFader = makeSfxFader("sfx-flying");
let cancelPlaneSfxRetry = () => {};
let cancelFlyingSfxRetry = () => {};

function playTakeoffSfx() {
  planeSfxFader.cancelFade();
  cancelPlaneSfxRetry = playSfxWithUnlockRetry(document.getElementById("sfx-plane"), 0.56);
}

// 飛行機が画面を飛んでいる間、ずっと流れる「飛行音」
function playFlyingSfx() {
  flyingSfxFader.cancelFade();
  cancelFlyingSfxRetry = playSfxWithUnlockRetry(document.getElementById("sfx-flying"), 0.48);
}

// 離陸音・飛行音のどちらも、ふっと消えるようにフェードアウトさせて止める。
// 「次のタップで鳴らし直す」という保留中の予約があれば、それも一緒に取り消す
// （そうしないと、飛行機の場面が終わった後の無関係な画面で急に鳴り出してしまう）。
function stopFlyingSfx() {
  cancelPlaneSfxRetry();
  cancelFlyingSfxRetry();
  planeSfxFader.fadeOut(700);
  flyingSfxFader.fadeOut(700);
}

const BGM_TRACK_STORAGE_KEY = "baliTour2026_bgmTrack";

function getBgmTracks() {
  return (state.data && state.data.bgmTracks) || [];
}
function getBgmTrackById(id) {
  return getBgmTracks().find((t) => t.id === id);
}
function loadSavedBgmTrackId() {
  try { return localStorage.getItem(BGM_TRACK_STORAGE_KEY); } catch (e) { return null; }
}
function saveBgmTrackId(id) {
  try { localStorage.setItem(BGM_TRACK_STORAGE_KEY, id); } catch (e) {}
}

// 全ての音声要素をいったん停止してから、選択中の曲のファイルだけを再生する
function playBgmTracks() {
  const track = getBgmTrackById(state.bgmTrackId) || getBgmTracks()[0];
  document.querySelectorAll("audio[data-track-file]").forEach((el) => el.pause());
  if (!track) return Promise.resolve([]);

  const results = track.files.map((file) => {
    const el = document.querySelector('audio[data-track-file="' + file.src + '"]');
    if (!el) return Promise.resolve();
    el.volume = file.volume;
    return el.play();
  });
  return Promise.allSettled(results);
}

function pauseBgmTracks() {
  document.querySelectorAll("audio[data-track-file]").forEach((el) => el.pause());
}

// BGMボタンの見た目(アイコン＋ON/OFFがひと目でわかる背景色)を状態に合わせて更新する
function updateBgmButton() {
  const btn = document.getElementById("btn-bgm");
  btn.textContent = "🎵";
  btn.classList.toggle("is-on", state.bgmOn);
  btn.classList.toggle("is-off", !state.bgmOn);
  btn.title = state.bgmOn ? "BGM 再生中（タップで曲を選ぶ）" : "BGM OFF（タップで曲を選ぶ）";

  const onoffBtn = document.getElementById("bgm-menu-onoff");
  onoffBtn.textContent = state.bgmOn ? "🎵 BGM再生中（タップでOFF）" : "🎵 BGM OFF（タップでON）";
  onoffBtn.classList.toggle("is-on", state.bgmOn);

  document.querySelectorAll(".bgm-track-item").forEach((item) => {
    item.classList.toggle("is-selected", item.dataset.trackId === state.bgmTrackId);
  });
}

// 曲一覧をBGMメニューに描画する（tour-data.json の bgmTracks から自動生成）
function renderBgmMenu(data) {
  const list = document.getElementById("bgm-track-list");
  (data.bgmTracks || []).forEach((track) => {
    const item = el("button", "bgm-track-item");
    item.dataset.trackId = track.id;
    item.textContent = track.label;
    item.addEventListener("click", () => selectBgmTrack(track.id));
    list.appendChild(item);
  });
}

// 曲を切り替える。選ぶと自然にBGMもONになる。
function selectBgmTrack(trackId) {
  state.bgmTrackId = trackId;
  saveBgmTrackId(trackId);
  state.bgmOn = true;
  playBgmTracks();
  updateBgmButton();
}

function openBgmMenu(anchorId) {
  const menu = document.getElementById("bgm-menu");
  const anchor = document.getElementById(anchorId || "btn-bgm");
  const rect = anchor.getBoundingClientRect();
  menu.style.bottom = "auto";
  menu.classList.remove("hidden"); // サイズを測るため、位置を決める前にいったん表示する
  const menuWidth = menu.offsetWidth;
  const menuHeight = menu.offsetHeight;
  // 画面左側にあるボタン（例：BGM変更ショートカット）から開く場合、
  // アンカーの右端基準のままだとメニューが画面左にはみ出すのでクランプする
  let right = window.innerWidth - rect.right;
  right = Math.max(8, Math.min(right, window.innerWidth - menuWidth - 8));
  menu.style.right = right + "px";
  // 画面下半分にあるボタンから開く場合は、メニューが画面からはみ出さないよう上向きに開く
  let top = rect.top > window.innerHeight / 2
    ? rect.top - menuHeight - 10
    : rect.bottom + 10;
  top = Math.max(8, Math.min(top, window.innerHeight - menuHeight - 8));
  menu.style.top = top + "px";
}
function closeBgmMenu() {
  document.getElementById("bgm-menu").classList.add("hidden");
}
function toggleBgmMenu(anchorId) {
  const isHidden = document.getElementById("bgm-menu").classList.contains("hidden");
  if (isHidden) openBgmMenu(anchorId);
  else closeBgmMenu();
}

// 「BGMを選べます」ヒント：初めて訪れた人だけに、一度だけそっと知らせる
const BGM_HINT_STORAGE_KEY = "baliTour2026_bgmHintSeen";
function maybeShowBgmHint() {
  try {
    if (localStorage.getItem(BGM_HINT_STORAGE_KEY)) return;
  } catch (e) {}

  const hint = document.getElementById("bgm-hint");
  const rect = document.getElementById("btn-bgm").getBoundingClientRect();
  hint.style.top = rect.bottom + 12 + "px";
  hint.style.right = window.innerWidth - rect.right + "px";
  hint.classList.remove("hidden");

  const dismiss = () => {
    hint.classList.remove("is-visible");
    setTimeout(() => hint.classList.add("hidden"), 400);
    try { localStorage.setItem(BGM_HINT_STORAGE_KEY, "1"); } catch (e) {}
    hint.removeEventListener("click", dismiss);
  };

  requestAnimationFrame(() => hint.classList.add("is-visible"));
  hint.addEventListener("click", dismiss);
  setTimeout(dismiss, 5000);
}

// タイトルロゴが表示された瞬間に、BGMの自動再生を試みる。
// ブラウザの自動再生制限でブロックされた場合は、最初のタップ/クリックで
// 再生を再試行する（無音のまま固まらないようにするための保険）。
function startBgmAutoplay() {
  state.bgmOn = true;
  updateBgmButton();

  playBgmTracks().then((results) => {
    const blocked = results.some((r) => r.status === "rejected");
    if (blocked && state.bgmOn) {
      const retry = () => {
        if (state.bgmOn) playBgmTracks();
        document.removeEventListener("click", retry);
        document.removeEventListener("touchstart", retry);
      };
      document.addEventListener("click", retry, { once: true });
      document.addEventListener("touchstart", retry, { once: true });
    }
  });
}

function toggleBgm() {
  state.bgmOn = !state.bgmOn;

  if (state.bgmOn) {
    playBgmTracks();
  } else {
    pauseBgmTracks();
  }
  updateBgmButton();
}

function toggleAutoplay() {
  state.autoplay = !state.autoplay;
  const btn = document.getElementById("btn-autoplay");
  btn.textContent = state.autoplay ? "⏸️" : "▶️";

  if (state.autoplay) {
    state.autoplayTimer = setInterval(() => {
      const next = state.currentIndex + 1 < state.totalSlides ? state.currentIndex + 1 : 0;
      goToSlide(next);
    }, 15000); // 15秒ごとに自動でページ送り
  } else {
    clearInterval(state.autoplayTimer);
  }
}

function toggleFullscreen() {
  if (!document.fullscreenElement) {
    document.documentElement.requestFullscreen().catch(() => {});
  } else {
    document.exitFullscreen().catch(() => {});
  }
}

/* ============================================================
   9. 初期化
   ============================================================ */

// 「ホーム」= チャプター1に戻るのではなく、オープニング演出
// （宇宙から地球を見てみましょう）を最初からもう一度見せる
function goHome() {
  clearInterval(state.autoplayTimer);
  state.autoplay = false;
  document.getElementById("btn-autoplay").textContent = "▶️";

  clearResumeState();
  document.getElementById("app").classList.add("app-hidden");
  const openingScreen = document.getElementById("opening-screen");
  openingScreen.classList.remove("is-hidden");
  resetOpeningVisuals();
  state.openingSkipped = false;
  runOpeningSequence(state.data);
}

function setupNavigationEvents() {
  document.getElementById("btn-next").addEventListener("click", () => goToSlide(state.currentIndex + 1));
  document.getElementById("btn-prev").addEventListener("click", () => goToSlide(state.currentIndex - 1));
  document.getElementById("btn-home").addEventListener("click", goHome);
  document.getElementById("btn-home-2").addEventListener("click", goHome);
  document.getElementById("btn-menu").addEventListener("click", openChapterMenu);
  document.getElementById("btn-close-menu").addEventListener("click", closeChapterMenu);
  document.getElementById("btn-bgm").addEventListener("click", () => toggleBgmMenu("btn-bgm"));
  document.getElementById("btn-bgm-shortcut").addEventListener("click", () => toggleBgmMenu("btn-bgm-shortcut"));
  document.getElementById("bgm-menu-onoff").addEventListener("click", toggleBgm);
  document.getElementById("btn-autoplay").addEventListener("click", toggleAutoplay);
  document.getElementById("btn-fullscreen").addEventListener("click", toggleFullscreen);
  document.getElementById("btn-today-schedule").addEventListener("click", goToTodaySchedule);
  document.getElementById("btn-lucky-opa-itinerary").addEventListener("click", (event) => {
    const line = state.data.lineChapter;
    const btn = event.currentTarget;
    const overlay = document.getElementById("rainbow-overlay");
    overlay.classList.remove("is-active");
    btn.classList.remove("is-glowing");
    void overlay.offsetWidth; // アニメーションを毎回リスタートさせるためのリフロー
    overlay.classList.add("is-active");
    btn.classList.add("is-glowing");
    setTimeout(() => openContentModal(line.linkUrl, line.featureTitle), 450);
  });
  document.getElementById("btn-weather-shortcut").addEventListener("click", () => {
    document.getElementById("weather-popup").classList.remove("hidden");
  });
  document.getElementById("btn-close-weather").addEventListener("click", () => {
    document.getElementById("weather-popup").classList.add("hidden");
  });
  document.getElementById("weather-popup").addEventListener("click", (event) => {
    if (event.target.id === "weather-popup") document.getElementById("weather-popup").classList.add("hidden");
  });
  document.getElementById("btn-close-checklist-complete").addEventListener("click", closeChecklistCompletePopup);
  document.getElementById("checklist-complete-popup").addEventListener("click", (event) => {
    if (event.target.id === "checklist-complete-popup") closeChecklistCompletePopup();
  });


  document.getElementById("btn-close-lightbox").addEventListener("click", closeLightbox);
  document.getElementById("btn-lightbox-prev").addEventListener("click", () => openLightbox(lightboxIndex - 1));
  document.getElementById("btn-lightbox-next").addEventListener("click", () => openLightbox(lightboxIndex + 1));

  document.getElementById("btn-close-map").addEventListener("click", closeMapModal);
  document.getElementById("btn-map-back").addEventListener("click", closeMapModal);

  document.getElementById("btn-replay").addEventListener("click", goHome);

  // キーボード操作（← → で送り、Escで閉じる）
  document.addEventListener("keydown", (event) => {
    const menuOpen = !document.getElementById("chapter-menu-overlay").classList.contains("hidden");
    const lightboxOpen = !document.getElementById("lightbox").classList.contains("hidden");
    const mapOpen = !document.getElementById("map-modal").classList.contains("hidden");
    const bgmMenuOpen = !document.getElementById("bgm-menu").classList.contains("hidden");
    const weatherOpen = !document.getElementById("weather-popup").classList.contains("hidden");

    if (event.key === "Escape") {
      if (mapOpen) closeMapModal();
      else if (lightboxOpen) closeLightbox();
      else if (menuOpen) closeChapterMenu();
      else if (bgmMenuOpen) closeBgmMenu();
      else if (weatherOpen) document.getElementById("weather-popup").classList.add("hidden");
      return;
    }
    if (menuOpen || lightboxOpen || mapOpen || bgmMenuOpen || weatherOpen) return;
    if (!document.getElementById("app").classList.contains("app-hidden")) {
      if (event.key === "ArrowRight") goToSlide(state.currentIndex + 1);
      if (event.key === "ArrowLeft") goToSlide(state.currentIndex - 1);
    }
  });

  // オーバーレイの背景クリックで閉じる
  document.getElementById("chapter-menu-overlay").addEventListener("click", (event) => {
    if (event.target.id === "chapter-menu-overlay") closeChapterMenu();
  });
  document.getElementById("lightbox").addEventListener("click", (event) => {
    if (event.target.id === "lightbox") closeLightbox();
  });
  document.getElementById("map-modal").addEventListener("click", (event) => {
    if (event.target.id === "map-modal") closeMapModal();
  });

  // BGMメニューの外側をクリック/タップしたら閉じる
  document.addEventListener("click", (event) => {
    const bgmControl = document.querySelector(".bgm-control");
    const bgmShortcut = document.getElementById("btn-bgm-shortcut");
    const inControl = bgmControl && bgmControl.contains(event.target);
    const inShortcut = bgmShortcut && bgmShortcut.contains(event.target);
    if (!inControl && !inShortcut) closeBgmMenu();
  });
}

function resetOpeningVisuals() {
  stopFlyingSfx();
  openingEls.earthScene.classList.remove("is-fading");
  openingEls.japanGlow.classList.remove("is-lit");
  openingEls.baliGlow.classList.remove("is-lit");
  openingEls.routePath.classList.remove("is-drawn");
  openingEls.flightScene.classList.remove("is-visible");
  openingEls.flightPath.classList.remove("is-drawn");
  openingEls.planeIcon.classList.remove("is-flying");
  openingEls.dots.forEach((dot) => dot.classList.remove("is-visible"));
  openingEls.labels.forEach((label) => label.classList.remove("is-visible"));
  openingEls.arrival.classList.add("hidden");
  openingEls.shootingStars.classList.remove("is-active");
  openingEls.title.classList.add("hidden");
  openingEls.captionWrap.classList.remove("hidden");
}

function setupOpeningEntry() {
  document.getElementById("btn-start-experience").addEventListener("click", enterMainApp);
}

// topbar・shortcut-barの実際の高さをCSS変数に反映する。
// ここをpx手打ちにすると、フォント表示や折り返しのわずかな違いで
// ずれてチャプター下部が見えなくなるため、必ず実測値を使う。
function updateHeaderHeightVars() {
  const topbar = document.querySelector(".topbar");
  const shortcutBar = document.querySelector(".shortcut-bar");
  const topbarH = topbar ? topbar.offsetHeight : 0;
  const shortcutBarH = shortcutBar ? shortcutBar.offsetHeight : 0;
  const topbarPx = topbarH + "px";
  const headerPx = (topbarH + shortcutBarH) + "px";
  const root = document.documentElement;
  // 値が変わっていない場合は setProperty 自体を呼ばない。
  // iOSのアドレスバーの表示/非表示に伴って resize イベントが連続発火するが、
  // そのたびに :root のカスタムプロパティを書き換えるとスタイル再計算が起き、
  // スクロール中のチャプター内スクロール位置が先頭に巻き戻る不具合の原因になっていた。
  if (root.style.getPropertyValue("--topbar-h") === topbarPx && root.style.getPropertyValue("--header-h") === headerPx) {
    return;
  }
  root.style.setProperty("--topbar-h", topbarPx);
  root.style.setProperty("--header-h", headerPx);
}

let headerResizeDebounceId = null;
function scheduleHeaderHeightUpdate() {
  // resize を即時処理せず少し待つことで、アドレスバーの表示/非表示アニメーション中に
  // 何度も強制レイアウトが走るのを防ぐ(iOS Safariのスクロール巻き戻り対策)。
  if (headerResizeDebounceId) clearTimeout(headerResizeDebounceId);
  headerResizeDebounceId = setTimeout(updateHeaderHeightVars, 200);
}

async function init() {
  initStarfield();
  cacheOpeningEls();

  const data = await loadTourData();
  if (!data) return; // エラーメッセージはローディング画面にすでに表示済み

  state.data = data;
  state.totalSlides = data.chapters.length + 1; // 全チャプター + エンディング
  const savedTrackId = loadSavedBgmTrackId();
  state.bgmTrackId = (savedTrackId && getBgmTrackById(savedTrackId) && savedTrackId) || data.defaultBgmTrackId;

  renderAllChapters(data);
  renderBgmMenu(data);
  updateBgmButton();
  initLiveClocks();
  fetchBaliWeather();
  setInterval(fetchBaliWeather, 15 * 60 * 1000); // 15分ごとに天気情報を更新し、リアルタイムに保つ
  setupNavigationEvents();
  setupOpeningEntry();

  // Googleマップなど外部リンクから戻ってきた場合に、最初のページへ
  // 戻ってしまわないよう、同じタブ内なら見ていたチャプターを復元する
  const resumeIndex = loadResumeState();
  if (resumeIndex !== null) {
    document.getElementById("opening-screen").classList.add("is-hidden");
    document.getElementById("app").classList.remove("app-hidden");
    state.appEntered = true;
    updateHeaderHeightVars();
    goToSlide(resumeIndex, { instant: true });
    startBgmAutoplay();
    setTimeout(maybeShowBgmHint, 1200);
    setTimeout(updateHeaderHeightVars, 400);
  } else {
    // 最初の一回だけ、演出前にタップしてもらう（このタップを合図にBGM・効果音を
    // 鳴らし始めることで、スマホでも演出と音のタイミングがずれないようにする）
    document.getElementById("btn-tap-gate").addEventListener("click", () => {
      // CSSクラスの切り替えだけだと、何らかの理由で残ってしまった場合に
      // 画面全体を覆う透明レイヤーとしてタップを吸い取ってしまう恐れがあるため、
      // DOMから完全に取り除いて二度と邪魔をしないようにする。
      openingEls.tapGate.remove();
      try { unlockAudioElements(); } catch (e) {} // このタップの中で全ての音声を一度「解錠」しておく
      runOpeningSequence(data);
    }, { once: true });
  }

  window.addEventListener("resize", scheduleHeaderHeightUpdate);
}

document.addEventListener("DOMContentLoaded", init);

// iOSでは html/body に overflow:hidden を指定していても、指でのスクロールが
// 中の要素の端(一番上・一番下)まで届いた瞬間、外側のページ全体へスクロールが
// 「連鎖」してラバーバンド(ゴムのように弾む)動きをしてしまうことがある。
// これがスクロール位置の巻き戻りに見えていた可能性が高いため、
// タッチしている場所がスクロール可能な要素の中でない場合は
// ページそのものが動かないようにする(CSSのoverscroll-behaviorだけでは
// 効かない古いWebKitのための保険)。
function isInsideScrollableElement(target) {
  let el = target;
  while (el && el !== document.body && el.nodeType === 1) {
    const style = window.getComputedStyle(el);
    const canScrollY = (style.overflowY === "auto" || style.overflowY === "scroll");
    if (canScrollY && el.scrollHeight > el.clientHeight) return true;
    el = el.parentElement;
  }
  return false;
}
document.addEventListener("touchmove", (event) => {
  if (!isInsideScrollableElement(event.target)) event.preventDefault();
}, { passive: false });

// スマホ(特にiOS Safari)の「戻る」操作等で、ページがゼロから読み込み直されず、
// 以前の画面状態のスナップショットがそのまま復元される(bfcache)ことがある。
// これだとオープニング演出の途中の状態が壊れて見えることがあるため、
// 復元された場合は必ず最初から読み込み直す。
window.addEventListener("pageshow", (event) => {
  if (event.persisted) location.reload();
});
