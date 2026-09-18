import * as THREE from 'three';

const captions: Record<string, [string, string, string]> = {
  Game: ['ORBIT DEFENSE', 'AIM / FIRE / PROTECT', '60 SECOND CHALLENGE'],
  Network: ['NETWORK TOPOLOGY', 'NODES / PACKETS', 'TRAFFIC SIMULATION'],
  Earth: ['PLANETARY OVERVIEW', 'SURFACE / ATMOSPHERE', '23.44° AXIAL TILT'],
  System: ['CORE DIAGNOSTICS', 'COMPUTE / MEMORY', 'RESOURCE TOPOLOGY'],
  Energy: ['POWER DISTRIBUTION', 'GENERATION / RESERVE', 'POWER FLOW MODEL'],
  Navigation: ['SPATIAL REFERENCE', 'POSITION / TRAJECTORY', 'ORBITAL COORDINATES'],
  AI: ['NEURAL INTERFACE', 'CONTEXT / REASONING', 'INFERENCE TOPOLOGY'],
  Communications: ['SIGNAL OBSERVATORY', 'UPLINK / DOWNLINK', 'SIGNAL ENVELOPE'],
  Analytics: ['PATTERN ANALYSIS', 'TRENDS / DISTRIBUTION', 'SAMPLE DISTRIBUTION'],
  Security: ['PERIMETER CONTROL', 'IDENTITY / ACCESS', 'PERIMETER SCAN'],
  Files: ['ARCHIVE INTERFACE', 'DOCUMENTS / STORAGE', 'DOCUMENT INDEX'],
  'Mission Control': ['OPERATIONS CENTER', 'OBJECTIVES / SYSTEMS', 'MISSION SEQUENCE'],
};

/** Static instrumentation artwork is explicitly a visualization, not fabricated telemetry. */
export function createPanelArtwork(title: string): THREE.CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = 640; canvas.height = 800;
  const c = canvas.getContext('2d')!;
  const [subtitle, detail, footer] = captions[title] ?? captions.System;
  const line = (points: number[][], color = '#5089a4', width = 1.4) => {
    c.strokeStyle = color; c.lineWidth = width; c.beginPath();
    points.forEach(([x,y], i) => i ? c.lineTo(x,y) : c.moveTo(x,y)); c.stroke();
  };
  const circle = (x: number, y: number, r: number, color = '#6296b0', start = 0, end = Math.PI * 2, width = 1.5) => {
    c.strokeStyle = color; c.lineWidth = width; c.beginPath(); c.arc(x,y,r,start,end); c.stroke();
  };
  const text = (value: string, x: number, y: number, size = 16, color = '#7998ad') => {
    c.fillStyle = color; c.font = `${size}px "Consolas", monospace`; c.fillText(value,x,y);
  };
  text('ORBIT / '+title.toUpperCase().slice(0,4), 42, 49, 15);
  text('VISUALIZATION', 443,49,12,'#b5a184');
  line([[42,68],[598,68]],'#2c4657');
  // A restrained vector module insignia.
  circle(76,121,22); circle(76,121,13,'#b6d7e8',-.6,3.8);
  line([[44,121],[108,121]]); line([[76,89],[76,153]]);
  c.font = `500 ${title.length>13?30:39}px "Bahnschrift", "Arial", sans-serif`;
  c.fillStyle = '#d2e2ed'; c.fillText(title.toUpperCase(),42,213);
  text(subtitle,43,246,17,'#80b1c9');
  line([[42,272],[598,272]],'#2c4657');
  c.save(); c.beginPath(); c.rect(42,298,556,272); c.clip();
  for(let i=0;i<8;i++) line([[42,306+i*36],[598,306+i*36]],'#132c3c',1);
  for(let i=0;i<16;i++) line([[44+i*36,298],[44+i*36,570]],'#132c3c',1);
  if(title==='Earth') {
    circle(320,432,116,'#91c7de',0,Math.PI*2,2);
    for(let i=-2;i<=2;i++) { c.strokeStyle='#436d85'; c.beginPath(); c.ellipse(320,432,Math.max(18,116-Math.abs(i)*38),116,0,0,Math.PI*2); c.stroke(); line([[214,432+i*35],[426,432+i*35]],'#436d85'); }
    const land = [[274,336],[316,350],[310,375],[355,388],[373,416],[348,432],[362,459],[333,508],[308,480],[299,444],[270,421],[283,393],[259,365]];
    c.fillStyle='#38647a'; c.beginPath(); land.forEach(([x,y],i)=>i?c.lineTo(x,y):c.moveTo(x,y));c.closePath();c.fill();
    circle(333,416,5,'#e0b67e',0,6.28,3); line([[338,415],[479,373],[555,373]],'#9abcca');text('EARTH',485,363,14);
  } else if(title==='Energy'||title==='System'||title==='Security') {
    for(let r=40;r<125;r+=27) circle(320,432,r,'#35596f');
    circle(320,432,116,'#8bbfd4',-1.57,2.6,7);
    for(let i=0;i<48;i++){const a=i/48*Math.PI*2;line([[320+Math.cos(a)*125,432+Math.sin(a)*125],[320+Math.cos(a)*132,432+Math.sin(a)*132]],'#537e95',2);}
    if(title==='Security'){line([[320,432],[399,347]],'#b5d6e7',2);circle(351,389,5,'#e2b879');circle(258,468,3);}
    else {text(title==='Energy'?'PWR':'CPU',281,440,34,'#d7e9f2');text('SCHEMATIC',274,467,13);}
  } else if(title==='Communications'||title==='Analytics') {
    if(title==='Communications'){
      const pts = Array.from({length:220},(_,i)=>[44+i*2.5,434+Math.sin(i*.61)*Math.sin(i*.17)*Math.sin(i*.043)*82]);line(pts,'#a1d3e7',2.5);
      line([[44,435],[590,435]],'#456d84');
    } else for(let i=0;i<22;i++){ const h=35+Math.sin(i*.8)**2*150; c.fillStyle=i%5===0?'#b7a083':'#598ba5';c.fillRect(53+i*24,551-h,12,h);}
  } else if(title==='Files') {
    for(let i=0;i<4;i++){const x=185+i*42,y=330+i*18;line([[x,y+173],[x,y],[x+133,y],[x+155,y+22],[x+155,y+173],[x,y+173]],i===3?'#b6d3e2':'#385a72',2);for(let j=0;j<5;j++)line([[x+19,y+50+j*20],[x+118,y+50+j*20]],'#4f7990');}
  } else {
    const nodes=Array.from({length:19},(_,i)=>[90+((i*137)%465),323+((i*73)%225)]);
    nodes.forEach((p,i)=>{nodes.slice(i+1).forEach(q=>{if(Math.hypot(p[0]-q[0],p[1]-q[1])<145)line([p,q],'#375c74');});circle(p[0],p[1],i%4===0?5:2.5,i%4===0?'#c2dfe9':'#679fb9',0,6.28,2);});
  }
  c.restore();
  text(footer,43,605,15,'#9cb7c8');
  line([[42,625],[598,625]],'#2c4657');
  text(detail,43,662,16);
  text('MODEL',43,710,13); text('REFERENCE VIEW',430,710,13);
  for(let i=0;i<44;i++){c.fillStyle=i%7===0?'#96bdcf':'#2e5269';c.fillRect(43+i*12.6,735,i%3===0?5:2,10);}
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace=THREE.SRGBColorSpace;
  texture.anisotropy=4;
  return texture;
}
