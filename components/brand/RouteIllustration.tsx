/** Decorative route, explicitly labelled as illustrative rather than real race data. */
export function RouteIllustration() {
  return <div className="route-illustration" role="img" aria-label="Illustration d’un circuit : visualiser un parcours avant de prendre le départ">
    <div className="route-illustration-label"><span>LE DIMANCHE COMMENCE ICI</span><span>01 / PRENDRE LE DÉPART</span></div>
    <svg viewBox="0 0 560 380" aria-hidden="true">
      <g stroke="currentColor" fill="none" opacity=".12" strokeWidth="1">
        <path d="M0 90 160 150 250 30 480 160 560 70M0 260 120 240 240 360 400 330 560 190M70 0 140 100 100 330M240 0 320 150 290 380M390 0 440 190 540 340" />
        <path d="M0 40H560M0 100H560M0 160H560M0 220H560M0 280H560M0 340H560M40 0V380M100 0V380M160 0V380M220 0V380M280 0V380M340 0V380M400 0V380M460 0V380M520 0V380" />
      </g>
      <path d="M116 253 137 158 219 104 332 126 406 222 364 282 267 301 207 252Z" fill="none" stroke="currentColor" strokeWidth="7" strokeLinejoin="round" />
      <path d="m137 158 82-54 113 22" fill="none" stroke="var(--highlight)" strokeWidth="8" strokeLinejoin="round" />
      <circle cx="116" cy="253" r="11" fill="var(--brand-foreground)" /><circle cx="116" cy="253" r="4" fill="var(--brand)" />
      <text x="86" y="285" fill="currentColor" fontSize="11" fontFamily="monospace">DÉPART</text>
    </svg>
    <div className="route-illustration-footer"><strong>Ça se prépare.</strong><span>Illustration de parcours</span></div>
  </div>;
}
