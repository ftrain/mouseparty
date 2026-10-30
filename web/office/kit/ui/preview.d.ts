export declare class ToPreview extends HTMLElement {
    static observedAttributes: string[];
    connectedCallback(): void;
    disconnectedCallback(): void;
    attributeChangedCallback(): void;
    /** Drawn now (it has come into sight). */
    draw(): void;
}
