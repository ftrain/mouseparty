export declare function zip(files: Record<string, string | Uint8Array>, created?: number | null): Uint8Array;
/** A zip's files by path, in the archive's order; with `want`, only those it takes are inflated. Throws on what is not a zip. */
export declare function unzip(bytes: Uint8Array, want?: (name: string, size: number) => boolean): Record<string, Uint8Array>;
export declare const XML_HEAD = "<?xml version=\"1.0\" encoding=\"UTF-8\" standalone=\"yes\"?>\n";
