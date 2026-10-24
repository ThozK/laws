import React,{useEffect,useRef} from 'react';
export function DiceIcon(){return <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><rect x="3" y="3" width="18" height="18" rx="3"/><circle cx="8" cy="8" r=".8" fill="currentColor"/><circle cx="16" cy="8" r=".8" fill="currentColor"/><circle cx="12" cy="12" r=".8" fill="currentColor"/><circle cx="8" cy="16" r=".8" fill="currentColor"/><circle cx="16" cy="16" r=".8" fill="currentColor"/></svg>;}
export default function RandomWave({active}){
 const pathRef=useRef(null);
 useEffect(()=>{
  const path=pathRef.current;
  const straight='M 0 60 L 360 60';
  if(!active||window.matchMedia('(prefers-reduced-motion: reduce)').matches){path.setAttribute('d',straight);return;}
  let frame,started;
  const draw=now=>{
   started??=now;
   const t=(now-started)/1000,amplitude=33*Math.min(t/.35,1);
   const points=Array.from({length:91},(_,i)=>{
    const x=i*4,u=x/360;
    const y=60+Math.sin(Math.PI*u)*amplitude*(Math.sin(u*Math.PI*4-t*6)+.22*Math.sin(u*Math.PI*6-t*4.2));
    return `${i?'L':'M'} ${x} ${y.toFixed(2)}`;
   });
   path.setAttribute('d',points.join(' '));
   frame=requestAnimationFrame(draw);
  };
  frame=requestAnimationFrame(draw);
  return ()=>cancelAnimationFrame(frame);
 },[active]);
 return <div className="random-wave" aria-hidden="true"><svg viewBox="0 0 360 120"><path ref={pathRef} d="M 0 60 L 360 60" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/></svg></div>;
}
