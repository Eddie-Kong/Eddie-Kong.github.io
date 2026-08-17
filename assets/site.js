/* ------------------------------------------------------------------
   eddiekong.com — shared behaviour

   Every block below is guarded by the presence of its own markup, so
   this one file can be loaded by every page. No dependencies, no build
   step: what is in the repo is what the browser runs.
   ------------------------------------------------------------------ */

(function () {
  "use strict";

  var REPO = "Eddie-Kong/Eddie-Kong.github.io";

  function $(sel, root) { return (root || document).querySelector(sel); }
  function $$(sel, root) { return Array.prototype.slice.call((root || document).querySelectorAll(sel)); }

  function el(tag, attrs, text) {
    var node = document.createElement(tag);
    if (attrs) {
      Object.keys(attrs).forEach(function (k) { node.setAttribute(k, attrs[k]); });
    }
    if (text !== undefined && text !== null) node.textContent = String(text);
    return node;
  }

  function getJSON(url) {
    return fetch(url).then(function (r) {
      if (!r.ok) throw new Error(url + " → HTTP " + r.status);
      return r.json();
    });
  }

  function fail(container, message) {
    if (!container) return;
    container.textContent = "";
    container.appendChild(el("p", { class: "search-status" }, message));
  }

  /* ---------- theme toggle ------------------------------------------
     Three states: unset (follow the OS), "light", "dark". The <head>
     of every page sets data-theme before first paint so there is no
     flash; this only wires the button.                                */

  function initTheme() {
    var btn = $("#theme-toggle");
    if (!btn) return;

    function systemPrefersDark() {
      return window.matchMedia && window.matchMedia("(prefers-color-scheme: dark)").matches;
    }

    function currentIsDark() {
      var set = document.documentElement.getAttribute("data-theme");
      if (set === "dark") return true;
      if (set === "light") return false;
      return systemPrefersDark();
    }

    function render() {
      var dark = currentIsDark();
      btn.textContent = dark ? "☀ Light" : "☾ Dark";
      btn.setAttribute("aria-label", dark ? "Switch to light theme" : "Switch to dark theme");
      btn.setAttribute("aria-pressed", String(dark));
    }

    btn.addEventListener("click", function () {
      var next = currentIsDark() ? "light" : "dark";
      document.documentElement.setAttribute("data-theme", next);
      try { localStorage.setItem("theme", next); } catch (e) { /* private mode */ }
      render();
    });

    if (window.matchMedia) {
      var mq = window.matchMedia("(prefers-color-scheme: dark)");
      var onChange = function () { render(); };
      if (mq.addEventListener) mq.addEventListener("change", onChange);
      else if (mq.addListener) mq.addListener(onChange);
    }

    render();
  }

  /* ---------- click-to-load embeds ----------------------------------
     Nothing is requested from youtube / bilibili / openstreetmap until
     the visitor asks for it. Keeps first load free of third-party
     requests, and means a blocked provider costs a click, not a wait. */

  function initEmbeds() {
    $$(".embed[data-embed-src]").forEach(function (box) {
      var button = $(".embed-launch", box);
      if (!button) return;

      button.addEventListener("click", function () {
        var frame = el("iframe", {
          src: box.getAttribute("data-embed-src"),
          title: box.getAttribute("data-embed-title") || "Embedded media",
          loading: "lazy",
          allow: "accelerometer; autoplay; clipboard-write; encrypted-media; picture-in-picture; fullscreen",
          referrerpolicy: "strict-origin-when-cross-origin"
        });
        frame.setAttribute("allowfullscreen", "");
        box.textContent = "";
        box.appendChild(frame);
      });
    });
  }

  /* ---------- gallery + lightbox ---------- */

  function initGallery() {
    var list = $("#gallery");
    if (!list) return;

    getJSON("/data/photos.json").then(function (data) {
      list.textContent = "";

      (data.photos || []).forEach(function (photo) {
        var img = el("img", {
          src: photo.src,
          alt: photo.alt || "",
          loading: "lazy",
          decoding: "async"
        });
        if (photo.width) img.setAttribute("width", photo.width);
        if (photo.height) img.setAttribute("height", photo.height);

        var button = el("button", { type: "button" });
        button.appendChild(img);
        button.addEventListener("click", function () { openLightbox(photo); });

        var figure = el("figure");
        figure.appendChild(button);
        var caption = el("figcaption", null, photo.caption || "");
        if (photo.place) caption.appendChild(el("span", null, " · " + photo.place));
        figure.appendChild(caption);

        var item = el("li");
        item.appendChild(figure);
        list.appendChild(item);
      });

      if (!list.children.length) {
        list.appendChild(el("li", null, "No photos yet."));
      }
    }).catch(function (err) {
      fail(list.parentNode, "Could not load the photo list (" + err.message + ").");
    });

    var box = $("#lightbox");
    if (!box) return;
    var boxImg = $("#lightbox-img");
    var boxCaption = $("#lightbox-caption");
    var lastFocus = null;

    function openLightbox(photo) {
      lastFocus = document.activeElement;
      boxImg.setAttribute("src", photo.src);
      boxImg.setAttribute("alt", photo.alt || "");
      boxCaption.textContent = photo.caption || "";
      box.classList.add("is-open");
      box.removeAttribute("hidden");
      $("#lightbox-close").focus();
    }

    function closeLightbox() {
      box.classList.remove("is-open");
      box.setAttribute("hidden", "");
      boxImg.removeAttribute("src");
      if (lastFocus) lastFocus.focus();
    }

    $("#lightbox-close").addEventListener("click", closeLightbox);
    box.addEventListener("click", function (e) { if (e.target === box) closeLightbox(); });
    document.addEventListener("keydown", function (e) {
      if (e.key === "Escape" && box.classList.contains("is-open")) closeLightbox();
    });
  }

  /* ---------- charts ------------------------------------------------
     Hand-rolled inline SVG rather than a charting library: one less
     dependency, and the marks inherit the theme through CSS classes.  */

  var SVG_NS = "http://www.w3.org/2000/svg";

  function svgEl(tag, attrs) {
    var node = document.createElementNS(SVG_NS, tag);
    Object.keys(attrs || {}).forEach(function (k) { node.setAttribute(k, attrs[k]); });
    return node;
  }

  /* rows: [{label, from, to, marker?, value}] on a shared [min,max] axis */
  function rangeChart(rows, axis) {
    var W = 640, rowH = 46, padL = 132, padR = 16, padT = 8, padB = 26;
    var H = padT + rows.length * rowH + padB;
    var plotW = W - padL - padR;

    var svg = svgEl("svg", {
      viewBox: "0 0 " + W + " " + H,
      role: "img",
      preserveAspectRatio: "xMinYMin meet"
    });

    function x(v) {
      return padL + ((v - axis.min) / (axis.max - axis.min)) * plotW;
    }

    rows.forEach(function (row, i) {
      var y = padT + i * rowH;
      var barY = y + 14;

      var label = svgEl("text", { x: 0, y: barY + 12, class: "chart-label" });
      label.textContent = row.label;
      svg.appendChild(label);

      svg.appendChild(svgEl("rect", {
        x: padL, y: barY, width: plotW, height: 16, rx: 2, class: "chart-bar-track"
      }));

      svg.appendChild(svgEl("rect", {
        x: x(row.from), y: barY,
        width: Math.max(2, x(row.to) - x(row.from)),
        height: 16, rx: 2, class: "chart-bar-fill"
      }));

      if (typeof row.marker === "number") {
        svg.appendChild(svgEl("line", {
          x1: x(row.marker), x2: x(row.marker),
          y1: barY - 5, y2: barY + 21,
          class: "chart-axis", "stroke-width": 2
        }));
      }

      var value = svgEl("text", { x: padL, y: barY - 5, class: "chart-value" });
      value.textContent = row.value;
      svg.appendChild(value);
    });

    var axisY = H - padB + 6;
    svg.appendChild(svgEl("line", {
      x1: padL, x2: W - padR, y1: axisY, y2: axisY, class: "chart-axis"
    }));

    (axis.ticks || []).forEach(function (t) {
      var tick = svgEl("text", { x: x(t), y: axisY + 15, class: "chart-value", "text-anchor": "middle" });
      tick.textContent = t + (axis.unit || "");
      svg.appendChild(tick);
    });

    return svg;
  }

  function chartBlock(title, note, svg) {
    var wrap = el("section", { class: "chart" });
    wrap.appendChild(el("h3", null, title));
    if (note) wrap.appendChild(el("p", { class: "chart-note" }, note));
    wrap.appendChild(svg);
    return wrap;
  }

  function initNumbers() {
    var host = $("#charts");
    if (!host) return;

    getJSON("/data/bedlington.json").then(function (d) {
      host.textContent = "";

      /* height, male vs female, on one axis */
      host.appendChild(chartBlock(
        "Height at the shoulder",
        "Breed standard ranges. The tick marks the preferred height for each sex.",
        rangeChart([
          {
            label: "Dogs (male)",
            from: d.height.male.min, to: d.height.male.max,
            marker: d.height.male.preferred,
            value: d.height.male.min + "–" + d.height.male.max + " in · preferred " + d.height.male.preferred + " in"
          },
          {
            label: "Bitches (female)",
            from: d.height.female.min, to: d.height.female.max,
            marker: d.height.female.preferred,
            value: d.height.female.min + "–" + d.height.female.max + " in · preferred " + d.height.female.preferred + " in"
          }
        ], { min: 14, max: 18.5, ticks: [14, 15, 16, 17, 18], unit: "″" })
      ));

      /* weight */
      host.appendChild(chartBlock(
        "Weight",
        "One range for the breed; the standard does not split it by sex.",
        rangeChart([
          {
            label: "All",
            from: d.weight.min, to: d.weight.max,
            value: d.weight.min + "–" + d.weight.max + " lb · " + d.weight.kg.min + "–" + d.weight.kg.max + " kg"
          }
        ], { min: 14, max: 26, ticks: [14, 17, 20, 23, 26], unit: " lb" })
      ));

      /* lifespan */
      host.appendChild(chartBlock(
        "Life expectancy",
        "The bar is the commonly quoted range; the tick is the mean from a 2024 UK study.",
        rangeChart([
          {
            label: "Years",
            from: d.lifespan.min, to: d.lifespan.max,
            marker: d.lifespan.uk_study_2024_mean,
            value: d.lifespan.min + "–" + d.lifespan.max + " years · study mean " + d.lifespan.uk_study_2024_mean
          }
        ], { min: 9, max: 18, ticks: [9, 11, 13, 15, 17], unit: "" })
      ));

      /* traits as 1–5 meters, drawn with the same range chart */
      host.appendChild(chartBlock(
        "Living with one, at a glance",
        d.traits_note,
        rangeChart(d.traits.map(function (t) {
          return { label: t.label, from: 0, to: t.value, value: t.note };
        }), { min: 0, max: 5, ticks: [0, 1, 2, 3, 4, 5], unit: "" })
      ));

      /* colour swatches */
      var swatches = el("ul", { class: "swatches" });
      d.colours.forEach(function (c) {
        var li = el("li", { class: "swatch" });
        var chip = el("div", { class: "swatch-chip" });
        chip.style.background = c.swatch;
        li.appendChild(chip);
        li.appendChild(el("h4", null, c.name));
        li.appendChild(el("p", null, c.note));
        swatches.appendChild(li);
      });
      var colourBlock = el("section", { class: "chart" });
      colourBlock.appendChild(el("h3", null, "Coat colours"));
      colourBlock.appendChild(el("p", { class: "chart-note" }, d.colour_note));
      colourBlock.appendChild(swatches);
      host.appendChild(colourBlock);

      /* the same data as a plain table, for anyone who wants the numbers */
      var table = el("table", { class: "data-table" });
      var thead = el("thead");
      var hrow = el("tr");
      ["Field", "Value"].forEach(function (h) { hrow.appendChild(el("th", null, h)); });
      thead.appendChild(hrow);
      table.appendChild(thead);

      var tbody = el("tbody");
      [
        ["Group", d.group],
        ["Former name", d.former_name],
        ["Origin", d.origin.town + ", " + d.origin.county + ", " + d.origin.country],
        ["Pedigree traced to", String(d.recognised.pedigree_traced_to)],
        ["Named “Bedlington”", String(d.recognised.named_bedlington)],
        ["AKC recognised", String(d.recognised.akc)],
        ["Height (male)", d.height.male.min + "–" + d.height.male.max + " in"],
        ["Height (female)", d.height.female.min + "–" + d.height.female.max + " in"],
        ["Weight", d.weight.min + "–" + d.weight.max + " lb (" + d.weight.kg.min + "–" + d.weight.kg.max + " kg)"],
        ["Life expectancy", d.lifespan.min + "–" + d.lifespan.max + " years"],
        ["Coat colours", d.colours.map(function (c) { return c.name; }).join(", ")],
        ["Health screen", d.health.headline + " (" + d.health.inheritance + ")"]
      ].forEach(function (pair) {
        var tr = el("tr");
        tr.appendChild(el("td", null, pair[0]));
        tr.appendChild(el("td", null, pair[1]));
        tbody.appendChild(tr);
      });
      table.appendChild(tbody);

      var tableWrap = el("div", { class: "table-scroll" });
      tableWrap.appendChild(table);

      var tableBlock = el("section", { class: "chart" });
      tableBlock.appendChild(el("h3", null, "Everything above, as a table"));
      tableBlock.appendChild(tableWrap);
      host.appendChild(tableBlock);

      /* sources */
      var sources = el("ul", { class: "downloads" });
      d.sources.forEach(function (s) {
        var li = el("li");
        var a = el("a", { href: s.url, rel: "noopener", target: "_blank" }, s.label);
        li.appendChild(a);
        sources.appendChild(li);
      });
      var sourceBlock = el("section", { class: "chart" });
      sourceBlock.appendChild(el("h3", null, "Where these numbers come from"));
      sourceBlock.appendChild(sources);
      host.appendChild(sourceBlock);
    }).catch(function (err) {
      fail(host, "Could not load the breed data (" + err.message + ").");
    });
  }

  /* ---------- blog index ---------- */

  function formatDate(iso) {
    var parts = String(iso).split("-");
    if (parts.length !== 3) return iso;
    var months = ["January", "February", "March", "April", "May", "June",
                  "July", "August", "September", "October", "November", "December"];
    return parseInt(parts[2], 10) + " " + months[parseInt(parts[1], 10) - 1] + " " + parts[0];
  }

  function initPostList() {
    var list = $("#post-list");
    if (!list) return;

    getJSON("/data/posts.json").then(function (data) {
      list.textContent = "";
      (data.posts || []).forEach(function (post) {
        var li = el("li");
        li.appendChild(el("p", { class: "post-meta" },
          formatDate(post.date) + " · " + post.reading_minutes + " min read"));
        var h2 = el("h2");
        h2.appendChild(el("a", { href: post.url }, post.title));
        li.appendChild(h2);
        li.appendChild(el("p", null, post.summary));
        list.appendChild(li);
      });
      if (!list.children.length) list.appendChild(el("li", null, "Nothing written yet."));
    }).catch(function (err) {
      fail(list.parentNode, "Could not load the post list (" + err.message + ").");
    });
  }

  /* ---------- site search -------------------------------------------
     The index is generated by tools/gen.py, so it can never drift from
     the pages as long as CI keeps checking it.                        */

  function snippet(text, terms) {
    var lower = text.toLowerCase();
    var at = -1;
    for (var i = 0; i < terms.length; i++) {
      at = lower.indexOf(terms[i]);
      if (at !== -1) break;
    }
    if (at === -1) at = 0;
    var start = Math.max(0, at - 70);
    var slice = text.slice(start, start + 220);
    return (start > 0 ? "…" : "") + slice + (start + 220 < text.length ? "…" : "");
  }

  function highlight(node, text, terms) {
    var lower = text.toLowerCase();
    var cuts = [];
    terms.forEach(function (term) {
      var from = 0, at;
      while ((at = lower.indexOf(term, from)) !== -1) {
        cuts.push([at, at + term.length]);
        from = at + term.length;
      }
    });
    cuts.sort(function (a, b) { return a[0] - b[0]; });

    var cursor = 0;
    cuts.forEach(function (cut) {
      if (cut[0] < cursor) return;
      node.appendChild(document.createTextNode(text.slice(cursor, cut[0])));
      node.appendChild(el("mark", null, text.slice(cut[0], cut[1])));
      cursor = cut[1];
    });
    node.appendChild(document.createTextNode(text.slice(cursor)));
  }

  function initSearch() {
    var input = $("#search-input");
    if (!input) return;
    var results = $("#search-results");
    var status = $("#search-status");
    var index = null;

    function run() {
      var query = input.value.trim().toLowerCase();
      results.textContent = "";

      if (!index) { status.textContent = "Loading the index…"; return; }
      if (query.length < 2) {
        status.textContent = index.length + " pages indexed. Type at least two characters.";
        return;
      }

      var terms = query.split(/\s+/);
      var hits = index.map(function (page) {
        var title = page.title.toLowerCase();
        var body = page.text.toLowerCase();
        var score = 0;
        terms.forEach(function (term) {
          if (title.indexOf(term) !== -1) score += 8;
          var from = 0, at, count = 0;
          while ((at = body.indexOf(term, from)) !== -1 && count < 20) {
            score += 1; count += 1; from = at + term.length;
          }
        });
        return { page: page, score: score };
      }).filter(function (h) { return h.score > 0; })
        .sort(function (a, b) { return b.score - a.score; });

      status.textContent = hits.length
        ? hits.length + (hits.length === 1 ? " page matches" : " pages match") + " “" + input.value.trim() + "”"
        : "Nothing matches “" + input.value.trim() + "”.";

      hits.forEach(function (hit) {
        var li = el("li");
        var h2 = el("h2");
        h2.appendChild(el("a", { href: hit.page.url }, hit.page.title));
        li.appendChild(h2);
        var p = el("p");
        highlight(p, snippet(hit.page.text, terms), terms);
        li.appendChild(p);
        results.appendChild(li);
      });
    }

    getJSON("/data/search-index.json").then(function (data) {
      index = data.pages || [];
      run();
    }).catch(function (err) {
      status.textContent = "Could not load the search index (" + err.message + ").";
    });

    input.addEventListener("input", run);

    var initial = new URLSearchParams(window.location.search).get("q");
    if (initial) input.value = initial;
  }

  /* ---------- last updated, from the GitHub API ----------------------
     Deliberately deferred until the footer is actually on screen, so
     opening a page still costs zero third-party requests.            */

  function initLastUpdated() {
    var slot = $("#last-updated");
    if (!slot || !("IntersectionObserver" in window)) return;

    var done = false;
    var observer = new IntersectionObserver(function (entries) {
      if (done || !entries.some(function (e) { return e.isIntersecting; })) return;
      done = true;
      observer.disconnect();

      getJSON("https://api.github.com/repos/" + REPO + "/commits?per_page=1")
        .then(function (commits) {
          if (!commits.length) return;
          var when = new Date(commits[0].commit.committer.date);
          var link = el("a", {
            href: commits[0].html_url,
            rel: "noopener",
            target: "_blank",
            "data-github-updated": ""
          }, when.toISOString().slice(0, 10));
          slot.textContent = "Last updated ";
          slot.appendChild(link);
        })
        .catch(function () {
          slot.textContent = "Source on GitHub";
        });
    }, { rootMargin: "120px" });

    observer.observe(slot);
  }

  /* ---------- offline support ----------------------------------------
     Skipped on localhost: during development a service worker just
     serves you yesterday's file and looks like a bug.                */

  function initServiceWorker() {
    if (!("serviceWorker" in navigator)) return;
    var host = window.location.hostname;
    if (host === "localhost" || host === "127.0.0.1" || host === "") return;
    navigator.serviceWorker.register("/sw.js").catch(function () { /* not fatal */ });
  }

  /* ---------- go ---------- */

  function boot() {
    initTheme();
    initEmbeds();
    initGallery();
    initNumbers();
    initPostList();
    initSearch();
    initLastUpdated();
    initServiceWorker();
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", boot);
  } else {
    boot();
  }
})();
