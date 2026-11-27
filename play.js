/* play.js — behaviour for Play experiment pages: live status, tuning sliders,
   the code viewer (reads the real source between #region markers) and the
   Copy buttons. Loaded after site.js. */
(function () {
    "use strict";

    var H = window.Highlighter;

    function copyText(text) {
        if (navigator.clipboard && window.isSecureContext) {
            return navigator.clipboard.writeText(text).catch(legacy);
        }
        return legacy();
        function legacy() {
            var ta = document.createElement("textarea");
            ta.value = text;
            ta.setAttribute("readonly", "");
            ta.style.cssText = "position:fixed;top:0;left:0;opacity:0";
            document.body.appendChild(ta);
            ta.select();
            var ok = false;
            try { ok = document.execCommand("copy"); } catch (err) { ok = false; }
            ta.remove();
            return ok ? Promise.resolve() : Promise.reject();
        }
    }
    // swap a button's label for a moment ("Copied"), then put it back
    function flash(btn, label) {
        var original = btn.dataset.label || btn.textContent;
        btn.dataset.label = original;
        btn.textContent = label;
        clearTimeout(btn._t);
        btn._t = setTimeout(function () { btn.textContent = original; }, 1600);
    }

    /* ---------- Live status line ---------- */
    var status = document.querySelector("[data-status-hl]");
    function describe(list) {
        if (!status) return;
        if (!list.length) { status.textContent = "Nothing highlighted on this page yet."; return; }
        var counts = {};
        list.forEach(function (h) { counts[h.c] = (counts[h.c] || 0) + 1; });
        var parts = Object.keys(counts).map(function (c) { return counts[c] + " " + c; });
        var inks = parts.length > 1 ? parts.slice(0, -1).join(", ") + " and " + parts[parts.length - 1] : parts[0];
        status.innerHTML = "<b>" + list.length + (list.length === 1 ? " highlight" : " highlights") +
            "</b> on this page: " + inks + ".";
    }
    document.addEventListener("highlights:change", function (e) { describe(e.detail.list); });

    var cordStatus = document.querySelector("[data-status-cord]");
    function describeCord(pulls) {
        if (!cordStatus || !window.PullCord) return;
        var state = window.PullCord.isDark() ? "Lights off." : "Lights on.";
        cordStatus.innerHTML = pulls
            ? "<b>Pulled " + pulls + (pulls === 1 ? " time" : " times") + ".</b> " + state
            : state + " Nobody has pulled the cord yet.";
        document.documentElement.classList.toggle("cord-pulled", pulls > 0);
    }
    describeCord(0);
    document.addEventListener("pullcord:pull", function (e) { describeCord(e.detail.pulls); });
    var hint = document.querySelector(".cord-hint");
    if (hint) {
        var onScroll = function () { hint.classList.toggle("is-gone", window.scrollY > 120); };
        window.addEventListener("scroll", onScroll, { passive: true });
        onScroll();
    }
    var tug = document.querySelector("[data-tug]");
    if (tug) tug.addEventListener("click", function () {
        var knob = document.querySelector(".pullcord-knob");
        if (knob) knob.click();
    });

    /* ---------- First visit: a few highlights to play with ---------- */
    var demo = document.querySelector("[data-demo] .lab-passage");
    if (H && demo) {
        H.seed(demo, [
            { text: "you've decided that sentence matters", c: "yellow" },
            { text: "the edges wobble", c: "pink" },
            { text: "Highlights stay on the page", c: "green" }
        ]);
    }
    if (H) describe(H.count());

    /* ---------- Sliders ---------- */
    var tune = document.querySelector("[data-tune]");
    var T = tune && window[tune.dataset.tune];
    if (T) {
        var inputs = Array.prototype.slice.call(tune.querySelectorAll("input[type=range]"));
        var raf = 0;
        var fmt = {
            ink: function (v) { return Math.round(v * 100) + "%"; },
            wobble: function (v) { return v.toFixed(1); },
            tip: function (v) { return v + "px"; },
            pass: function (v) { return Math.round(v * 100) + "%"; },
            streaks: function (v) { return String(v); },
            gravity: function (v) { return String(Math.round(v)); },
            damping: function (v) { return v.toFixed(3); },
            stiffness: function (v) { return String(v); },
            travel: function (v) { return v + "px"; }
        };
        function show(input) {
            var v = parseFloat(input.value);
            var p = (v - input.min) / (input.max - input.min) * 100;
            input.style.setProperty("--p", p + "%");
            input.parentNode.querySelector("output").textContent = fmt[input.name](v);
        }
        function sync() {
            inputs.forEach(function (input) {
                input.value = T.config[input.name];
                show(input);
            });
        }
        inputs.forEach(function (input) {
            input.addEventListener("input", function () {
                T.config[input.name] = parseFloat(input.value);
                show(input);
                if (T.repaint) {
                    cancelAnimationFrame(raf);
                    raf = requestAnimationFrame(T.repaint);
                }
            });
        });
        var reset = document.querySelector("[data-reset]");
        if (reset) reset.addEventListener("click", function () {
            Object.keys(T.defaults).forEach(function (k) { T.config[k] = T.defaults[k]; });
            sync();
            if (T.repaint) T.repaint();
        });
        sync();
    }

    /* ---------- Code viewer ---------- */
    var viewer = document.querySelector(".lab-code");
    if (viewer) {
        var codeEl = viewer.querySelector("[data-code]");
        var meta = viewer.querySelector("[data-code-meta]");
        var tabs = Array.prototype.slice.call(viewer.querySelectorAll("[data-file]"));
        var files = {};
        var current = "js";
        var name = viewer.dataset.region;
        var NAMES = { js: name + ".js", css: name + ".css" };

        // what goes on top of each file so it works on its own
        var BY = "By Raghav Prasanna. https://raghavprasanna.co.uk/play.html";
        var PRESETS = {
            highlighter: {
                title: "iOS-style selection + highlighter",
                cssRegions: ["motion", "highlighter"],
                jsHead: "",
                cssHead: [
                    "/* Design tokens the highlighter uses. Keep yours if you already have them. */",
                    ":root {",
                    "    --ease: cubic-bezier(.32, .72, 0, 1);",
                    "    --spring: var(--ease);",
                    "    --fast: 220ms;",
                    "    --slow: 480ms;",
                    "    --spring-dur: 560ms;",
                    "    --radius-ctl: 14px;",
                    "    --r-md: 18px;",
                    "}", ""
                ].join("\n")
            },
            pullcord: {
                title: "a pull cord that switches dark mode",
                cssRegions: ["pullcord"],
                jsHead: [
                    "// The site's theme helpers, reduced to the bare minimum. Swap in your own:",
                    "// getPref(\"theme\") returns the current theme, setPref(\"theme\", v) sets it and",
                    "// fires \"prefchange\" so the knob's label stays in sync.",
                    "function getPref(key) { return document.documentElement.dataset[key] || \"light\"; }",
                    "function setPref(key, value) {",
                    "    if (value === \"light\") delete document.documentElement.dataset[key];",
                    "    else document.documentElement.dataset[key] = value;",
                    "    document.dispatchEvent(new CustomEvent(\"prefchange\", { detail: { key: key, value: value } }));",
                    "}", ""
                ].join("\n"),
                cssHead: [
                    "/* Tokens the cord uses. Keep yours if you already have them. */",
                    ":root {",
                    "    --card: #fafafa;                     /* knob */",
                    "    --line-strong: rgba(23, 23, 23, .16); /* knob outline */",
                    "    --cord: rgba(23, 23, 23, .4);         /* rope */",
                    "    --accent: #c2410c;                    /* the dot on the knob */",
                    "    --radius-ctl: 8px;",
                    "}",
                    ":root[data-theme=\"dark\"] { --cord: rgba(255, 255, 255, .36); --line-strong: rgba(255, 255, 255, .16); }", ""
                ].join("\n")
            }
        };
        var preset = PRESETS[name];

        function region(text, name, css) {
            var open = css ? "/* #region " + name + " */" : "// #region " + name;
            var close = css ? "/* #endregion " + name + " */" : "// #endregion " + name;
            var a = text.indexOf(open), b = text.indexOf(close);
            if (a < 0 || b < 0) return "";
            var body = text.slice(text.indexOf("\n", a) + 1, b);
            // drop the indentation the code has inside site.js
            var lines = body.replace(/\s+$/, "").split("\n");
            var pad = Math.min.apply(null, lines.filter(function (l) { return l.trim(); })
                .map(function (l) { return l.match(/^ */)[0].length; }));
            return lines.map(function (l) { return l.slice(pad); }).join("\n") + "\n";
        }

        function esc(s) { return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;"); }
        // a small tokenizer: comments, strings, keywords/properties and numbers
        var RULES = {
            js: /(\/\*[\s\S]*?\*\/|\/\/[^\n]*)|("(?:\\.|[^"\\\n])*"|'(?:\\.|[^'\\\n])*')|\b(var|function|return|if|else|for|while|new|typeof|try|catch|true|false|null|this)\b|\b(\d+(?:\.\d+)?)\b/g,
            css: /(\/\*[\s\S]*?\*\/)|("(?:\\.|[^"\\\n])*"|'(?:\\.|[^'\\\n])*')|(@[\w-]+|!important)|(#[0-9a-fA-F]{3,8}\b|-?\d*\.?\d+(?:px|ms|em|deg|s|%)?(?![\w-]))|(--[\w-]+)/g
        };
        function paint(code, lang) {
            var re = RULES[lang], out = "", last = 0, m;
            re.lastIndex = 0;
            while ((m = re.exec(code))) {
                out += esc(code.slice(last, m.index));
                var cls = m[1] ? "c" : m[2] ? "s" : m[3] ? "k" : m[4] ? "n" : "p";
                out += '<span class="tok-' + cls + '">' + esc(m[0]) + "</span>";
                last = re.lastIndex;
            }
            return out + esc(code.slice(last));
        }

        function showFile(key) {
            current = key;
            tabs.forEach(function (t) { t.setAttribute("aria-selected", String(t.dataset.file === key)); });
            var src = files[key];
            if (!src) return;
            codeEl.innerHTML = paint(src, key);
            var lines = src.split("\n").length;
            meta.textContent = lines + " lines · " + (new Blob([src]).size / 1024).toFixed(1) + " KB";
        }
        tabs.forEach(function (t) { t.addEventListener("click", function () { showFile(t.dataset.file); }); });

        Promise.all([
            fetch("site.js").then(function (r) { return r.text(); }),
            fetch("site.css").then(function (r) { return r.text(); })
        ]).then(function (res) {
            var js = region(res[0], name, false);
            var css = preset.cssRegions.map(function (r) { return region(res[1], r, true); }).join("\n");
            files.js = "/* " + NAMES.js + " — " + preset.title + ". " + BY + " */\n" + preset.jsHead + js;
            files.css = "/* " + NAMES.css + " — " + preset.title + ". " + BY + " */\n" + preset.cssHead + css;
            showFile(current);
        }).catch(function () {
            codeEl.textContent = "Couldn't load the source here. Use the prompt below, or view site.js on GitHub.";
        });

        viewer.querySelector("[data-code-copy]").addEventListener("click", function (e) {
            var btn = e.currentTarget;
            if (!files[current]) return;
            copyText(files[current]).then(function () { flash(btn, "Copied"); }, function () { flash(btn, "Press ⌘C"); });
        });
        viewer.querySelector("[data-code-download]").addEventListener("click", function () {
            if (!files[current]) return;
            var a = document.createElement("a");
            a.href = URL.createObjectURL(new Blob([files[current]], { type: current === "js" ? "text/javascript" : "text/css" }));
            a.download = NAMES[current];
            document.body.appendChild(a);
            a.click();
            setTimeout(function () { URL.revokeObjectURL(a.href); a.remove(); }, 0);
        });
        var more = viewer.querySelector("[data-code-more]");
        more.addEventListener("click", function () {
            var open = viewer.classList.toggle("is-open");
            more.textContent = open ? "Show less" : "Show all";
            if (!open) viewer.scrollIntoView({ block: "nearest" });
        });
    }

    /* ---------- Copy prompt ---------- */
    var promptBtn = document.querySelector("[data-copy-prompt]");
    var promptText = document.querySelector("[data-prompt]");
    if (promptBtn && promptText) {
        promptBtn.addEventListener("click", function () {
            copyText(promptText.textContent).then(function () {
                flash(promptBtn, "Copied. Paste it into your AI.");
                if (window.plausible) window.plausible("Copy prompt", { props: { page: location.pathname } });
            }, function () { flash(promptBtn, "Couldn't copy. Select the text above."); });
        });
    }
})();
