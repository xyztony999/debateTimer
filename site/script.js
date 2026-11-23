/* 辩论赛计时器 DebateTimer 官网 — 中英双语 + 记分牌演示（严格复刻应用设计） */
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
        following: "跟随中",
        badgeAff: "正",
        badgeNeg: "反",
        sideAff: "正方",
        sideNeg: "反方",
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
        following: "Following",
        badgeAff: "AFF",
        badgeNeg: "NEG",
        sideAff: "Affirmative",
        sideNeg: "Negative",
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
    var nodes = document.querySelectorAll("[data-i18n]");
    for (var i = 0; i < nodes.length; i++) {
      var key = nodes[i].getAttribute("data-i18n");
      var val = t(key);
      if (val !== key) nodes[i].textContent = val; // t() 支持嵌套键（demo.*）
    }
    document.documentElement.setAttribute("lang", lang === "zh" ? "zh-CN" : "en");
    document.getElementById("langToggle").textContent = I18N[lang].langBtn;
    buildStations();
    buildClocks();
  }

  document.getElementById("langToggle").addEventListener("click", function () {
    lang = lang === "zh" ? "en" : "zh";
    try { localStorage.setItem("dt-site-lang", lang); } catch (e) { /* ignore */ }
    applyLang();
  });

  /* ======================================================================
     记分牌演示 —— 严格复刻应用行为：
     · formatTime 零填充 MM:SS（engine.formatTime）
     · 单计时 = 单卡；自由辩论 = 双卡 + 持方高亮（tb-active）
     · 30 秒提醒 = 仅闪烁（warn 不变色）；耗尽 = 红色锁定闪烁
     · 自由辩论时间耗尽自动交棒（auto handover）
     · 控制端地铁线：互换胶囊（模式切换站）、当前站呼吸图标
     ==================================================================== */
  var MODES = ["single", "single", "single", "free", "single"];
  var SINGLE_DUR = 60;   // 单计时阶段演示时长（秒）
  var FREE_DUR = 24;     // 自由辩论每方演示时长（压短便于看到自动交棒）
  var LOCK_HOLD = 2;     // 锁定后停留秒数，随后切下一阶段

  // 呼吸图标（StageIcon 的 mode 兜底：single→Timer、free→Forum，Material 同款路径）
  var ICON_TIMER = '<svg viewBox="0 0 24 24"><path d="M15 1H9v2h6V1zm-2 13h-2V8h2v6zm6.03-6.61l1.42-1.42c-.43-.51-.9-.99-1.41-1.41l-1.42 1.42C16.07 4.74 14.12 4 12 4c-4.97 0-9 4.03-9 9s4.02 9 9 9 9-4.03 9-9c0-2.12-.74-4.07-1.97-5.61zM12 20c-3.87 0-7-3.13-7-7s3.13-7 7-7 7 3.13 7 7-3.13 7-7 7z"/></svg>';
  var ICON_FORUM = '<svg viewBox="0 0 24 24"><path d="M21 6h-2v9H6v2c0 .55.45 1 1 1h11l4 4V7c0-.55-.45-1-1-1zm-4 6V3c0-.55-.45-1-1-1H3c-.55 0-1 .45-1 1v14l4-4h10c.55 0 1-.45 1-1z"/></svg>';

  var stageIdx = 0;
  var remain = { single: SINGLE_DUR, aff: FREE_DUR, neg: FREE_DUR };
  var activeSide = "aff";
  var locked = { single: false, aff: false, neg: false };
  var lockHold = 0;      // 全部锁定后已停留秒数
  var lastSecond = -1;

  var stageNameEl = document.getElementById("demoStageName");
  var clocksEl = document.getElementById("demoClocks");
  var stationsEl = document.getElementById("demoStations");

  // 复刻 engine.formatTime：零填充 MM:SS
  function fmt(sec) {
    var m = Math.floor(sec / 60);
    var s = sec % 60;
    return (m < 10 ? "0" : "") + m + ":" + (s < 10 ? "0" : "") + s;
  }

  function boxHtml(sideKey) {
    var isFree = MODES[stageIdx] === "free";
    var head = isFree
      ? '<h3 class="tb-head"><span class="tb-badge">' + t("demo." + (sideKey === "aff" ? "badgeAff" : "badgeNeg")) + '</span>' +
        t("demo." + (sideKey === "aff" ? "sideAff" : "sideNeg")) + '</h3>'
      : "";
    return '<div class="tb-box tb-box--display" data-side="' + sideKey + '">' + head +
      '<h1 class="tb-clock" data-clock="' + sideKey + '">' + fmt(remain[sideKey]) + "</h1></div>";
  }

  function buildClocks() {
    if (MODES[stageIdx] === "free") {
      clocksEl.innerHTML = boxHtml("aff") + boxHtml("neg");
    } else {
      clocksEl.innerHTML = boxHtml("single");
    }
  }

  function updateClock(sideKey) {
    var el = clocksEl.querySelector('[data-clock="' + sideKey + '"]');
    if (!el) return;
    el.textContent = fmt(remain[sideKey]);
    var box = el.parentNode;
    // warn：≤10s 仅闪烁不变色；locked：红色闪烁（TimerBox 语义）
    var isWarn = remain[sideKey] <= 10 && remain[sideKey] > 0;
    el.className = "tb-clock" + (locked[sideKey] ? " tb-clock--locked" : isWarn ? " tb-clock--warn" : "");
    if (MODES[stageIdx] === "free") {
      // 持方高亮跟随当前起表方（tb-active）
      box.className = "tb-box tb-box--display" + (activeSide === sideKey && !locked[sideKey] ? " tb-active" : "");
    }
  }

  function interchangeAt(i) {
    return i > 0 && MODES[i] !== MODES[i - 1];
  }

  function buildStations() {
    var html = "";
    for (var i = 0; i < MODES.length; i++) {
      var cls = "st-step";
      if (i < stageIdx) cls += " st-step--passed";
      if (i === stageIdx) cls += " st-step--current";
      if (interchangeAt(i)) cls += " st-step--interchange";
      var marker = i === stageIdx
        ? '<span class="st-marker">' + (MODES[i] === "free" ? ICON_FORUM : ICON_TIMER) + "</span>"
        : "";
      html += '<div class="' + cls + '">' + marker +
        '<span class="st-dot">' + (i + 1) + '</span>' +
        '<span class="st-name">' + t("stages")[i] + "</span></div>";
    }
    stationsEl.innerHTML = html;
    stageNameEl.textContent = t("stages")[stageIdx];
  }

  function resetStage() {
    remain.single = SINGLE_DUR;
    remain.aff = FREE_DUR;
    remain.neg = FREE_DUR;
    activeSide = "aff";
    locked.single = locked.aff = locked.neg = false;
    lockHold = 0;
    lastSecond = -1;
  }

  function advanceStage() {
    stageIdx = (stageIdx + 1) % MODES.length;
    resetStage();
    buildClocks();
    buildStations();
  }

  function tick() {
    var mode = MODES[stageIdx];
    var secondsPassed = lastSecond >= 0 && Math.floor(Date.now() / 1000) === lastSecond;
    if (secondsPassed) return;
    lastSecond = Math.floor(Date.now() / 1000);

    if (mode === "single") {
      if (locked.single) {
        lockHold += 1;
        if (lockHold >= LOCK_HOLD) advanceStage();
        return;
      }
      remain.single = Math.max(0, remain.single - 1);
      if (remain.single === 0) locked.single = true;
      updateClock("single");
    } else {
      var allLocked = locked.aff && locked.neg;
      if (allLocked) {
        lockHold += 1;
        if (lockHold >= LOCK_HOLD) advanceStage();
        return;
      }
      if (locked[activeSide]) {
        // 自动交棒：耗尽方锁定，另一方立即起表
        activeSide = activeSide === "aff" ? "neg" : "aff";
      }
      remain[activeSide] = Math.max(0, remain[activeSide] - 1);
      if (remain[activeSide] === 0) locked[activeSide] = true;
      updateClock("aff");
      updateClock("neg");
    }
  }

  applyLang();
  setInterval(tick, 1000);
})();
