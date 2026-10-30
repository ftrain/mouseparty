# A social office: documents beside the movie

*An exploration, October 2026, on the `office` branch.*

Open House Party started as a way to watch a movie with friends from your own
Mac. Then it grew games, a wall to draw on, polls: things to do together while
the picture plays. Tiny Little Office is an office suite whose documents are
small, plain text, and (in its v2) shared: every editor tells each change as
operations, and takes other people's in. Put the two together and something
else appears. It isn't a video player with a notes panel. It's closer to an
operating system whose desktop is a room: the movie is the clock on the wall,
the people are the users, and every window on the desk is open for everyone.

## Why a film class is the right first room

A seminar watching *Vertigo* together does three things at once: it watches,
it talks, and it writes. Today those happen in three places: the projector, the
room (or a chat), and everyone's own laptop, where the notes are private and
the frames are bad phone photos of the screen. In Open House Party they can
happen in one place, with one clock:

- **A shot log** in a Sheet: timecode, shot size, camera move, what it means.
  Everyone fills in rows as the scene plays.
- **An outline** of the film's structure, acts and turns, built by the room in
  real time and argued over afterwards.
- **A Document** that becomes the group's essay, with frames in it: the camera
  in the toolbar grabs the frame on screen *now*, cut from the host's own file
  at full quality (not the compressed stream), and drops it where your caret
  is, captioned with the film and the time: "Vertigo, 1:02:13".
- **Slides** for the presentation at the end of the week, built out of those
  same frames.
- **A diagram** of who wants what: the character map, a family tree, a
  timeline of the story's events against the order the film tells them.
- **A pinboard** (new in Tiny Little Office for this): frames, notes and arrows
  on an open canvas. "Motif: spirals", with six frames pinned in a frame of
  their own and lines to the scene each comes from.
- **Graffiti**, rethought. Drawing on the movie was fun and then gone. Now the
  wall is a page that turns: a minute after someone starts drawing, the frame
  under the drawing and the drawing itself become a slide in the **Graffiti
  Reel**, and the wall is clean for the next minute. The reel is the room's
  marginalia: where people pointed, circled, laughed. One click copies it into
  Slides, where the class can write under each page what they saw.

None of this needs an account, a server, or a school's IT department. It is one
person's Mac and a link.

## What's built on this branch

- **Documents as apps.** Document, Outline, Slides, Sheet, Diagram, Drawing
  and Pinboard are in the app picker beside the games. Each opens a window over the video
  for everyone, drawn by Tiny Little Office's own editors (built from a pinned
  commit by `scripts/vendor_office.sh` into `host_web/office/`).
- **Editing at once.** The host is the one order of operations the library
  asks a server to be (its `docs/kernel.md` §12), and nothing more: it never
  reads an op. A page sends what its editor did, made against a version; if
  that's the latest, it's the next version for everyone; if not, the page is
  told to try again, after the versions it missed have arrived and its own
  changes have been carried over them by the library's `cross`. All the
  transforming happens in the browsers. The page follows the library's own
  shared-document client (`src/kit/share/multiparty.ts`) step for step, and
  runs over the chat socket already open, so it works on the plain-http Wi-Fi
  link too (the library's journal needs WebCrypto, which browsers only allow
  over https). The ops pass through the host as the JSON text a page wrote:
  decoded and encoded again, a picture's attributes came out in another order
  and two pages' documents parted. A new document is seeded with its app's
  blank before anyone touches it, so a pinboard's first two notes land in one
  table. `apps/office.go`, `host_web/apps/office.js`.
- **The Pinboard**, new in Tiny Little Office (its `office` branch, v2 and the Pinboard): notes,
  text, pictures, frames, pen strokes and arrows on an open canvas, a table
  with a row per thing and a stable id each, so arrows keep their ends when
  people add and take things away at once; a move is a write of two cells, so
  two people dragging two things never collide. A frame grabbed in it is
  pinned in the middle of the view.
- **Pictures.** The editors' Insert ▾ Picture, paste and drop all work: the
  host keeps pictures (PNG, JPEG, GIF, WebP; never an SVG from a viewer),
  serves them under the session key, keeps the same bytes once, and writes
  them beside the kept documents. When hosting starts, any picture no kept
  document names is deleted. `pictures.go`.
- **Frames.** `POST grab`: ffmpeg cuts the frame at the current position from
  the movie file, square pixels, at most 1280 wide. The camera in a Document's
  and Slides' toolbar is a page command in the library's own bar.
- **The Graffiti Reel.** Graffiti's page turns every minute someone drew; the
  page is an SVG of the frame with the lines over it, in the picture store; the
  reel is kept between sessions and shown as a read-only deck that "Make it
  slides" copies into Slides. `apps/reel.go`, `apps/graffiti.go`.
- **Kept.** Each kind of document is a Keeper: the class's Document, Sheet and
  so on are there next time, with their pictures.

## Things to think about

**One document of each kind.** For a first pass the Document is *the*
document. A class will want several: one per group, one per week. The picker
could open a new one or a kept one; the Keeper would key them by a name
rather than the kind.

**Time as a link.** Every frame grab knows its time. A timecode in a document
could be a link that asks the host to jump there (the host decides: the
movie is theirs to steer). "Look at 1:02:13" becomes something you click.

**Who wrote what.** Tiny Little Office already knows how to show who did what
in a document several people write (its tracked changes and comments, made for
the Contract Editor). Every edit here carries its author's socket; with names
it could carry colours, and the essay could show each student's hand.

**Taking it home.** A document in Tiny Little Office lives in its link. When
the party ends, each person could take the documents home as links (words,
tables, outlines travel; pictures don't, since they're the host's), or as a
zip of .docx, .pptx and PDFs with the pictures in, which the library's exports
already make given the bytes.

**What "leaving nothing behind" means now.** The app's promise was that a
session leaves nothing behind. Kept documents and a reel are something. They
are the host's, on the host's Mac, and the point of a class; but the app should
say so plainly, and make "forget all of it" one click.

**Presence.** Cursors and selections of the others, in each editor. The chat
socket could carry them cheaply; the library would need to draw them.

**A sense of the room.** Windows are opened for everyone but placed by each
person. A "follow me" mode (the teacher's layout, pushed to everyone) would
make a lecture possible; a "free" mode keeps a study group loose.

## Known gaps

- Two windows of the same document kind open at once each keep the file; the
  last to close wins.
- An op that applies in the browsers but leaves a table without columns (the
  library's rule 2) is skipped by every page alike, as the library's client
  does, but stays in the host's log until the next snapshot.
- The Trip Planner, Calendar, Calculator and Animator are in the bundle but not
  offered: they don't belong in a film class yet.
- The bundle adds about 7 MB to the app.
