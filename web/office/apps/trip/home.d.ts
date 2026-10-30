/** The zoom of a city: New York City's, and where the map goes when the device says where it is. */
export declare const CITY = 12;
/** New York City: City Hall. */
export declare const NYC: {
    lat: number;
    lon: number;
    zoom: number;
};
/** Each language's home, by the code of its file in src/i18n/. */
export declare const HOMES: Record<string, string>;
export interface View {
    lat: number;
    lon: number;
    zoom: number;
}
/** The country to open on, by its code: the first of `locales` in the site's language that names a region, else the language's home; '' for none. */
export declare function homeCountry(language: string, locales: readonly string[]): string;
/**
 * Where the map opens for a site in `language` read by a browser that prefers `locales`: that country whole, or New
 * York City where the country is not known or is the United States (the city the site is made in, rather than a
 * continent from Alaska to Florida).
 */
export declare function homeView(language: string, locales: readonly string[]): View;
