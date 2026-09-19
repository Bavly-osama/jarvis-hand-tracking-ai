import * as THREE from 'three';
import type { Landmark } from './LandmarkFilter';
const origin=new THREE.Vector3();
/** Screen-aligned overlay at fixed depth: monocular Z cannot distort hit testing. */
export function screenToWorld(point:Landmark,camera:THREE.Camera,out:THREE.Vector3){
  camera.getWorldPosition(origin);
  out.set(point.x*2-1,1-point.y*2,.5).unproject(camera).sub(origin).normalize();
  out.multiplyScalar((4-origin.z)/out.z).add(origin);
  return out;
}
