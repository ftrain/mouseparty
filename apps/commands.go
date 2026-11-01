package apps

// Commands: everything a viewer's page can say to each app, written down as
// data: for each app (Kind.Name), each message kind and the fields its Message
// reads. It's the apps' part of the command graph (docs/commands.md): the
// fuzzer walks it (fuzz_test.go), sending these well-formed and malformed, and
// a test checks it against what each script says it sends (its Out type), so a
// new message can't be left out of it.

// Field is one field of a message: Type is "int" (a whole number, Lo to Hi),
// "num" (any number, Lo to Hi), "str" (text, up to Max), "bool", "strs" (a list
// of texts), "points" (a stroke's [[x, y], ...], 0-1), "tiles" (Tiles' [{r, c, l}])
// or "ops" (a document's edit, JSON text)
type Field struct {
	Name   string
	Type   string
	Lo, Hi float64
	Max    int
}

// Command is one message kind an app takes
type Command struct {
	Kind   string
	Fields []Field
}

var (
	lobbyCommands  = []Command{{Kind: "join"}, {Kind: "leave"}, {Kind: "start"}}
	strokeCommand  = Command{"line", []Field{{Name: "c", Type: "int", Hi: graffitiColors - 1}, {Name: "w", Type: "int", Hi: graffitiWidths - 1}, {Name: "p", Type: "points"}}}
	officeCommands = []Command{
		{"edit", []Field{{Name: "base", Type: "int", Hi: 1000}, {Name: "eid", Type: "str", Max: 40}, {Name: "ops", Type: "ops"}}},
		{"snap", []Field{{Name: "seq", Type: "int", Hi: 1000}, {Name: "text", Type: "str", Max: 2000}}},
		{"seed", []Field{{Name: "text", Type: "str", Max: 2000}}},
		{Kind: "sync"},
	}
)

// Commands: every app's, by its name
var Commands = map[string][]Command{
	"graffiti": {strokeCommand},
	"room":     {{"go", []Field{{Name: "x", Type: "num", Hi: 1}, {Name: "y", Type: "num", Hi: 1}}}},
	"call":     {{Kind: "join"}, {Kind: "live"}, {Kind: "leave"}, {"mute", []Field{{Name: "muted", Type: "bool"}}}},
	"bingo":    {{Kind: "card"}},
	"wordgrid": {{"word", []Field{{Name: "word", Type: "str", Max: 16}}}},
	"tiles": append([]Command{
		{"play", []Field{{Name: "tiles", Type: "tiles"}}},
		{"swap", []Field{{Name: "letters", Type: "str", Max: 7}}},
		{Kind: "pass"},
	}, lobbyCommands...),
	"anagram": {{"guess", []Field{{Name: "guess", Type: "str", Max: 10}}}},
	"sketch":  append([]Command{strokeCommand, {Kind: "clear"}, {"guess", []Field{{Name: "guess", Type: "str", Max: 30}}}}, lobbyCommands...),
	"blanks":  {{"answer", []Field{{Name: "text", Type: "str", Max: 80}}}, {"vote", []Field{{Name: "i", Type: "int", Hi: 10}}}},
	"spies": append([]Command{
		{"pick", []Field{{Name: "i", Type: "int", Hi: 24}}},
		{"clue", []Field{{Name: "word", Type: "str", Max: 20}, {Name: "n", Type: "int", Hi: 9}}},
		{Kind: "pass"},
	}, lobbyCommands...),
	"werewolf": append([]Command{
		{"kill", []Field{{Name: "i", Type: "int", Hi: 12}}},
		{"see", []Field{{Name: "i", Type: "int", Hi: 12}}},
		{"exile", []Field{{Name: "i", Type: "int", Hi: 12}}},
	}, lobbyCommands...),
	"poll": {
		{"ask", []Field{{Name: "question", Type: "str", Max: 80}, {Name: "options", Type: "strs", Max: 80}}},
		{"vote", []Field{{Name: "i", Type: "int", Hi: 3}}},
		{Kind: "close"},
	},
	"write": officeCommands, "outline": officeCommands, "deck": officeCommands, "sheet": officeCommands,
	"diagram": officeCommands, "draw": officeCommands, "pinboard": officeCommands,
	"reel": {},
}
