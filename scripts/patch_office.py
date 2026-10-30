#!/usr/bin/env python3
"""Changes to Tiny Little Office's built editors (host_web/office/editors.js)
that its pinned commit lacks; scripts/vendor_office.sh runs this after each
build, and it can be run again safely (a change already made is skipped).

- Pinboard: cut, copy and paste things (⌘X, ⌘C, ⌘V, and in the menu on a
  thing). A frame takes what's in it along, as it does when it's dragged;
  arrows between the things go too. The things are kept in the page; the
  clipboard gets their words, so pasting them anywhere else pastes text, and a
  paste here of anything newer (a picture, other text) is that instead.
"""
import sys
from pathlib import Path

FILE = Path(__file__).resolve().parent.parent / "host_web/office/editors.js"

# (what to find, what it becomes, a piece of the new text that says it's done)
CHANGES = [
    # the commands, after Delete: in the menu on a thing, and their keys
    (
        "group:`delete`,when:J7,does:e=>e.removeSel()})],_Oe=[",
        "group:`delete`,when:J7,does:e=>e.removeSel()}),"
        "G7(`cut`,`common-cut`,{at:`canvas`,icon:_y,keys:`Mod+X`,where:[`context`],group:`clip`,when:J7,does:e=>e.copySel(!0)}),"
        "G7(`copy`,`common-copy`,{at:`canvas`,icon:jo,keys:`Mod+C`,where:[`context`],group:`clip`,when:J7,does:e=>e.copySel(!1)}),"
        "G7(`paste`,`common-paste`,{at:`canvas`,icon:ho,keys:`Mod+V`,native:!0,where:[`context`],group:`clip`,"
        "when:e=>!!e.clip&&e.editing===null&&!e.readOnly,does:e=>e.pasteClip()})],_Oe=[",
        "does:e=>e.copySel(!0)",
    ),
    # copySel and pasteClip, beside duplicateSel
    (
        "duplicateSel(){let{ops:e,ids:t}=oR(this.doc,this.chosen);this.change(e,t)}",
        "duplicateSel(){let{ops:e,ids:t}=oR(this.doc,this.chosen);this.change(e,t)}"
        "copySel(e){let t=kL(this.doc),n=new Set(this.withHeld(this.chosen)),r=t.items.filter(e=>n.has(e.id)&&!DL(e.k));"
        "if(!r.length)return;let i=t.items.filter(e=>DL(e.k)&&n.has(e.from)&&n.has(e.to)),"
        "a=r.flatMap(e=>{let n=t.fences.get(e.id),r=n===void 0?void 0:this.doc.blocks[n];return r?[r]:[]}),"
        "o=r.map(pR).filter(Boolean).join(`\\n`)||(r.length===1?`1 thing from a pinboard`:`${r.length} things from a pinboard`);"
        "this.clip={items:r,lines:i,blocks:a,text:o,times:0,cut:e};try{navigator.clipboard?.writeText(o).catch(()=>void 0)}catch{}"
        "e&&this.change(aR(this.doc,r.map(e=>e.id)),[])}"
        "pasteClip(){clearTimeout(this.pasteWait);let e=this.clip;if(!e||this.readOnly)return;"
        "let t=kL(this.doc),n=new Set(t.items.map(e=>e.id)),r=new Map;for(let t of e.items){let e=WL(t.k,n);n.add(e),r.set(t.id,e)}"
        "let i=Math.min(...e.items.map(e=>e.x)),a=Math.min(...e.items.map(e=>e.y)),o=Math.max(...e.items.map(e=>e.x+e.w)),s=Math.max(...e.items.map(e=>e.y+e.h)),"
        "[c,l]=this.middle(),[u,d]=this.size.map(e=>e/2/this.zoom),f=Math.abs((i+o)/2-c)<u&&Math.abs((a+s)/2-l)<d,"
        "p=f?(e.cut?0:24)*++e.times:Math.round(c-(i+o)/2),m=f?p:Math.round(l-(a+s)/2);f||(e.times=0);"
        "let h=[...e.items.map(e=>({...e,id:r.get(e.id),x:e.x+p,y:e.y+m})),...e.lines.map(e=>{let t=WL(e.k,n);return n.add(t),{...e,id:t,from:r.get(e.from),to:r.get(e.to)}})];"
        "e.cut&&(e.cut=!1,e.times=0);"
        "this.change(QL(this.doc,h,e.blocks.map(e=>({...e,a:{...e.a,id:r.get(e.a.id)}}))),h.map(e=>e.id)),this.tool=`select`}",
        "pasteClip(){",
    ),
    # ⌘V: a paste of the things copied (the clipboard still says their words) is
    # them; if the browser sends no paste (Safari, to a canvas), them anyway
    (
        "onPaste=e=>{if(this.readOnly||this.editing||document.activeElement!==this.querySelector(`.pin-wrap`))return;",
        "onPaste=e=>{if(this.readOnly||this.editing||document.activeElement!==this.querySelector(`.pin-wrap`))return;"
        "if(clearTimeout(this.pasteWait),this.clip&&(e.clipboardData?.getData(`text/plain`)??``)===this.clip.text&&!e.clipboardData?.files?.length){e.preventDefault(),this.pasteClip();return}",
        "this.clip.text&&!e.clipboardData",
    ),
    (
        "onKey=e=>{let t=e.composedPath()[0];e.defaultPrevented||!t.classList?.contains(`pin-wrap`)||this.readOnly||$t(e,Q7,this)};",
        "onKey=e=>{let t=e.composedPath()[0];e.defaultPrevented||!t.classList?.contains(`pin-wrap`)||this.readOnly||"
        "((e.metaKey||e.ctrlKey)&&!e.altKey&&!e.shiftKey&&e.key.toLowerCase()===`v`&&this.clip&&this.editing===null&&(clearTimeout(this.pasteWait),this.pasteWait=setTimeout(()=>this.pasteClip(),150)),$t(e,Q7,this))};",
        "this.pasteWait=setTimeout",
    ),
]


def main():
    s = FILE.read_text()
    for old, new, done in CHANGES:
        if done in s:
            continue
        if s.count(old) != 1:
            sys.exit(f"patch_office: can't find the place for {done!r} in {FILE} (found {s.count(old)}); the editors have changed")
        s = s.replace(old, new)
    FILE.write_text(s)


if __name__ == "__main__":
    main()
