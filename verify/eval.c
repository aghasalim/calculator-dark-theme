/*
 * An independent C implementation of the calculator engine.
 *
 * engine.js is the only thing in this repo that knows what an expression
 * means, so nothing checks that it means the right thing. This is the same
 * grammar written again from the README, with no reference to the JavaScript
 * source beyond the grammar comment at the top of engine.js:
 *
 *   expr    := term (('+' | '-') term)*
 *   term    := unary (('*' | '/') unary)*
 *   unary   := ('-' | '+') unary | postfix
 *   postfix := primary '%'*
 *   primary := number | '(' expr ')'
 *
 * Usage: eval <corpus.tsv>
 * Each line is an expression, a tab, and either the expected value written by
 * JavaScript as a 17 significant digit double, or the word ERROR. Agreement
 * has to be exact: both sides are IEEE doubles evaluated in the same order,
 * so anything other than bit equality is a real disagreement.
 */
#include <math.h>
#include <setjmp.h>
#include <stdio.h>
#include <stdlib.h>
#include <string.h>

#define MAXLINE 4096

static jmp_buf oops;
static const char *cursor;

static void fail(void) { longjmp(oops, 1); }

/* The keypad shows the Unicode operators; the parser wants ASCII. */
static void normalize(const char *in, char *out, size_t cap) {
    size_t o = 0;
    for (size_t i = 0; in[i] && o + 1 < cap;) {
        unsigned char a = (unsigned char)in[i];
        unsigned char b = (unsigned char)in[i + 1];
        unsigned char c = b ? (unsigned char)in[i + 2] : 0;
        if (a == 0xC3 && b == 0x97) { out[o++] = '*'; i += 2; }
        else if (a == 0xC3 && b == 0xB7) { out[o++] = '/'; i += 2; }
        else if (a == 0xE2 && b == 0x88 && c == 0x92) { out[o++] = '-'; i += 3; }
        else if (a == ',') { i += 1; }
        else { out[o++] = in[i++]; }
    }
    out[o] = '\0';
}

static void skip_space(void) { while (*cursor == ' ') cursor++; }

/* JavaScript's number pattern: digits[.digits] | .digits, optional exponent. */
static int match_number(double *value) {
    const char *s = cursor;
    const char *p = s;
    int digits = 0;
    while (*p >= '0' && *p <= '9') { p++; digits++; }
    if (*p == '.') { p++; while (*p >= '0' && *p <= '9') { p++; digits++; } }
    if (digits == 0) return 0;
    if (*p == 'e' || *p == 'E') {
        const char *e = p + 1;
        if (*e == '+' || *e == '-') e++;
        if (*e >= '0' && *e <= '9') { while (*e >= '0' && *e <= '9') e++; p = e; }
    }
    char buf[128];
    size_t n = (size_t)(p - s);
    if (n >= sizeof buf) fail();
    memcpy(buf, s, n);
    buf[n] = '\0';
    *value = strtod(buf, NULL);
    cursor = p;
    return 1;
}

static double parse_expr(void);

static double parse_primary(void) {
    skip_space();
    if (*cursor == '(') {
        cursor++;
        double v = parse_expr();
        skip_space();
        if (*cursor != ')') fail();
        cursor++;
        return v;
    }
    double v;
    if (match_number(&v)) return v;
    fail();
    return 0;
}

static double parse_postfix(void) {
    double v = parse_primary();
    for (;;) {
        skip_space();
        if (*cursor != '%') return v;
        cursor++;
        v = v / 100.0;
    }
}

static double parse_unary(void) {
    skip_space();
    if (*cursor == '-') { cursor++; return -parse_unary(); }
    if (*cursor == '+') { cursor++; return parse_unary(); }
    return parse_postfix();
}

static double parse_term(void) {
    double left = parse_unary();
    for (;;) {
        skip_space();
        if (*cursor == '*') {
            cursor++;
            left = left * parse_unary();
        } else if (*cursor == '/') {
            cursor++;
            double d = parse_unary();
            if (d == 0.0) fail();          /* named refusal, not Infinity */
            left = left / d;
        } else {
            return left;
        }
    }
}

static double parse_expr(void) {
    double left = parse_term();
    for (;;) {
        skip_space();
        if (*cursor == '+') { cursor++; left = left + parse_term(); }
        else if (*cursor == '-') { cursor++; left = left - parse_term(); }
        else return left;
    }
}

/* 0 on success with *out set, 1 if the expression is refused. */
int calc_eval(const char *source, double *out) {
    char ascii[MAXLINE];
    normalize(source, ascii, sizeof ascii);
    cursor = ascii;
    if (setjmp(oops)) return 1;
    double v = parse_expr();
    skip_space();
    if (*cursor != '\0') return 1;         /* trailing input */
    if (!isfinite(v)) return 1;            /* out of range */
    *out = v;
    return 0;
}

int main(int argc, char **argv) {
    if (argc != 2) {
        fprintf(stderr, "usage: %s <corpus.tsv>\n", argv[0]);
        return 2;
    }
    FILE *f = fopen(argv[1], "r");
    if (!f) { perror(argv[1]); return 2; }

    char line[MAXLINE];
    long total = 0, bad = 0;
    while (fgets(line, sizeof line, f)) {
        line[strcspn(line, "\r\n")] = '\0';
        if (line[0] == '\0') continue;
        char *tab = strchr(line, '\t');
        if (!tab) {
            printf("  malformed line %ld: no tab\n", total + 1);
            bad++; total++; continue;
        }
        *tab = '\0';
        const char *expr = line;
        const char *want = tab + 1;
        total++;

        double got;
        int refused = calc_eval(expr, &got);

        if (strcmp(want, "ERROR") == 0) {
            if (!refused) {
                printf("  %s: JavaScript refuses it, C returned %.17g\n", expr, got);
                bad++;
            }
            continue;
        }
        if (refused) {
            printf("  %s: JavaScript gives %s, C refused it\n", expr, want);
            bad++;
            continue;
        }
        double expected = strtod(want, NULL);
        if (got != expected) {
            printf("  %s: C %.17g, JavaScript %.17g, difference %.3e\n",
                   expr, got, expected, got - expected);
            bad++;
        }
    }
    fclose(f);

    if (bad) {
        printf("C disagrees with JavaScript on %ld of %ld expressions\n", bad, total);
        return 1;
    }
    if (total == 0) {
        printf("C read no expressions from %s\n", argv[1]);
        return 1;
    }
    printf("C reproduces all %ld expressions in %s, exact, 0.0e+00\n", total, argv[1]);
    return 0;
}
