(() => {
  "use strict";
  const $ = (s, r = document) => r.querySelector(s);
  const $$ = (s, r = document) => [...r.querySelectorAll(s)];

  // localStorage can be blocked (private mode, school devices) – never let that break the page
  const store = {
    get(k, d) { try { const v = localStorage.getItem("ug:" + k); return v == null ? d : JSON.parse(v); } catch { return d; } },
    set(k, v) { try { localStorage.setItem("ug:" + k, JSON.stringify(v)); } catch {} },
    del(k) { try { localStorage.removeItem("ug:" + k); } catch {} },
  };

  /* ---------- parts checklist ---------- */
  const parts = $$("#partsList input");
  const partsState = store.get("parts", {});
  const renderParts = () => {
    const n = parts.filter(i => i.checked).length;
    $("#partsBar").style.width = (n / parts.length * 100) + "%";
    $("#partsTxt").textContent = `${n} / ${parts.length}`;
  };
  parts.forEach(i => {
    i.checked = !!partsState[i.dataset.k];
    i.addEventListener("change", () => { partsState[i.dataset.k] = i.checked; store.set("parts", partsState); renderParts(); });
  });
  renderParts();

  /* ---------- build steps ---------- */
  const steps = $$("#buildList .step");
  const buildState = store.get("build", {});
  const renderBuild = (scrollNext) => {
    let n = 0, firstOpen = null;
    steps.forEach(s => {
      const d = !!buildState[s.dataset.k];
      s.classList.toggle("is-done", d);
      s.classList.remove("is-current");
      $(".done", s).setAttribute("aria-pressed", d);
      if (d) n++; else if (!firstOpen) firstOpen = s;
    });
    if (firstOpen) firstOpen.classList.add("is-current");
    $("#buildBar").style.width = (n / steps.length * 100) + "%";
    $("#buildTxt").textContent = `${n} / ${steps.length}`;
    $("#buildDone").hidden = n !== steps.length;
    if (scrollNext) {
      const target = firstOpen || $("#buildDone");
      target.scrollIntoView({ behavior: "smooth", block: "start" });
    }
  };
  steps.forEach(s => {
    $(".done", s).addEventListener("click", () => {
      const was = !!buildState[s.dataset.k];
      buildState[s.dataset.k] = !was;
      store.set("build", buildState);
      renderBuild(!was);
    });
  });
  renderBuild(false);

  $("#resetBtn").addEventListener("click", () => {
    if (!confirm("部品と組み立てのチェックをすべて消しますか？")) return;
    for (const k in partsState) delete partsState[k];
    for (const k in buildState) delete buildState[k];
    store.del("parts"); store.del("build");
    parts.forEach(i => (i.checked = false));
    renderParts(); renderBuild(false);
  });

  /* ---------- distance records (this device only) ---------- */
  let recs = store.get("recs", []);
  const renderRecs = () => {
    const list = $("#recList");
    list.innerHTML = "";
    const best = recs.reduce((m, r) => Math.max(m, r.d), 0);
    recs.slice().reverse().forEach((r, idx) => {
      const li = document.createElement("li");
      if (r.d === best) li.className = "best";
      li.textContent = `${recs.length - idx}回目　${r.d} cm` + (r.w ? `（おもり ${r.w}個）` : "");
      list.appendChild(li);
    });
    $("#recBest").hidden = !recs.length;
    $("#recBest").innerHTML = `<svg class="ic" aria-hidden="true"><use href="#i-trophy"/></svg>ベスト記録：${best} cm`;
    if (best && !$("#svDist").value) $("#svDist").value = best;
  };
  $("#recForm").addEventListener("submit", e => {
    e.preventDefault();
    const d = Math.round(parseFloat($("#recDist").value));
    if (!(d >= 0)) return;
    const w = parseInt($("#recW").value, 10) || 0;
    recs.push({ d, w }); recs = recs.slice(-30);
    store.set("recs", recs);
    $("#recDist").value = "";
    renderRecs();
  });
  renderRecs();

  /* ---------- survey ---------- */
  const form = $("#surveyForm");
  const eventId = new URLSearchParams(location.search).get("event") || "";
  const acc = $("#surveyAcc");
  if (store.get("surveyDone:" + eventId, false)) { acc.hidden = true; $("#svThanks").hidden = false; }

  form.addEventListener("submit", async e => {
    e.preventDefault();
    const msg = $("#svMsg");
    const fd = new FormData(form);
    if (!fd.get("grade") || !fd.get("fun")) {
      msg.textContent = "「学年」と「楽しかったですか？」を選んでください";
      (fd.get("grade") ? $('[name="fun"]') : $('[name="grade"]')).closest("fieldset").scrollIntoView({ behavior: "smooth", block: "center" });
      return;
    }
    const body = {
      event: eventId,
      grade: fd.get("grade"),
      fun: Number(fd.get("fun")),
      difficulty: fd.get("difficulty") || null,
      understand: fd.get("understand") ? Number(fd.get("understand")) : null,
      liked: fd.getAll("liked"),
      distance: fd.get("distance") ? Number(fd.get("distance")) : null,
      again: fd.get("again") || null,
      next: (fd.get("next") || "").trim(),
      comment: (fd.get("comment") || "").trim(),
      website: fd.get("website") || "",
    };
    const btn = $("#svBtn"), label = btn.innerHTML;
    btn.disabled = true; btn.textContent = "送信中…"; msg.textContent = "";
    try {
      const res = await fetch("/api/survey", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (!res.ok) throw new Error(await res.text());
      store.set("surveyDone:" + eventId, true);
      acc.hidden = true;
      $("#svThanks").hidden = false;
      $("#survey").scrollIntoView({ behavior: "smooth" });
    } catch (err) {
      msg.textContent = "送信できませんでした。もう一度お試しください。うまくいかない場合はスタッフに声をかけてください。";
      btn.disabled = false; btn.innerHTML = label;
    }
  });

  /* ---------- furigana on/off ---------- */
  const rt = $("#rubyToggle");
  const setRuby = on => {
    document.body.classList.toggle("no-ruby", !on);
    rt.setAttribute("aria-pressed", on);
    store.set("ruby", on);
  };
  setRuby(store.get("ruby", true));
  rt.addEventListener("click", () => setRuby(document.body.classList.contains("no-ruby")));

  /* tab "アンケート" opens the accordion */
  $$('a[href="#survey"]').forEach(a => a.addEventListener("click", () => { if (!acc.hidden) acc.open = true; }));

  /* ---------- tab highlight + back to top ---------- */
  const tabs = $$(".tabs a");
  const ids = tabs.map(a => a.getAttribute("href").slice(1));
  const io = new IntersectionObserver(entries => {
    entries.forEach(en => {
      if (!en.isIntersecting) return;
      tabs.forEach(a => a.classList.toggle("on", a.getAttribute("href") === "#" + en.target.id));
    });
  }, { rootMargin: "-45% 0px -50% 0px" });
  ids.forEach(id => { const el = document.getElementById(id); if (el) io.observe(el); });
  const top = $(".totop");
  addEventListener("scroll", () => top.classList.toggle("show", scrollY > 600), { passive: true });
})();
