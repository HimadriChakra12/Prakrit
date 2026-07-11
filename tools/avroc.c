/*
 * avroc.c -- a tiny suckless "compiler" host for MuJS.
 *
 * MuJS itself is pure ES5 with zero I/O of its own by design (that's the
 * whole point of it being embeddable). This program is the ~100 lines of
 * C glue that gives a MuJS-run build script exactly three things it needs
 * to act as a bundler: readFile(), writeFile(), and exists(). Everything
 * else -- chunk order, the userscript header, concatenation logic -- lives
 * in build.js, not here. This file should never need to change.
 *
 * Usage: avroc <script.js>
 */

#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#include <sys/stat.h>

#include <mujs.h>

static char *slurp(const char *path, long *out_len)
{
	FILE *f = fopen(path, "rb");
	if (!f) return NULL;

	fseek(f, 0, SEEK_END);
	long len = ftell(f);
	fseek(f, 0, SEEK_SET);

	char *buf = malloc(len + 1);
	if (!buf) { fclose(f); return NULL; }

	size_t got = fread(buf, 1, len, f);
	fclose(f);
	buf[got] = '\0';

	if (out_len) *out_len = (long)got;
	return buf;
}

/* JS: readFile(path) -> string. Throws on missing/unreadable file. */
static void jsb_readFile(js_State *J)
{
	const char *path = js_tostring(J, 1);
	char *data = slurp(path, NULL);
	if (!data)
		js_error(J, "readFile: cannot read '%s'", path);
	js_pushstring(J, data);
	free(data);
}

/* JS: writeFile(path, data) -> undefined. Throws on write failure. */
static void jsb_writeFile(js_State *J)
{
	const char *path = js_tostring(J, 1);
	const char *data = js_tostring(J, 2);

	FILE *f = fopen(path, "wb");
	if (!f)
		js_error(J, "writeFile: cannot open '%s' for writing", path);

	fwrite(data, 1, strlen(data), f);
	fclose(f);
	js_pushundefined(J);
}

/* JS: exists(path) -> boolean. */
static void jsb_exists(js_State *J)
{
	const char *path = js_tostring(J, 1);
	struct stat st;
	js_pushboolean(J, stat(path, &st) == 0);
}

/* JS: log(...args) -> undefined. Prints to stderr so stdout stays clean
 * for anything the build script wants to actually emit. */
static void jsb_log(js_State *J)
{
	int i, top = js_gettop(J);
	for (i = 1; i < top; i++) {
		if (i > 1) fputc(' ', stderr);
		fputs(js_tostring(J, i), stderr);
	}
	fputc('\n', stderr);
	js_pushundefined(J);
}

int main(int argc, char **argv)
{
	if (argc < 2) {
		fprintf(stderr, "usage: %s <script.js>\n", argv[0]);
		return 1;
	}

	js_State *J = js_newstate(NULL, NULL, JS_STRICT);
	if (!J) {
		fprintf(stderr, "avroc: could not create MuJS state\n");
		return 1;
	}

	js_newcfunction(J, jsb_readFile, "readFile", 1);
	js_setglobal(J, "readFile");

	js_newcfunction(J, jsb_writeFile, "writeFile", 2);
	js_setglobal(J, "writeFile");

	js_newcfunction(J, jsb_exists, "exists", 1);
	js_setglobal(J, "exists");

	js_newcfunction(J, jsb_log, "log", 0);
	js_setglobal(J, "log");

	if (js_dofile(J, argv[1])) {
		fprintf(stderr, "avroc: %s\n", js_trystring(J, -1, "error"));
		js_freestate(J);
		return 1;
	}

	js_freestate(J);
	return 0;
}
