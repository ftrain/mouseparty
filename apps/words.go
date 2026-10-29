package apps

// Words: ENABLE (the public-domain word list most word games use, 172,823
// words) for checking plays, and a short list of everyday words, easy to draw
// or guess, for games that pick words themselves.

import (
	"bufio"
	"bytes"
	"compress/gzip"
	_ "embed"
	"strings"
	"sync"
)

//go:embed enable.txt.gz
var enableGz []byte

var (
	enableOnce sync.Once
	enable     map[string]struct{}
)

// IsWord: is w (any case) in ENABLE
func IsWord(w string) bool {
	enableOnce.Do(func() {
		enable = make(map[string]struct{}, 173000)
		zr, err := gzip.NewReader(bytes.NewReader(enableGz))
		if err != nil {
			return
		}
		sc := bufio.NewScanner(zr)
		for sc.Scan() {
			if w := strings.TrimSpace(sc.Text()); w != "" {
				enable[w] = struct{}{}
			}
		}
	})
	_, ok := enable[strings.ToLower(w)]
	return ok
}

// Common: everyday nouns, all in ENABLE, for drawing, guessing and spying
var Common = strings.Fields(`
airplane alligator anchor angel ant apple arm arrow astronaut avocado axe
baby backpack badge bag bagel ball balloon banana band bandage bank barn
basket bat bath beach beak bean bear beard bed bee beetle bell belt bench
bicycle bird blanket boat bone book boot bottle bow bowl box bracelet brain
branch bread brick bridge broom brush bubble bucket bug building bus butter
butterfly button cactus cake calendar camel camera camp candle candy cannon
canoe cap car card carpet carrot castle cat cave chain chair cheese cherry
chess chicken chimney church circus city clock cloud clown coat coconut coffee
coin comb comet compass computer cookie corn couch cow crab crayon crown
cup curtain dentist desert desk diamond dice dinosaur doctor dog doll dolphin
donut door dragon drawer dress drum duck eagle ear earth egg elbow elephant
engine envelope eye face fan farm feather fence finger fire fireworks fish
flag flashlight flower flute fly foot football forest fork fountain fox frog
garden gate ghost giant giraffe glass glasses globe glove goat gold grape
grass guitar hair hammer hand hat heart helicopter helmet hippo hole honey
hook horn horse hose hospital hotel house ice igloo island jacket jail jam
jellyfish jet jewel juice kangaroo key king kitchen kite knee knife knight
ladder lake lamp leaf leg lemon library light lighthouse lion lips lizard
lobster lock log magnet mail map mask match medal mermaid microphone milk
mirror money monkey monster moon moose mountain mouse moustache mouth mud
mushroom music nail necklace nest net newspaper night nose notebook nurse
ocean octopus onion orange owl paint palace pan panda paper parachute park
parrot party pea peach peanut pear pen pencil penguin piano picnic pie pig
pillow pilot pin pineapple pipe pirate pizza plane planet plant plate pocket
police pond popcorn post potato present prince princess pumpkin puppet purse
pyramid queen rabbit raccoon radio rain rainbow rake rat ring river road robot
rock rocket roof rope rose ruler sail salt sand sandwich saw scarf school
scissors scorpion sea seal shadow shark sheep shell ship shirt shoe shovel
skeleton ski skirt skull skunk sled slide snail snake snow snowman soap sock
soup spider spoon squirrel stadium stamp star station statue stick stone
storm stove strawberry street submarine sugar sun sunflower swan sweater swing
sword table tail taxi tea teacher teeth telephone telescope television tennis
tent tiger toast toe toilet tomato tongue tooth toothbrush torch tower tractor
train tree triangle truck trumpet tunnel turkey turtle umbrella unicorn vampire
vase violin volcano wagon wall wallet watch water waterfall wave whale wheel
whistle window wing witch wizard wolf worm yacht zebra zipper zoo
`)

// The sixteen Word Grid dice (a letter grid game's classic set); Q is "Qu"
var gridDice = []string{"AAEEGN", "ABBJOO", "ACHOPS", "AFFKPS", "AOOTTW", "CIMOTU", "DEILRX", "DELRVY",
	"DISTTY", "EEGHNW", "EEINSU", "EHRTVW", "EIOSST", "ELRTTY", "HIMNQU", "HLNNRZ"}

// Tiles: how many of each letter, and what each scores (a crossword tile game's
// usual English set, without the blanks)
var tileCounts = map[rune]int{'A': 9, 'B': 2, 'C': 2, 'D': 4, 'E': 12, 'F': 2, 'G': 3, 'H': 2, 'I': 9, 'J': 1, 'K': 1,
	'L': 4, 'M': 2, 'N': 6, 'O': 8, 'P': 2, 'Q': 1, 'R': 6, 'S': 4, 'T': 6, 'U': 4, 'V': 2, 'W': 2, 'X': 1, 'Y': 2, 'Z': 1}

var tileValues = map[rune]int{'A': 1, 'B': 3, 'C': 3, 'D': 2, 'E': 1, 'F': 4, 'G': 2, 'H': 4, 'I': 1, 'J': 8, 'K': 5,
	'L': 1, 'M': 3, 'N': 1, 'O': 1, 'P': 3, 'Q': 10, 'R': 1, 'S': 1, 'T': 1, 'U': 1, 'V': 4, 'W': 4, 'X': 8, 'Y': 4, 'Z': 10}
