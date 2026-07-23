/*
 * Avro Phonetic engine -- web port (UI chunk: config)
 * suckless-style config: every tunable lives here, nowhere else.
 * Edit this file to change behavior; no settings UI, no runtime prefs store.
 */

var Avro = (typeof Avro !== 'undefined') ? Avro : {};
Avro.UI = Avro.UI || {};

Avro.Config = {
    // Toggle the IME on/off for the whole page. Default: Ctrl+Space.
    toggleKey: { key: ' ', ctrlKey: true, altKey: false, shiftKey: false },

    // Keys that commit the current word as-is (finalize preview, close window,
    // and let the key's own default action happen afterward -- e.g. space
    // still inserts a space after committing).
    commitKeys: ['Enter', ' ', 'Tab', '.', ',', '!', '?', ';', ':'],

    // Escape reverts the current word back to raw Latin and closes the window.
    cancelKey: 'Escape',

    // Backspace behavior: if true, backspacing inside a live preview removes
    // one *source* character (and re-parses), not one Bangla glyph.
    smartBackspace: true,

    // Max number of dictionary candidates shown in the popup.
    maxSuggestions: 8,

    // Only digits 1..N (N = min(maxSuggestions,9)) are bound to direct-select.
    digitSelect: true,

    // Word characters: what counts as "still typing the same word".
    // Kept intentionally small -- ASCII letters and backtick (avro's own
    // escape char, see avrolib.js) and single-quote (juktakkhor helper).
    wordCharRegex: /^[A-Za-z'`]$/,

    // Elements the controller will attach to automatically.
    fieldSelector: 'input[type="text"], input:not([type]), textarea, [contenteditable="true"], [contenteditable=""]',

    // Candidate window visual offsets from caret, in px.
    windowOffsetX: 0,
    windowOffsetY: 4,

    // Root CSS custom properties for the candidate window (Shadow DOM scoped,
    // won't leak into or be overridden by the host page).
    theme: {
        bg: '#1e1e1e',
        fg: '#e6e6e6',
        accent: '#4c8bf5',
        border: '#3a3a3a',
        fontSize: '14px',
        fontFamily: '"Noto Sans Bengali", "Siyam Rupali", sans-serif'
    },

    // ---------------------------------------------------------------------------
    // Custom dictionary
    // ---------------------------------------------------------------------------
    // Map banglish keys to one or more Bengali output strings.
    // Values may be a single string or an array of strings (multiple candidates).
    //
    // Example:
    //   customDict: {
    //       'shuvo': 'শুভ',
    //       'noboborsho': ['নববর্ষ', 'নতুন বছর'],
    //       'vai': 'ভাই',
    //   }
    // Set customDict to {} or null to disable.
    customDict: {
        'chakraborty' : 'চক্রবর্তী'
        'riya' : 'রিয়া'
        '.' : '।'
        'barshon' : 'বর্ষণ'
    },

    // 'top'         – custom entries prepended before built-in dict results.
    // 'bottom'      – custom entries appended after built-in dict results.
    // 'autocorrect' – first custom entry takes the autocorrect slot (index 0).
    customDictPriority: 'top'
};
