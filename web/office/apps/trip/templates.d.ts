/**
 * Trip's templates: Blank is the app's own page (an empty map to tap); these are the rest, each a real route
 * written by the kernel, so each is canonical and round-trips byte for byte (the corpus test holds every one).
 * Blank first, then the everyday trips (a weekend, a road trip, an afternoon of food, a walk, a ride, a tour), the long
 * journeys, and the special ones (a pilgrimage, film locations, a wedding's places for its guests). Every way of
 * measuring is here: kilometers, miles, hours of driving, and places that are dots, not a route.
 */
import type { Template } from '../../kit/core/app.ts';
export declare const templates: () => Template[];
