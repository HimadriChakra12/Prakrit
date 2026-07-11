/*
 * Avro Phonetic engine -- web port (chunk 1: utf8)
 * Derived from ibus-avro (jsAvroPhonetic), (C) OmicronLab.
 * Original authors: Mehdi Hasan Khan, Rifat Nabi.
 * Original license: Mozilla Public License 2.0 (https://mozilla.org/MPL/2.0/)
 * This chunk: GJS/IBus/GTK/Gio dependencies removed for browser use.
 */

Avro.Utf8 = {
    decode: function (str) {
        return decodeURIComponent(unescape(str));
    }
};
