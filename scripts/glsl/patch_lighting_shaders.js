/* globals
*/
"use strict";

import { SETTINGS, getSceneSetting } from "../settings.js";
import { ShaderPatcher, applyPatches } from "../perfect-vision/shader-patcher.js";

/**
 * Wrap AdaptiveLightingShader.create
 * Inherited by AdaptiveVisionShader
 * Add shadow GLSL code to the lighting fragment shaders.
 */
export function createAdaptiveLightingShader(wrapped, ...args) {
  applyPatches(this,
    false,
    source => {
      source = addShadowFragmentCode(source);
      return source;
    }
  );

  const shader = wrapped(...args);
  const shaderAlgorithm = getSceneSetting(SETTINGS.SHADING.ALGORITHM);
  shader.uniforms.uEVShadowSampler = 0;
  shader.uniforms.uEVShadows = shaderAlgorithm === SETTINGS.SHADING.TYPES.WEBGL;
  return shader;
}

/**
 * Shadow GLSL code to add to the fragment source.
 */
function addShadowFragmentCode(source) {
  try {
    source = new ShaderPatcher("frag")
      .setSource(source)
      .addUniform("uEVShadowSampler", "sampler2D")
      .addUniform("uEVShadows", "bool")

      .replace(/gl_FragColor = /, `
        if ( uEVShadows ) {
          vec4 EV_shadowTexel = texture2D(uEVShadowSampler, vUvs);
          float EV_lightAmount = EV_shadowTexel.r;
          if ( EV_shadowTexel.g < 0.5) EV_lightAmount *= EV_shadowTexel.b;
          depth *= EV_lightAmount;
        }
        gl_FragColor =`)

      .getSource();
  } finally {
    return source;
  }
}