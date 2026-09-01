// Structural validation of the shared corpus, and an independent
// reimplementation of the display formatter.
//
// The other languages here re-evaluate expressions. Nothing re-checks the
// thing a user actually sees, which is engine.js formatNumber: 12 significant
// digits, thousands separators, a real minus sign, no negative zero. The
// README publishes several of those strings as facts about the calculator, so
// this recomputes each one from the corpus value and requires the README to
// agree, character for character.
//
//	go run . -root ..
package main

import (
	"bufio"
	"flag"
	"fmt"
	"math"
	"os"
	"path/filepath"
	"regexp"
	"strconv"
	"strings"
)

type corpus struct {
	order  []string
	values map[string]string
}

func loadCorpus(path string) (*corpus, []string) {
	var problems []string
	c := &corpus{values: map[string]string{}}

	file, err := os.Open(path)
	if err != nil {
		return nil, []string{fmt.Sprintf("cannot open %s: %v", path, err)}
	}
	defer file.Close()

	scanner := bufio.NewScanner(file)
	scanner.Buffer(make([]byte, 0, 64*1024), 1024*1024)
	line := 0
	for scanner.Scan() {
		line++
		text := scanner.Text()
		if strings.Contains(text, "\r") {
			problems = append(problems, fmt.Sprintf("line %d: carriage return", line))
			continue
		}
		if strings.TrimSpace(text) == "" {
			problems = append(problems, fmt.Sprintf("line %d: blank", line))
			continue
		}
		fields := strings.Split(text, "\t")
		if len(fields) != 2 {
			problems = append(problems, fmt.Sprintf("line %d: %d fields, want 2 (ragged row)", line, len(fields)))
			continue
		}
		expr, want := fields[0], fields[1]
		if expr == "" {
			problems = append(problems, fmt.Sprintf("line %d: empty expression", line))
			continue
		}
		if expr != strings.TrimSpace(expr) {
			problems = append(problems, fmt.Sprintf("line %d: expression has edge whitespace", line))
		}
		if _, seen := c.values[expr]; seen {
			problems = append(problems, fmt.Sprintf("line %d: duplicate expression %q", line, expr))
			continue
		}
		if want != "ERROR" {
			v, err := strconv.ParseFloat(want, 64)
			if err != nil {
				problems = append(problems, fmt.Sprintf("line %d: value %q does not parse", line, want))
				continue
			}
			if math.IsNaN(v) {
				problems = append(problems, fmt.Sprintf("line %d: NaN value", line))
				continue
			}
			if math.IsInf(v, 0) {
				problems = append(problems, fmt.Sprintf("line %d: infinite value", line))
				continue
			}
		}
		c.order = append(c.order, expr)
		c.values[expr] = want
	}
	if err := scanner.Err(); err != nil {
		problems = append(problems, fmt.Sprintf("read error: %v", err))
	}
	if len(c.order) == 0 {
		problems = append(problems, "corpus holds no expressions")
	}
	return c, problems
}

// --- the display path, written again -------------------------------------

var groupTarget = regexp.MustCompile(`\d+(?:\.\d*)?`)

func group(text string) string {
	return groupTarget.ReplaceAllStringFunc(text, func(match string) string {
		whole, frac, hasFrac := strings.Cut(match, ".")
		var b strings.Builder
		for i, digit := range whole {
			if i > 0 && (len(whole)-i)%3 == 0 {
				b.WriteByte(',')
			}
			b.WriteRune(digit)
		}
		if hasFrac {
			return b.String() + "." + frac
		}
		return b.String()
	})
}

// precision is engine.js PRECISION: significant digits kept before display.
func formatNumber(value float64, precision int) string {
	if math.IsNaN(value) || math.IsInf(value, 0) {
		return "Error"
	}
	// Round to `precision` significant digits, then read it back, exactly as
	// parseFloat(value.toPrecision(PRECISION)) does.
	rounded, err := strconv.ParseFloat(strconv.FormatFloat(value, 'e', precision-1, 64), 64)
	if err != nil {
		return "Error"
	}
	if rounded == 0 {
		rounded = 0 // collapse negative zero
	}
	var text string
	magnitude := math.Abs(rounded)
	// JavaScript's String() switches to exponential at 1e21 and below 1e-6.
	if magnitude != 0 && (magnitude >= 1e21 || magnitude < 1e-6) {
		text = strconv.FormatFloat(rounded, 'e', -1, 64)
	} else {
		text = strconv.FormatFloat(rounded, 'f', -1, 64)
	}
	text = strings.Replace(text, "-", "\u2212", 1)
	if strings.Contains(text, "e") {
		return text
	}
	return group(text)
}

// --- README claims --------------------------------------------------------

type claim struct {
	expr      string // key into the corpus
	published string // what README.md says the calculator displays
}

func main() {
	root := flag.String("root", "..", "repository root")
	flag.Parse()

	corpusPath := filepath.Join(*root, "verify", "cases.tsv")
	c, problems := loadCorpus(corpusPath)
	if c == nil {
		fmt.Println("Go could not read the corpus:")
		for _, p := range problems {
			fmt.Println("  " + p)
		}
		os.Exit(1)
	}

	readmeBytes, err := os.ReadFile(filepath.Join(*root, "README.md"))
	if err != nil {
		fmt.Printf("cannot read README.md: %v\n", err)
		os.Exit(1)
	}
	readme := string(readmeBytes)

	engineBytes, err := os.ReadFile(filepath.Join(*root, "engine.js"))
	if err != nil {
		fmt.Printf("cannot read engine.js: %v\n", err)
		os.Exit(1)
	}

	// The precision the README quotes has to be the precision the engine uses.
	precision := 0
	if m := regexp.MustCompile(`PRECISION\s*=\s*(\d+)`).FindStringSubmatch(string(engineBytes)); m != nil {
		precision, _ = strconv.Atoi(m[1])
	} else {
		problems = append(problems, "engine.js does not define PRECISION")
	}
	if precision > 0 && !strings.Contains(readme, fmt.Sprintf("%d significant digits", precision)) {
		problems = append(problems, fmt.Sprintf("README does not say %d significant digits, but engine.js does", precision))
	}

	// The corpus size the README publishes has to be the corpus size on disk.
	if m := regexp.MustCompile(`(\d+)\s+hand written expressions`).FindStringSubmatch(readme); m != nil {
		if stated, _ := strconv.Atoi(m[1]); stated != len(c.order) {
			problems = append(problems, fmt.Sprintf("README says %d hand written expressions, verify/cases.tsv holds %d", stated, len(c.order)))
		}
	} else {
		problems = append(problems, "README does not state the size of the corpus")
	}

	claims := []claim{
		{"2+3\u00d74", "14"},
		{"(2+3)\u00d74", "20"},
		{"50%", "0.5"},
		{"200\u00d710%", "20"},
		{"200+10%", "200.1"},
		{"0.1+0.2", "0.3"},
		{"123456789\u00d7987654321", "121,932,631,113,000,000"},
	}

	checked := 0
	for _, cl := range claims {
		raw, ok := c.values[cl.expr]
		if !ok {
			problems = append(problems, fmt.Sprintf("%s is not in the corpus", cl.expr))
			continue
		}
		if raw == "ERROR" {
			problems = append(problems, fmt.Sprintf("%s is refused by the corpus but the README publishes %s", cl.expr, cl.published))
			continue
		}
		value, err := strconv.ParseFloat(raw, 64)
		if err != nil {
			problems = append(problems, fmt.Sprintf("%s: corpus value %q does not parse", cl.expr, raw))
			continue
		}
		got := formatNumber(value, precision)
		if got != cl.published {
			problems = append(problems, fmt.Sprintf("%s: corpus formats to %s, README publishes %s", cl.expr, got, cl.published))
			continue
		}
		if !strings.Contains(readme, cl.published) {
			problems = append(problems, fmt.Sprintf("%s: README no longer contains %s", cl.expr, cl.published))
			continue
		}
		checked++
	}

	// Negative zero and the minus glyph are display promises too.
	if got := formatNumber(math.Copysign(0, -1), precision); got != "0" {
		problems = append(problems, fmt.Sprintf("negative zero formats to %q, want \"0\"", got))
	}
	if got := formatNumber(-1234.5, precision); got != "\u22121,234.5" {
		problems = append(problems, fmt.Sprintf("-1234.5 formats to %q", got))
	}

	if len(problems) > 0 {
		fmt.Printf("Go rejected %s:\n", corpusPath)
		for _, p := range problems {
			fmt.Println("  " + p)
		}
		os.Exit(1)
	}
	fmt.Printf("Go validated %d corpus rows and reproduced %d published display strings, exact\n",
		len(c.order), checked)
}
