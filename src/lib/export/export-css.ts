/**
 * Static-export CSS (#80).
 *
 * A single-file export can't link the app's compiled stylesheet, so this
 * module carries the curated CSS the exported document needs. The `.lb-*`
 * rules, keyframes, and skin blocks are ported VERBATIM from
 * `src/app/globals.css` (lines ~130–731 at time of writing) so exported
 * pages render identically to the live page — re-port when globals.css
 * changes those blocks. Everything else the live page gets from Tailwind
 * utilities is replaced by inline styles in the builder, plus the small
 * structural rules below (container/banner) that need media queries.
 */

/** Minimal preflight (Tailwind-equivalent subset the public page relies on). */
const RESET_CSS = `*,*::before,*::after{box-sizing:border-box;border:0 solid rgba(167,139,250,.12);margin:0;padding:0}
html{-webkit-text-size-adjust:100%}
body{min-height:100vh;-webkit-font-smoothing:antialiased;-moz-osx-font-smoothing:grayscale}
img,svg,video{display:block;max-width:100%}
button{font:inherit;color:inherit;background:none;cursor:pointer}
a{color:inherit;text-decoration:none}`;

/** Structural rules for export-only wrapper classes (media-query sized). */
const STRUCTURAL_CSS = `.lb-export-container{max-width:var(--lb-container-width);margin:0 auto;padding:48px 20px 24px;text-align:var(--lb-alignment)}
@media (min-width:640px){.lb-export-container{padding-top:64px;padding-bottom:32px}}
.lb-export-banner{display:block;width:100%;height:180px;object-fit:cover}
@media (min-width:640px){.lb-export-banner{height:240px}}
.lb-export-banner-sm{display:block;width:100%;height:120px;object-fit:cover}
@media (min-width:640px){.lb-export-banner-sm{height:160px}}
.lb-export-bio{margin-top:8px;max-width:28rem;margin-left:auto;margin-right:auto;font-size:.875rem;line-height:1.625;color:var(--lb-text-muted)}
.lb-export-skip{position:absolute;left:-9999px;top:auto}
.lb-export-skip:focus{position:absolute;left:16px;top:16px;z-index:50;border-radius:8px;background:var(--lb-card-bg);padding:8px 16px;font-size:.875rem;font-weight:500;box-shadow:var(--lb-shadow);outline:none}`;

/** Reveal / float / typewriter / aurora keyframes + helpers (globals.css). */
const KEYFRAMES_CSS = `@keyframes aurora-drift{0%{transform:translate3d(0,0,0) scale(1)}50%{transform:translate3d(4%,-3%,0) scale(1.08)}100%{transform:translate3d(0,0,0) scale(1)}}
@keyframes aurora-rise{from{opacity:0;transform:translateY(8px)}to{opacity:1;transform:translateY(0)}}
@keyframes lb-fade-up{from{opacity:0;transform:translateY(14px)}to{opacity:1;transform:translateY(0)}}
@keyframes lb-slide-in{from{opacity:0;transform:translateX(-24px)}to{opacity:1;transform:translateX(0)}}
@keyframes lb-zoom-in{from{opacity:0;transform:scale(0.92)}to{opacity:1;transform:scale(1)}}
@keyframes lb-blur-in{from{opacity:0;filter:blur(8px)}to{opacity:1;filter:blur(0)}}
@keyframes lb-float{0%,100%{transform:translateY(0)}50%{transform:translateY(-6px)}}
@keyframes lb-gradient-text-flow{0%{background-position:0% 50%}50%{background-position:100% 50%}100%{background-position:0% 50%}}
@keyframes lb-caret-blink{0%,45%{opacity:1}50%,100%{opacity:0}}
@keyframes lb-tw-reveal{from{clip-path:inset(0 100% 0 0)}to{clip-path:inset(0 0 0 0)}}
@keyframes lb-tw-caret-track{from{left:0%}to{left:100%}}
.lb-tw{position:relative;display:inline-block}
.lb-tw-text{display:inline-block}
.lb-tw-caret{position:absolute;top:.14em;bottom:.14em;left:0;width:.08em;margin-left:-.04em;background:var(--lb-accent);border-radius:1px;pointer-events:none}
.lb-float{animation:lb-float 3s ease-in-out infinite}`;

/** Aurora background layers + the standalone film-grain noise overlay. */
const BACKGROUND_CSS = `.aurora-root{position:fixed;inset:0;z-index:-10;overflow:hidden;pointer-events:none}
.aurora-base{position:absolute;inset:0;background:var(--lb-aurora-base,#0a0820)}
.aurora-blob{position:absolute;border-radius:9999px;filter:blur(110px);will-change:transform}
.aurora-blob--1{width:60vw;height:60vw;left:-10vw;top:-15vh;background:var(--lb-aurora-blob-1,#533fd6);opacity:.20;animation:aurora-drift 24s ease-in-out infinite}
.aurora-blob--2{width:55vw;height:55vw;right:-12vw;bottom:-18vh;background:var(--lb-aurora-blob-2,#a78bfa);opacity:.18;animation:aurora-drift 30s ease-in-out infinite reverse}
.aurora-grain{position:absolute;inset:0;opacity:.04;mix-blend-mode:overlay;background-image:url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='160' height='160'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.8' numOctaves='2' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23n)'/%3E%3C/svg%3E")}
.aurora-vignette{position:absolute;inset:0;background:radial-gradient(120% 120% at 50% 40%,transparent 55%,rgba(5,3,20,.55) 100%)}
.lb-noise{position:fixed;inset:0;z-index:-5;pointer-events:none;opacity:.06;mix-blend-mode:overlay;background-image:url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='160' height='160'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.8' numOctaves='2' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23n)'/%3E%3C/svg%3E")}
.lb-video-bg{position:fixed;inset:0;z-index:-10;overflow:hidden;pointer-events:none}`;

/** Card hovers + pixel hard-shadow hover. */
const CARD_CSS = `.lb-link-card{transition:transform .18s ease,box-shadow .18s ease,border-color .18s ease}
.lb-link-card:hover{border-color:var(--lb-accent);box-shadow:var(--lb-shadow)}
.lb-link-card[data-hover="lift"]:hover{transform:translateY(-3px)}
.lb-link-card[data-hover="scale"]:hover{transform:scale(1.02)}
.lb-link-card[data-hover="glow"]:hover{box-shadow:0 0 24px var(--lb-glow)}
.lb-link-card[data-neon="true"]:hover{box-shadow:0 0 24px var(--lb-accent)}
.lb-link-card[data-pixel="true"]:hover{box-shadow:6px 6px 0 var(--lb-accent)}
.lb-pixel-card-wrap{transition:transform .15s ease,box-shadow .15s ease}
.lb-pixel-card-wrap:hover{transform:translate(-2px,-2px);box-shadow:6px 6px 0 var(--lb-accent)!important}
.lb-pixel-card-wrap .lb-link-card:hover{transform:none}`;

/** Footer zone + footer (rhythm owned by the ONE container). */
const FOOTER_CSS = `.lb-footer-zone{display:flex;flex-direction:column;align-items:center;margin-top:calc(var(--lb-spacing) * 4);gap:calc(var(--lb-spacing) * 1.5);width:100%}
.lb-footer{margin-top:calc(var(--lb-spacing) * 1.5);padding-top:calc(var(--lb-spacing) * 1.25);padding-bottom:0;border-top:1px solid color-mix(in srgb,var(--lb-text-muted) 22%,transparent);font-size:.75rem;line-height:1.6;text-align:center;width:100%;color:var(--lb-text-muted)}
.lb-footer-text{margin-bottom:.25rem}`;

/** Social icon hover (same reduced-motion gate as cards). */
const SOCIAL_CSS = `.lb-social-icon{transition:transform .15s ease,border-color .15s ease}
.lb-social-icon:hover{transform:translateY(-2px);border-color:var(--lb-accent)}`;

/** Native <dialog> popup cards (#93) — verbatim from globals.css. */
const POPUP_CSS = `.lb-popup-dialog{margin:auto;background:color-mix(in srgb,var(--lb-text) 7%,var(--lb-card-bg));border:var(--lb-border-width) solid var(--lb-card-border);border-radius:min(var(--lb-card-radius),24px);color:var(--lb-text);font-family:var(--lb-font);padding:0;width:min(92vw,480px);max-width:100%;max-height:85vh;box-shadow:var(--lb-shadow)}
.lb-popup-dialog:not([open]){display:none}
.lb-popup-dialog::backdrop{background:rgb(0 0 0 / .55);backdrop-filter:blur(3px);-webkit-backdrop-filter:blur(3px)}
.lb-popup-panel{display:flex;flex-direction:column;min-height:0;max-height:85vh;border-radius:inherit;overflow:hidden}
.lb-popup-content{flex:1 1 auto;min-height:0;padding:20px 20px 16px;overflow-y:auto;overscroll-behavior:contain}
.lb-popup-title{margin:0 36px 8px 0;font-size:calc(var(--lb-font-size) + 4px);font-weight:calc(var(--lb-font-weight) + 100);letter-spacing:var(--lb-letter-spacing);overflow:hidden;display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical}
.lb-popup-close{position:absolute;top:10px;right:10px;z-index:2;width:30px;height:30px;display:flex;align-items:center;justify-content:center;border:var(--lb-border-width) solid var(--lb-card-border);border-radius:9999px;background:color-mix(in srgb,var(--lb-card-bg) 78%,transparent);backdrop-filter:blur(4px);-webkit-backdrop-filter:blur(4px);color:var(--lb-text-muted);font-size:20px;line-height:1;cursor:pointer}
.lb-popup-close:hover{color:var(--lb-text);background:color-mix(in srgb,var(--lb-text) 10%,transparent)}
.lb-popup-body{font-size:var(--lb-font-size);line-height:1.55}
.lb-popup-body .lb-md-p{margin:0 0 10px;color:var(--lb-text)}
.lb-popup-body .lb-md-h1,.lb-popup-body .lb-md-h2{margin:14px 0 8px;font-weight:calc(var(--lb-font-weight) + 200);color:var(--lb-text)}
.lb-popup-body .lb-md-h1{font-size:calc(var(--lb-font-size) + 3px)}
.lb-popup-body .lb-md-h2{font-size:calc(var(--lb-font-size) + 1px)}
.lb-popup-body .lb-md-list{margin:4px 0 10px;padding-left:20px;color:var(--lb-text)}
.lb-popup-body .lb-md-list li{margin:3px 0}
.lb-popup-body code{border-radius:4px;padding:1px 5px;font-size:.85em;font-family:var(--lb-font-mono,monospace);background:color-mix(in srgb,var(--lb-accent) 12%,transparent)}
.lb-popup-cta{display:block;flex:0 0 auto;margin:4px 16px 16px;padding:var(--lb-btn-padding-y,10px) var(--lb-btn-padding-x,20px);font-size:.875rem;font-weight:500;text-align:center;text-decoration:none;letter-spacing:var(--lb-letter-spacing);cursor:pointer;transition:opacity .15s ease}
.lb-popup-cta:hover{opacity:.9}
.lb-popup-map-wrap{position:relative;flex:0 0 auto;width:100%;aspect-ratio:16/10;background:var(--lb-card-bg)}
.lb-popup-map{display:block;width:100%;height:100%;border:0}
@keyframes lb-popup-in{from{opacity:0;transform:scale(.96) translateY(8px)}to{opacity:1;transform:scale(1) translateY(0)}}
.lb-popup-dialog[open]{animation:lb-popup-in .18s ease-out}
main.lb-gel-mode .lb-popup-dialog{border:var(--lb-border-width) solid var(--lb-card-border)!important;background:linear-gradient(180deg,rgba(255,255,255,.55) 0%,rgba(255,255,255,.18) 42%,color-mix(in srgb,var(--lb-text) 7%,var(--lb-card-bg)) 100%)!important;box-shadow:inset 0 1px 0 rgba(255,255,255,.65),0 12px 40px -12px rgba(0,30,60,.45)}
.lb-popup-dialog[data-lb-skin="neon"]{border-color:var(--lb-accent);box-shadow:0 0 24px var(--lb-accent),inset 0 0 12px color-mix(in srgb,var(--lb-accent) 8%,transparent)}
main.lb-pixel-mode .lb-popup-dialog{border-radius:0;clip-path:polygon(8px 0,calc(100% - 8px) 0,calc(100% - 8px) 4px,calc(100% - 4px) 4px,calc(100% - 4px) 8px,100% 8px,100% calc(100% - 8px),calc(100% - 4px) calc(100% - 8px),calc(100% - 4px) calc(100% - 4px),calc(100% - 8px) calc(100% - 4px),calc(100% - 8px) 100%,8px 100%,8px calc(100% - 4px),4px calc(100% - 4px),4px calc(100% - 8px),0 calc(100% - 8px),0 8px,4px 8px,4px 4px);box-shadow:4px 4px 0 var(--lb-card-border)}
main.lb-pixel-mode .lb-popup-close{border-radius:0}
@media (max-width:520px){.lb-popup-dialog{width:100vw;max-width:100vw;margin:0;margin-top:auto;max-height:92vh;max-height:92dvh;border-radius:min(var(--lb-card-radius),24px) min(var(--lb-card-radius),24px) 0 0;border-bottom:none}
.lb-popup-dialog[open]{animation-name:lb-popup-sheet-in}
.lb-popup-panel{max-height:92vh;max-height:92dvh}
.lb-popup-content{padding:16px 16px 12px}
.lb-popup-map-wrap{max-height:40vh}
.lb-popup-cta{margin:2px 12px calc(12px + env(safe-area-inset-bottom,0px))}}
@keyframes lb-popup-sheet-in{from{opacity:0;transform:translateY(24px)}to{opacity:1;transform:translateY(0)}}
@media (min-width:1024px){.lb-popup-dialog{width:min(92vw,520px);box-shadow:0 24px 64px -16px rgb(0 0 0 / .35),var(--lb-shadow)}
.lb-popup-map-wrap{aspect-ratio:16/9}
.lb-popup-content{padding:24px 24px 18px}
.lb-popup-cta{margin:6px 20px 20px}}
.lb-popup-close:focus-visible,.lb-popup-cta:focus-visible{outline:2px solid var(--lb-accent);outline-offset:2px}`;

/** Gel (Frutiger Aero) skin — verbatim from globals.css. */
const GEL_CSS = `.lb-gel-mode .lb-link-card{position:relative;overflow:hidden;border:var(--lb-border-width) solid var(--lb-card-border)!important;background:linear-gradient(180deg,rgba(255,255,255,.55) 0%,rgba(255,255,255,.18) 42%,var(--lb-card-bg) 100%)!important;backdrop-filter:blur(var(--lb-blur)) saturate(130%);-webkit-backdrop-filter:blur(var(--lb-blur)) saturate(130%);box-shadow:inset 0 1px 0 rgba(255,255,255,.65),0 6px 18px -6px rgba(6,137,228,.35);transition:transform .22s cubic-bezier(.34,1.56,.64,1),box-shadow .22s ease,border-color .22s ease}
.lb-gel-mode .lb-link-card::before{content:"";position:absolute;left:6%;right:6%;top:4%;height:42%;border-radius:9999px/100%;background:linear-gradient(180deg,rgba(255,255,255,.75),rgba(255,255,255,.05));pointer-events:none;transition:top .25s ease}
.lb-gel-mode .lb-link-card:hover{transform:scaleY(.975) scaleX(1.008);border-color:var(--lb-accent)!important;box-shadow:inset 0 1px 0 rgba(255,255,255,.8),0 4px 12px -4px rgba(6,137,228,.45)}
.lb-gel-mode .lb-link-card:hover::before{top:2%}
.lb-gel-mode .lb-link-card:active{transform:scaleY(.94) scaleX(1.015)}
.lb-gel-mode .lb-social-icon{position:relative;overflow:hidden;border:var(--lb-border-width) solid var(--lb-card-border)!important;background:linear-gradient(180deg,rgba(255,255,255,.5) 0%,rgba(255,255,255,.15) 45%,var(--lb-card-bg) 100%)!important;backdrop-filter:blur(var(--lb-blur)) saturate(130%);-webkit-backdrop-filter:blur(var(--lb-blur)) saturate(130%);box-shadow:inset 0 1px 0 rgba(255,255,255,.6),0 4px 12px -4px rgba(6,137,228,.3);transition:transform .22s cubic-bezier(.34,1.56,.64,1),border-color .22s ease}
.lb-gel-mode .lb-social-icon::before{content:"";position:absolute;left:12%;right:12%;top:6%;height:40%;border-radius:9999px;background:linear-gradient(180deg,rgba(255,255,255,.7),rgba(255,255,255,.04));pointer-events:none}
.lb-gel-mode .lb-social-icon:hover{transform:translateY(-2px) scale(1.06);border-color:var(--lb-accent)!important}
.lb-gel-mode .lb-gel-btn{position:relative;overflow:hidden;background:linear-gradient(180deg,color-mix(in srgb,var(--lb-accent) 78%,#ffffff) 0%,var(--lb-accent) 48%,color-mix(in srgb,var(--lb-accent) 82%,#063a5e) 100%)!important;color:var(--lb-btn-text);border:none!important;box-shadow:inset 0 1px 0 rgba(255,255,255,.55),inset 0 -2px 4px rgba(6,58,94,.25),0 5px 15px -5px rgba(6,137,228,.55);transition:transform .2s cubic-bezier(.34,1.56,.64,1),box-shadow .2s ease}
.lb-gel-mode .lb-gel-btn::before{content:"";position:absolute;left:8%;right:8%;top:5%;height:40%;border-radius:9999px;background:linear-gradient(180deg,rgba(255,255,255,.65),rgba(255,255,255,.04));pointer-events:none}
.lb-gel-mode .lb-gel-btn:hover{transform:translateY(-1px) scale(1.02)}
.lb-gel-mode .lb-gel-btn:active{transform:scaleY(.94)}
.lb-gel-mode .lb-gel-embed{position:relative;overflow:hidden;background:linear-gradient(180deg,rgba(255,255,255,.5) 0%,rgba(255,255,255,.12) 45%,var(--lb-card-bg) 100%)!important;backdrop-filter:blur(var(--lb-blur)) saturate(130%);-webkit-backdrop-filter:blur(var(--lb-blur)) saturate(130%);border:var(--lb-border-width) solid var(--lb-card-border)!important;box-shadow:inset 0 1px 0 rgba(255,255,255,.6),0 6px 18px -6px rgba(6,137,228,.35)}`;

/** Pixel (8-bit) mode — verbatim from globals.css. */
const PIXEL_CSS = `main.lb-pixel-mode .lb-pixel-clip{clip-path:polygon(6px 0,calc(100% - 6px) 0,calc(100% - 6px) 3px,calc(100% - 3px) 3px,calc(100% - 3px) 6px,100% 6px,100% calc(100% - 6px),calc(100% - 3px) calc(100% - 6px),calc(100% - 3px) calc(100% - 3px),calc(100% - 6px) calc(100% - 3px),calc(100% - 6px) 100%,6px 100%,6px calc(100% - 3px),3px calc(100% - 3px),3px calc(100% - 6px),0 calc(100% - 6px),0 6px,3px 6px,3px 3px)}
main.lb-pixel-mode :is(button,a).lb-pixel-shadow{background:var(--lb-accent)!important;color:#fff!important;border:none!important;clip-path:polygon(6px 0,calc(100% - 6px) 0,calc(100% - 6px) 3px,calc(100% - 3px) 3px,calc(100% - 3px) 6px,100% 6px,100% calc(100% - 6px),calc(100% - 3px) calc(100% - 6px),calc(100% - 3px) calc(100% - 3px),calc(100% - 6px) calc(100% - 3px),calc(100% - 6px) 100%,6px 100%,6px calc(100% - 3px),3px calc(100% - 3px),3px calc(100% - 6px),0 calc(100% - 6px),0 6px,3px 6px,3px 3px);box-shadow:4px 4px 0 var(--lb-text)!important;transition:transform .15s ease,box-shadow .15s ease}
main.lb-pixel-mode :is(button,a).lb-pixel-shadow:hover{transform:translate(-2px,-2px);box-shadow:6px 6px 0 var(--lb-text)!important}
main.lb-pixel-mode .lb-pixel-border{position:relative;background:var(--lb-accent)!important;border:none!important;clip-path:polygon(6px 0,calc(100% - 6px) 0,calc(100% - 6px) 3px,calc(100% - 3px) 3px,calc(100% - 3px) 6px,100% 6px,100% calc(100% - 6px),calc(100% - 3px) calc(100% - 6px),calc(100% - 3px) calc(100% - 3px),calc(100% - 6px) calc(100% - 3px),calc(100% - 6px) 100%,6px 100%,6px calc(100% - 3px),3px calc(100% - 3px),3px calc(100% - 6px),0 calc(100% - 6px),0 6px,3px 6px,3px 3px)}
main.lb-pixel-mode .lb-pixel-border>*:first-child{background:var(--lb-card-bg);clip-path:polygon(4px 0,calc(100% - 4px) 0,calc(100% - 4px) 2px,calc(100% - 2px) 2px,calc(100% - 2px) 4px,100% 4px,100% calc(100% - 4px),calc(100% - 2px) calc(100% - 4px),calc(100% - 2px) calc(100% - 2px),calc(100% - 4px) calc(100% - 2px),calc(100% - 4px) 100%,4px 100%,4px calc(100% - 2px),2px calc(100% - 2px),2px 4px,0 4px)}
main.lb-pixel-mode span.lb-pixel-border:not(:has(*)){background:var(--lb-accent);color:#fff;clip-path:polygon(6px 0,calc(100% - 6px) 0,calc(100% - 6px) 3px,calc(100% - 3px) 3px,calc(100% - 3px) 6px,100% 6px,100% calc(100% - 6px),calc(100% - 3px) calc(100% - 6px),calc(100% - 3px) calc(100% - 3px),calc(100% - 6px) calc(100% - 3px),calc(100% - 6px) 100%,6px 100%,6px calc(100% - 3px),3px calc(100% - 3px),3px calc(100% - 6px),0 calc(100% - 6px),0 6px,3px 6px,3px 3px)}
main.lb-pixel-mode .lb-pixel-avatar{background:var(--lb-accent);padding:3px;border:none!important;clip-path:polygon(8px 0,calc(100% - 8px) 0,calc(100% - 8px) 4px,calc(100% - 4px) 4px,calc(100% - 4px) 8px,100% 8px,100% calc(100% - 8px),calc(100% - 4px) calc(100% - 8px),calc(100% - 4px) calc(100% - 4px),calc(100% - 8px) calc(100% - 4px),calc(100% - 8px) 100%,8px 100%,8px calc(100% - 4px),4px calc(100% - 4px),4px calc(100% - 8px),0 calc(100% - 8px),0 8px,4px 8px,4px 4px)}
main.lb-pixel-mode .lb-pixel-avatar>img,main.lb-pixel-mode .lb-pixel-avatar>span{clip-path:polygon(6px 0,calc(100% - 6px) 0,calc(100% - 6px) 3px,calc(100% - 3px) 3px,calc(100% - 3px) 6px,100% 6px,100% calc(100% - 6px),calc(100% - 3px) calc(100% - 6px),calc(100% - 3px) calc(100% - 3px),calc(100% - 6px) calc(100% - 3px),calc(100% - 6px) 100%,6px 100%,6px calc(100% - 3px),3px calc(100% - 3px),3px calc(100% - 6px),0 calc(100% - 6px),0 6px,3px 6px,3px 3px);border-radius:0!important}
main.lb-pixel-mode .lb-pixel-clip,main.lb-pixel-mode .lb-pixel-avatar,main.lb-pixel-mode .lb-pixel-avatar img{border-radius:0!important}
main.lb-pixel-mode .lb-pixel-shadow{box-shadow:4px 4px 0 var(--lb-accent);transition:transform .15s ease,box-shadow .15s ease}
main.lb-pixel-mode .lb-pixel-shadow:hover{box-shadow:6px 6px 0 var(--lb-accent);transform:translate(-2px,-2px)}`;

/** Reduced-motion gates (all skins) — verbatim from globals.css. */
const REDUCED_MOTION_CSS = `@media (prefers-reduced-motion:reduce){
.aurora-blob{animation:none!important}
.aurora-rise{animation:none!important;opacity:1;transform:none;filter:none}
.lb-reveal{animation:none!important;opacity:1;transform:none;filter:none}
.lb-float{animation:none!important}
.lb-text-anim{animation:none!important}
.lb-tw-text{animation:none!important}
.lb-tw-caret{display:none}
.lb-link-card{transition:none!important}
.lb-link-card:hover{transform:none!important}
.lb-social-icon{transition:none!important}
.lb-social-icon:hover{transform:none!important}
.lb-popup-dialog[open]{animation:none!important}
.lb-popup-cta{transition:none!important}
.lb-popup-cta:hover{transform:none!important}
.lb-gel-mode .lb-link-card,.lb-gel-mode .lb-link-card::before,.lb-gel-mode .lb-social-icon,.lb-gel-mode .lb-gel-btn{transition:none!important}
.lb-gel-mode .lb-link-card:hover,.lb-gel-mode .lb-link-card:active,.lb-gel-mode .lb-social-icon:hover,.lb-gel-mode .lb-gel-btn:hover,.lb-gel-mode .lb-gel-btn:active{transform:none!important}
.lb-gel-mode .lb-link-card:hover::before{top:4%!important}
}`;

export const EXPORT_CSS = [
  RESET_CSS,
  STRUCTURAL_CSS,
  KEYFRAMES_CSS,
  BACKGROUND_CSS,
  CARD_CSS,
  FOOTER_CSS,
  SOCIAL_CSS,
  POPUP_CSS,
  GEL_CSS,
  PIXEL_CSS,
  REDUCED_MOTION_CSS,
].join("\n\n");
