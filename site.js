/* site.js — small shared behaviours: live clock, project filter,
   case-study table of contents, and the stage selector. */
(function () {
    "use strict";

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
        };

        buttons.forEach(function (b) { b.addEventListener("click", function () { apply(b, true); }); });

        var initial = buttons[0];
        try {
            var saved = sessionStorage.getItem("workFilter");
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
        };

        var update = function () {
            var line = window.innerHeight * 0.3;
            var current = sections[0];
            sections.forEach(function (s) { if (s.getBoundingClientRect().top <= line) current = s; });
            // At the very bottom, the last section wins even if it's short.
            if (window.innerHeight + window.scrollY >= document.documentElement.scrollHeight - 4) {
                current = sections[sections.length - 1];
            }
            if (current) setActive(current.id);
        };

        window.addEventListener("scroll", update, { passive: true });
        window.addEventListener("resize", update);
        update();
    }

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
            var hide = dy > 0 && y > header.offsetHeight;
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
        var root = document.documentElement;
        side.id = side.id || "side-panel";
        var btn = document.createElement("button");
        btn.type = "button";
        btn.className = "side-toggle";
        btn.setAttribute("aria-controls", side.id);
        btn.innerHTML = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" aria-hidden="true">' +
            '<path d="M8 3.5h8c2.8 0 4.5 1.7 4.5 4.5v8c0 2.8-1.7 4.5-4.5 4.5H8c-2.8 0-4.5-1.7-4.5-4.5V8c0-2.8 1.7-4.5 4.5-4.5Z"/>' +
            '<path d="M9.5 3.5v17"/><rect class="pane" x="5.5" y="6" width="2" height="12" rx="1" fill="currentColor" stroke="none"/></svg>';
        id.insertBefore(btn, id.firstChild);
        function sync() {
            var collapsed = root.dataset.side === "collapsed";
            btn.setAttribute("aria-expanded", collapsed ? "false" : "true");
            btn.setAttribute("aria-label", collapsed ? "Show side panel" : "Hide side panel");
            btn.title = collapsed ? "Show panel ( [ )" : "Hide panel ( [ )";
            side.inert = collapsed && window.matchMedia("(min-width: 901px)").matches;
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
            if (e.key !== "[" || e.metaKey || e.ctrlKey || e.altKey) return;
            var t = e.target;
            if (t && (t.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(t.tagName))) return;
            toggle();
        });
        window.addEventListener("resize", sync);
        sync();
    })();

    /* ---------- Theme + pull cord (a lamp switch for dark mode) ---------- */
    (function () {
        var root = document.documentElement;
        var reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

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
        }
        document.addEventListener("prefchange", syncKnob);
        syncKnob();

        // Verlet rope: anchored at the top, knob on the last point.
        var SEG = 12, LEN = 8, GRAVITY = 1250, DAMPING = 0.94, FRICTION = 0.985, ITER = 20, STRETCH = 26;
        var REST = SEG * LEN, ACTUATE = REST + STRETCH * 0.7, OFFSET = 100;
        var pts = [];
        for (var i = 0; i <= SEG; i++) {
            var nudge = reduce ? 0 : (i / SEG) * 3; // a small swing on load
            pts.push({ x: 0, y: i * LEN, px: nudge, py: i * LEN });
        }

        var dragging = false, target = null, grab = { x: 0, y: 0 }, start = { x: 0, y: 0 };
        var armed = true, moved = false, released = false, raf = 0, last = 0, keep = 0;

        function step(dt) {
            var g = GRAVITY * dt * dt, k = released ? DAMPING : FRICTION, end = pts[SEG];
            for (var i = 1; i <= SEG; i++) {
                var p = pts[i], vx = (p.x - p.px) * k, vy = (p.y - p.py) * k;
                p.px = p.x; p.py = p.y; p.x += vx; p.y += vy + g;
            }
            for (var n = 0; n < ITER; n++) {
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
            var dist = Math.hypot(x, y), max = REST + STRETCH;
            if (dist > max) { x *= max / dist; y *= max / dist; dist = max; }
            target.x = x; target.y = y;
            // fires mid-pull, like a real pull switch detenting
            if (armed && dist >= ACTUATE) { armed = false; toggleTheme(); }
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
    })();

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
})();
