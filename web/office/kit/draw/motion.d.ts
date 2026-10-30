/**
 * Pages that move. An animation drawn into a page (the Animator's view, placed on a slide or in a text)
 * plays by SMIL: the SVG animates itself, no script needed. What a script adds is when: a slide that comes
 * on starts its animations from the beginning, one that goes off is paused (a deck
 * of ten animations runs no ten clocks), and with "reduce motion" asked of the system every animation
 * stands at its resting moment, where a once-through ends. All by the <svg> element's own clock
 * (setCurrentTime, pauseAnimations, unpauseAnimations): an outermost <svg> holds the clock of everything
 * inside it, a placed page's nested <svg> included. Chromium never moves an animation that was under
 * `display: none` when the page loaded (a slide not on), whatever its clock says,
 * until the <svg> is put in the page again: so one that comes on is put back where it is, first.
 *
 * motion() is for the kit and the editors; MOTION_JS is the same function as a fixed text, for the pages
 * the apps make (a deck's slideshow), whose scripts are registered with kit/draw/page.ts by their text.
 */
/** Whether the system asks for less motion. */
export declare const reducedMotion: () => boolean;
/** The resting moment of an <svg>'s animations, in seconds: where its longest once-through ends (a round of one that repeats for ever). */
export declare function restOf(svg: SVGSVGElement): number;
/** The pages under `root` come on (`on`: their animations start from the beginning, or rest where they end with reduced motion) or go off (paused). */
export declare function motion(root: ParentNode, on: boolean): void;
/** motion() for a page's own script: a fixed text (ES5, as every page script is), defining `motion(root, on)`. */
export declare const MOTION_JS = "function motion(root,on){\nvar still=on&&window.matchMedia&&matchMedia('(prefers-reduced-motion: reduce)').matches;\n[].forEach.call(root.querySelectorAll('svg:not(svg svg)'),function(s){if(!s.pauseAnimations||!s.querySelector('animate,animateTransform,animateMotion,set'))return;\nif(!on){s.pauseAnimations();return;}\ns.parentNode.insertBefore(s,s.nextSibling);\nif(still){var e=0;[].forEach.call(s.querySelectorAll('animate,animateTransform,animateMotion,set'),function(a){var d=0;try{d=a.getSimpleDuration();}catch(x){}var n=parseFloat(a.getAttribute('repeatCount'))||1;if(isFinite(d))e=Math.max(e,d*n);});s.setCurrentTime(Math.max(0,e-0.001));s.pauseAnimations();return;}\ns.setCurrentTime(0);s.unpauseAnimations();});}\n";
