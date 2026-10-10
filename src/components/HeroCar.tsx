"use client";

/**
 * HeroCar · the landing's protagonist. A premium neon car idling on a road that
 * rushes toward you, so the FIRST thing anyone understands is "this is a car, I
 * drive it," not "a perp-DEX automation tool." The novelty lands as a reveal
 * (under the hood = a DEX; on the surface = the simplest drive). Pure
 * CSS/SVG motion, honors prefers-reduced-motion, scales 375 → desktop.
 */
export default function HeroCar() {
  return (
    <div className="hc">
      <style>{`
        .hc{position:relative;display:flex;flex-direction:column;align-items:center;width:100%;isolation:isolate}
        .hc-road{position:absolute;bottom:2px;left:50%;transform:translateX(-50%);width:220%;max-width:100vw;height:120px;z-index:0;
          background:linear-gradient(180deg,transparent,rgba(138,116,255,.05) 40%,rgba(14,9,28,.35));
          clip-path:polygon(45% 0,55% 0,100% 100%,0 100%);
          -webkit-mask:radial-gradient(70% 100% at 50% 100%,#000 35%,transparent 78%);
          mask:radial-gradient(70% 100% at 50% 100%,#000 35%,transparent 78%)}
        @media (min-width:1024px){.hc-road{max-width:calc(100vw - 300px)}}
        .hc-road::before{content:"";position:absolute;left:50%;top:0;bottom:0;width:3px;transform:translateX(-50%);
          background:repeating-linear-gradient(180deg,rgba(245,239,226,.5) 0 20px,transparent 20px 52px);
          -webkit-mask:linear-gradient(180deg,transparent,#000 55%);mask:linear-gradient(180deg,transparent,#000 55%);
          animation:hc-dash 1s linear infinite}
        @keyframes hc-dash{to{background-position:0 52px}}
        .hc-rail{position:absolute;bottom:2px;height:120px;width:2px;z-index:0;
          background:linear-gradient(180deg,transparent,var(--papaya));box-shadow:0 0 12px var(--papaya);opacity:.32}
        .hc-rail.l{left:20%;transform:skewX(24deg)} .hc-rail.r{right:20%;transform:skewX(-24deg)}
        .hc-car{position:relative;z-index:2;width:min(400px,74vw);animation:hc-bob 4.4s ease-in-out infinite;
          filter:drop-shadow(0 18px 26px rgba(0,0,0,.7)) drop-shadow(0 0 26px rgba(138,116,255,.24))}
        @media(min-width:900px){.hc-car{width:min(720px,62vw)}}
        @keyframes hc-bob{0%,100%{transform:translateY(0)}50%{transform:translateY(-5px)}}
        .hc-wheel{transform-box:fill-box;transform-origin:center;animation:hc-spin .55s linear infinite}
        @keyframes hc-spin{to{transform:rotate(360deg)}}
        .hc-ug{animation:hc-ug 2.6s ease-in-out infinite}
        @keyframes hc-ug{0%,100%{opacity:.5}50%{opacity:.95}}
        @media(prefers-reduced-motion:reduce){.hc *{animation:none!important}}
      `}</style>

      <div className="hc-road" />
      <div className="hc-rail l" />
      <div className="hc-rail r" />

      <svg className="hc-car" viewBox="0 0 640 300" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="A neon car ready to drive">
        <defs>
          <linearGradient id="hcBody" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0" stopColor="#2a2721" /><stop offset=".5" stopColor="#191713" /><stop offset="1" stopColor="#0d0c0b" />
          </linearGradient>
          <linearGradient id="hcGlass" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0" stopColor="#f3f0ff" stopOpacity=".42" /><stop offset="1" stopColor="#1b1433" stopOpacity=".2" />
          </linearGradient>
          <linearGradient id="hcRim" x1="0" y1="0" x2="1" y2="0">
            <stop offset="0" stopColor="#8a74ff" /><stop offset="1" stopColor="#a897ff" />
          </linearGradient>
          <radialGradient id="hcUg" cx="50%" cy="50%" r="50%">
            <stop offset="0" stopColor="#8a74ff" stopOpacity=".85" /><stop offset="1" stopColor="#8a74ff" stopOpacity="0" />
          </radialGradient>
          <radialGradient id="hcHead" cx="0%" cy="50%" r="80%">
            <stop offset="0" stopColor="#eafff6" stopOpacity=".95" /><stop offset="1" stopColor="#eafff6" stopOpacity="0" />
          </radialGradient>
        </defs>

        <ellipse className="hc-ug" cx="320" cy="250" rx="250" ry="30" fill="url(#hcUg)" />
        <path d="M70,196 L-40,170 L-40,236 Z" fill="url(#hcHead)" opacity=".5" />

        <path fill="url(#hcBody)" stroke="url(#hcRim)" strokeWidth="3" strokeLinejoin="round"
          d="M52,214 C58,196 92,190 120,190 L188,188 C210,150 262,132 322,132 L372,132 C430,134 470,152 500,186 L560,192 C592,196 606,206 604,224 C602,236 590,242 566,242 L96,242 C68,242 48,232 52,214 Z" />
        <path fill="url(#hcGlass)" stroke="#85e6ff" strokeOpacity=".4" strokeWidth="1.2"
          d="M212,184 C232,152 276,140 322,140 L366,140 C410,142 442,156 466,182 Z" />
        <path d="M150,206 L520,206" stroke="url(#hcRim)" strokeWidth="1" opacity=".35" />
        <path d="M300,150 L308,206" stroke="#85e6ff" strokeOpacity=".25" strokeWidth="1" />
        <path d="M66,200 q-14,6 -12,18 l22,-3 q4,-9 -10,-15 Z" fill="#eafff6" />
        <rect x="576" y="200" width="22" height="9" rx="3" fill="#ff8ee4" />

        <g>
          <circle cx="168" cy="242" r="50" fill="#07040f" stroke="#2e2550" strokeWidth="3" />
          <g className="hc-wheel">
            <circle cx="168" cy="242" r="30" fill="#120c24" stroke="url(#hcRim)" strokeWidth="2" />
            <g stroke="#a897ff" strokeWidth="3" opacity=".8"><line x1="168" y1="216" x2="168" y2="268" /><line x1="142" y1="242" x2="194" y2="242" /><line x1="150" y1="224" x2="186" y2="260" /><line x1="186" y1="224" x2="150" y2="260" /></g>
            <circle cx="168" cy="242" r="6" fill="#8a74ff" />
          </g>
        </g>
        <g>
          <circle cx="482" cy="242" r="50" fill="#07040f" stroke="#2e2550" strokeWidth="3" />
          <g className="hc-wheel">
            <circle cx="482" cy="242" r="30" fill="#120c24" stroke="url(#hcRim)" strokeWidth="2" />
            <g stroke="#a897ff" strokeWidth="3" opacity=".8"><line x1="482" y1="216" x2="482" y2="268" /><line x1="456" y1="242" x2="508" y2="242" /><line x1="464" y1="224" x2="500" y2="260" /><line x1="500" y1="224" x2="464" y2="260" /></g>
            <circle cx="482" cy="242" r="6" fill="#8a74ff" />
          </g>
        </g>
      </svg>
    </div>
  );
}
