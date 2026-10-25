import React from 'react';
export default function LawRowLogo({className='',wordmark=false}){
 return <svg className={`lawrow-logo ${className}`} viewBox={wordmark?'0 0 9 13.2':'-.5 -.5 10 10'} role={wordmark?'img':undefined} aria-label={wordmark?'LawRow':undefined} aria-hidden={wordmark?undefined:true}>
  <g fill="currentColor">
   <path fillRule="evenodd" d="M0 0h4v4H0zM1 1v2h2V1zM1 5h4v4H1zM2 6v2h2V6z"/>
   <path d="M5 1.5h3v1H5zM6 6.5h3v1H6z"/>
  </g>
  {wordmark&&<text x="0" y="12.78" fill="currentColor" fontFamily="Arial,Helvetica,sans-serif" fontWeight="700" fontSize="2.5" textLength="9" lengthAdjust="spacingAndGlyphs">LawRow</text>}
 </svg>;
}
