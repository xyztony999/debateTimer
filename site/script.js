/* 辩论赛计时器 DebateTimer 官网 — 中英双语 + 记分牌演示 */
(function () {
  "use strict";

  // 应用迁到 /app/ 前的旧 SW（scope=/）会把老访客锁在缓存的应用壳里；
  // 根路径的 /sw.js kill-switch 负责换代，这里对漏网的旧注册兜底注销。
  // 只碰根 scope 的旧注册——新应用在 /app/ scope 的注册不能动。
  try {
    if ('serviceWorker' in navigator) {
      navigator.serviceWorker.getRegistrations().then(function (regs) {
        regs.forEach(function (reg) {
          if (reg.scope && reg.scope.replace(/\/+$/, '').indexOf('/app') === -1) {
            reg.unregister();
          }
        });
      }).catch(function () {});
    }
    if (window.caches && caches.keys) {
      caches.keys().then(function (keys) {
        keys.forEach(function (key) { caches.delete(key); });
      }).catch(function () {});
    }
  } catch (e) { /* 隐私模式等场景忽略 */ }

  /* ===== i18n ===== */
  var I18N = {
    zh: {
      brand: "辩论赛计时器",
      "nav.features": "功能特性",
      "nav.guide": "快速上手",
      "nav.selfhost": "自部署",
      "nav.app": "打开应用",
      "hero.badge": "遵循渥太华大学华语辩论社（UOMDC）赛制",
      "hero.titlePro": "辩论赛",
      "hero.titleCon": "计时器",
      "hero.tagline": "大屏毫秒级同步 · 手机遥控 · 赛制模板广场——比赛计时这一件事，做到极致。",
      "hero.cta1": "立即使用",
      "hero.cta2": "GitHub 源码",
      "hero.note": "免费开源（MIT） · 无需安装 · 支持中 / 英 / 法三语",
      "features.title": "功能特性",
      "features.sub": "从赛前赛制编排到赛后复盘，覆盖一场比赛的完整生命周期。",
      "f1.t": "大屏实时同步",
      "f1.d": "意图帧 + 绝对锚点同步：操作秒级直达大屏，断线自动重连并重新校准。",
      "f2.t": "手机遥控与配对码",
      "f2.d": "四位配对码即连，把手机变成瘦遥控器；同一网络自动走 WebRTC 直连。",
      "f3.t": "自由辩论自动切换",
      "f3.d": "停止一方后另一方自动起表，时间耗尽自动交棒——不必再喊「换表」。",
      "f4.t": "超时宽限期",
      "f4.d": "可配置宽限秒数：短铃提醒 → 长鸣锁定，两级铃声语义分明，宽限相位同步大屏。",
      "f5.t": "分级铃声与语音播报",
      "f5.d": "30 秒提醒 / 时间到 / 必须停分级提示音，可选 TTS 语音播报当前阶段。",
      "f6.t": "赛制模板与广场",
      "f6.d": "自由编排阶段与计时模式，可发布到公开模板广场一键复用；预置 UOMDC / BP / 奥瑞冈。",
      "f7.t": "比赛记录与复盘",
      "f7.d": "自动统计各阶段计划 vs 实绩与超时次数，支持 CSV / JSON 导出。",
      "f8.t": "三语界面",
      "f8.d": "中文 / English / Français 自由切换，阶段名可分别配置多语言文案。",
      "f9.t": "PWA 与离线可用",
      "f9.d": "可安装到桌面与主屏幕；断网时计时核心照常运行，恢复后自动重连云同步。",
      "guide.title": "三步上手",
      "g1.t": "打开即用",
      "g1.d": "浏览器访问 debatetimer.tonyxyz.com/app/，选一套模板或自建赛制，无需注册即可计时。",
      "g2.t": "大屏同步 + 手机遥控",
      "g2.d": "开启大屏同步，大屏扫码只读跟随；用配对码把手机连成遥控器，随时走位控场。",
      "g3.t": "赛后复盘",
      "g3.d": "比赛记录自动留存：各环节计划 vs 实绩、超时次数一目了然，导出 CSV 深度复盘。",
      "guide.cta": "现在就开一场 →",
      "sh.title": "想自己部署？",
      "sh.sub": "一条命令在你的服务器上跑起全栈（页面 + API + MongoDB），支持一体化与 Nginx 反代两种拓扑，适合内网与私有化部署。",
      "sh.docs": "查看自部署手册 →",
      "footer.rules": "遵循渥太华大学华语辩论社（UOMDC）比赛规则设计",
      "footer.stack": "React + Vite + Bun · Express + MongoDB",
      "footer.app": "打开应用",
      demo: {
        modeSingle: "单计时",
        modeFree: "自由辩论",
        warn: "还有 30 秒",
        zero: "时间到",
        sidePro: "正方",
        sideCon: "反方",
      },
      stages: ["一辩立论", "一辩质询", "二辩驳论", "自由辩论", "总结陈词"],
      langBtn: "EN",
    },
    en: {
      brand: "DebateTimer",
      "nav.features": "Features",
      "nav.guide": "Get Started",
      "nav.selfhost": "Self-host",
      "nav.app": "Launch App",
      "hero.badge": "Built on the UOMDC debate rules",
      "hero.titlePro": "Debate Match",
      "hero.titleCon": "Timer",
      "hero.tagline": "Millisecond big-screen sync, phone remote control, and a format gallery — debate timing, done right.",
      "hero.cta1": "Launch App",
      "hero.cta2": "Source on GitHub",
      "hero.note": "Free & open source (MIT) · No install needed · English / 中文 / Français",
      "features.title": "Features",
      "features.sub": "From format design to post-match review — the full lifecycle of a debate.",
      "f1.t": "Live Big-Screen Sync",
      "f1.d": "Command + anchor sync keeps every screen in step; auto-reconnect and recalibration on dropouts.",
      "f2.t": "Phone Remote & Pairing",
      "f2.d": "Pair with a 4-digit code and turn any phone into a slim remote; WebRTC direct link on the same network.",
      "f3.t": "Free-Debate Auto Handover",
      "f3.d": "Stop one side and the other starts automatically — no more shouting “switch the clock”.",
      "f4.t": "Grace Period",
      "f5.t": "Tiered Bells & Speech Calls",
      "f4.d": "Configurable grace seconds with two-level bells (warn, then lock) — synced to the big screen.",
      "f5.d": "Distinct bells for 30s-left / time-up / hard stop, plus optional text-to-speech stage calls.",
      "f6.t": "Formats & Gallery",
      "f6.d": "Compose stages freely and publish to the public gallery; UOMDC / BP / Australs presets included.",
      "f7.t": "Match Logs & Review",
      "f7.d": "Planned vs actual time and overruns per stage, with CSV / JSON export.",
      "f8.t": "Trilingual UI",
      "f8.d": "中文 / English / Français, with per-stage translated names.",
      "f9.t": "Installable PWA",
      "f9.d": "Install to desktop or home screen; the timing core keeps working offline and reconnects automatically.",
      "guide.title": "Get Started in 3 Steps",
      "g1.t": "Open & Go",
      "g1.d": "Visit debatetimer.tonyxyz.com/app/, pick a preset or craft your own format — no sign-up needed.",
      "g2.t": "Go Live & Go Remote",
      "g2.d": "Share a link so the big screen follows read-only; pair your phone as the remote.",
      "g3.t": "Review the Match",
      "g3.d": "Logs are saved automatically: planned vs actual per stage, overruns at a glance, CSV export.",
      "guide.cta": "Start a match now →",
      "sh.title": "Want to self-host?",
      "sh.sub": "One script brings up the full stack (pages + API + MongoDB) on your own server — all-in-one or Nginx-proxy topologies.",
      "sh.docs": "Read the self-hosting guide →",
      "footer.rules": "Designed around the UOMDC debate rules",
      "footer.stack": "React + Vite + Bun · Express + MongoDB",
      "footer.app": "Launch App",
      demo: {
        modeSingle: "single",
        modeFree: "free debate",
        warn: "30 seconds left",
        zero: "Time!",
        sidePro: "Pro",
        sideCon: "Con",
      },
      stages: ["Opening", "Cross-ex", "Rebuttal", "Free Debate", "Closing"],
      langBtn: "中",
    },
  };

  var lang = "zh";
  try {
    var saved = localStorage.getItem("dt-site-lang");
    if (saved === "zh" || saved === "en") lang = saved;
    else lang = (navigator.language || "").toLowerCase().indexOf("zh") === 0 ? "zh" : "en";
  } catch (e) { /* storage unavailable — keep zh */ }

  function t(key) {
    var dict = I18N[lang];
    if (Object.prototype.hasOwnProperty.call(dict, key)) return dict[key];
    var cur = dict;
    var parts = key.split(".");
    for (var i = 0; i < parts.length; i++) {
      if (cur == null || !Object.prototype.hasOwnProperty.call(cur, parts[i])) return key;
      cur = cur[parts[i]];
    }
    return cur;
  }

  function applyLang() {
    var dict = I18N[lang];
    var nodes = document.querySelectorAll("[data-i18n]");
    for (var i = 0; i < nodes.length; i++) {
      var key = nodes[i].getAttribute("data-i18n");
      if (Object.prototype.hasOwnProperty.call(dict, key)) nodes[i].textContent = dict[key];
    }
    document.documentElement.setAttribute("lang", lang === "zh" ? "zh-CN" : "en");
    document.getElementById("langToggle").textContent = dict.langBtn;
    buildStations();
  }

  document.getElementById("langToggle").addEventListener("click", function () {
    lang = lang === "zh" ? "en" : "zh";
    try { localStorage.setItem("dt-site-lang", lang); } catch (e) { /* ignore */ }
    applyLang();
  });

  /* ===== 记分牌演示：每阶段 60s，30s 警告，到点红灯后切下一站 ===== */
  var STAGE_DUR = 60;
  var MODES = ["single", "single", "single", "free", "single"];
  var ring = document.getElementById("demoRing");
  var digits = document.getElementById("demoDigits");
  var stageName = document.getElementById("demoStageName");
  var stageMode = document.getElementById("demoStageMode");
  var hint = document.getElementById("demoHint");
  var sidesBox = document.getElementById("demoSides");
  var sidePro = document.getElementById("demoSidePro");
  var sideCon = document.getElementById("demoSideCon");
  var stationsBox = document.getElementById("demoStations");
  var RING_LEN = 2 * Math.PI * 88;

  var stageIdx = 0;
  var elapsed = 0;
  var overBy = 0;
  var warned = false;
  var lastSecond = -1;

  function buildStations() {
    stationsBox.innerHTML = "";
    for (var j = 0; j < I18N.zh.stages.length; j++) {
      var el = document.createElement("div");
      el.className = "station";
      var dot = document.createElement("div");
      dot.className = "station-dot";
      var name = document.createElement("div");
      name.className = "station-name";
      name.textContent = I18N[lang].stages[j];
      el.appendChild(dot);
      el.appendChild(name);
      stationsBox.appendChild(el);
    }
    renderStations();
  }

  function fmt(sec) {
    var m = Math.floor(sec / 60);
    var s = sec % 60;
    return m + ":" + (s < 10 ? "0" : "") + s;
  }

  function renderStations() {
    var nodes = stationsBox.children;
    for (var i = 0; i < nodes.length; i++) {
      nodes[i].className =
        "station" + (i < stageIdx ? " done" : i === stageIdx ? " current" : "");
    }
    stageName.textContent = t("stages")[stageIdx];
    stageMode.textContent = MODES[stageIdx] === "free" ? t("demo.modeFree") : t("demo.modeSingle");
    sidesBox.style.visibility = MODES[stageIdx] === "free" ? "visible" : "hidden";
  }

  function tick() {
    elapsed += 0.25;
    if (elapsed >= STAGE_DUR) {
      overBy += 0.25;
      if (overBy >= 3) {
        stageIdx = (stageIdx + 1) % MODES.length;
        elapsed = 0;
        overBy = 0;
        warned = false;
        lastSecond = -1;
        hint.className = "demo-hint";
        hint.textContent = "";
        digits.className = "clock-digits";
        ring.classList.remove("warn", "zero");
        renderStations();
        return;
      }
      digits.textContent = "0:00";
      digits.className = "clock-digits zero";
      ring.className = "ring-fill zero";
      ring.style.strokeDashoffset = RING_LEN;
      hint.className = "demo-hint zero";
      hint.textContent = t("demo.zero");
      return;
    }
    var remain = Math.ceil(STAGE_DUR - elapsed);
    if (remain !== lastSecond) {
      lastSecond = remain;
      digits.textContent = fmt(remain);
      digits.className = remain <= 30 ? "clock-digits warn" : "clock-digits";
      ring.className = remain <= 30 ? "ring-fill warn" : "ring-fill";
      if (remain <= 30 && !warned) {
        warned = true;
        hint.className = "demo-hint warn";
        hint.textContent = t("demo.warn");
      } else if (remain > 30 && warned === false) {
        hint.textContent = "";
      }
      var frac = remain / STAGE_DUR;
      ring.style.strokeDashoffset = String(RING_LEN * (1 - frac));
    }
    if (MODES[stageIdx] === "free") {
      var activePro = Math.floor(elapsed / 8) % 2 === 0;
      sidePro.className = "side pill-pro" + (activePro ? " active" : "");
      sideCon.className = "side pill-con" + (activePro ? "" : " active");
    }
  }

  /* 初始化 */
  sidePro.textContent = I18N[lang].demo.sidePro;
  sideCon.textContent = I18N[lang].demo.sideCon;
  applyLang();
  renderStations();
  setInterval(tick, 250);
  // 语言切换时刷新正反方标签
  document.getElementById("langToggle").addEventListener("click", function () {
    sidePro.textContent = t("demo.sidePro");
    sideCon.textContent = t("demo.sideCon");
  });
})();
