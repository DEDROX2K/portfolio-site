/* site.js — small shared behaviours: live clock, project filter,
   case-study table of contents, the stage selector, and iOS-style
   text selection with Copy / Highlight. */
(function () {
    "use strict";

    /* ---------- Shared helpers ---------- */

    // a bare key press: no modifiers, not typing, no viewer open
    function plainKey(e) {
        if (e.metaKey || e.ctrlKey || e.altKey || e.defaultPrevented) return false;
        var t = e.target;
        if (t && (t.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(t.tagName))) return false;
        if (document.querySelector("dialog[open], .stories:not([hidden])")) return false;
        return true;
    }

    // this page's URL, keeping the TL;DR choice so a shared link opens the same view
    function pageUrl(hash) {
        var tldr = document.documentElement.dataset.read === "tldr" && document.querySelector("[data-read-toggle]");
        return location.origin + location.pathname + (tldr ? "?tldr" : "") + (hash || "");
    }

    // analytics event (Plausible); a no-op when the script is blocked or absent
    function track(name, props) {
        try { if (typeof window.plausible === "function") window.plausible(name, props ? { props: props } : undefined); } catch (e) { }
    }
    var PAGE = location.pathname.replace(/^.*\//, "") || "home";

    /* Drafts: anything marked data-draft is hidden on the live site and shown,
       outlined, on localhost (or with ?drafts), so unfinished copy can live in
       the page without ever going public by accident. */
    (function () {
        var local = /^(localhost|127\.0\.0\.1|\[::1\]|0\.0\.0\.0)$/.test(location.hostname) || location.protocol === "file:";
        if (local || /[?&]drafts(=|&|$)/.test(location.search)) document.documentElement.classList.add("show-drafts");
        // sketch → screen slots show the file they expect until it exists
        document.querySelectorAll(".evo img").forEach(function (img) {
            var miss = function () {
                img.classList.add("is-missing");
                var fig = img.closest("figure");
                if (fig) fig.setAttribute("data-file", img.getAttribute("src"));
            };
            if (img.complete && !img.naturalWidth) miss();
            img.addEventListener("error", miss);
        });
    })();

    var toastEl, toastTimer;
    function toast(msg) {
        if (!toastEl) {
            toastEl = document.createElement("div");
            toastEl.className = "toast";
            toastEl.setAttribute("role", "status");
            document.body.appendChild(toastEl);
        }
        toastEl.textContent = msg;
        toastEl.classList.add("is-on");
        clearTimeout(toastTimer);
        toastTimer = setTimeout(function () { toastEl.classList.remove("is-on"); }, 2200);
    }

    function copyText(text, msg) {
        var done = function () { toast(msg || "Copied"); };
        if (navigator.clipboard && window.isSecureContext) {
            navigator.clipboard.writeText(text).then(done, fallback);
        } else fallback();
        function fallback() {
            var ta = document.createElement("textarea");
            ta.value = text;
            ta.setAttribute("readonly", "");
            ta.style.cssText = "position:fixed;opacity:0";
            document.body.appendChild(ta);
            ta.select();
            try { document.execCommand("copy"); done(); } catch (e) { toast("Couldn't copy. The link is in the address bar."); }
            ta.remove();
        }
    }

    var TZ = "Europe/London";

    /* ---------- Live clock + "what am I doing" line ---------- */
    function londonParts() {
        var fmt = new Intl.DateTimeFormat("en-GB", { timeZone: TZ, hour: "2-digit", minute: "2-digit", hour12: false });
        var str = fmt.format(new Date());
        return { str: str, hour: parseInt(str.slice(0, 2), 10) };
    }

    function activity(h) {
        if (h < 7) return "so I'm probably asleep. I'll reply in the morning.";
        if (h < 9) return "so I'm probably on my first coffee and reading through feedback.";
        if (h < 13) return "so I'm probably prototyping, testing, or figuring something out.";
        if (h < 14) return "so I'm probably at lunch, thinking about the thing I was prototyping.";
        if (h < 18) return "so I'm probably deep in a build or a design review.";
        if (h < 22) return "so I'm probably tinkering with a side project.";
        return "so I'm probably still up with one more tab open.";
    }

    function tick() {
        var p = londonParts();
        document.querySelectorAll("[data-clock]").forEach(function (el) {
            el.textContent = p.str;
            el.setAttribute("datetime", p.str);
        });
        document.querySelectorAll("[data-status]").forEach(function (el) {
            el.textContent = "It's " + p.str + " in London, " + activity(p.hour);
        });
    }
    tick();
    setInterval(tick, 15000);

    /* ---------- Project filter ---------- */
    var filter = document.querySelector("[data-filter]");
    if (filter) {
        var buttons = Array.prototype.slice.call(filter.querySelectorAll("button"));
        var thumb = filter.querySelector(".filter-thumb");
        var cards = Array.prototype.slice.call(document.querySelectorAll("[data-category]"));
        var count = document.querySelector("[data-count]");

        var moveThumb = function (btn) {
            if (!thumb || !btn) return;
            thumb.style.width = btn.offsetWidth + "px";
            thumb.style.transform = "translateX(" + btn.offsetLeft + "px)";
        };

        var apply = function (btn, animate) {
            var value = btn.getAttribute("data-value");
            buttons.forEach(function (b) { b.setAttribute("aria-pressed", b === btn ? "true" : "false"); });
            moveThumb(btn);
            var shown = 0;
            cards.forEach(function (card) {
                var match = value === "all" || card.getAttribute("data-category") === value;
                card.hidden = !match;
                card.classList.remove("is-entering");
                if (match) {
                    shown++;
                    if (animate) {
                        void card.offsetWidth;
                        card.style.animationDelay = (shown - 1) * 40 + "ms";
                        card.classList.add("is-entering");
                    }
                }
            });
            if (count) count.textContent = shown + (shown === 1 ? " project" : " projects");
            try { sessionStorage.setItem("workFilter", value); } catch (e) { }
            if (animate) {
                track("Work filter", { filter: value });
                // ?filter=case / ?filter=built, so a filtered view can be linked
                try { history.replaceState(null, "", location.pathname + (value === "all" ? "" : "?filter=" + value) + location.hash); } catch (e) { }
            }
        };

        buttons.forEach(function (b) { b.addEventListener("click", function () { apply(b, true); }); });

        var initial = buttons[0];
        try {
            var fromUrl = (location.search.match(/[?&]filter=([a-z]+)/) || [])[1];
            var saved = fromUrl || sessionStorage.getItem("workFilter");
            buttons.forEach(function (b) { if (b.getAttribute("data-value") === saved) initial = b; });
        } catch (e) { }

        // Position the thumb without animating on first paint.
        if (thumb) thumb.style.transition = "none";
        apply(initial, false);
        requestAnimationFrame(function () { if (thumb) thumb.style.transition = ""; });
        window.addEventListener("resize", function () {
            moveThumb(filter.querySelector('[aria-pressed="true"]'));
        });
        if (document.fonts && document.fonts.ready) {
            document.fonts.ready.then(function () { moveThumb(filter.querySelector('[aria-pressed="true"]')); });
        }
    }

    /* ---------- Case-study TOC: highlight the section in view ---------- */
    var tocLinks = Array.prototype.slice.call(document.querySelectorAll(".toc a"));
    if (tocLinks.length) {
        var sections = tocLinks
            .map(function (a) { return document.getElementById(a.getAttribute("href").slice(1)); })
            .filter(Boolean);

        var setActive = function (id) {
            tocLinks.forEach(function (a) {
                var on = a.getAttribute("href") === "#" + id;
                a.classList.toggle("is-active", on);
                if (on) a.setAttribute("aria-current", "true"); else a.removeAttribute("aria-current");
            });
            document.dispatchEvent(new CustomEvent("tocchange", { detail: id }));
        };

        var update = function () {
            var line = window.innerHeight * 0.3;
            // sections hidden by the TL;DR view have no boxes, so skip them
            var shown = sections.filter(function (s) { return s.getClientRects().length > 0; });
            var current = shown[0];
            shown.forEach(function (s) { if (s.getBoundingClientRect().top <= line) current = s; });
            // At the very bottom, the last section wins even if it's short.
            if (window.innerHeight + window.scrollY >= document.documentElement.scrollHeight - 4) {
                current = shown[shown.length - 1];
            }
            if (current) setActive(current.id);
        };

        window.addEventListener("scroll", update, { passive: true });
        window.addEventListener("resize", update);
        document.addEventListener("readmode", update);
        update();
    }

    /* ---------- Case study: Full / TL;DR reading length ----------
       Sections marked data-tldr stay in the short read; everything else, and
       anything marked data-full inside a kept section, is hidden by CSS.
       State lives on <html data-read> and in localStorage. */
    (function () {
        var seg = document.querySelector("[data-read-toggle]");
        var body = document.querySelector(".case-body.has-tldr");
        if (!seg || !body) return;
        var root = document.documentElement;
        var buttons = Array.prototype.slice.call(seg.querySelectorAll("[data-read-btn]"));

        // mark TOC rows whose section only exists in the full read
        document.querySelectorAll(".toc a").forEach(function (a) {
            var s = document.getElementById(a.getAttribute("href").slice(1));
            if (s && !s.hasAttribute("data-tldr")) a.parentNode.classList.add("is-full-only");
        });

        // reading time for both lengths (mockup text inside frames doesn't count)
        var note = document.querySelector("[data-read-time]");
        if (note) {
            var count = function (el) {
                var c = el.cloneNode(true);
                c.querySelectorAll('[aria-hidden="true"], .cs-frame, svg, script' + (root.classList.contains("show-drafts") ? "" : ", [data-draft]")).forEach(function (n) { n.remove(); });
                return (c.textContent.match(/\S+/g) || []).length;
            };
            var all = 0, short = 0;
            Array.prototype.forEach.call(body.querySelectorAll(":scope > .case-section"), function (s) {
                var n = count(s);
                all += n;
                if (s.hasAttribute("data-tldr")) {
                    short += n;
                    s.querySelectorAll("[data-full]").forEach(function (f) { short -= count(f); });
                }
            });
            var mins = function (w) { return Math.max(1, Math.round(w / 230)) + " min read"; };
            note.innerHTML = '<span class="is-full">' + mins(all) + '</span><span class="is-tldr">' + mins(short) + "</span>" +
                '<button type="button" class="read-share">Copy link<span class="is-tldr"> to TL;DR</span></button>';
            note.querySelector(".read-share").addEventListener("click", function () {
                copyText(pageUrl(), "Link copied" + (root.dataset.read === "tldr" ? ", opens the TL;DR" : ""));
                track("Link copied", { kind: root.dataset.read === "tldr" ? "tldr" : "full", page: PAGE });
            });
        }

        // closing card for the short read
        var end = document.createElement("div");
        end.className = "tldr-end";
        end.innerHTML = "<p>That's the short version.</p>" +
            '<button type="button" class="tldr-more">Read the full case study</button>';
        body.insertBefore(end, body.querySelector(":scope > .case-pager"));

        function sync() {
            var mode = root.dataset.read === "tldr" ? "tldr" : "full";
            buttons.forEach(function (b) { b.setAttribute("aria-pressed", b.getAttribute("data-read-btn") === mode ? "true" : "false"); });
        }
        function set(mode, keepPlace) {
            if (mode === (root.dataset.read === "tldr" ? "tldr" : "full")) return;
            var anchor = document.querySelector(".toc a.is-active");
            anchor = anchor && document.getElementById(anchor.getAttribute("href").slice(1));
            if (mode === "tldr") root.dataset.read = "tldr"; else delete root.dataset.read;
            try { localStorage.setItem("read", mode); } catch (e) { }
            try { history.replaceState(null, "", pageUrl(location.hash)); } catch (e) { }
            track("Read mode", { mode: mode, page: PAGE });
            sync();
            document.dispatchEvent(new Event("readmode"));
            // stay on the same section, or the next one that survived the switch
            if (!keepPlace || !anchor) return;
            var to = anchor;
            while (to && !to.getClientRects().length) to = to.nextElementSibling;
            if (to && to.classList.contains("case-section")) to.scrollIntoView({ block: "start" });
            else window.scrollTo({ top: 0 });
        }
        buttons.forEach(function (b) {
            b.addEventListener("click", function () { set(b.getAttribute("data-read-btn"), true); });
        });
        end.querySelector("button").addEventListener("click", function () {
            var after = document.querySelector(".case-intro + .case-section");
            set("full", false);
            if (after) after.scrollIntoView({ behavior: "smooth", block: "start" });
        });
        sync();
        document.addEventListener("keydown", function (e) {
            if (!plainKey(e) || e.key.toLowerCase() !== "t") return;
            set(root.dataset.read === "tldr" ? "full" : "tldr", true);
        });
    })();

    /* ---------- Stage selector (tabs) ---------- */
    document.querySelectorAll(".stages").forEach(function (root) {
        var tabs = Array.prototype.slice.call(root.querySelectorAll(".stage-tab"));
        var panels = Array.prototype.slice.call(root.querySelectorAll(".stage-panel"));
        var select = function (i, focus) {
            tabs.forEach(function (t, j) {
                var on = i === j;
                t.setAttribute("aria-selected", on ? "true" : "false");
                t.tabIndex = on ? 0 : -1;
                panels[j].hidden = !on;
                panels[j].classList.toggle("is-entering", on);
            });
            if (focus) tabs[i].focus();
        };
        tabs.forEach(function (t, i) {
            t.addEventListener("click", function () { select(i); });
            t.addEventListener("keydown", function (e) {
                if (e.key === "ArrowRight") { e.preventDefault(); select((i + 1) % tabs.length, true); }
                if (e.key === "ArrowLeft") { e.preventDefault(); select((i - 1 + tabs.length) % tabs.length, true); }
            });
        });
        select(0);
    });

    /* ---------- About photo carousel: drag, swipe, arrow keys, auto-advance ---------- */
    document.querySelectorAll("[data-carousel]").forEach(function (root) {
        var track = root.querySelector(".about-carousel-track");
        var slides = track ? track.children : [];
        var n = slides.length;
        if (n < 2) return;

        var dotsBox = root.querySelector(".about-carousel-dots");
        var dots = [];
        for (var d = 0; d < n; d++) {
            var dot = document.createElement("span");
            dotsBox.appendChild(dot);
            dots.push(dot);
        }

        var index = 0, startX = 0, dx = 0, dragging = false, timer = 0;
        var reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

        function render() {
            var w = root.clientWidth || 1;
            // Resist dragging past the first and last photo.
            var edge = (index === 0 && dx > 0) || (index === n - 1 && dx < 0);
            var offset = edge ? dx * 0.35 : dx;
            track.style.transform = "translateX(" + (-index * 100 + (offset / w) * 100) + "%)";
            dots.forEach(function (el, i) { el.classList.toggle("is-active", i === index); });
        }
        function go(i) { index = Math.max(0, Math.min(n - 1, i)); dx = 0; render(); }

        function stopAuto() { clearInterval(timer); timer = 0; }
        function startAuto() {
            if (reduce || timer) return;
            timer = setInterval(function () { if (!document.hidden) go(index === n - 1 ? 0 : index + 1); }, 3500);
        }

        root.addEventListener("pointerdown", function (e) {
            if (e.button !== 0) return;
            dragging = true; startX = e.clientX; dx = 0;
            root.classList.add("is-dragging");
            root.setPointerCapture(e.pointerId);
            stopAuto();
        });
        root.addEventListener("pointermove", function (e) {
            if (!dragging) return;
            dx = e.clientX - startX;
            render();
        });
        function end() {
            if (!dragging) return;
            dragging = false;
            root.classList.remove("is-dragging");
            var limit = Math.min(80, root.clientWidth * 0.15);
            if (dx < -limit) go(index + 1);
            else if (dx > limit) go(index - 1);
            else go(index);
        }
        root.addEventListener("pointerup", end);
        root.addEventListener("pointercancel", end);

        root.addEventListener("keydown", function (e) {
            if (e.key === "ArrowRight") { e.preventDefault(); stopAuto(); go(index + 1); }
            if (e.key === "ArrowLeft") { e.preventDefault(); stopAuto(); go(index - 1); }
        });
        root.addEventListener("mouseenter", stopAuto);

        render();
        startAuto();
    });

    /* ---------- Shared helpers: icons + reading preferences ---------- */

    // Kubai line icons, "Solid" variant (MIT). They animate when their parent is hovered.
    function makeIcon(name, size) {
        var el = document.createElement("kubai-icon");
        el.setAttribute("name", name);
        el.setAttribute("icon-style", "line");
        el.setAttribute("variant", "fill");
        el.setAttribute("trigger", "parent");
        el.setAttribute("size", String(size || 16));
        el.setAttribute("aria-hidden", "true");
        return el;
    }

    // Preferences live on <html data-*> and in localStorage. The inline script in
    // each page's <head> applies them before first paint.
    var PREF_DEFAULTS = { theme: "light", font: "default", size: "default", motion: "default" };
    var FONT_CSS = {
        serif: "https://fonts.googleapis.com/css2?family=Literata:opsz,wght@7..72,400;7..72,500&display=swap",
        hyperlegible: "https://fonts.googleapis.com/css2?family=Atkinson+Hyperlegible:wght@400;700&display=swap",
        lexend: "https://fonts.googleapis.com/css2?family=Lexend:wght@400;500&display=swap",
        dyslexic: "https://cdn.jsdelivr.net/npm/@fontsource/opendyslexic@5.3.0/index.css"
    };
    function loadFont(key) {
        var href = FONT_CSS[key];
        if (!href || document.querySelector('link[href="' + href + '"]')) return;
        var l = document.createElement("link");
        l.rel = "stylesheet";
        l.href = href;
        document.head.appendChild(l);
    }
    function getPref(k) { return document.documentElement.dataset[k] || PREF_DEFAULTS[k]; }
    function setPref(k, v) {
        var root = document.documentElement;
        if (v === PREF_DEFAULTS[k]) delete root.dataset[k]; else root.dataset[k] = v;
        try { localStorage.setItem(k, v); } catch (e) { }
        if (k === "font") loadFont(v);
        document.dispatchEvent(new CustomEvent("prefchange", { detail: { key: k, value: v } }));
    }
    loadFont(getPref("font"));

    /* ---------- Icons: added to links across the site ---------- */
    (function () {
        var s = document.createElement("script");
        s.type = "module";
        s.src = "https://cdn.jsdelivr.net/npm/kubai-icons@0.16.0/dist/cdn/element.js";
        document.head.appendChild(s);

        var icon = makeIcon;
        document.querySelectorAll(".verified").forEach(function (el) {
            el.appendChild(icon("badge-verified"));
        });
        document.querySelectorAll(".arrow-out").forEach(function (el) {
            el.appendChild(icon(el.classList.contains("is-mail") ? "mail" : "external-link"));
        });
        document.querySelectorAll(".back-link").forEach(function (el) {
            el.insertBefore(icon("square-arrow-left"), el.firstChild);
        });
        document.querySelectorAll(".prev-case span").forEach(function (el) {
            var i = icon("square-arrow-left");
            i.setAttribute("size", "20");
            el.insertBefore(i, el.firstChild);
        });
        document.querySelectorAll(".next-case span").forEach(function (el) {
            var i = icon("square-arrow-right");
            i.setAttribute("size", "20");
            el.appendChild(i);
        });
    })();

    /* ---------- Before / after reveal (drag, arrow keys, or the Before/Split/After buttons) ---------- */
    document.querySelectorAll("[data-compare]").forEach(function (root) {
        var range = root.querySelector("input[type=range]");
        var buttons = Array.prototype.slice.call(root.querySelectorAll("[data-pos]"));
        var timer = 0;
        function set(v, animate) {
            v = Math.max(0, Math.min(100, Number(v)));
            if (animate) {
                root.classList.add("is-animating");
                clearTimeout(timer);
                timer = setTimeout(function () { root.classList.remove("is-animating"); }, 620);
            }
            root.style.setProperty("--pos", v + "%");
            range.value = v;
            range.setAttribute("aria-valuetext", v >= 98 ? "Before" : v <= 2 ? "After" : "Split view");
            buttons.forEach(function (b) {
                var p = Number(b.getAttribute("data-pos"));
                b.setAttribute("aria-pressed", Math.abs(p - v) < 2 ? "true" : "false");
            });
        }
        range.addEventListener("input", function () { set(range.value, false); });
        buttons.forEach(function (b) {
            b.addEventListener("click", function () { set(b.getAttribute("data-pos"), true); });
        });
        set(range.value, false);
    });

    /* ---------- Impact bars + counters: run once when scrolled into view ---------- */
    document.querySelectorAll("[data-impact]").forEach(function (root) {
        var counters = Array.prototype.slice.call(root.querySelectorAll("[data-count-to]"));
        var reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches ||
            document.documentElement.dataset.motion === "reduce";
        function format(n, decimals) {
            return decimals ? n.toFixed(decimals) : Math.round(n).toLocaleString("en-IN");
        }
        function run() {
            root.classList.add("is-in");
            counters.forEach(function (el) {
                var to = parseFloat(el.getAttribute("data-count-to"));
                var dec = parseInt(el.getAttribute("data-decimals") || "0", 10);
                if (reduce) { el.textContent = format(to, dec); return; }
                var start = performance.now(), dur = 1200;
                (function step(t) {
                    var k = Math.min(1, (t - start) / dur);
                    var eased = 1 - Math.pow(1 - k, 3);
                    el.textContent = format(to * eased, dec);
                    if (k < 1) requestAnimationFrame(step);
                })(start);
            });
        }
        if (!("IntersectionObserver" in window)) { run(); return; }
        var io = new IntersectionObserver(function (entries) {
            if (entries.some(function (e) { return e.isIntersecting; })) { run(); io.disconnect(); }
        }, { threshold: 0.35 });
        io.observe(root);
    });

    /* ---------- Principle chips open their glossary entry ---------- */
    document.addEventListener("click", function (e) {
        var a = e.target.closest && e.target.closest('a[href^="#p-"]');
        if (!a) return;
        var target = document.getElementById(a.getAttribute("href").slice(1));
        if (!target || target.tagName !== "DETAILS") return;
        e.preventDefault();
        if (!target.getClientRects().length) {
            var full = document.querySelector('[data-read-btn="full"]');
            if (full) full.click();
        }
        target.open = true;
        target.scrollIntoView({ behavior: "smooth", block: "center" });
        target.classList.add("is-flash");
        setTimeout(function () { target.classList.remove("is-flash"); }, 1400);
        history.replaceState(null, "", "#" + target.id);
    });
    if (/^#p-/.test(location.hash)) {
        var g = document.getElementById(location.hash.slice(1));
        if (g && g.tagName === "DETAILS") g.open = true;
    }


    /* ---------- Escalation simulator: P1 nurse -> P2 supervisor -> P3 doctor ---------- */
    document.querySelectorAll("[data-escalation]").forEach(function (root) {
        var WINDOW = 8000; // each level gets the 8-second SOS window in this demo
        var lanes = Array.prototype.slice.call(root.querySelectorAll(".rp-lane"));
        var trigger = root.querySelector("[data-trigger]");
        var ack = root.querySelector("[data-ack]");
        var reset = root.querySelector("[data-reset]");
        var log = root.querySelector(".rp-log");
        var level = -1, started = 0, total = 0, raf = 0;
        function lane(i) { return lanes[i]; }
        function setText(i, t) { lane(i).querySelector(".rp-state").textContent = t; }
        function setBar(i, k) { lane(i).querySelector(".rp-meter i").style.width = (k * 100).toFixed(1) + "%"; }
        function clear() {
            cancelAnimationFrame(raf);
            lanes.forEach(function (l, i) {
                l.classList.remove("is-ringing", "is-missed", "is-done");
                setBar(i, 0);
                setText(i, "Waiting");
            });
            level = -1;
        }
        function ring(i) {
            level = i;
            started = performance.now();
            lane(i).classList.add("is-ringing");
            log.textContent = i === 0 ? "SOS raised. Nurse alerted." : "No answer. Passed to " + lane(i).querySelector("b").textContent.toLowerCase() + ".";
            tick();
        }
        function tick() {
            raf = requestAnimationFrame(function step(t) {
                var el = t - started;
                var k = Math.min(1, el / WINDOW);
                setBar(level, k);
                setText(level, "Ringing · " + Math.max(0, (WINDOW - el) / 1000).toFixed(1) + "s left");
                if (k < 1) { raf = requestAnimationFrame(step); return; }
                total += WINDOW;
                if (level < lanes.length - 1) {
                    lane(level).classList.remove("is-ringing");
                    lane(level).classList.add("is-missed");
                    setText(level, "Missed · auto-escalated");
                    ring(level + 1);
                } else {
                    started = performance.now();
                    setText(level, "Still paging…");
                    log.textContent = "Doctor keeps being paged until someone responds.";
                    raf = requestAnimationFrame(step);
                }
            });
        }
        trigger.addEventListener("click", function () {
            clear();
            total = 0;
            trigger.disabled = true;
            ack.disabled = false;
            ring(0);
        });
        ack.addEventListener("click", function () {
            if (level < 0) return;
            cancelAnimationFrame(raf);
            var secs = ((total + performance.now() - started) / 1000).toFixed(1);
            var l = lane(level);
            l.classList.remove("is-ringing");
            l.classList.add("is-done");
            setText(level, "Responded");
            log.textContent = "Handled by " + l.querySelector("b").textContent.toLowerCase() + " after " + secs + "s.";
            ack.disabled = true;
            trigger.disabled = false;
            level = -1;
        });
        reset.addEventListener("click", function () {
            clear();
            trigger.disabled = false;
            ack.disabled = true;
            log.textContent = "Press Trigger SOS to start.";
        });
        clear();
    });

    /* ---------- Dashboard states: Normal / Vital alert / SOS / Doctor ---------- */
    document.querySelectorAll("[data-states]").forEach(function (wrap) {
        var dash = wrap.querySelector(".rp-dash");
        var buttons = Array.prototype.slice.call(wrap.querySelectorAll("[data-state-btn]"));
        var count = wrap.querySelector(".rp-count");
        var timer = 0;
        function countdown() {
            clearInterval(timer);
            if (!count) return;
            var left = 8;
            var draw = function () {
                count.style.setProperty("--p", String(left / 8));
                count.querySelector("b").textContent = left;
            };
            draw();
            timer = setInterval(function () {
                left = left <= 0 ? 8 : left - 1;
                draw();
            }, 1000);
        }
        function set(state) {
            dash.setAttribute("data-state", state);
            buttons.forEach(function (b) { b.setAttribute("aria-pressed", b.getAttribute("data-state-btn") === state ? "true" : "false"); });
            if (state === "sos") countdown(); else clearInterval(timer);
        }
        buttons.forEach(function (b) { b.addEventListener("click", function () { set(b.getAttribute("data-state-btn")); }); });
        set(dash.getAttribute("data-state") || "normal");
    });

    /* ---------- Reaction-time test: find the alert in two wireframe variants ---------- */
    document.querySelectorAll("[data-spot]").forEach(function (root) {
        var grid = root.querySelector(".rp-tiles");
        var cover = root.querySelector(".rp-cover");
        var start = root.querySelector("[data-start]");
        var msg = cover.querySelector("p");
        var out = { a: root.querySelector('[data-result="a"]'), b: root.querySelector('[data-result="b"]') };
        var names = ["A. Patel", "J. Okoro", "M. Ellis", "R. Chen", "S. Murphy", "D. Novak", "L. Haddad", "K. Brown", "T. Silva", "P. Walsh", "E. Kaur", "H. Jones"];
        var order = ["a", "b"], round = 0, t0 = 0;
        function rnd(a, b) { return Math.round(a + Math.random() * (b - a)); }
        function build(variant) {
            root.setAttribute("data-variant", variant);
            grid.innerHTML = "";
            var hot = rnd(0, names.length - 1);
            names.forEach(function (n, i) {
                var b = document.createElement("button");
                b.type = "button";
                b.className = "rp-tile" + (i === hot ? " is-alert" : "");
                var hr = i === hot ? rnd(124, 138) : rnd(62, 96);
                b.innerHTML = "<b>" + n + "</b>" +
                    "<span>HR <em" + (i === hot ? ' class="is-hot"' : "") + ">" + hr + "</em></span>" +
                    "<span>SpO₂ <em>" + rnd(94, 99) + "%</em></span>" +
                    "<span>BP <em>" + rnd(112, 134) + "/" + rnd(70, 86) + "</em></span>" +
                    "<span>Temp <em>" + (36 + Math.random()).toFixed(1) + "°</em></span>";
                b.setAttribute("aria-label", n + (i === hot ? ", alert" : ""));
                grid.appendChild(b);
            });
        }
        grid.addEventListener("click", function (e) {
            var tile = e.target.closest(".rp-tile");
            if (!tile || !t0) return;
            if (!tile.classList.contains("is-alert")) {
                tile.classList.remove("is-wrong");
                void tile.offsetWidth;
                tile.classList.add("is-wrong");
                return;
            }
            var ms = Math.round(performance.now() - t0);
            t0 = 0;
            var v = order[round];
            out[v].textContent = (ms / 1000).toFixed(2) + "s";
            round++;
            if (round < order.length) {
                msg.textContent = "Nice. Now the same job on variant B, where the alert is promoted to the top.";
                start.textContent = "Start variant B";
            } else {
                var faster = parseFloat(out.b.textContent) < parseFloat(out.a.textContent);
                msg.textContent = (faster ? "You were faster on B. " : "Close one. ") + "With clinical staff, the alert-first layout was consistently quicker, and it shaped the final design.";
                start.textContent = "Try again";
                round = 0;
            }
            cover.hidden = false;
        });
        start.addEventListener("click", function () {
            if (round === 0 && start.textContent === "Try again") { out.a.textContent = "–"; out.b.textContent = "–"; }
            build(order[round]);
            cover.hidden = true;
            t0 = performance.now();
        });
        build("a");
    });


    /* ---------- Header: hide on scroll down, show on scroll up ---------- */
    (function () {
        var header = document.querySelector(".site-header");
        if (!header) return;
        var lastY = window.scrollY;
        function update() {
            var y = Math.max(0, window.scrollY);
            var dy = y - lastY;
            if (Math.abs(dy) < 6) return; // ignore tiny jitters
            // on the home page the header sits under the full-screen intro, so it
            // only starts hiding once it has actually stuck to the top
            var intro = document.querySelector(".intro");
            var start = intro ? intro.offsetHeight : 0;
            var hide = dy > 0 && y > start + header.offsetHeight;
            header.classList.toggle("is-hidden", hide);
            lastY = y;
        }
        window.addEventListener("scroll", update, { passive: true });
    })();

    /* ---------- Collapsible left panel ---------- */
    (function () {
        var side = document.querySelector(".shell > .side");
        var id = document.querySelector(".site-id");
        if (!side || !id) return;
        var isCase = side.classList.contains("case-side");
        var root = document.documentElement;
        side.id = side.id || "side-panel";
        var btn = document.createElement("button");
        btn.type = "button";
        btn.className = "side-toggle";
        btn.setAttribute("aria-controls", side.id);
        btn.innerHTML = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" aria-hidden="true">' +
            '<path d="M8 3.5h8c2.8 0 4.5 1.7 4.5 4.5v8c0 2.8-1.7 4.5-4.5 4.5H8c-2.8 0-4.5-1.7-4.5-4.5V8c0-2.8 1.7-4.5 4.5-4.5Z"/>' +
            '<path d="M9.5 3.5v17"/><rect class="pane" x="5.5" y="6" width="2" height="12" rx="1" fill="currentColor" stroke="none"/></svg>';
        var bar = side.querySelector(".case-bar");
        if (bar) bar.appendChild(btn); else id.insertBefore(btn, id.firstChild);
        function sync() {
            var collapsed = root.dataset.side === "collapsed";
            btn.setAttribute("aria-expanded", collapsed ? "false" : "true");
            btn.setAttribute("aria-label", collapsed ? "Show side panel" : "Hide side panel");
            btn.title = collapsed ? "Show panel ( [ )" : "Hide panel ( [ )";
            var hide = collapsed && window.matchMedia("(min-width: 901px)").matches;
            if (isCase) {
                // the back link and this button stay usable in the slim rail
                Array.prototype.forEach.call(side.children, function (el) {
                    if (!el.classList.contains("case-bar")) el.inert = hide;
                });
            } else {
                side.inert = hide;
            }
        }
        function toggle() {
            var next = root.dataset.side === "collapsed" ? "open" : "collapsed";
            if (next === "open") delete root.dataset.side; else root.dataset.side = next;
            try { localStorage.setItem("side", next); } catch (e) { }
            sync();
            // the filter thumb measures its buttons, so let it re-measure after the grid moves
            setTimeout(function () { window.dispatchEvent(new Event("resize")); }, 420);
        }
        btn.addEventListener("click", toggle);
        document.addEventListener("keydown", function (e) {
            if (e.key !== "[" || !plainKey(e)) return;
            toggle();
        });
        window.addEventListener("resize", sync);
        sync();
    })();

    // #region pullcord  (shown on play-pullcord.html, which reads this file between the region markers)
    /* ---------- Theme + pull cord (a lamp switch for dark mode) ---------- */
    (function () {
        var root = document.documentElement;
        var reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
        // the cord only hangs where people settle in to read: case studies, the
        // about page, and its own demo page (opted in with <body data-pullcord>)
        if (!document.querySelector(".case-body, main.about, [data-pullcord]")) return;

        var cord = document.createElement("div");
        cord.className = "pullcord";
        cord.innerHTML = '<svg class="pullcord-rope" aria-hidden="true"><path d=""/></svg>' +
            '<button class="pullcord-knob" type="button" aria-label="Turn the lights off"></button>';
        document.body.appendChild(cord);
        var path = cord.querySelector("path");
        var knob = cord.querySelector("button");

        // Any dark reading theme counts as "lights off"; pulling goes back to light grey.
        function isDark() { return /^(dark|oled|slate)$/.test(getPref("theme")); }
        function syncKnob() {
            knob.setAttribute("aria-pressed", String(isDark()));
            knob.setAttribute("aria-label", isDark() ? "Turn the lights on" : "Turn the lights off");
        }
        function toggleTheme() {
            setPref("theme", isDark() ? "light" : "dark");
            if (navigator.vibrate) { try { navigator.vibrate(8); } catch (e) { } }
            pulls++;
            document.dispatchEvent(new CustomEvent("pullcord:pull", { detail: { pulls: pulls, dark: isDark() } }));
        }
        document.addEventListener("prefchange", syncKnob);
        syncKnob();

        // Verlet rope: anchored at the top, knob on the last point.
        // CFG is read fresh every frame, so the sliders on play-pullcord.html apply to the very next pull.
        var DEFAULTS = { gravity: 1250, damping: 0.94, stiffness: 20, travel: 26 };
        var CFG = {};
        Object.keys(DEFAULTS).forEach(function (k) { CFG[k] = DEFAULTS[k]; });
        var SEG = 12, LEN = 8, FRICTION = 0.985, REST = SEG * LEN, OFFSET = 100;
        function actuate() { return REST + CFG.travel * 0.7; }
        var pulls = 0;
        var pts = [];
        for (var i = 0; i <= SEG; i++) {
            var nudge = reduce ? 0 : (i / SEG) * 3; // a small swing on load
            pts.push({ x: 0, y: i * LEN, px: nudge, py: i * LEN });
        }

        var dragging = false, target = null, grab = { x: 0, y: 0 }, start = { x: 0, y: 0 };
        var armed = true, moved = false, released = false, raf = 0, last = 0, keep = 0;

        function step(dt) {
            var g = CFG.gravity * dt * dt, k = released ? CFG.damping : FRICTION, end = pts[SEG];
            for (var i = 1; i <= SEG; i++) {
                var p = pts[i], vx = (p.x - p.px) * k, vy = (p.y - p.py) * k;
                p.px = p.x; p.py = p.y; p.x += vx; p.y += vy + g;
            }
            for (var n = 0, iter = Math.round(CFG.stiffness); n < iter; n++) {
                pts[0].x = 0; pts[0].y = 0;
                if (dragging) { end.x = target.x; end.y = target.y; }
                for (var j = 0; j < SEG; j++) {
                    var a = pts[j], b = pts[j + 1];
                    var dx = b.x - a.x, dy = b.y - a.y, d = Math.sqrt(dx * dx + dy * dy) || 1e-4;
                    var diff = (d - LEN) / d;
                    var aw = j === 0 ? 0 : 0.5, bw = (dragging && j + 1 === SEG) ? 0 : 1 - aw;
                    if (aw + bw === 0) continue;
                    var s = 1 / (aw + bw);
                    a.x += dx * diff * aw * s; a.y += dy * diff * aw * s;
                    b.x -= dx * diff * bw * s; b.y -= dy * diff * bw * s;
                }
            }
            if (released && Math.hypot(end.x, end.y) <= REST + 2) released = false;
        }

        function render() {
            var d = "M" + OFFSET + " 0";
            for (var i = 1; i < SEG; i++) {
                var mx = (pts[i].x + pts[i + 1].x) / 2 + OFFSET, my = (pts[i].y + pts[i + 1].y) / 2;
                d += " Q" + (pts[i].x + OFFSET).toFixed(2) + " " + pts[i].y.toFixed(2) + " " + mx.toFixed(2) + " " + my.toFixed(2);
            }
            var e = pts[SEG], p = pts[SEG - 1];
            d += " L" + (e.x + OFFSET).toFixed(2) + " " + e.y.toFixed(2);
            path.setAttribute("d", d);
            var ang = Math.atan2(e.x - p.x, e.y - p.y) * -180 / Math.PI;
            knob.style.transformOrigin = "8px 2px";
            knob.style.transform = "translate(" + (e.x - 8) + "px," + (e.y - 2) + "px) rotate(" + ang.toFixed(2) + "deg)";
        }

        function moving() {
            for (var i = 1; i <= SEG; i++) {
                if (Math.abs(pts[i].x - pts[i].px) + Math.abs(pts[i].y - pts[i].py) > 0.02) return true;
            }
            return false;
        }
        function loop(t) {
            var dt = Math.min(0.033, last ? (t - last) / 1000 : 1 / 60);
            last = t;
            step(dt);
            render();
            if (keep > 0) keep--;
            if (dragging || keep > 0 || moving()) raf = requestAnimationFrame(loop);
            else { raf = 0; last = 0; }
        }
        function wake() { keep = 30; if (!raf) raf = requestAnimationFrame(loop); }

        knob.addEventListener("pointerdown", function (e) {
            if (e.button !== 0) return;
            e.preventDefault();
            var r = cord.getBoundingClientRect(), end = pts[SEG];
            grab.x = e.clientX - r.left - end.x; grab.y = e.clientY - r.top - end.y;
            start.x = e.clientX; start.y = e.clientY;
            dragging = true; moved = false; armed = true;
            target = { x: end.x, y: end.y };
            knob.setPointerCapture(e.pointerId);
            wake();
        });
        knob.addEventListener("pointermove", function (e) {
            if (!dragging) return;
            if (Math.abs(e.clientX - start.x) + Math.abs(e.clientY - start.y) > 4) moved = true;
            var r = cord.getBoundingClientRect();
            var x = e.clientX - r.left - grab.x, y = Math.max(4, e.clientY - r.top - grab.y);
            var dist = Math.hypot(x, y), max = REST + CFG.travel;
            if (dist > max) { x *= max / dist; y *= max / dist; dist = max; }
            target.x = x; target.y = y;
            // fires mid-pull, like a real pull switch detenting
            if (armed && dist >= actuate()) { armed = false; toggleTheme(); }
            else if (!armed && dist < REST + 6) armed = true;
            wake();
        });
        function release() {
            if (!dragging) return;
            dragging = false; target = null; released = true;
            wake();
        }
        knob.addEventListener("pointerup", release);
        knob.addEventListener("pointercancel", release);
        // Click, Enter or Space also pulls it, with a small tug
        knob.addEventListener("click", function () {
            if (moved) { moved = false; return; }
            toggleTheme();
            for (var i = 1; i <= SEG; i++) pts[i].py -= (i / SEG) * 12;
            wake();
        });

        render();
        wake();

        // small API for the Play page: live tuning and a nudge to show the cord off
        window.PullCord = {
            config: CFG,
            defaults: DEFAULTS,
            isDark: isDark,
            nudge: function () {
                for (var i = 1; i <= SEG; i++) pts[i].px += (i / SEG) * 10;
                wake();
            }
        };
    })();
    // #endregion pullcord

    /* ---------- Stories: tap the avatar to open ----------
       Add slides here. src: image path (leave "" for a grey stand-in),
       date: bold label, caption: muted text after it, location: chip at the bottom. */
    var STORIES = [
        { src: "", date: "Nov 2026", caption: "", location: "London, UK" },
        { src: "", date: "Oct 2026", caption: "", location: "" },
        { src: "", date: "Sep 2026", caption: "", location: "" }
    ];
    var STORY_MS = 5000;

    (function () {
        var rings = Array.prototype.slice.call(document.querySelectorAll("[data-stories]"));
        if (!rings.length || !STORIES.length) return;

        var SEEN_KEY = "stories-seen";
        var signature = STORIES.map(function (s) { return s.src + s.date; }).join("|");
        function markRings() {
            var seen = false;
            try { seen = localStorage.getItem(SEEN_KEY) === signature; } catch (e) { }
            rings.forEach(function (r) { r.classList.toggle("is-seen", seen); });
        }
        markRings();

        var ov = document.createElement("div");
        ov.className = "stories";
        ov.hidden = true;
        ov.setAttribute("role", "dialog");
        ov.setAttribute("aria-modal", "true");
        ov.setAttribute("aria-label", "Stories");
        ov.innerHTML =
            '<div class="story-stage">' +
            '<button class="story-nav" type="button" data-prev aria-label="Previous story"></button>' +
            '<div class="story-card">' +
            '<div class="story-media is-empty"></div>' +
            '<div class="story-bars"></div>' +
            '<div class="story-head"><b></b><span></span><button class="story-close" type="button" aria-label="Close stories"></button></div>' +
            '<div class="story-loc" hidden></div>' +
            '</div>' +
            '<button class="story-nav" type="button" data-next aria-label="Next story"></button>' +
            '</div>';
        document.body.appendChild(ov);

        var card = ov.querySelector(".story-card");
        var bars = ov.querySelector(".story-bars");
        var headDate = ov.querySelector(".story-head b");
        var headCap = ov.querySelector(".story-head span");
        var loc = ov.querySelector(".story-loc");
        var closeBtn = ov.querySelector(".story-close");
        var prevBtn = ov.querySelector("[data-prev]");
        var nextBtn = ov.querySelector("[data-next]");
        closeBtn.appendChild(makeIcon("x", 20));
        prevBtn.appendChild(makeIcon("chevron-left", 18));
        nextBtn.appendChild(makeIcon("chevron-right", 18));

        STORIES.forEach(function () {
            var s = document.createElement("span");
            s.appendChild(document.createElement("i"));
            bars.appendChild(s);
        });
        var fills = Array.prototype.slice.call(bars.querySelectorAll("i"));

        var index = 0, elapsed = 0, last = 0, raf = 0, paused = false, opener = null;
        function autoplay() {
            return getPref("motion") !== "reduce" && !window.matchMedia("(prefers-reduced-motion: reduce)").matches;
        }

        function show(i) {
            index = i;
            elapsed = 0;
            var s = STORIES[i];
            var media = card.querySelector(".story-media");
            var next;
            if (s.src) {
                next = document.createElement("img");
                next.className = "story-media";
                next.src = s.src;
                next.alt = s.location ? "Photo at " + s.location : "Story photo";
            } else {
                next = document.createElement("div");
                next.className = "story-media is-empty";
            }
            card.replaceChild(next, media);
            headDate.textContent = s.date || "";
            headCap.textContent = s.caption || "";
            loc.hidden = !s.location;
            loc.textContent = "";
            if (s.location) {
                loc.appendChild(makeIcon("map-pin", 16));
                loc.appendChild(document.createTextNode(s.location));
            }
            fills.forEach(function (f, j) { f.style.transform = "scaleX(" + (j < i ? 1 : 0) + ")"; });
            prevBtn.disabled = i === 0;
            nextBtn.disabled = i === STORIES.length - 1 && !autoplay() ? true : false;
            // preload the next photo
            var n = STORIES[i + 1];
            if (n && n.src) { var pre = new Image(); pre.src = n.src; }
        }

        function tick(t) {
            if (!last) last = t;
            if (!paused && autoplay()) {
                elapsed += t - last;
                fills[index].style.transform = "scaleX(" + Math.min(1, elapsed / STORY_MS) + ")";
                if (elapsed >= STORY_MS) { go(1); }
            } else if (!autoplay()) {
                fills[index].style.transform = "scaleX(1)";
            }
            last = t;
            if (!ov.hidden) raf = requestAnimationFrame(tick);
        }

        function go(dir) {
            var n = index + dir;
            if (n < 0) { show(0); return; }
            if (n >= STORIES.length) { close(); return; }
            show(n);
        }

        function open(from) {
            opener = from;
            ov.hidden = false;
            document.documentElement.style.overflow = "hidden";
            show(0);
            requestAnimationFrame(function () { ov.classList.add("is-open"); });
            last = 0;
            raf = requestAnimationFrame(tick);
            closeBtn.focus();
        }

        function close() {
            cancelAnimationFrame(raf);
            ov.classList.remove("is-open");
            document.documentElement.style.overflow = "";
            try { localStorage.setItem(SEEN_KEY, signature); } catch (e) { }
            markRings();
            setTimeout(function () { ov.hidden = true; }, 200);
            if (opener) opener.focus();
        }

        rings.forEach(function (r) { r.addEventListener("click", function () { open(r); }); });
        closeBtn.addEventListener("click", function (e) { e.stopPropagation(); close(); });
        prevBtn.addEventListener("click", function () { go(-1); });
        nextBtn.addEventListener("click", function () { go(1); });
        ov.addEventListener("click", function (e) { if (e.target === ov || e.target.classList.contains("story-stage")) close(); });

        // Tap the left third to go back, the rest to go forward. Hold to pause.
        var downAt = 0, downY = 0;
        card.addEventListener("pointerdown", function (e) {
            if (e.target.closest(".story-close")) return;
            downAt = Date.now(); downY = e.clientY; paused = true;
        });
        card.addEventListener("pointerup", function (e) {
            if (!downAt) return;
            paused = false;
            var held = Date.now() - downAt;
            downAt = 0;
            if (e.clientY - downY > 80) { close(); return; } // swipe down closes
            if (held > 250) return;
            var r = card.getBoundingClientRect();
            go(e.clientX - r.left < r.width / 3 ? -1 : 1);
        });
        card.addEventListener("pointercancel", function () { paused = false; downAt = 0; });

        document.addEventListener("keydown", function (e) {
            if (ov.hidden) return;
            if (e.key === "Escape") close();
            else if (e.key === "ArrowRight") go(1);
            else if (e.key === "ArrowLeft") go(-1);
            else if (e.key === " ") { e.preventDefault(); paused = !paused; }
            else if (e.key === "Tab") {
                // keep focus inside the viewer
                var f = [prevBtn, closeBtn, nextBtn].filter(function (b) { return !b.disabled && b.offsetParent; });
                var i = f.indexOf(document.activeElement);
                e.preventDefault();
                f[(i + (e.shiftKey ? -1 : 1) + f.length) % f.length].focus();
            }
        });
        document.addEventListener("visibilitychange", function () { paused = document.hidden; });
    })();

    /* ---------- Accessibility panel: reading colour, font, size, motion ---------- */
    (function () {
        var THEMES = [
            { v: "light", name: "Light", bg: "#f2f2f3", fg: "#171717" },
            { v: "sage", name: "Sage", bg: "#c5cac3", fg: "#262a25" },
            { v: "slate", name: "Slate", bg: "#686868", fg: "#f4f4f4" },
            { v: "dark", name: "Dark", bg: "#2b2b2b", fg: "#e6e6e6" },
            { v: "oled", name: "Black", bg: "#000000", fg: "#ededed" }
        ];
        var FONTS = [
            { v: "default", name: "Google Sans", note: "Default", family: '"Google Sans", sans-serif' },
            { v: "serif", name: "Literata", note: "Book serif", family: '"Literata", Georgia, serif' },
            { v: "hyperlegible", name: "Atkinson Hyperlegible", note: "Low vision", family: '"Atkinson Hyperlegible", sans-serif' },
            { v: "lexend", name: "Lexend", note: "Easier reading", family: '"Lexend", sans-serif' },
            { v: "dyslexic", name: "OpenDyslexic", note: "Dyslexia", family: '"OpenDyslexic", sans-serif' }
        ];
        var SIZES = [{ v: "default", name: "A" }, { v: "l", name: "A+" }, { v: "xl", name: "A++" }];

        var btn = document.createElement("button");
        btn.className = "a11y-btn";
        btn.type = "button";
        btn.setAttribute("aria-label", "Accessibility and reading settings");
        btn.setAttribute("aria-expanded", "false");
        btn.setAttribute("aria-controls", "a11y-panel");
        btn.appendChild(makeIcon("accessibility", 24));

        var panel = document.createElement("div");
        panel.className = "a11y-panel";
        panel.id = "a11y-panel";
        panel.hidden = true;
        panel.setAttribute("role", "dialog");
        panel.setAttribute("aria-label", "Reading settings");

        var html = '<div class="a11y-head"><h2>Reading settings</h2><button class="a11y-reset" type="button">Reset</button></div>';
        html += '<fieldset class="a11y-group"><legend>Colour</legend><div class="a11y-swatches">';
        THEMES.forEach(function (t) {
            html += '<label class="a11y-swatch"><input type="radio" name="a11y-theme" value="' + t.v + '">' +
                '<b style="background:' + t.bg + ';color:' + t.fg + '">Aa</b><small>' + t.name + '</small></label>';
        });
        html += '</div></fieldset><fieldset class="a11y-group"><legend>Font</legend><div class="a11y-options">';
        FONTS.forEach(function (f) {
            html += '<label class="a11y-option" style="font-family:' + f.family.replace(/"/g, "&quot;") + '"><input type="radio" name="a11y-font" value="' + f.v + '">' +
                '<span>' + f.name + '</span><small style="font-family:var(--font)">' + f.note + '</small></label>';
        });
        html += '</div></fieldset><fieldset class="a11y-group"><legend>Text size</legend><div class="a11y-seg">';
        SIZES.forEach(function (s) {
            html += '<label><input type="radio" name="a11y-size" value="' + s.v + '">' + s.name + '</label>';
        });
        html += '</div></fieldset><div class="a11y-group"><label class="a11y-switch">Reduce motion<input type="checkbox" name="a11y-motion"></label></div>';
        panel.innerHTML = html;

        document.body.appendChild(panel);
        document.body.appendChild(btn);

        function sync() {
            ["theme", "font", "size"].forEach(function (k) {
                var r = panel.querySelector('input[name="a11y-' + k + '"][value="' + getPref(k) + '"]');
                if (r) r.checked = true;
            });
            panel.querySelector('input[name="a11y-motion"]').checked = getPref("motion") === "reduce";
        }
        sync();
        document.addEventListener("prefchange", sync);

        panel.addEventListener("change", function (e) {
            var t = e.target;
            if (t.name === "a11y-motion") setPref("motion", t.checked ? "reduce" : "default");
            else if (t.name && t.name.indexOf("a11y-") === 0) setPref(t.name.slice(5), t.value);
        });
        panel.querySelector(".a11y-reset").addEventListener("click", function () {
            Object.keys(PREF_DEFAULTS).forEach(function (k) { setPref(k, PREF_DEFAULTS[k]); });
        });

        function isOpen() { return !panel.hidden; }
        function openPanel() {
            // load every font once so each option previews in its own face
            Object.keys(FONT_CSS).forEach(loadFont);
            panel.hidden = false;
            btn.setAttribute("aria-expanded", "true");
            requestAnimationFrame(function () { panel.classList.add("is-open"); });
            var first = panel.querySelector("input:checked") || panel.querySelector("input");
            if (first) first.focus();
        }
        function closePanel(focusBtn) {
            panel.classList.remove("is-open");
            btn.setAttribute("aria-expanded", "false");
            setTimeout(function () { if (btn.getAttribute("aria-expanded") === "false") panel.hidden = true; }, 200);
            if (focusBtn) btn.focus();
        }
        btn.addEventListener("click", function () { if (isOpen()) closePanel(); else openPanel(); });
        document.addEventListener("keydown", function (e) { if (e.key === "Escape" && isOpen()) closePanel(true); });
        document.addEventListener("pointerdown", function (e) {
            if (isOpen() && !panel.contains(e.target) && !btn.contains(e.target)) closePanel();
        });
    })();

    /* ---------- Case study extras: progress, section links, image viewer,
       mobile contents, prev / next keys, print ---------- */
    (function () {
        var body = document.querySelector(".case-body");
        if (!body) return;
        var root = document.documentElement;

        /* reading progress along the top edge */
        var bar = document.createElement("div");
        bar.className = "read-progress";
        bar.setAttribute("aria-hidden", "true");
        document.body.appendChild(bar);
        var queued = false, readToEnd = false;
        function progress() {
            queued = false;
            var top = body.getBoundingClientRect().top + window.scrollY;
            var span = body.offsetHeight - window.innerHeight;
            var p = span > 0 ? (window.scrollY - top + window.innerHeight * 0.15) / span : 1;
            bar.style.transform = "scaleX(" + Math.min(1, Math.max(0, p)).toFixed(4) + ")";
            // the number that matters: did they get to the end?
            if (p >= 0.9 && !readToEnd) {
                readToEnd = true;
                track("Read to end", { page: PAGE, mode: root.dataset.read === "tldr" ? "tldr" : "full" });
            }
        }
        function queue() { if (!queued) { queued = true; requestAnimationFrame(progress); } }
        window.addEventListener("scroll", queue, { passive: true });
        window.addEventListener("resize", queue);
        document.addEventListener("readmode", queue);
        progress();

        /* copy a link to any section */
        var LINK_SVG = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" aria-hidden="true">' +
            '<path d="M10 14a4.5 4.5 0 0 0 6.4 0l3-3a4.5 4.5 0 0 0-6.4-6.4l-1.2 1.2"/><path d="M14 10a4.5 4.5 0 0 0-6.4 0l-3 3a4.5 4.5 0 0 0 6.4 6.4l1.2-1.2"/></svg>';
        body.querySelectorAll(":scope > .case-section[id]:not(.case-intro) > h2").forEach(function (h) {
            var id = h.parentNode.id;
            var b = document.createElement("button");
            b.type = "button";
            b.className = "sec-link";
            b.innerHTML = LINK_SVG;
            b.setAttribute("aria-label", "Copy link to “" + h.textContent.trim() + "”");
            b.title = "Copy link to this section";
            b.addEventListener("click", function () {
                try { history.replaceState(null, "", pageUrl("#" + id)); } catch (e) { }
                copyText(pageUrl("#" + id), "Link to this section copied");
                track("Link copied", { kind: "section", page: PAGE });
            });
            h.appendChild(b);
        });

        /* image viewer: hero, figures and slides open full size */
        var imgs = Array.prototype.slice.call(body.querySelectorAll(".case-hero img, .case-figure img, .image-stack img, .evo img"));
        if (imgs.length && window.HTMLDialogElement) {
            var lb = document.createElement("dialog");
            lb.className = "lightbox";
            lb.setAttribute("aria-label", "Image viewer");
            lb.innerHTML = '<div class="lb-bar"><span class="lb-count"></span><p class="lb-cap"></p>' +
                '<button type="button" class="lb-btn" data-go="-1" aria-label="Previous image">←</button>' +
                '<button type="button" class="lb-btn" data-go="1" aria-label="Next image">→</button>' +
                '<button type="button" class="lb-btn lb-close" aria-label="Close viewer">Close</button></div>' +
                '<div class="lb-stage"><img alt=""></div>';
            document.body.appendChild(lb);
            var lbImg = lb.querySelector(".lb-stage img"), stage = lb.querySelector(".lb-stage");
            var cap = lb.querySelector(".lb-cap"), counter = lb.querySelector(".lb-count");
            var list = [], at = 0;

            var show = function (i) {
                at = (i + list.length) % list.length;
                var src = list[at];
                lbImg.src = src.currentSrc || src.src;
                lbImg.alt = src.alt;
                lb.classList.toggle("is-tall", src.naturalHeight > src.naturalWidth * 1.4);
                var fig = src.closest("figure");
                var fc = fig && fig.querySelector("figcaption");
                cap.textContent = fc ? fc.textContent : src.alt;
                counter.textContent = list.length > 1 ? (at + 1) + " / " + list.length : "";
                lb.querySelectorAll("[data-go]").forEach(function (b) { b.hidden = list.length < 2; });
                stage.scrollTop = 0;
            };
            var open = function (img) {
                // slides page through their own deck; figures page through the visible figures
                var group = img.closest(".image-stack");
                list = (group ? Array.prototype.slice.call(group.querySelectorAll("img")) : imgs.filter(function (x) {
                    return !x.closest(".image-stack") && !x.classList.contains("is-missing") && x.getClientRects().length;
                }));
                show(list.indexOf(img));
                lb.showModal();
                root.classList.add("lb-open");
                track("Image opened", { page: PAGE });
            };
            imgs.forEach(function (img) {
                img.tabIndex = 0;
                img.setAttribute("role", "button");
                img.setAttribute("aria-label", "Open image full size: " + img.alt);
                img.classList.add("is-zoomable");
                img.addEventListener("click", function () { if (!img.classList.contains("is-missing")) open(img); });
                img.addEventListener("keydown", function (e) {
                    if (e.key === "Enter" || e.key === " ") { e.preventDefault(); open(img); }
                });
            });
            lb.addEventListener("close", function () {
                root.classList.remove("lb-open");
                var back = list[at];
                if (back) back.focus({ preventScroll: true });
            });
            lb.addEventListener("click", function (e) {
                var go = e.target.closest("[data-go]");
                if (go) show(at + Number(go.getAttribute("data-go")));
                else if (e.target.closest(".lb-close") || e.target === stage || e.target === lb) lb.close();
            });
            lb.addEventListener("keydown", function (e) {
                if (e.key === "Escape") { e.preventDefault(); lb.close(); }
                else if (e.key === "ArrowRight" && list.length > 1) { e.preventDefault(); show(at + 1); }
                else if (e.key === "ArrowLeft" && list.length > 1) { e.preventDefault(); show(at - 1); }
            });
        }

        /* mobile: floating contents button and sheet */
        var toc = document.querySelector(".case-side .toc");
        if (toc && window.HTMLDialogElement) {
            var fab = document.createElement("button");
            fab.type = "button";
            fab.className = "toc-fab";
            fab.setAttribute("aria-haspopup", "dialog");
            fab.innerHTML = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" aria-hidden="true"><path d="M4 6h16M4 12h10M4 18h13"/></svg><span>Contents</span><b></b>';
            var sheet = document.createElement("dialog");
            sheet.className = "toc-sheet";
            sheet.setAttribute("aria-label", "On this page");
            sheet.innerHTML = '<div class="toc-sheet-head"><b>On this page</b><button type="button" class="lb-btn" aria-label="Close contents">Close</button></div>';
            var copy = toc.cloneNode(true);
            sheet.appendChild(copy);
            document.body.appendChild(fab);
            document.body.appendChild(sheet);
            var label = fab.querySelector("b");
            document.addEventListener("tocchange", function (e) {
                var cur = null;
                copy.querySelectorAll("a").forEach(function (a) {
                    var on = a.getAttribute("href") === "#" + e.detail;
                    a.classList.toggle("is-active", on);
                    if (on) cur = a;
                });
                label.textContent = cur ? cur.textContent : "";
            });
            var act = toc.querySelector("a.is-active");
            if (act) label.textContent = act.textContent;
            fab.addEventListener("click", function () { sheet.showModal(); });
            sheet.addEventListener("keydown", function (e) { if (e.key === "Escape") { e.preventDefault(); sheet.close(); } });
            sheet.addEventListener("click", function (e) {
                if (e.target === sheet || e.target.closest(".lb-btn") || e.target.closest("a")) sheet.close();
            });
        }

        /* n / p: next and previous case study */
        document.addEventListener("keydown", function (e) {
            if (!plainKey(e)) return;
            var k = e.key.toLowerCase();
            var a = k === "n" ? document.querySelector(".next-case") : k === "p" ? document.querySelector(".prev-case") : null;
            if (a) location.href = a.href;
        });

        /* print: open every collapsible so nothing prints folded */
        var opened = [];
        window.addEventListener("beforeprint", function () {
            opened = Array.prototype.filter.call(body.querySelectorAll("details:not([open])"), function (d) { d.open = true; return true; });
        });
        window.addEventListener("afterprint", function () {
            opened.forEach(function (d) { d.open = false; });
            opened = [];
        });
    })();

    /* ---------- Keyboard shortcuts: press ? for the list ---------- */
    (function () {
        var root = document.documentElement;
        if (!window.HTMLDialogElement) return;
        var isCase = !!document.querySelector(".case-body");
        var hasRead = !!document.querySelector("[data-read-toggle]");
        var hasSide = !!document.querySelector(".side-toggle");
        var rows = [["?", "Show this list"]];
        if (hasSide) rows.push(["[", "Show or hide the side panel"]);
        if (hasRead) rows.push(["T", "Switch between Full and TL;DR"]);
        if (isCase) rows.push(["N", "Next case study"], ["P", "Previous case study"], ["← →", "Previous / next image in the viewer"]);
        rows.push(["L", "Lights on or off"], ["Esc", "Close any panel or viewer"]);

        var dlg = document.createElement("dialog");
        dlg.className = "keys-dialog";
        dlg.setAttribute("aria-labelledby", "keys-title");
        dlg.innerHTML = '<div class="toc-sheet-head"><b id="keys-title">Keyboard shortcuts</b><button type="button" class="lb-btn" aria-label="Close shortcuts">Close</button></div>' +
            '<dl class="keys-list">' + rows.map(function (r) {
                return "<div><dt>" + r[0].split(" ").map(function (k) { return "<kbd>" + k + "</kbd>"; }).join(" ") + "</dt><dd>" + r[1] + "</dd></div>";
            }).join("") + "</dl>";
        document.body.appendChild(dlg);
        dlg.addEventListener("click", function (e) { if (e.target === dlg || e.target.closest(".lb-btn")) dlg.close(); });
        dlg.addEventListener("keydown", function (e) { if (e.key === "Escape") { e.preventDefault(); dlg.close(); } });

        function openKeys() { if (!dlg.open) { dlg.showModal(); track("Shortcuts opened"); } }
        document.addEventListener("keydown", function (e) {
            if (e.key === "?" && plainKey(e)) { e.preventDefault(); openKeys(); return; }
            if (!plainKey(e)) return;
            if (e.key.toLowerCase() === "l") {
                var knob = document.querySelector(".pullcord-knob");
                if (knob) knob.click();
            }
        });

        // a way in for pointer users: a link at the bottom of the reading settings
        var panel = document.querySelector(".a11y-panel");
        if (panel) {
            var hint = document.createElement("button");
            hint.type = "button";
            hint.className = "keys-hint";
            hint.innerHTML = "Keyboard shortcuts <kbd>?</kbd>";
            hint.addEventListener("click", openKeys);
            panel.appendChild(hint);
        }

        // and a one-time nudge on the first visit with a real keyboard
        try {
            if (window.matchMedia("(hover: hover) and (pointer: fine)").matches && !localStorage.getItem("keys-hint")) {
                setTimeout(function () {
                    toast("Tip: press ? for keyboard shortcuts");
                    localStorage.setItem("keys-hint", "1");
                }, 4000);
            }
        } catch (e) { }
    })();

    // #region highlighter  (shown on play-highlighter.html, which reads this file between the region markers)
    /* ---------- Text selection, iOS style: drag handles + Copy / Highlight ----------
       Highlights are character ranges over the page's text, each with a colour and
       a random seed. The seed draws a one-off marker stroke (uneven edges, chisel
       tips, a denser double pass, felt streaks), so no two highlights look alike.
       They're saved per page as text quotes (prefix + text + suffix), so they survive
       reloads even when live text (clock, demos) changes length. Handles and the
       glass menu are desktop only; touch devices keep their native selection UI. */
    (function () {
        var EXCLUDE = "script, style, noscript, template, svg, input, textarea, select, .sel-ui, [data-clock], [data-status], [data-hl-skip]";
        var STORE = "hl:" + location.pathname;
        var LAST = "hl:color";
        var CTX = 32;
        var html = document.documentElement;
        // [light themes, dark themes]
        var INK = {
            yellow: ["#ffe94a", "#ffd60a"],
            green: ["#86f76a", "#4cd964"],
            pink: ["#ff8cc6", "#ff5fa8"],
            blue: ["#7dd3ff", "#40a9ff"]
        };
        var COLORS = Object.keys(INK);

        function lsGet(k) { try { return localStorage.getItem(k); } catch (err) { return null; } }
        function lsSet(k, v) { try { if (v == null) localStorage.removeItem(k); else localStorage.setItem(k, v); } catch (err) { /* blocked */ } }
        function lastColor() { var c = lsGet(LAST); return INK[c] ? c : "yellow"; }

        function accept(n) {
            var p = n.parentElement;
            return p && !p.closest(EXCLUDE) ? NodeFilter.FILTER_ACCEPT : NodeFilter.FILTER_REJECT;
        }
        function textNodes(within) {
            var w = document.createTreeWalker(within || document.body, NodeFilter.SHOW_TEXT, { acceptNode: accept });
            var out = [], n;
            while ((n = w.nextNode())) out.push(n);
            return out;
        }
        function joinText(nodes) { return nodes.map(function (n) { return n.data; }).join(""); }

        // character offset of a DOM boundary point, counted over `nodes`
        function offsetOf(nodes, container, offset) {
            var b = document.createRange();
            b.setStart(container, offset);
            var acc = 0;
            for (var i = 0; i < nodes.length; i++) {
                var t = nodes[i];
                if (t === container) return acc + offset;
                if (b.comparePoint(t, t.length) <= 0) acc += t.length; else return acc;
            }
            return acc;
        }
        function pointAt(nodes, pos, atEnd) {
            var acc = 0;
            for (var i = 0; i < nodes.length; i++) {
                var len = nodes[i].length;
                if (pos < acc + len || (atEnd && pos === acc + len)) return { node: nodes[i], offset: pos - acc };
                acc += len;
            }
            var last = nodes[nodes.length - 1];
            return last ? { node: last, offset: last.length } : null;
        }

        /* ---- the marker stroke: three SVG layers (left tip, body, right tip) ---- */
        function rng(seed) {
            return function () {
                seed = (seed + 0x6D2B79F5) | 0;
                var t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
                t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
                return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
            };
        }
        function isDark() { return /^(dark|oled|slate)$/.test(html.dataset.theme || ""); }
        function svgUrl(w, body) {
            return 'url("data:image/svg+xml,' + encodeURIComponent(
                '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ' + w + ' 24" preserveAspectRatio="none">' + body + "</svg>") + '")';
        }
        // the feel of the stroke; the sliders on play-highlighter.html tune these live
        var DEFAULTS = { ink: 0.78, wobble: 2, tip: 7, streaks: 2, pass: 0.24 };
        var CFG = {};
        Object.keys(DEFAULTS).forEach(function (k) { CFG[k] = DEFAULTS[k]; });
        var imgCache = {};
        function strokeImages(color, seed) {
            var dark = isDark(), key = color + "|" + seed + "|" + dark;
            if (imgCache[key]) return imgCache[key];
            var R = rng(seed), f = function (n) { return n.toFixed(2); };
            var hex = (INK[color] || INK.yellow)[dark ? 1 : 0];
            // On dark themes the ink goes near-solid and the text turns dark on it (see
            // site.css), like a real marker on paper. No edge line there: against a dark
            // page it reads as an outline, not as ink pooling at the edge of the stroke.
            var a = dark ? Math.min(1, CFG.ink + 0.12) : CFG.ink, edgeA = 0.55;
            var top = 2 + R() * 1.8, bot = 22 - R() * 1.8;
            var fill = 'fill="' + hex + '" fill-opacity="' + a + '"';
            var edge = 'fill="none" stroke="' + hex + '" stroke-opacity="' + edgeA + '" stroke-width="1" vector-effect="non-scaling-stroke"';

            // body: wobbly top and bottom edges that meet the tips at fixed heights
            var n = 9, tp = [], bp = [], i;
            for (i = 0; i <= n; i++) {
                var x = 200 * i / n, inner = i > 0 && i < n ? 1 : 0;
                tp.push(f(x) + "," + f(top + inner * (R() - 0.5) * CFG.wobble));
                bp.push(f(x) + "," + f(bot + inner * (R() - 0.5) * CFG.wobble));
            }
            var topEdge = "M" + tp.join(" L"), botEdge = "M" + bp.join(" L");
            var bodyPath = topEdge + " L" + bp.slice().reverse().join(" L") + "Z";
            // a second, denser pass over part of the stroke
            var x1 = R() * 70, x2 = 200 - R() * 70, y1 = top + 1 + R() * 3, y2 = bot - 1 - R() * 3;
            var pass = '<path d="M' + f(x1) + "," + f(y1 + R()) + " L" + f(x2) + "," + f(y1 + R()) + " L" + f(x2) + "," + f(y2 - R()) +
                " L" + f(x1) + "," + f(y2 - R()) + 'Z" fill="' + hex + '" fill-opacity="' + (dark ? CFG.pass * 0.4 : CFG.pass) + '"/>';
            // felt streaks: thin lighter lines where the nib skipped
            var streaks = "", sc = "#fff", count = Math.round(CFG.streaks) + (CFG.streaks > 0 && R() > 0.5 ? 1 : 0);
            for (i = 0; i < count; i++) {
                var sy = top + 3 + R() * (bot - top - 6), sx = R() * 60;
                streaks += '<rect x="' + f(sx) + '" y="' + f(sy) + '" width="' + f(80 + R() * 120) + '" height="' + f(0.35 + R() * 0.5) +
                    '" fill="' + sc + '" fill-opacity="' + f((dark ? 0.08 : 0.1) + R() * 0.12) + '"/>';
            }
            var body = svgUrl(200, '<path d="' + bodyPath + '" ' + fill + "/>" + pass + streaks +
                (dark ? "" : '<path d="' + topEdge + '" ' + edge + '/><path d="' + botEdge + '" ' + edge + "/>"));

            // chisel tips, each slanted and rounded a little differently
            function tip(left) {
                var t1 = 1 + R() * 4, t2 = 0.5 + R() * 3, bulge = R() * 2;
                var mid = (top + bot) / 2 + (R() - 0.5) * 4;
                var outline = left
                    ? "M10," + f(top) + " L" + f(t1 + 2) + "," + f(top) + " Q" + f(bulge) + "," + f(mid) + " " + f(t2 + 2) + "," + f(bot) + " L10," + f(bot)
                    : "M0," + f(top) + " L" + f(8 - t2) + "," + f(top) + " Q" + f(10 - bulge) + "," + f(mid) + " " + f(8 - t1) + "," + f(bot) + " L0," + f(bot);
                return svgUrl(10, '<path d="' + outline + 'Z" ' + fill + "/>" + (dark ? "" : '<path d="' + outline + '" ' + edge + "/>"));
            }
            return (imgCache[key] = tip(true) + ", " + tip(false) + ", " + body);
        }

        /* ---- highlight model: sorted, non-overlapping {s, e, c, v} ---- */
        function byStart(a, b) { return a.s - b.s; }
        function addTo(list, n) {
            var keep = [], span = { s: n.s, e: n.e, c: n.c, v: n.v };
            list.forEach(function (x) {
                if (x.e < n.s || x.s > n.e) keep.push(x);
                else { span.s = Math.min(span.s, x.s); span.e = Math.max(span.e, x.e); }
            });
            keep.push(span);
            return keep.sort(byStart);
        }
        function subtract(list, s, e) {
            var out = [];
            list.forEach(function (x) {
                if (x.e <= s || x.s >= e) { out.push(x); return; }
                if (x.s < s) out.push({ s: x.s, e: s, c: x.c, v: x.v });
                if (x.e > e) out.push({ s: e, e: x.e, c: x.c, v: x.v + 1 });
            });
            return out;
        }
        // read highlights back out of the DOM; whitespace-only gaps don't split one
        function readMarks(nodes) {
            var list = [], acc = 0, cur = null;
            nodes.forEach(function (t) {
                var len = t.length;
                if (!len) return;
                var m = t.parentElement.closest("mark.hl");
                if (m) {
                    var v = +m.dataset.v;
                    if (cur && cur.v === v) cur.e = acc + len;
                    else { cur = { s: acc, e: acc + len, c: m.dataset.c, v: v }; list.push(cur); }
                } else if (/\S/.test(t.data)) cur = null;
                acc += len;
            });
            return list;
        }

        function unwrapAll() {
            var parents = [];
            document.querySelectorAll("mark.hl").forEach(function (m) {
                var p = m.parentNode;
                while (m.firstChild) p.insertBefore(m.firstChild, m);
                p.removeChild(m);
                if (parents.indexOf(p) < 0) parents.push(p);
            });
            parents.forEach(function (p) { p.normalize(); });
        }
        // whitespace that doesn't render (between blocks, flex/grid items) stays bare,
        // or the mark's padding would paint a stray blob of ink
        function layoutOnlyWhitespace(t) {
            if (/\S/.test(t.data)) return false;
            var r = document.createRange();
            r.selectNodeContents(t);
            var rects = r.getClientRects();
            for (var i = 0; i < rects.length; i++) if (rects[i].width > 0) return false;
            return true;
        }
        function wrap(h) {
            var nodes = textNodes(), acc = 0, targets = [];
            nodes.forEach(function (t) {
                var len = t.length, a = Math.max(h.s, acc), b = Math.min(h.e, acc + len);
                if (b > a) targets.push([t, a - acc, b - acc]);
                acc += len;
            });
            targets.forEach(function (x) {
                var t = x[0];
                if (layoutOnlyWhitespace(t)) return;
                if (x[2] < t.length) t.splitText(x[2]);
                if (x[1] > 0) t = t.splitText(x[1]);
                var m = document.createElement("mark");
                m.className = "hl";
                m.dataset.c = h.c;
                m.dataset.v = h.v;
                t.parentNode.insertBefore(m, t);
                m.appendChild(t);
            });
        }
        // paint every mark; a mark that runs straight on from the previous piece of
        // the same highlight drops its tip there, so one stroke reads as one stroke
        function blockOf(n) {
            var e = n.parentElement;
            while (e && e !== document.body && /^(inline|contents)$/.test(getComputedStyle(e).display)) e = e.parentElement;
            return e;
        }
        // static, non-interactive examples (e.g. the Play cards) use .hl-paint
        function paintStatic() {
            document.querySelectorAll(".hl-paint").forEach(function (p) {
                p.style.backgroundImage = strokeImages(p.dataset.c || "yellow", +p.dataset.v || 1);
            });
        }
        function decorate() {
            paintStatic();
            var prev = null;
            textNodes().forEach(function (t) {
                if (!t.length) return;
                var m = t.parentElement.closest("mark.hl");
                if (m) {
                    var joined = prev && prev !== m && prev.dataset.v === m.dataset.v && blockOf(prev) === blockOf(m);
                    if (prev !== m) {
                        m.classList.toggle("is-join-l", !!joined);
                        m.classList.remove("is-join-r");
                        m.style.backgroundImage = strokeImages(m.dataset.c, +m.dataset.v);
                    }
                    if (joined) prev.classList.add("is-join-r");
                    prev = m;
                } else if (/\S/.test(t.data)) prev = null;
            });
        }
        function render(list) {
            unwrapAll();
            list.forEach(wrap);
            decorate();
        }
        function emit(list) {
            document.dispatchEvent(new CustomEvent("highlights:change", {
                detail: { list: list.map(function (h) { return { c: h.c, v: h.v }; }) }
            }));
        }
        function save(list, text) {
            emit(list);
            lsSet(STORE, list.length ? JSON.stringify(list.map(function (h) {
                return { p: text.slice(Math.max(0, h.s - CTX), h.s), q: text.slice(h.s, h.e), s: text.slice(h.e, h.e + CTX), c: h.c, v: h.v };
            })) : null);
        }
        function newSeed() { return (Math.random() * 1e9) | 0; }
        function restore() {
            var data = [];
            try { data = JSON.parse(lsGet(STORE) || "[]") || []; } catch (err) { data = []; }
            if (!data.length) return;
            var text = joinText(textNodes()), list = [];
            data.forEach(function (d) {
                if (!d || !d.q) return;
                var i = text.indexOf((d.p || "") + d.q + (d.s || ""));
                if (i >= 0) i += (d.p || "").length; else i = text.indexOf(d.q);
                if (i >= 0) list.push({ s: i, e: i + d.q.length, c: INK[d.c] ? d.c : "yellow", v: d.v || newSeed() });
            });
            if (list.length) render(list.sort(byStart));
        }
        restore();
        paintStatic();
        // themes change the ink, so repaint strokes when the theme flips
        new MutationObserver(function () { if (document.querySelector("mark.hl, .hl-paint")) decorate(); })
            .observe(html, { attributes: true, attributeFilter: ["data-theme"] });

        // small API for the Play page: live tuning, a first-visit demo, and change events
        window.Highlighter = {
            config: CFG,
            defaults: DEFAULTS,
            count: function () { return readMarks(textNodes()); },
            repaint: function () {
                imgCache = {};
                html.style.setProperty("--hl-tip", CFG.tip + "px");
                decorate();
            },
            // on a first visit, highlight a few phrases inside `root` so there's something to play with
            seed: function (root, items) {
                var flag = STORE + ":seeded";
                if (lsGet(STORE) || lsGet(flag)) return;
                var nodes = textNodes(), text = joinText(nodes);
                var base = offsetOf(nodes, root, 0), local = joinText(textNodes(root)), list = [];
                items.forEach(function (it) {
                    var i = local.indexOf(it.text);
                    if (i >= 0) list.push({ s: base + i, e: base + i + it.text.length, c: it.c, v: newSeed() });
                });
                if (!list.length) return;
                list.sort(byStart);
                render(list);
                save(list, text);
                lsSet(flag, "1");
            }
        };
        emit(readMarks(textNodes()));

        if (!window.matchMedia || !matchMedia("(hover: hover) and (pointer: fine)").matches) return;

        /* ---- UI: two handles and the glass menu ---- */
        function el(tag, cls, inner) {
            var x = document.createElement(tag);
            x.className = cls;
            if (inner) x.innerHTML = inner;
            return x;
        }
        var hStart = el("div", "sel-ui sel-handle is-start", "<i></i>");
        var hEnd = el("div", "sel-ui sel-handle is-end", "<i></i>");
        var menu = el("div", "sel-ui sel-menu",
            '<span class="sel-blob" aria-hidden="true"></span>' +
            '<div class="sel-row">' +
                '<button type="button" class="sel-btn" data-act="copy">Copy</button>' +
                '<span class="sel-sep" aria-hidden="true"></span>' +
                '<button type="button" class="sel-btn sel-add" data-act="hl">Highlight</button>' +
                '<span class="sel-edit sel-colors">' + COLORS.map(function (c) {
                    return '<button type="button" class="sel-dot" data-color="' + c + '" aria-label="' +
                        c.charAt(0).toUpperCase() + c.slice(1) + '" style="--dot: var(--hl-' + c + ')"></button>';
                }).join("") + "</span>" +
                '<span class="sel-edit sel-sep" aria-hidden="true"></span>' +
                '<button type="button" class="sel-btn sel-edit" data-act="rm">Remove</button>' +
            "</div>");
        hStart.setAttribute("aria-hidden", "true");
        hEnd.setAttribute("aria-hidden", "true");
        menu.setAttribute("role", "toolbar");
        menu.setAttribute("aria-label", "Selection");
        menu.dataset.mode = "add";
        document.body.appendChild(hStart);
        document.body.appendChild(hEnd);
        document.body.appendChild(menu);
        var row = menu.querySelector(".sel-row");
        var blob = menu.querySelector(".sel-blob");
        var copyBtn = menu.querySelector('[data-act="copy"]');

        var pointerDown = false, dragging = false, dismissed = false, raf = 0, trackTimer = 0;
        var lastPt = null, model = null, hovered = null;

        function currentRange() {
            var sel = window.getSelection();
            if (!sel || !sel.rangeCount || sel.isCollapsed) return null;
            var r = sel.getRangeAt(0);
            var c = r.commonAncestorContainer;
            var ce = c.nodeType === 1 ? c : c.parentElement;
            if (!ce || ce.closest(".sel-ui, input, textarea, select, [contenteditable]:not([contenteditable='false'])")) return null;
            return r;
        }

        // rects of the first and last visible, non-space characters in the range
        function charRect(t, i) {
            var cr = document.createRange();
            cr.setStart(t, i);
            cr.setEnd(t, i + 1);
            var rs = cr.getClientRects();
            return rs.length ? rs[rs.length - 1] : null;
        }
        // rects of the first and last characters that are actually painted in the range.
        // Spaces count (the browser tints them too); collapsed source whitespace has no
        // width and is skipped, so the handles sit exactly where the blue tint starts and ends.
        function edges(r) {
            var c = r.commonAncestorContainer;
            var nodes = textNodes(c.nodeType === 3 ? c.parentNode : c).filter(function (t) { return r.intersectsNode(t); });
            var first = null, last = null, i, j, t, lo, hi, rect;
            for (i = 0; i < nodes.length && !first; i++) {
                t = nodes[i];
                lo = t === r.startContainer ? r.startOffset : 0;
                hi = t === r.endContainer ? r.endOffset : t.length;
                for (j = lo; j < hi && !first; j++) {
                    rect = charRect(t, j);
                    if (rect && rect.width > 0 && rect.height > 0) first = rect;
                    else if (!/\s/.test(t.data[j])) break; // hidden text: try the next node
                }
            }
            for (i = nodes.length - 1; i >= 0 && !last; i--) {
                t = nodes[i];
                lo = t === r.startContainer ? r.startOffset : 0;
                hi = t === r.endContainer ? r.endOffset : t.length;
                for (j = hi - 1; j >= lo && !last; j--) {
                    rect = charRect(t, j);
                    if (rect && rect.width > 0 && rect.height > 0) last = rect;
                    else if (!/\s/.test(t.data[j])) break;
                }
            }
            return first && last ? { first: first, last: last } : null;
        }

        function placeHandle(h, x, y, height) {
            var fresh = !h.classList.contains("is-on");
            if (fresh) h.classList.add("is-placing");
            h.style.setProperty("--x", Math.round(x - 1) + "px");
            h.style.setProperty("--y", Math.round(y) + "px");
            h.style.setProperty("--h", Math.round(height) + "px");
            h.classList.add("is-on");
            if (fresh) { void h.offsetWidth; h.classList.remove("is-placing"); }
        }
        function hideHandles() { hStart.classList.remove("is-on"); hEnd.classList.remove("is-on"); }
        function hideMenu() {
            menu.classList.remove("is-open");
            html.classList.remove("hl-editing");
            hideBlob();
        }
        function hideAll() { hideHandles(); hideMenu(); }

        // where the selection sits in the highlight model
        function selectionModel(r) {
            var nodes = textNodes(), text = joinText(nodes);
            var s = offsetOf(nodes, r.startContainer, r.startOffset);
            var e = offsetOf(nodes, r.endContainer, r.endOffset);
            while (s < e && /\s/.test(text[s])) s++;
            while (e > s && /\s/.test(text[e - 1])) e--;
            var list = readMarks(nodes);
            var hit = e > s ? list.filter(function (x) { return x.s <= s && x.e >= e; })[0] : null;
            return { s: s, e: e, text: text, list: list, hit: hit || null };
        }

        /* liquid hover: one glass blob glides between the buttons */
        function moveBlob(b) {
            hovered = b;
            var fresh = !blob.classList.contains("is-on");
            if (fresh) blob.classList.add("is-placing");
            blob.style.setProperty("--bx", b.offsetLeft + "px");
            blob.style.setProperty("--bw", b.offsetWidth + "px");
            if (fresh) { void blob.offsetWidth; blob.classList.remove("is-placing"); }
            blob.classList.add("is-on");
        }
        function hideBlob() { hovered = null; blob.classList.remove("is-on"); }
        row.addEventListener("pointerover", function (e) {
            var b = e.target.closest(".sel-btn");
            if (b) moveBlob(b); else hideBlob();
        });
        menu.addEventListener("pointerleave", hideBlob);

        function setMode(m) {
            model = m;
            var mode = m.hit ? "edit" : "add";
            menu.dataset.mode = mode;
            copyBtn.textContent = "Copy";
            menu.querySelectorAll(".sel-dot").forEach(function (d) {
                d.classList.toggle("is-current", !!m.hit && d.dataset.color === m.hit.c);
            });
        }
        function menuWidth() { return row.offsetWidth + 8; }
        function fitWidth() {
            menu.style.width = menuWidth() + "px";
            if (hovered) moveBlob(hovered);
        }

        function layout(kind) {
            var r = currentRange();
            var ed = r && edges(r);
            if (!ed) { hideAll(); return; }
            placeHandle(hStart, ed.first.left, ed.first.top, ed.first.height);
            placeHandle(hEnd, ed.last.right, ed.last.top, ed.last.height);

            if (pointerDown || dragging || dismissed) { hideMenu(); return; }
            var opening = !menu.classList.contains("is-open");
            if (kind === "full" || opening) setMode(selectionModel(r));
            var vw = window.innerWidth, vh = window.innerHeight;
            if (ed.last.bottom < 0 || ed.first.top > vh) { hideMenu(); return; }

            var box = r.getBoundingClientRect();
            var mw = menuWidth(), mh = menu.offsetHeight, gap = 18;
            var cx = (Math.max(box.left, 0) + Math.min(box.right, vw)) / 2;
            var x = Math.min(Math.max(cx - mw / 2, 8), vw - mw - 8);
            var y = ed.first.top - mh - gap, below = false;
            if (y < 8) { y = ed.last.bottom + gap; below = true; }
            y = Math.min(Math.max(y, 8), vh - mh - 8);

            if (opening) menu.classList.add("is-placing");
            else if (kind === "track") menu.classList.add("is-tracking");
            menu.style.setProperty("--x", Math.round(x) + "px");
            menu.style.setProperty("--y", Math.round(y) + "px");
            menu.style.setProperty("--ox", Math.round(Math.min(Math.max(cx - x, 16), mw - 16)) + "px");
            menu.classList.toggle("is-below", below);
            fitWidth();
            if (opening) {
                void menu.offsetWidth;
                menu.classList.remove("is-placing");
            }
            menu.classList.add("is-open");
            html.classList.toggle("hl-editing", menu.dataset.mode === "edit");
        }
        function schedule(kind) {
            cancelAnimationFrame(raf);
            raf = requestAnimationFrame(function () { layout(kind); });
        }

        /* ---- caret helpers ---- */
        function caretAt(x, y) {
            var c = null;
            if (document.caretPositionFromPoint) {
                var p = document.caretPositionFromPoint(x, y);
                if (p && p.offsetNode) c = { node: p.offsetNode, offset: p.offset };
            } else if (document.caretRangeFromPoint) {
                var r = document.caretRangeFromPoint(x, y);
                if (r) c = { node: r.startContainer, offset: r.startOffset };
            }
            if (!c) return null;
            var ce = c.node.nodeType === 1 ? c.node : c.node.parentElement;
            return ce && !ce.closest(EXCLUDE) && ce !== document.body && ce !== html ? c : null;
        }
        function compare(a, b) {
            var r = document.createRange();
            r.setStart(b.node, b.offset);
            return r.comparePoint(a.node, a.offset); // -1: a before b, 1: a after b
        }

        /* While the browser is drag-selecting, the pointer can pass over a gap
           (between blocks, columns, or past the end of a line) and the browser
           briefly snaps the selection to the whole page. If the focus lands on the
           page itself or far from the pointer, pull it back to the text under it. */
        function stabilize() {
            if (!pointerDown || !lastPt) return;
            var sel = window.getSelection();
            if (!sel.rangeCount || !sel.focusNode) return;
            var fn = sel.focusNode, fe = fn.nodeType === 1 ? fn : fn.parentElement;
            var bad = !fe || fe === document.body || fe === html || !!fe.closest(".sel-ui");
            if (!bad && fn.nodeType === 3) {
                var fr = document.createRange();
                fr.setStart(fn, sel.focusOffset);
                var rect = fr.getBoundingClientRect();
                bad = rect.height > 0 && Math.abs(rect.top + rect.height / 2 - lastPt.y) > Math.max(160, window.innerHeight / 3);
            }
            if (!bad) return;
            var c = caretAt(lastPt.x, lastPt.y);
            if (c) { try { sel.extend(c.node, c.offset); } catch (err) { /* ignore */ } }
        }

        document.addEventListener("selectionchange", function () {
            if (!dragging) dismissed = false;
            if (pointerDown) stabilize();
            schedule("full");
        });
        document.addEventListener("pointerdown", function (e) {
            if (e.button !== 0 || (e.target.closest && e.target.closest(".sel-ui"))) return;
            pointerDown = true;
            lastPt = { x: e.clientX, y: e.clientY };
            html.classList.add("sel-native");
            hideMenu();
        }, true);
        document.addEventListener("pointermove", function (e) {
            if (pointerDown) lastPt = { x: e.clientX, y: e.clientY };
        }, { passive: true, capture: true });
        document.addEventListener("pointerup", function (e) {
            if (!pointerDown) return;
            pointerDown = false;
            html.classList.remove("sel-native");
            var target = e.target;
            setTimeout(function () {
                var sel = window.getSelection();
                var mark = target && target.closest && target.closest("mark.hl");
                if (sel && sel.isCollapsed && mark && !target.closest("a, button, label")) selectHighlight(mark);
                else schedule("full");
            }, 0);
        }, true);
        window.addEventListener("pointercancel", function () { pointerDown = false; html.classList.remove("sel-native"); });
        window.addEventListener("scroll", function () {
            html.classList.add("sel-scrolling");
            clearTimeout(trackTimer);
            trackTimer = setTimeout(function () {
                html.classList.remove("sel-scrolling");
                menu.classList.remove("is-tracking");
            }, 160);
            schedule("track");
        }, { passive: true, capture: true });
        window.addEventListener("resize", function () { schedule("track"); });
        document.addEventListener("keydown", function (e) {
            if (e.key === "Escape" && menu.classList.contains("is-open")) {
                window.getSelection().removeAllRanges();
                hideAll();
            }
        });

        // clicking a highlight selects all of it and opens the colour menu
        function selectHighlight(mark) {
            var nodes = textNodes();
            var at = offsetOf(nodes, mark, 0);
            var hit = readMarks(nodes).filter(function (x) { return x.s <= at && x.e > at; })[0];
            if (!hit) return;
            var a = pointAt(nodes, hit.s, false), b = pointAt(nodes, hit.e, true);
            if (a && b) window.getSelection().setBaseAndExtent(a.node, a.offset, b.node, b.offset);
        }
        function marksOf(v) { return document.querySelectorAll('mark.hl[data-v="' + v + '"]'); }

        /* ---- menu actions ---- */
        menu.addEventListener("pointerdown", function (e) { e.preventDefault(); });
        menu.addEventListener("mousedown", function (e) { e.preventDefault(); });

        function copySelection() {
            var text = window.getSelection().toString();
            function legacy() {
                try { return document.execCommand("copy") ? Promise.resolve() : Promise.reject(); }
                catch (err) { return Promise.reject(err); }
            }
            if (navigator.clipboard && window.isSecureContext) return navigator.clipboard.writeText(text).catch(legacy);
            return legacy();
        }
        function close() { dismissed = true; hideMenu(); }

        menu.addEventListener("click", function (e) {
            var b = e.target.closest("button");
            if (!b) return;
            var act = b.dataset.act, color = b.dataset.color;
            var r = currentRange();
            if (!r) return;

            if (act === "copy") {
                copySelection().then(function () {
                    copyBtn.textContent = "Copied";
                    fitWidth();
                    setTimeout(close, 700);
                }, close);
                return;
            }

            var m = selectionModel(r);
            if (m.e <= m.s) return;

            if (act === "hl") {
                var h = { s: m.s, e: m.e, c: lastColor(), v: newSeed() };
                var list = addTo(m.list, h);
                window.getSelection().removeAllRanges();
                hideAll();
                render(list);
                save(list, m.text);
                marksOf(h.v).forEach(function (mk, i) {
                    mk.style.animationDelay = i * 70 + "ms";
                    mk.classList.add("is-drawing");
                    mk.addEventListener("animationend", function () {
                        mk.classList.remove("is-drawing");
                        mk.style.animationDelay = "";
                    }, { once: true });
                });
                return;
            }

            if (color && m.hit) {
                // recolour in place: same stroke, new ink, selection stays put
                m.hit.c = color;
                lsSet(LAST, color);
                marksOf(m.hit.v).forEach(function (mk) {
                    mk.dataset.c = color;
                    mk.style.backgroundImage = strokeImages(color, m.hit.v);
                });
                save(m.list, m.text);
                setMode(m);
                return;
            }

            if (act === "rm" && m.hit) {
                // like the colours, Remove acts on the whole highlight
                var rest = subtract(m.list, m.hit.s, m.hit.e);
                window.getSelection().removeAllRanges();
                hideAll();
                save(rest, m.text);
                marksOf(m.hit.v).forEach(function (mk) { mk.classList.add("is-erasing"); });
                setTimeout(function () { render(rest); }, 340);
            }
        });

        /* ---- dragging the handles ---- */
        [hStart, hEnd].forEach(function (h) {
            h.firstChild.addEventListener("pointerdown", function (e) {
                if (e.button !== 0) return;
                var r = currentRange();
                if (!r) return;
                e.preventDefault();
                e.stopPropagation();
                var isStart = h === hStart;
                var fixed = isStart ? { node: r.endContainer, offset: r.endOffset } : { node: r.startContainer, offset: r.startOffset };
                var hr = h.getBoundingClientRect();
                var dx = hr.left + 1 - e.clientX, dy = hr.top + hr.height / 2 - e.clientY;
                var sel = window.getSelection();
                dragging = true;
                html.classList.add("sel-dragging");
                hideMenu();

                function move(ev) {
                    var c = caretAt(ev.clientX + dx, ev.clientY + dy);
                    if (!c) return;
                    var cmp = compare(c, fixed);
                    if (isStart ? cmp >= 0 : cmp <= 0) return;
                    if (isStart) sel.setBaseAndExtent(c.node, c.offset, fixed.node, fixed.offset);
                    else sel.setBaseAndExtent(fixed.node, fixed.offset, c.node, c.offset);
                }
                function up() {
                    window.removeEventListener("pointermove", move);
                    window.removeEventListener("pointerup", up);
                    window.removeEventListener("pointercancel", up);
                    dragging = false;
                    html.classList.remove("sel-dragging");
                    schedule("full");
                }
                window.addEventListener("pointermove", move);
                window.addEventListener("pointerup", up);
                window.addEventListener("pointercancel", up);
            });
        });
    })();
    // #endregion highlighter

    /* ---------- Dock (bottom nav): Home / Live Projects / About Me ----------
       Plain links; each page marks its own item with aria-current. While the
       home intro is on screen the dock shrinks and peeks up from the bottom edge. */
    (function () {
        var dock = document.querySelector(".dock");
        if (!dock) return;
        document.body.classList.add("has-dock");
        var intro = document.querySelector(".intro");
        if (!intro) return;
        function sync() {
            dock.classList.toggle("is-peek", window.scrollY < intro.offsetHeight * .5);
        }
        window.addEventListener("scroll", sync, { passive: true });
        window.addEventListener("resize", sync);
        sync();
    })();

    /* ---------- Intro: the dither strip eases away as you leave the intro ---------- */
    (function () {
        var strip = document.querySelector(".intro-dither");
        var intro = document.querySelector(".intro");
        if (!strip || !intro) return;
        var ticking = false;
        function update() {
            ticking = false;
            var p = Math.min(1, Math.max(0, window.scrollY / (intro.offsetHeight * .6)));
            var e = 1 - Math.pow(1 - p, 3); // ease-out
            strip.style.opacity = String(1 - e);
            strip.style.transform = "translateY(" + (-e * 100) + "%)";
        }
        window.addEventListener("scroll", function () {
            if (!ticking) { ticking = true; requestAnimationFrame(update); }
        }, { passive: true });
        update();
    })();

    /* ---------- Custom page scrollbar: a slim, soft thumb that shows while scrolling ---------- */
    (function () {
        var root = document.documentElement;
        if (window.matchMedia("(pointer: coarse)").matches) return; // touch keeps the system overlay bar
        root.classList.add("has-scrollbar");
        var bar = document.createElement("div");
        bar.className = "scrollbar";
        bar.setAttribute("aria-hidden", "true");
        bar.innerHTML = '<div class="scrollbar-thumb"></div>';
        document.body.appendChild(bar);
        var thumb = bar.firstChild;
        var hideTimer = 0, dragging = false, startY = 0, startScroll = 0, ticking = false;
        var PAD = 6, MIN = 36;
        function metrics() {
            var view = window.innerHeight, full = root.scrollHeight;
            var track = view - PAD * 2;
            var size = Math.max(MIN, track * view / full);
            return { view: view, full: full, track: track, size: size, max: full - view };
        }
        function render() {
            ticking = false;
            var m = metrics();
            bar.hidden = m.max <= 1;
            if (bar.hidden) return;
            var top = PAD + (m.track - m.size) * (window.scrollY / m.max);
            thumb.style.height = m.size + "px";
            thumb.style.transform = "translateY(" + top + "px)";
        }
        function show() {
            bar.classList.add("is-on");
            clearTimeout(hideTimer);
            hideTimer = setTimeout(function () { if (!dragging && !bar.matches(":hover")) bar.classList.remove("is-on"); }, 900);
        }
        window.addEventListener("scroll", function () {
            if (!ticking) { ticking = true; requestAnimationFrame(render); }
            show();
        }, { passive: true });
        window.addEventListener("resize", render);
        if ("ResizeObserver" in window) new ResizeObserver(render).observe(document.body);
        bar.addEventListener("mouseenter", show);
        bar.addEventListener("mouseleave", show);
        thumb.addEventListener("pointerdown", function (e) {
            if (e.button !== 0) return;
            e.preventDefault();
            dragging = true;
            startY = e.clientY;
            startScroll = window.scrollY;
            thumb.setPointerCapture(e.pointerId);
            root.classList.add("is-scrubbing");
            bar.classList.add("is-drag");
        });
        thumb.addEventListener("pointermove", function (e) {
            if (!dragging) return;
            var m = metrics();
            var ratio = m.max / Math.max(1, m.track - m.size);
            window.scrollTo(0, startScroll + (e.clientY - startY) * ratio);
        });
        function end() {
            if (!dragging) return;
            dragging = false;
            root.classList.remove("is-scrubbing");
            bar.classList.remove("is-drag");
            show();
        }
        thumb.addEventListener("pointerup", end);
        thumb.addEventListener("pointercancel", end);
        // click the track to page towards the click
        bar.addEventListener("pointerdown", function (e) {
            if (e.target !== bar) return;
            var r = thumb.getBoundingClientRect();
            window.scrollBy({ top: (e.clientY < r.top ? -1 : 1) * window.innerHeight * .9, behavior: "smooth" });
        });
        render();
    })();

    /* ---------- Intro: one scroll gesture snaps between the intro and the work grid ---------- */
    (function () {
        var intro = document.querySelector(".intro");
        var work = document.getElementById("work");
        if (!intro || !work) return;
        var busy = false;
        var reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
        function workTop() { return intro.offsetHeight; } // header is sticky right under the intro
        function go(y) {
            busy = true;
            window.scrollTo({ top: y, behavior: reduce ? "auto" : "smooth" });
            setTimeout(function () { busy = false; }, reduce ? 50 : 900);
        }
        // returns true if it handled the gesture
        function step(dir) {
            var y = window.scrollY, top = workTop();
            if (dir > 0 && y < top - 4) { go(top); return true; }
            if (dir < 0 && y > 0 && y <= top + 4) { go(0); return true; }
            return false;
        }
        window.addEventListener("wheel", function (e) {
            if (e.ctrlKey || Math.abs(e.deltaY) < Math.abs(e.deltaX)) return;
            if (busy) { if (window.scrollY < workTop() + 4) e.preventDefault(); return; }
            if (Math.abs(e.deltaY) < 4) return;
            if (step(e.deltaY > 0 ? 1 : -1)) e.preventDefault();
        }, { passive: false });
        var ty = null;
        window.addEventListener("touchstart", function (e) { ty = e.touches[0].clientY; }, { passive: true });
        window.addEventListener("touchmove", function (e) {
            if (ty === null) return;
            var dy = ty - e.touches[0].clientY;
            var y = window.scrollY, top = workTop();
            // hold the page still while inside the intro, then snap on release
            if ((dy > 0 && y < top - 4) || (dy < 0 && y > 0 && y <= top + 4)) e.preventDefault();
        }, { passive: false });
        window.addEventListener("touchend", function (e) {
            if (ty === null) return;
            var dy = ty - e.changedTouches[0].clientY;
            ty = null;
            if (!busy && Math.abs(dy) > 30) step(dy > 0 ? 1 : -1);
        }, { passive: true });
        document.addEventListener("keydown", function (e) {
            if (busy || !plainKey(e)) return;
            var t = e.target;
            if (t && (t.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(t.tagName))) return;
            var dir = { ArrowDown: 1, PageDown: 1, " ": e.shiftKey ? -1 : 1, ArrowUp: -1, PageUp: -1 }[e.key];
            if (dir && step(dir)) e.preventDefault();
        });
    })();
})();
