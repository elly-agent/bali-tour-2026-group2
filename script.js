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
  await sleep(2000);
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

function renderSeaPlayTips(data) {
  const tips = data.seaPlayTips;
  const imageWrap = document.getElementById("sea-play-tips-image");
  imageWrap.appendChild(makeImg(tips.image, "海で遊ぶ様子"));

  const list = document.getElementById("sea-tips-list");
  tips.items.forEach((item) => {
    const card = el("div", "sea-tip-item reveal");
    card.innerHTML =
      "<span class='sea-tip-item-title'>" + item.title + "</span>" +
      "<span class='sea-tip-item-text'>" + item.text + "</span>";
    list.appendChild(card);
  });

  const creditLink = document.getElementById("marine-sports-credit-link");
  if (creditLink && tips.creditUrl) creditLink.href = tips.creditUrl;
}

/* ============================================================
   Chapter 22: バリ旅グラム（グルメ投稿タイムライン）
   ------------------------------------------------------------
   投稿・写真はCloudflare Workers上のAPI（/api/gourmet/...）を経由して
   R2（写真）とD1（投稿データ）に保存される。ログイン機能はなく、
   「誰の投稿か」は端末ごとに保存したdevice_idだけで緩く判定している
   （身内・友人限定の旅行という前提で、簡易な仕組みにしている）。
   ============================================================ */
const GG_API_BASE = "/api/gourmet";
const GG_DEVICE_ID_KEY = "baliTour2026_gg_deviceId";
const GG_NAME_KEY = "baliTour2026_gg_name";
const GG_COACH_PHOTO_KEY = "baliTour2026_gg_coachPhotoSeen";
const GG_COACH_MENU_KEY = "baliTour2026_gg_coachMenuSeen";
const GG_POLL_INTERVAL_MS = 45000;

const ggState = {
  moodMap: {},
  tagMap: {},
  selectedMood: null,
  selectedTag: null,
  posts: [],
  editingPostId: null,
  photoBaseCanvas: null,
  photoPreviewCanvas: null,
};

function ggDeviceId() {
  let id = localStorage.getItem(GG_DEVICE_ID_KEY);
  if (!id) {
    id = (window.crypto && crypto.randomUUID) ? crypto.randomUUID() : ("dev-" + Date.now() + "-" + Math.random().toString(16).slice(2));
    localStorage.setItem(GG_DEVICE_ID_KEY, id);
  }
  return id;
}

function ggEscapeHtml(text) {
  const div = document.createElement("div");
  div.textContent = text == null ? "" : text;
  return div.innerHTML;
}

function initGourmetGram(data) {
  const gg = data.gourmetGram;
  gg.moods.forEach((m) => { ggState.moodMap[m.id] = m; });
  gg.tags.forEach((t) => { ggState.tagMap[t.id] = t; });

  const nameInput = document.getElementById("gg-name-input");
  const savedName = localStorage.getItem(GG_NAME_KEY);
  if (savedName) nameInput.value = savedName;
  nameInput.addEventListener("input", () => localStorage.setItem(GG_NAME_KEY, nameInput.value.trim()));

  const moodRow = document.getElementById("gg-mood-row");
  gg.moods.forEach((mood) => {
    const btn = el("button", "gg-mood-chip");
    btn.type = "button";
    btn.dataset.moodId = mood.id;
    btn.innerHTML = "<span class='gg-mood-chip-emoji'>" + mood.emoji + "</span><span class='gg-mood-chip-label'>" + mood.label + "</span>";
    btn.addEventListener("click", () => ggSelectMood(mood.id));
    moodRow.appendChild(btn);
  });
  ggSelectMood(gg.moods[0].id);

  const tagRow = document.getElementById("gg-tag-row");
  gg.tags.forEach((tag, i) => {
    const btn = el("button", "gg-tag-chip");
    btn.type = "button";
    btn.dataset.tagId = tag.id;
    btn.textContent = tag.emoji + " " + tag.label;
    btn.addEventListener("click", () => ggSelectTag(tag.id));
    tagRow.appendChild(btn);
  });
  const defaultTag = gg.tags.find((t) => t.id === "before") || gg.tags[0];
  ggSelectTag(defaultTag.id);

  if (localStorage.getItem(GG_COACH_PHOTO_KEY)) {
    document.getElementById("gg-photo-coach-bubble").classList.add("hidden");
    document.getElementById("gg-photo-coach-finger").classList.add("hidden");
  }

  document.getElementById("gg-photo-input").addEventListener("change", ggHandlePhotoSelected);
  document.getElementById("gg-brightness-slider").addEventListener("input", ggUpdateBrightnessPreview);
  document.getElementById("gg-brightness-slider").addEventListener("change", ggUpdateBrightnessPreview);
  document.getElementById("gg-brightness-skip").addEventListener("click", ggConfirmBrightness);
  document.getElementById("gg-brightness-apply").addEventListener("click", ggConfirmBrightness);
  document.getElementById("gg-submit-btn").addEventListener("click", ggSubmitPost);
  document.getElementById("gg-cancel-edit-btn").addEventListener("click", ggCancelEdit);
  document.getElementById("gg-save-mine-btn").addEventListener("click", () => ggSavePdf("mine"));
  document.getElementById("gg-save-all-btn").addEventListener("click", () => ggSavePdf("all"));

  ggFetchTimeline();
  setInterval(() => { if (!document.hidden) ggFetchTimeline(); }, GG_POLL_INTERVAL_MS);
  document.addEventListener("visibilitychange", () => { if (!document.hidden) ggFetchTimeline(); });
}

function ggSelectMood(moodId) {
  ggState.selectedMood = moodId;
  document.querySelectorAll(".gg-mood-chip").forEach((btn) => {
    btn.classList.toggle("is-active", btn.dataset.moodId === moodId);
  });
}

function ggSelectTag(tagId) {
  ggState.selectedTag = tagId;
  document.querySelectorAll(".gg-tag-chip").forEach((btn) => {
    btn.classList.toggle("is-active", btn.dataset.tagId === tagId);
  });
}

// EXIFの向きを含めて正しい向きで読み込む（未対応ブラウザでもフォールバックして動作は続く）
async function ggLoadOrientedBitmap(file) {
  if (window.createImageBitmap) {
    try {
      return await createImageBitmap(file, { imageOrientation: "from-image" });
    } catch (e) { /* 次のフォールバックへ */ }
  }
  return await new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = reject;
    img.src = URL.createObjectURL(file);
  });
}

function ggDrawResizedCanvas(source, maxDim) {
  const w = source.width || source.naturalWidth;
  const h = source.height || source.naturalHeight;
  const scale = Math.min(1, maxDim / Math.max(w, h));
  const canvas = document.createElement("canvas");
  canvas.width = Math.max(1, Math.round(w * scale));
  canvas.height = Math.max(1, Math.round(h * scale));
  canvas.getContext("2d").drawImage(source, 0, 0, canvas.width, canvas.height);
  return canvas;
}

// CSS の filter:brightness() は環境によって効かないことがあるため、
// ピクセルデータを直接書き換えて、どの端末でも確実に明るさが変わるようにする
function ggBrightnessCanvas(sourceCanvas, brightnessPercent) {
  const canvas = document.createElement("canvas");
  canvas.width = sourceCanvas.width;
  canvas.height = sourceCanvas.height;
  const ctx = canvas.getContext("2d");
  ctx.drawImage(sourceCanvas, 0, 0);

  const factor = brightnessPercent / 100;
  const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
  const d = imageData.data;
  for (let i = 0; i < d.length; i += 4) {
    d[i] = Math.min(255, d[i] * factor);
    d[i + 1] = Math.min(255, d[i + 1] * factor);
    d[i + 2] = Math.min(255, d[i + 2] * factor);
  }
  ctx.putImageData(imageData, 0, 0);
  return canvas;
}

async function ggHandlePhotoSelected(event) {
  const file = event.target.files[0];
  if (!file) return;

  localStorage.setItem(GG_COACH_PHOTO_KEY, "1");
  document.getElementById("gg-photo-coach-bubble").classList.add("hidden");
  document.getElementById("gg-photo-coach-finger").classList.add("hidden");

  const source = await ggLoadOrientedBitmap(file);
  ggState.photoBaseCanvas = ggDrawResizedCanvas(source, 1600);
  ggState.photoPreviewCanvas = ggDrawResizedCanvas(source, 480);

  const dropIcon = document.getElementById("gg-photo-drop-icon");
  const dropText = document.getElementById("gg-photo-drop-text");
  const dropZone = document.getElementById("gg-photo-drop");
  const existingThumb = dropZone.querySelector(".gg-photo-drop-thumb");
  if (existingThumb) existingThumb.remove();
  const thumb = document.createElement("img");
  thumb.className = "gg-photo-drop-thumb";
  thumb.src = ggState.photoPreviewCanvas.toDataURL("image/jpeg", 0.7);
  dropZone.insertBefore(thumb, dropIcon);
  dropIcon.classList.add("hidden");
  dropText.textContent = "写真を変える";

  document.getElementById("gg-brightness-slider").value = 50;
  document.getElementById("gg-brightness-popup").classList.remove("hidden");
  ggUpdateBrightnessPreview();
}

// スライダーを動かすたびに、ポップアップ内の別プレビューではなく、
// 上に表示されている写真のサムネイルそのものを直接明るく／暗くする
function ggUpdateBrightnessPreview() {
  if (!ggState.photoPreviewCanvas) return;
  const slider = document.getElementById("gg-brightness-slider");
  const brightnessPercent = 50 + Number(slider.value);
  const adjusted = ggBrightnessCanvas(ggState.photoPreviewCanvas, brightnessPercent);
  const thumb = document.querySelector("#gg-photo-drop .gg-photo-drop-thumb");
  if (thumb) thumb.src = adjusted.toDataURL("image/jpeg", 0.75);
}

// どちらのボタンを押しても、今スライダーで見えている明るさをそのまま確定する
// （スライダーに触れていなければ50%＝変化なしのままなので、結果的に元の写真になる）
function ggConfirmBrightness() {
  if (ggState.photoBaseCanvas) {
    const slider = document.getElementById("gg-brightness-slider");
    const brightnessPercent = 50 + Number(slider.value);
    ggState.photoBaseCanvas = ggBrightnessCanvas(ggState.photoBaseCanvas, brightnessPercent);
  }
  document.getElementById("gg-brightness-popup").classList.add("hidden");
}

function ggShowComposerError(message) {
  const errorEl = document.getElementById("gg-composer-error");
  errorEl.textContent = message;
  errorEl.classList.toggle("hidden", !message);
}

async function ggSubmitPost() {
  const name = document.getElementById("gg-name-input").value.trim();
  const location = document.getElementById("gg-location-input").value.trim();
  const caption = document.getElementById("gg-caption-input").value.trim();
  const submitBtn = document.getElementById("gg-submit-btn");

  if (!ggState.editingPostId && !name) { ggShowComposerError("おなまえを入力してください。"); return; }
  if (!ggState.editingPostId && !ggState.photoBaseCanvas) { ggShowComposerError("写真を選んでください。"); return; }

  ggShowComposerError("");
  submitBtn.disabled = true;
  submitBtn.textContent = ggState.editingPostId ? "更新中…" : "投稿中…";

  try {
    if (ggState.editingPostId) {
      const res = await fetch(GG_API_BASE + "/posts/" + ggState.editingPostId, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          device_id: ggDeviceId(),
          mood: ggState.selectedMood,
          meal_tag: ggState.selectedTag,
          location: location,
          caption: caption,
        }),
      });
      if (!res.ok) throw new Error("update failed");
    } else {
      const blob = await new Promise((resolve) => ggState.photoBaseCanvas.toBlob(resolve, "image/jpeg", 0.82));
      const form = new FormData();
      form.append("device_id", ggDeviceId());
      form.append("name", name);
      form.append("mood", ggState.selectedMood);
      form.append("meal_tag", ggState.selectedTag);
      form.append("location", location);
      form.append("caption", caption);
      form.append("photo", blob, "photo.jpg");
      const res = await fetch(GG_API_BASE + "/posts", { method: "POST", body: form });
      if (!res.ok) throw new Error("post failed");
    }
    ggResetComposer();
    await ggFetchTimeline();
  } catch (e) {
    ggShowComposerError("送信に失敗しました。電波の良い場所でもう一度お試しください。");
  } finally {
    submitBtn.disabled = false;
    submitBtn.textContent = ggState.editingPostId ? "更新する" : "投稿する";
  }
}

function ggResetComposer() {
  ggState.editingPostId = null;
  ggState.photoBaseCanvas = null;
  ggState.photoPreviewCanvas = null;
  document.getElementById("gg-location-input").value = "";
  document.getElementById("gg-caption-input").value = "";
  document.getElementById("gg-photo-input").value = "";
  document.getElementById("gg-brightness-popup").classList.add("hidden");
  const dropZone = document.getElementById("gg-photo-drop");
  const thumb = dropZone.querySelector(".gg-photo-drop-thumb");
  if (thumb) thumb.remove();
  document.getElementById("gg-photo-drop-icon").classList.remove("hidden");
  document.getElementById("gg-photo-drop-text").textContent = "撮影 または ライブラリから選ぶ";
  document.getElementById("gg-submit-btn").textContent = "投稿する";
  document.getElementById("gg-cancel-edit-btn").classList.add("hidden");
  document.getElementById("gg-photo-name-group").classList.remove("hidden");
  document.getElementById("gg-editing-label").classList.add("hidden");
  ggShowComposerError("");
}

function ggCancelEdit() {
  ggResetComposer();
}

// 編集は写真・名前を変更できない仕組みなので、その2つは隠して「今から食べる！」以下だけを
// 編集画面として見せる。写真選択の上までスクロールされて新規投稿に見えてしまう不具合の対策
function ggStartEdit(post) {
  ggState.editingPostId = post.id;
  ggSelectMood(post.mood);
  ggSelectTag(post.meal_tag);
  document.getElementById("gg-location-input").value = post.location || "";
  document.getElementById("gg-caption-input").value = post.caption || "";
  document.getElementById("gg-submit-btn").textContent = "更新する";
  document.getElementById("gg-cancel-edit-btn").classList.remove("hidden");
  document.getElementById("gg-photo-name-group").classList.add("hidden");
  const editingLabel = document.getElementById("gg-editing-label");
  editingLabel.textContent = "✏️ " + post.name + "さんの投稿を編集中（写真・お名前は変更できません）";
  editingLabel.classList.remove("hidden");
  document.getElementById("gg-composer").scrollIntoView({ behavior: "smooth", block: "start" });
}

async function ggDeletePost(postId) {
  if (!window.confirm("この投稿を削除しますか？")) return;
  try {
    const res = await fetch(GG_API_BASE + "/posts/" + postId, {
      method: "DELETE",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ device_id: ggDeviceId() }),
    });
    if (!res.ok) throw new Error("delete failed");
    await ggFetchTimeline();
  } catch (e) {
    window.alert("削除に失敗しました。電波の良い場所でもう一度お試しください。");
  }
}

function ggFormatTime(timestampMs) {
  const d = new Date(timestampMs);
  return (d.getMonth() + 1) + "/" + d.getDate() + " " +
    String(d.getHours()).padStart(2, "0") + ":" + String(d.getMinutes()).padStart(2, "0");
}

async function ggFetchTimeline() {
  try {
    const res = await fetch(GG_API_BASE + "/posts");
    if (!res.ok) return;
    const data = await res.json();
    ggState.posts = data.posts || [];
    ggRenderTimeline();
  } catch (e) {
    // 通信できない時は、今表示されているタイムラインをそのまま残す
  }
}

function ggRenderTimeline() {
  const wrap = document.getElementById("gg-timeline");
  const emptyMsg = document.getElementById("gg-timeline-empty");
  wrap.innerHTML = "";
  emptyMsg.classList.toggle("hidden", ggState.posts.length > 0);

  const deviceId = ggDeviceId();
  const showMenuCoach = !localStorage.getItem(GG_COACH_MENU_KEY);
  let menuCoachPlaced = false;

  ggState.posts.forEach((post) => {
    const mood = ggState.moodMap[post.mood] || { emoji: "😋" };
    const tag = ggState.tagMap[post.meal_tag] || { emoji: "", label: post.meal_tag };
    const isOwn = post.device_id === deviceId;

    const card = el("article", "gg-post-card");
    const willShowCoach = isOwn && showMenuCoach && !menuCoachPlaced;

    const head = el("div", "gg-post-head" + (willShowCoach ? " gg-coach-anchor" : ""));
    head.innerHTML =
      "<div class='gg-post-head-left'>" +
        "<div class='gg-avatar'>" + mood.emoji + "</div>" +
        "<div><div class='gg-post-name'></div><div class='gg-post-time'>" + ggFormatTime(post.created_at) + "</div></div>" +
      "</div>";
    head.querySelector(".gg-post-name").textContent = post.name;

    if (isOwn) {
      const menuBtn = el("button", "gg-post-menu-btn", "⋯");
      menuBtn.type = "button";
      head.appendChild(menuBtn);

      if (willShowCoach) {
        menuCoachPlaced = true;
        const bubble = el("span", "gg-coach-bubble", "あとから直したい時はここ！");
        bubble.style.top = "-30px"; bubble.style.right = "0";
        const finger = el("span", "gg-coach-finger", "👆");
        finger.style.top = "22px"; finger.style.right = "8px";
        head.appendChild(bubble);
        head.appendChild(finger);
      }

      const dropdown = el("div", "gg-post-menu-dropdown hidden");
      const editBtn = el("button", "gg-menu-item", "✏️ 編集する");
      editBtn.type = "button";
      editBtn.addEventListener("click", () => { ggStartEdit(post); dropdown.classList.add("hidden"); });
      const deleteBtn = el("button", "gg-menu-item danger", "🗑️ 削除する");
      deleteBtn.type = "button";
      deleteBtn.addEventListener("click", () => ggDeletePost(post.id));
      dropdown.appendChild(editBtn);
      dropdown.appendChild(deleteBtn);

      menuBtn.addEventListener("click", () => {
        localStorage.setItem(GG_COACH_MENU_KEY, "1");
        const bubble = head.querySelector(".gg-coach-bubble");
        const finger = head.querySelector(".gg-coach-finger");
        if (bubble) bubble.remove();
        if (finger) finger.remove();
        dropdown.classList.toggle("hidden");
      });

      card.appendChild(head);
      card.appendChild(dropdown);
    } else {
      card.appendChild(head);
    }

    const photo = document.createElement("img");
    photo.className = "gg-post-photo";
    photo.loading = "lazy";
    photo.alt = post.caption || "投稿写真";
    photo.src = post.photo_url;
    card.appendChild(photo);

    if (post.caption) {
      const caption = el("p", "gg-post-caption");
      caption.innerHTML = "<b>" + ggEscapeHtml(post.name) + "</b>";
      caption.appendChild(document.createTextNode(post.caption));
      card.appendChild(caption);
    }

    card.appendChild(el("span", "gg-post-tag", tag.emoji + " " + tag.label));
    wrap.appendChild(card);
  });
}

// 「常設ボタン」：どのページからでもバリ旅グラムのチャプターへ移動する
function goToGourmetGram() {
  const chapters = state.data.chapters;
  const idx = chapters.findIndex((c) => c.id === "gourmet-gram");
  if (idx === -1) return;
  goToSlide(idx);
}

/* --- 旅の思い出をPDFで保存する（画像として一旦描画し、日本語もそのまま綺麗に出せるようにする） --- */
// 通信環境が悪い時などにいつまでも待ち続けてしまわないよう、
// 「保存する」ボタンが永久に「作成中…」のまま固まらないための共通タイムアウト処理
function ggWithTimeout(promise, ms, message) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(message || "timeout")), ms);
    promise.then(
      (value) => { clearTimeout(timer); resolve(value); },
      (err) => { clearTimeout(timer); reject(err); }
    );
  });
}

function ggLoadScript(src) {
  return new Promise((resolve, reject) => {
    const script = document.createElement("script");
    script.src = src;
    script.onload = resolve;
    script.onerror = () => reject(new Error("script load failed: " + src));
    document.head.appendChild(script);
  });
}

// html2canvas（ページ全体をクローンして描画するライブラリ）は、このサイトのように
// 常時アニメーションする要素（星空・BGM等）を含む重いページでは応答が返らなくなることが
// あったため使わず、jsPDFだけを読み込み、写真・文字はCanvas2D APIで直接描画する
let ggPdfLibLoadPromise = null;
function ggLoadPdfLib() {
  if (window.jspdf && window.jspdf.jsPDF) return Promise.resolve();
  if (ggPdfLibLoadPromise) return ggPdfLibLoadPromise;
  ggPdfLibLoadPromise = ggWithTimeout(
    ggLoadScript("https://cdnjs.cloudflare.com/ajax/libs/jspdf/2.5.1/jspdf.umd.min.js"),
    10000,
    "PDFライブラリの読み込みがタイムアウトしました"
  ).catch((err) => {
    ggPdfLibLoadPromise = null; // 次回また読み込みを試せるようにする
    throw err;
  });
  return ggPdfLibLoadPromise;
}

function ggLoadImageEl(src) {
  return ggWithTimeout(
    new Promise((resolve, reject) => {
      const img = new Image();
      img.onload = () => resolve(img);
      img.onerror = reject;
      img.src = src;
    }),
    10000,
    "画像の読み込みがタイムアウトしました"
  );
}

function ggWrapCanvasText(ctx, text, maxWidth) {
  const lines = [];
  text.split("\n").forEach((paragraph) => {
    let line = "";
    for (const ch of paragraph) {
      const test = line + ch;
      if (line && ctx.measureText(test).width > maxWidth) {
        lines.push(line);
        line = ch;
      } else {
        line = test;
      }
    }
    lines.push(line);
  });
  return lines;
}

const GG_PDF_PAGE_W = 1240;
const GG_PDF_PAGE_H = 1754; // A4比率（150dpi相当）

// A4を印刷してポスターにしても様になるよう、どのページにも共通の
// 薄いゴールドの二重罫線フレーム＋隅の簡単な線画（ヤシの葉）を入れる
function ggDrawPageFrame(ctx, color) {
  const outer = 36;
  const inner = 46;
  ctx.save();
  ctx.strokeStyle = color || "rgba(212,162,76,0.55)";
  ctx.lineWidth = 2;
  ctx.strokeRect(outer, outer, GG_PDF_PAGE_W - outer * 2, GG_PDF_PAGE_H - outer * 2);
  ctx.lineWidth = 1;
  ctx.strokeRect(inner, inner, GG_PDF_PAGE_W - inner * 2, GG_PDF_PAGE_H - inner * 2);

  ctx.lineWidth = 2;
  ctx.lineCap = "round";
  [
    [70, GG_PDF_PAGE_H - 70, -1],
    [GG_PDF_PAGE_W - 70, GG_PDF_PAGE_H - 70, 1],
  ].forEach(([cx, cy, dir]) => {
    ctx.beginPath();
    ctx.moveTo(cx, cy);
    ctx.lineTo(cx, cy - 46);
    ctx.moveTo(cx, cy - 30);
    ctx.quadraticCurveTo(cx + dir * 34, cy - 42, cx + dir * 50, cy - 18);
    ctx.moveTo(cx, cy - 14);
    ctx.quadraticCurveTo(cx + dir * 30, cy - 6, cx + dir * 44, cy + 12);
    ctx.stroke();
  });
  ctx.restore();
}

// ヤシの木・太陽・波の線画（チャプター内の飾りと同じモチーフ）を、指定した
// 中心座標(cx,cy)を基準に幅wで描く。表紙ページの余白を埋めるのに使う
function ggDrawBaliMotif(ctx, cx, cy, w, color) {
  const s = w / 200;
  ctx.save();
  ctx.translate(cx - w / 2, cy - 30 * s);
  ctx.strokeStyle = color;
  ctx.lineWidth = 1.5 * s;
  ctx.lineCap = "round";
  ctx.lineJoin = "round";

  ctx.beginPath();
  ctx.moveTo(0, 52 * s);
  ctx.bezierCurveTo(25 * s, 46 * s, 50 * s, 58 * s, 75 * s, 52 * s);
  ctx.bezierCurveTo(100 * s, 46 * s, 125 * s, 58 * s, 150 * s, 52 * s);
  ctx.bezierCurveTo(175 * s, 46 * s, 190 * s, 58 * s, 200 * s, 52 * s);
  ctx.stroke();

  ctx.beginPath();
  ctx.arc(100 * s, 30 * s, 13 * s, 0, Math.PI * 2);
  ctx.stroke();

  [
    [28 * s, false],
    [172 * s, true],
  ].forEach(([tx, flip]) => {
    const d = flip ? -1 : 1;
    ctx.beginPath();
    ctx.moveTo(tx, 52 * s);
    ctx.lineTo(tx, 28 * s);
    ctx.moveTo(tx, 28 * s);
    ctx.bezierCurveTo(tx - d * 9 * s, 23 * s, tx - d * 14 * s, 25 * s, tx - d * 19 * s, 19 * s);
    ctx.moveTo(tx, 28 * s);
    ctx.bezierCurveTo(tx - d * 6 * s, 19 * s, tx - d * 4 * s, 13 * s, tx - d * 10 * s, 9 * s);
    ctx.moveTo(tx, 28 * s);
    ctx.bezierCurveTo(tx + d * 4 * s, 19 * s, tx + d * 10 * s, 17 * s, tx + d * 14 * s, 11 * s);
    ctx.moveTo(tx, 28 * s);
    ctx.bezierCurveTo(tx + d * 8 * s, 21 * s, tx + d * 14 * s, 23 * s, tx + d * 20 * s, 17 * s);
    ctx.stroke();
  });

  ctx.restore();
}

function ggDrawTitleCanvas(title) {
  const canvas = document.createElement("canvas");
  canvas.width = GG_PDF_PAGE_W;
  canvas.height = GG_PDF_PAGE_H;
  const ctx = canvas.getContext("2d");
  const grad = ctx.createLinearGradient(0, 0, 0, GG_PDF_PAGE_H);
  grad.addColorStop(0, "#A6332E");
  grad.addColorStop(1, "#7A2321");
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, GG_PDF_PAGE_W, GG_PDF_PAGE_H);
  ggDrawPageFrame(ctx, "rgba(255,255,255,0.35)");

  ctx.textAlign = "center";
  ctx.fillStyle = "#D4A24C";
  ctx.font = "600 34px 'Noto Sans JP', sans-serif";
  ctx.fillText("BALI TOUR 2026", GG_PDF_PAGE_W / 2, GG_PDF_PAGE_H / 2 - 50);

  ctx.fillStyle = "#ffffff";
  ctx.font = "700 68px 'Noto Sans JP', sans-serif";
  ctx.fillText(title, GG_PDF_PAGE_W / 2, GG_PDF_PAGE_H / 2 + 30);

  ctx.font = "400 28px 'Noto Sans JP', sans-serif";
  ctx.fillStyle = "rgba(255,255,255,.85)";
  ctx.fillText(new Date().toLocaleDateString("ja-JP"), GG_PDF_PAGE_W / 2, GG_PDF_PAGE_H / 2 + 90);

  ggDrawBaliMotif(ctx, GG_PDF_PAGE_W / 2, GG_PDF_PAGE_H * 0.24, 140, "rgba(212,162,76,0.55)");
  ggDrawBaliMotif(ctx, GG_PDF_PAGE_W / 2, GG_PDF_PAGE_H * 0.78, 140, "rgba(212,162,76,0.55)");

  return canvas;
}

function ggChunk(arr, size) {
  const out = [];
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
  return out;
}

function ggRoundRectPath(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

// 1件分を、与えられた枠(x,y,w,h)いっぱいに使って描く。余白が寂しくならないよう
// まずカード状の背景を敷き、その中に写真・名前・タグのバッジ・ひとことを配置する。
// 文字や写真の大きさは、枠の幅に合わせて自動的に拡大・縮小する
async function ggDrawPostBlock(ctx, post, x, y, w, h) {
  const mood = ggState.moodMap[post.mood] || {};
  const tag = ggState.tagMap[post.meal_tag] || {};
  const scale = Math.max(0.75, Math.min(1.4, w / 520));
  const pad = Math.round(26 * scale);

  ggRoundRectPath(ctx, x, y, w, h, 22);
  ctx.fillStyle = "#FFFFFF";
  ctx.fill();
  ctx.strokeStyle = "rgba(212,162,76,0.55)";
  ctx.lineWidth = 2;
  ctx.stroke();

  const innerX = x + pad;
  const innerW = w - pad * 2;
  let cursorY = y + pad;

  try {
    const img = await ggLoadImageEl(post.photo_url);
    const maxW = innerW;
    const maxH = h * 0.6;
    const ratio = Math.min(maxW / img.naturalWidth, maxH / img.naturalHeight);
    const pw = img.naturalWidth * ratio;
    const ph = img.naturalHeight * ratio;
    const px = innerX + (innerW - pw) / 2;
    const r = 16;
    ctx.save();
    ggRoundRectPath(ctx, px, cursorY, pw, ph, r);
    ctx.clip();
    ctx.drawImage(img, px, cursorY, pw, ph);
    ctx.restore();
    ggRoundRectPath(ctx, px, cursorY, pw, ph, r);
    ctx.strokeStyle = "rgba(43,30,27,0.12)";
    ctx.lineWidth = 2;
    ctx.stroke();
    cursorY += ph + Math.round(28 * scale);
  } catch (e) {
    cursorY += 10;
  }

  ctx.textAlign = "left";
  ctx.fillStyle = "#2B1E1B";
  ctx.font = "700 " + Math.round(28 * scale) + "px 'Noto Sans JP', sans-serif";
  ctx.fillText((mood.emoji ? mood.emoji + "  " : "") + post.name, innerX, cursorY);
  cursorY += Math.round(16 * scale);

  // 「いつ食べた？」バッジ（薄いゴールドの丸ピル）
  const badgeText = (tag.emoji ? tag.emoji + " " : "") + (tag.label || "");
  if (badgeText.trim()) {
    ctx.font = "700 " + Math.round(18 * scale) + "px 'Noto Sans JP', sans-serif";
    const badgePad = Math.round(12 * scale);
    const badgeW = ctx.measureText(badgeText).width + badgePad * 2;
    const badgeH = Math.round(32 * scale);
    cursorY += Math.round(10 * scale);
    ggRoundRectPath(ctx, innerX, cursorY, badgeW, badgeH, badgeH / 2);
    ctx.fillStyle = "#F4E9E2";
    ctx.fill();
    ctx.fillStyle = "#A6332E";
    ctx.textBaseline = "middle";
    ctx.fillText(badgeText, innerX + badgePad, cursorY + badgeH / 2 + 1);
    ctx.textBaseline = "alphabetic";
    cursorY += badgeH + Math.round(14 * scale);
  }

  ctx.fillStyle = "#7A645C";
  ctx.font = "400 " + Math.round(18 * scale) + "px 'Noto Sans JP', sans-serif";
  const metaLine = ggFormatTime(post.created_at) + (post.location ? "　@" + post.location : "");
  ctx.fillText(metaLine, innerX, cursorY);
  cursorY += Math.round(26 * scale);

  if (post.caption) {
    ctx.fillStyle = "#2B1E1B";
    ctx.font = "400 " + Math.round(20 * scale) + "px 'Noto Sans JP', sans-serif";
    const lineH = Math.round(27 * scale);
    const remaining = Math.max(1, Math.floor((y + h - pad - cursorY) / lineH));
    ggWrapCanvasText(ctx, post.caption, innerW).slice(0, remaining).forEach((line) => {
      ctx.fillText(line, innerX, cursorY);
      cursorY += lineH;
    });
  }
}

// 件数(1〜4件)に応じて、ページ内を無駄なく埋めるカードの配置を返す
function ggGridRectsForCount(n, x, y, w, h, gap) {
  if (n <= 1) return [[x, y, w, h]];
  if (n === 2) {
    const colW = (w - gap) / 2;
    return [
      [x, y, colW, h],
      [x + colW + gap, y, colW, h],
    ];
  }
  const colW = (w - gap) / 2;
  const rowH = (h - gap) / 2;
  if (n === 3) {
    return [
      [x, y, colW, rowH],
      [x + colW + gap, y, colW, rowH],
      [x, y + rowH + gap, w, rowH],
    ];
  }
  return [
    [x, y, colW, rowH],
    [x + colW + gap, y, colW, rowH],
    [x, y + rowH + gap, colW, rowH],
    [x + colW + gap, y + rowH + gap, colW, rowH],
  ];
}

// ページ上部の「バリ旅グラム」ヘッダーバーを描き、その下端のY座標を返す
function ggDrawHeaderBar(ctx, margin) {
  const barH = 90;
  const bw = GG_PDF_PAGE_W - margin * 2;
  ggRoundRectPath(ctx, margin, margin, bw, barH, 20);
  const grad = ctx.createLinearGradient(margin, margin, margin + bw, margin);
  grad.addColorStop(0, "#A6332E");
  grad.addColorStop(1, "#7A2321");
  ctx.fillStyle = grad;
  ctx.fill();

  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillStyle = "#ffffff";
  ctx.font = "700 36px 'Noto Sans JP', sans-serif";
  ctx.fillText("バリ旅グラム", GG_PDF_PAGE_W / 2, margin + barH / 2 - 6);
  ctx.font = "400 15px 'Noto Sans JP', sans-serif";
  ctx.fillStyle = "rgba(255,255,255,.85)";
  ctx.fillText("BALI TOUR 2026 ｜ グルメスクラップ", GG_PDF_PAGE_W / 2, margin + barH / 2 + 22);
  ctx.textBaseline = "alphabetic";

  return margin + barH + 30;
}

// 1ページに最大4件を2列×2行で並べ、旅の記録帳らしい密度に見せる。
// 件数が4未満のページも、余白が寂しくならないようカードを大きく広げて埋める
async function ggDrawPostsPageCanvas(posts) {
  const canvas = document.createElement("canvas");
  canvas.width = GG_PDF_PAGE_W;
  canvas.height = GG_PDF_PAGE_H;
  const ctx = canvas.getContext("2d");
  ctx.fillStyle = "#FBF2E9";
  ctx.fillRect(0, 0, GG_PDF_PAGE_W, GG_PDF_PAGE_H);
  ggDrawPageFrame(ctx);

  const margin = 70;
  const gap = 30;
  const contentTop = ggDrawHeaderBar(ctx, margin);
  const usableW = GG_PDF_PAGE_W - margin * 2;
  const usableH = GG_PDF_PAGE_H - margin - contentTop;

  const rects = ggGridRectsForCount(posts.length, margin, contentTop, usableW, usableH, gap);
  for (let i = 0; i < posts.length; i++) {
    const [rx, ry, rw, rh] = rects[i];
    await ggDrawPostBlock(ctx, posts[i], rx, ry, rw, rh);
  }

  return canvas;
}

async function ggBuildPdf(posts, title) {
  await ggLoadPdfLib();
  // document.fonts.ready は、このページが読み込んでいる大量のGoogle Fonts（未使用の
  // 文字範囲ぶんも含む）すべての読み込み完了を待ってしまい、環境によっては
  // いつまでも終わらないことがあるため、最大3秒で必ず先へ進むようにする
  if (document.fonts && document.fonts.ready) {
    await Promise.race([document.fonts.ready, new Promise((resolve) => setTimeout(resolve, 3000))]);
  }
  const { jsPDF } = window.jspdf;
  const doc = new jsPDF({ unit: "mm", format: "a4" });
  const pageW = doc.internal.pageSize.getWidth();
  const pageH = doc.internal.pageSize.getHeight();

  const titleCanvas = ggDrawTitleCanvas(title);
  doc.addImage(titleCanvas.toDataURL("image/jpeg", 0.9), "JPEG", 0, 0, pageW, pageH);

  for (const pagePosts of ggChunk(posts, 4)) {
    doc.addPage();
    const canvas = await ggDrawPostsPageCanvas(pagePosts);
    doc.addImage(canvas.toDataURL("image/jpeg", 0.88), "JPEG", 0, 0, pageW, pageH);
  }

  return doc;
}

// ブラウザ純正のPDFビューアには「戻る」ボタンを追加できないため、
// 開いたタブの中に「← 戻る」ボタン付きの簡単な枠を用意し、その中にPDFを表示する。
// 「戻る」はこのタブ自体を閉じる動作にすることで、初めての人でも迷わず操作できるようにする
function ggIsMobileUA() {
  return /iPhone|iPad|iPod|Android|Mobi/i.test(navigator.userAgent);
}

// シェアボタンの位置は機種やアプリによって画面の上・下どちらもあり得るため、
// 文章で位置を説明せず、目印になる線画のアイコンで示す
const GG_SHARE_ICON_SVG =
  "<svg width='18' height='18' viewBox='0 0 24 24' fill='none' stroke='currentColor' stroke-width='2' " +
  "stroke-linecap='round' stroke-linejoin='round' style='vertical-align:-4px;'>" +
  "<path d='M12 3v10'></path><path d='M8 7l4-4 4 4'></path>" +
  "<path d='M5 12v7a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2v-7'></path></svg>";

function ggOpenPdfPreview(win, blobUrl, filename) {
  const isMobile = ggIsMobileUA();
  const escapedTitle = ggEscapeHtml(filename);

  // スマホでは、独自の枠(iframe)でPDFをそのまま埋め込むと表示が崩れる・画像が出ないことが
  // あったため、埋め込み表示はせず、タップすると端末標準のPDF表示に切り替わる大きな
  // ボタンを置く。「戻る」バーはそのボタンとは別の要素として常に表示されるので、
  // PDF側の表示状態に関わらず、この画面に確実に戻れるようにしている
  const contentHtml = isMobile
    ? "<div class='gg-pdf-mobile-open'>" +
        "<p class='gg-pdf-mobile-msg'>下のボタンを押すとPDFが開きます。<br>開いたら、" + GG_SHARE_ICON_SVG + " のボタンをタップし、出てきたメニューの中から「保存」を選んで保存してください。</p>" +
        "<button id='gg-pdf-mobile-open-btn' type='button'>📄 PDFを開く</button>" +
      "</div>"
    : "<iframe src='" + blobUrl + "'></iframe>";

  const html =
    "<!doctype html><html lang='ja'><head><meta charset='utf-8'>" +
    "<meta name='viewport' content='width=device-width, initial-scale=1'>" +
    "<title>" + escapedTitle + "</title>" +
    "<style>" +
    "html,body{margin:0;padding:0;height:100%;background:#2B211D;font-family:-apple-system,'Hiragino Sans','Yu Gothic','Segoe UI',sans-serif;}" +
    ".gg-pdf-bar{display:flex;align-items:center;gap:12px;padding:10px 14px;background:linear-gradient(135deg,#C74B3F,#7A2321);flex-wrap:wrap;}" +
    ".gg-pdf-bar button{border:none;border-radius:999px;padding:10px 18px;font-weight:700;font-size:.92rem;background:#fff;color:#A6332E;cursor:pointer;}" +
    ".gg-pdf-bar a{color:#fff;font-size:.82rem;text-decoration:underline;}" +
    ".gg-pdf-bar span{color:#fff;font-size:.8rem;opacity:.85;}" +
    "iframe{width:100%;height:calc(100% - 54px);border:none;display:block;background:#fff;}" +
    ".gg-pdf-mobile-open{display:flex;flex-direction:column;align-items:center;justify-content:center;gap:18px;height:calc(100% - 54px);padding:24px;text-align:center;}" +
    ".gg-pdf-mobile-msg{color:#fff;font-size:1rem;margin:0;}" +
    "#gg-pdf-mobile-open-btn{border:none;border-radius:16px;padding:18px 32px;font-weight:700;font-size:1.1rem;background:linear-gradient(135deg,#D4A24C,#A8792E);color:#fff;cursor:pointer;}" +
    "</style></head><body>" +
    "<div class='gg-pdf-bar'>" +
    "<button id='gg-pdf-back' type='button'>← バリ旅グラムに戻る</button>" +
    "<span>保存が終わったら押してください</span>" +
    "<a id='gg-pdf-dl' download='" + escapedTitle + "'>うまく表示されない場合はこちら（ダウンロード）</a>" +
    "</div>" +
    contentHtml +
    "<script>" +
    "document.getElementById('gg-pdf-back').addEventListener('click', function(){ window.close(); });" +
    (isMobile
      ? "var openBtn=document.getElementById('gg-pdf-mobile-open-btn');" +
        "if(openBtn){ openBtn.addEventListener('click', function(){ window.open('" + blobUrl + "', '_blank'); }); }"
      : "") +
    "</" + "script>" +
    "</body></html>";

  win.document.open();
  win.document.write(html);
  win.document.close();
  const dlLink = win.document.getElementById("gg-pdf-dl");
  if (dlLink) dlLink.href = blobUrl;
}

async function ggSavePdf(scope) {
  const btn = document.getElementById(scope === "mine" ? "gg-save-mine-btn" : "gg-save-all-btn");
  const originalText = btn.textContent;

  const deviceId = ggDeviceId();
  const posts = scope === "mine" ? ggState.posts.filter((p) => p.device_id === deviceId) : ggState.posts;
  if (posts.length === 0) {
    window.alert("保存できる投稿がまだありません。");
    return;
  }

  // タップした直後（PDF作成が終わる前）に空のタブを開いておき、完成したPDFを
  // そのタブへ表示する。バリ旅グラムのタブ自体は残るので、タブを切り替えれば戻れる
  const previewWindow = window.open("", "_blank");

  // スマホはPDFが開いた瞬間にそちらのタブへ切り替わってしまい、あとから案内を
  // 出しても気づいてもらえないため、保存ボタンを押した直後（作成中）に先に案内を出しておく
  document.getElementById("gg-save-guide").classList.remove("hidden");

  btn.disabled = true;
  btn.textContent = "作成中…（写真の枚数によって少し時間がかかります）";
  try {
    const sorted = posts.slice().sort((a, b) => a.created_at - b.created_at);
    const doc = await ggBuildPdf(sorted, "バリ旅deごちそうさま！");
    const filename = scope === "mine" ? "バリ旅deごちそうさま_わたしの記録.pdf" : "バリ旅deごちそうさま_みんなの記録.pdf";
    doc.setProperties({ title: filename });
    const blobUrl = doc.output("bloburl");
    // previewWindowへの書き込みが何らかの理由で失敗した場合も、その場でダウンロードする
    // 従来の方法に自動で切り替わるようにしておく（保存自体が失敗しないようにするため）
    let previewOk = false;
    if (previewWindow && !previewWindow.closed) {
      try {
        ggOpenPdfPreview(previewWindow, blobUrl, filename);
        previewOk = true;
      } catch (e) {
        previewOk = false;
      }
    }
    if (!previewOk) {
      if (previewWindow && !previewWindow.closed) previewWindow.close();
      doc.save(filename);
    }
  } catch (e) {
    if (previewWindow) previewWindow.close();
    document.getElementById("gg-save-guide").classList.add("hidden");
    window.alert("PDFの作成に失敗しました。通信環境の良い場所でもう一度お試しください。");
  } finally {
    btn.disabled = false;
    btn.textContent = originalText;
  }
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

    if (hotel.extraPhoto) {
      const extraWrap = el("div", "h-extra-photo");
      extraWrap.appendChild(makeImg(hotel.extraPhoto.image, hotel.extraPhoto.caption));
      extraWrap.appendChild(el("p", "h-extra-caption", hotel.extraPhoto.caption));
      card.appendChild(extraWrap);
    }

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
  const snorkeler = document.getElementById("route-snorkeler");
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

    // レンボンガン島でシュノーケルをする日（8/20）だけ、海に浮かぶ人を表示する
    snorkeler.classList.toggle("hidden", dayInfo.date !== "2026-08-20");

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
    if (spot.divider) {
      grid.appendChild(el("div", "spots-divider reveal", spot.divider));
      return;
    }
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
  renderSeaPlayTips(data);
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
  initGourmetGram(data);
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
  document.getElementById("btn-gourmet-gram-shortcut").addEventListener("click", goToGourmetGram);
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
  document.getElementById("gg-save-guide-close").addEventListener("click", () => {
    document.getElementById("gg-save-guide").classList.add("hidden");
  });
  document.getElementById("gg-save-guide").addEventListener("click", (event) => {
    if (event.target.id === "gg-save-guide") document.getElementById("gg-save-guide").classList.add("hidden");
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
  document.getElementById("btn-start-gourmet-gram").addEventListener("click", () => {
    enterMainApp();
    goToGourmetGram();
  });
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
