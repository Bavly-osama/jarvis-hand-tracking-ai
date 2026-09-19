import type { HandFrame } from '../interaction/HandInteractionEngine';
declare const Hands:any;

/** Acquisition/inference only. Filtering and intent belong to HandInteractionEngine. */
export class HandTracker {
  private hands:any;
  private callback:((frame:HandFrame)=>void)|null=null;
  private running=false;
  private generation=0;
  private sentGeneration=0;
  private stream:MediaStream|null=null;
  private video:HTMLVideoElement|null=null;
  private handle=0;
  private usingVideoCallback=false;
  private previousVideoTime=-1;
  private inference:Promise<void>|null=null;
  private inferenceStart=0;
  private metricStart=0;
  private cameraFrames=0;
  private trackingFrames=0;
  private cameraPresented=0;
  readonly metrics={cameraFPS:0,trackingFPS:0,inferenceMs:0,cameraFrameMs:0};
  constructor(){
    if(typeof Hands==='undefined')return;
    this.hands=new Hands({locateFile:(file:string)=>`https://cdn.jsdelivr.net/npm/@mediapipe/hands@0.4.1646424915/${file}`});
    this.hands.setOptions({maxNumHands:2,modelComplexity:1,minDetectionConfidence:.45,minTrackingConfidence:.35});
    this.hands.onResults((results:any)=>{
      if(!this.running||this.sentGeneration!==this.generation)return;
      const now=performance.now();this.metrics.inferenceMs=now-this.inferenceStart;this.trackingFrames++;
      const landmarks=results.multiHandLandmarks??[];
      const video=this.video;
      this.callback?.({timestamp:now,space:'camera',
        video:video&&video.videoWidth?{width:video.videoWidth,height:video.videoHeight}:undefined,
        hands:landmarks.map((landmarks:any,i:number)=>({
        landmarks,handedness:results.multiHandedness?.[i]?.label??'UNKNOWN',
      }))});
    });
  }
  onUpdate(callback:(frame:HandFrame)=>void){this.callback=callback;}
  async start(video:HTMLVideoElement){
    this.stop();const generation=this.generation;
    if(!this.hands)throw new Error('MediaPipe Hands not initialized');
    if(!navigator.mediaDevices?.getUserMedia)throw new Error('CAMERA_NOT_SUPPORTED');
    try{
      const stream=await navigator.mediaDevices.getUserMedia({video:{width:{ideal:640},height:{ideal:480},frameRate:{ideal:30},facingMode:'user'},audio:false});
      if(generation!==this.generation){stream.getTracks().forEach(t=>t.stop());return;}
      this.stream=stream;this.video=video;video.srcObject=stream;
      await video.play();if(this.inference)await this.inference;
      if(generation!==this.generation)return;
      this.running=true;this.metricStart=performance.now();this.previousVideoTime=-1;
      stream.getVideoTracks()[0].addEventListener('ended',()=>{if(generation===this.generation)this.stop();},{once:true});
      this.schedule(generation);
    }catch(error:any){
      if(generation!==this.generation)return;
      this.stop();
      const mapped:Record<string,string>={NotAllowedError:'CAMERA_DENIED',NotFoundError:'CAMERA_NOT_FOUND',NotReadableError:'CAMERA_BUSY'};
      throw new Error(mapped[error.name]??error.message);
    }
  }
  private schedule(generation:number){
    if(!this.running||generation!==this.generation||!this.video)return;
    const video=this.video;
    const run=async(_now:number,metadata?:{presentedFrames:number})=>{
      if(!this.running||generation!==this.generation)return;
      if(metadata){this.cameraFrames+=this.cameraPresented?Math.max(1,metadata.presentedFrames-this.cameraPresented):1;this.cameraPresented=metadata.presentedFrames;}
      if(video.readyState>=2 && video.currentTime!==this.previousVideoTime){
        this.previousVideoTime=video.currentTime;if(!metadata)this.cameraFrames++;
        this.inferenceStart=performance.now();this.sentGeneration=generation;
        try{this.inference=this.hands.send({image:video});await this.inference;}
        catch{if(generation===this.generation)this.callback?.({timestamp:performance.now(),space:'camera',hands:[]});}
        finally{this.inference=null;}
      }
      const now=performance.now(),seconds=(now-this.metricStart)/1000;
      if(seconds>=1){this.metrics.cameraFPS=this.cameraFrames/seconds;this.metrics.trackingFPS=this.trackingFrames/seconds;this.metrics.cameraFrameMs=this.metrics.cameraFPS?1000/this.metrics.cameraFPS:0;this.metricStart=now;this.cameraFrames=this.trackingFrames=0;}
      this.schedule(generation);
    };
    this.usingVideoCallback='requestVideoFrameCallback' in video;
    this.handle=this.usingVideoCallback?(video as any).requestVideoFrameCallback(run):requestAnimationFrame(run);
  }
  stop(){
    this.running=false;this.generation++;
    if(this.video&&this.usingVideoCallback)(this.video as any).cancelVideoFrameCallback(this.handle);else cancelAnimationFrame(this.handle);
    this.stream?.getTracks().forEach(t=>t.stop());this.stream=null;
    if(this.video)this.video.srcObject=null;
    this.video=null;this.cameraFrames=this.trackingFrames=this.cameraPresented=0;
    this.metrics.cameraFPS=this.metrics.trackingFPS=0;
  }
}
