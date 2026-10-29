package apps

// Polls: anyone in the chat asks a question with a few answers; everyone votes
// (and can change their mind) while it's open, a minute or until the asker
// closes it. The results stay up until someone asks the next one.

import "time"

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
		p.vote, p.open = NewVote(len(opts)), true
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
	if p.vote != nil {
		view["poll"] = map[string]any{"question": p.question, "options": p.options, "counts": p.vote.Counts(),
			"by": p.askerNm, "open": p.open, "left": p.timer.Left(), "choice": p.vote.Choice(v.ID),
			"mine": v.ID == p.asker}
	}
	return view
}
