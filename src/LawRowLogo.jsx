import React from 'react';
export default function LawRowLogo({className=''}){
 return <svg className={`lawrow-logo ${className}`} viewBox="0 0 64 64" aria-hidden="true">
  <g fill="none" stroke="currentColor" strokeWidth="5.5" strokeLinejoin="miter" strokeLinecap="square">
   <g><path d="M7 10h20v17H7z" fill="none"/><path d="M36 19h16"/></g>
   <g><path d="M13 37h20v17H13z" fill="none"/><path d="M42 46h16"/></g>
  </g>
 </svg>;
}
