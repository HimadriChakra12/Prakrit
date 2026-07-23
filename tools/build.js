/*
 * build.js -- the real "compiler". Walks the chunk list below in order,
 * concatenates them, wraps the result in a userscript metadata block,
 * and writes the final .user.js file.
 *
 * This is plain ES5 (MuJS has no ES6+ support by design), and it only
 * talks to the world through the three functions avroc.c exposes:
 * readFile(path), writeFile(path, data), exists(path). No fs, no require,
 * no npm -- on purpose.
 *
 * suckless-style config: every knob you'd want to change lives in the
 * two objects below. Nothing else in this file should need editing for
 * day-to-day use.
 */

// ---------------------------------------------------------------------
// config
// ---------------------------------------------------------------------

var OUT_FILE = "dist/avro.user.js";

var META = {
    name: "Avro Phonetic Script",
    namespace: "https://github.com/HimadriChakra12/Avroscript",
    version: "2.3.0",
    description: "Bengali phonetic transliteration IME for the web, ported from ibus-avro. Ctrl+Space to toggle.",
    author: "HimadriChakra12",
    match: ["*://*/*"],
    grant: "none",
    runAt: "document-idle"
};

// Load order matters: namespace first, core engine (any internal order),
// data (must exist before ui/controller.js runs, but doesn't need to
// precede core -- listed after core here just for readability), then ui,
// with ui/init.js last since it's the only chunk that touches `document`
// at load time.
var CHUNKS = [
    "src/namespace.js",

    "src/core/utf8.js",
    "src/core/levenshtein.js",
    "src/core/avrolib.js",
    "src/core/avroregexlib.js",
    "src/core/dbsearch.js",
    "src/core/suggestionbuilder.js",

    "src/data/avrodict.js",
    "src/data/suffixdict.js",
    "src/data/autocorrect.js",

    "src/ui/config.js",
    "src/ui/field-adapter.js",
    "src/ui/candidate-window.js",
    "src/ui/status-indicator.js",
    "src/ui/controller.js",
    "src/ui/init.js"
];

function buildHeader(meta) {
    var lines = [];
    lines.push("// ==UserScript==");
    lines.push("// @name        " + meta.name);
    lines.push("// @namespace   " + meta.namespace);
    lines.push("// @version     " + meta.version);
    lines.push("// @description " + meta.description);
    lines.push("// @author      " + meta.author);
    for (var i = 0; i < meta.match.length; i++) {
        lines.push("// @match       " + meta.match[i]);
    }
    lines.push("// @grant       " + meta.grant);
    lines.push("// @run-at      " + meta.runAt);
    lines.push("// ==/UserScript==");
    return lines.join("\n");
}

function main() {
    log("avroc: building " + OUT_FILE);
    log("avroc: " + CHUNKS.length + " chunks configured");

    // Fail fast and specifically, rather than concatenating a partial
    // bundle if a path was renamed/moved.
    var missing = [];
    for (var i = 0; i < CHUNKS.length; i++) {
        if (!exists(CHUNKS[i])) missing.push(CHUNKS[i]);
    }
    if (missing.length > 0) {
        log("avroc: ABORT -- missing " + missing.length + " chunk(s):");
        for (var m = 0; m < missing.length; m++) log("  - " + missing[m]);
        throw new Error("missing chunks, see log above");
    }

    var parts = [];
    var totalBytes = 0;
    var strippedBytes = 0;
    for (var c = 0; c < CHUNKS.length; c++) {
        var path = CHUNKS[c];
        var content = readFile(path);
        totalBytes += content.length;
        strippedBytes += content.length;
        log("  [" + (c + 1) + "/" + CHUNKS.length + "] " + path + " (" + content.length + " bytes)");
        parts.push(content);
    }

    var body = parts.join("\n\n");
    var header = buildHeader(META);

    // Wrap everything in a single IIFE. Since every chunk declares its
    // shared state as `var Avro = ...`, wrapping them all in one function
    // scope means that var becomes local to the closure -- confirmed by
    // testing that window.Avro is undefined after the bundle runs. The
    // whole engine stays reachable only through the document-level
    // keydown/focusout listeners init.js sets up. Nothing leaks onto
    // whatever page this runs on.
    var wrapped = header + "\n\n(function () {\n\"use strict\";\n\n" + body + "\n\n})();\n";

    writeFile(OUT_FILE, wrapped);

    log("avroc: wrote " + OUT_FILE + " (" + wrapped.length + " bytes, " +
        Math.round(wrapped.length / 1024) + " KB, from " + totalBytes + " bytes of source, " +
        strippedBytes + " after stripping comments)");
}

main();
