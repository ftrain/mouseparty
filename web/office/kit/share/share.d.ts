export declare function copyText(text: string, said?: string): Promise<boolean>;
/** Whether the device has a share sheet (a phone, mostly). */
export declare const canShareNative: () => boolean;
/** The link, and a picture of the document if the device will take one, to the share sheet. */
export declare function shareNative(title: string, url: string, png?: Uint8Array | null): Promise<void>;
/** The services a link can be posted to: each one's compose box, opened with the title and the link (their share URLs, no script of theirs). */
export type Service = 'bluesky' | 'mastodon' | 'x' | 'linkedin' | 'email';
export declare const SERVICES: readonly Service[];
export declare const SERVICE_NAMES: Record<Service, string>;
/** A Mastodon server as typed ("@me@mastodon.social", "https://hachyderm.io/"): its host alone, or '' when it is not one. */
export declare function mastodonHost(typed: string): string;
/** Where a service's compose box is, with this title and link in it; '' for Mastodon with no server known. */
export declare function shareUrl(service: Service, title: string, link: string, mastodon?: string): string;
/**
 * The snippet that shows a document on another page: an iframe of its embed page ("<site>embed/#/v1/<app>.embed/…",
 * the one address the site lets another page frame), lazy, sending no referrer, as wide as its column allows.
 */
export declare function embedCode(src: string, title: string, w?: number, h?: number): string;
