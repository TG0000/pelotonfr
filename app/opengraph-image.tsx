import { ImageResponse } from "next/og";
export const alt = "PelotonFR — Ta prochaine course commence ici. FFC, FSGT et UFOLEP.";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";
export default function Image() {
  return new ImageResponse(<div style={{display:"flex",width:"100%",height:"100%",background:"#faf7ef",color:"#203d70",padding:64,flexDirection:"column",justifyContent:"space-between"}}>
    <div style={{display:"flex",alignItems:"center",gap:18,fontSize:36,fontWeight:700}}><svg width="63" height="58" viewBox="0 0 52 48"><rect width="52" height="48" rx="10" fill="#19283f"/><g transform="translate(4 3) scale(.86)"><path d="M8 34 20 10h16c13 0 13 19 0 19H19" fill="none" stroke="#faf7ef" strokeWidth="7" strokeLinecap="square"/><path d="m22 37 7-14" stroke="#ff805b" strokeWidth="7"/></g></svg>pelotonfr</div>
    <div style={{display:"flex",fontSize:78,fontWeight:700,lineHeight:1.05,maxWidth:1000}}>Ta prochaine course commence ici.</div>
    <div style={{display:"flex",fontSize:28,justifyContent:"space-between"}}><span>Le dimanche se prépare ensemble.</span><span style={{color:"#9c452c"}}>FFC · FSGT · UFOLEP</span></div>
  </div>,size);
}
