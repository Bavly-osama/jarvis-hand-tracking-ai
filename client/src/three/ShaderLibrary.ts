// Full GLSL shader library for the holographic hand-tracking UI

export const ShaderLibrary = {

  // ─── Atmosphere (Rayleigh rim glow) ────────────────────────────────────────
  atmosphere: {
    vertexShader: /* glsl */`
      varying vec3 vNormal;
      varying vec3 vViewDir;

      void main() {
        vNormal = normalize(normalMatrix * normal);
        vec4 mvPos = modelViewMatrix * vec4(position, 1.0);
        vViewDir = normalize(-mvPos.xyz);
        gl_Position = projectionMatrix * mvPos;
      }
    `,
    fragmentShader: /* glsl */`
      varying vec3 vNormal;
      varying vec3 vViewDir;

      uniform float atmosphereStrength;
      uniform vec3  atmosphereColor;

      void main() {
        float rim = 1.0 - max(dot(vNormal, vViewDir), 0.0);
        rim = pow(rim, 4.5) * atmosphereStrength;
        gl_FragColor = vec4(atmosphereColor * 2.1, rim * 0.75);
      }
    `,
    uniforms: {
      atmosphereStrength: { value: 1.4 },
      atmosphereColor:    { value: [0.15, 0.55, 1.0] }
    }
  },

  // ─── Earth surface ──────────────────────────────────────────────────────────
  earth: {
    vertexShader: /* glsl */`
      varying vec2 vUv;
      varying vec3 vNormal;
      varying vec3 vPosition;

      void main() {
        vUv = uv;
        vNormal = normalize(normalMatrix * normal);
        vPosition = (modelMatrix * vec4(position, 1.0)).xyz;
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }
    `,
    fragmentShader: /* glsl */`
      uniform sampler2D dayMap;
      uniform sampler2D nightMap;
      uniform sampler2D cloudsMap;
      uniform vec3 sunDirection;
      uniform float cloudStrength;
      uniform float nightStrength;

      varying vec2 vUv;
      varying vec3 vNormal;
      varying vec3 vPosition;

      void main() {
        vec3 normal = normalize(vNormal);
        float NdotL = dot(normal, normalize(sunDirection));
        float mixFactor = clamp(NdotL * 2.0 + 0.5, 0.0, 1.0);

        vec4 dayColor   = texture2D(dayMap, vUv);
        vec4 nightColor = texture2D(nightMap, vUv) * nightStrength;
        vec4 cloudColor = texture2D(cloudsMap, vUv);

        vec3 surface = mix(nightColor.rgb, dayColor.rgb, mixFactor);
        float cloudMask = cloudColor.r * cloudStrength;
        surface = mix(surface, vec3(1.0), cloudMask * mixFactor);

        gl_FragColor = vec4(surface, 1.0);
      }
    `,
    uniforms: {
      dayMap:       { value: null },
      nightMap:     { value: null },
      cloudsMap:    { value: null },
      sunDirection: { value: [1.0, 0.3, 0.5] },
      cloudStrength:{ value: 0.8 },
      nightStrength:{ value: 2.5 }
    }
  },

  // ─── Holographic glass card ─────────────────────────────────────────────────
  holographicGlass: {
    vertexShader: /* glsl */`
      varying vec2 vUv;
      varying vec3 vPos;

      void main() {
        vUv = uv;
        vPos = position;
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }
    `,
    fragmentShader: /* glsl */`
      varying vec2 vUv;
      varying vec3 vPos;

      uniform float time;
      uniform float opacity;
      uniform vec3  color;
      uniform float glowStrength;
      uniform float selected;

      float scanline(float y, float t) {
        return sin(y * 120.0 + t * 8.0) * 0.03 + 0.97;
      }

      float border(vec2 uv, float thickness) {
        vec2 b = smoothstep(vec2(0.0), vec2(thickness), uv) *
                 smoothstep(vec2(0.0), vec2(thickness), 1.0 - uv);
        return 1.0 - min(b.x, b.y);
      }

      void main() {
        vec2 uv = vUv;
        float cut = 0.055;
        if (uv.x + uv.y < cut || (1.-uv.x)+(1.-uv.y)<cut) discard;
        float brd = border(uv, 0.004);
        float chamfer = 1.-smoothstep(0.001,0.004,abs(uv.x+uv.y-cut));
        brd = max(brd, chamfer);
        float grid = (1.-step(.018,fract(uv.x*14.))) + (1.-step(.012,fract(uv.y*20.)));
        float streak = exp(-pow(uv.y-fract(time*.08),2.)*1800.) * selected;
        vec3 edge = mix(vec3(.22,.48,.65),vec3(.48,.83,1.25),selected);
        if(uv.x>.96 || uv.y<.007) edge=mix(edge,vec3(1.5,1.05,.52),selected*.7);
        vec3 body=vec3(.015,.033,.052)+grid*.005+streak*.014;
        vec3 finalCol=mix(body,edge,brd);
        float alpha=mix(.66, .85,brd)*opacity;
        gl_FragColor=vec4(finalCol,alpha);

      }
    `,
    uniforms: {
      time:         { value: 0 },
      opacity:      { value: 0.85 },
      color:        { value: [0.0, 1.0, 1.0] },
      glowStrength: { value: 1.0 },
      selected:     { value: 0.0 }
    }
  },

  // ─── Particle glow (additive) ───────────────────────────────────────────────
  particleGlow: {
    vertexShader: /* glsl */`
      attribute float size;
      attribute float alpha;
      varying float vAlpha;

      void main() {
        vAlpha = alpha;
        vec4 mvPos = modelViewMatrix * vec4(position, 1.0);
        gl_PointSize = size * (400.0 / -mvPos.z);
        gl_Position  = projectionMatrix * mvPos;
      }
    `,
    fragmentShader: /* glsl */`
      uniform vec3 color;
      varying float vAlpha;

      void main() {
        float d = distance(gl_PointCoord, vec2(0.5));
        if (d > 0.5) discard;
        float intensity = smoothstep(0.5, 0.0, d);
        gl_FragColor = vec4(color, intensity * vAlpha);
      }
    `,
    uniforms: {
      color: { value: [0.0, 1.0, 1.0] }
    }
  },

  // ─── Animated data arc (globe surface arc) ──────────────────────────────────
  dataArc: {
    vertexShader: /* glsl */`
      attribute float t;
      varying float vT;

      void main() {
        vT = t;
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }
    `,
    fragmentShader: /* glsl */`
      uniform float time;
      uniform float speed;
      uniform vec3  color;
      varying float vT;

      void main() {
        float head  = fract(time * speed);
        float trail = 0.3;
        float alpha = smoothstep(head - trail, head, vT) * (1.0 - smoothstep(head, head + 0.02, vT));
        alpha = clamp(alpha, 0.0, 1.0);
        gl_FragColor = vec4(color, 0.12 + alpha * 0.75);
      }
    `,
    uniforms: {
      time:  { value: 0 },
      speed: { value: 0.4 },
      color: { value: [0.0, 1.0, 0.6] }
    }
  },

  // ─── Hexagonal grid scan (background environment) ──────────────────────────
  hexGrid: {
    vertexShader: /* glsl */`
      varying vec2 vUv;
      void main() {
        vUv = uv;
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }
    `,
    fragmentShader: /* glsl */`
      varying vec2 vUv;
      uniform float time;
      uniform vec3  color;
      uniform float opacity;

      vec2 hexCoord(vec2 p) {
        vec2 q = vec2(p.x * 2.0 / 1.7320508, p.y + p.x / 1.7320508);
        return floor(q);
      }

      float hexDist(vec2 p) {
        p = abs(p);
        return max(dot(p, normalize(vec2(1.0, 1.7320508))), p.x);
      }

      void main() {
        vec2 p    = (vUv - 0.5) * 12.0;
        vec2 hc   = hexCoord(p);
        float h   = hexDist(fract(p) - 0.5);
        float edge = smoothstep(0.44, 0.48, h);
        float pulse = sin(hc.x * 1.2 + hc.y * 0.9 + time * 0.8) * 0.5 + 0.5;
        float alpha = edge * pulse * opacity;
        gl_FragColor = vec4(color * pulse, alpha);
      }
    `,
    uniforms: {
      time:    { value: 0 },
      color:   { value: [0.0, 0.4, 0.8] },
      opacity: { value: 0.15 }
    }
  },

  // ─── Fingertip cursor ring ──────────────────────────────────────────────────
  cursorRing: {
    vertexShader: /* glsl */`
      varying vec2 vUv;
      void main() {
        vUv = uv;
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }
    `,
    fragmentShader: /* glsl */`
      varying vec2 vUv;
      uniform float time;
      uniform float pulse;
      uniform float opacity;
      uniform vec3  color;

      void main() {
        vec2  c    = vUv - 0.5;
        float r    = length(c) * (1.0 + pulse * 0.25);
        float ring = smoothstep(0.42, 0.44, r) * (1.0 - smoothstep(0.48, 0.50, r));
        float glow = (1.0 - smoothstep(0.30, 0.50, r)) * 0.015;
        float spin = sin(atan(c.y, c.x) * 4.0 + time * 3.0) * 0.5 + 0.5;
        float alpha= ring * (0.6 + spin * 0.4 + pulse * 0.3) + glow;
        gl_FragColor = vec4(color, alpha * (0.7 + pulse * 0.3) * opacity);
      }
    `,
    uniforms: {
      time:  { value: 0 },
      pulse: { value: 0.0 },
      color: { value: [0.0, 1.0, 1.0] }
    }
  }
};
