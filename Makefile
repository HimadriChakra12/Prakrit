# Makefile -- builds avroc (the MuJS-based compiler host) and then runs it
# to produce dist/avro.user.js. No npm, no node, no bundler framework.
#
# Prereqs: libmujs built and installed (see tools/README, or just:
#   git clone https://codeberg.org/ccxvii/mujs.git && cd mujs && make release
#   sudo make prefix=/usr/local install
# )

CC       ?= cc
CFLAGS   += -std=c99 -O2 -Wall -Wextra
LDLIBS   += -lmujs -lm

BIN      = avroc
SRC      = tools/avroc.c
OUT      = dist/avro.user.js

.PHONY: all clean rebuild

all: $(OUT)

$(BIN): $(SRC)
	$(CC) $(CFLAGS) -o $(BIN) $(SRC) $(LDLIBS)

$(OUT): $(BIN) tools/build.js src/namespace.js
	rm -f dist/avro.user.js
	./$(BIN) tools/build.js

rebuild:
	./$(BIN) tools/build.js

clean:
	rm -f $(BIN)
