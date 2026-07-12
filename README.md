# Avro phonetic for Browsers
Avro phonetic implementation for Browsers in Userscript.

## One Click Installation

1. Open Browser and Install [Tampermonkey](https://addons.mozilla.org/en-US/firefox/addon/tampermonkey) or [ViolentMonkey](https://addons.mozilla.org/en-US/firefox/addon/violentmonkey/)
2. Install the script with [this](https://tinyurl.com/avroscript)

## From Sctrach Building & Installation

you can build the script
using the source code in this repository.

1. Open terminal/package manager and install following packages:

		mujs
        any C compiler

2. Building:

		git clone https://github.com/HimadriChakra12/Avroscript.git
		cd Avroscript
        make

3. You can configure the UI by modifying [src/ui/config.js](./src/ui/config.js) then use `make`

4. Make a new script on Violentmonkey and Copy & Paste the `./disk/avro.user.js` to the New Script

## Contributors
 
[__Avro JavaScript Phonetic Library__](https://github.com/torifat/jsAvroPhonetic) by [__Rifat Nabi__](https://github.com/torifat)

__Avro Phonetic Dictionary Search Library__ by [__Mehdi Hasan Khan__](https://github.com/omicronlab)

_Licensed under Mozilla Public License 2.0 ("MPL"), an open source/free software license._
