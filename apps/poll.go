package apps

// Polls: anyone in the chat asks a question with a few answers; everyone votes
// (and can change their mind) while it's open, a minute or until the asker
// closes it. The results stay up until someone asks the next one, in the next
// session too (kept, closed, without who voted for what).

import (
	"encoding/json"
	"time"
)

const (
	pollOpen    = 60 * time.Second
	pollOptions = 6
	pollText    = 80
)

type poll struct {
	Base
	question string
	options  []string
	asker    int
	askerNm  string
	vote     *Vote
	counts   []int // the last poll's votes, from last session (vote is nil)
	open     bool
	timer    Timer
}

func newPoll(*Room) Activity { return &poll{} }

func (p *poll) Message(r *Room, from Viewer, m Msg) {
	switch m.Kind() {
	case "ask":
		q := m.Str("question", pollText)
		raw, _ := m["options"].([]any)
		var opts []string
		for _, o := range raw {
			if s, ok := o.(string); ok {
				if s = cut(s, pollText); s != "" && len(opts) < pollOptions {
					opts = append(opts, s)
				}
			}
		}
		if p.open || from.Name == "" || q == "" || len(opts) < 2 {
			return
		}
		p.question, p.options, p.asker, p.askerNm = q, opts, from.ID, from.Name
		p.vote, p.counts, p.open = NewVote(len(opts)), nil, true
		p.timer.Set(pollOpen)
	case "vote":
		i, ok := m.Int("i", 0, len(p.options)-1)
		if !ok || !p.open || !p.vote.Cast(from.ID, i) {
			return
		}
	case "close":
		if !p.open || from.ID != p.asker {
			return
		}
		p.close()
	default:
		return
	}
	r.Changed()
}

func (p *poll) close() {
	p.open = false
	p.timer.Clear()
}

func (p *poll) Tick(r *Room, now time.Time) {
	if p.open && p.timer.Done(now) {
		p.close()
		r.Changed()
	}
}

func (p *poll) View(v Viewer) any {
	view := map[string]any{"canAsk": !p.open && v.Name != ""}
	if p.question != "" {
		counts, choice := p.counts, -1
		if p.vote != nil {
			counts, choice = p.vote.Counts(), p.vote.Choice(v.ID)
		}
		view["poll"] = map[string]any{"question": p.question, "options": p.options, "counts": counts,
			"by": p.askerNm, "open": p.open, "left": p.timer.Left(), "choice": choice,
			"mine": v.ID == p.asker}
	}
	return view
}

// keptPoll: a closed poll's result
type keptPoll struct {
	Question string   `json:"question"`
	Options  []string `json:"options"`
	By       string   `json:"by"`
	Counts   []int    `json:"counts"`
}

func (p *poll) Save() any {
	if p.question == "" {
		return nil
	}
	counts := p.counts
	if p.vote != nil {
		counts = p.vote.Counts()
	}
	return keptPoll{p.question, p.options, p.askerNm, counts}
}

func (p *poll) Load(b []byte) error {
	var k *keptPoll
	if err := json.Unmarshal(b, &k); err != nil || k == nil || len(k.Options) < 2 || len(k.Counts) != len(k.Options) {
		return err
	}
	p.question, p.options, p.askerNm, p.counts = k.Question, k.Options, k.By, k.Counts
	return nil
}
