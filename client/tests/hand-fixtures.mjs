export function hand(x=.5, y=.5, pinch=1, pose='open', scale=1) {
  const points = [[0,.15],[-.06,.10],[-.10,.06],[-.13,0],[-.15,-.08],[-.055,0],[-.055,-.075],[-.055,-.14],[-.055,-.20],[0,0],[0,-.085],[0,-.16],[0,-.23],[.05,.01],[.05,-.07],[.05,-.13],[.05,-.20],[.09,.035],[.09,-.02],[.09,-.08],[.09,-.14]];
  const landmarks=points.map(([a,b])=>({x:x+a*scale,y:y+b*scale,z:0}));
  if(pose==='fist')for(const i of [8,12,16,20])landmarks[i]={x:x+.01,y:y+.08*scale,z:0};
  if(pose==='point')for(const i of [12,16,20])landmarks[i]={x:x+.01,y:y+.08*scale,z:0};
  landmarks[4]={...landmarks[8],x:landmarks[8].x+pinch*.15*scale};
  return {landmarks,handedness:'RIGHT',quality:1};
}
export const trajectories = {
  moveRight:[.40,.43,.47,.52,.58], moveLeft:[.60,.56,.50,.44,.38],
  jitter:[.500,.503,.498,.502,.499], zoomIn:[.25,.32,.40,.50],zoomOut:[.50,.42,.34,.27],
  slowRight:[.40,.405,.41,.415,.42,.425],
  fastRight:[.40,.48,.58,.68],
  spike:[.40,.42,.43,.90,.44],
  zoomInSpec:[.20,.24,.30,.37,.45],
  zoomOutSpec:[.45,.40,.34,.28,.22],
  zoomJitter:[.300,.302,.299,.301],
};
