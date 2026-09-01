//! A third implementation of the calculator engine, plus the fuzzer.
//!
//! Fifty two hand written expressions only cover the cases I thought of. This
//! generates random ones from the grammar with a small xorshift generator,
//! evaluates them here, and writes them out so the JavaScript and C
//! implementations can be run over the same corpus. Three independent parsers
//! agreeing on a hundred thousand random expressions is a much stronger claim
//! than a fixed list, and the seed is fixed so a failure can be reproduced.
//!
//! No external crates.
//!
//!   calcfuzz check <corpus.tsv>
//!   calcfuzz fuzz <count> <seed> <out.tsv>

use std::env;
use std::fs;
use std::process::exit;

// ---------------------------------------------------------------- evaluator

/// The keypad glyphs the display uses, rewritten to ASCII.
fn normalize(source: &str) -> Vec<char> {
    source
        .chars()
        .filter_map(|c| match c {
            '\u{00d7}' => Some('*'),
            '\u{00f7}' => Some('/'),
            '\u{2212}' => Some('-'),
            ',' => None,
            other => Some(other),
        })
        .collect()
}

struct Parser {
    src: Vec<char>,
    pos: usize,
}

/// Refusal, not a value: divide by zero, malformed input, out of range.
struct Refused;

type Answer = Result<f64, Refused>;

impl Parser {
    fn skip_space(&mut self) {
        while self.src.get(self.pos) == Some(&' ') {
            self.pos += 1;
        }
    }

    fn at(&self) -> Option<char> {
        self.src.get(self.pos).copied()
    }

    fn eat(&mut self, c: char) -> bool {
        self.skip_space();
        if self.at() == Some(c) {
            self.pos += 1;
            true
        } else {
            false
        }
    }

    /// digits [. digits] | . digits, with an optional exponent.
    fn number(&mut self) -> Answer {
        let start = self.pos;
        let mut digits = 0;
        while matches!(self.at(), Some(c) if c.is_ascii_digit()) {
            self.pos += 1;
            digits += 1;
        }
        if self.at() == Some('.') {
            self.pos += 1;
            while matches!(self.at(), Some(c) if c.is_ascii_digit()) {
                self.pos += 1;
                digits += 1;
            }
        }
        if digits == 0 {
            return Err(Refused);
        }
        if matches!(self.at(), Some('e') | Some('E')) {
            let mark = self.pos;
            self.pos += 1;
            if matches!(self.at(), Some('+') | Some('-')) {
                self.pos += 1;
            }
            if matches!(self.at(), Some(c) if c.is_ascii_digit()) {
                while matches!(self.at(), Some(c) if c.is_ascii_digit()) {
                    self.pos += 1;
                }
            } else {
                self.pos = mark;
            }
        }
        let text: String = self.src[start..self.pos].iter().collect();
        // Rust rejects a trailing dot such as "7."; JavaScript's parseFloat
        // takes it, so pad it before parsing.
        let text = if text.ends_with('.') { format!("{}0", text) } else { text };
        let text = if text.starts_with('.') { format!("0{}", text) } else { text };
        text.parse::<f64>().map_err(|_| Refused)
    }

    fn primary(&mut self) -> Answer {
        if self.eat('(') {
            let value = self.expr()?;
            if !self.eat(')') {
                return Err(Refused);
            }
            return Ok(value);
        }
        self.skip_space();
        self.number()
    }

    fn postfix(&mut self) -> Answer {
        let mut value = self.primary()?;
        while self.eat('%') {
            value /= 100.0;
        }
        Ok(value)
    }

    fn unary(&mut self) -> Answer {
        if self.eat('-') {
            return Ok(-self.unary()?);
        }
        if self.eat('+') {
            return self.unary();
        }
        self.postfix()
    }

    fn term(&mut self) -> Answer {
        let mut left = self.unary()?;
        loop {
            if self.eat('*') {
                left *= self.unary()?;
            } else if self.eat('/') {
                let divisor = self.unary()?;
                if divisor == 0.0 {
                    return Err(Refused);
                }
                left /= divisor;
            } else {
                return Ok(left);
            }
        }
    }

    fn expr(&mut self) -> Answer {
        let mut left = self.term()?;
        loop {
            if self.eat('+') {
                left += self.term()?;
            } else if self.eat('-') {
                left -= self.term()?;
            } else {
                return Ok(left);
            }
        }
    }
}

fn evaluate(source: &str) -> Answer {
    let mut p = Parser { src: normalize(source), pos: 0 };
    let value = p.expr()?;
    p.skip_space();
    if p.pos != p.src.len() {
        return Err(Refused);
    }
    if !value.is_finite() {
        return Err(Refused);
    }
    Ok(value)
}

/// 17 significant digits, the same shape JavaScript's toExponential(16) writes.
fn encode(answer: Answer) -> String {
    match answer {
        Err(Refused) => "ERROR".to_string(),
        Ok(v) => {
            let s = format!("{:.16e}", v);
            // Rust writes 1.4e1, JavaScript writes 1.4e+1. Only the sign
            // differs, and everything reads this back with a float parser, but
            // matching the shape keeps the corpus uniform.
            match s.split_once('e') {
                Some((m, e)) if !e.starts_with('-') => format!("{}e+{}", m, e),
                _ => s,
            }
        }
    }
}

// ------------------------------------------------------------------ xorshift

struct Rng(u64);

impl Rng {
    fn next(&mut self) -> u64 {
        let mut x = self.0;
        x ^= x << 13;
        x ^= x >> 7;
        x ^= x << 17;
        self.0 = x;
        x
    }
    fn below(&mut self, n: u64) -> u64 {
        self.next() % n
    }
}

fn gen_number(rng: &mut Rng) -> String {
    match rng.below(10) {
        0..=4 => format!("{}", rng.below(1000)),
        5..=6 => format!("{}.{}", rng.below(100), rng.below(1000)),
        7 => format!(".{}", rng.below(1000)),
        8 => format!("{}e{}", rng.below(10) + 1, rng.below(6)),
        _ => format!("{}", rng.below(10)),
    }
}

fn gen_expr(rng: &mut Rng, depth: u32) -> String {
    let mut out = gen_term(rng, depth);
    for _ in 0..rng.below(3) {
        let op = if rng.below(2) == 0 { "+" } else { "\u{2212}" };
        out.push_str(op);
        out.push_str(&gen_term(rng, depth));
    }
    out
}

fn gen_term(rng: &mut Rng, depth: u32) -> String {
    let mut out = gen_unary(rng, depth);
    for _ in 0..rng.below(3) {
        let op = if rng.below(2) == 0 { "\u{00d7}" } else { "\u{00f7}" };
        out.push_str(op);
        out.push_str(&gen_unary(rng, depth));
    }
    out
}

fn gen_unary(rng: &mut Rng, depth: u32) -> String {
    let mut out = String::new();
    match rng.below(8) {
        0 => out.push('\u{2212}'),
        1 => out.push('+'),
        _ => {}
    }
    if depth > 0 && rng.below(4) == 0 {
        out.push('(');
        out.push_str(&gen_expr(rng, depth - 1));
        out.push(')');
    } else {
        out.push_str(&gen_number(rng));
    }
    if rng.below(6) == 0 {
        out.push('%');
    }
    out
}

// ---------------------------------------------------------------------- main

fn check(path: &str) -> i32 {
    let text = match fs::read_to_string(path) {
        Ok(t) => t,
        Err(e) => {
            println!("cannot read {}: {}", path, e);
            return 2;
        }
    };
    let mut total = 0usize;
    let mut bad = 0usize;
    for (i, line) in text.lines().enumerate() {
        if line.is_empty() {
            continue;
        }
        total += 1;
        let (expr, want) = match line.split_once('\t') {
            Some(pair) => pair,
            None => {
                println!("  malformed line {}: no tab", i + 1);
                bad += 1;
                continue;
            }
        };
        let got = evaluate(expr);
        match (want, &got) {
            ("ERROR", Ok(v)) => {
                println!("  {}: corpus says ERROR, Rust returned {:e}", expr, v);
                bad += 1;
            }
            ("ERROR", Err(_)) => {}
            (_, Err(_)) => {
                println!("  {}: corpus says {}, Rust refused it", expr, want);
                bad += 1;
            }
            (_, Ok(v)) => match want.parse::<f64>() {
                Ok(expected) if *v == expected => {}
                Ok(expected) => {
                    println!(
                        "  {}: Rust {:e}, corpus {:e}, difference {:e}",
                        expr,
                        v,
                        expected,
                        v - expected
                    );
                    bad += 1;
                }
                Err(_) => {
                    println!("  {}: corpus value {} is not a number", expr, want);
                    bad += 1;
                }
            },
        }
    }
    if bad > 0 {
        println!("Rust disagrees with {} on {} of {} expressions", path, bad, total);
        return 1;
    }
    if total == 0 {
        println!("Rust read no expressions from {}", path);
        return 1;
    }
    println!("Rust reproduces all {} expressions in {}, exact, 0.0e+00", total, path);
    0
}

fn fuzz(count: usize, seed: u64, path: &str) -> i32 {
    let mut rng = Rng(if seed == 0 { 0x2545F4914F6CDD1D } else { seed });
    let mut out = String::new();
    let mut refused = 0usize;
    for _ in 0..count {
        let expr = gen_expr(&mut rng, 3);
        let answer = evaluate(&expr);
        if answer.is_err() {
            refused += 1;
        }
        out.push_str(&expr);
        out.push('\t');
        out.push_str(&encode(answer));
        out.push('\n');
    }
    if let Err(e) = fs::write(path, out) {
        println!("cannot write {}: {}", path, e);
        return 2;
    }
    println!(
        "Rust generated {} random expressions (seed {}), {} of them refused, into {}",
        count, seed, refused, path
    );
    0
}

fn main() {
    let args: Vec<String> = env::args().collect();
    let code = match args.get(1).map(String::as_str) {
        Some("check") if args.len() == 3 => check(&args[2]),
        Some("fuzz") if args.len() == 5 => fuzz(
            args[2].parse().unwrap_or(0),
            args[3].parse().unwrap_or(1),
            &args[4],
        ),
        _ => {
            println!("usage: calcfuzz check <corpus.tsv> | calcfuzz fuzz <count> <seed> <out.tsv>");
            2
        }
    };
    exit(code);
}
