import{t as e}from"../editors.js";var t=`*Your name*
*Street and number*
*City, state and ZIP code*
*you@example.com* {.right}

*The date*

Dear …,

*Why you are writing, in a sentence.*

*What you have to say, in order.*

*What happens next, and by when.*

Sincerely,

<br>

*Your name*
`,n=`# Meeting {.title}

*The date · where · who came*

## Agenda

1. *First item*
2. *Second item*

## Notes

*What was said, briefly.*

## Decisions

- *What was decided.*

## Actions

- [ ] *Who does what, by when*
`,r=`# *Your name* {.title}

*Where you live · email · website*

## Experience

**The job, where** *the years*

- *What you did, with a number if you can*

## Education

*Where you studied, and what*

## Skills

- *What you are good at*
`,i=`# *What this agreement is about* {.title}

*Between whom, and from when.*

## What is agreed

- *What one of you does, and when.*
- *What the other pays or does in return.*
- *How either of you can end it.*
`,a=`---
from: Your name | Street and number | City, state and ZIP code
to: Who pays | Street and number | City, state and ZIP code
number: 0042
date: 2026-10-02
due: 2026-11-01
currency: $
terms: Payment within 30 days by bank transfer.
---
# Invoice {.title}

What | Qty:number | Units | Price:money | Amount:money
--- | --- | --- | --- | ---
Design | 12 | hours | 150 | =B1*D1
Build | 20 | hours | 140 | =B2*D2
Hosting for a year | 1 |  | 480 | =B3*D3
| |  |  |  |
Subtotal |  |  |  | =SUM(E1:E4)
Tax | 8 | % |  | =E5*B6/100
Total |  |  |  | =E5+E6
{lock=E1:E7}

*A line of thanks.*
`,o=`# Memo {.title}

**To:** *Who reads it*
**From:** *You*
**Date:** *The date*
**Subject:** *The change*

## In short

*The change, in a sentence.*

## Why

*The reason, and the fact that shows it.*^[*Its source.*]

## What changes

- *Each change on its own line.*

\`\`\`diagram
---
title: Who does what
kind: lanes
---
- You: Write the change down
- Readers: Do their part by the date
- You: Check that it was done
\`\`\`

## What we need from you

*What each reader does, and by when.*
`,s=`---
look: mixed
---
*Your name*
*Your address*
*Email · phone* {.right}

*The date*

*Who you are writing to*
*The company*
*Its address*

Dear …,

*The job, and where you saw it.*

*What you have done that fits, with an example.*

*Why them, and what you would bring.*

*What you enclose, and when you can talk.*

Sincerely,

<br>

*Your name*
`,c=`---
look: mono
---
# *Your name* {.title}

*City · email · phone*

## Now

**Job, where** *years*

- *What came of it*

## Before

*The jobs before, shorter*

## Education

*Degree, where, year*

## Languages and tools

*What you speak and use*
`,l=`# *The news, as a headline* {.title}

**FOR IMMEDIATE RELEASE** · *The date*

**City.** *The news in one sentence: who, what, when.*

*The detail and the numbers.*

> *A quote, and who said it.*

## Hours

Days | Hours
--- | ---
Weekdays | 9 am to 5 pm
Weekends | 10 am to 4 pm

## Opening day

*What happens, and when.*

## For the press

*A name, email and phone*
`,u=`# Minutes {.title}

*The date · where*

**Present:** *Who came*
**Absent:** *Who sent regrets*

## 1. The last minutes

*Agreed, or changed.*

## 2. Treasurer's report

*What the treasurer reported.*

Item | Amount:money
--- | ---
Balance on 1 September | 1240
Dues received | 315
Printing and postage | -62
Hall rental | -40
Balance on 30 September | =SUM(B1:B4)
{lock=B5}

## 3. *An item*

**Motion:** *What it asks; who proposed it.*

For | Against | Abstained
--- | --- | ---
22 | 1 | 3

*Carried or lost.*

## 4. Actions

- [ ] *Who does what, by when*

**Next meeting:** *When, where*
`,d=`---
look: inverse
---
# *The dish* {.title}

*Serves 4 · how long to get ready and to cook*

*What it is, in a sentence.*

## What you need

Ingredient | For 4:number | Unit | For 6:number
--- | --- | --- | ---
Olive oil | 3 | tbsp | =B1*1.5
Onion, sliced | 1 | large | =B2*1.5
Red bell peppers, sliced | 2 |  | =B3*1.5
Garlic, crushed | 3 | cloves | =B4*1.5
Ground cumin | 1 | tsp | =B5*1.5
Smoked paprika | 2 | tsp | =B6*1.5
Crushed tomatoes | 28 | oz | =B7*1.5
Eggs | 6 |  | =B8*1.5
Feta | 4 | oz | =B9*1.5
{lock=D1:D9}

## How

1. *The first step, and for how long.*
2. *The next.*
3. *And so on, a step a line.*^[*A tip for this step.*]

> *A note for next time.*
`,f=`# Questions about *the subject* {.title}

*When it was last updated*

## *The question people ask most*

*The answer, short and plain.*

## *How much it costs*

*The price, and who pays less.*

## *What they have to do*

- *One thing on each line.*

## *Who to ask about anything else*

*A name, and how to reach them.*
`,p=`# Terms of service for *your business* {.title}

*When these apply, and who runs this.*

## 1. What we do

*The service, and its limits.*

## 2. Booking and canceling

1. *How to book, and by when.*
2. *How to cancel, and what it costs.*

## 3. Prices

Service | Price:money
--- | ---
Half an hour | 20
An hour | 32
A first visit | 15

*When and how people pay.*

## 4. Keys

*How you keep them safe.*

## 5. If something goes wrong

*Your insurance, and what you do first.*^[*The policy.*]

## 6. Ending this

*How either side ends it.*
`,m=`---
look: mixed
---
# *The newsletter's name* {.title}

*The month · who it is from*

## :calendar: Coming up

Date:date | What | Where
--- | --- | ---
2026-10-17 | Clean-up, 9 am to noon | Where to meet
2026-10-31 | Party, 5 to 8 pm | The street
2026-11-12 | Meeting, 7 pm | The hall

## :heart: Welcome

*Who is new.*

## :lightbulb: *A piece of news*

*What is changing, and what it means for readers.*

## :coffee: Thank you

*Who helped, and with what.*

## Get in touch

*How to reach you*
`,h=`---
look: book
---
# *The title: the subject, the place, the years* {.title}

*The degree it is submitted for* {.center}

*Your name*

*The university · month and year* {.center}

## Abstract

*The question, what you found, and why it matters, in a paragraph.*

---

## Chapter 1. *The setting*

*Where and what you studied, and who decides.*^[*The law or source for it.*]

## Chapter 2. *The evidence*

*How you gathered it.*

Town | In 1990:number | In 2025:number | Change:percent
--- | --- | --- | ---
Brunswick | 120 | 85 | =ROUND((C1-B1)/B1, 3)
Freeport | 64 | 52 | =ROUND((C2-B2)/B2, 3)
Harpswell | 98 | 90 | =ROUND((C3-B3)/B3, 3)
Yarmouth | 40 | 26 | =ROUND((C4-B4)/B4, 3)
All four | =SUM(B1:B4) | =SUM(C1:C4) | =ROUND((C5-B5)/B5, 3)
{lock=D1:D5}

*What the table shows.*

## Chapter 3. *Findings*

*What the evidence and the people say.*

## Conclusion

*The answer to the question.*

## Bibliography

*Author. Title. Place: publisher, year.*
`,g=`---
look: serif
---
# *A headline that says what you thought* {.title}

*Title*, by *author* · *publisher, year, pages*

*Reviewed by whom, for what, and when*

★★★★★ {.center}

*What the book is about, without the ending.*

*How it is written, and what that does to a reader.*

## What worked

- *A thing that worked, and why.*

## What did not

*What did not, fairly.*

> *A line from the book worth quoting.*

**In short:** *Read it or not, in a sentence.*
`,_=`---
look: news
---
# *The headline: the news in a line* {.title}

**By** *the reporter* · *where* · *the date*

*The news in a sentence: what happened, and to whom.*

*The number or detail that matters most.*

*Why it happened, and what came before.*

\`\`\`sheet
---
title: The figures
chart: bar
---
Month | On time:percent
--- | ---
May | 71
Jun | 63
Jul | 52
Aug | 47
Sep | 55
\`\`\`

*A quote from someone involved, and who they are.*

*What it costs, and how it works.*

*Someone who disagrees, in their own words.*

*What happens next, and when.*
`,v=`---
look: mixed
---
# *"A line from the interview": a conversation with whom* {.title}

*Interviewed by whom, for what, where and when. Edited for length.*

*Who they are, and why now.*

**Interviewer:** *A question.*

**Guest:** *Their answer, in their words.*

**Interviewer:** *The next question, following the answer.*

**Guest:** *And so on, the best answers kept.*
`,y=`---
look: inverse
---
# *The artist: the album* {.title}

**Album review** · *The label · how long · out when*

*By whom*

★★★★☆ {.center}

*Who they are, and what this album is.*

*The opening track, and what it sets up.*

*The heart of the record.*

*What does not work.*

## Best tracks

1. *A track*
2. *Another*
3. *A third*

**For fans of:** *Two or three artists like them.*
`,b=`*Your name*
*Street and number*
*City, state and ZIP code* {.right}

*The date*

*Who handles complaints*
*The company*
*Its address*

Dear …,

**Formal complaint:** *what, when, and any reference number.*

*What you are complaining about, in a sentence.*

## What happened

1. *The first thing that went wrong.*
2. *What happened next.*
3. *What it cost you.*

## What I would like

- *Each thing you ask for, with its amount.*^[*What they said, if they refused already.*]

*What you enclose, and when you want a reply.*

Sincerely,

<br>

*Your name*
`,x=`---
look: serif
---
*Your name*
*Street and number*
*City, state and ZIP code* {.right}

*The date*

*Their title and name*
*Their office*
*Its address*

Dear …,

*Who you are, and the vote you ask for.*

*Why it matters here, in one story.*

*What the bill does, and what it costs.*

*Who else supports it.*

*The question: how will they vote?*

Sincerely,

<br>

*Your name*
`,S=`---
look: serif
---
*Where you are, and the date* {.right}

My dear …,

*How long it has been, in your own measure.*

*Where you keep finding them.*

*The ordinary things you miss.*

*When you will see them next.*

*What you want back.*

All my love,

*Your name*
`,C=`---
look: mixed
---
# *The project, and what it does* {.title}

*To whom · from whom · when*

## Summary

*What you ask for, and what it pays for.*

## The need

*The problem, with a figure.*^[*Where the figure comes from.*]

## What we will do

- *One thing you will do, and when.*

## The budget

Item | Cost:money($)
--- | ---
Room rental, 12 sessions at $60 | 720
Tools and spare parts | 1600
Electrical safety tester and training | 1250
Insurance for the year | 480
Publicity and printing | 350
Coffee, tea and cookies | 400
Total | =SUM(B1:B6)
{lock=B7}

## How we will know it worked

*What you will count, and when.*

## Contact

*A name · email · phone*
`,w=`---
look: mixed
---
# *The course: its name* {.title}

*Semester · days · room*

**Instructor:** *Name · email*
**Office hours:** *When, where*

## What this course is about

*The question it asks.*

## What you will be able to do

- *A skill a line.*

## Schedule

Week | Dates | Topic | Reading
--- | --- | --- | ---
1 |  |  |
2 |  |  |
3 |  |  |

## How you are graded

Work | Weight:percent
--- | ---
Two source papers | 30
Midterm | 20
Final project | 35
Participation | 15
Total | =SUM(B1:B4)
{lock=B5}

## Policies

*Late work.*
`,T=`---
look: mono
---
# *A TITLE IN CAPITALS* {.title}

*an essay for which zine · by whom · when*

*Where you are, and how often.*

*Who else is there.*

*==The line you want people to remember.==*

*What you notice that others do not.*

*What it says about the place.*

*Your small proposal.*

*A last line.*

*Your initial.* {.right}
`,E=`---
look: serif
---
# For *their name*, *the years* {.title}

*Read by whom · where · when*

*A word of thanks, and something they would have said.*

*Where and when they were born, and how their life began.*

*Who they loved, and the life they made.*

*What they were like, the hard edges too.*

*What you will miss most: one small habit.*

*A last word to them.*
`,D=`# A speech for *the couple* {.title}

*Whose speech · the date · where*

*Who you are, and how you know them, with a short story.*

## How they met

*The story, told as a story.*

## What I have seen since

*Two or three small things that show who they are together.*

## A word to *one of them*

*One kind tease, and one true thing.*

## The toast

*Ask everyone to stand, glasses up.*

**To the couple.** {.center}
`,O=`# *What you want, as a headline* {.title}

*A petition to whom · started when*

## We ask *them* to

1. *The first thing you ask.*
2. *The second.*

## Why

*Who it affects, and how many.*

*The facts, and where they come from.*^[*The source.*]

## Names

Name | ZIP code | Date:date
--- | --- | ---

*When you will hand it in.*
`,k=()=>[{id:`letter`,name:e(`write-a-letter`),blurb:e(`write-your-address-date-greeting-point`),doc:t},{id:`cover`,name:e(`write-cover-letter`),blurb:e(`write-applying-for-job-position-what`),doc:s},{id:`memo`,name:e(`write-memo`),blurb:e(`write-to-from-date-and-subject`),doc:o},{id:`meeting`,name:e(`write-meeting-notes`),blurb:e(`write-agenda-what-was-said-what`),doc:n},{id:`minutes`,name:e(`write-minutes`),blurb:e(`write-formal-meeting-who-came-treasurers`),doc:u},{id:`resume`,name:e(`write-resume`),blurb:e(`write-name-and-contact-experience-education`),doc:r},{id:`cv`,name:e(`write-one-page-cv`),blurb:e(`write-typewriter-set-cv-now-before`),doc:c},{id:`invoice`,name:e(`write-invoice`),blurb:e(`write-who-what-and-how-much`),doc:a},{id:`contract`,name:e(`write-contract`),blurb:e(`write-plain-words-agreement-what-each`),doc:i},{id:`newsletter`,name:e(`write-newsletter`),blurb:e(`write-block-associations-month-dates-in`),doc:m},{id:`recipe`,name:e(`write-recipe`),blurb:e(`write-what-you-need-in-table`),doc:d},{id:`faq`,name:e(`write-questions-and-answers`),blurb:e(`write-questions-people-ask-each-heading`),doc:f},{id:`press`,name:e(`write-press-release`),blurb:e(`write-news-in-first-line-detail`),doc:l},{id:`news`,name:e(`write-news-article`),blurb:e(`write-headline-byline-story-in-two`),doc:_},{id:`interview`,name:e(`write-interview`),blurb:e(`write-introduction-then-questions-and-answers`),doc:v},{id:`book-review`,name:e(`write-book-review`),blurb:e(`write-book-stars-what-it-is`),doc:g},{id:`music-review`,name:e(`write-music-review`),blurb:e(`write-album-label-and-length-stars`),doc:y},{id:`thesis`,name:e(`write-thesis`),blurb:e(`write-title-page-abstract-chapters-with`),doc:h},{id:`grant`,name:e(`write-grant-proposal`),blurb:e(`write-ask-need-plan-budget-that`),doc:C},{id:`syllabus`,name:e(`write-syllabus`),blurb:e(`write-course-when-and-where-what`),doc:w},{id:`complaint`,name:e(`write-formal-complaint`),blurb:e(`write-what-happened-in-order-what`),doc:b},{id:`politician`,name:e(`write-letter-to-politician`),blurb:e(`write-ask-your-representative-for-vote`),doc:x},{id:`love`,name:e(`write-love-letter`),blurb:e(`write-ordinary-things-missed-letter-across`),doc:S},{id:`wedding`,name:e(`write-wedding-speech`),blurb:e(`write-how-they-met-what-you`),doc:D},{id:`eulogy`,name:e(`write-eulogy`),blurb:e(`write-life-in-few-minutes-where`),doc:E},{id:`zine`,name:e(`write-zine-essay`),blurb:e(`write-personal-essay-for-small-magazine`),doc:T},{id:`petition`,name:e(`write-petition`),blurb:e(`write-what-you-ask-why-and`),doc:O},{id:`terms`,name:e(`write-terms-of-service`),blurb:e(`write-small-businesss-terms-in-plain`),doc:p}];export{k as templates};