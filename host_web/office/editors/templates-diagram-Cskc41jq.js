import{n as e,t}from"../editors.js";var n=`---
title: Launch plan
kind: mind
---
- Launch :rocket:
  - Product
    - Pricing
    - Onboarding
    - The first ten customers
  - Marketing
    - Press
    - Social
    - A launch-day post
  - Support
    - Help pages
    - Who answers, and when

~ A launch-day post -> Help pages: links to
`,r=`---
title: The garden this year
kind: mind
---
- The garden
  - Vegetables
    - Tomatoes against the south wall
    - Beans up the old trellis
    - Salad in the shade
  - Flowers
    - Sweet peas for cutting
    - Dahlias
  - Jobs
    - Fix the rain barrel
    - Compost bay
    - A path to the shed
`,i=`---
title: Who reports to whom
kind: org
---
- Ada Diaz | Chief executive
  - Ben Okoro | Engineering
    - Cy Lund | Platform
    - Di Shah | Apps
  - Eve Marsh | Design
  - Flo Reyes | Sales
    - Gus Patel | Accounts

~ Cy Lund -- Eve Marsh: design partner
`,a=`---
title: The Hales
kind: family
---
- Rose + Albert Hale | m. 1948
  - Helen + Tom Price | m. 1975
    - Paul | b. 1978
    - Sam | b. 1981
  - David Hale | b. 1952
    - Ada | b. 1985
`,o=`---
title: From order to doorstep
kind: lanes
---
- Customer: Places an order
- Store: Checks the stock
- Store: In stock?
- Warehouse: Picks and packs it
- Carrier: Picks up the package
- Carrier: Delivers it
- Customer: Signs for it
`,s=`---
title: Hiring someone
kind: lanes
---
- Manager: Writes the job description
- People team: Posts the job
- Candidate: Applies
- People team: Shortlists five
- Manager: Interviews
- Manager: The right one?
- People team: Makes the offer
- Candidate: Says yes
`,c=`---
title: Computing, briefly
kind: timeline
---
- 1843: Lovelace publishes her notes
- 1936: Turing describes his machine
- 1945: ENIAC is switched on
- 1969: The first ARPANET message
- 1976: The Apple I
- 1989: The web is proposed
- 2007: The phone becomes a computer
- 2022: Everyone talks to a machine
- 1969–2007: The network grows
`,l=`---
title: The new library, 2026
kind: timeline
---
- 2026-02-09: Plans approved
- 2026-03-02: Ground broken
- 2026-06-15: Roof on
- 2026-09-07: Shelves in
- 2026-10-19: Books moved
- 2026-11-02: Doors open
- 2026-03-02 – 2026-09-07: Builders on site
`,u=`---
title: Fast, cheap, good
kind: venn
---
- Fast: sprinting, espresso
- Cheap: instant noodles, walking
- Good: slow cooking
- Fast & Cheap: fast food
- Cheap & Good: home cooking
- Fast & Good: great takeout
- Fast & Cheap & Good: toast
`,d=`---
title: Cats and dogs
kind: venn
---
- Cats: purr, climb curtains, use a litter box
- Dogs: fetch, need walks, guard the house
- Cats & Dogs: shed on the sofa, love a warm spot, wake you at six
`,f=`---
title: Jo and Sam's wedding dinner
kind: seating
---
- Head table: Jo, Sam, Maria, Dev, Lin, Tom
- Table 2: Aunt Pat, Uncle Ray, Grandma, Cousin Amy, Ben
- Table 3: Priya, Marco, Hannah, Leo, Zoe, Kit
- Table 4: Mr. and Mrs. Okafor, Ellie, Josh, Ruth
`,p=`---
title: How the app hangs together
kind: net
---
- Monitoring

~ Browser -> API: requests
~ API -> Database: queries
~ API -> Cache
~ Worker -> Database
~ API -- Worker: queue
`,m=`---
title: Moving to Lisbon
kind: mind
---
- Lisbon by March :plane:
  - Paperwork
    - A NIF tax number
    - Visa appointment, January 14
    - Register with the parish
  - An apartment
    - Alfama or Campo de Ourique
    - Under €1,400 a month
    - Showings from February 2
  - Work
    - Tell the New York office by November 30
    - A desk at a coworking space
  - Life
    - Portuguese lessons, twice a week
    - A bank account
    - Find a doctor

~ Register with the parish -> Find a doctor: needed first
~ A NIF tax number -> A bank account: needed first
`,h=`---
title: Studying for the biology final
kind: mind
---
- Biology final, December 8 :graduation:
  - Cells
    - Organelles and what they do
    - Mitosis
    - Diffusion and osmosis
  - The body
    - The heart and blood
    - Enzymes and digestion
    - Hormones
  - Ecology
    - Food webs
    - The carbon cycle
  - How
    - A practice test every Sunday
    - Flashcards on the bus
    - Ask Ms. Shah about osmosis

~ Diffusion and osmosis -> Ask Ms. Shah about osmosis
`,g=`---
title: Hillside Elementary staff
kind: org
---
- Joan Achebe | Principal
  - Tom Reilly | Assistant principal
    - Priya Nair | Grade 5
    - Owen Price | Grade 6
  - Laura Kim | Early grades
    - Ana Silva | Kindergarten
    - Dan Hughes | Grade 1
  - Grace Obi | Business manager
    - Rob Lane | Custodian

~ Priya Nair -- Dan Hughes: math leads
`,_=`---
title: The kitchen at Marlow's
kind: org
---
- Nadia Haddad | Head chef
  - Luca Bianchi | Sous chef
    - Sam Wright | Sauce
    - Mei Chen | Fish
    - Jonah Ellis | Garnish
    - Rosa Duarte | Pastry
  - Kemi Adeyemi | Restaurant manager
    - Ivy Cole | Bar
    - Theo Marsh | Head waiter

~ Rosa Duarte -- Ivy Cole: wines
`,v=`---
title: The Brontës of Haworth
kind: family
---
- Patrick Brontë + Maria Branwell | m. 1812
  - Maria | 1814–1825
  - Elizabeth | 1815–1825
  - Charlotte + Arthur Bell Nicholls | m. 1854
  - Branwell | 1817–1848
  - Emily | 1818–1848
  - Anne | 1820–1849
- Elizabeth Branwell | 1776–1842

~ Elizabeth Branwell -- Patrick Brontë + Maria Branwell: kept house from 1821
`,y=`---
title: The Morenos
kind: family
---
- Luis + Carmen Moreno | m. 1971
  - Elena + Mark Davies | m. 1998
    - Sofia | b. 2001
    - Leo | b. 2004
  - Javier + Amira Moreno | m. 2003
    - Nadia | b. 2008
    - Omar | b. 2011
  - Pilar Moreno | b. 1979
    - Rosa | b. 2015

~ Pilar Moreno -- Sofia: godmother
`,b=`---
title: An expense report
kind: lanes
---
- Employee: Photographs the receipts
- Employee: Fills out the report
- Manager: Within the policy?
- Manager: Approves it
- Finance: Checks the receipts
- Finance: Pays it with the next paycheck
- Employee: Sees it on the pay stub
`,x=`---
title: Apollo 11, eight days in July
kind: timeline
---
- 1969-07-16: Launch from Florida
- 1969-07-19: Into orbit around the Moon
- 1969-07-20: Eagle lands
- 1969-07-21: Armstrong steps out
- 1969-07-22: Home from the Moon
- 1969-07-24: Splashdown in the Pacific
- 1969-07-16 – 1969-07-24: The mission
`,S=`---
title: Who can do what
kind: venn
---
- Design: Mira, Jonas
- Writing: Esther
- Code: Ravi, Tom
- Design & Writing: Ines
- Design & Code: Kai
- Writing & Code: Ola
- Design & Writing & Code: Bea
`,C=`---
title: Board game night, November 14
kind: seating
---
- Catan: Ruth, Ollie, Priya, Ade
- Codenames: Jess, Tom, Mo, Sara, Fin, Lou
- Ticket to Ride: Hana, Ben, Iris
- Chess: Gus, Wren
`,w=`---
title: Class 4B, fall semester
kind: seating
---
- Blue table: Amara, Jack, Zainab, Leo, Ella
- Green table: Noah, Maya, Isaac, Ruby, Kofi
- Red table: Freya, Arjun, Lily, Sam, Hana
- Yellow table: Oscar, Chloe, Yusuf, Grace, Theo
- Reading corner: Mrs. Patel, Evie
`,T=`---
title: The water cycle
kind: net
---
- Sea :fish:
- Clouds :cloud:
- Mountains :mountain:
- Rivers
- Groundwater
- Plants :leaf:

~ Sea -> Clouds: evaporation
~ Clouds -> Mountains: rain and snow
~ Mountains -> Rivers: meltwater
~ Rivers -> Sea: flow
~ Rivers -> Groundwater: soaks in
~ Groundwater -> Plants: roots
~ Plants -> Clouds: transpiration
`,E=`---
title: The house network
kind: net
---
- Router :server:
- Laptop :laptop:
- Phone :phone2:
- Printer :printer:
- Television :film:
- Doorbell :bell:

~ Fiber line -> Router
~ Router -- Laptop: wifi
~ Router -- Phone: wifi
~ Router -- Printer: wifi
~ Router -- Television: cable
~ Router -- Doorbell: wifi
~ Laptop -> Printer: prints
`,D=n=>({id:n,name:e(n),blurb:t(`diagram-empty-kind-to-start-from`,{kind:e(n).toLowerCase()}),doc:`---\nkind: ${n}\n---\n`}),O=()=>[D(`mind`),{id:`mind-launch`,name:t(`common-launch-plan`),blurb:t(`diagram-launch-and-everything-that-branches`),doc:n},{id:`mind-garden`,name:t(`diagram-garden-this-year`),blurb:t(`diagram-what-to-grow-and-jobs`),doc:r},{id:`mind-move`,name:t(`diagram-moving-abroad`),blurb:t(`diagram-move-to-lisbon-by-march`),doc:m},{id:`mind-revision`,name:t(`diagram-studying-for-exam`),blurb:t(`diagram-biology-final-in-december-topic`),doc:h},D(`org`),{id:`org-company`,name:t(`diagram-small-company`),blurb:t(`diagram-seven-people-who-reports-to`),doc:i},{id:`org-school`,name:t(`diagram-elementary-school`),blurb:t(`diagram-principal-her-assistant-principals-classroom`),doc:g},{id:`org-kitchen`,name:t(`diagram-restaurant-kitchen`),blurb:t(`diagram-brigade-under-head-chef-front`),doc:_},D(`family`),{id:`family-hales`,name:t(`diagram-three-generations`),blurb:t(`diagram-grandparents-their-children-and-grandchildren`),doc:a},{id:`family-brontes`,name:t(`diagram-brontes`),blurb:t(`diagram-patrick-and-maria-their-six`),doc:v},{id:`family-morenos`,name:t(`diagram-family-with-godmother`),blurb:t(`diagram-three-generations-of-morenos-and`),doc:y},D(`lanes`),{id:`lanes-order`,name:t(`diagram-from-order-to-doorstep`),blurb:t(`diagram-package-through-store-warehouse-and`),doc:o},{id:`lanes-hiring`,name:t(`diagram-hiring-someone`),blurb:t(`diagram-from-job-description-to-yes`),doc:s},{id:`lanes-expenses`,name:t(`diagram-expense-report`),blurb:t(`diagram-from-photo-of-receipt-to`),doc:b},D(`timeline`),{id:`timeline-computing`,name:t(`diagram-computing-briefly`),blurb:t(`diagram-from-lovelace-to-now-spaced`),doc:c},{id:`timeline-project`,name:t(`diagram-building-project`),blurb:t(`diagram-year-of-dates-from-plans`),doc:l},{id:`timeline-apollo`,name:t(`diagram-apollo-11`),blurb:t(`diagram-eight-days-in-july-1969`),doc:x},D(`venn`),{id:`venn-triangle`,name:t(`diagram-fast-cheap-good`),blurb:t(`diagram-three-sets-and-every-overlap`),doc:u},{id:`venn-pets`,name:t(`diagram-cats-and-dogs`),blurb:t(`diagram-two-sets-and-what-they`),doc:d},{id:`venn-skills`,name:t(`diagram-who-can-do-what`),blurb:t(`diagram-team-by-its-skills-design`),doc:S},D(`seating`),{id:`seating-wedding`,name:t(`diagram-wedding-dinner`),blurb:t(`diagram-four-tables-and-who-sits`),doc:f},{id:`seating-games`,name:t(`diagram-board-game-night`),blurb:t(`diagram-four-games-table-each-and`),doc:C},{id:`seating-class`,name:t(`diagram-classroom`),blurb:t(`diagram-class-4b-at-four-tables`),doc:w},D(`net`),{id:`net-webapp`,name:t(`diagram-how-app-hangs-together`),blurb:t(`diagram-browser-api-database-cache-and`),doc:p},{id:`net-water`,name:t(`diagram-water-cycle`),blurb:t(`diagram-sea-clouds-mountains-rivers-groundwater`),doc:T},{id:`net-house`,name:t(`diagram-house-network`),blurb:t(`diagram-router-and-everything-on-it`),doc:E}];export{O as templates};