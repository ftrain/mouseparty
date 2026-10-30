import{t as e}from"../editors.js";var t=`---
title: Dinner for six
---
food = 164.50
drinks = 58
tip = (food + drinks) * 18%
total = food + drinks + tip
total / 6
`,n=`---
title: Saturday at the market
---
eggs = 6.50
bread = 7
apples = 2.4 * 3.29
cheese = 0.35 * 28
coffee = 16
flowers = 12
spent = eggs + bread + apples + cheese + coffee + flowers
60 - spent
`,r=`---
title: Sales tax in New York City
---
rate = 8.875%
laptop = 1299
laptop * rate
laptop * (1 + rate)
receipt = 86.40
before_tax = receipt / (1 + rate)
receipt - before_tax
`,i=`---
title: The rent is going up
---
last_year = 1450
this_year = 1595
rise = this_year - last_year
rise / last_year * 100
rise * 12
raise = 3.5%
pay = 4800 * (1 + raise)
share = this_year / pay * 100
`,a=`---
title: Kitchen conversions
---
2 cups to ml
180 celsius to fahrenheit
3 tbsp + 2 tsp to ml
450 g to lb
8 floz to ml
`,o=`---
title: Banana bread for twelve
---
serves = 8
want = 12
scale = want / serves
flour = 2 cup * scale
butter = 1/2 cup * scale
sugar = 2/3 cup * scale
bananas = 3 * scale
eggs = 2 * scale
The oven stays at 350 °F: check the loaf at 55 minutes.
`,s=`---
title: Lengths, weights and temperatures
---
6 ft + 2 inch to cm
26.2 mi to km
5 km to mi
70 kg to lb
14 lb to kg
98.6 fahrenheit to celsius
-10 celsius to fahrenheit
1 acre to m^2
`,c=`---
title: Four days in Lisbon, in dollars
---
rate = 1.17
hotel = 4 * 138
meals = 4 * 65
trains = 2 * 24.80
museums = 3 * 15
euros = hotel + meals + trains + museums
dollars = euros * rate
dollars * 3%
dollars / 4
`,l=`---
title: Gas for the drive to Montreal
---
miles = 2 * 312
mpg = 31
price = 3.39
gallons = miles / mpg
cost = gallons * price
cost / 4
`,u=`---
title: Painting the living room
---
walls = 2 * (14 + 12) * 8
doors = 3 * 7
windows = 4.5 * 4 * 2
area = walls - doors - windows
gallons = area * 2 / 350
ceil(gallons)
`,d=`---
title: A 9 a.m. call on Monday, November 2
---
new_york = 9
london = new_york + 5
berlin = new_york + 6
mumbai = new_york + 10.5
tokyo = mod(new_york + 14, 24)
sydney = mod(new_york + 16, 24)
Hours on a 24-hour clock: .5 is half past, and in Sydney it is already Tuesday.
`,f=`---
title: Pace for the Prospect Park 10K
---
time = 52 minute + 30 s
distance = 10 km
pace = time / distance
pace to minute / km
pace to minute / mi
pace * 21.0975 km to h
pace * 42.195 km to h
`,p=`---
title: Body mass index
---
weight = 72
height = 1.78
weight / height^2
pounds = 160
inches = 70
703 * pounds / inches^2
A guide, not a diagnosis: 18.5 to 25 is the usual range for adults.
`,m=`---
title: A child's dose of acetaminophen
---
Arithmetic only: check every dose with a doctor, a pharmacist or the label.
weight = 18 kg
dose = weight * 15 mg / kg
strength = 160 mg / 5 mL
dose / strength
4 * dose
No more than four doses in 24 hours, at least four hours apart.
`,h=`---
title: What the space heater costs
---
power = 1500 W
hours = 6 h * 30
energy = power * hours to kWh
price = 0.28
cost = energy / kWh * price
cost * 5
`,g=`---
title: A car loan over five years
---
principal = 24000
r = 6.9% / 12
n = 60
payment = principal * r / (1 - (1 + r)^-n)
total = payment * n
total - principal
`,_=`---
title: Saving for ten years
---
start = 5000
monthly = 200
rate = 5% / 12
months = 10 * 12
grown = start * (1 + rate)^months
added = monthly * ((1 + rate)^months - 1) / rate
grown + added
start + monthly * months
`,v=`---
title: Break-even for a coffee cart
mode: graph
---
x from 0 to 400
1200 + 1.1x
4.5x
`,y=`---
title: A curve and its slope
mode: graph
---
x from -2.5 to 2.5
x^3 - 3x
3x^2 - 3
-2
`,b=`---
title: Waves adding up
mode: graph
---
x from -6.3 to 6.3
sin(x)
sin(3x)/3
sin(x) + sin(3x)/3 + sin(5x)/5
`,x=()=>[{id:`bill`,name:e(`calc-splitting-bill`),blurb:e(`calc-food-drinks-and-18-tip`),doc:t},{id:`shopping`,name:e(`calc-shopping-total`),blurb:e(`calc-tape-of-market-apples-and`),doc:n},{id:`tax`,name:e(`calc-tax-on-price`),blurb:e(`calc-new-york-city-sales-tax`),doc:r},{id:`percent`,name:e(`calc-percentage-change`),blurb:e(`calc-rent-up-from-1-450`),doc:i},{id:`kitchen`,name:e(`calc-kitchen-conversions`),blurb:e(`calc-cups-ovens-spoons-and-weights`),doc:a},{id:`recipe`,name:e(`calc-scaling-recipe`),blurb:e(`calc-banana-bread-for-eight-made`),doc:o},{id:`units`,name:e(`calc-unit-conversions`),blurb:e(`calc-feet-to-centimeters-miles-to`),doc:s},{id:`currency`,name:e(`calc-currency-at-rate-you-type`),blurb:e(`calc-trip-priced-in-euros-and`),doc:c},{id:`fuel`,name:e(`calc-fuel-for-trip`),blurb:e(`calc-boston-to-montreal-and-back`),doc:l},{id:`paint`,name:e(`calc-paint-for-room`),blurb:e(`calc-walls-less-door-and-windows`),doc:u},{id:`zones`,name:e(`calc-time-zones`),blurb:e(`calc-one-call-at-9-in`),doc:d},{id:`pace`,name:e(`calc-running-pace`),blurb:e(`calc-10k-in-52-30-minutes`),doc:f},{id:`bmi`,name:e(`calc-body-mass-index`),blurb:e(`calc-weight-over-height-squared-in`),doc:p},{id:`dose`,name:e(`calc-dose-by-weight`),blurb:e(`calc-milligrams-kilogram-turned-into-milliliters`),doc:m},{id:`power`,name:e(`calc-electricity-for-appliance`),blurb:e(`calc-watts-hours-day-and-price`),doc:h},{id:`loan`,name:e(`calc-loan-payment`),blurb:e(`calc-24-000-at-6-9`),doc:g},{id:`savings`,name:e(`calc-compound-interest`),blurb:e(`calc-5-000-and-200-month`),doc:_},{id:`break-even`,name:e(`calc-break-even`),blurb:e(`calc-costs-against-sales-for-coffee`),doc:v},{id:`slope`,name:e(`calc-curve-and-its-slope`),blurb:e(`calc-x3-3x-its-derivative-and`),doc:y},{id:`waves`,name:e(`calc-waves-adding-up`),blurb:e(`calc-sine-waves-summed-on-their`),doc:b}];export{x as templates};